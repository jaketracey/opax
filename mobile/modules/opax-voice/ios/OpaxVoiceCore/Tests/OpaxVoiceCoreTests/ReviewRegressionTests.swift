import Foundation
import XCTest
@testable import OpaxVoiceCore

@MainActor final class ReviewRegressionTests: SafeVoiceTestCase {
    func testExactWorkerStatusFixturesAndUnlimitedCall() async throws {
        let data = try Data(contentsOf: Bundle.module.url(forResource: "worker-status", withExtension: "json")!)
        let shapes = (try JSONSerialization.jsonObject(with: data) as! [String: Any])["shapes"] as! [String: [String: Any]]
        for name in ["signedOut", "allowance", "unlimited", "openSession", "budgetClosed", "budgetClosedFutureW8"] {
            let status = try JSONDecoder().decode(VoiceStatus.self, from: json(shapes[name]!))
            if name == "unlimited" { XCTAssertNil(status.totalSeconds); XCTAssertEqual(status.unlimited, true) }
            if name == "signedOut" { XCTAssertNil(status.unlimited) }
            if name == "openSession" { XCTAssertNotNil(status.activeSession) }
            if name == "budgetClosedFutureW8" { XCTAssertEqual(status.refusal, .budgetClosed) }
        }
        let rig = try await Rig.make(); await rig.http.configure(status: json(shapes["unlimited"]!))
        try await rig.live(); let status = await rig.controller.latestStatus
        XCTAssertNil(status?.totalSeconds); XCTAssertEqual(status?.unlimited, true); await rig.close()
    }
    func testUnknownSessionStateAndNullableFieldsStillRefuseStartAndBridgeHasNoID() async throws {
        var body = try JSONSerialization.jsonObject(with: signedStatus(active: "future-open")) as! [String: Any]
        var open = body["active_session"] as! [String: Any]; open["expires_at"] = NSNull(); body["active_session"] = open
        body["total_seconds"] = NSNull(); body["unlimited"] = NSNull(); body["budget_open"] = NSNull()
        let status = try JSONDecoder().decode(VoiceStatus.self, from: json(body))
        XCTAssertEqual(status.activeSession?.state, .unknown("future-open")); XCTAssertEqual(status.refusal, .callOpen)
        let snapshot = String(data: try JSONEncoder().encode(status.bridgeValue), encoding: .utf8)!
        XCTAssertFalse(snapshot.contains(fixtureID)); XCTAssertFalse(snapshot.contains("\"id\""))
        let rig = try await Rig.make(); await rig.http.configure(status: json(body)); await rig.controller.start()
        let state = await rig.controller.state; XCTAssertEqual(state, .unavailable)
        let starts = await rig.http.count(.voiceStart); XCTAssertEqual(starts, 0)
        await rig.close()
    }
    func testDisabledPrecedesSignedOutAndStartDuringRefreshHasSpecificError() async throws {
        let disabled = try JSONDecoder().decode(VoiceStatus.self, from: signedStatus(signedIn: false, enabled: false))
        XCTAssertEqual(disabled.refusal, .disabled)
        let rig = try await Rig.make(); await rig.http.pauseNextStatus()
        let refreshing = Task { try await rig.controller.refreshStatus() }
        try await eventually { await rig.http.statusWaiter != nil }
        await rig.controller.start(); try await eventually { await rig.recorder.hasError(.statusChecking) }
        await rig.http.resumeStatus(); _ = try await refreshing.value; await rig.close()
    }
    func testSignedOutStatusSentBeforeSignInCannotClearNewCredential() async throws {
        let rig = try await Rig.make(); await rig.store.clear(); await rig.http.pauseNextStatus()
        let stale = Task { try await rig.client.status() }
        try await eventually { await rig.http.statusWaiter != nil }
        try await rig.client.consumeCode(challengeID: "fixture", code: "12345678")
        let fresh = await rig.store.read(); XCTAssertNotNil(fresh)
        await rig.http.resumeStatus(); let result = try await stale.value; XCTAssertFalse(result.signedIn)
        let confirmations = await rig.http.count(.communityStatus); XCTAssertEqual(confirmations, 0)
        let preserved = await rig.store.read(); XCTAssertEqual(preserved, fresh); await rig.close()
    }
    func testStale401NullMemberAndLogoutFailureCannotClearNewSignIn() async throws {
        for route in [AuthRoute.voiceStatus, .communityStatus, .logout] {
            let rig = try await Rig.make()
            let response = route == .communityStatus ? HTTPResponse(status: 200, body: json(["enabled": true, "member": NSNull()])) : HTTPResponse(status: route == .logout ? 503 : 401, body: json(["error": "Synthetic"]))
            await rig.http.setResponse(route, response); await rig.http.pauseResponse(route)
            let stale = Task {
                if route == .voiceStatus { _ = try? await rig.client.status() }
                else if route == .communityStatus { _ = try? await rig.client.communityStatus() }
                else { try? await rig.client.logout() }
            }
            try await eventually { await rig.http.responseWaiter != nil }
            try await rig.client.consumeCode(challengeID: "fixture", code: "12345678")
            let fresh = await rig.store.read(); await rig.http.resumeResponse(); await stale.value
            let preserved = await rig.store.read(); XCTAssertEqual(preserved, fresh); await rig.close()
        }
    }
    func testCredentialIsNotCodableOrReflectableAndOriginSeparatesKeychainItems() async throws {
        let credential = try SessionCredential(token: fixtureToken, expiresAt: .distantFuture)
        let opaque: any Sendable = credential
        XCTAssertFalse(opaque is any Encodable); XCTAssertFalse(opaque is any Decodable)
        XCTAssertTrue(Mirror(reflecting: credential).children.isEmpty)
        var reflected = ""; dump(credential, to: &reflected); XCTAssertFalse(reflected.contains(fixtureToken))
        XCTAssertEqual(try SessionCredential.fromStorage(credential.storageData()), credential)
        let production = await KeychainCredentialStore().service
        let first = await KeychainCredentialStore(policy: .loopback(port: 8901)).service
        let second = await KeychainCredentialStore(policy: .loopback(port: 8902)).service
        XCTAssertNotEqual(production, first); XCTAssertNotEqual(first, second)
        // Mismatched store/policy is rejected before any real Keychain read.
        let fixture = FixtureHTTP()
        let mismatched = VoiceHTTPClient(policy: .loopback(port: 8901), store: KeychainCredentialStore(), transport: fixture)
        do { _ = try await mismatched.status(); XCTFail() } catch { XCTAssertEqual(error as? VoiceFailure, .forbidden) }
        let requests = await fixture.requests; XCTAssertTrue(requests.isEmpty)
    }
    func testFastClockDoesNotRejectServerReservation() async throws {
        struct FastClock: VoiceClock {
            func now() async -> Date { Date().addingTimeInterval(86400) }
            func sleep(seconds: Double) async throws { try await Task.sleep(for: .seconds(seconds)) }
        }
        let rig = try await Rig.make(clock: FastClock())
        try await rig.store.write(SessionCredential(token: fixtureToken, expiresAt: .distantFuture))
        try await rig.live(); await rig.close()
        let finishes = await rig.http.count(.voiceFinish); XCTAssertEqual(finishes, 1)
    }
    func testInvalidStartResponseFinishesEveryValidRecoveredSessionID() async throws {
        for invalid in ["missing", "url", "remaining", "expiry", "oversized"] {
            let rig = try await Rig.make()
            var body: [String: Any] = ["session_id": fixtureID, "transport": "websocket", "remaining_seconds": 600,
                "expires_at": 0, "signed_url": "ws://127.0.0.1:8901/api/voice/connect?session_id=\(fixtureID)"]
            if invalid == "missing" { body.removeValue(forKey: "transport") }
            if invalid == "url" { body["signed_url"] = "wss://opax.com.au/api/voice/connect?session_id=\(fixtureID)" }
            if invalid == "remaining" { body["remaining_seconds"] = 0 }
            if invalid == "expiry" { body["expires_at"] = NSNull() }
            if invalid == "oversized" { body["padding"] = String(repeating: "x", count: 2 * 1024 * 1024) }
            await rig.http.configure(start: HTTPResponse(status: 201, body: json(body))); await rig.controller.start()
            let finishes = await rig.http.count(.voiceFinish); XCTAssertEqual(finishes, 1)
            let connects = await rig.relay.connects; XCTAssertEqual(connects, 0)
            let status = await rig.controller.latestStatus; XCTAssertEqual(status?.remainingSeconds, 600); await rig.close()
        }
    }
    func testStart403UsesFreshStatusRegardlessOfWordingAndRetainsCredential() async throws {
        for text in ["Reworded allowance", "Origin-looking prose", ""] {
            let rig = try await Rig.make()
            await rig.http.configure(start: HTTPResponse(status: 403, body: json(["error": text])), statusAfterStart: signedStatus(remaining: 0))
            await rig.controller.start(); try await eventually { await rig.recorder.hasError(.allowanceExhausted) }
            let credential = await rig.store.read(); XCTAssertNotNil(credential); await rig.close()
        }
    }
    func testRefreshAndLogoutExposeOnlyCoreFailures() async throws {
        let rig = try await Rig.make()
        await rig.http.setResponse(.voiceStatus, HTTPResponse(status: 200, body: Data("bad JSON".utf8)))
        do { _ = try await rig.controller.refreshStatus(); XCTFail() } catch { XCTAssertEqual(error, .invalidResponse) }
        await rig.http.failTransport()
        do { _ = try await rig.controller.refreshStatus(); XCTFail() } catch { XCTAssertEqual(error, .network) }
        do { try await rig.controller.logout(); XCTFail() } catch { XCTAssertEqual(error, .network) }
        await rig.close()
    }
    func testCaptureSleepsUntilBufferArrives() async throws {
        let rig = try await Rig.make(); try await rig.live()
        try await eventually { await rig.engine.captureWaiter != nil }
        let before = await rig.engine.captureReads; try await Task.sleep(for: .milliseconds(80))
        let after = await rig.engine.captureReads; XCTAssertEqual(after, before)
        await rig.engine.feed(CaptureBuffer(samples: Array(repeating: 0, count: 400), rate: 16000))
        try await eventually { await rig.relay.messages.count == 2 }; await rig.close()
    }
    func testPlaybackThreeThirtyAndOverBoundBurstsDoNotEndCallAndKeepReading() async throws {
        for seconds in [3, 30, 70] {
            let rig = try await Rig.make(); await rig.relay.metadata(input: "pcm_8000", output: "pcm_8000"); await rig.controller.start()
            try await eventually { await rig.controller.state == .live }
            let audio = Data(repeating: 0, count: seconds * 8000 * 2)
            await rig.relay.enqueue(.data(json(["type": "audio", "audio_event": ["event_id": 1, "audio_base_64": audio.base64EncodedString()]])))
            if seconds <= 30 { try await eventually { await rig.engine.queued == seconds * 8000 } }
            else { try await eventually { await rig.engine.queued == 30 * 8000 }; try await eventually { await rig.recorder.items.contains(.playback(.truncated)) } }
            let state = await rig.controller.state; XCTAssertEqual(state, .live)
            let depth = await rig.engine.maxQueued; XCTAssertLessThanOrEqual(depth, 30 * 8000)
            await rig.relay.enqueue(.data(json(["type": "ping", "ping_event": ["event_id": 99]])))
            try await eventually { await rig.relay.messages.contains { String(data: $0, encoding: .utf8)!.contains("99") } }
            let failure = await rig.recorder.hasError(.queueOverflow); XCTAssertFalse(failure); await rig.close()
        }
    }
    func testPollingUsesExpiryBackoffAndAttemptCap() async throws {
        actor StepClock: VoiceClock {
            var time = Date(), delays: [Double] = []
            func now() -> Date { time }
            func sleep(seconds: Double) async { delays.append(seconds); time = time.addingTimeInterval(seconds); await Task.yield() }
        }
        for expired in [false, true] {
            let clock = StepClock(); var timing = CallTiming(); timing.pollMaxInterval = 30; timing.pollMaxAttempts = 4
            let rig = try await Rig.make(timing: timing, clock: clock)
            try await rig.store.write(SessionCredential(token: fixtureToken, expiresAt: .distantFuture))
            var body = try JSONSerialization.jsonObject(with: signedStatus(active: "reserved")) as! [String: Any]
            var open = body["active_session"] as! [String: Any]
            open["expires_at"] = (await clock.now()).timeIntervalSince1970 + (expired ? -100 : 20); body["active_session"] = open
            await rig.http.configure(status: json(body)); _ = try await rig.controller.refreshStatus()
            try await eventually { await rig.http.count(.voiceStatus) == 5 }
            let delays = await clock.delays; XCTAssertEqual(delays.count, 4)
            if expired { XCTAssertEqual(delays, [2,4,8,16]) } else { XCTAssertEqual(delays[0], 20.5, accuracy: 0.01) }
            try await Task.sleep(for: .milliseconds(30)); let count = await rig.http.count(.voiceStatus); XCTAssertEqual(count, 5)
            await rig.close()
        }
    }
    func testCoreTransportGuardProtectsRealSessionsAndFactories() async throws {
        await VoiceTestSafety.$isolated.withValue(VoiceTestSafety.Monitor()) {
            let session = AuthenticatedURLSession()
            let request = URLRequest(url: URL(string: "https://opax.com.au/api/voice/status")!)
            do { _ = try await session.send(request); XCTFail() } catch { XCTAssertEqual(error as? VoiceFailure, .forbidden) }
            var socket = URLRequest(url: URL(string: "wss://opax.com.au/api/voice/connect?session_id=\(fixtureID)")!)
            socket.setValue("convai", forHTTPHeaderField: "Sec-WebSocket-Protocol"); socket.setValue("https://opax.com.au", forHTTPHeaderField: "Origin")
            do { _ = try await URLSessionRelayFactory(session: session).connect(socket); XCTFail() } catch { XCTAssertEqual(error as? VoiceFailure, .forbidden) }
            let audit = VoiceTestSafety.audit(); XCTAssertEqual(audit.inputOpens, 0); XCTAssertEqual(audit.outputOpens, 0); XCTAssertEqual(audit.hosts, ["opax.com.au"])

            XCTAssertFalse(VoiceTestSafety.audit().isClean)
        }
    }
}
