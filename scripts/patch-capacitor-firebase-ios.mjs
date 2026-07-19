/**
 * Guards @capacitor-firebase/messaging against missing GoogleService-Info.plist.
 * Re-applied on npm install so `FirebaseApp.configure()` never fatalErrors at launch.
 *
 * Skipped on Vercel — Swift patches are only needed for local/Xcode iOS builds.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { isVercelEnvironment } from "./iosCapacitorEnv.mjs";

if (isVercelEnvironment()) {
  console.log("[patch-capacitor-firebase-ios] Skipping on Vercel.");
  process.exit(0);
}

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const messagingSwift = path.join(
  root,
  "node_modules/@capacitor-firebase/messaging/ios/Plugin/FirebaseMessaging.swift"
);
const pluginSwift = path.join(
  root,
  "node_modules/@capacitor-firebase/messaging/ios/Plugin/FirebaseMessagingPlugin.swift"
);

if (!fs.existsSync(messagingSwift)) {
  console.log("[patch-capacitor-firebase-ios] @capacitor-firebase/messaging not installed; skipping.");
  process.exit(0);
}

let messaging = fs.readFileSync(messagingSwift, "utf8");

if (!messaging.includes("isGoogleServiceInfoAvailable()")) {
  messaging = messaging.replace(
    `@objc public class FirebaseMessaging: NSObject, NotificationHandlerProtocol {
    private let plugin: FirebaseMessagingPlugin
    private let config: FirebaseMessagingConfig

    init(plugin: FirebaseMessagingPlugin, config: FirebaseMessagingConfig) {
        self.plugin = plugin
        self.config = config
        super.init()
        if FirebaseApp.app() == nil {
            FirebaseApp.configure()
        }
        UIApplication.shared.registerForRemoteNotifications()
        Messaging.messaging().delegate = self
        self.plugin.bridge?.notificationRouter.pushNotificationHandler = self
    }`,
    `@objc public class FirebaseMessaging: NSObject, NotificationHandlerProtocol {
    private let plugin: FirebaseMessagingPlugin
    private let config: FirebaseMessagingConfig
    private let isEnabled: Bool

    init(plugin: FirebaseMessagingPlugin, config: FirebaseMessagingConfig) {
        self.plugin = plugin
        self.config = config
        self.isEnabled = FirebaseMessaging.isGoogleServiceInfoAvailable()
        super.init()

        guard isEnabled else {
            CAPLog.print("[FirebaseMessaging] GoogleService-Info.plist missing or invalid — Firebase push disabled.")
            return
        }

        if FirebaseApp.app() == nil {
            FirebaseApp.configure()
        }
        UIApplication.shared.registerForRemoteNotifications()
        Messaging.messaging().delegate = self
        self.plugin.bridge?.notificationRouter.pushNotificationHandler = self
    }

    private static func isGoogleServiceInfoAvailable() -> Bool {
        guard let path = Bundle.main.path(forResource: "GoogleService-Info", ofType: "plist"),
              let plist = NSDictionary(contentsOfFile: path) as? [String: Any],
              let appId = plist["GOOGLE_APP_ID"] as? String,
              !appId.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else {
            return false
        }

        return true
    }

    private func disabledError() -> NSError {
        NSError(
            domain: "FirebaseMessaging",
            code: 1,
            userInfo: [NSLocalizedDescriptionKey: "Firebase is not configured (GoogleService-Info.plist missing)."]
        )
    }`
  );

  messaging = messaging.replace(
    `    public func getToken(completion: @escaping (String?, Error?) -> Void) {
        Messaging.messaging().isAutoInitEnabled = true`,
    `    public func getToken(completion: @escaping (String?, Error?) -> Void) {
        guard isEnabled else {
            completion(nil, disabledError())
            return
        }

        Messaging.messaging().isAutoInitEnabled = true`
  );

  messaging = messaging.replace(
    `    public func deleteToken(completion: @escaping (Error?) -> Void) {
        Messaging.messaging().deleteToken(completion: { error in`,
    `    public func deleteToken(completion: @escaping (Error?) -> Void) {
        guard isEnabled else {
            completion(disabledError())
            return
        }

        Messaging.messaging().deleteToken(completion: { error in`
  );

  messaging = messaging.replace(
    `    public func subscribeToTopic(topic: String, completion: @escaping (Error?) -> Void) {
        Messaging.messaging().subscribe(toTopic: topic) { error in`,
    `    public func subscribeToTopic(topic: String, completion: @escaping (Error?) -> Void) {
        guard isEnabled else {
            completion(disabledError())
            return
        }

        Messaging.messaging().subscribe(toTopic: topic) { error in`
  );

  messaging = messaging.replace(
    `    public func unsubscribeFromTopic(topic: String, completion: @escaping (Error?) -> Void) {
        Messaging.messaging().unsubscribe(fromTopic: topic, completion: { error in`,
    `    public func unsubscribeFromTopic(topic: String, completion: @escaping (Error?) -> Void) {
        guard isEnabled else {
            completion(disabledError())
            return
        }

        Messaging.messaging().unsubscribe(fromTopic: topic, completion: { error in`
  );

  messaging = messaging.replace(
    `    public func handleRemoteNotificationReceived(notification: NSNotification) {
        if let userInfo = notification.userInfo {
            Messaging.messaging().appDidReceiveMessage(userInfo)
        }`,
    `    public func handleRemoteNotificationReceived(notification: NSNotification) {
        guard isEnabled else {
            return
        }

        if let userInfo = notification.userInfo {
            Messaging.messaging().appDidReceiveMessage(userInfo)
        }`
  );

  fs.writeFileSync(messagingSwift, messaging);
  console.log("[patch-capacitor-firebase-ios] Patched FirebaseMessaging.swift");
} else {
  console.log("[patch-capacitor-firebase-ios] FirebaseMessaging.swift already patched.");
}

let plugin = fs.readFileSync(pluginSwift, "utf8");

if (!plugin.includes("guard FirebaseApp.app() != nil else")) {
  plugin = plugin.replace(
    `    @objc private func didRegisterForRemoteNotifications(notification: NSNotification) {
        guard let deviceToken = notification.object as? Data else {
            return
        }
        Messaging.messaging().apnsToken = deviceToken`,
    `    @objc private func didRegisterForRemoteNotifications(notification: NSNotification) {
        guard FirebaseApp.app() != nil else {
            return
        }

        guard let deviceToken = notification.object as? Data else {
            return
        }
        Messaging.messaging().apnsToken = deviceToken`
  );

  fs.writeFileSync(pluginSwift, plugin);
  console.log("[patch-capacitor-firebase-ios] Patched FirebaseMessagingPlugin.swift");
} else {
  console.log("[patch-capacitor-firebase-ios] FirebaseMessagingPlugin.swift already patched.");
}
