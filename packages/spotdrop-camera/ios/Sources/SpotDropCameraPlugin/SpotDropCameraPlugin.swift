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
        CAPPluginMethod(name: "uploadVideoToStorage", returnType: CAPPluginReturnPromise),
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
    /// the standard plugin-call bridge. Used for **photos only** now — Spot videos
    /// must never go through this path (see `uploadVideoToStorage`).
    @objc func readCapturedFile(_ call: CAPPluginCall) {
        guard let path = call.getString("path") else {
            call.reject("Missing path.")
            return
        }

        guard path.hasPrefix(NSHomeDirectory()) else {
            call.reject("Refusing to read a path outside the app container.")
            return
        }

        // Refuse to base64 large video files — that path is the measured upload bottleneck.
        let ext = (path as NSString).pathExtension.lowercased()
        if ["mov", "mp4", "m4v"].contains(ext) {
            call.reject("Video files must use uploadVideoToStorage — base64 bridge is disabled for video.")
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

    /// Compresses (once, if needed) and uploads a Spot video straight from the native
    /// filesystem path to Supabase Storage via URLSession — no base64, no JS FileReader.
    @objc func uploadVideoToStorage(_ call: CAPPluginCall) {
        guard let path = call.getString("path"),
              let supabaseUrl = call.getString("supabaseUrl"),
              let bucket = call.getString("bucket"),
              let objectPath = call.getString("objectPath"),
              let accessToken = call.getString("accessToken"),
              let apikey = call.getString("apikey") else {
            call.reject("Missing required upload parameters.")
            return
        }

        let coverObjectPath = call.getString("coverObjectPath")

        DispatchQueue.global(qos: .userInitiated).async {
            do {
                let result = try NativeVideoUploader.prepareAndUpload(
                    path: path,
                    supabaseUrl: supabaseUrl,
                    bucket: bucket,
                    objectPath: objectPath,
                    coverObjectPath: coverObjectPath,
                    accessToken: accessToken,
                    apikey: apikey,
                    onProgress: { [weak self] fraction in
                        let percent = Int((fraction * 100).rounded())
                        DispatchQueue.main.async {
                            self?.notifyListeners("nativeVideoUploadProgress", data: [
                                "percent": percent,
                                "objectPath": objectPath
                            ])
                        }
                    },
                    onLog: { message in
                        print(message)
                    }
                )

                DispatchQueue.main.async {
                    call.resolve([
                        "objectPath": result.publicObjectPath,
                        "coverObjectPath": result.coverObjectPath as Any,
                        "originalSizeBytes": result.originalSizeBytes,
                        "finalSizeBytes": result.finalSizeBytes,
                        "durationSeconds": result.durationSeconds,
                        "width": result.width,
                        "height": result.height,
                        "bitrateMbps": result.bitrateMbps,
                        "compressed": result.compressed,
                        "uploadSpeedMbps": result.uploadSpeedMbps,
                        "httpStatus": result.httpStatus,
                        "timing": [
                            "probeMs": result.timing.probeMs,
                            "compressMs": result.timing.compressMs,
                            "coverMs": result.timing.coverMs,
                            "uploadMs": result.timing.uploadMs,
                            "serverWaitMs": result.timing.serverWaitMs,
                            "totalMs": result.timing.totalMs
                        ]
                    ])
                }
            } catch {
                print("[NATIVE-UPLOAD] exact error: \(error.localizedDescription)")
                DispatchQueue.main.async {
                    call.reject(error.localizedDescription, "NATIVE_UPLOAD_FAILED", error, [
                        "message": error.localizedDescription
                    ])
                }
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
