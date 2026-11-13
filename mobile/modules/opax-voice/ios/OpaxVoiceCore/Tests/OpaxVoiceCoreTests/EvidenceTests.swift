import XCTest
@testable import OpaxVoiceCore

final class EvidenceTests: SafeVoiceTestCase {
    func testPublishedRecordAllowListAndRejectedLinks() {
        for path in ["/doc/fixture", "/bill/fixture", "/subject/person/fixture", "/subject/agency/fixture", "/money", "/money/receipts", "/declared", "/search?q=fixture", "/connections", "/topics", "/parties", "/reports/fixture", "/journey/fixture", "/ask?q=How%20much%20is%20the%20example%20office%20paid%3F"] {
            XCTAssertEqual(EvidenceModel.sourcePath(path), path)
        }
        for path in ["https://example.org/doc/fixture", "http://opax.com.au/doc/fixture", "https://user@opax.com.au/doc/fixture", "/api/voice/start", "/api/ask", "/community", "/doc/a/b", "/subject/invalid/a", "/doc/a%00", "/doc/a%1f", "/doc/a%7F", "/ask/fixture", "/asking"] {
            XCTAssertNil(EvidenceModel.sourcePath(path), path)
        }
    }
    func testAskLinksAreOnlyQuestionDraftsNotGenericFallbacksOrSearch() throws {
        for path in ["/ask?q=Example+pay", "/ask?q=%2B", "/ask?q=Example#sources"] {
            XCTAssertEqual(EvidenceModel.sourcePath(path), path)
        }
        var model = EvidenceModel()
        for path in ["/ask", "/ask#sources", "/ask?q=", "/ask?q=%20", "/ask?q=+", "/ask?q=&q=Example", "/ask?q=Example&view=search", "/ask?q=Example&view=", "/ask/?q=Example"] {
            XCTAssertNil(EvidenceModel.sourcePath(path), path)
            model.collect(try JSONDecoder().decode(JSONValue.self, from: json(["title": "Example pay", "url": path])))
        }
        XCTAssertTrue(model.sources.isEmpty)
        // ask_opax's no-record fallback uses source_url, never a source row.
        model.collect(try JSONDecoder().decode(JSONValue.self, from: json(["source_url": "https://opax.com.au/ask", "sources": []])))
        XCTAssertTrue(model.sources.isEmpty)
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
    /// The ask_opax and search tool results since im/voice-ask: Ask's fields on each source, a pay row on /ask.
    func testAskStyleSourcesKeepTheirFieldsAndPayRows() throws {
        var model = EvidenceModel()
        let asked = json(["answered": true, "spoken_answer": "Synthetic", "source_url": "https://opax.com.au/doc/speech-500101", "sources": [
            ["title": "Alex Example: Committees", "record_title": "Committees", "speaker": "Alex Example", "date": "2001-06-21", "type": "Speech", "url": "https://opax.com.au/doc/speech-500101"],
            ["title": "Example office pay: every step since 1999", "record_title": "Example office pay: every step since 1999", "speaker": NSNull(), "date": "1999–2026", "type": "Pay record", "url": "https://opax.com.au/ask?q=How%20much%20is%20the%20example%20office%20paid%3F"],
            ["title": "Example Office Determination 2025", "record_title": "Example Office Determination 2025", "speaker": "Remuneration Tribunal", "date": "2025-07-01", "type": "Pay determination", "url": "https://opax.com.au/doc/legal-700001"],
        ]])
        model.collect(try JSONDecoder().decode(JSONValue.self, from: asked))
        XCTAssertEqual(model.sources, [
            VoiceSource(title: "Alex Example: Committees", path: "/doc/speech-500101", recordTitle: "Committees", speaker: "Alex Example", date: "2001-06-21", type: "Speech"),
            VoiceSource(title: "Example office pay: every step since 1999", path: "/ask?q=How%20much%20is%20the%20example%20office%20paid%3F",
                        recordTitle: "Example office pay: every step since 1999", speaker: nil, date: "1999–2026", type: "Pay record"),
            VoiceSource(title: "Example Office Determination 2025", path: "/doc/legal-700001", recordTitle: "Example Office Determination 2025", speaker: "Remuneration Tribunal", date: "2025-07-01", type: "Pay determination"),
        ])
        let projected = VoiceBridgeValue.source(model.sources[0])
        XCTAssertEqual(Set(projected.keys), ["title", "path", "recordTitle", "speaker", "date", "type"])
        XCTAssertEqual(projected["recordTitle"] as? String, "Committees")
        XCTAssertEqual(projected["speaker"] as? String, "Alex Example")
        XCTAssertEqual(projected["date"] as? String, "2001-06-21")
        XCTAssertEqual(projected["type"] as? String, "Speech")
    }
    func testShippedTitleOnlySourcesDecodeAsBefore() throws {
        var model = EvidenceModel()
        model.collect(try JSONDecoder().decode(JSONValue.self, from: json(["source_url": "https://opax.com.au/doc/fixture", "sources": [["title": "Fixture — ESTIMATES — 2025-02-05", "url": "https://opax.com.au/doc/fixture"]]])))
        XCTAssertEqual(model.sources, [VoiceSource(title: "Fixture — ESTIMATES — 2025-02-05", path: "/doc/fixture")])
        XCTAssertFalse(model.sources[0].labelled)
    }
    func testSpokenLinkTakesTheToolLabelsAndBadLabelsAreDropped() throws {
        var model = EvidenceModel()
        model.add(TranscriptTurn(role: .agent, id: 1, text: "See [the speech](/doc/speech-1)."), correction: false)
        XCTAssertEqual(model.sources, [VoiceSource(title: "the speech", path: "/doc/speech-1")])
        model.collect(try JSONDecoder().decode(JSONValue.self, from: json(["sources": [
            ["title": "Sam Sample: Pay", "record_title": "  Pay  ", "speaker": String(repeating: "x", count: 121), "date": "As at a date far too long to be one", "type": " ", "url": "/doc/speech-1"],
        ]])))
        XCTAssertEqual(model.sources, [VoiceSource(title: "Sam Sample: Pay", path: "/doc/speech-1", recordTitle: "Pay")])
        // A labelled source is not replaced by a later title-only mention.
        model.add(TranscriptTurn(role: .agent, id: 2, text: "Again, [the speech](/doc/speech-1)."), correction: false)
        XCTAssertEqual(model.sources.first?.recordTitle, "Pay")
        XCTAssertEqual(model.sources.count, 1)
    }
    func testOptionalProviderEventsToleratedAndInvalidPCMEventDropped() throws {
        for type in ["vad_score", "internal_tentative_agent_response", "agent_chat_response_part", "client_tool_call", "queue_status", "future_event"] {
            if case .unknown = try ProviderEvent.decode(json(["type": type])) {} else { XCTFail(type) }
        }
        XCTAssertThrowsError(try ProviderEvent.decode(json(["type": "conversation_initiation_metadata", "conversation_initiation_metadata_event": ["agent_output_audio_format": "pcm_abc"]])))
    }
}
