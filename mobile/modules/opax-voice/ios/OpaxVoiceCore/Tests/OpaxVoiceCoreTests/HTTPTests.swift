import XCTest
@testable import OpaxVoiceCore

@MainActor final class HTTPTests: SafeVoiceTestCase {
    func testExactHeadersOnEachAllowedPathAndMethod() throws {
        let credential = try SessionCredential(token: fixtureToken, expiresAt: .distantFuture)
        let policy = RoutePolicy()
        for route in AuthRoute.allCases {
            let websocket = route == .voiceConnect
            var request = URLRequest(url: URL(string: "\(websocket ? "wss" : "https")://opax.com.au\(route.rawValue)")!)
            request.httpMethod = route.method
            let output = policy.decorate(request, credential: credential, webSocket: websocket)
            XCTAssertEqual(output.value(forHTTPHeaderField: "Cookie"), "__Host-opax_session=\(fixtureToken)")
            XCTAssertEqual(output.value(forHTTPHeaderField: "Origin"), "https://opax.com.au")
            XCTAssertEqual(output.value(forHTTPHeaderField: "Sec-WebSocket-Protocol"), websocket ? "convai" : nil)
            XCTAssertFalse(output.httpShouldHandleCookies)
            request.httpMethod = route.method == "GET" ? "POST" : "GET"
            XCTAssertNil(policy.decorate(request, credential: credential, webSocket: websocket).value(forHTTPHeaderField: "Cookie"))
        }
    }
    func testNoCredentialOrOriginAnywhereElse() throws {
        let policy = RoutePolicy(), credential = try SessionCredential(token: fixtureToken, expiresAt: .distantFuture)
        let urls = ["https://example.org/api/voice/status", "https://opax.com.au:8443/api/voice/status", "http://opax.com.au/api/voice/status",
                    "https://opax.com.au/api/community/auth/consume", "https://opax.com.au/api/community/auth/new",
                    "https://opax.com.au/api/community/account/delete", "https://opax.com.au/api/voice/tools/search",
                    "https://opax.com.au/api/search-all", "https://opax.com.au/api/voice/status/", "https://opax.com.au/api/%76oice/status",
                    "https://user@opax.com.au/api/voice/status", "https://opax.com.au/api/voice/status#fragment"]
        for url in urls {
            var request = URLRequest(url: URL(string: url)!); request.setValue("should-strip", forHTTPHeaderField: "Cookie")
            request.setValue("should-strip", forHTTPHeaderField: "Origin")
            let output = policy.decorate(request, credential: credential)
            XCTAssertNil(output.value(forHTTPHeaderField: "Cookie"), url); XCTAssertNil(output.value(forHTTPHeaderField: "Origin"), url)
        }
    }
    func testWebSocketFactoryRejectsWrongHTTPMethodBeforeResume() async throws {
        let policy = RoutePolicy.loopback(port: 8901)
        let factory = URLSessionRelayFactory(session: AuthenticatedURLSession(policy: policy), policy: policy)
        var request = URLRequest(url: URL(string: "ws://127.0.0.1:8901/api/voice/connect?session_id=\(fixtureID)")!)
        request.httpMethod = "POST"
        request.setValue("convai", forHTTPHeaderField: "Sec-WebSocket-Protocol")
        request.setValue("https://opax.com.au", forHTTPHeaderField: "Origin")
        do { let socket = try await factory.connect(request); await socket.close(code: 1000); XCTFail() }
        catch { XCTAssertEqual(error as? VoiceFailure, .forbidden) }
    }
    func testSignedOutHasOriginWithoutCookie() {
        let output = RoutePolicy().decorate(URLRequest(url: URL(string: "https://opax.com.au/api/voice/status")!), credential: nil)
        XCTAssertNil(output.value(forHTTPHeaderField: "Cookie")); XCTAssertEqual(output.value(forHTTPHeaderField: "Origin"), "https://opax.com.au")
    }
    func testSessionHasNoCookieStoreOrCache() {
        let config = AuthenticatedURLSession.configuration()
        XCTAssertNil(config.httpCookieStorage); XCTAssertFalse(config.httpShouldSetCookies); XCTAssertEqual(config.httpCookieAcceptPolicy, .never); XCTAssertNil(config.urlCache)
    }
    func testRedirectDelegateAlwaysRefuses() async {
        let delegate = NoRedirectDelegate()
        let session = URLSession(configuration: .ephemeral)
        let task = session.dataTask(with: URL(string: "http://127.0.0.1:8901")!) // never resumed
        let request = URLRequest(url: URL(string: "https://example.org/")!)
        let response = HTTPURLResponse(url: request.url!, statusCode: 302, httpVersion: nil, headerFields: nil)!
        let accepted = await withCheckedContinuation { continuation in
            delegate.urlSession(session, task: task, willPerformHTTPRedirection: response, newRequest: request) {
                continuation.resume(returning: $0 != nil)
            }
        }
        XCTAssertFalse(accepted); session.invalidateAndCancel()
    }
    func testSecureCookieValidationAndExpiry() throws {
        let good = "__Host-opax_session=\(fixtureToken); Secure; HttpOnly; Path=/; Max-Age=2592000"
        let now = Date(timeIntervalSince1970: 1)
        XCTAssertEqual(try SessionCookie.parse(good, now: now).expiresAt, now.addingTimeInterval(2592000))
        for bad in [good.replacingOccurrences(of: "Secure; ", with: ""), good + "; Domain=opax.com.au",
                    good.replacingOccurrences(of: "Path=/", with: "Path=/api"), good.replacingOccurrences(of: "2592000", with: "0"),
                    good.replacingOccurrences(of: fixtureToken, with: "bad\r\nheader")] { XCTAssertThrowsError(try SessionCookie.parse(bad, now: now)) }
    }
    func testCodeBodyAndKeychainLifecycle() async throws {
        let rig = try await Rig.make(); await rig.store.clear()
        let challenge = try await rig.client.requestCode(email: "synthetic@example.invalid")
        XCTAssertTrue(challenge.sent)
        try await rig.client.consumeCode(challengeID: challenge.challengeID, code: "12345678")
        let credential = await rig.store.read(); XCTAssertNotNil(credential)
        let requests = await rig.http.requests
        let body = try JSONSerialization.jsonObject(with: requests[0].httpBody!) as! [String: String]
        XCTAssertEqual(body["client"], "ios")
        let consume = try JSONSerialization.jsonObject(with: requests[1].httpBody!) as! [String: String]
        XCTAssertEqual(consume, ["challenge_id": "fixture-challenge", "code": "12345678"])
        try await rig.client.logout(); let cleared = await rig.store.read(); XCTAssertNil(cleared)
        await rig.close()
    }
    func test401AndBothSignedOutStatusShapesClearCredential() async throws {
        for signal in 0..<3 {
            let rig = try await Rig.make()
            if signal == 0 {
                await rig.http.setResponse(.voiceStart, HTTPResponse(status: 401, body: json(["error": "Synthetic revoked"])))
                do { _ = try await rig.client.start(); XCTFail() } catch { XCTAssertEqual((error as? APIFailure)?.failure, .signedOut) }
            } else if signal == 1 {
                await rig.http.configure(status: signedStatus(signedIn: false))
                await rig.http.setResponse(.communityStatus, HTTPResponse(status: 200, body: json(["enabled": true, "member": NSNull()])))
                _ = try await rig.client.status()
            }
            else { await rig.http.setResponse(.communityStatus, HTTPResponse(status: 200, body: json(["enabled": true, "member": NSNull()]))); _ = try await rig.client.communityStatus() }
            let value = await rig.store.read(); XCTAssertNil(value); await rig.close()
        }
    }
    func testLogoutClearsLocallyEvenWhenTransportFails() async throws {
        let rig = try await Rig.make()
        await rig.http.setResponse(.logout, HTTPResponse(status: 503, body: json(["error": "Synthetic failure"])))
        do { try await rig.client.logout(); XCTFail() } catch {}
        let value = await rig.store.read(); XCTAssertNil(value); await rig.close()
    }
    func testSignedOutCodeResponseClearsAnExistingCredential() async throws {
        let rig = try await Rig.make()
        await rig.http.setResponse(.consumeCode, HTTPResponse(status: 200, body: json(["signed_in": false])))
        do { try await rig.client.consumeCode(challengeID: "fixture", code: "12345678"); XCTFail() }
        catch { XCTAssertEqual(error as? VoiceFailure, .signedOut) }
        let value = await rig.store.read(); XCTAssertNil(value); await rig.close()
    }
    func testRevokedCredentialCannotReattachIfKeychainClearFails() async throws {
        actor FailedClearStore: CredentialStore {
            var value: SessionCredential?
            init(_ value: SessionCredential) { self.value = value }
            func read() -> SessionCredential? { value }
            func write(_ value: SessionCredential) { self.value = value }
            func clear() throws { throw VoiceFailure.unavailable }
            func clear(ifMatching credential: SessionCredential) throws -> Bool {
                guard value == credential else { return false }; throw VoiceFailure.unavailable
            }
        }
        let store = FailedClearStore(try SessionCredential(token: fixtureToken, expiresAt: .distantFuture))
        let fixture = FixtureHTTP()
        let client = VoiceHTTPClient(policy: .loopback(port: 8901), store: store, transport: fixture)
        await fixture.setResponse(.voiceStart, HTTPResponse(status: 401, body: json(["error": "Revoked"])))
        do { _ = try await client.start(); XCTFail() } catch {}
        let status = try await client.status(); XCTAssertFalse(status.signedIn)
        let requests = await fixture.requests
        XCTAssertNotNil(requests[0].value(forHTTPHeaderField: "Cookie"))
        XCTAssertNil(requests[1].value(forHTTPHeaderField: "Cookie"))

        // A stale old response must not replace the newer credential's block.
        let old = try SessionCredential(token: String(repeating: "a", count: 43), expiresAt: .distantFuture)
        let newer = try SessionCredential(token: String(repeating: "b", count: 43), expiresAt: .distantFuture)
        await store.write(old)
        await fixture.setResponse(.communityStatus, HTTPResponse(status: 200, body: json(["enabled": true, "member": NSNull()])))
        await fixture.pauseResponse(.communityStatus)
        let stale = Task { _ = try? await client.communityStatus() }
        try await eventually { await fixture.responseWaiter != nil }
        await store.write(newer)
        do { _ = try await client.start(); XCTFail() } catch {}
        await fixture.resumeResponse(); await stale.value
        _ = try await client.status()
        let last = await fixture.requests.last
        XCTAssertNil(last?.value(forHTTPHeaderField: "Cookie"))
    }
    func testStoredCredentialDecodeAlsoValidatesTokenAndDebugRedaction() throws {
        let encoded = try SessionCredential(token: fixtureToken, expiresAt: .distantFuture).storageData()
        let bad = String(data: encoded, encoding: .utf8)!.replacingOccurrences(of: fixtureToken, with: "bad")
        XCTAssertThrowsError(try SessionCredential.fromStorage(Data(bad.utf8)))
        XCTAssertThrowsError(try SessionCredential(token: fixtureToken + "\n", expiresAt: .distantFuture))
        XCTAssertFalse(String(reflecting: try SessionCredential(token: fixtureToken, expiresAt: .distantFuture)).contains(fixtureToken))
    }
    func testExpiredCredentialNeverAttaches() async throws {
        let rig = try await Rig.make()
        try await rig.store.write(SessionCredential(token: fixtureToken, expiresAt: .distantPast))
        _ = try await rig.client.status()
        let request = await rig.http.requests.last; XCTAssertNil(request?.value(forHTTPHeaderField: "Cookie"))
        let value = await rig.store.read(); XCTAssertNil(value); await rig.close()
    }
    func testEveryHTTPErrorShapeIncludingFutureReasonAndChargeHints() {
        let cases: [(Int, [String: Any], VoiceFailure, ChargeDisposition)] = [
            (401, ["error": "Signed out"], .signedOut, .unknown), (409, ["error": "Call open"], .callOpen, .unknown),
            (403, ["error": "Any wording"], .forbidden, .unknown),
            (403, ["error": "Origin refused"], .forbidden, .unknown), (429, ["error": "Busy"], .rateLimited, .unknown),
            (429, ["error": "Busy", "reason": "capacity"], .capacity, .unknown),
            (429, ["error": "Busy", "reason": "budget"], .budgetClosed, .unknown),
            (429, ["error": "Busy", "reason": "future"], .rateLimited, .unknown),
            (503, ["error": "Failed", "released": true], .unavailable, .released),
            (503, ["error": "Failed", "released": false], .unavailable, .retained),
            (503, ["error": "Failed"], .unavailable, .unknown),
            (400, ["error": "Invalid"], .invalidResponse, .unknown), (413, [:], .invalidResponse, .unknown),
            (415, [:], .invalidResponse, .unknown), (426, [:], .invalidResponse, .unknown), (302, [:], .invalidResponse, .unknown)]
        for (status, body, failure, charge) in cases {
            let result = APIFailure.decode(HTTPResponse(status: status, body: json(body)), route: .voiceStart)
            XCTAssertEqual(result.failure, failure); XCTAssertEqual(result.charge, charge)
        }
    }
    func testLogsRedactCredentialSignedURLAndServerContent() throws {
        let credential = try SessionCredential(token: fixtureToken, expiresAt: .distantFuture)
        XCTAssertFalse(String(describing: credential).contains(fixtureToken))
        let error = APIFailure.decode(HTTPResponse(status: 503, body: json(["error": fixtureToken])), route: .voiceStart)
        XCTAssertFalse(String(describing: error).contains(fixtureToken))
    }
    func testLoopbackGuardRejectsAnyOtherHostBeforeNetwork() throws {
        try VoiceTestSafety.$isolated.withValue(VoiceTestSafety.Monitor()) {
            for url in ["https://opax.com.au/api/voice/status", "https://api.elevenlabs.io", "http://localhost:8901", "http://127.0.0.2:8901", "http://127.0.0.1.example.org"] {
                XCTAssertThrowsError(try LoopbackGuard.validate(URLRequest(url: URL(string: url)!)))
            }
            XCTAssertNoThrow(try LoopbackGuard.validate(URLRequest(url: URL(string: "ws://127.0.0.1:8901")!)))
            let audit = VoiceTestSafety.audit()
            XCTAssertEqual(audit.hosts, ["opax.com.au", "api.elevenlabs.io", "localhost", "127.0.0.2", "127.0.0.1.example.org", "127.0.0.1"])
            XCTAssertFalse(audit.isClean)
        }
    }
}
