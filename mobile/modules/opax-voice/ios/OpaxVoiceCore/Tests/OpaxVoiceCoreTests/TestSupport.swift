import Foundation
import XCTest
@testable import OpaxVoiceCore

class SafeVoiceTestCase: XCTestCase {
    override func setUp() { super.setUp(); VoiceTestSafety.installLoopbackOnly() }
    override func tearDown() {
        let audit = VoiceTestSafety.cumulativeAudit()
        XCTAssertTrue(audit.isClean, "Unapproved audio-open or host attempt recorded")
        super.tearDown()
    }
}
// One core boundary also protects real URLSession transports; every fake uses it.
enum LoopbackGuard {
    static func validate(_ request: URLRequest) throws { try VoiceTestSafety.validate(request) }
}
func json(_ value: Any) -> Data { try! JSONSerialization.data(withJSONObject: value, options: [.sortedKeys]) }
let fixtureID = "11111111-1111-4111-8111-111111111111"
let fixtureToken = String(repeating: "f", count: 43)
func signedStatus(remaining: Int = 600, active: String? = nil, unlimited: Bool = false,
                  budget: Bool? = nil, signedIn: Bool = true, enabled: Bool = true) -> Data {
    let resource = Bundle.module.url(forResource: "worker-status", withExtension: "json")!
    let root = try! JSONSerialization.jsonObject(with: Data(contentsOf: resource)) as! [String: Any]
    let shapes = root["shapes"] as! [String: [String: Any]]
    let name = !signedIn ? (enabled ? "signedOut" : "disabledSignedOut") : (unlimited ? "unlimited" : (active != nil ? "openSession" : "allowance"))
    var body = shapes[name]!
    body["enabled"] = enabled; body["remaining_seconds"] = remaining
    if let active {
        var open = shapes["openSession"]!["active_session"] as! [String: Any]
        open["state"] = active; open["expires_at"] = Date().timeIntervalSince1970 + 20
        body["active_session"] = open
    }
    if let budget { body["budget_open"] = budget } // approved W8 extension, not present in current Worker

    return json(body)
}
actor FixtureHTTP: HTTPTransport {
    var statusBody = signedStatus()
    var startResponse: HTTPResponse?
    var statusAfterStart: Data?
    var throwOnSend = false
    var responses: [AuthRoute: HTTPResponse] = [:]
    var requests: [URLRequest] = []
    var delayStatus = false
    var statusWaiter: CheckedContinuation<Void, Never>?
    var delayedRoute: AuthRoute?
    var responseWaiter: CheckedContinuation<Void, Never>?
    var sequence = 0
    var delayStart = false
    var startWaiter: CheckedContinuation<Void, Never>?
    let port: UInt16
    init(port: UInt16 = 8901) { self.port = port }
    func configure(status: Data? = nil, start: HTTPResponse? = nil, statusAfterStart: Data? = nil) {
        if let status { statusBody = status }; startResponse = start; self.statusAfterStart = statusAfterStart
    }
    func setResponse(_ route: AuthRoute, _ response: HTTPResponse) { responses[route] = response }
    func pauseResponse(_ route: AuthRoute) { delayedRoute = route }
    func resumeResponse() { responseWaiter?.resume(); responseWaiter = nil; delayedRoute = nil }
    func pauseNextStatus() { delayStatus = true }
    func resumeStatus() { statusWaiter?.resume(); statusWaiter = nil }
    func pauseStart() { delayStart = true }
    func resumeStart() { delayStart = false; startWaiter?.resume(); startWaiter = nil }
    func send(_ request: URLRequest) async throws -> HTTPResponse {
        try Task.checkCancellation()
        try LoopbackGuard.validate(request); requests.append(request)
        if throwOnSend { throw URLError(.notConnectedToInternet) }
        guard let route = request.url.flatMap({ AuthRoute(rawValue: $0.path) }) else { throw VoiceFailure.forbidden }
        if let response = responses[route] {
            if delayedRoute == route { await withCheckedContinuation { responseWaiter = $0 } }
            return response
        }
        switch route {
        case .voiceStatus:
            let body = request.value(forHTTPHeaderField: "Cookie") == nil ? signedStatus(signedIn: false) : statusBody
            if delayStatus { delayStatus = false; await withCheckedContinuation { statusWaiter = $0 } }
            return HTTPResponse(status: 200, body: body)
        case .voiceStart:
            if delayStart { await withCheckedContinuation { startWaiter = $0 } }
            if let startResponse {
                let failure = APIFailure.decode(startResponse, route: .voiceStart).failure
                if let statusAfterStart { statusBody = statusAfterStart }
                if failure == .budgetClosed { statusBody = signedStatus(budget: false) }
                if failure == .callOpen { statusBody = signedStatus(active: "active") }
                return startResponse
            }
            sequence += 1; let id = UUID().uuidString.lowercased()
            return HTTPResponse(status: 201, body: json(["session_id": id, "transport": "websocket",
                "signed_url": "ws://127.0.0.1:\(port)/api/voice/connect?session_id=\(id)",
                "remaining_seconds": 600, "expires_at": Date().timeIntervalSince1970 + 60]))
        case .voiceFinish: return HTTPResponse(status: 200, body: signedStatus(remaining: 1)) // must never supply displayed allowance
        case .communityStatus: return HTTPResponse(status: 200, body: json(["enabled": true, "member": ["id": "fixture"]]))
        case .requestCode: return HTTPResponse(status: 200, body: json(["sent": true, "challenge_id": "fixture-challenge"]))
        case .consumeCode: return HTTPResponse(status: 200, headers: ["Set-Cookie": "__Host-opax_session=\(fixtureToken); Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=2592000"], body: json(["signed_in": true]))
        case .logout: statusBody = signedStatus(signedIn: false); return HTTPResponse(status: 200, body: json(["signed_out": true]))
        case .deletionCode, .deleteAccount: throw VoiceFailure.invalidResponse // explicit Worker fixture required
        case .voiceConnect: throw VoiceFailure.forbidden
        }
    }
    func failTransport() { throwOnSend = true }
    func count(_ route: AuthRoute) -> Int { requests.filter { $0.url?.path == route.rawValue }.count }
}
actor FakeAudioEngine: VoiceAudioEngine, VoiceEngineFactory {
    var captures: [CaptureBuffer] = []
    var played: [[Float]] = []
    var queued = 0, starts = 0, stops = 0, flushes = 0, routes = 0
    var captureWaiter: CheckedContinuation<CaptureBuffer?, Never>?
    var playbackWaiters: [(Int, CheckedContinuation<Void, Never>)] = []
    var maxQueued = 0, captureReads = 0
    var acceptedPlaybackEpoch = 0
    var muted = false
    var failStart = false, failRoute = false
    var meter = AudioLevels.silent
    func make() -> any VoiceAudioEngine { self }
    func levels() -> AudioLevels { meter }
    func setMeter(_ value: AudioLevels) { meter = value }
    func start(input: AudioFormat, output: AudioFormat) throws {
        acceptedPlaybackEpoch = 0
        starts += 1; if failStart { throw VoiceFailure.audio }
    }
    func capture() async -> CaptureBuffer? {
        captureReads += 1
        if !captures.isEmpty { return captures.removeFirst() }
        return await withCheckedContinuation { captureWaiter = $0 }
    }
    func feed(_ capture: CaptureBuffer) {
        if let waiter = captureWaiter { captureWaiter = nil; waiter.resume(returning: capture) }
        else { captures.append(capture) }
    }
    func schedule(_ samples: [Float], rate: Int, playbackEpoch: Int) {
        guard playbackEpoch == acceptedPlaybackEpoch else { return }
        played.append(samples); queued += samples.count; maxQueued = max(maxQueued, queued)
    }
    func waitForPlayback(atMostSamples limit: Int) async {
        if queued > limit { await withCheckedContinuation { playbackWaiters.append((limit, $0)) } }
    }
    private func wakePlayback() {
        let ready = playbackWaiters.filter { queued <= $0.0 }; playbackWaiters.removeAll { queued <= $0.0 }
        ready.forEach { $0.1.resume() }
    }
    func queuedSamples() -> Int { queued }
    func flush(playbackEpoch: Int) { acceptedPlaybackEpoch = max(acceptedPlaybackEpoch, playbackEpoch); flushes += 1; queued = 0; wakePlayback() }
    func drainPlayback() { queued = 0; wakePlayback() }
    func setMuted(_ muted: Bool) { self.muted = muted }
    func reconfigure() throws { routes += 1; if failRoute { throw VoiceFailure.audio }; queued = 0; wakePlayback() }
    func stop() { acceptedPlaybackEpoch += 1; stops += 1; queued = 0; wakePlayback(); captureWaiter?.resume(returning: nil); captureWaiter = nil }
    func fail(start: Bool = false, route: Bool = false) { failStart = start; failRoute = route }
}
actor FakePermission: MicrophonePermission {
    var allowed = true, count = 0, paused = false
    var waiter: CheckedContinuation<Void, Never>?
    func request() async -> Bool { count += 1; if paused { await withCheckedContinuation { waiter = $0 } }; return allowed }
    func set(_ allowed: Bool) { self.allowed = allowed }
    func pause() { paused = true }
    func resume() { paused = false; waiter?.resume(); waiter = nil }
}
actor FakeConsent: VoiceConsent {
    var granted = true
    func isGranted() -> Bool { granted }
    func set(_ value: Bool) { granted = value }
}
actor FakeSession: VoiceAudioSession {
    var activations = 0, deactivations = 0
    var awake = false, fails = false
    func activate() throws { activations += 1; if fails { throw VoiceFailure.audio } }
    func deactivate() { deactivations += 1 }
    func keepAwake(_ enabled: Bool) { awake = enabled }
    func fail() { fails = true }
}
final class FakeLifecycle: VoiceLifecycle, Sendable {
    let events: AsyncStream<LifecycleEvent>
    let continuation: AsyncStream<LifecycleEvent>.Continuation
    init() { let stream = AsyncStream<LifecycleEvent>.makeStream(); events = stream.stream; continuation = stream.continuation }
    func emit(_ event: LifecycleEvent) { continuation.yield(event) }
}
actor InMemoryRelay: RelayTransport, RelayFactory {
    var messages: [Data] = []
    var incoming: [RelayMessage] = []
    var waiter: CheckedContinuation<RelayMessage, any Error>?
    var connects = 0, closes = 0, receives = 0
    var stalledAudio = false
    var audioWaiter: CheckedContinuation<Void, any Error>?
    var connectError: APIFailure?
    var stalledHandshake = false
    var handshakeWaiter: CheckedContinuation<Void, any Error>?
    func connect(_ request: URLRequest) throws -> any RelayTransport {
        try LoopbackGuard.validate(request); connects += 1
        if let connectError { throw connectError }; return self
    }
    func send(_ data: Data) async throws {
        messages.append(data)
        if stalledHandshake, String(data: data, encoding: .utf8)!.contains("conversation_initiation_client_data") {
            try await withCheckedThrowingContinuation { handshakeWaiter = $0 }
        }
        if stalledAudio, String(data: data, encoding: .utf8)!.contains("user_audio_chunk") {
            try await withCheckedThrowingContinuation { audioWaiter = $0 }
        }
    }
    func receive() async throws -> RelayMessage {
        receives += 1
        if !incoming.isEmpty { return incoming.removeFirst() }
        return try await withCheckedThrowingContinuation { waiter = $0 }
    }
    func enqueue(_ message: RelayMessage) {
        if let waiter { self.waiter = nil; waiter.resume(returning: message) } else { incoming.append(message) }
    }
    func metadata(input: String? = "pcm_16000", output: String = "pcm_16000") {
        var event = ["agent_output_audio_format": output]
        if let input { event["user_input_audio_format"] = input }
        enqueue(.data(json(["type": "conversation_initiation_metadata", "conversation_initiation_metadata_event": event])))
    }
    func close(code: Int) {
        closes += 1; waiter?.resume(returning: .closed(RelayClose(code: code))); waiter = nil
        audioWaiter?.resume(throwing: VoiceFailure.network); audioWaiter = nil
        handshakeWaiter?.resume(throwing: VoiceFailure.network); handshakeWaiter = nil
    }
    func stallAudio() { stalledAudio = true }
    func pauseHandshake() { stalledHandshake = true }
    func resumeHandshake() { stalledHandshake = false; handshakeWaiter?.resume(); handshakeWaiter = nil }
    func refuse(_ failure: APIFailure) { connectError = failure }
}
actor EventRecorder {
    var items: [VoiceEvent] = []
    func record(_ event: VoiceEvent) { items.append(event) }
    func hasError(_ error: VoiceFailure) -> Bool { items.contains(.error(error)) }
}
struct Rig: Sendable {
    let http: FixtureHTTP, client: VoiceHTTPClient, engine: FakeAudioEngine, relay: InMemoryRelay
    let store: InMemoryCredentialStore, permission: FakePermission, session: FakeSession, consent: FakeConsent
    let lifecycle: FakeLifecycle, controller: VoiceCallController, recorder: EventRecorder
    let recording: Task<Void, Never>
    static func make(relays: (any RelayFactory)? = nil, port: UInt16 = 8901, timing: CallTiming = CallTiming(),
                     clock: any VoiceClock = SystemVoiceClock(), storedConsent: (any VoiceConsent)? = nil) async throws -> Rig {
        let http = FixtureHTTP(port: port), store = InMemoryCredentialStore(), engine = FakeAudioEngine(), relay = InMemoryRelay()
        let permission = FakePermission(), session = FakeSession(), consent = FakeConsent(), lifecycle = FakeLifecycle()
        try await store.write(SessionCredential(token: fixtureToken, expiresAt: Date().addingTimeInterval(100)))
        let client = VoiceHTTPClient(policy: .loopback(port: port), store: store, transport: http, clock: clock)
        let controller = VoiceCallController(http: client, relays: relays ?? relay, engines: engine,
            permission: permission, consent: storedConsent ?? consent, audioSession: session, lifecycle: lifecycle, clock: clock, timing: timing)
        let recorder = EventRecorder()
        let recording = Task { for await event in controller.events { await recorder.record(event) } }
        return Rig(http: http, client: client, engine: engine, relay: relay, store: store, permission: permission,
                   session: session, consent: consent, lifecycle: lifecycle, controller: controller, recorder: recorder, recording: recording)
    }
    func close() async { await controller.shutdown(); recording.cancel() }
    func live() async throws {
        await relay.metadata(); await controller.start()
        try await eventually { await controller.state == .live }
    }
}
struct ScaledClock: VoiceClock {
    func now() async -> Date { Date() }
    func sleep(seconds: Double) async throws {
        try await Task.sleep(for: .seconds(seconds >= 1 ? seconds * 0.01 : seconds))
    }
}
func eventually(timeout: Double = 4, _ predicate: @escaping @Sendable () async -> Bool,
                file: StaticString = #filePath, line: UInt = #line) async throws {
    let deadline = Date().addingTimeInterval(timeout)
    while !(await predicate()) {
        guard Date() < deadline else { XCTFail("Timed out waiting for fixture", file: file, line: line); throw VoiceFailure.timeout }
        try await Task.sleep(for: .milliseconds(10))
    }
}
