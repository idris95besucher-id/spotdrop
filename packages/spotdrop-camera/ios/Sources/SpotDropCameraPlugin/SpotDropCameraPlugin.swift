import Foundation
import Capacitor
import UIKit

/// Capacitor bridge for the native camera. One method, `openCamera`, presents
/// exactly one `CameraCaptureViewController` that handles PHOTO and VIDEO
/// itself internally — this plugin no longer presents two different
/// controllers for two different capture verbs. That old shape (separate
/// `capturePhoto`/`captureVideo` methods, each presenting its own full-screen
/// controller) is what caused VIDEO to visibly open "a second camera" on top of
/// whatever was already on screen; a single entry point removes that failure
/// mode structurally rather than papering over it.
@objc(SpotDropCameraPlugin)
public class SpotDropCameraPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "SpotDropCameraPlugin"
    public let jsName = "SpotDropCamera"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "isAvailable", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "openCamera", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "readCapturedFile", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "cancel", returnType: CAPPluginReturnPromise)
    ]

    private weak var activeCameraController: CameraCaptureViewController?

    @objc func isAvailable(_ call: CAPPluginCall) {
        call.resolve([
            "available": true,
            "platform": "ios"
        ])
    }

    @objc func openCamera(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            guard let presenter = self.bridge?.viewController else {
                call.reject("No view controller available for camera capture.")
                return
            }

            if self.activeCameraController != nil {
                call.reject("A camera session is already in progress.")
                return
            }

            let photoOnly = call.getBool("photoOnly") ?? false
            let initialModeString = call.getString("initialMode") ?? "photo"

            let controller = CameraCaptureViewController()
            controller.modalPresentationStyle = .fullScreen
            controller.showsModeTabs = !photoOnly
            controller.initialMode = initialModeString == "video" ? .video : .photo
            controller.onFinished = { [weak self] result in
                self?.activeCameraController = nil
                switch result {
                case .photo(let output):
                    call.resolve([
                        "action": "photo",
                        "path": output.path,
                        "width": output.width,
                        "height": output.height,
                        "mimeType": output.mimeType
                    ])
                case .video(let output):
                    call.resolve([
                        "action": "video",
                        "path": output.path,
                        "mimeType": output.mimeType,
                        "durationMs": output.durationMs,
                        "sizeBytes": output.sizeBytes,
                        "width": output.width,
                        "height": output.height,
                        "isVideo": true
                    ])
                case .switchToText:
                    call.resolve(["action": "text"])
                case .failure(let error):
                    call.reject(error.localizedDescription)
                case .cancelled:
                    call.reject("Camera cancelled.", "USER_CANCELLED")
                }
            }

            self.activeCameraController = controller
            presenter.present(controller, animated: true)
        }
    }

    /// Reads a file this plugin itself produced and hands it back as base64 over
    /// the standard plugin-call bridge, bypassing `fetch()` against the
    /// `capacitor://.../_capacitor_file_` scheme entirely.
    ///
    /// This exists because `fetch(Capacitor.convertFileSrc(path))` was observed
    /// failing with a transport-level error (status 0) specifically for recorded
    /// video files on device, regardless of which directory the file lived in —
    /// confirmed by testing with the file moved from the temp directory into a
    /// stable Caches directory and seeing the identical failure. The plugin
    /// bridge (this call mechanism) is a completely different code path from the
    /// WKWebView custom-scheme URL loading system, so it isn't subject to
    /// whatever is causing that failure.
    ///
    /// Restricted to paths inside this app's own container — this isn't a
    /// general-purpose file-read bridge.
    @objc func readCapturedFile(_ call: CAPPluginCall) {
        guard let path = call.getString("path") else {
            call.reject("Missing path.")
            return
        }

        guard path.hasPrefix(NSHomeDirectory()) else {
            call.reject("Refusing to read a path outside the app container.")
            return
        }

        DispatchQueue.global(qos: .userInitiated).async {
            guard let data = FileManager.default.contents(atPath: path) else {
                DispatchQueue.main.async {
                    call.reject("Unable to read the file at the given path.")
                }
                return
            }

            let base64 = data.base64EncodedString()
            DispatchQueue.main.async {
                call.resolve([
                    "base64": base64,
                    "sizeBytes": data.count
                ])
            }
        }
    }

    @objc func cancel(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            self.activeCameraController?.cancelFromPlugin()
            self.activeCameraController = nil
            call.resolve()
        }
    }
}
