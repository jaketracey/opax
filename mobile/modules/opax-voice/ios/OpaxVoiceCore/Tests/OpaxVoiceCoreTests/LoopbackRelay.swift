import Foundation
import Network
@testable import OpaxVoiceCore

/// Queue-confined test server. No TLS trust bypass and no upstream connection.
/// WebSocket scenarios use NWProtocolWebSocket; refusal scenarios return a raw HTTP upgrade refusal.
final class LoopbackRelay: @unchecked Sendable {
    enum Scenario: Sendable { case conversation, quiet, ulaw, unsupported, noMetadata, refuse(Int) }
    struct Log: Sendable {
        var headers: [String: String] = [:]
        var types: [String] = []
        var audioSizes: [Int] = []
        var audioTimes: [TimeInterval] = []
        var allAudioSilent = true
        var pongIDs: [Int] = []
        var peers: [String] = []
    }
    private let queue = DispatchQueue(label: "opax.voice.test.loopback")
    private var listener: NWListener!
    private let scenario: Scenario
    private var connections: [NWConnection] = []
    private var closing: Set<ObjectIdentifier> = []
    private var log = Log()
    private var started = false
    private var initiated = false
    private var initiationTimer: DispatchWorkItem?
    private var window: TimeInterval = 0
    private var hits = 0
    init(scenario: Scenario = .conversation) throws {
        self.scenario = scenario
        let parameters = NWParameters.tcp
        parameters.requiredLocalEndpoint = .hostPort(host: "127.0.0.1", port: .any)
        parameters.allowLocalEndpointReuse = true
        if case .refuse = scenario {} else {
            let options = NWProtocolWebSocket.Options()
            options.autoReplyPing = true; options.maximumMessageSize = 2 * 1024 * 1024
            parameters.defaultProtocolStack.applicationProtocols.insert(options, at: 0)
            // Install after self initialized below.
        }
        if let options = parameters.defaultProtocolStack.applicationProtocols.first as? NWProtocolWebSocket.Options {
            options.setClientRequestHandler(queue) { [weak self] protocols, headers in
                guard let self else { return .init(status: .reject, subprotocol: nil) }
                self.log.headers = headers.reduce(into: [:]) { $0[$1.name.lowercased()] = $1.value }
                guard protocols.contains("convai") else { return .init(status: .reject, subprotocol: nil) }
                return .init(status: .accept, subprotocol: "convai")
            }
        }
        listener = try NWListener(using: parameters, on: .any)
    }
    func start() async throws -> UInt16 {
        try await withCheckedThrowingContinuation { continuation in
            queue.async { [self] in
                listener.stateUpdateHandler = { [weak self] state in
                    guard let self, !self.started else { return }
                    switch state {
                    case .ready:
                        self.started = true
                        if let port = self.listener.port { continuation.resume(returning: port.rawValue) }
                        else { continuation.resume(throwing: VoiceFailure.network) }
                    case .failed(let error): self.started = true; continuation.resume(throwing: error)
                    default: break
                    }
                }
                listener.newConnectionHandler = { [weak self] connection in self?.accept(connection) }
                listener.start(queue: queue)
            }
        }
    }
    private func accept(_ connection: NWConnection) {
        guard case .hostPort(let host, _) = connection.endpoint, host == "127.0.0.1" else { connection.cancel(); return }
        initiated = false; initiationTimer?.cancel(); hits = 0; window = 0
        log.peers.append("127.0.0.1"); connections.append(connection)
        connection.stateUpdateHandler = { [weak self, weak connection] state in
            guard let self, let connection else { return }
            if case .ready = state {
                if case .refuse(let status) = self.scenario {
                    connection.receive(minimumIncompleteLength: 1, maximumLength: 65536) { _, _, _, _ in
                        let body = "{\"error\":\"Synthetic upgrade refusal\"}"
                        let response = "HTTP/1.1 \(status) Unavailable\r\nContent-Type: application/json\r\nContent-Length: \(body.utf8.count)\r\nConnection: close\r\n\r\n\(body)"
                        connection.send(content: Data(response.utf8), completion: .contentProcessed { _ in connection.cancel() })
                    }
                    return
                }
                if self.scenario != .noMetadata {
                    let input = self.scenario == .ulaw ? "ulaw_8000" : "pcm_16000"
                    let output = self.scenario == .unsupported ? "opus_48000" : input
                    self.send(json(["type": "conversation_initiation_metadata", "conversation_initiation_metadata_event": [
                        "conversation_id": "conv_fixture", "user_input_audio_format": input, "agent_output_audio_format": output]]), on: connection)
                }
                let timer = DispatchWorkItem { [weak self] in
                    guard let self, !self.initiated else { return }; self.close(code: 1008, reason: "Initiation timeout", on: connection)
                }
                self.initiationTimer = timer; self.queue.asyncAfter(deadline: .now() + 10, execute: timer)
                self.receive(connection)
            }
        }
        connection.start(queue: queue)
    }
    private func receive(_ connection: NWConnection) {
        connection.receiveMessage { [weak self] data, context, _, error in
            guard let self else { return }
            if error != nil { return }
            if let metadata = context?.protocolMetadata(definition: NWProtocolWebSocket.definition) as? NWProtocolWebSocket.Metadata,
               metadata.opcode == .close {
                if self.closing.contains(ObjectIdentifier(connection)) { connection.cancel() }
                else { self.close(code: 1000, reason: "Voice conversation ended", on: connection) }
                return
            }
            if let data {
                let now = Date().timeIntervalSince1970
                if now - self.window >= 1 { self.window = now; self.hits = 0 }
                self.hits += 1
                guard self.hits <= 150, data.count <= 192000,
                      let object = try? JSONSerialization.jsonObject(with: data) as? [String: Any] else {
                    self.close(code: 1008, reason: "Invalid message", on: connection); return
                }
                let type = object["type"] as? String
                if type == "conversation_initiation_client_data" {
                    guard !self.initiated else { self.close(code: 1008, reason: "Duplicate initiation", on: connection); return }
                    self.initiated = true; self.initiationTimer?.cancel(); self.log.types.append(type!)
                    if self.scenario == .conversation { self.canned(connection) }
                } else {
                    guard self.initiated else { self.close(code: 1008, reason: "Initiation required", on: connection); return }
                    if let audio = object["user_audio_chunk"] as? String,
                       audio.range(of: "^[A-Za-z0-9+/]*={0,2}$", options: .regularExpression) != nil,
                       let bytes = Data(base64Encoded: audio) {
                        self.log.types.append("user_audio_chunk"); self.log.audioSizes.append(bytes.count)
                        self.log.audioTimes.append(now); self.log.allAudioSilent = self.log.allAudioSilent && bytes.allSatisfy { $0 == 0 || $0 == 255 }
                    } else if type == "pong", let id = object["event_id"] as? Int {
                        self.log.types.append("pong"); self.log.pongIDs.append(id)
                    } else if type == "user_activity" { self.log.types.append(type!) }
                    else if ["user_message", "contextual_update"].contains(type ?? ""),
                            let text = object["text"] as? String, text.utf16.count <= 2000 { self.log.types.append(type!) }
                }
            }
            self.receive(connection)
        }
    }
    private func canned(_ connection: NWConnection) {
        let events: [[String: Any]] = [
            ["type": "agent_response", "agent_response_event": ["event_id": 1, "agent_response": "Synthetic fixture greeting [Record](/doc/fixture) [Reject](https://example.org/private)"]],
            ["type": "audio", "audio_event": ["event_id": 1, "audio_base_64": Data(repeating: 0, count: 800).base64EncodedString(), "alignment": ["chars": ["a"], "char_start_times_ms": [0]]]],
            ["type": "ping", "ping_event": ["event_id": 42, "ping_ms": 0]],
            ["type": "user_transcript", "user_transcription_event": ["event_id": 2, "user_transcript": "Synthetic question"]],
            ["type": "agent_tool_response", "agent_tool_response": ["tool_name": "lookup", "status": "success", "sources": [["title": "Standard", "url": "/bill/fixture"]], "source_url": "/bill/fixture"]],
            ["type": "agent_tool_response_full_payload", "agent_tool_response_full_payload": ["tool_name": "receipts", "full_tool_result": String(data: json(["sources": [["title": "Receipt", "url": "/money/receipts"]], "data": ["answer": "Synthetic answer"]]), encoding: .utf8)!]],
            ["type": "agent_tool_response_full_payload", "agent_tool_response_full_payload": ["tool_name": "receipts", "full_tool_result": ["sources": [], "data": ["needs_period": true]]]],
            ["type": "interruption", "interruption_event": ["event_id": 8]],
            ["type": "audio", "audio_event": ["event_id": 1, "audio_base_64": Data(repeating: 0, count: 400).base64EncodedString()]],
            ["type": "agent_response_correction", "agent_response_correction_event": ["event_id": 1, "corrected_agent_response": "Synthetic corrected greeting"]]
        ]
        for event in events { send(json(event), on: connection) }
    }
    private func send(_ data: Data, on connection: NWConnection) {
        let context = NWConnection.ContentContext(identifier: "fixture", metadata: [NWProtocolWebSocket.Metadata(opcode: .text)])
        connection.send(content: data, contentContext: context, isComplete: true, completion: .contentProcessed { _ in })
    }
    private func close(code: UInt16, reason: String, on connection: NWConnection) {
        guard closing.insert(ObjectIdentifier(connection)).inserted else { return }
        let metadata = NWProtocolWebSocket.Metadata(opcode: .close)
        metadata.closeCode = (try? NWProtocolWebSocket.CloseCode(rawValue: code)) ?? .protocolCode(.normalClosure)
        let context = NWConnection.ContentContext(identifier: "fixture-close", metadata: [metadata])
        connection.send(content: Data(reason.utf8), contentContext: context, isComplete: true, completion: .contentProcessed { [weak self] error in
            if error != nil { connection.cancel(); return }
            // Complete the close handshake, or bound cleanup if the peer never
            // replies. Cancelling here can reset TCP with a pong still unread,
            // turning a delivered normal close into an artificial network drop.
            self?.queue.asyncAfter(deadline: .now() + 1) { connection.cancel() }
        })
    }
    func close(code: UInt16, reason: String) async {
        await withCheckedContinuation { continuation in queue.async { [self] in
            for connection in connections { close(code: code, reason: reason, on: connection) }; continuation.resume()
        } }
    }
    /// Canned frames are sent only to accepted numeric-loopback peers.
    func broadcast(_ data: Data) async {
        await withCheckedContinuation { continuation in queue.async { [self] in
            for connection in connections { send(data, on: connection) }; continuation.resume()
        } }
    }
    func drop() async {
        await withCheckedContinuation { continuation in queue.async { [self] in
            for connection in connections { connection.forceCancel() }; continuation.resume()
        } }
    }
    func snapshot() async -> Log { await withCheckedContinuation { continuation in queue.async { [self] in continuation.resume(returning: log) } } }
    func stop() async {
        await withCheckedContinuation { continuation in queue.async { [self] in
            initiationTimer?.cancel(); for connection in connections { connection.cancel() }; listener.cancel(); continuation.resume()
        } }
    }
}
extension LoopbackRelay.Scenario: Equatable {}
struct GuardedRelayFactory: RelayFactory {
    let inner: URLSessionRelayFactory
    init(port: UInt16) {
        let policy = RoutePolicy.loopback(port: port)
        inner = URLSessionRelayFactory(session: AuthenticatedURLSession(policy: policy), policy: policy)
    }
    func connect(_ request: URLRequest) async throws -> any RelayTransport {
        try LoopbackGuard.validate(request)
        return try await inner.connect(request)
    }
}
