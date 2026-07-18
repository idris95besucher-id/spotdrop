import UIKit
import AVFoundation

enum CameraCaptureResult {
    case photo(PhotoCaptureOutput)
    case video(VideoCaptureOutput)
    /// User tapped/swiped to TEXT — there is nothing to capture; the plugin
    /// resolves so JS can hand off to its own (non-camera) TEXT compose screen.
    case switchToText
    case failure(Error)
    case cancelled
}

struct PhotoCaptureOutput {
    let path: String
    let width: Int
    let height: Int
    let mimeType: String
}

struct VideoCaptureOutput {
    let path: String
    let mimeType: String
    let durationMs: Double
    let sizeBytes: Int
    let width: Int
    let height: Int
}

enum CameraCaptureMode {
    case photo
    case video
}

/// Single native camera screen for both PHOTO and VIDEO.
///
/// This supersedes the old design where PHOTO ran through a web `getUserMedia`
/// preview and VIDEO opened a *separate* full-screen native controller on top of
/// it — that's what produced the "two camera screens" bug. Here there is exactly
/// one `AVCaptureSession`, one `AVCaptureVideoPreviewLayer`, and both
/// `AVCapturePhotoOutput` and `AVCaptureMovieFileOutput` are attached to it at
/// setup time. Switching PHOTO ⇄ VIDEO only changes `captureMode` (which output
/// the shutter drives, and the shutter's own appearance) — the session, preview,
/// and this view controller instance are never torn down or re-presented.
///
/// TEXT is intentionally NOT a camera concept: tapping/swiping to TEXT dismisses
/// this controller and resolves with `.switchToText` so JS can show its own
/// (non-camera) compose screen, exactly like tapping close does for cancellation.
///
/// Portrait-only — same simplification already made elsewhere in this codebase
/// (avoids the classic AVFoundation "rotating UI *and* rotating capture-connection
/// orientation at once" bug class) at the cost of not supporting landscape.
final class CameraCaptureViewController: UIViewController {
    var onFinished: ((CameraCaptureResult) -> Void)?

    /// The "add another photo" flow from the publish screen only ever wants a
    /// single photo — no VIDEO/TEXT tabs, no mode switching.
    var showsModeTabs: Bool = true
    var initialMode: CameraCaptureMode = .photo

    private let session = AVCaptureSession()
    private let sessionQueue = DispatchQueue(label: "com.spotdrop.camera.session")
    private let photoOutput = AVCapturePhotoOutput()
    private let movieOutput = AVCaptureMovieFileOutput()

    /// Matches the existing app's `CAMERA_MAX_VIDEO_SECONDS` (lib/cameraCapture.ts)
    /// so Spot content length stays consistent regardless of which capture engine
    /// produced it.
    private static let maxRecordedDurationSeconds: Double = 15
    /// Stays at 1080p (session preset below is unchanged) — bitrate tuned so a max-length
    /// (15s) clip lands well under 30 MB and uploads quickly without softening resolution.
    private static let targetBitrate = 6_000_000

    private var captureMode: CameraCaptureMode = .photo
    private var currentDevice: AVCaptureDevice?
    private var currentVideoInput: AVCaptureDeviceInput?
    private var currentAudioInput: AVCaptureDeviceInput?
    private var rig: CameraDeviceRig.Selection?
    private var isFrontFacing = false
    private var isCapturingPhoto = false
    private var isRecording = false
    private var isAeAfLocked = false
    private var pinchStartZoomFactor: CGFloat = 1.0
    private var activePhotoCompletion: ((Result<AVCapturePhoto, Error>) -> Void)?
    /// Set right before `capturePhoto(with:delegate:)` so the delegate callback
    /// knows which container format to write without needing to sniff file bytes.
    private var capturingHeic = false
    private var previewLayer: AVCaptureVideoPreviewLayer?
    private var timer: Timer?
    private var recordingStartedAt: CFTimeInterval = 0
    private var flashMode: AVCaptureDevice.FlashMode = .auto

    // UI
    private let closeButton = UIButton(type: .system)
    private let flashButton = UIButton(type: .system)
    private let flipButton = UIButton(type: .system)
    private let timerLabel = UILabel()
    private let shutterButton = UIButton(type: .custom)
    private let shutterRing = UIView()
    private let shutterInnerShape = UIView()
    private let zoomStack = UIStackView()
    private let focusReticle = UIView()
    private let lockBanner = UILabel()
    private let modeTabStack = UIStackView()
    private var modeTabButtons: [String: UIButton] = [:]
    private var modeTabUnderlines: [String: UIView] = [:]
    private var modeTabTitles: [String: String] = [:]
    private var zoomButtons: [UIButton] = []

    override var prefersStatusBarHidden: Bool { true }
    override var supportedInterfaceOrientations: UIInterfaceOrientationMask { .portrait }

    override func viewDidLoad() {
        super.viewDidLoad()
        captureMode = initialMode
        view.backgroundColor = .black
        buildUI()
        addGestureRecognizers()
        requestPermissionsAndStart()
    }

