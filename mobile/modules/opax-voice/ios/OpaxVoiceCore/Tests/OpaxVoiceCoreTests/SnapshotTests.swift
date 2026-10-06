import XCTest
@testable import OpaxVoiceCore

final class SnapshotTests: XCTestCase, @unchecked Sendable {
    func testFailedRefreshPublishesTheSameClearedStatusAsSnapshot() async throws {
        let rig = try await Rig.make()
        _ = try await rig.controller.refreshStatus()
        await rig.http.failTransport()
        do { _ = try await rig.controller.refreshStatus(); XCTFail("Expected failed read") } catch {}
        try await eventually { await rig.recorder.items.contains(.status(nil)) }
        let value = await rig.controller.snapshot()
        XCTAssertNil(value.status)
        await rig.close()
    }
    func testCallCleanupPublishesClearedStatusBeforeItsFreshRead() async throws {
        let rig = try await Rig.make(); try await rig.live()
        await rig.http.failTransport()
        await rig.controller.end()
        try await eventually { await rig.recorder.items.contains(.status(nil)) }
        let value = await rig.controller.snapshot()
        XCTAssertNil(value.status)
        await rig.close()
    }
    func testDismissDiscardsEvidenceWithoutRequestsButCannotClearLiveCaptions() async throws {
        let rig = try await Rig.make(); try await rig.live()
        await rig.relay.enqueue(.data(json(["type": "agent_response", "agent_response_event": ["event_id": 1, "agent_response": "Transient caption"]])))
        try await eventually { await rig.controller.snapshot().transcript.count == 1 }
        await rig.controller.discardEvidence()
        let live = await rig.controller.snapshot(); XCTAssertEqual(live.transcript.count, 1)
        await rig.controller.end()
        let requests = await rig.http.count(.voiceStatus)
        await rig.controller.discardEvidence()
        let closed = await rig.controller.snapshot()
        XCTAssertEqual(closed.transcript, []); XCTAssertEqual(closed.sources, [])
        let after = await rig.http.count(.voiceStatus); XCTAssertEqual(after, requests)
        await rig.close()
    }
    func testIdleSnapshotDoesNotEmitOrMakeRequests() async throws {
        let rig = try await Rig.make()
        let value = await rig.controller.snapshot()
        XCTAssertEqual(value.state, .idle); XCTAssertNil(value.reason); XCTAssertNil(value.mode)
        XCTAssertEqual(value.playback, .flowing); XCTAssertEqual(value.remaining, 0)
        XCTAssertEqual(value.transcript, []); XCTAssertEqual(value.sources, []); XCTAssertNil(value.status)
        let requests = await rig.http.count(.voiceStatus); XCTAssertEqual(requests, 0)
        await rig.close()
    }
    func testRemountSnapshotContainsLiveEvidenceAndCurrentMode() async throws {
        let rig = try await Rig.make(); try await rig.live()
        await rig.controller.setMuted(true)
        await rig.relay.enqueue(.data(json(["type": "agent_response", "agent_response_event": ["event_id": 1, "agent_response": "Synthetic transcript"]])))
        await rig.relay.enqueue(.data(json(["type": "agent_tool_response_full_payload", "agent_tool_response_full_payload": ["tool_name": "receipts", "full_tool_result": ["sources": [["title": "Public record", "url": "/money/receipts"]]]]])))
        try await eventually { let value = await rig.controller.snapshot(); return value.transcript.count == 1 && value.sources.count == 1 }
        let first = await rig.controller.snapshot(), second = await rig.controller.snapshot()
        // Countdown may advance between reads; stable evidence/state must not.
        XCTAssertEqual(second.state, first.state); XCTAssertEqual(second.mode, first.mode)
        XCTAssertEqual(second.transcript, first.transcript); XCTAssertEqual(second.sources, first.sources)
        XCTAssertEqual(first.state, .live); XCTAssertEqual(first.mode, .muted)
        XCTAssertEqual(first.transcript.first?.text, "Synthetic transcript"); XCTAssertEqual(first.sources.first?.path, "/money/receipts")
        XCTAssertNotNil(first.status)
        let requests = await rig.http.count(.voiceStatus); XCTAssertEqual(requests, 1)
        await rig.controller.end()
        let ended = await rig.controller.snapshot()
        XCTAssertEqual(ended.state, .ended); XCTAssertEqual(ended.reason, .user)
        XCTAssertEqual(ended.transcript, first.transcript); XCTAssertEqual(ended.sources, first.sources)
        await rig.close()
    }
}
