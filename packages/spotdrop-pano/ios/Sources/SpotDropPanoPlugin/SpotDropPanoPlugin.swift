import Foundation
import Capacitor
import UIKit

@objc(SpotDropPanoPlugin)
public class SpotDropPanoPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "SpotDropPanoPlugin"
    public let jsName = "SpotDropPano"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "isAvailable", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "capturePanorama", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "cancel", returnType: CAPPluginReturnPromise)
    ]

    private weak var activeController: PanoCaptureViewController?

    @objc func isAvailable(_ call: CAPPluginCall) {
        call.resolve([
            "available": true,
            "platform": "ios"
        ])
    }

    @objc func capturePanorama(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            guard let presenter = self.bridge?.viewController else {
                call.reject("No view controller available for panorama capture.")
                return
            }

            if self.activeController != nil {
                call.reject("A panorama capture is already in progress.")
                return
            }

            let controller = PanoCaptureViewController()
            controller.modalPresentationStyle = .fullScreen
            controller.onFinished = { [weak self] result in
                self?.activeController = nil
                switch result {
                case .success(let output):
                    call.resolve([
                        "path": output.path,
                        "width": output.width,
                        "height": output.height,
                        "mimeType": "image/jpeg",
                        "isPanorama": true
                    ])
                case .failure(let error):
                    call.reject(error.localizedDescription)
                case .cancelled:
                    call.reject("Panorama capture cancelled.", "USER_CANCELLED")
                }
            }

            self.activeController = controller
            presenter.present(controller, animated: true)
        }
    }

    @objc func cancel(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            self.activeController?.cancelFromPlugin()
            self.activeController = nil
            call.resolve()
        }
    }
}
