import AVFoundation
import CoreGraphics

/// Picks the best available camera device for an iPhone-Camera-like zoom
/// experience.
///
/// Prefers a *virtual* multi-lens device (triple / dual-wide) over separate
/// physical-lens inputs. A virtual device gives one continuous `videoZoomFactor`
/// range that crosses seamlessly between ultra-wide, wide, and telephoto — the
/// same mechanism Apple's own Camera app uses for its 0.5x/1x/2x/3x zoom control.
/// Switching between *separate* `AVCaptureDeviceInput`s per lens instead would mean
/// tearing down and rebuilding the session (and losing the preview briefly) on
/// every lens change, which is not how the native Camera app behaves and would
/// undercut "smooth zoom animation".
enum CameraDeviceRig {
    struct Selection {
        let device: AVCaptureDevice
        /// `videoZoomFactor` values (relative to this device, where 1.0 is the
        /// primary wide lens) at which the virtual device internally swaps
        /// physical lenses. Empty when the device only has one physical lens.
        let lensSwitchOverFactors: [CGFloat]
        /// Zoom presets worth offering as quick-tap pills (ultra-wide if present,
        /// 1x, and each switch-over point — roughly 0.5x/1x/2x/3x depending on
        /// device). Expressed in the device's own `videoZoomFactor` units.
        let quickZoomFactors: [CGFloat]
    }

    /// Ordered by preference — first match wins.
    private static let preferredBackTypes: [AVCaptureDevice.DeviceType] = [
        .builtInTripleCamera,
        .builtInDualWideCamera,
        .builtInDualCamera,
        .builtInWideAngleCamera,
    ]

    static func selectBackCamera() -> Selection? {
        let discovery = AVCaptureDevice.DiscoverySession(
            deviceTypes: preferredBackTypes,
            mediaType: .video,
            position: .back
        )

        guard let device = preferredBackTypes
            .compactMap({ type in discovery.devices.first(where: { $0.deviceType == type }) })
            .first
        else {
            return nil
        }

        let switchOvers = device.virtualDeviceSwitchOverVideoZoomFactors.map { CGFloat(truncating: $0) }

        var quickZooms: [CGFloat] = []
        if device.minAvailableVideoZoomFactor < 1.0 {
            quickZooms.append(device.minAvailableVideoZoomFactor)
        }
        quickZooms.append(1.0)
        quickZooms.append(contentsOf: switchOvers)

        return Selection(
            device: device,
            lensSwitchOverFactors: switchOvers,
            quickZoomFactors: quickZooms
        )
    }

    static func selectFrontCamera() -> AVCaptureDevice? {
        AVCaptureDevice.default(.builtInWideAngleCamera, for: .video, position: .front)
    }
}
