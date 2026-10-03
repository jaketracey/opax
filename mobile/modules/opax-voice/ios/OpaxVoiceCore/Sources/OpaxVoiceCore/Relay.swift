import Foundation

public struct RelayClose: Sendable, Equatable {
    public let code: Int
    public let reason: String
    public init(code: Int, reason: String = "") { self.code = code; self.reason = reason }
    var failure: VoiceFailure? {
        switch code { case 1000: nil; case 1008: .policy; default: .network }
    }
    var endReason: EndReason {
        code == 1000 ? (reason == "Your free voice time has finished" ? .deadline : .provider) : .network
    }
}
public enum RelayMessage: Sendable { case data(Data), closed(RelayClose) }
public protocol RelayTransport: Sendable {
    func send(_ data: Data) async throws
    func receive() async throws -> RelayMessage
    func close(code: Int) async
}
public protocol RelayFactory: Sendable { func connect(_ request: URLRequest) async throws -> any RelayTransport }
public enum ClientMessage: Sendable {
    case initiation, audio(Data), pong(Int), activity, message(String), contextualUpdate(String)
    func data() throws -> Data {
        let object: [String: Any]
        switch self {
        case .initiation: object = ["type": "conversation_initiation_client_data"]
        case .audio(let bytes): object = ["user_audio_chunk": bytes.base64EncodedString()]
        case .pong(let id): object = ["type": "pong", "event_id": id]
        case .activity: object = ["type": "user_activity"]
        case .message(let text), .contextualUpdate(let text):
            guard text.utf16.count <= 2000 else { throw VoiceFailure.policy }
            if case .message = self { object = ["type": "user_message", "text": text] }
            else { object = ["type": "contextual_update", "text": text] }
        }
        let data = try JSONSerialization.data(withJSONObject: object, options: [.sortedKeys])
        guard data.count <= 192000 else { throw VoiceFailure.policy }
        return data
    }
}
public struct URLSessionRelayFactory: RelayFactory {
    private let authenticated: AuthenticatedURLSession
    private let policy: RoutePolicy
    public init(session: AuthenticatedURLSession, policy: RoutePolicy = RoutePolicy()) {
        authenticated = session; self.policy = policy
    }
    public func connect(_ request: URLRequest) async throws -> any RelayTransport {
        #if DEBUG
        try VoiceTestSafety.validate(request)
        #endif
        guard (request.httpMethod ?? "GET") == "GET",
              let url = request.url, policy.permits(url, method: "GET", webSocket: true),
              request.value(forHTTPHeaderField: "Sec-WebSocket-Protocol") == "convai",
              request.value(forHTTPHeaderField: "Origin") == "https://opax.com.au" else { throw VoiceFailure.forbidden }
        let socket = authenticated.session.webSocketTask(with: request)
        let termination = authenticated.socketTermination(socket)
        socket.maximumMessageSize = 2 * 1024 * 1024
        socket.resume()
        return URLSessionRelay(socket: socket, termination: termination)
    }
}
actor URLSessionRelay: RelayTransport {
    private let socket: URLSessionWebSocketTask
    private let termination: SocketCloseSignal
    private var initiated = false
    init(socket: URLSessionWebSocketTask, termination: SocketCloseSignal) { self.socket = socket; self.termination = termination }
    func send(_ data: Data) async throws {
        guard data.count <= 192000, let string = String(data: data, encoding: .utf8) else { throw VoiceFailure.policy }
        guard let object = try JSONSerialization.jsonObject(with: data) as? [String: Any] else { throw VoiceFailure.policy }
        let isInitiation = object["type"] as? String == "conversation_initiation_client_data"
        if !initiated {
            guard isInitiation else { throw VoiceFailure.policy }; initiated = true
        } else if isInitiation { throw VoiceFailure.policy }
        do { try await socket.send(.string(string)) } catch {
            if let response = socket.response as? HTTPURLResponse, response.statusCode != 101 { throw mapped(error) }
            let close = await termination.value()
            if let response = socket.response as? HTTPURLResponse, response.statusCode != 101 { throw mapped(error) }
            if let close { throw RelayTerminated(close: close) }
            throw mapped(error)
        }
    }
    func receive() async throws -> RelayMessage {
        do {
            let message = try await socket.receive()
            switch message { case .data(let data): return .data(data)
            case .string(let text): return .data(Data(text.utf8)); @unknown default: throw VoiceFailure.policy }
        } catch {
            if let failure = error as? VoiceFailure { throw failure }
            if let response = socket.response as? HTTPURLResponse, response.statusCode != 101 {
                throw APIFailure.decode(HTTPResponse(status: response.statusCode, body: Data()), route: .voiceConnect)
            }
            // receive/send completion can precede the delegate's close callback.
            // Await its authoritative close frame or final abnormal completion;
            // this neither reads another frame nor reconnects/retries the socket.
            let close = await termination.value()
            if let response = socket.response as? HTTPURLResponse, response.statusCode != 101 { throw mapped(error) }
            if let close { return .closed(close) }
            throw mapped(error)
        }
    }
    private func mapped(_ error: any Error) -> any Error {
        if let response = socket.response as? HTTPURLResponse, response.statusCode != 101 {
            return APIFailure.decode(HTTPResponse(status: response.statusCode, body: Data()), route: .voiceConnect)
        }
        return VoiceFailure.network
    }
    func close(code: Int) { socket.cancel(with: URLSessionWebSocketTask.CloseCode(rawValue: code) ?? .normalClosure, reason: nil) }
}
/// Internal transport terminal signal; provider prose remains opaque to callers.
struct RelayTerminated: Error, Sendable, CustomStringConvertible, CustomReflectable {
    let close: RelayClose
    var description: String { "RelayTerminated" }
    var customMirror: Mirror { Mirror(self, children: [:]) }
}

