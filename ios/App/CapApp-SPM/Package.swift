// swift-tools-version: 5.9
import PackageDescription

// DO NOT MODIFY THIS FILE - managed by Capacitor CLI commands
let package = Package(
    name: "CapApp-SPM",
    platforms: [.iOS(.v15)],
    products: [
        .library(
            name: "CapApp-SPM",
            targets: ["CapApp-SPM"])
    ],
    dependencies: [
        .package(url: "https://github.com/ionic-team/capacitor-swift-pm.git", exact: "8.4.0"),
        .package(name: "CapacitorFirebaseMessaging", path: "../../../node_modules/@capacitor-firebase/messaging"),
        .package(name: "CapacitorApp", path: "../../../node_modules/@capacitor/app"),
        .package(name: "CapacitorCamera", path: "../../../node_modules/@capacitor/camera"),
        .package(name: "CapacitorGeolocation", path: "../../../node_modules/@capacitor/geolocation"),
        .package(name: "CapacitorKeyboard", path: "../../../node_modules/@capacitor/keyboard"),
        .package(name: "CapacitorPushNotifications", path: "../../../node_modules/@capacitor/push-notifications"),
        .package(name: "SpotDropPano", path: "../../../packages/spotdrop-pano"),
        .package(name: "SpotDropCamera", path: "../../../packages/spotdrop-camera"),
        .package(name: "CapacitorShare", path: "../../../node_modules/@capacitor/share"),
        .package(name: "CapawesomeCapacitorBadge", path: "../../../node_modules/@capawesome/capacitor-badge")
    ],
    targets: [
        .target(
            name: "CapApp-SPM",
            dependencies: [
                .product(name: "Capacitor", package: "capacitor-swift-pm"),
                .product(name: "Cordova", package: "capacitor-swift-pm"),
                .product(name: "CapacitorFirebaseMessaging", package: "CapacitorFirebaseMessaging"),
                .product(name: "CapacitorApp", package: "CapacitorApp"),
                .product(name: "CapacitorCamera", package: "CapacitorCamera"),
                .product(name: "CapacitorGeolocation", package: "CapacitorGeolocation"),
                .product(name: "CapacitorKeyboard", package: "CapacitorKeyboard"),
                .product(name: "CapacitorPushNotifications", package: "CapacitorPushNotifications"),
                .product(name: "SpotDropPano", package: "SpotDropPano"),
                .product(name: "SpotDropCamera", package: "SpotDropCamera"),
                .product(name: "CapacitorShare", package: "CapacitorShare"),
                .product(name: "CapawesomeCapacitorBadge", package: "CapawesomeCapacitorBadge")
            ]
        )
    ]
)
