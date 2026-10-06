import Foundation

public enum CallState: String, Sendable, Codable, CaseIterable {
    case idle, checking, unavailable, ready, reserving, connecting, live, ending, ended, failed
}
public enum CallMode: String, Sendable, Codable { case listening, speaking, muted }
public enum PlaybackState: String, Sendable, Codable { case flowing, buffering, truncated }
public enum VoiceFailure: String, Error, Sendable, Codable {
    case signedOut, disabled, allowanceExhausted, budgetClosed, capacity, rateLimited, callOpen
    case forbidden, unavailable, network, policy, unsupportedFormat, audio, queueOverflow
    case microphoneDenied, consentRequired, timeout, invalidResponse, cancelled, statusChecking, deletionVerificationFailed
}
public enum EndReason: String, Sendable, Codable {
    case user, interruption, background, mediaReset, provider, deadline, network, consentWithdrawn
    case allowanceExhausted, budgetClosed, callLimit, failed
}
public struct TranscriptTurn: Sendable, Codable, Equatable {
    public enum Role: String, Sendable, Codable { case user, agent }
    public let role: Role
    public let id: Int
    public var text: String
}
public struct VoiceSource: Sendable, Codable, Equatable {
    public let title: String
    /// A validated OPAX record path, never a signed URL.
    public let path: String
}
/// The only surface an Expo bridge should forward. Contains neither audio nor credentials.
public enum VoiceEvent: Sendable, Equatable {
    case state(CallState, reason: EndReason?)
    case mode(CallMode)
    case playback(PlaybackState)
    case transcript([TranscriptTurn])
    case sources([VoiceSource])
    case remainingTime(Int)
    case error(VoiceFailure)
    case status(VoiceStatusSnapshot?)
}
/// Atomic read model for a screen that missed events while unmounted.
/// No reservation, audio, credential or raw response is exposed.
public struct VoiceSnapshot: Sendable, Equatable {
    public let state: CallState
    public let reason: EndReason?
    public let mode: CallMode?
    public let playback: PlaybackState
    public let remaining: Int
    public let transcript: [TranscriptTurn]
    public let sources: [VoiceSource]
    public let status: VoiceStatusSnapshot?
}
public struct ActiveSession: Sendable, Decodable, Equatable {
    public enum State: Sendable, Codable, Equatable {
        case reserved, connecting, active, unknown(String)
        public init(from decoder: any Decoder) throws {
            let raw = try decoder.singleValueContainer().decode(String.self)
            switch raw { case "reserved": self = .reserved; case "connecting": self = .connecting
            case "active": self = .active; default: self = .unknown(raw) }
        }
        public func encode(to encoder: any Encoder) throws {
            var container = encoder.singleValueContainer()
            switch self { case .reserved: try container.encode("reserved"); case .connecting: try container.encode("connecting")
            case .active: try container.encode("active"); case .unknown(let raw): try container.encode(raw) }
        }
    }
    let id: String?
    public let state: State
    public let expiresAt: TimeInterval?
    enum CodingKeys: String, CodingKey { case id, state; case expiresAt = "expires_at" }
}
public struct VoiceStatus: Sendable, Decodable, Equatable {
    public let enabled: Bool
    public let signedIn: Bool
    public let unlimited: Bool?
    public let totalSeconds: Int?
    public let remainingSeconds: Int
    public let activeSession: ActiveSession?
    public let budgetOpen: Bool?
    /// Set by the client, never decoded: this iPhone holds an account session
    /// the server has not revoked. Voice can refuse a member (a disabled one)
    /// whose account can still be signed out and deleted.
    public internal(set) var accountHeld = false
    enum CodingKeys: String, CodingKey {
        case enabled, unlimited; case signedIn = "signed_in", totalSeconds = "total_seconds"
        case remainingSeconds = "remaining_seconds", activeSession = "active_session", budgetOpen = "budget_open"
    }
    public var bridgeValue: VoiceStatusSnapshot { VoiceStatusSnapshot(self) }
    public var refusal: VoiceFailure? { bridgeValue.refusal }
}
/// Bridge/read-model status deliberately has no session ID or signed URL.
public struct VoiceStatusSnapshot: Sendable, Codable, Equatable {
    public struct OpenSession: Sendable, Codable, Equatable {
        public let state: ActiveSession.State
        public let expiresAt: TimeInterval?
    }
    public let enabled: Bool
    public let signedIn: Bool
    public let unlimited: Bool?
    public let totalSeconds: Int?
    public let remainingSeconds: Int
    public let activeSession: OpenSession?
    public let budgetOpen: Bool?
    /// Sign-out and deletion stay available while true, whatever voice allows.
    public let accountHeld: Bool
    init(_ status: VoiceStatus) {
        enabled = status.enabled; signedIn = status.signedIn; unlimited = status.unlimited
        totalSeconds = status.totalSeconds; remainingSeconds = status.remainingSeconds; budgetOpen = status.budgetOpen
        accountHeld = status.accountHeld
        activeSession = status.activeSession.map { OpenSession(state: $0.state, expiresAt: $0.expiresAt) }
    }
    public var refusal: VoiceFailure? {
        if !enabled { return .disabled }
        if !signedIn { return .signedOut }
        if activeSession != nil { return .callOpen }
        if unlimited != true && remainingSeconds <= 0 { return .allowanceExhausted }
        if budgetOpen == false { return .budgetClosed }
        return nil
    }
}
public struct CodeChallenge: Sendable, Codable { public let sent: Bool; public let challengeID: String
    enum CodingKeys: String, CodingKey { case sent; case challengeID = "challenge_id" }
}
public struct CommunityStatus: Sendable, Decodable {
    public struct Member: Sendable, Decodable { public let id: String }
    public let enabled: Bool
    public let member: Member?
    public let canDeleteAccount: Bool?
    enum CodingKeys: String, CodingKey { case enabled, member; case canDeleteAccount = "can_delete_account" }
}
public struct DeletionChallenge: Sendable, Decodable {
    public let sent: Bool
    public let challengeID: String
    enum CodingKeys: String, CodingKey { case sent; case challengeID = "challenge_id" }
}
public struct AccountDeletion: Sendable, Decodable {
    public let deleted: Bool
    public let signedOut: Bool
    enum CodingKeys: String, CodingKey { case deleted; case signedOut = "signed_out" }
}
struct Reservation: Sendable, Decodable, CustomStringConvertible, CustomDebugStringConvertible {
    let sessionID: String
    let transport: String
    let signedURL: URL
    let remainingSeconds: Int
    let expiresAt: TimeInterval
    enum CodingKeys: String, CodingKey { case transport; case sessionID = "session_id", signedURL = "signed_url"
        case remainingSeconds = "remaining_seconds", expiresAt = "expires_at" }
    var description: String { "Reservation([redacted])" }
    var debugDescription: String { description }
}
public protocol VoiceClock: Sendable {
    func now() async -> Date
    func sleep(seconds: Double) async throws
}
public struct SystemVoiceClock: VoiceClock {
    public init() {}
    public func now() async -> Date { Date() }
    public func sleep(seconds: Double) async throws { try await Task.sleep(for: .seconds(max(0, seconds))) }
}
public protocol MicrophonePermission: Sendable { func request() async -> Bool }
public protocol VoiceConsent: Sendable { func isGranted() async -> Bool }
public protocol VoiceAudioSession: Sendable {
    func activate() async throws
    func deactivate() async
    func keepAwake(_ enabled: Bool) async
}
public enum LifecycleEvent: Sendable {
    case interruptionBegan, interruptionEnded, becameInactive, resumptionRecommended
    case background, foreground, sceneInactive, configurationChanged, mediaServicesReset
}
public protocol VoiceLifecycle: Sendable { var events: AsyncStream<LifecycleEvent> { get } }
