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
    func testSourcesProjectAskFieldsOnlyWhenPresent() throws {
        let shipped = VoiceSource(title: "Public record", path: "/money/receipts")
        let labelled = VoiceSource(title: "Example office pay: every step since 1999", path: "/ask?q=x", recordTitle: "Example office pay: every step since 1999", date: "1999–2026", type: "Pay record")
        let sources = VoiceBridgeValue.event(.sources([shipped, labelled]))["sources"] as? [[String: Any]]
        XCTAssertEqual(sources?.count, 2)
        XCTAssertEqual(Set(sources?[0].keys.map { $0 } ?? []), ["title", "path"])
        XCTAssertEqual(Set(sources?[1].keys.map { $0 } ?? []), ["title", "path", "recordTitle", "date", "type"])
        XCTAssertEqual(sources?[1]["type"] as? String, "Pay record")
        XCTAssertEqual(sources?[1]["date"] as? String, "1999–2026")
        XCTAssertTrue(JSONSerialization.isValidJSONObject(VoiceBridgeValue.event(.sources([shipped, labelled]))))
    }
    func testClearedStatusEventProjectsNull() {
        let event = VoiceBridgeValue.event(.status(nil))
        XCTAssertEqual(event["type"] as? String, "status")
        XCTAssertTrue(event["status"] is NSNull)
    }
}
