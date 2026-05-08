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
    targets: [
        .target(
            name: "OnesignalCordovaPlugin",
            path: ".",
            sources: ["OnesignalCordovaPlugin.swift"],
            publicHeadersPath: "."
        )
    ]
)