indirect enum JSONValue: Decodable, Sendable {
    case object([String: JSONValue]), array([JSONValue]), string(String), number(Int), bool(Bool), null
    init(from decoder: any Decoder) throws {
        let container = try decoder.singleValueContainer()
        if container.decodeNil() { self = .null }
        else if let value = try? container.decode([String: JSONValue].self) { self = .object(value) }
        else if let value = try? container.decode([JSONValue].self) { self = .array(value) }
        else if let value = try? container.decode(String.self) { self = .string(value) }
        else if let value = try? container.decode(Int.self) { self = .number(value) }
        else if let value = try? container.decode(Bool.self) { self = .bool(value) }
        else { _ = try container.decode(Double.self); self = .null } // unused fractional VAD/alignment values
    }
    subscript(_ key: String) -> JSONValue { if case .object(let value) = self { value[key] ?? .null } else { .null } }
    var string: String? { if case .string(let value) = self { value } else { nil } }
    var int: Int? { if case .number(let value) = self { value } else { nil } }
}
enum ProviderEvent: Sendable {
    case metadata(input: AudioFormat, output: AudioFormat)
    case ping(Int), audio(Data, Int), interruption(Int)
    case transcript(TranscriptTurn, correction: Bool), tool(JSONValue, endsCall: Bool), deadline, error, unknown
    static func decode(_ data: Data) throws -> ProviderEvent {
        guard data.count <= 2 * 1024 * 1024 else { throw VoiceFailure.policy }
        let root = try JSONDecoder().decode(JSONValue.self, from: data)
        switch root["type"].string {
        case "conversation_initiation_metadata":
            let event = root["conversation_initiation_metadata_event"]
            return .metadata(input: try AudioFormat(event["user_input_audio_format"].string ?? "pcm_16000"),
                             output: try AudioFormat(event["agent_output_audio_format"].string ?? ""))
        case "ping":
            guard let id = root["ping_event"]["event_id"].int else { throw VoiceFailure.policy }
            return .ping(id)
        case "audio":
            let event = root["audio_event"]
            guard let text = event["audio_base_64"].string, let data = Data(base64Encoded: text) else { return .unknown }
            return .audio(data, event["event_id"].int ?? 0)
        case "interruption": return .interruption(root["interruption_event"]["event_id"].int ?? 0)
        case "user_transcript":
            let event = root["user_transcription_event"]
            return .transcript(TranscriptTurn(role: .user, id: event["event_id"].int ?? root["event_id"].int ?? -1,
                text: event["user_transcript"].string ?? ""), correction: false)
        case "agent_response", "agent_response_correction":
            let correction = root["type"].string == "agent_response_correction"
            let event = root[correction ? "agent_response_correction_event" : "agent_response_event"]
            return .transcript(TranscriptTurn(role: .agent, id: event["event_id"].int ?? root["event_id"].int ?? -1,
                text: event[correction ? "corrected_agent_response" : "agent_response"].string ?? ""), correction: correction)
        case "agent_tool_response", "agent_tool_response_full_payload":
            let event = root["agent_tool_response"]
            let full = root["agent_tool_response_full_payload"]
            return .tool(root, endsCall: event["tool_name"].string == "end_call" || full["tool_name"].string == "end_call")
        case "error":
            return root["error_event"]["error_type"].string == "max_duration_exceeded" || root["error"].string == "max_duration_exceeded" ? .deadline : .error
        default: return .unknown
        }
    }
}
