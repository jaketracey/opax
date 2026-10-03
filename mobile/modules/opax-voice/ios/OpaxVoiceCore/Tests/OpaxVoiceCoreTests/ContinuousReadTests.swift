import Foundation
import XCTest
@testable import OpaxVoiceCore

@MainActor final class ContinuousReadTests: SafeVoiceTestCase {
    private func audio(seconds: Int = 1, id: Int = 1) -> Data {
        json(["type": "audio", "audio_event": ["event_id": id,
            "audio_base_64": Data(repeating: 0, count: seconds * 16000 * 2).base64EncodedString()]])
    }
    private func deepCall() async throws -> (LoopbackRelay, Rig) {
        let server = try LoopbackRelay(scenario: .quiet), port = try await server.start()
        let rig = try await Rig.make(relays: GuardedRelayFactory(port: port), port: port)
        await rig.controller.start(); try await eventually { await rig.controller.state == .live }
        try await fillPlayback(server, rig)
        return (server, rig)
    }
    private func fillPlayback(_ server: LoopbackRelay, _ rig: Rig) async throws {
        for _ in 0..<30 { await server.broadcast(audio()) }
        try await eventually { await rig.engine.queued == 30 * 16000 }
        for _ in 0..<5 { await server.broadcast(audio()) }
        try await eventually { await rig.controller.bufferedPlaybackSamples() == 35 * 16000 }
    }
    func testRealSocketInterruptionImmediatelyFlushesThirtyFiveSecondsAndBacklog() async throws {
        let (server, rig) = try await deepCall()
        await server.broadcast(json(["type": "interruption", "interruption_event": ["event_id": 9]]))
        try await eventually { await rig.engine.flushes == 2 }
        let queued = await rig.controller.bufferedPlaybackSamples(); XCTAssertEqual(queued, 0)
        await server.broadcast(audio(id: 1)); try await Task.sleep(for: .milliseconds(30))
        let after = await rig.controller.bufferedPlaybackSamples(); XCTAssertEqual(after, 0)
        let state = await rig.controller.state; XCTAssertEqual(state, .live)
        await server.broadcast(audio(id: 10)); try await eventually { await rig.engine.queued == 16000 }
        await rig.close(); await server.stop()
    }
    func testRealSocketPingIsAnsweredWithThirtyFiveSecondsStillQueued() async throws {
        let (server, rig) = try await deepCall()
        await server.broadcast(json(["type": "ping", "ping_event": ["event_id": 991]]))
        try await eventually { await server.snapshot().pongIDs.contains(991) }
        let queued = await rig.engine.queued; XCTAssertEqual(queued, 30 * 16000)
        let state = await rig.controller.state; XCTAssertEqual(state, .live)
        await rig.close(); await server.stop()
    }
    func testRealSocketDeadlineCloseEndsAsDeadlineWhilePlaybackIsDeep() async throws {
        let (server, rig) = try await deepCall()
        await server.close(code: 1000, reason: "Your free voice time has finished")
        try await eventually { await rig.controller.state == .ended }
        let events = await rig.recorder.items
        XCTAssertTrue(events.contains(.state(.ended, reason: .deadline)))
        XCTAssertFalse(events.contains(.error(.network)))
        XCTAssertFalse(events.contains { if case .state(.failed, _) = $0 { true } else { false } })
        await rig.close(); await server.stop()
    }
    func testRealSocketTranscriptAndSourcesDoNotWaitForPlayback() async throws {
        let (server, rig) = try await deepCall()
        await server.broadcast(json(["type": "agent_response", "agent_response_event": ["event_id": 2, "agent_response": "Synthetic deep-buffer text"]]))
        await server.broadcast(json(["type": "agent_tool_response", "agent_tool_response": ["tool_name": "fixture", "sources": [["title": "Synthetic", "url": "/doc/fixture"]]]]))
        try await eventually { await rig.recorder.items.contains { if case .transcript(let turns) = $0 { turns.contains { $0.text == "Synthetic deep-buffer text" } } else { false } } }
        try await eventually { await rig.recorder.items.contains { if case .sources(let sources) = $0 { sources.contains { $0.path == "/doc/fixture" } } else { false } } }
        let queued = await rig.engine.queued; XCTAssertEqual(queued, 30 * 16000)
        await rig.close(); await server.stop()
    }
    func testNativeSocketAbnormalDropAfterPingUsesFreshExhaustedStatus() async throws {
        let (server, rig) = try await deepCall()
        await server.broadcast(json(["type": "ping", "ping_event": ["event_id": 994]]))
        try await eventually { await server.snapshot().pongIDs.contains(994) }
        await rig.http.configure(status: signedStatus(remaining: 0))
        await server.drop() // actual TCP abort; no close-code injection
        try await eventually { await rig.recorder.items.contains(.state(.ended, reason: .allowanceExhausted)) }
        let network = await rig.recorder.hasError(.network); XCTAssertFalse(network)
        await rig.close(); await server.stop()
    }
    func testRealSocketInterruptionPingAndImmediateDeadlineCloseTogether() async throws {
        var completed = 0, failures = 0
        for iteration in 0..<200 {
            let server = try LoopbackRelay(scenario: .quiet), port = try await server.start()
            let order: OrderedTerminationRelay.Order = iteration.isMultiple(of: 2) ? .writeFirst : .receiveFirst
            let factory = OrderedTerminationFactory(port: port, terminal: RelayClose(code: 1006), order: order)
            let rig = try await Rig.make(relays: factory, port: port)
            await rig.controller.start(); try await eventually { await rig.controller.state == .live }
            try await fillPlayback(server, rig)
            let connected = await factory.connected, socket = try XCTUnwrap(connected)
            await server.broadcast(json(["type": "interruption", "interruption_event": ["event_id": 9]]))
            await server.broadcast(json(["type": "ping", "ping_event": ["event_id": 993]]))
            try await eventually { await socket.writeWaiting }
            let budgetDeadline = iteration % 4 >= 2
            let expected: EndReason = budgetDeadline ? .budgetClosed : .allowanceExhausted
            await rig.http.configure(status: budgetDeadline ? signedStatus(remaining: 300, budget: false) : signedStatus(remaining: 0))
            await server.close(code: 1000, reason: "Your free voice time has finished")
            try await eventually { await rig.recorder.items.contains(.state(.ended, reason: expected)) }
            try await eventually { await socket.observations.count == 2 }
            let observed = await socket.observations
            XCTAssertEqual(observed, order == .writeFirst ? ["write", "receive"] : ["receive", "write"], "iteration \(iteration)")
            let events = await rig.recorder.items
            XCTAssertFalse(events.contains(.error(.network)), "iteration \(iteration)")
            let flushes = await rig.engine.flushes; XCTAssertEqual(flushes, 2, "iteration \(iteration)")
            let requests = await rig.http.requests.map { $0.url!.path }
            let expectedRequests = [AuthRoute.voiceStatus.rawValue, AuthRoute.voiceStart.rawValue, AuthRoute.voiceFinish.rawValue, AuthRoute.voiceStatus.rawValue]
            XCTAssertEqual(requests, expectedRequests)
            if observed != (order == .writeFirst ? ["write", "receive"] : ["receive", "write"]) ||
                events.contains(.error(.network)) || flushes != 2 || requests != expectedRequests { failures += 1 }
            await rig.close(); await server.stop()
            completed += 1
        }
        XCTAssertEqual(completed, 200); XCTAssertEqual(failures, 0)
        print("CLOSE RACE: \(completed) loopback iterations, injected write-first/receive-first 1006; failures=\(failures)")
    }
    func testRealSocketSyntheticUploadRacingDeadlineStillEndsAsDeadline() async throws {
        for order in [OrderedTerminationRelay.Order.writeFirst, .receiveFirst] {
            let server = try LoopbackRelay(scenario: .quiet), port = try await server.start()
            let factory = OrderedTerminationFactory(port: port, terminal: RelayClose(code: 1006), order: order, write: .audio)
            let rig = try await Rig.make(relays: factory, port: port)
            await rig.controller.start(); try await eventually { await rig.controller.state == .live }
            try await fillPlayback(server, rig)
            let connected = await factory.connected, socket = try XCTUnwrap(connected)
            await rig.engine.feed(CaptureBuffer(samples: Array(repeating: 0, count: 400), rate: 16000))
            try await eventually { await socket.writeWaiting }
            await rig.http.configure(status: signedStatus(remaining: 0))
            await server.close(code: 1000, reason: "Your free voice time has finished")
            try await eventually { await rig.recorder.items.contains(.state(.ended, reason: .allowanceExhausted)) }
            try await eventually { await socket.observations.count == 2 }
            let observed = await socket.observations
            XCTAssertEqual(observed, order == .writeFirst ? ["write", "receive"] : ["receive", "write"])
            let events = await rig.recorder.items
            XCTAssertFalse(events.contains(.error(.network)))
            await rig.close(); await server.stop()
        }
    }
    func testTerminalSignalBroadcastsCachesAndCancelsWithoutOverwritingClose() async throws {
        let signal = SocketCloseSignal(), expected = RelayClose(code: 1000, reason: "Your free voice time has finished")
        let first = Task { await signal.value() }, second = Task { await signal.value() }
        try await eventually { signal.waiterCount == 2 }
        signal.resolve(expected); signal.resolve(RelayClose(code: 1006))
        let one = await first.value, two = await second.value, cached = await signal.value()
        XCTAssertEqual(one, expected); XCTAssertEqual(two, expected); XCTAssertEqual(cached, expected)
        let pending = SocketCloseSignal(), cancelled = Task { await pending.value() }
        try await eventually { pending.waiterCount == 1 }
        cancelled.cancel(); let result = await cancelled.value; XCTAssertNil(result)
        XCTAssertEqual(pending.waiterCount, 0)
        pending.resolve(expected); let after = await pending.value(); XCTAssertEqual(after, expected)
    }
    func testRealSocketOverflowTruncatesAndInterruptionClearsItWithoutFailure() async throws {
        let (server, rig) = try await deepCall()
        for _ in 0..<45 { await server.broadcast(audio()) }
        try await eventually { await rig.recorder.items.contains(.playback(.truncated)) }
        let samples = await rig.controller.bufferedPlaybackSamples(); XCTAssertLessThanOrEqual(samples, 60 * 16000)
        let state = await rig.controller.state; XCTAssertEqual(state, .live)
        await server.broadcast(json(["type": "interruption", "interruption_event": ["event_id": 9]]))
        await server.broadcast(json(["type": "ping", "ping_event": ["event_id": 992]]))
        try await eventually { await server.snapshot().pongIDs.contains(992) }
        let flushed = await rig.controller.bufferedPlaybackSamples(); XCTAssertEqual(flushed, 0)
        let playback = await rig.controller.playbackState; XCTAssertEqual(playback, .flowing)
        let failed = await rig.recorder.hasError(.queueOverflow); XCTAssertFalse(failed)
        await server.close(code: 1000, reason: "Your free voice time has finished")
        try await eventually { await rig.controller.state == .ended }
        await rig.close(); await server.stop()
    }
}
