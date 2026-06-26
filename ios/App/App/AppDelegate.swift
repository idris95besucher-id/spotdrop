import UIKit
import Capacitor
import FirebaseCore
import os.log

@UIApplicationMain
class AppDelegate: UIResponder, UIApplicationDelegate {

    var window: UIWindow?
    private static let log = Logger(subsystem: "com.spotdrop.app", category: "Firebase")

    private func googleServiceInfoPath() -> String? {
        Bundle.main.path(forResource: "GoogleService-Info", ofType: "plist")
    }

    private func isGoogleServiceInfoAvailable() -> Bool {
        guard let path = googleServiceInfoPath(),
              let plist = NSDictionary(contentsOfFile: path) as? [String: Any],
              let appId = plist["GOOGLE_APP_ID"] as? String,
              !appId.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty,
              !appId.contains("YOUR_") else {
            return false
        }

        return true
    }

    func application(_ application: UIApplication, didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]?) -> Bool {
        // Drop stale live-reload snapshot paths so the bundled `public/` folder is always used.
        KeyValueStore.standard["serverBasePath"] = nil as String?

        if let path = googleServiceInfoPath() {
            print("[SpotDrop] GoogleService-Info.plist bundle path: \(path)")
        } else {
            AppDelegate.log.warning("GoogleService-Info.plist not found in app bundle — add it to Copy Bundle Resources.")
            print("[SpotDrop] GoogleService-Info.plist missing from app bundle. Run: npm run ios:firebase-plist -- --verify")
            return true
        }

        guard isGoogleServiceInfoAvailable() else {
            AppDelegate.log.warning("GoogleService-Info.plist invalid or still contains placeholders — Firebase push disabled.")
            print("[SpotDrop] GoogleService-Info.plist invalid — replace placeholder values from Firebase Console.")
            return true
        }

        if FirebaseApp.app() == nil {
            FirebaseApp.configure()
        }

        if let app = FirebaseApp.app() {
            let projectId = app.options.projectID ?? "unknown"
            let googleAppId = app.options.googleAppID
            AppDelegate.log.info("Firebase configured project=\(projectId, privacy: .public) appId=\(googleAppId, privacy: .public)")
            print("[SpotDrop] Firebase configured — project: \(projectId), appId: \(googleAppId)")
        } else {
            print("[SpotDrop] FirebaseApp.configure() completed but FirebaseApp.app() is nil")
        }

        return true
    }

    func applicationWillResignActive(_ application: UIApplication) {
    }

    func applicationDidEnterBackground(_ application: UIApplication) {
    }

    func applicationWillEnterForeground(_ application: UIApplication) {
    }

    func applicationDidBecomeActive(_ application: UIApplication) {
    }

    func applicationWillTerminate(_ application: UIApplication) {
    }

    func application(_ app: UIApplication, open url: URL, options: [UIApplication.OpenURLOptionsKey: Any] = [:]) -> Bool {
        return ApplicationDelegateProxy.shared.application(app, open: url, options: options)
    }

    func application(_ application: UIApplication, continue userActivity: NSUserActivity, restorationHandler: @escaping ([UIUserActivityRestoring]?) -> Void) -> Bool {
        return ApplicationDelegateProxy.shared.application(application, continue: userActivity, restorationHandler: restorationHandler)
    }

    func application(_ application: UIApplication, didRegisterForRemoteNotificationsWithDeviceToken deviceToken: Data) {
        let tokenPreview = deviceToken.map { String(format: "%02.2hhx", $0) }.joined().prefix(16)
        print("[SpotDrop] APNs device token registered (\(tokenPreview)…)")
        NotificationCenter.default.post(name: .capacitorDidRegisterForRemoteNotifications, object: deviceToken)
    }

    func application(_ application: UIApplication, didFailToRegisterForRemoteNotificationsWithError error: Error) {
        print("[SpotDrop] APNs registration failed: \(error.localizedDescription)")
        NotificationCenter.default.post(name: .capacitorDidFailToRegisterForRemoteNotifications, object: error)
    }

}
