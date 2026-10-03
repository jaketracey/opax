import XCTest
@testable import OpaxVoiceCore

final class EvidenceTests: SafeVoiceTestCase {
    func testPublishedRecordAllowListAndRejectedLinks() {
        for path in ["/doc/fixture", "/bill/fixture", "/subject/person/fixture", "/subject/agency/fixture", "/money", "/money/receipts", "/declared", "/search?q=fixture", "/connections", "/topics", "/parties", "/reports/fixture", "/journey/fixture"] {
            XCTAssertEqual(EvidenceModel.sourcePath(path), path)
        }
        for path in ["https://example.org/doc/fixture", "http://opax.com.au/doc/fixture", "https://user@opax.com.au/doc/fixture", "/api/voice/start", "/api/ask", "/community", "/doc/a/b", "/subject/invalid/a", "/doc/a%00", "/doc/a%1f", "/doc/a%7F"] {
            XCTAssertNil(EvidenceModel.sourcePath(path), path)
        }
    }
    func testMarkdownCorrectionsAndAllCaps() {
        var model = EvidenceModel()
        for index in 0..<81 {
            model.add(TranscriptTurn(role: .agent, id: index, text: "[Fixture](/doc/\(index)) [Reject](https://example.org)"), correction: false)
        }
        XCTAssertEqual(model.turns.count, 80); XCTAssertEqual(model.turns.first?.id, 1); XCTAssertEqual(model.sources.count, 12)
        model.add(TranscriptTurn(role: .agent, id: 80, text: String(repeating: "x", count: 13000)), correction: true)
        XCTAssertEqual(model.turns.count, 80); XCTAssertEqual(model.turns.last?.text.count, 12000)
        model.add(TranscriptTurn(role: .agent, id: -1, text: "Correct last"), correction: true)
        XCTAssertEqual(model.turns.last?.id, 80); XCTAssertEqual(model.turns.last?.text, "Correct last")
    }
    func testStandardReceiptAndClarificationToolShapes() throws {
        var model = EvidenceModel()
        let standard = json(["source_url": "/doc/fixture", "sources": [["title": "Fixture", "url": "/doc/fixture"]], "data": [:]])
        let receipt = json(["sources": [["title": "Receipt", "url": "/money/receipts"]], "data": ["answer": "Synthetic"]])
        let clarification = json(["sources": [], "data": ["needs_period": true]])
        for data in [standard, receipt, clarification] { model.collect(try JSONDecoder().decode(JSONValue.self, from: data)) }
        XCTAssertEqual(model.sources.map(\.path), ["/doc/fixture", "/money/receipts"])
    }
    func testOptionalProviderEventsToleratedAndInvalidPCMEventDropped() throws {
        for type in ["vad_score", "internal_tentative_agent_response", "agent_chat_response_part", "client_tool_call", "queue_status", "future_event"] {
            if case .unknown = try ProviderEvent.decode(json(["type": type])) {} else { XCTFail(type) }
        }
        XCTAssertThrowsError(try ProviderEvent.decode(json(["type": "conversation_initiation_metadata", "conversation_initiation_metadata_event": ["agent_output_audio_format": "pcm_abc"]])))
    }
}
