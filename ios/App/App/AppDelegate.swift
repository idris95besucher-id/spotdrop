import UIKit
import Capacitor
import FirebaseCore
import os.log

@UIApplicationMain
class AppDelegate: UIResponder, UIApplicationDelegate {

    var window: UIWindow?
    private static let log = Logger(subsystem: "com.spotdrop.app", category: "Firebase")

    private func isGoogleServiceInfoAvailable() -> Bool {
        guard let path = Bundle.main.path(forResource: "GoogleService-Info", ofType: "plist"),
              let plist = NSDictionary(contentsOfFile: path) as? [String: Any],
              let appId = plist["GOOGLE_APP_ID"] as? String,
              !appId.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else {
            return false
        }

        return true
    }

    func application(_ application: UIApplication, didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]?) -> Bool {
        // Drop stale live-reload snapshot paths so the bundled `public/` folder is always used.
        KeyValueStore.standard["serverBasePath"] = nil as String?

        guard isGoogleServiceInfoAvailable() else {
            AppDelegate.log.warning("GoogleService-Info.plist missing or invalid — Firebase push disabled; app will run without FCM.")
            print("[SpotDrop] GoogleService-Info.plist missing or invalid — Firebase push disabled.")
            return true
        }

        if FirebaseApp.app() == nil {
            FirebaseApp.configure()
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
        NotificationCenter.default.post(name: .capacitorDidRegisterForRemoteNotifications, object: deviceToken)
    }

    func application(_ application: UIApplication, didFailToRegisterForRemoteNotificationsWithError error: Error) {
        NotificationCenter.default.post(name: .capacitorDidFailToRegisterForRemoteNotifications, object: error)
    }

}
