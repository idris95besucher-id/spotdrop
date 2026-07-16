import Capacitor
import CoreLocation
import Foundation

/**
 * Background live-location sharing for SpotDrop chats. `@capacitor/geolocation` explicitly
 * does not support background tracking (see its own README) — this plugin exists specifically
 * to fill that gap: it configures CLLocationManager for background updates
 * (allowsBackgroundLocationUpdates + pausesLocationUpdatesAutomatically = false) and requests
 * "Always" authorization via the standard two-step dance (when-in-use first, then Always),
 * which is what Apple requires before a background-location entitlement will actually work.
 *
 * Requires in Info.plist: NSLocationAlwaysAndWhenInUseUsageDescription, and
 * UIBackgroundModes containing "location" (both already added to ios/App/App/Info.plist).
 */
@objc(SpotDropLocationPlugin)
public class SpotDropLocationPlugin: CAPPlugin, CAPBridgedPlugin, CLLocationManagerDelegate {
    public let identifier = "SpotDropLocationPlugin"
    public let jsName = "SpotDropLocation"
    public let pluginMethods: [CAPPluginMethod] = [
        .init(name: "requestAlwaysPermission", returnType: CAPPluginReturnPromise),
        .init(name: "checkStatus", returnType: CAPPluginReturnPromise),
        .init(name: "startSharing", returnType: CAPPluginReturnPromise),
        .init(name: "stopSharing", returnType: CAPPluginReturnPromise)
    ]

    private let locationManager = CLLocationManager()
    private var minEmitIntervalSeconds: TimeInterval = 15
    private var lastEmittedAt: Date?
    private var pendingPermissionCall: CAPPluginCall?
    private var isSharing = false

    override public func load() {
        locationManager.delegate = self
        locationManager.desiredAccuracy = kCLLocationAccuracyBest
        locationManager.pausesLocationUpdatesAutomatically = false
        locationManager.activityType = .other
    }

    // MARK: - Permission

    @objc func requestAlwaysPermission(_ call: CAPPluginCall) {
        switch locationManager.authorizationStatus {
        case .authorizedAlways:
            call.resolve(["granted": true])
        case .notDetermined:
            pendingPermissionCall = call
            locationManager.requestWhenInUseAuthorization()
        case .authorizedWhenInUse:
            // Apple requires this to happen as a *separate* user-initiated step after
            // When-In-Use is already granted — you cannot jump straight to Always.
            pendingPermissionCall = call
            locationManager.requestAlwaysAuthorization()
        case .denied, .restricted:
            call.resolve(["granted": false])
        @unknown default:
            call.resolve(["granted": false])
        }
    }

    @objc func checkStatus(_ call: CAPPluginCall) {
        call.resolve(["status": authorizationStatusString(locationManager.authorizationStatus)])
    }

    public func locationManagerDidChangeAuthorization(_ manager: CLLocationManager) {
        guard let call = pendingPermissionCall else {
            return
        }

        switch manager.authorizationStatus {
        case .authorizedWhenInUse:
            // First half of the two-step dance just completed — immediately request Always.
            manager.requestAlwaysAuthorization()
        case .authorizedAlways:
            pendingPermissionCall = nil
            call.resolve(["granted": true])
        case .denied, .restricted:
            pendingPermissionCall = nil
            call.resolve(["granted": false])
        case .notDetermined:
            break
        @unknown default:
            pendingPermissionCall = nil
            call.resolve(["granted": false])
        }
    }

    private func authorizationStatusString(_ status: CLAuthorizationStatus) -> String {
        switch status {
        case .authorizedAlways: return "always"
        case .authorizedWhenInUse: return "whenInUse"
        case .denied: return "denied"
        case .restricted: return "restricted"
        case .notDetermined: return "notDetermined"
        @unknown default: return "unknown"
        }
    }

    // MARK: - Sharing

    @objc func startSharing(_ call: CAPPluginCall) {
        let intervalSeconds = call.getDouble("intervalSeconds") ?? 15
        minEmitIntervalSeconds = max(5, intervalSeconds)
        lastEmittedAt = nil

        let status = locationManager.authorizationStatus

        guard status == .authorizedAlways || status == .authorizedWhenInUse else {
            call.reject("Location permission not granted. Call requestAlwaysPermission() first.")
            return
        }

        // Background updates only actually keep running with Always authorization — with only
        // When-In-Use, iOS suspends delivery once the app backgrounds, which is expected and
        // matches the permission the user actually granted.
        locationManager.allowsBackgroundLocationUpdates = (status == .authorizedAlways)
        locationManager.distanceFilter = 10
        locationManager.startUpdatingLocation()
        isSharing = true
        call.resolve(["started": true])
    }

    @objc func stopSharing(_ call: CAPPluginCall) {
        locationManager.stopUpdatingLocation()
        locationManager.allowsBackgroundLocationUpdates = false
        isSharing = false
        call.resolve()
    }

    // MARK: - CLLocationManagerDelegate

    public func locationManager(_ manager: CLLocationManager, didUpdateLocations locations: [CLLocation]) {
        guard isSharing, let location = locations.last else {
            return
        }

        if let lastEmittedAt = lastEmittedAt, Date().timeIntervalSince(lastEmittedAt) < minEmitIntervalSeconds {
            return
        }

        lastEmittedAt = Date()

        notifyListeners("locationUpdate", data: [
            "latitude": location.coordinate.latitude,
            "longitude": location.coordinate.longitude,
            "accuracy": location.horizontalAccuracy,
            "timestamp": location.timestamp.timeIntervalSince1970 * 1000
        ])
    }

    public func locationManager(_ manager: CLLocationManager, didFailWithError error: Error) {
        notifyListeners("locationError", data: ["message": error.localizedDescription])
    }
}
