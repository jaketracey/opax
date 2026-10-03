import Foundation
@testable import OpaxVoiceCore

/// Real loopback frames, with an injected terminal observation and write/receive
/// ordering. Models a lost close frame deterministically rather than hoping
/// URLSession happens to surface 1006 during a concurrent pong/upload.
actor OrderedTerminationRelay: RelayTransport {
    enum Order: Sendable, Equatable { case writeFirst, receiveFirst }
    enum Write: Sendable, Equatable { case pong, audio }
    private let inner: any RelayTransport
    private let terminal: RelayClose
    private let order: Order
    private let write: Write
    private var writeGate: CheckedContinuation<Void, Never>?
    private var receiveGate: CheckedContinuation<Void, Never>?
    private var writeFinished = false
    private(set) var observations: [String] = []
    var writeWaiting: Bool { writeGate != nil }
    init(inner: any RelayTransport, terminal: RelayClose, order: Order, write: Write) {
        self.inner = inner; self.terminal = terminal; self.order = order; self.write = write
    }
    func send(_ data: Data) async throws {
        let object = try JSONSerialization.jsonObject(with: data) as? [String: Any]
        let selected = write == .pong ? object?["type"] as? String == "pong" : object?["user_audio_chunk"] != nil
        guard selected else { try await inner.send(data); return }
        await withCheckedContinuation { writeGate = $0 }
        observations.append("write"); writeFinished = true
        receiveGate?.resume(); receiveGate = nil
        throw RelayTerminated(close: terminal)
    }
    func receive() async throws -> RelayMessage {
        let message = try await inner.receive()
        guard case .closed = message else { return message }
        if order == .writeFirst {
            releaseWrite()
            if !writeFinished { await withCheckedContinuation { receiveGate = $0 } }
        }
        observations.append("receive")
        return .closed(terminal)
    }
    func close(code: Int) async {
        // receiveFirst deliberately keeps the write pending until controller
        // cleanup. Both gates are released even if an assertion aborts the test.
        releaseWrite(); receiveGate?.resume(); receiveGate = nil
        await inner.close(code: code)
    }
    private func releaseWrite() { writeGate?.resume(); writeGate = nil }
}
actor OrderedTerminationFactory: RelayFactory {
    private let inner: GuardedRelayFactory
    private let terminal: RelayClose
    private let order: OrderedTerminationRelay.Order
    private let write: OrderedTerminationRelay.Write
    private(set) var connected: OrderedTerminationRelay?
    init(port: UInt16, terminal: RelayClose, order: OrderedTerminationRelay.Order, write: OrderedTerminationRelay.Write = .pong) {
        inner = GuardedRelayFactory(port: port); self.terminal = terminal; self.order = order; self.write = write
    }
    func connect(_ request: URLRequest) async throws -> any RelayTransport {
        try LoopbackGuard.validate(request)
        let relay = OrderedTerminationRelay(inner: try await inner.connect(request), terminal: terminal, order: order, write: write)
        connected = relay; return relay
    }
}
