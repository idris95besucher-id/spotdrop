import UIKit
import Capacitor
import FirebaseCore
#if canImport(FirebaseMessaging)
import FirebaseMessaging
#endif
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

    private func hexTokenPreview(_ deviceToken: Data, bytes: Int = 16) -> String {
        let hex = deviceToken.map { String(format: "%02.2hhx", $0) }.joined()
        let prefix = String(hex.prefix(bytes * 2))
        return "\(prefix)…(bytes=\(deviceToken.count))"
    }

    func application(_ application: UIApplication, didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]?) -> Bool {
        // Drop stale live-reload snapshot paths so the bundled `public/` folder is always used.
        KeyValueStore.standard["serverBasePath"] = nil as String?

        print("[Push][step native-0] AppDelegate didFinishLaunching")

        if let path = googleServiceInfoPath() {
            print("[Push][step native-0] GoogleService-Info.plist path: \(path)")
        } else {
            AppDelegate.log.warning("GoogleService-Info.plist not found in app bundle — add it to Copy Bundle Resources.")
            print("[Push][step native-0] FAIL GoogleService-Info.plist missing from app bundle")
            return true
        }

        guard isGoogleServiceInfoAvailable() else {
            AppDelegate.log.warning("GoogleService-Info.plist invalid or still contains placeholders — Firebase push disabled.")
            print("[Push][step native-0] FAIL GoogleService-Info.plist invalid or placeholder")
            return true
        }

        if FirebaseApp.app() == nil {
            FirebaseApp.configure()
            print("[Push][step native-0] FirebaseApp.configure() called")
        } else {
            print("[Push][step native-0] FirebaseApp already configured")
        }

        if let app = FirebaseApp.app() {
            let projectId = app.options.projectID ?? "unknown"
            let googleAppId = app.options.googleAppID
            AppDelegate.log.info("Firebase configured project=\(projectId, privacy: .public) appId=\(googleAppId, privacy: .public)")
            print("[Push][step native-0] Firebase OK project=\(projectId) appId=\(googleAppId)")
        } else {
            print("[Push][step native-0] FAIL FirebaseApp.app() is nil after configure")
        }

        #if canImport(FirebaseMessaging)
        print("[Push][step native-0] FirebaseMessaging module available (canImport=true)")
        #else
        print("[Push][step native-0] FAIL FirebaseMessaging module NOT importable — apnsToken will not be set in AppDelegate")
        #endif

        return true
    }

    func applicationWillResignActive(_ application: UIApplication) {
    }

    func applicationDidEnterBackground(_ application: UIApplication) {
    }

    func applicationWillEnterForeground(_ application: UIApplication) {
    }

    func applicationDidBecomeActive(_ application: UIApplication) {
        print("[Push][step native-2] applicationDidBecomeActive isRegisteredForRemoteNotifications=\(application.isRegisteredForRemoteNotifications)")
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
        let preview = hexTokenPreview(deviceToken)
        print("[Push][step 2] APNs registration callback SUCCESS")
        print("[Push][step 3] APNs device token \(preview)")

        #if canImport(FirebaseMessaging)
        if FirebaseApp.app() != nil {
            Messaging.messaging().apnsToken = deviceToken
            let assigned = Messaging.messaging().apnsToken != nil
            print("[Push][step 4] Messaging.apnsToken assignment OK assigned=\(assigned) preview=\(preview)")
        } else {
            print("[Push][step 4] FAIL FirebaseApp.app() nil — cannot assign Messaging.apnsToken")
        }
        #else
        print("[Push][step 4] FAIL canImport(FirebaseMessaging)=false — skipped Messaging.apnsToken assignment")
        #endif

        print("[Push][step 2] Posting capacitorDidRegisterForRemoteNotifications")
        NotificationCenter.default.post(name: .capacitorDidRegisterForRemoteNotifications, object: deviceToken)
    }

    func application(_ application: UIApplication, didFailToRegisterForRemoteNotificationsWithError error: Error) {
        print("[Push][step 2] FAIL APNs registration callback error=\(error.localizedDescription)")
        print("[Push][step 2] FAIL APNs error detail=\(String(describing: error))")
        NotificationCenter.default.post(name: .capacitorDidFailToRegisterForRemoteNotifications, object: error)
    }

}
