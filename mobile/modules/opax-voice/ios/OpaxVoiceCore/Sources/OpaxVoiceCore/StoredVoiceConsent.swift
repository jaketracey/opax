import Foundation

/// Consent is separate from credentials. Only an explicit UI choice persists a
/// grant; a fresh install, missing value or malformed value is denied.
public actor StoredVoiceConsent: VoiceConsent {
    public static let key = "opax.voice.consent.v1"
    private let defaults: UserDefaults
    public init(suiteName: String? = nil) {
        defaults = suiteName.flatMap(UserDefaults.init(suiteName:)) ?? .standard
    }
    public func isGranted() -> Bool { defaults.object(forKey: Self.key) as? Bool ?? false }
    public func setGranted(_ granted: Bool) { defaults.set(granted, forKey: Self.key) }
}
