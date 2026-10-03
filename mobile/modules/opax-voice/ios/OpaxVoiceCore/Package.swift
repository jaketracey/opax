// swift-tools-version: 6.0
import PackageDescription
let package = Package(
    name: "OpaxVoiceCore",
    platforms: [.iOS("18.4"), .macOS(.v14)],
    products: [.library(name: "OpaxVoiceCore", targets: ["OpaxVoiceCore"])],
    targets: [.target(name: "OpaxVoiceCore"), .testTarget(name: "OpaxVoiceCoreTests", dependencies: ["OpaxVoiceCore"], resources: [.process("Fixtures")])],
    swiftLanguageModes: [.v6]
)
