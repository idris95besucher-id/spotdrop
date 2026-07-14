import UIKit
import AVFoundation
import CoreMotion

enum PanoCaptureResult {
    case success(PanoStitchOutput)
    case failure(Error)
    case cancelled
}

enum PanoCaptureError: LocalizedError {
    case noHorizontalMovement
    case tooFast
    case tooMuchVertical
    case notEnoughArea
    case stitchFailed
    case memoryLimit

    var errorDescription: String? {
        switch self {
        case .noHorizontalMovement:
            return "Move the phone from left to right."
        case .tooFast:
            return "Move a bit more slowly."
        case .tooMuchVertical:
            return "Keep the arrow on the guide line."
        case .notEnoughArea:
            return "Continue moving to the right."
        case .stitchFailed:
            return "Panorama could not be created. Please try again."
        case .memoryLimit:
            return "Panorama is long enough — tap stop to finish."
        }
    }
}

/// Native-style panorama capture.
///
/// Critical: horizontal progress is tracked via continuous unwrapped heading + first-motion
/// direction lock. Forcing only “positive Euler/atan2 deltas” previously rejected all frames
/// after the first when LTR rotation produced negative sensor deltas.
final class PanoCaptureViewController: UIViewController {
    var onFinished: ((PanoCaptureResult) -> Void)?

    private let session = AVCaptureSession()
    private let sessionQueue = DispatchQueue(label: "com.spotdrop.pano.session")
    private let frameQueue = DispatchQueue(label: "com.spotdrop.pano.frames")
    private let previewQueue = DispatchQueue(label: "com.spotdrop.pano.livePreview")
    private let motion = CMMotionManager()
    private let ciContext = CIContext(options: [.useSoftwareRenderer: false])

    private var previewLayer: AVCaptureVideoPreviewLayer?
    private var videoOutput: AVCaptureVideoDataOutput?
    private var device: AVCaptureDevice?

    private var capturing = false
    private var processing = false
    private var cancelled = false
    private var exposureLocked = false

    /// Continuously unwrapped heading (radians), never folded back into [-π, π].
    private var continuousHeading: Double = 0
    private var previousRawHeading: Double?
    private var startContinuousHeading: Double?
    /// +1 / -1 locked from the first clear horizontal move (sensor sign ≠ UI LTR).
    private var progressSign: Double?
    /// Progress along the locked direction (always ≥ 0 while moving forward).
    private var captureProgress: Double = 0
    private var peakCaptureProgress: Double = 0
    private var lastCapturedProgress: Double = -1
    private var latestVerticalAngle: Double = 0
    private var lastMotionTime: CFTimeInterval = 0
    private var lastSpeed: Double = 0
    private var lastProgressForSpeed: Double = 0
    private var frames: [PanoFrameSample] = []
    private var pendingFirstFrame = false
    private var livePreviewDirty = false
    private var livePreviewBusy = false
    private var livePreviewToken = 0
    private let stateLock = NSLock()

    private let memoryMaxSpan: Double = 8.0
    private let memoryMaxFrames = 96
    private let minSpanToStitch: Double = 0.28
    private let minBlurVariance: Double = 22
    private let warnYawSpeed: Double = 2.8
    private let rejectYawSpeed: Double = 5.0
    private let verticalWarnRadians: Double = 0.35
    private let directionLockRadians: Double = 0.04
    private let stitchShortSide = 960
    private let blurProbeShortSide = 120

    // UI
    private let closeButton = UIButton(type: .system)
    private let modeLabel = UILabel()
    private let instructionLabel = UILabel()
    private let liveStripContainer = UIView()
    private let liveStripImageView = UIImageView()
    private let liveStripPlaceholder = UILabel()
    private let frameCountLabel = UILabel()
    private let shutterButton = UIButton(type: .custom)
    private let shutterInner = UIView()
    private let stopGlyph = UIView()
    private let guideLine = UIView()
    private let arrowLabel = UILabel()
    private let processingOverlay = UIView()
    private let processingLabel = UILabel()
    private let progressSpinner = UIActivityIndicatorView(style: .large)

    init() {
        super.init(nibName: nil, bundle: nil)
    }

    @available(*, unavailable)
    required init?(coder: NSCoder) {
        fatalError("init(coder:) has not been implemented")
    }

    override var prefersStatusBarHidden: Bool { true }
    override var supportedInterfaceOrientations: UIInterfaceOrientationMask { .portrait }

