#if DEBUG || OPAX_VOICE_E2E
import Foundation

/// One execution boundary for real and fake HTTP/WebSocket transports and I/O.
enum VoiceTestSafety {
    struct Audit: Sendable {
        let inputOpens: Int, outputOpens: Int // attempted opens, including refused attempts
        let hosts: Set<String> // attempted hosts, including refused attempts
        var isClean: Bool { inputOpens == 0 && outputOpens == 0 && hosts.isSubset(of: ["127.0.0.1"]) }
    }
    final class Monitor: @unchecked Sendable {
        let lock = NSLock()
        var loopbackOnly: Bool
        var inputOpens = 0, outputOpens = 0
        var hosts: Set<String> = []
        init(loopbackOnly: Bool = true) { self.loopbackOnly = loopbackOnly }
        func audit() -> Audit { lock.withLock { Audit(inputOpens: inputOpens, outputOpens: outputOpens, hosts: hosts) } }
    }
    #if OPAX_VOICE_E2E
    private static let shared = Monitor(loopbackOnly: true)
    #else
    private static let shared = Monitor(loopbackOnly: NSClassFromString("XCTestCase") != nil)
    #endif
    // Negative guard self-tests use a separate measured scope and assert it is
    // dirty. Every ordinary test uses the cumulative monitor; it is never reset.
    @TaskLocal static var isolated: Monitor?
    private static var monitor: Monitor { isolated ?? shared }
    static func installLoopbackOnly() { shared.lock.withLock { shared.loopbackOnly = true } }
    static func validate(_ request: URLRequest) throws {
        let state = monitor
        try state.lock.withLock {
            state.hosts.insert(request.url?.host ?? "<missing>")
            guard state.loopbackOnly else { return }
            guard let url = request.url, url.host == "127.0.0.1", url.user == nil, url.password == nil,
                  ["http", "https", "ws", "wss"].contains(url.scheme ?? "") else { throw VoiceFailure.forbidden }
        }
    }
    static func willOpenAudio() throws {
        let state = monitor
        try state.lock.withLock {
            state.inputOpens += 1; state.outputOpens += 1
            guard !state.loopbackOnly else { throw VoiceFailure.audio }
        }
    }
    static func blocksHardware() -> Bool { let state = monitor; return state.lock.withLock { state.loopbackOnly } }
    static func audit() -> Audit { monitor.audit() }
    static func cumulativeAudit() -> Audit { shared.audit() }
}
#endif
