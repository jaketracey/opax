import Foundation
import Network
import XCTest
@testable import OpaxVoiceCore

/// Raw HTTP is required here: A returns 302 before a WebSocket upgrade. Queue confined.
private final class RedirectServer: @unchecked Sendable {
    struct Receipt: Sendable { let cookie: Bool; let origin: String?; let upgrade: Bool }
    private let queue = DispatchQueue(label: "opax.voice.test.redirect")
    private let listener: NWListener
    private let location: String?
    private var connections: [NWConnection] = []
    private var receipts: [Receipt] = []
    private var accepted = 0
    private var started = false
    init(location: String? = nil) throws {
        try LoopbackGuard.validate(URLRequest(url: URL(string: "http://127.0.0.1:0")!))
        if let location { try LoopbackGuard.validate(URLRequest(url: URL(string: location)!)) }
        self.location = location
        let parameters = NWParameters.tcp
        parameters.requiredLocalEndpoint = .hostPort(host: "127.0.0.1", port: .any)
        listener = try NWListener(using: parameters, on: .any)
    }
    func start() async throws -> UInt16 {
        try await withCheckedThrowingContinuation { continuation in queue.async { [self] in
            listener.stateUpdateHandler = { [self] state in
                guard !started else { return }
                switch state {
                case .ready: started = true; continuation.resume(returning: listener.port!.rawValue)
                case .failed(let error): started = true; continuation.resume(throwing: error)
                default: break
                }
            }
            listener.newConnectionHandler = { [self] connection in
                guard case .hostPort(let host, _) = connection.endpoint, host == "127.0.0.1" else { connection.cancel(); return }
                accepted += 1; connections.append(connection); connection.start(queue: queue); receive(connection, buffer: Data())
            }
            listener.start(queue: queue)
        } }
    }
    private func receive(_ connection: NWConnection, buffer: Data) {
        connection.receive(minimumIncompleteLength: 1, maximumLength: 8192) { [self, weak connection] data, _, done, error in
            guard let connection else { return }
            var buffer = buffer; if let data { buffer.append(data) }
            guard buffer.count <= 8192 else { connection.cancel(); return }
            let text = String(decoding: buffer, as: UTF8.self)
            guard text.contains("\r\n\r\n") else {
                if !done, error == nil { receive(connection, buffer: buffer) } else { connection.cancel() }; return
            }
            let headers = text.components(separatedBy: "\r\n").dropFirst().reduce(into: [String: String]()) { values, line in
                if let split = line.firstIndex(of: ":") {
                    values[String(line[..<split]).lowercased()] = line[line.index(after: split)...].trimmingCharacters(in: .whitespaces)
                }
            }
            receipts.append(Receipt(cookie: headers["cookie"] == "__Host-opax_session=\(fixtureToken)", origin: headers["origin"], upgrade: headers["upgrade"]?.lowercased() == "websocket"))
            let response = location.map { "HTTP/1.1 302 Found\r\nLocation: \($0)\r\nContent-Length: 0\r\nConnection: close\r\n\r\n" }
                ?? "HTTP/1.1 200 OK\r\nContent-Length: 2\r\nConnection: close\r\n\r\n{}"
            connection.send(content: Data(response.utf8), completion: .contentProcessed { _ in connection.cancel() })
        }
    }
    func snapshot() async -> (Int, [Receipt]) { await withCheckedContinuation { continuation in queue.async { [self] in continuation.resume(returning: (accepted, receipts)) } } }
    func stop() async { await withCheckedContinuation { continuation in queue.async { [self] in connections.forEach { $0.cancel() }; listener.stateUpdateHandler = nil; listener.newConnectionHandler = nil; listener.cancel(); continuation.resume() } } }
}
@MainActor final class RedirectTests: SafeVoiceTestCase {
    func testRealHTTPAndWebSocketRedirectsNeverReachSecondServer() async throws {
        let destination = try RedirectServer(), destinationPort = try await destination.start()
        let redirect = try RedirectServer(location: "http://127.0.0.1:\(destinationPort)/stolen"), port = try await redirect.start()
        let policy = RoutePolicy.loopback(port: port), store = InMemoryCredentialStore()
        try await store.write(SessionCredential(token: fixtureToken, expiresAt: .distantFuture))
        let session = AuthenticatedURLSession(policy: policy)
        let client = VoiceHTTPClient(policy: policy, store: store, transport: session)
        do { _ = try await client.status(); XCTFail() }
        catch { XCTAssertEqual((error as? APIFailure)?.status, 302); XCTAssertEqual((error as? APIFailure)?.failure, .invalidResponse) }
        let reservation = try JSONDecoder().decode(Reservation.self, from: json(["session_id": fixtureID, "transport": "websocket", "remaining_seconds": 600,
            "expires_at": 0, "signed_url": "ws://127.0.0.1:\(port)/api/voice/connect?session_id=\(fixtureID)"]))
        let prepared = try await client.relayRequest(reservation)
        let socket = try await URLSessionRelayFactory(session: session, policy: policy).connect(prepared.request)
        do { try await socket.send(ClientMessage.initiation.data()); _ = try await socket.receive(); XCTFail() }
        catch { XCTAssertEqual((error as? APIFailure)?.status, 302); XCTAssertEqual((error as? APIFailure)?.failure, .invalidResponse) }
        await socket.close(code: 1000)
        try await Task.sleep(for: .milliseconds(80))
        let (received, receipts) = await redirect.snapshot(); XCTAssertEqual(received, 2); XCTAssertEqual(receipts.count, 2)
        XCTAssertTrue(receipts.allSatisfy { $0.cookie && $0.origin == "https://opax.com.au" })
        XCTAssertEqual(receipts.filter { $0.upgrade }.count, 1)
        let (followed, _) = await destination.snapshot(); XCTAssertEqual(followed, 0)
        await redirect.stop(); await destination.stop()
    }
}
