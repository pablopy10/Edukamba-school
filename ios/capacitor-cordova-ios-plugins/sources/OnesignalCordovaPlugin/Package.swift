// swift-tools-version: 5.9

import PackageDescription

let package = Package(
    name: "OnesignalCordovaPlugin",
    platforms: [.iOS(.v15)],
    products: [
        .library(
            name: "OnesignalCordovaPlugin",
            targets: ["OnesignalCordovaPlugin"]
        )
    ],
    dependencies: [
        .package(url: "https://github.com/ionic-team/capacitor-swift-pm.git", from: "8.3.3"),
        .package(url: "https://github.com/OneSignal/OneSignal-iOS-SDK.git", from: "5.0.0")
    ],
    targets: [
        .target(
            name: "OnesignalCordovaPlugin",
            dependencies: [
                .product(name: "Cordova", package: "capacitor-swift-pm"),
                .product(name: "OneSignalFramework", package: "OneSignal-iOS-SDK")
            ],
            path: ".",
            publicHeadersPath: "."
        )
    ]
)