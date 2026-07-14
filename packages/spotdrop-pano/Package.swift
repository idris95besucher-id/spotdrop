// swift-tools-version: 5.9
import PackageDescription

let package = Package(
    name: "SpotDropPano",
    platforms: [.iOS(.v15)],
    products: [
        .library(
            name: "SpotDropPano",
            targets: ["SpotDropPanoPlugin"]
        )
    ],
    dependencies: [
        .package(url: "https://github.com/ionic-team/capacitor-swift-pm.git", from: "8.0.0"),
        .package(url: "https://github.com/yeatse/opencv-spm.git", from: "5.0.0")
    ],
    targets: [
        .target(
            name: "SpotDropPanoOpenCV",
            dependencies: [
                .product(name: "OpenCV", package: "opencv-spm")
            ],
            path: "ios/Sources/SpotDropPanoOpenCV",
            publicHeadersPath: "include",
            linkerSettings: [
                .linkedLibrary("c++")
            ]
        ),
        .target(
            name: "SpotDropPanoPlugin",
            dependencies: [
                .product(name: "Capacitor", package: "capacitor-swift-pm"),
                .product(name: "Cordova", package: "capacitor-swift-pm"),
                "SpotDropPanoOpenCV"
            ],
            path: "ios/Sources/SpotDropPanoPlugin"
        )
    ]
)