    override func viewDidLayoutSubviews() {
        super.viewDidLayoutSubviews()
        previewLayer?.frame = view.bounds
        layoutChrome()
    }

    override func viewWillDisappear(_ animated: Bool) {
        super.viewWillDisappear(animated)
        if isBeingDismissed || isMovingFromParent {
            if isRecording {
                movieOutput.stopRecording()
            }
            stopSession()
        }
    }

    func cancelFromPlugin() {
        if isRecording {
            movieOutput.stopRecording()
        }
        stopSession()
        dismiss(animated: true) { [weak self] in
            self?.onFinished?(.cancelled)
        }
    }

    // MARK: - UI

    private func buildUI() {
        closeButton.setImage(UIImage(systemName: "xmark"), for: .normal)
        closeButton.tintColor = .white
        closeButton.backgroundColor = UIColor.black.withAlphaComponent(0.4)
        closeButton.layer.cornerRadius = 22
        closeButton.addTarget(self, action: #selector(handleClose), for: .touchUpInside)
        view.addSubview(closeButton)

        flashButton.setImage(UIImage(systemName: "bolt.badge.automatic"), for: .normal)
        flashButton.tintColor = .white
        flashButton.backgroundColor = UIColor.black.withAlphaComponent(0.4)
        flashButton.layer.cornerRadius = 18
        flashButton.addTarget(self, action: #selector(handleFlashToggle), for: .touchUpInside)
        view.addSubview(flashButton)

        flipButton.setImage(UIImage(systemName: "arrow.triangle.2.circlepath.camera"), for: .normal)
        flipButton.tintColor = .white
        flipButton.backgroundColor = UIColor.black.withAlphaComponent(0.4)
        flipButton.layer.cornerRadius = 22
        flipButton.addTarget(self, action: #selector(handleFlip), for: .touchUpInside)
        view.addSubview(flipButton)

        timerLabel.text = "0:00"
        timerLabel.textColor = .white
        timerLabel.font = .monospacedDigitSystemFont(ofSize: 15, weight: .semibold)
        timerLabel.textAlignment = .center
        timerLabel.isHidden = true
        view.addSubview(timerLabel)

        shutterButton.addTarget(self, action: #selector(handleShutter), for: .touchUpInside)
        view.addSubview(shutterButton)

        shutterRing.backgroundColor = .clear
        shutterRing.layer.cornerRadius = 38
        shutterRing.layer.borderWidth = 4
        shutterRing.layer.borderColor = UIColor.white.cgColor
        shutterRing.isUserInteractionEnabled = false
        view.addSubview(shutterRing)

        shutterInnerShape.isUserInteractionEnabled = false
        shutterButton.addSubview(shutterInnerShape)

        zoomStack.axis = .horizontal
        zoomStack.spacing = 8
        zoomStack.alignment = .center
        zoomStack.distribution = .equalSpacing
        view.addSubview(zoomStack)

        focusReticle.layer.borderWidth = 1.5
        focusReticle.layer.borderColor = UIColor(red: 1, green: 0.84, blue: 0.04, alpha: 1).cgColor
        focusReticle.layer.cornerRadius = 4
        focusReticle.isHidden = true
        focusReticle.isUserInteractionEnabled = false
        view.addSubview(focusReticle)

        lockBanner.text = "AE/AF LOCK"
        lockBanner.textColor = UIColor(red: 1, green: 0.84, blue: 0.04, alpha: 1)
        lockBanner.font = .systemFont(ofSize: 13, weight: .bold)
        lockBanner.textAlignment = .center
        lockBanner.isHidden = true
        view.addSubview(lockBanner)

        buildModeTabs()

        layoutChrome()
        updateShutterAppearance()
        updateModeTabsAppearance()
    }

    private func buildModeTabs() {
        modeTabStack.axis = .horizontal
        modeTabStack.spacing = 24
        modeTabStack.alignment = .center
        modeTabStack.distribution = .equalSpacing
        modeTabStack.isHidden = !showsModeTabs
        view.addSubview(modeTabStack)

        let labels: [(id: String, title: String)] = [
            ("photo", "PHOTO"),
            ("video", "VIDEO"),
            ("text", "TEXT"),
        ]

        for entry in labels {
            let container = UIView()
            let button = UIButton(type: .system)
            button.setAttributedTitle(Self.tabTitle(entry.title, selected: false), for: .normal)
            button.accessibilityIdentifier = entry.id
            button.addTarget(self, action: #selector(handleModeTabTap(_:)), for: .touchUpInside)

            let underline = UIView()
            underline.backgroundColor = .white
            underline.layer.cornerRadius = 1

            container.addSubview(button)
            container.addSubview(underline)
            button.translatesAutoresizingMaskIntoConstraints = false
            NSLayoutConstraint.activate([
                button.topAnchor.constraint(equalTo: container.topAnchor),
                button.leadingAnchor.constraint(equalTo: container.leadingAnchor),
                button.trailingAnchor.constraint(equalTo: container.trailingAnchor),
                button.bottomAnchor.constraint(equalTo: container.bottomAnchor, constant: -6),
            ])

            modeTabStack.addArrangedSubview(container)
            modeTabButtons[entry.id] = button
            modeTabUnderlines[entry.id] = underline
            modeTabTitles[entry.id] = entry.title
        }
    }

    private static func tabTitle(_ text: String, selected: Bool) -> NSAttributedString {
        NSAttributedString(
            string: text,
            attributes: [
                .font: UIFont.systemFont(ofSize: 11, weight: .bold),
                .kern: 1.6,
                .foregroundColor: selected ? UIColor.white : UIColor.white.withAlphaComponent(0.45),
            ]
        )
    }

    @objc private func handleModeTabTap(_ sender: UIButton) {
        guard let id = sender.accessibilityIdentifier else { return }
        selectTab(id)
    }

    private func selectTab(_ id: String) {
        guard !isRecording, !isCapturingPhoto else { return }

        switch id {
        case "photo":
            captureMode = .photo
            updateShutterAppearance()
            updateModeTabsAppearance()
        case "video":
            captureMode = .video
            updateShutterAppearance()
            updateModeTabsAppearance()
        case "text":
            switchToText()
        default:
            break
        }
    }

    private func switchToText() {
        if isRecording {
            movieOutput.stopRecording()
        }
        stopSession()
        dismiss(animated: true) { [weak self] in
            self?.onFinished?(.switchToText)
        }
    }

    private func updateModeTabsAppearance() {
        let selectedId = captureMode == .photo ? "photo" : "video"
        for (id, button) in modeTabButtons {
            let selected = id == selectedId
            let title = modeTabTitles[id] ?? ""
            button.setAttributedTitle(Self.tabTitle(title, selected: selected), for: .normal)
            modeTabUnderlines[id]?.isHidden = !selected
        }
    }

    private func layoutChrome() {
        let safe = view.safeAreaInsets
        closeButton.frame = CGRect(x: 16, y: max(16, safe.top + 8), width: 44, height: 44)
        flashButton.frame = CGRect(x: view.bounds.width - 16 - 36, y: max(16, safe.top + 12), width: 36, height: 36)
        lockBanner.frame = CGRect(x: 24, y: closeButton.frame.maxY + 8, width: view.bounds.width - 48, height: 18)
        timerLabel.frame = CGRect(x: 24, y: closeButton.frame.maxY + 8, width: view.bounds.width - 48, height: 20)

        let shutterSize: CGFloat = 68
        let shutterY = view.bounds.height - max(28, safe.bottom + 24) - shutterSize
        shutterButton.frame = CGRect(x: (view.bounds.width - shutterSize) / 2, y: shutterY, width: shutterSize, height: shutterSize)
        shutterRing.frame = shutterButton.frame.insetBy(dx: -6, dy: -6)
        flipButton.frame = CGRect(x: view.bounds.width - 16 - 44, y: shutterY + 12, width: 44, height: 44)

        // Both rows are sized to their own content (not stretched edge-to-edge)
        // and then centered — matching the native Camera app's tight, grouped
        // pill clusters instead of a bar spanning the full screen width.
        layoutCenteredRow(zoomStack, y: shutterButton.frame.minY - 56, height: 32)
        for button in zoomButtons {
            button.layer.cornerRadius = 16
        }

        layoutCenteredRow(modeTabStack, y: zoomStack.frame.minY - 40, height: 24)

        updateShutterAppearance()
    }

    /// Sizes `stack` to its own fitting (content-hugging) width instead of the
    /// full view width, then centers that narrower frame horizontally. With a
    /// full-width frame, `.equalSpacing` distribution stretches the *gaps*
    /// between items to fill the container — which is what was spreading PHOTO
    /// / VIDEO / TEXT (and the zoom pills) edge-to-edge across the screen.
    private func layoutCenteredRow(_ stack: UIStackView, y: CGFloat, height: CGFloat) {
        let fittingWidth = stack.systemLayoutSizeFitting(
            UIView.layoutFittingCompressedSize
        ).width
        let width = fittingWidth > 0 ? fittingWidth : view.bounds.width
        stack.frame = CGRect(x: (view.bounds.width - width) / 2, y: y, width: width, height: height)
    }

    private func updateShutterAppearance() {
        switch captureMode {
        case .photo:
            shutterButton.backgroundColor = .white
            shutterButton.layer.cornerRadius = shutterButton.bounds.width / 2
            shutterButton.layer.borderWidth = 0
            shutterInnerShape.isHidden = true
            shutterRing.isHidden = false
            flashButton.isHidden = false
            timerLabel.isHidden = true
        case .video:
            shutterButton.backgroundColor = .clear
            shutterButton.layer.cornerRadius = shutterButton.bounds.width / 2
            shutterButton.layer.borderWidth = 4
            shutterButton.layer.borderColor = UIColor.white.cgColor
            shutterInnerShape.isHidden = false
            shutterInnerShape.backgroundColor = UIColor(red: 1, green: 0.23, blue: 0.19, alpha: 1)
            shutterRing.isHidden = true
            flashButton.isHidden = true
            timerLabel.isHidden = !isRecording

            if isRecording {
                shutterInnerShape.layer.cornerRadius = 6
                shutterInnerShape.frame = CGRect(x: 22, y: 22, width: 24, height: 24)
            } else {
                shutterInnerShape.layer.cornerRadius = 25
                shutterInnerShape.frame = CGRect(x: 9, y: 9, width: 50, height: 50)
            }
        }
    }

    private func showZoomButtons(for rig: CameraDeviceRig.Selection) {
        zoomStack.arrangedSubviews.forEach { $0.removeFromSuperview() }
        zoomButtons.removeAll()

        for factor in rig.quickZoomFactors {
            let button = UIButton(type: .system)
            button.setTitle(zoomLabel(for: factor), for: .normal)
            button.setTitleColor(.white, for: .normal)
            button.titleLabel?.font = .systemFont(ofSize: 12, weight: .semibold)
            button.backgroundColor = UIColor.black.withAlphaComponent(0.4)
            button.frame.size = CGSize(width: 32, height: 32)
            button.tag = Int((factor * 100).rounded())
            button.addTarget(self, action: #selector(handleZoomPreset(_:)), for: .touchUpInside)
            zoomStack.addArrangedSubview(button)
            zoomButtons.append(button)
        }

        // Buttons are populated asynchronously after the zoom row's frame was
        // already sized once (possibly against zero content) — force a fresh
        // layout pass so `layoutCenteredRow` re-measures and re-centers it now
        // that it actually has content.
        view.setNeedsLayout()
    }

    private func zoomLabel(for factor: CGFloat) -> String {
        let rounded = (factor * 10).rounded() / 10
        if rounded == rounded.rounded() {
            return "\(Int(rounded))x"
        }
        return String(format: "%.1fx", rounded)
    }

    // MARK: - Gestures

    private func addGestureRecognizers() {
        let tap = UITapGestureRecognizer(target: self, action: #selector(handleTapToFocus(_:)))
        view.addGestureRecognizer(tap)

        let longPress = UILongPressGestureRecognizer(target: self, action: #selector(handleLongPressLock(_:)))
        longPress.minimumPressDuration = 0.5
        view.addGestureRecognizer(longPress)

        let pinch = UIPinchGestureRecognizer(target: self, action: #selector(handlePinchZoom(_:)))
        view.addGestureRecognizer(pinch)

        let swipeLeft = UISwipeGestureRecognizer(target: self, action: #selector(handleSwipeLeft))
        swipeLeft.direction = .left
        view.addGestureRecognizer(swipeLeft)

        let swipeRight = UISwipeGestureRecognizer(target: self, action: #selector(handleSwipeRight))
        swipeRight.direction = .right
        view.addGestureRecognizer(swipeRight)
    }

    @objc private func handleSwipeLeft() {
        guard showsModeTabs else { return }
        // photo -> video -> text
        if captureMode == .photo {
            selectTab("video")
        } else if captureMode == .video {
            selectTab("text")
        }
    }

    @objc private func handleSwipeRight() {
        guard showsModeTabs else { return }
        if captureMode == .video {
            selectTab("photo")
        }
    }

    @objc private func handleTapToFocus(_ gesture: UITapGestureRecognizer) {
        guard !isAeAfLocked, let device = currentDevice, let previewLayer else { return }
        let layerPoint = gesture.location(in: view)
        let devicePoint = previewLayer.captureDevicePointConverted(fromLayerPoint: layerPoint)
        focus(device: device, at: devicePoint, continuous: false)
        showFocusReticle(at: layerPoint, locked: false)
    }

    @objc private func handleLongPressLock(_ gesture: UILongPressGestureRecognizer) {
        guard gesture.state == .began, let device = currentDevice, let previewLayer else { return }
        let layerPoint = gesture.location(in: view)
        let devicePoint = previewLayer.captureDevicePointConverted(fromLayerPoint: layerPoint)
        lockAutoFocusExposure(device: device, at: devicePoint)
        showFocusReticle(at: layerPoint, locked: true)
        UIImpactFeedbackGenerator(style: .medium).impactOccurred()
    }

    @objc private func handlePinchZoom(_ gesture: UIPinchGestureRecognizer) {
        guard let device = currentDevice else { return }

        switch gesture.state {
        case .began:
            pinchStartZoomFactor = device.videoZoomFactor
        case .changed:
            let proposed = pinchStartZoomFactor * gesture.scale
            let clamped = min(max(proposed, device.minAvailableVideoZoomFactor), device.maxAvailableVideoZoomFactor)
            setZoom(device: device, factor: clamped, animated: false)
        default:
            break
        }
    }

    @objc private func handleZoomPreset(_ sender: UIButton) {
        guard let device = currentDevice else { return }
        let factor = CGFloat(sender.tag) / 100
        setZoom(device: device, factor: factor, animated: true)
    }

    // MARK: - Focus / exposure / zoom

    private func focus(device: AVCaptureDevice, at point: CGPoint, continuous: Bool) {
        do {
            try device.lockForConfiguration()
            if device.isFocusPointOfInterestSupported {
                device.focusPointOfInterest = point
            }
            if device.isFocusModeSupported(.autoFocus) {
                device.focusMode = .autoFocus
            }
            if device.isExposurePointOfInterestSupported {
                device.exposurePointOfInterest = point
            }
            if device.isExposureModeSupported(.autoExpose) {
                device.exposureMode = .autoExpose
            }
            device.unlockForConfiguration()
        } catch {
            print("[SpotDropCamera] focus(at:) failed: \(error)")
        }
    }

    private func lockAutoFocusExposure(device: AVCaptureDevice, at point: CGPoint) {
        do {
            try device.lockForConfiguration()
            if device.isFocusPointOfInterestSupported {
                device.focusPointOfInterest = point
            }
            if device.isExposurePointOfInterestSupported {
                device.exposurePointOfInterest = point
            }
            if device.isFocusModeSupported(.locked) {
                device.focusMode = .locked
            }
            if device.isExposureModeSupported(.locked) {
                device.exposureMode = .locked
            }
            device.unlockForConfiguration()
            isAeAfLocked = true
            lockBanner.isHidden = false
        } catch {
            print("[SpotDropCamera] lockAutoFocusExposure failed: \(error)")
        }
    }

    private func setZoom(device: AVCaptureDevice, factor: CGFloat, animated: Bool) {
        do {
            try device.lockForConfiguration()
            if animated {
                device.ramp(toVideoZoomFactor: factor, withRate: 6.0)
            } else {
                device.videoZoomFactor = factor
            }
            device.unlockForConfiguration()
        } catch {
            print("[SpotDropCamera] setZoom failed: \(error)")
        }
    }

    private func showFocusReticle(at point: CGPoint, locked: Bool) {
        focusReticle.layer.borderColor = (locked
            ? UIColor(red: 1, green: 0.84, blue: 0.04, alpha: 1)
            : UIColor.white).cgColor
        focusReticle.frame = CGRect(x: point.x - 40, y: point.y - 40, width: 80, height: 80)
        focusReticle.isHidden = false
        focusReticle.alpha = 1
        focusReticle.transform = CGAffineTransform(scaleX: 1.15, y: 1.15)

        UIView.animate(withDuration: 0.2, animations: {
            self.focusReticle.transform = .identity
        })

        if !locked {
            UIView.animate(withDuration: 0.25, delay: 0.6, options: [], animations: {
                self.focusReticle.alpha = 0
            }, completion: { _ in
                self.focusReticle.isHidden = true
            })
        }
    }

    // MARK: - Permissions / session

    private func requestPermissionsAndStart() {
        requestAccess(for: .video) { [weak self] videoGranted in
            guard let self else { return }
            guard videoGranted else {
                self.finishFailure(message: "Camera permission is required.")
                return
            }
            self.requestAccess(for: .audio) { audioGranted in
                print("[SpotDropCamera][audio] microphone permission granted=\(audioGranted)")
                // Recording proceeds even without mic access (silent video) —
                // matches how the existing camera already tolerates a denied mic
                // rather than blocking capture entirely.
                self.configureSession(includeAudio: audioGranted)
            }
        }
    }

    private func requestAccess(for mediaType: AVMediaType, completion: @escaping (Bool) -> Void) {
        switch AVCaptureDevice.authorizationStatus(for: mediaType) {
        case .authorized:
            completion(true)
        case .notDetermined:
            AVCaptureDevice.requestAccess(for: mediaType) { granted in
                DispatchQueue.main.async { completion(granted) }
            }
        default:
            completion(false)
        }
    }

    private func configureSession(includeAudio: Bool) {
        sessionQueue.async { [weak self] in
            guard let self else { return }

            guard let rig = CameraDeviceRig.selectBackCamera() else {
                DispatchQueue.main.async {
                    self.finishFailure(message: "No usable camera found on this device.")
                }
                return
            }

            self.session.beginConfiguration()

            // A single video-oriented preset drives the live preview and movie
            // output; `photoOutput.isHighResolutionCaptureEnabled` below lets
            // still capture use the sensor's full resolution independent of this
            // preset — this is what lets one session serve both PHOTO and VIDEO
            // without compromising photo quality.
            if self.session.canSetSessionPreset(.hd1920x1080) {
                self.session.sessionPreset = .hd1920x1080
            } else {
                self.session.sessionPreset = .high
            }

            guard self.attachVideoInput(for: rig.device) else {
                self.session.commitConfiguration()
                DispatchQueue.main.async {
                    self.finishFailure(message: "Unable to open the camera.")
                }
                return
            }

            if includeAudio,
               let audioDevice = AVCaptureDevice.default(for: .audio),
               let audioInput = try? AVCaptureDeviceInput(device: audioDevice),
               self.session.canAddInput(audioInput) {
                self.session.addInput(audioInput)
                self.currentAudioInput = audioInput
                print("[SpotDropCamera][audio] AVCaptureDeviceInput for audio ADDED to session")
            } else {
                print("[SpotDropCamera][audio] audio input NOT added | includeAudio=\(includeAudio) | hasDefaultAudioDevice=\(AVCaptureDevice.default(for: .audio) != nil)")
            }

            if self.session.canAddOutput(self.photoOutput) {
                self.session.addOutput(self.photoOutput)
                self.photoOutput.isHighResolutionCaptureEnabled = true
                self.photoOutput.maxPhotoQualityPrioritization = .quality
            }

            if self.session.canAddOutput(self.movieOutput) {
                self.session.addOutput(self.movieOutput)
                self.movieOutput.maxRecordedDuration = CMTime(
                    seconds: Self.maxRecordedDurationSeconds,
                    preferredTimescale: 600
                )

                if let connection = self.movieOutput.connection(with: .video) {
                    if connection.isVideoStabilizationSupported {
                        connection.preferredVideoStabilizationMode = .auto
                    }
                    if connection.isVideoOrientationSupported {
                        connection.videoOrientation = .portrait
                    }

                    let codec: AVVideoCodecType = self.movieOutput.availableVideoCodecTypes.contains(.hevc)
                        ? .hevc
                        : .h264
                    self.movieOutput.setOutputSettings(
                        [
                            AVVideoCodecKey: codec,
                            AVVideoCompressionPropertiesKey: [
                                AVVideoAverageBitRateKey: Self.targetBitrate
                            ]
                        ],
                        for: connection
                    )
                }
            }

            self.session.commitConfiguration()
            self.rig = rig
            self.applyContinuousAutoModes(to: rig.device)
            self.session.startRunning()

            DispatchQueue.main.async {
                let layer = AVCaptureVideoPreviewLayer(session: self.session)
                layer.videoGravity = .resizeAspectFill
                layer.frame = self.view.bounds
                if let connection = layer.connection, connection.isVideoOrientationSupported {
                    connection.videoOrientation = .portrait
                }
                self.view.layer.insertSublayer(layer, at: 0)
                self.previewLayer = layer
                self.showZoomButtons(for: rig)
            }
        }
    }

    private func attachVideoInput(for device: AVCaptureDevice) -> Bool {
        if let currentVideoInput {
            session.removeInput(currentVideoInput)
        }

        guard let input = try? AVCaptureDeviceInput(device: device), session.canAddInput(input) else {
            return false
        }

        session.addInput(input)
        currentVideoInput = input
        currentDevice = device
        return true
    }

    private func applyContinuousAutoModes(to device: AVCaptureDevice) {
        do {
            try device.lockForConfiguration()
            if device.isFocusModeSupported(.continuousAutoFocus) {
                device.focusMode = .continuousAutoFocus
            }
            if device.isExposureModeSupported(.continuousAutoExposure) {
                device.exposureMode = .continuousAutoExposure
            }
            if device.isWhiteBalanceModeSupported(.continuousAutoWhiteBalance) {
                device.whiteBalanceMode = .continuousAutoWhiteBalance
            }
            if device.isLowLightBoostSupported {
                device.automaticallyEnablesLowLightBoostWhenAvailable = true
            }
            device.unlockForConfiguration()
        } catch {
            print("[SpotDropCamera] applyContinuousAutoModes failed: \(error)")
        }
    }

    private func stopSession() {
        sessionQueue.async { [weak self] in
            self?.session.stopRunning()
        }
    }

    // MARK: - Flip / flash

    @objc private func handleFlip() {
        guard !isRecording else { return }

        isFrontFacing.toggle()
        let nextDevice = isFrontFacing ? CameraDeviceRig.selectFrontCamera() : rig?.device

        guard let nextDevice else {
            isFrontFacing.toggle()
            return
        }

        sessionQueue.async { [weak self] in
            guard let self else { return }
            self.session.beginConfiguration()
            let attached = self.attachVideoInput(for: nextDevice)
            self.session.commitConfiguration()

            guard attached else { return }
            self.applyContinuousAutoModes(to: nextDevice)
            self.isAeAfLocked = false

            DispatchQueue.main.async {
                self.lockBanner.isHidden = true
                if !self.isFrontFacing, let rig = self.rig {
                    self.showZoomButtons(for: rig)
                } else {
                    self.zoomStack.arrangedSubviews.forEach { $0.removeFromSuperview() }
                    self.zoomButtons.removeAll()
                }
            }
        }

        UIImpactFeedbackGenerator(style: .light).impactOccurred()
    }

    @objc private func handleFlashToggle() {
        switch flashMode {
        case .auto:
            flashMode = .on
            flashButton.setImage(UIImage(systemName: "bolt.fill"), for: .normal)
        case .on:
            flashMode = .off
            flashButton.setImage(UIImage(systemName: "bolt.slash.fill"), for: .normal)
        default:
            flashMode = .auto
            flashButton.setImage(UIImage(systemName: "bolt.badge.automatic"), for: .normal)
        }
    }

    // MARK: - Shared output directory

    /// Both PHOTO and VIDEO write here rather than the system temp directory —
    /// iOS is free to reclaim `NSTemporaryDirectory()` at any time, and this was
    /// confirmed on-device to correlate with unreadable video output. Caches is
    /// stable for the life of the app run and isn't backed up, which is the right
    /// tradeoff for a generated file that gets read back and copied into Supabase
    /// storage moments later.
    private func stableOutputDirectory() throws -> URL {
        let caches = try FileManager.default.url(
            for: .cachesDirectory,
            in: .userDomainMask,
            appropriateFor: nil,
            create: true
        )
        let directory = caches.appendingPathComponent("SpotDropCameraOutput", isDirectory: true)
        if !FileManager.default.fileExists(atPath: directory.path) {
            try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
        }
        return directory
    }

    // MARK: - Shutter

    @objc private func handleClose() {
        if isRecording {
            movieOutput.stopRecording()
        }
        stopSession()
        dismiss(animated: true) { [weak self] in
            self?.onFinished?(.cancelled)
        }
    }

    @objc private func handleShutter() {
        switch captureMode {
        case .photo:
            capturePhoto()
        case .video:
            if isRecording {
                movieOutput.stopRecording()
            } else {
                startRecording()
            }
        }
    }

    // MARK: - Photo capture

    private func capturePhoto() {
        guard !isCapturingPhoto, currentDevice != nil else { return }
        isCapturingPhoto = true

        UIView.animate(withDuration: 0.08, animations: {
            self.shutterButton.transform = CGAffineTransform(scaleX: 0.88, y: 0.88)
        }, completion: { _ in
            UIView.animate(withDuration: 0.12) {
                self.shutterButton.transform = .identity
            }
        })
        UIImpactFeedbackGenerator(style: .light).impactOccurred()

        var settings: AVCapturePhotoSettings
        if photoOutput.availablePhotoCodecTypes.contains(.hevc) {
            settings = AVCapturePhotoSettings(format: [AVVideoCodecKey: AVVideoCodecType.hevc])
            capturingHeic = true
        } else {
            settings = AVCapturePhotoSettings()
            capturingHeic = false
        }

        settings.isHighResolutionPhotoEnabled = photoOutput.isHighResolutionCaptureEnabled
        settings.photoQualityPrioritization = .quality
        if currentDevice?.hasFlash == true {
            settings.flashMode = flashMode
        }

        if let connection = photoOutput.connection(with: .video), connection.isVideoOrientationSupported {
            connection.videoOrientation = .portrait
            connection.isVideoMirrored = isFrontFacing
        }

        activePhotoCompletion = { [weak self] result in
            guard let self else { return }
            self.isCapturingPhoto = false

            switch result {
            case .success(let photo):
                self.handleCapturedPhoto(photo)
            case .failure(let error):
                self.finishFailure(message: error.localizedDescription)
            }
        }

        photoOutput.capturePhoto(with: settings, delegate: self)
    }

    private func handleCapturedPhoto(_ photo: AVCapturePhoto) {
        guard let data = photo.fileDataRepresentation(), !data.isEmpty else {
            finishFailure(message: "Unable to read the captured photo.")
            return
        }

        let ext = capturingHeic ? "heic" : "jpg"
        let mimeType = capturingHeic ? "image/heic" : "image/jpeg"
        let dimensions = photo.resolvedSettings.photoDimensions

        let outputURL: URL
        do {
            outputURL = try stableOutputDirectory()
                .appendingPathComponent("spotdrop-photo-\(UUID().uuidString).\(ext)")
            try data.write(to: outputURL)
        } catch {
            finishFailure(message: "Unable to save the captured photo.")
            return
        }

        let output = PhotoCaptureOutput(
            path: outputURL.path,
            width: Int(dimensions.width),
            height: Int(dimensions.height),
            mimeType: mimeType
        )

        stopSession()
        dismiss(animated: true) { [weak self] in
            self?.onFinished?(.photo(output))
        }
    }

    // MARK: - Video capture

    private func startRecording() {
        guard !isRecording, currentDevice != nil else { return }

        let outputURL: URL
        do {
            outputURL = try stableOutputDirectory()
                .appendingPathComponent("spotdrop-video-\(UUID().uuidString).mov")
        } catch {
            finishFailure(message: "Unable to prepare storage for the recording.")
            return
        }

        isRecording = true
        recordingStartedAt = CACurrentMediaTime()
        updateShutterAppearance()
        startTimerDisplay()
        UIImpactFeedbackGenerator(style: .medium).impactOccurred()

        movieOutput.startRecording(to: outputURL, recordingDelegate: self)
    }

    private func startTimerDisplay() {
        timerLabel.isHidden = false
        timerLabel.text = "0:00"
        timer?.invalidate()
        timer = Timer.scheduledTimer(withTimeInterval: 0.2, repeats: true) { [weak self] _ in
            guard let self else { return }
            let elapsed = max(0, CACurrentMediaTime() - self.recordingStartedAt)
            let seconds = Int(elapsed)
            self.timerLabel.text = String(format: "%d:%02d", seconds / 60, seconds % 60)
        }
    }

    private func stopTimerDisplay() {
        timer?.invalidate()
        timer = nil
        timerLabel.isHidden = true
    }

    private func cleanupFile(at url: URL) {
        try? FileManager.default.removeItem(at: url)
    }

    private func finishFailure(message: String) {
        stopSession()
        let error = NSError(domain: "SpotDropCamera", code: 1, userInfo: [NSLocalizedDescriptionKey: message])
        dismiss(animated: true) { [weak self] in
            self?.onFinished?(.failure(error))
        }
    }
}

extension CameraCaptureViewController: AVCapturePhotoCaptureDelegate {
    func photoOutput(
        _ output: AVCapturePhotoOutput,
        didFinishProcessingPhoto photo: AVCapturePhoto,
        error: Error?
    ) {
        if let error {
            activePhotoCompletion?(.failure(error))
        } else {
            activePhotoCompletion?(.success(photo))
        }
        activePhotoCompletion = nil
    }
}

extension CameraCaptureViewController: AVCaptureFileOutputRecordingDelegate {
    func fileOutput(
        _ output: AVCaptureFileOutput,
        didFinishRecordingTo outputFileURL: URL,
        from connections: [AVCaptureConnection],
        error: Error?
    ) {
        isRecording = false
        stopTimerDisplay()
        updateShutterAppearance()

        // `error` is non-nil both for genuine failures and for the two *expected*
        // stop paths (user tapped stop, or `maxRecordedDuration` was reached) — in
        // both expected cases the file is still complete and valid per Apple's
        // documented behavior for this delegate callback. Only treat it as a
        // failure if neither expected condition applies.
        if let error = error as NSError? {
            let successfulStopCodes: Set<Int> = [
                AVError.maximumDurationReached.rawValue
            ]
            let recordedSuccessfully =
                (error.userInfo[AVErrorRecordingSuccessfullyFinishedKey] as? Bool) == true
            if !recordedSuccessfully && !successfulStopCodes.contains(error.code) {
                cleanupFile(at: outputFileURL)
                finishFailure(message: error.localizedDescription)
                return
            }
        }

        // Belt-and-suspenders on top of AVFoundation's own guarantee that this
        // delegate only fires once the file is finalized: explicitly verify the
        // file exists, is non-empty, and is actually readable as a valid movie
        // before ever telling the JS side it can read it.
        guard FileManager.default.fileExists(atPath: outputFileURL.path) else {
            finishFailure(message: "Recording finished but the output file is missing.")
            return
        }

        guard
            let attributes = try? FileManager.default.attributesOfItem(atPath: outputFileURL.path),
            let fileSize = attributes[.size] as? NSNumber,
            fileSize.intValue > 0
        else {
            cleanupFile(at: outputFileURL)
            finishFailure(message: "Recording finished but the output file is empty.")
            return
        }

        let asset = AVURLAsset(url: outputFileURL)
        let durationSeconds = CMTimeGetSeconds(asset.duration)
        let videoTrack = asset.tracks(withMediaType: .video).first
        let audioTrack = asset.tracks(withMediaType: .audio).first

        print("[SpotDropCamera][audio] finished recording | hadAudioInput=\(currentAudioInput != nil) | assetHasAudioTrack=\(audioTrack != nil) | sizeBytes=\(fileSize.intValue) | durationSeconds=\(durationSeconds)")

        guard durationSeconds.isFinite, durationSeconds > 0, let videoTrack else {
            cleanupFile(at: outputFileURL)
            finishFailure(message: "Recording finished but the video file could not be read back.")
            return
        }

        // `naturalSize` reports the sensor's raw (landscape) frame size; portrait
        // recording is expressed via the track's rotation transform, not the
        // pixel dimensions themselves. Swap width/height for a 90/270 rotation so
        // callers get the size the video actually displays at.
        let naturalSize = videoTrack.naturalSize
        let transform = videoTrack.preferredTransform
        let isRotated90or270 = abs(transform.b) == 1 && abs(transform.c) == 1
        let displayWidth = isRotated90or270 ? abs(naturalSize.height) : abs(naturalSize.width)
        let displayHeight = isRotated90or270 ? abs(naturalSize.width) : abs(naturalSize.height)

        stopSession()
        let output = VideoCaptureOutput(
            path: outputFileURL.path,
            mimeType: "video/quicktime",
            durationMs: durationSeconds * 1000,
            sizeBytes: fileSize.intValue,
            width: Int(displayWidth.rounded()),
            height: Int(displayHeight.rounded())
        )

        dismiss(animated: true) { [weak self] in
            self?.onFinished?(.video(output))
        }
    }
}
