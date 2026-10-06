import XCTest
@testable import OpaxVoiceCore

@MainActor final class CallTests: SafeVoiceTestCase {
    func testIdleReadyAndCancellationDuringStatusRead() async throws {
        let rig = try await Rig.make()
        let initial = await rig.controller.state; XCTAssertEqual(initial, .idle)
        _ = try await rig.controller.refreshStatus()
        let ready = await rig.controller.state; XCTAssertEqual(ready, .ready)
        await rig.http.pauseNextStatus()
        let task = Task { await rig.controller.start() }
        try await eventually { await rig.http.count(.voiceStatus) == 2 }
        await rig.controller.end(); await rig.http.resumeStatus(); await task.value
        let state = await rig.controller.state; XCTAssertEqual(state, .ended)
        let starts = await rig.http.count(.voiceStart); XCTAssertEqual(starts, 0)
        await rig.close()
    }
    func testReceiverTeardownFreshReadIgnoresItsOwnTaskCancellation() async throws {
        let rig = try await Rig.make(); try await rig.live()
        await rig.http.configure(status: signedStatus(remaining: 123))
        await rig.relay.enqueue(.closed(RelayClose(code: 1000)))
        try await eventually { await rig.controller.state == .ended }
        let status = await rig.controller.latestStatus; XCTAssertEqual(status?.remainingSeconds, 123)
        let count = await rig.http.count(.voiceFinish); XCTAssertEqual(count, 1)
        await rig.close()
    }
    func testLevelsStreamOnlyWhileLiveAndSettleSilentAtEnd() async throws {
        let rig = try await Rig.make()
        let seen = LevelRecorder()
        let reading = Task { for await value in rig.controller.levels { await seen.record(value) } }
        await rig.engine.setMeter(AudioLevels(input: 0.4, output: 0.7))
        try await rig.live()
        try await eventually { await seen.items.contains(AudioLevels(input: 0.4, output: 0.7)) }
        await rig.controller.end()
        try await eventually { await seen.items.last == .silent }
        let count = await seen.items.count
        try await Task.sleep(for: .milliseconds(250))
        let after = await seen.items.count; XCTAssertEqual(after, count)
        reading.cancel(); await rig.close()
    }
    func testFailedFreshStatusDoesNotExposeCachedAllowance() async throws {
        let rig = try await Rig.make(); _ = try await rig.controller.refreshStatus()
        await rig.http.setResponse(.voiceStatus, HTTPResponse(status: 503, body: json(["error": "Synthetic failure"])))
        do { _ = try await rig.controller.refreshStatus(); XCTFail() } catch {}
        let status = await rig.controller.latestStatus; XCTAssertNil(status)
        let state = await rig.controller.state; XCTAssertEqual(state, .failed); await rig.close()
    }
    func testHappyPathEveryNormalStateAndFreshStatusAfterFinish() async throws {
        let rig = try await Rig.make(); try await rig.live()
        await rig.controller.setMuted(true)
        await rig.engine.feed(CaptureBuffer(samples: [Float](repeating: 1, count: 400), rate: 16000))
        try await eventually { await rig.relay.messages.count >= 2 }
        let data = await rig.relay.messages[1]
        let object = try JSONSerialization.jsonObject(with: data) as! [String: String]
        let bytes = Data(base64Encoded: object["user_audio_chunk"]!)!
        XCTAssertTrue(bytes.allSatisfy { $0 == 0 })
        await rig.controller.end()
        try await eventually { await rig.controller.state == .ended }
        let status = await rig.controller.latestStatus; XCTAssertEqual(status?.remainingSeconds, 600)
        let finishCount = await rig.http.count(.voiceFinish); XCTAssertEqual(finishCount, 1)
        let statuses = await rig.http.count(.voiceStatus); XCTAssertEqual(statuses, 2)
        let awake = await rig.session.awake; XCTAssertFalse(awake)
        try await eventually { await rig.recorder.items.contains(.state(.ended, reason: .user)) }
        let events = await rig.recorder.items
        let states = events.compactMap { event -> CallState? in if case .state(let state, _) = event { state } else { nil } }
        for state in [CallState.checking, .ready, .reserving, .connecting, .live, .ending, .ended] { XCTAssertTrue(states.contains(state)) }
        await rig.close()
    }
    func testStatusRefusalsBeforePermissionOrReservation() async throws {
        let cases: [(Data, VoiceFailure)] = [
            (signedStatus(signedIn: false), .signedOut), (signedStatus(enabled: false), .disabled),
            (signedStatus(remaining: 0), .allowanceExhausted), (signedStatus(budget: false), .budgetClosed),
            (signedStatus(active: "reserved"), .callOpen), (signedStatus(active: "connecting"), .callOpen), (signedStatus(active: "active"), .callOpen)]
        for (status, refusal) in cases {
            let rig = try await Rig.make(); await rig.http.configure(status: status); await rig.controller.start()
            let state = await rig.controller.state; XCTAssertEqual(state, .unavailable)
            let permissionCount = await rig.permission.count; XCTAssertEqual(permissionCount, 0)
            let starts = await rig.http.count(.voiceStart); XCTAssertEqual(starts, 0)
            try await eventually { await rig.recorder.hasError(refusal) }; await rig.close()
        }
    }
    func testConsentAndMicrophoneRefusedBeforeReserving() async throws {
        for consent in [false,true] {
            let rig = try await Rig.make()
            await rig.consent.set(consent); if consent { await rig.permission.set(false) }
            await rig.controller.start()
            try await eventually { await rig.recorder.hasError(consent ? .microphoneDenied : .consentRequired) }
            let starts = await rig.http.count(.voiceStart); XCTAssertEqual(starts, 0)
            await rig.close()
        }
    }
    func testStart409403429And503NeverRetryBlindly() async throws {
        for (code, body, refusal) in [
            (409, ["error": "Open"], VoiceFailure.callOpen),
            (403, ["error": "You have used your ten free minutes of voice conversation."], .allowanceExhausted),
            (429, ["error": "Busy", "reason": "budget"], .budgetClosed),
            (429, ["error": "Busy", "reason": "capacity"], .capacity),
            (429, ["error": "Busy"], .rateLimited), (503, ["error": "Synthetic error"], .unavailable)] {
            let rig = try await Rig.make()
            await rig.http.configure(start: HTTPResponse(status: code, body: json(body)), statusAfterStart: refusal == .allowanceExhausted ? signedStatus(remaining: 0) : nil)
            await rig.controller.start()
            try await eventually { await rig.recorder.hasError(refusal) }
            let starts = await rig.http.count(.voiceStart); XCTAssertEqual(starts, 1)
            let statuses = await rig.http.count(.voiceStatus); XCTAssertEqual(statuses, code == 403 ? 3 : 2)
            let connects = await rig.relay.connects; XCTAssertEqual(connects, 0)
            await rig.close()
        }
    }
    func testStart503WithUnknownReservationPollsWithoutFinish() async throws {
        var timing = CallTiming(); timing.pollInterval = 0.05; timing.pollMaxInterval = 0.05
        let rig = try await Rig.make(timing: timing)
        await rig.http.configure(start: HTTPResponse(status: 503, body: json(["error": "Synthetic failure"])))
        let startTask = Task { await rig.controller.start() }
        try await eventually { await rig.http.count(.voiceStart) == 1 }
        await rig.http.configure(status: signedStatus(active: "reserved"), start: HTTPResponse(status: 503, body: json(["error": "Synthetic failure"])))
        await startTask.value
        // Refresh also exposes the held row when the status raced the initial failure.
        _ = try await rig.controller.refreshStatus()
        let finish = await rig.http.count(.voiceFinish); XCTAssertEqual(finish, 0)
        let status = await rig.controller.latestStatus; XCTAssertEqual(status?.remainingSeconds, 600)
        await rig.http.configure(status: signedStatus())
        try await eventually { await rig.controller.state == .ready }; await rig.close()
    }
    func testCancellationWhilePermissionPendingAndNoDuplicateStart() async throws {
        let rig = try await Rig.make(); await rig.permission.pause()
        let task = Task { await rig.controller.start() }
        try await eventually { await rig.permission.count == 1 }
        await rig.controller.start(); await rig.controller.end(); await rig.permission.resume(); await task.value
        let starts = await rig.http.count(.voiceStart); XCTAssertEqual(starts, 0)
        let count = await rig.permission.count; XCTAssertEqual(count, 1); await rig.close()
    }
    func testCancellationWhileReservationPendingFinishesLateRow() async throws {
        let rig = try await Rig.make(); await rig.http.pauseStart()
        let task = Task { await rig.controller.start() }
        try await eventually { await rig.controller.state == .reserving }
        await rig.controller.end(); await rig.http.resumeStart(); await task.value
        let count = await rig.http.count(.voiceFinish); XCTAssertEqual(count, 1)
        let connects = await rig.relay.connects; XCTAssertEqual(connects, 0); await rig.close()
    }
    func testCancellationWhileConnectingAndRepeatedEndAreIdempotent() async throws {
        let rig = try await Rig.make(); await rig.controller.start()
        let state = await rig.controller.state; XCTAssertEqual(state, .connecting)
        await rig.controller.end(); await rig.controller.end()
        let closes = await rig.relay.closes; XCTAssertEqual(closes, 1)
        let finishes = await rig.http.count(.voiceFinish); XCTAssertEqual(finishes, 1); await rig.close()
    }
    func testLogoutWaitsForExistingTeardownBeforeRevokingSession() async throws {
        let rig = try await Rig.make(); try await rig.live()
        await rig.http.pauseNextStatus()
        let ending = Task { await rig.controller.end() }
        try await eventually { await rig.http.count(.voiceStatus) == 2 }
        let logout = Task { try await rig.controller.logout() }
        try await Task.sleep(for: .milliseconds(30))
        let before = await rig.http.count(.logout); XCTAssertEqual(before, 0)
        await rig.http.resumeStatus(); await ending.value; try await logout.value
        let after = await rig.http.count(.logout); XCTAssertEqual(after, 1)
        let credential = await rig.store.read(); XCTAssertNil(credential)
        await rig.close()
    }
    func testConnectTimeoutClosesAndRefreshes() async throws {
        var timing = CallTiming(); timing.connectTimeout = 0.03
        let rig = try await Rig.make(timing: timing); await rig.controller.start()
        try await eventually { await rig.recorder.hasError(.timeout) }
        let finishes = await rig.http.count(.voiceFinish); XCTAssertEqual(finishes, 1)
        let state = await rig.controller.state; XCTAssertEqual(state, .failed); await rig.close()
    }
    func testUpgradeMayTakeLongerThanTenSecondsBeforeInitiation() async throws {
        let rig = try await Rig.make(clock: ScaledClock())
        await rig.relay.pauseHandshake(); await rig.relay.metadata()
        let starting = Task { await rig.controller.start() }
        try await eventually { await rig.relay.handshakeWaiter != nil }
        // Accelerated clock: 18 seconds before upgrade, below the 35-second
        // connection limit. The relay's ten seconds only starts after upgrade.
        try await Task.sleep(for: .milliseconds(180))
        let state = await rig.controller.state
        XCTAssertEqual(state, .connecting)
        await rig.relay.resumeHandshake(); await starting.value
        try await eventually { await rig.controller.state == .live }
        await rig.close()
    }
    func testUnsupportedFormatFailsBeforeEngineAllocationAndMissingInputDefaults() async throws {
        let rig = try await Rig.make(); await rig.relay.metadata(output: "opus_48000"); await rig.controller.start()
        try await eventually { await rig.recorder.hasError(.unsupportedFormat) }
        let starts = await rig.engine.starts; XCTAssertEqual(starts, 0); await rig.close()
        let defaultRig = try await Rig.make(); await defaultRig.relay.metadata(input: nil); await defaultRig.controller.start()
        try await eventually { await defaultRig.controller.state == .live }; await defaultRig.close()
    }
    func testAudioSessionEngineAndRouteFailuresEndAndRefresh() async throws {
        for step in 0..<3 {
            let rig = try await Rig.make()
            if step == 0 { await rig.session.fail() }
            if step == 1 { await rig.engine.fail(start: true) }
            if step == 2 { try await rig.live(); await rig.engine.fail(route: true); await rig.controller.handle(.configurationChanged) }
            else { await rig.relay.metadata(); await rig.controller.start() }
            try await eventually { await rig.recorder.hasError(.audio) }
            let statuses = await rig.http.count(.voiceStatus); XCTAssertEqual(statuses, 2); await rig.close()
        }
    }
    func testLifecycleBothOSNotificationFormsNoAutoRestart() async throws {
        let endings: [(LifecycleEvent,EndReason)] = [(.interruptionBegan,.interruption),(.becameInactive,.interruption),(.background,.background),(.mediaServicesReset,.mediaReset)]
        for (event, reason) in endings {
            let rig = try await Rig.make(); try await rig.live(); rig.lifecycle.emit(event)
            try await eventually { await rig.recorder.items.contains(.state(.ended, reason: reason)) }
            await rig.controller.handle(.interruptionEnded); await rig.controller.handle(.resumptionRecommended); await rig.controller.handle(.foreground)
            let starts = await rig.http.count(.voiceStart); XCTAssertEqual(starts, 1); await rig.close()
        }
    }
    func testInactiveAndRouteChangesKeepSocket() async throws {
        let rig = try await Rig.make(); try await rig.live()
        await rig.controller.handle(.sceneInactive); await rig.controller.handle(.configurationChanged)
        let state = await rig.controller.state; XCTAssertEqual(state, .live)
        let routes = await rig.engine.routes; XCTAssertEqual(routes, 1)
        let closes = await rig.relay.closes; XCTAssertEqual(closes, 0)
        await rig.controller.withdrawConsent()
        try await eventually { await rig.recorder.items.contains(.state(.ended, reason: .consentWithdrawn)) }; await rig.close()
    }
    func testPlaybackOrderBoundsInterruptionStaleDropAndDrainMode() async throws {
        let rig = try await Rig.make(); try await rig.live()
        func audio(id: Int, value: Float, count: Int = 400) throws -> RelayMessage {
            .data(json(["type": "audio", "audio_event": ["event_id": id, "audio_base_64": AudioCodec.encode([Float](repeating: value, count: count), format: try AudioFormat("pcm_16000")).base64EncodedString()]]))
        }
        await rig.relay.enqueue(try audio(id: 1, value: 0.25)); await rig.relay.enqueue(try audio(id: 2, value: 0.5))
        try await eventually { await rig.engine.played.count == 2 }
        let played = await rig.engine.played; XCTAssertEqual(played[0][0], 0.25, accuracy: 0.0001); XCTAssertEqual(played[1][0], 0.5, accuracy: 0.0001)
        await rig.relay.enqueue(.data(json(["type": "interruption", "interruption_event": ["event_id": 3]])))
        await rig.relay.enqueue(try audio(id: 2, value: 1))
        try await eventually { await rig.engine.flushes == 2 } // initial epoch installation, then interruption
        let total = await rig.engine.played.count; XCTAssertEqual(total, 2)
        await rig.engine.drainPlayback(); try await eventually { await rig.recorder.items.contains(.mode(.listening)) }
        await rig.relay.enqueue(try audio(id: 4, value: 0, count: 32001))
        try await eventually { await rig.engine.played.count == 5 }
        let stateAfterAudio = await rig.controller.state; XCTAssertEqual(stateAfterAudio, .live)
        await rig.close()
    }
    func testStalledSendEndsAtTwoSecondBound() async throws {
        let rig = try await Rig.make(); try await rig.live(); await rig.relay.stallAudio()
        await rig.engine.feed(CaptureBuffer(samples: [Float](repeating: 0, count: 16000), rate: 16000))
        try await eventually { await rig.relay.messages.count > 1 }
        await rig.engine.feed(CaptureBuffer(samples: [Float](repeating: 0, count: 16001), rate: 16000))
        await rig.engine.feed(CaptureBuffer(samples: [Float](repeating: 0, count: 400), rate: 16000))
        try await eventually { await rig.recorder.hasError(.queueOverflow) }; await rig.close()
    }
    func testCloseCodesAndDeadlineUsesFreshStatusForReason() async throws {
        for (code, failure) in [(1000, Optional<VoiceFailure>.none),(1008,.policy),(1011,.network),(1006,.network)] {
            let rig = try await Rig.make(); try await rig.live()
            await rig.relay.enqueue(.closed(RelayClose(code: code, reason: "Voice conversation ended")))
            try await eventually { let state = await rig.controller.state; return state == (failure == nil ? .ended : .failed) }
            if let failure { try await eventually { await rig.recorder.hasError(failure) } }; await rig.close()
        }
        for (status, reason) in [(signedStatus(remaining: 0), EndReason.allowanceExhausted),
                                 (signedStatus(remaining: 300, budget: false),.budgetClosed),
                                 (signedStatus(unlimited: true),.callLimit)] {
            let rig = try await Rig.make(); try await rig.live(); await rig.http.configure(status: status)
            await rig.relay.enqueue(.closed(RelayClose(code: 1000, reason: "Your free voice time has finished")))
            try await eventually { await rig.recorder.items.contains(.state(.ended, reason: reason)) }; await rig.close()
        }
    }
    func testAgentEndToolAndMaxDurationError() async throws {
        for event in [["type": "agent_tool_response", "agent_tool_response": ["tool_name": "end_call"]] as [String: Any],
                      ["type": "error", "error_event": ["error_type": "max_duration_exceeded"]]] {
            let rig = try await Rig.make(); try await rig.live(); await rig.relay.enqueue(.data(json(event)))
            try await eventually { await rig.controller.state == .ended }; await rig.close()
        }
    }
    func testAbnormalCloseRecoversOnlyFreshConfirmedDeadlineSignals() async throws {
        let rows: [(Data, CallState, EndReason)] = [
            (signedStatus(remaining: 0), .ended, .allowanceExhausted),
            (signedStatus(remaining: 300, budget: false), .ended, .budgetClosed),
            (signedStatus(remaining: 300), .failed, .network),
            (signedStatus(unlimited: true), .failed, .network),
            (signedStatus(remaining: 0, signedIn: false), .failed, .network),
            (signedStatus(remaining: 0, enabled: false), .ended, .allowanceExhausted)
        ]
        for (body, state, reason) in rows {
            let rig = try await Rig.make(); try await rig.live()
            await rig.http.configure(status: body)
            await rig.relay.enqueue(.closed(RelayClose(code: 1006, reason: "Your free voice time has finished")))
            try await eventually { await rig.recorder.items.contains(.state(state, reason: reason)) }
            let status = await rig.controller.latestStatus; XCTAssertEqual(status?.remainingSeconds, try JSONDecoder().decode(VoiceStatus.self, from: body).remainingSeconds)
            let network = await rig.recorder.hasError(.network); XCTAssertEqual(network, state == .failed)
            await rig.close()
        }
    }
    func testAbnormalCloseWithFailedStatusStaysNetworkAndPolicyFaultsStayFailures() async throws {
        for code in [1006, 1008, 1011] {
            let rig = try await Rig.make(); try await rig.live()
            if code == 1006 {
                await rig.http.setResponse(.voiceStatus, HTTPResponse(status: 503, body: json(["error": "Synthetic unavailable"])))
            } else { await rig.http.configure(status: signedStatus(remaining: 0)) }
            await rig.relay.enqueue(.closed(RelayClose(code: code)))
            try await eventually { await rig.controller.state == .failed }
            let error = await rig.recorder.hasError(code == 1008 ? .policy : .network); XCTAssertTrue(error)
            if code == 1006 { let unavailable = await rig.recorder.hasError(.unavailable); XCTAssertTrue(unavailable) }
            await rig.close()
        }
    }
    func testTextActivityAndContextUpdateLimits() async throws {
        let rig = try await Rig.make(); try await rig.live()
        try await rig.controller.sendText("Synthetic input"); try await rig.controller.contextualUpdate("Synthetic context"); try await rig.controller.userActivity()
        do { try await rig.controller.sendText(String(repeating: "x", count: 2001)); XCTFail() } catch { XCTAssertEqual(error as? VoiceFailure, .policy) }
        let messages = await rig.relay.messages; XCTAssertEqual(messages.count, 4); await rig.close()
    }
}

actor LevelRecorder {
    var items: [AudioLevels] = []
    func record(_ value: AudioLevels) { items.append(value) }
}
