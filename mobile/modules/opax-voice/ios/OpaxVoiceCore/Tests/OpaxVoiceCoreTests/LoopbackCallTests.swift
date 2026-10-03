import XCTest
@testable import OpaxVoiceCore

@MainActor final class LoopbackCallTests: SafeVoiceTestCase {
    private func fixture(_ scenario: LoopbackRelay.Scenario = .conversation, timing: CallTiming = CallTiming()) async throws -> (LoopbackRelay, Rig) {
        let server = try LoopbackRelay(scenario: scenario), port = try await server.start()
        let rig = try await Rig.make(relays: GuardedRelayFactory(port: port), port: port, timing: timing)
        return (server, rig)
    }
    func testRealLoopbackHandshakeCannedConversationAndSilence() async throws {
        let (server, rig) = try await fixture()
        await rig.controller.start()
        try await eventually { await rig.controller.state == .live }
        try await eventually { await server.snapshot().pongIDs == [42] }
        for _ in 0..<4 {
            await rig.engine.feed(CaptureBuffer(samples: [Float](repeating: 0, count: 400), rate: 16000))
            try await Task.sleep(for: .milliseconds(25))
        }
        try await eventually { await server.snapshot().audioSizes.count == 4 }
        try await eventually { await rig.recorder.items.contains(where: { if case .sources(let sources) = $0 { sources.count == 3 } else { false } }) }
        try await rig.controller.sendText("Synthetic text"); try await rig.controller.contextualUpdate("Synthetic context"); try await rig.controller.userActivity()
        let log = await server.snapshot()
        XCTAssertEqual(log.headers["cookie"], "__Host-opax_session=\(fixtureToken)")
        XCTAssertEqual(log.headers["origin"], "https://opax.com.au")
        XCTAssertEqual(log.types.first, "conversation_initiation_client_data")
        XCTAssertEqual(log.audioSizes, [800,800,800,800]); XCTAssertTrue(log.allAudioSilent)
        XCTAssertEqual(log.peers, ["127.0.0.1"])
        let played = await rig.engine.played
        XCTAssertEqual(played.count, 1); XCTAssertTrue(played.flatMap { $0 }.allSatisfy { $0 == 0 })
        let events = await rig.recorder.items
        XCTAssertTrue(events.contains { if case .transcript(let turns) = $0 { turns.contains(where: { $0.text == "Synthetic corrected greeting" }) } else { false } })
        await rig.controller.end()
        let status = await rig.controller.latestStatus; XCTAssertEqual(status?.remainingSeconds, 600)
        await rig.close(); await server.stop()
        let audit = VoiceTestSafety.audit()
        XCTAssertEqual(audit.inputOpens, 0); XCTAssertEqual(audit.outputOpens, 0); XCTAssertEqual(audit.hosts, ["127.0.0.1"])
        print("AUDIT: measured input opens=\(audit.inputOpens) output opens=\(audit.outputOpens); hosts=\(audit.hosts.sorted())")
    }
    func testLoopbackMuLawMetadataAndSyntheticAudio() async throws {
        let (server, rig) = try await fixture(.ulaw); await rig.controller.start()
        try await eventually { await rig.controller.state == .live }
        await rig.engine.feed(CaptureBuffer(samples: [Float](repeating: 0, count: 200), rate: 8000))
        try await eventually { await server.snapshot().audioSizes == [200] }
        let log = await server.snapshot(); XCTAssertTrue(log.allAudioSilent)
        await rig.close(); await server.stop()
    }
    func testLoopbackUnknownFormatAndMetadataTimeout() async throws {
        for scenario in [LoopbackRelay.Scenario.unsupported, .noMetadata] {
            var timing = CallTiming(); timing.connectTimeout = 0.2
            let (server, rig) = try await fixture(scenario, timing: timing); await rig.controller.start()
            try await eventually { await rig.controller.state == .failed }
            let count = await rig.engine.starts; XCTAssertEqual(count, 0)
            await rig.close(); await server.stop()
        }
    }
    func testLoopbackDeadlinePersonalBudgetAndUnlimited() async throws {
        for (status, reason) in [(signedStatus(remaining: 0), EndReason.allowanceExhausted),
                                 (signedStatus(remaining: 300, budget: false), .budgetClosed),
                                 (signedStatus(unlimited: true), .callLimit)] {
            let (server, rig) = try await fixture(.quiet); await rig.controller.start()
            try await eventually { await rig.controller.state == .live }
            await rig.http.configure(status: status)
            await server.close(code: 1000, reason: "Your free voice time has finished")
            try await eventually { await rig.recorder.items.contains(.state(.ended, reason: reason)) }
            await rig.close(); await server.stop()
        }
    }
    func testLoopbackProviderCloseAndPolicyClose() async throws {
        for (code, reason, failure) in [(UInt16(1000), "Voice conversation ended", Optional<VoiceFailure>.none),
                                       (1011, "Voice provider connection interrupted", .network),
                                       (1008, "Initiation timeout", .policy)] {
            let (server, rig) = try await fixture(.quiet); await rig.controller.start()
            try await eventually { await rig.controller.state == .live }
            await server.close(code: code, reason: reason)
            try await eventually { await rig.controller.state == (failure == nil ? .ended : .failed) }
            if let failure { try await eventually { await rig.recorder.hasError(failure) } }
            await rig.close(); await server.stop()
        }
    }
    func testLoopbackAbnormalDropAndReconnectRefusedUntilStatusClears() async throws {
        var timing = CallTiming(); timing.pollInterval = 0.05; timing.pollMaxInterval = 0.05
        let (server, rig) = try await fixture(.quiet, timing: timing)
        await rig.controller.start(); try await eventually { await rig.controller.state == .live }
        await rig.http.configure(status: signedStatus(active: "active")); await server.drop()
        try await eventually { await rig.controller.state == .failed }
        await rig.controller.start()
        let state = await rig.controller.state; XCTAssertEqual(state, .unavailable)
        let starts = await rig.http.count(.voiceStart); XCTAssertEqual(starts, 1)
        let log = await server.snapshot(); XCTAssertEqual(log.peers.count, 1)
        await rig.http.configure(status: signedStatus(remaining: 0)) // fixture expiry fully charges reservation
        try await eventually { await rig.controller.latestStatus?.activeSession == nil }
        let after = await rig.controller.latestStatus; XCTAssertEqual(after?.remainingSeconds, 0)
        await rig.close(); await server.stop()
    }
    func testNewCallAfterDropGetsFreshReservationAndSocket() async throws {
        let (server, rig) = try await fixture(.quiet)
        await rig.controller.start(); try await eventually { await rig.controller.state == .live }
        await server.drop(); try await eventually { await rig.controller.state == .failed }
        // An explicit retry can still race a server-side open row: the 409 is never retried.
        await rig.http.configure(start: HTTPResponse(status: 409, body: json(["error": "Open"])))
        await rig.controller.start()
        let refusedCount = await rig.http.count(.voiceStart); XCTAssertEqual(refusedCount, 2)
        await rig.http.configure(status: signedStatus(), start: nil)
        await rig.controller.start(); try await eventually { await rig.controller.state == .live }
        let requests = await rig.http.requests.filter { $0.url?.path == AuthRoute.voiceStart.rawValue }
        XCTAssertEqual(requests.count, 3)
        let log = await server.snapshot(); XCTAssertEqual(log.peers.count, 2)
        await rig.close(); await server.stop()
    }
    func testLoopbackUpgrade503ReleasedReservedConnectingActiveAndRevoked401() async throws {
        for active in [Optional<String>.none, "reserved", "connecting", "active"] {
            var timing = CallTiming(); timing.pollInterval = 0.05; timing.pollMaxInterval = 0.05
            let (server, rig) = try await fixture(.refuse(503), timing: timing)
            // Status is clear before reservation, then changes when the fixture accepts start.
            await rig.http.pauseStart()
            let task = Task { await rig.controller.start() }
            try await eventually { await rig.controller.state == .reserving }
            await rig.http.configure(status: signedStatus(active: active)); await rig.http.resumeStart(); await task.value
            try await eventually { await rig.recorder.hasError(.unavailable) }
            let finish = await rig.http.count(.voiceFinish); XCTAssertEqual(finish, 1)
            let status = await rig.controller.latestStatus; XCTAssertEqual(status?.remainingSeconds, 600)
            if active != nil {
                await rig.controller.start()
                let count = await rig.http.count(.voiceStart); XCTAssertEqual(count, 1)
                let remaining = (active == "connecting" || active == "active") ? 0 : 600
                await rig.http.configure(status: signedStatus(remaining: remaining))
                try await eventually { await rig.controller.latestStatus?.activeSession == nil }
                let cleared = await rig.controller.latestStatus; XCTAssertEqual(cleared?.remainingSeconds, remaining)
            }
            await rig.close(); await server.stop()
        }
        let (server, rig) = try await fixture(.refuse(401)); await rig.controller.start()
        try await eventually { await rig.recorder.hasError(.signedOut) }
        let credential = await rig.store.read(); XCTAssertNil(credential)
        let status = await rig.controller.latestStatus; XCTAssertEqual(status?.signedIn, false)
        await rig.close(); await server.stop()
    }
    func testLoopbackPreflightFixtureRowsAllowanceBudgetCapacityAndRevocation() async throws {
        for (response, failure) in [(HTTPResponse(status: 403, body: json(["error": "You have used your ten free minutes of voice conversation."])), VoiceFailure.allowanceExhausted),
                                    (HTTPResponse(status: 429, body: json(["error": "Busy", "reason": "budget"])), .budgetClosed),
                                    (HTTPResponse(status: 429, body: json(["error": "Busy", "reason": "capacity"])), .capacity),
                                    (HTTPResponse(status: 401, body: json(["error": "Revoked"])), .signedOut)] {
            let (server, rig) = try await fixture(.quiet)
            await rig.http.configure(start: response, statusAfterStart: failure == .allowanceExhausted ? signedStatus(remaining: 0) : nil); await rig.controller.start()
            try await eventually { await rig.recorder.hasError(failure) }
            let log = await server.snapshot(); XCTAssertTrue(log.peers.isEmpty)
            let status = await rig.controller.latestStatus
            if failure == .signedOut { XCTAssertEqual(status?.signedIn, false) }
            if failure == .allowanceExhausted { XCTAssertEqual(status?.remainingSeconds, 0) }
            if failure == .budgetClosed { XCTAssertEqual(status?.budgetOpen, false) }
            await rig.close(); await server.stop()
        }
    }
}
