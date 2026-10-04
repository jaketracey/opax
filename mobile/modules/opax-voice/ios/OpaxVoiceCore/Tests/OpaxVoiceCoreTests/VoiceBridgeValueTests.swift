import Foundation
import XCTest
@testable import OpaxVoiceCore

final class VoiceBridgeValueTests: XCTestCase {
    func testIdleSnapshotProjectsExplicitNullsAndOnlyPublicFields() throws {
        let value = VoiceSnapshot(state: .idle, reason: nil, mode: nil, playback: .flowing,
            remaining: 0, transcript: [], sources: [], status: nil)
        let projected = VoiceBridgeValue.snapshot(value)
        XCTAssertEqual(Set(projected.keys), ["state", "reason", "mode", "playback", "remaining", "transcript", "sources", "status"])
        XCTAssertEqual(projected["state"] as? String, "idle")
        XCTAssertEqual(projected["remaining"] as? Int, 0)
        for key in ["reason", "mode", "status"] { XCTAssertTrue(projected[key] is NSNull) }
        XCTAssertTrue(JSONSerialization.isValidJSONObject(projected))
    }
    func testLiveSnapshotUsesTheEventProjectionAndStripsPrivateStatusFields() throws {
        let status = try JSONDecoder().decode(VoiceStatus.self, from: json([
            "enabled": true, "signed_in": true, "remaining_seconds": 480,
            "active_session": ["id": "private-session", "state": "raw-server-text", "expires_at": 1234],
            "credential": "private-credential", "audio": "private-audio"
        ])).bridgeValue
        let turns = [TranscriptTurn(role: .agent, id: 1, text: "Synthetic transcript")]
        let sources = [VoiceSource(title: "Public record", path: "/money/receipts")]
        let value = VoiceSnapshot(state: .live, reason: nil, mode: .muted, playback: .buffering,
            remaining: 480, transcript: turns, sources: sources, status: status)
        let projected = VoiceBridgeValue.snapshot(value)
        XCTAssertEqual(projected["mode"] as? String, "muted")
        XCTAssertEqual(projected["playback"] as? String, "buffering")
        for (key, eventKey, event) in [("transcript", "turns", VoiceEvent.transcript(turns)),
                                      ("sources", "sources", VoiceEvent.sources(sources)),
                                      ("status", "status", VoiceEvent.status(status))] {
            XCTAssertEqual(projected[key] as? NSObject, VoiceBridgeValue.event(event)[eventKey] as? NSObject)
        }
        let body = String(decoding: try JSONSerialization.data(withJSONObject: projected), as: UTF8.self)
        for privateValue in ["private-session", "raw-server-text", "private-credential", "private-audio"] {
            XCTAssertFalse(body.contains(privateValue))
        }
        let open = (projected["status"] as? [String: Any])?["activeSession"] as? [String: Any]
        XCTAssertEqual(open?["state"] as? String, "unknown")
        XCTAssertEqual(Set(open?.keys.map { $0 } ?? []), ["state", "expiresAt"])
    }
    func testClearedStatusEventProjectsNull() {
        let event = VoiceBridgeValue.event(.status(nil))
        XCTAssertEqual(event["type"] as? String, "status")
        XCTAssertTrue(event["status"] is NSNull)
    }
}
