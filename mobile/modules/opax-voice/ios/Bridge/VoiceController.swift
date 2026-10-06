import Foundation
import OpaxVoiceCore

// Consent starts false in every build. Only an explicit UI choice writes it.
private struct BridgeConsent: VoiceConsent {
    let store = StoredVoiceConsent()
    func isGranted() async -> Bool { await store.isGranted() }
}
private struct ReleaseGatedMicrophonePermission: MicrophonePermission {
    func request() async -> Bool {
        // Only the production switch embeds the purpose string. Development
        // never requests hardware permission; e2e uses the debug permission.
        #if OPAX_VOICE_PRODUCTION
        guard Bundle.main.object(forInfoDictionaryKey: "OPAXProductionVoiceEnabled") as? Bool == true,
              let purpose = Bundle.main.object(forInfoDictionaryKey: "NSMicrophoneUsageDescription") as? String,
              !purpose.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else { return false }
        return await AppleMicrophonePermission().request()
        #else
        return false
        #endif
    }
}

/// Exactly one core and authenticated client per Expo module instance.
actor VoiceController {
    let call: VoiceCallController
    private let http: VoiceHTTPClient
    private let consentSource = BridgeConsent()
    init() {
        let policy: RoutePolicy
        let engines: any VoiceEngineFactory
        let permission: any MicrophonePermission
        let audioSession: any VoiceAudioSession
        let store: any CredentialStore
        #if OPAX_VOICE_E2E && targetEnvironment(simulator)
        let port = Bundle.main.object(forInfoDictionaryKey: "OPAXVoiceFixturePort") as? Int ?? 0
        // A missing/mismatched CNG config cannot fall back to production.
        precondition((8900...8999).contains(port), "Missing e2e voice configuration")
        policy = .loopback(port: UInt16(port))
        engines = DebugSyntheticEngineFactory()
        permission = DebugMicrophonePermission()
        audioSession = DebugSilentAudioSession()
        store = InMemoryCredentialStore()
        #else
        #if OPAX_VOICE_PRODUCTION
        // CNG metadata and compiled native routes must agree before any I/O.
        precondition(RoutePolicy.productionConfigurationMatches(Bundle.main.infoDictionary ?? [:]),
                     "Invalid production voice configuration")
        #endif
        policy = RoutePolicy()
        engines = AppleVoiceEngineFactory()
        permission = ReleaseGatedMicrophonePermission()
        audioSession = AppleVoiceAudioSession()
        store = KeychainCredentialStore(policy: policy)
        #endif
        let transport = AuthenticatedURLSession(policy: policy)
        let http = VoiceHTTPClient(policy: policy, store: store, transport: transport)
        self.http = http
        call = VoiceCallController(http: http, relays: URLSessionRelayFactory(session: transport, policy: policy),
            engines: engines, permission: permission, consent: consentSource,
            audioSession: audioSession, lifecycle: AppleVoiceLifecycle())
    }
    func consent() async -> Bool { await consentSource.store.isGranted() }
    func setConsent(_ granted: Bool) async {
        await consentSource.store.setGranted(granted)
        if !granted { await call.withdrawConsent() }
    }
    func snapshot() async -> [String: Any] { VoiceBridgeValue.success(VoiceBridgeValue.snapshot(await call.snapshot())) }
    func status() async -> [String: Any] {
        do { return VoiceBridgeValue.success(VoiceBridgeValue.status(try await call.refreshStatus())) }
        catch { return VoiceBridgeValue.failure(error) }
    }
    func requestCode(_ email: String) async -> [String: Any] {
        do {
            let result = try await http.requestCode(email: email)
            return VoiceBridgeValue.success(["sent": result.sent, "challengeId": result.challengeID])
        } catch { return VoiceBridgeValue.failure(error) }
    }
    func consumeCode(_ challenge: String, _ code: String) async -> [String: Any] {
        do {
            try await http.consumeCode(challengeID: challenge, code: code)
            return await status()
        } catch { return VoiceBridgeValue.failure(error) }
    }
    func sendText(_ text: String) async -> [String: Any] {
        do { try await call.sendText(text); return VoiceBridgeValue.success() }
        catch { return VoiceBridgeValue.failure(error) }
    }
    func discardEvidence() async { await call.discardEvidence() }
    func background() async { await call.handle(.background) }
    func start() async -> [String: Any] { await call.start(); return VoiceBridgeValue.success() }
    func mute(_ muted: Bool) async -> [String: Any] { await call.setMuted(muted); return VoiceBridgeValue.success() }
    func end() async -> [String: Any] { await call.end(); return VoiceBridgeValue.success() }
    func logout() async -> [String: Any] {
        do { try await call.logout(); return VoiceBridgeValue.success() }
        catch { return VoiceBridgeValue.failure(error) }
    }
    func requestDeletionCode() async -> [String: Any] {
        do {
            let value = try await call.requestDeletionCode()
            return VoiceBridgeValue.success(["sent": value.sent, "challengeId": value.challengeID])
        } catch { return VoiceBridgeValue.failure(error) }
    }
    func deleteAccount(_ challenge: String, _ code: String) async -> [String: Any] {
        do {
            let value = try await call.deleteAccount(challengeID: challenge, code: code)
            return VoiceBridgeValue.success(["deleted": value.deleted, "signedOut": value.signedOut])
        } catch { return VoiceBridgeValue.failure(error) }
    }
    func shutdown() async { await call.shutdown() }
}