    override func viewDidLoad() {
        super.viewDidLoad()
        view.backgroundColor = .black
        buildUI()
        requestCameraAndStart()
    }

    override func viewDidLayoutSubviews() {
        super.viewDidLayoutSubviews()
        previewLayer?.frame = view.bounds
        layoutChrome()
    }

    override func viewWillDisappear(_ animated: Bool) {
        super.viewWillDisappear(animated)
        if isBeingDismissed || isMovingFromParent {
            stopSession()
            motion.stopDeviceMotionUpdates()
        }
    }

    func cancelFromPlugin() {
        finishCancelled()
    }

    private func buildUI() {
        closeButton.setImage(UIImage(systemName: "xmark"), for: .normal)
        closeButton.tintColor = .white
        closeButton.backgroundColor = UIColor.black.withAlphaComponent(0.4)
        closeButton.layer.cornerRadius = 22
        closeButton.addTarget(self, action: #selector(handleClose), for: .touchUpInside)
        view.addSubview(closeButton)

        modeLabel.text = "PANO"
        modeLabel.textColor = .white
        modeLabel.font = .systemFont(ofSize: 13, weight: .bold)
        modeLabel.textAlignment = .center
        view.addSubview(modeLabel)

        instructionLabel.text = "Move from left to right"
        instructionLabel.textColor = .white
        instructionLabel.font = .systemFont(ofSize: 16, weight: .semibold)
        instructionLabel.textAlignment = .center
        instructionLabel.numberOfLines = 2
        view.addSubview(instructionLabel)

        liveStripContainer.backgroundColor = UIColor.black.withAlphaComponent(0.55)
        liveStripContainer.layer.cornerRadius = 10
        liveStripContainer.clipsToBounds = true
        liveStripContainer.isHidden = true
        view.addSubview(liveStripContainer)

        liveStripImageView.contentMode = .scaleAspectFit
        liveStripImageView.backgroundColor = .clear
        liveStripContainer.addSubview(liveStripImageView)

        liveStripPlaceholder.text = "Panorama preview"
        liveStripPlaceholder.textColor = UIColor.white.withAlphaComponent(0.55)
        liveStripPlaceholder.font = .systemFont(ofSize: 12, weight: .medium)
        liveStripPlaceholder.textAlignment = .center
        liveStripContainer.addSubview(liveStripPlaceholder)

        frameCountLabel.textColor = UIColor.white.withAlphaComponent(0.7)
        frameCountLabel.font = .monospacedSystemFont(ofSize: 11, weight: .medium)
        frameCountLabel.textAlignment = .center
        view.addSubview(frameCountLabel)

        guideLine.backgroundColor = UIColor.white.withAlphaComponent(0.9)
        view.addSubview(guideLine)

        arrowLabel.text = "▶"
        arrowLabel.textColor = UIColor(red: 1, green: 0.84, blue: 0.04, alpha: 1)
        arrowLabel.font = .systemFont(ofSize: 22, weight: .bold)
        arrowLabel.textAlignment = .center
        view.addSubview(arrowLabel)

        shutterButton.backgroundColor = .clear
        shutterButton.layer.cornerRadius = 38
        shutterButton.layer.borderWidth = 4
        shutterButton.layer.borderColor = UIColor.white.cgColor
        shutterButton.addTarget(self, action: #selector(handleShutter), for: .touchUpInside)
        view.addSubview(shutterButton)

        shutterInner.backgroundColor = .white
        shutterInner.isUserInteractionEnabled = false
        shutterButton.addSubview(shutterInner)

        stopGlyph.backgroundColor = UIColor(red: 1, green: 0.23, blue: 0.19, alpha: 1)
        stopGlyph.layer.cornerRadius = 6
        stopGlyph.isHidden = true
        stopGlyph.isUserInteractionEnabled = false
        shutterButton.addSubview(stopGlyph)

        processingOverlay.backgroundColor = UIColor.black.withAlphaComponent(0.72)
        processingOverlay.isHidden = true
        view.addSubview(processingOverlay)

        progressSpinner.color = .white
        processingOverlay.addSubview(progressSpinner)

        processingLabel.text = "Finishing panorama…"
        processingLabel.textColor = .white
        processingLabel.font = .systemFont(ofSize: 16, weight: .semibold)
        processingLabel.textAlignment = .center
        processingOverlay.addSubview(processingLabel)

        layoutChrome()
        updateShutterAppearance()
        updateArrow(progress: 0)
    }

    private func layoutChrome() {
        let safe = view.safeAreaInsets
        closeButton.frame = CGRect(x: 16, y: max(16, safe.top + 8), width: 44, height: 44)

        modeLabel.frame = CGRect(x: 24, y: closeButton.frame.maxY + 10, width: view.bounds.width - 48, height: 18)
        instructionLabel.frame = CGRect(x: 24, y: modeLabel.frame.maxY + 6, width: view.bounds.width - 48, height: 36)

        let stripH: CGFloat = 96
        liveStripContainer.frame = CGRect(
            x: 16,
            y: instructionLabel.frame.maxY + 10,
            width: view.bounds.width - 32,
            height: stripH
        )
        liveStripImageView.frame = liveStripContainer.bounds.insetBy(dx: 6, dy: 6)
        liveStripPlaceholder.frame = liveStripContainer.bounds

        frameCountLabel.frame = CGRect(
            x: 24,
            y: liveStripContainer.frame.maxY + 6,
            width: view.bounds.width - 48,
            height: 16
        )

        let midY = view.bounds.midY + 28
        guideLine.frame = CGRect(x: 28, y: midY, width: view.bounds.width - 56, height: 1.5)

        let shutterY = view.bounds.height - max(28, safe.bottom + 20) - 76
        shutterButton.frame = CGRect(x: (view.bounds.width - 76) / 2, y: shutterY, width: 76, height: 76)
        shutterInner.frame = CGRect(x: 10, y: 10, width: 56, height: 56)
        shutterInner.layer.cornerRadius = 28
        stopGlyph.frame = CGRect(x: 26, y: 26, width: 24, height: 24)

        processingOverlay.frame = view.bounds
        progressSpinner.center = CGPoint(x: view.bounds.midX, y: view.bounds.midY - 16)
        processingLabel.frame = CGRect(x: 24, y: progressSpinner.frame.maxY + 16, width: view.bounds.width - 48, height: 24)

        updateArrow(progress: capturing ? CGFloat(min(1, peakCaptureProgress / 2.5)) : 0)
    }

    override func viewSafeAreaInsetsDidChange() {
        super.viewSafeAreaInsetsDidChange()
        layoutChrome()
    }

    private func updateArrow(progress: CGFloat) {
        let clamped = max(0, min(1, progress))
        let line = guideLine.frame
        let arrowW: CGFloat = 36
        let x = line.minX + (line.width - arrowW) * clamped
        arrowLabel.frame = CGRect(x: x, y: line.midY - 28, width: arrowW, height: 28)
    }

    private func updateShutterAppearance() {
        if capturing {
            shutterInner.isHidden = true
            stopGlyph.isHidden = false
            shutterButton.accessibilityLabel = "Stop panorama"
        } else {
            shutterInner.isHidden = false
            stopGlyph.isHidden = true
            shutterButton.accessibilityLabel = "Start panorama"
        }
    }

    private func setInstruction(_ text: String, warning: Bool = false) {
        instructionLabel.text = text
        instructionLabel.textColor = warning
            ? UIColor(red: 1, green: 0.55, blue: 0.35, alpha: 1)
            : .white
    }

    @objc private func handleClose() {
        finishCancelled()
    }

    @objc private func handleShutter() {
        if processing { return }
        if capturing {
            finishCapture()
        } else {
            beginCapture()
        }
    }

    private func requestCameraAndStart() {
        switch AVCaptureDevice.authorizationStatus(for: .video) {
        case .authorized:
            configureSession()
        case .notDetermined:
            AVCaptureDevice.requestAccess(for: .video) { [weak self] granted in
                DispatchQueue.main.async {
                    if granted {
                        self?.configureSession()
                    } else {
                        self?.finishFailure(message: "Camera permission is required for panorama.")
                    }
                }
            }
        default:
            finishFailure(message: "Camera permission is required for panorama.")
        }
    }

    private func configureSession() {
        sessionQueue.async { [weak self] in
            guard let self else { return }
            self.session.beginConfiguration()

            if self.session.canSetSessionPreset(.hd1280x720) {
                self.session.sessionPreset = .hd1280x720
            } else if self.session.canSetSessionPreset(.hd1920x1080) {
                self.session.sessionPreset = .hd1920x1080
            } else {
                self.session.sessionPreset = .high
            }

            guard let camera = AVCaptureDevice.default(.builtInWideAngleCamera, for: .video, position: .back),
                  let input = try? AVCaptureDeviceInput(device: camera),
                  self.session.canAddInput(input) else {
                DispatchQueue.main.async {
                    self.finishFailure(message: "Unable to open the rear camera.")
                }
                return
            }

            self.device = camera
            self.session.addInput(input)

            let output = AVCaptureVideoDataOutput()
            output.alwaysDiscardsLateVideoFrames = true
            output.videoSettings = [
                kCVPixelBufferPixelFormatTypeKey as String: kCVPixelFormatType_32BGRA
            ]
            output.setSampleBufferDelegate(self, queue: self.frameQueue)

            if self.session.canAddOutput(output) {
                self.session.addOutput(output)
                self.videoOutput = output
                if let connection = output.connection(with: .video), connection.isVideoOrientationSupported {
                    connection.videoOrientation = .portrait
                }
            }

            self.configureDevice(camera, lockFocus: false, lockExposureWB: false)
            self.session.commitConfiguration()
            self.session.startRunning()

            DispatchQueue.main.async {
                let layer = AVCaptureVideoPreviewLayer(session: self.session)
                layer.videoGravity = .resizeAspectFill
                layer.frame = self.view.bounds
                self.view.layer.insertSublayer(layer, at: 0)
                self.previewLayer = layer
            }
        }
    }

    private func configureDevice(_ camera: AVCaptureDevice, lockFocus: Bool, lockExposureWB: Bool) {
        do {
            try camera.lockForConfiguration()
            if lockFocus {
                if camera.isFocusModeSupported(.locked) { camera.focusMode = .locked }
            } else if camera.isFocusModeSupported(.continuousAutoFocus) {
                camera.focusMode = .continuousAutoFocus
            }
            if lockExposureWB {
                if camera.isExposureModeSupported(.locked) { camera.exposureMode = .locked }
                if camera.isWhiteBalanceModeSupported(.locked) { camera.whiteBalanceMode = .locked }
            } else {
                if camera.isExposureModeSupported(.continuousAutoExposure) {
                    camera.exposureMode = .continuousAutoExposure
                }
                if camera.isWhiteBalanceModeSupported(.continuousAutoWhiteBalance) {
                    camera.whiteBalanceMode = .continuousAutoWhiteBalance
                }
            }
            if camera.isLowLightBoostSupported {
                camera.automaticallyEnablesLowLightBoostWhenAvailable = true
            }
            camera.videoZoomFactor = 1.0
            camera.unlockForConfiguration()
        } catch {}
    }

    private func resetCaptureState() {
        frames.removeAll(keepingCapacity: false)
        continuousHeading = 0
        previousRawHeading = nil
        startContinuousHeading = nil
        progressSign = nil
        captureProgress = 0
        peakCaptureProgress = 0
        lastCapturedProgress = -1
        lastSpeed = 0
        lastProgressForSpeed = 0
        latestVerticalAngle = 0
        pendingFirstFrame = false
        exposureLocked = false
        livePreviewDirty = false
        livePreviewBusy = false
        livePreviewToken += 1
        liveStripImageView.image = nil
        liveStripPlaceholder.isHidden = false
        liveStripContainer.isHidden = true
        frameCountLabel.text = ""
        updateArrow(progress: 0)
    }

    private func beginCapture() {
        resetCaptureState()
        capturing = true
        cancelled = false
        processing = false
        pendingFirstFrame = true
        liveStripContainer.isHidden = false
        frameCountLabel.text = "Frames: 0"
        setInstruction("Keep the arrow on the line")
        updateShutterAppearance()

        if let camera = device {
            configureDevice(camera, lockFocus: true, lockExposureWB: false)
        }

        startMotion()
        UIImpactFeedbackGenerator(style: .medium).impactOccurred()
    }

    private func startMotion() {
        guard motion.isDeviceMotionAvailable else {
            finishFailure(message: "Motion sensors are unavailable on this device.")
            return
        }

        motion.deviceMotionUpdateInterval = 1.0 / 60.0
        motion.startDeviceMotionUpdates(using: .xArbitraryZVertical, to: .main) { [weak self] data, _ in
            guard let self, self.capturing, !self.processing, let data else { return }
            self.ingestMotion(data)
        }
    }

    private func ingestMotion(_ data: CMDeviceMotion) {
        // Primary: gyro integrated around gravity (true horizontal turn).
        // Secondary: attitude look-heading, continuously unwrapped.
        let now = CACurrentMediaTime()
        let dt = lastMotionTime > 0 ? max(1.0 / 120.0, now - lastMotionTime) : 1.0 / 60.0
        lastMotionTime = now

        let g = data.gravity
        let gMag = max(1e-6, sqrt(g.x * g.x + g.y * g.y + g.z * g.z))
        let gx = g.x / gMag
        let gy = g.y / gMag
        let gz = g.z / gMag
        let rr = data.rotationRate
        let yawRate = rr.x * gx + rr.y * gy + rr.z * gz

        let attitudeHeading = Self.lookHeading(from: data.attitude)
        if let prev = previousRawHeading {
            continuousHeading += Self.unwrapAngle(attitudeHeading - prev)
        } else {
            continuousHeading = attitudeHeading
        }
        previousRawHeading = attitudeHeading

        // Blend gyro integration into continuous heading for smoother LTR tracking.
        continuousHeading += yawRate * dt * 0.65

        if startContinuousHeading == nil {
            startContinuousHeading = continuousHeading
            lastProgressForSpeed = 0
        }

        guard let start = startContinuousHeading else { return }

        let signedFromStart = continuousHeading - start

        // Lock direction from first clear horizontal move so inverted sensor axes still work.
        if progressSign == nil, abs(signedFromStart) >= directionLockRadians {
            progressSign = signedFromStart >= 0 ? 1 : -1
        }

        let sign = progressSign ?? 1
        let progress = max(0, signedFromStart * sign)
        let deltaProgress = progress - lastProgressForSpeed
        lastSpeed = abs(deltaProgress) / dt
        lastProgressForSpeed = progress

        stateLock.lock()
        captureProgress = progress
        peakCaptureProgress = max(peakCaptureProgress, progress)
        latestVerticalAngle = Self.verticalAngle(from: data.attitude)
        stateLock.unlock()

        updateGuidance()
    }

    private struct MotionSnapshot {
        let progress: Double
        let speed: Double
        let lastCaptured: Double
        let pendingFirst: Bool
        let signLocked: Bool
        let hasBaseline: Bool
        let capturing: Bool
        let processing: Bool
        let cancelled: Bool
    }

    private func motionSnapshot() -> MotionSnapshot {
        stateLock.lock()
        defer { stateLock.unlock() }
        return MotionSnapshot(
            progress: captureProgress,
            speed: lastSpeed,
            lastCaptured: lastCapturedProgress,
            pendingFirst: pendingFirstFrame,
            signLocked: progressSign != nil,
            hasBaseline: startContinuousHeading != nil,
            capturing: capturing,
            processing: processing,
            cancelled: cancelled
        )
    }

    private static func lookHeading(from attitude: CMAttitude) -> Double {
        let r = attitude.rotationMatrix
        // Rear camera looks along −Z in device space.
        let lookX = -r.m13
        let lookY = -r.m23
        return atan2(lookX, lookY)
    }

    private static func verticalAngle(from attitude: CMAttitude) -> Double {
        let r = attitude.rotationMatrix
        let lookX = -r.m13
        let lookY = -r.m23
        let lookZ = -r.m33
        return atan2(lookZ, max(1e-6, hypot(lookX, lookY)))
    }

    private static func unwrapAngle(_ angle: Double) -> Double {
        var a = angle
        while a > .pi { a -= 2 * .pi }
        while a < -.pi { a += 2 * .pi }
        return a
    }

    /// Smaller steps when turning faster so frames keep landing during natural motion.
    private func adaptiveMinStep(speed: Double) -> Double {
        if speed > 1.4 { return 0.10 }
        if speed > 0.8 { return 0.14 }
        if speed > 0.4 { return 0.18 }
        return 0.22
    }

    private func updateGuidance() {
        updateArrow(progress: CGFloat(min(1, peakCaptureProgress / 2.5)))
        frameCountLabel.text = "Frames: \(frames.count)"

        if abs(latestVerticalAngle) > verticalWarnRadians {
            setInstruction("Keep the arrow on the guide line", warning: true)
        } else if lastSpeed > warnYawSpeed {
            setInstruction("Move a bit more slowly.", warning: true)
        } else if peakCaptureProgress < 0.05 {
            setInstruction("Move from left to right", warning: false)
        } else {
            setInstruction("Keep the arrow on the line", warning: false)
        }

        if peakCaptureProgress >= memoryMaxSpan || frames.count >= memoryMaxFrames {
            setInstruction(PanoCaptureError.memoryLimit.localizedDescription ?? "", warning: true)
        }
    }

    private func lockExposureAfterFirstFrame() {
        guard !exposureLocked, let camera = device else { return }
        exposureLocked = true
        configureDevice(camera, lockFocus: true, lockExposureWB: true)
    }

    private func appendFrame(_ image: CGImage, progress: Double, speed: Double, blurScore: Double) {
        guard capturing, !processing, !cancelled else { return }

        // First frame ASAP once motion baseline exists (caller gates on startContinuousHeading).
        if pendingFirstFrame {
            pendingFirstFrame = false
            frames.append(PanoFrameSample(image: image, yaw: 0, blurScore: blurScore))
            stateLock.lock()
            lastCapturedProgress = 0
            stateLock.unlock()
            lockExposureAfterFirstFrame()
            frameCountLabel.text = "Frames: \(frames.count)"
            scheduleLivePreview()
            return
        }

        // Need a locked horizontal direction before appending more frames.
        guard progressSign != nil else { return }

        if blurScore < minBlurVariance {
            return
        }
        if speed > rejectYawSpeed {
            return
        }

        // Only forward progress along the locked direction.
        guard progress > lastCapturedProgress else { return }

        let step = progress - lastCapturedProgress
        let needed = adaptiveMinStep(speed: speed)
        guard step >= needed else { return }

        if frames.count >= memoryMaxFrames {
            setInstruction(PanoCaptureError.memoryLimit.localizedDescription ?? "", warning: true)
            return
        }

        frames.append(PanoFrameSample(image: image, yaw: progress, blurScore: blurScore))
        stateLock.lock()
        lastCapturedProgress = progress
        stateLock.unlock()
        lockExposureAfterFirstFrame()
        frameCountLabel.text = "Frames: \(frames.count)"
        scheduleLivePreview()
    }

    private func scheduleLivePreview() {
        livePreviewDirty = true
        pumpLivePreview()
    }

    private func pumpLivePreview() {
        guard livePreviewDirty, !livePreviewBusy else { return }
        livePreviewBusy = true
        livePreviewDirty = false
        livePreviewToken += 1
        let token = livePreviewToken
        let snapshot = frames

        previewQueue.async { [weak self] in
            let preview = autoreleasepool {
                PanoStitcher.makeLivePreview(frames: snapshot)
            }
            DispatchQueue.main.async {
                guard let self else { return }
                self.livePreviewBusy = false
                guard self.capturing, !self.processing else { return }
                guard token == self.livePreviewToken || self.livePreviewDirty else { return }

                if let preview {
                    self.liveStripImageView.image = UIImage(cgImage: preview)
                    self.liveStripPlaceholder.isHidden = true
                }

                // Keep extending — never drop updates that arrived while stitching.
                if self.livePreviewDirty || snapshot.count < self.frames.count {
                    self.livePreviewDirty = true
                    self.pumpLivePreview()
                }
            }
        }
    }

    private func finishCapture() {
        guard capturing, !processing else { return }
        capturing = false
        motion.stopDeviceMotionUpdates()
        pendingFirstFrame = false

        let captured = frames
        let span = peakCaptureProgress
        let uniqueYawSpan: Double = {
            guard let minY = captured.map(\.yaw).min(), let maxY = captured.map(\.yaw).max() else {
                return 0
            }
            return maxY - minY
        }()

        if captured.count < 3 || uniqueYawSpan < minSpanToStitch {
            processing = false
            updateShutterAppearance()
            let error: PanoCaptureError
            if span < 0.1 && uniqueYawSpan < 0.1 {
                error = .noHorizontalMovement
            } else if abs(latestVerticalAngle) > verticalWarnRadians && span < minSpanToStitch {
                error = .tooMuchVertical
            } else if lastSpeed > rejectYawSpeed && captured.count < 3 {
                error = .tooFast
            } else {
                error = .notEnoughArea
            }
            presentRetryableError(error)
            return
        }

        processing = true
        updateShutterAppearance()
        showProcessing(true)

        sessionQueue.async { [weak self] in
            guard let self else { return }
            if self.cancelled {
                DispatchQueue.main.async {
                    self.showProcessing(false)
                    self.processing = false
                }
                return
            }

            do {
                let output = try autoreleasepool {
                    try PanoStitcher.stitch(frames: captured)
                }
                DispatchQueue.main.async {
                    self.showProcessing(false)
                    self.dismiss(animated: true) {
                        self.onFinished?(.success(output))
                    }
                }
            } catch {
                DispatchQueue.main.async {
                    self.showProcessing(false)
                    self.processing = false
                    self.presentRetryableError(.stitchFailed)
                }
            }
        }
    }

    private func presentRetryableError(_ error: PanoCaptureError) {
        resetCaptureState()
        capturing = false
        processing = false
        motion.stopDeviceMotionUpdates()
        updateShutterAppearance()
        setInstruction(error.localizedDescription ?? "Please try again.", warning: true)
        if let camera = device {
            configureDevice(camera, lockFocus: false, lockExposureWB: false)
        }
        UINotificationFeedbackGenerator().notificationOccurred(.error)
    }

    private func showProcessing(_ visible: Bool) {
        processingOverlay.isHidden = !visible
        if visible {
            progressSpinner.startAnimating()
            view.bringSubviewToFront(processingOverlay)
        } else {
            progressSpinner.stopAnimating()
        }
    }

    private func finishCancelled() {
        cancelled = true
        capturing = false
        processing = false
        motion.stopDeviceMotionUpdates()
        resetCaptureState()
        stopSession()
        dismiss(animated: true) { [weak self] in
            self?.onFinished?(.cancelled)
        }
    }

    private func finishFailure(message: String) {
        capturing = false
        processing = false
        motion.stopDeviceMotionUpdates()
        stopSession()
        let error = NSError(domain: "SpotDropPano", code: 1, userInfo: [NSLocalizedDescriptionKey: message])
        dismiss(animated: true) { [weak self] in
            self?.onFinished?(.failure(error))
        }
    }

    private func stopSession() {
        sessionQueue.async { [weak self] in
            self?.session.stopRunning()
        }
    }

    private func downscale(_ image: CGImage, shortSide: Int) -> CGImage? {
        let current = min(image.width, image.height)
        guard current > shortSide else { return image }
        let scale = CGFloat(shortSide) / CGFloat(current)
        let w = max(1, Int(CGFloat(image.width) * scale))
        let h = max(1, Int(CGFloat(image.height) * scale))
        let colorSpace = CGColorSpaceCreateDeviceRGB()
        guard let ctx = CGContext(
            data: nil,
            width: w,
            height: h,
            bitsPerComponent: 8,
            bytesPerRow: 0,
            space: colorSpace,
            bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue
        ) else { return nil }
        ctx.interpolationQuality = .medium
        ctx.draw(image, in: CGRect(x: 0, y: 0, width: w, height: h))
        return ctx.makeImage()
    }
}

extension PanoCaptureViewController: AVCaptureVideoDataOutputSampleBufferDelegate {
    func captureOutput(
        _ output: AVCaptureOutput,
        didOutput sampleBuffer: CMSampleBuffer,
        from connection: AVCaptureConnection
    ) {
        let snap = motionSnapshot()
        guard snap.capturing, !snap.processing, !snap.cancelled else { return }
        guard snap.hasBaseline else { return }
        guard snap.pendingFirst || snap.signLocked else { return }
        guard let buffer = CMSampleBufferGetImageBuffer(sampleBuffer) else { return }

        let progress = snap.progress
        let speed = snap.speed
        let lastCaptured = snap.lastCaptured
        let pendingFirst = snap.pendingFirst

        autoreleasepool {
            let ciImage = CIImage(cvPixelBuffer: buffer)
            guard let full = ciContext.createCGImage(ciImage, from: ciImage.extent) else { return }
            guard let probe = downscale(full, shortSide: blurProbeShortSide) else { return }
            let blur = PanoStitcher.laplacianVariance(probe)

            if !pendingFirst {
                if blur < minBlurVariance || speed > rejectYawSpeed {
                    return
                }
                // Cheap prefilter: skip expensive downscale until enough new progress.
                if progress <= lastCaptured { return }
                if progress - lastCaptured < 0.08 { return }
            }

            guard let stitchFrame = downscale(full, shortSide: stitchShortSide) else { return }

            DispatchQueue.main.async { [weak self] in
                self?.appendFrame(stitchFrame, progress: progress, speed: speed, blurScore: blur)
            }
        }
    }
}
