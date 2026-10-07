import Foundation
import XCTest
@testable import OpaxVoiceCore

private actor ChatTransport: HTTPTransport {
    var requests: [URLRequest] = []
    func send(_ request: URLRequest) async throws -> HTTPResponse {
        try LoopbackGuard.validate(request)
        requests.append(request)
        return HTTPResponse(status: 200, body: Data("{\"chats\":[]}".utf8))
    }
}
@MainActor final class ChatTests: SafeVoiceTestCase {
    func testChatPolicyAdmitsOnlyExactOwnerDataRoutesAndMethods() {
        let p = RoutePolicy.loopback(port: 8940)
        for method in ["GET", "PUT", "DELETE"] {
            XCTAssertTrue(p.permitsChat(URL(string: "http://127.0.0.1:8940/api/community/chats/fixture-chat-001")!, method: method))
        }
        XCTAssertTrue(p.permitsChat(URL(string: "http://127.0.0.1:8940/api/community/chats")!, method: "GET"))
        for path in ["/api/community/chats/short", "/api/community/chats/fixture-chat-001?x=1", "/api/community/chats/fixture-chat-001#token", "/api/community/chats/", "/api/ask", "/api/community/account/delete"] {
            XCTAssertFalse(p.permitsChat(URL(string: "http://127.0.0.1:8940" + path)!, method: "GET"))
        }
        XCTAssertFalse(p.permitsChat(URL(string: "https://opax.com.au/api/community/chats")!, method: "GET"))
        XCTAssertFalse(p.permitsChat(URL(string: "http://127.0.0.1:8940/api/community/chats")!, method: "DELETE"))
        XCTAssertFalse(p.permitsChat(URL(string: "http://127.0.0.1:8940/api/community/chats/fixture-chat-001")!, method: "POST"))
    }
    func testChatRequestKeepsCredentialNativeAndHasNoLaunchRead() async throws {
        let store = InMemoryCredentialStore()
        try await store.write(SessionCredential(token: fixtureToken, expiresAt: .distantFuture))
        let transport = ChatTransport()
        let client = VoiceHTTPClient(policy: .loopback(port: 8940), store: store, transport: transport)
        let initial = await transport.requests
        XCTAssertTrue(initial.isEmpty)
        let result = try await client.chatRequest(path: "/api/community/chats", method: "GET", body: nil)
        XCTAssertEqual(result, "{\"chats\":[]}")
        let requests = await transport.requests
        XCTAssertEqual(requests.count, 1)
        XCTAssertEqual(requests[0].value(forHTTPHeaderField: "Cookie"), "__Host-opax_session=" + fixtureToken)
        XCTAssertEqual(requests[0].value(forHTTPHeaderField: "Origin"), "https://opax.com.au")
        XCTAssertFalse(requests[0].httpShouldHandleCookies)
        do { _ = try await client.chatRequest(path: "/api/ask", method: "PUT", body: "{}"); XCTFail() }
        catch { XCTAssertEqual(error as? VoiceFailure, .forbidden) }
        let after = await transport.requests
        XCTAssertEqual(after.count, 1)
    }
}
