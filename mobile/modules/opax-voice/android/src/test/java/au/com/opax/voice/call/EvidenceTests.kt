package au.com.opax.voice.call

import au.com.opax.voice.*

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertThrows
import org.junit.Assert.assertTrue
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

/** Robolectric: captions and titles are cut by Android's ICU character iterator, as on a device. */
@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34])
class EvidenceTests : SafeVoiceTest() {
  @Test fun publishedRecordAllowListAndRejectedLinks() {
    for (path in listOf(
      "/doc/fixture", "/bill/fixture", "/subject/person/fixture", "/subject/agency/fixture", "/money", "/money/receipts",
      "/declared", "/search?q=fixture", "/connections", "/topics", "/parties", "/reports/fixture", "/journey/fixture",
      "/ask?q=How%20much%20is%20the%20example%20office%20paid%3F",
    )) {
      assertEquals(path, EvidenceModel.sourcePath(path))
    }
    for (path in listOf(
      "https://example.org/doc/fixture", "http://opax.com.au/doc/fixture", "https://user@opax.com.au/doc/fixture",
      "/api/voice/start", "/api/ask", "/community", "/doc/a/b", "/subject/invalid/a", "/doc/a%00", "/doc/a%1f", "/doc/a%7F",
      "/ask/fixture", "/asking",
    )) {
      assertNull(path, EvidenceModel.sourcePath(path))
    }
  }

  @Test fun markdownCorrectionsAndAllCaps() {
    val model = EvidenceModel()
    for (index in 0 until 81) {
      model.add(TranscriptTurn(TranscriptTurn.Role.agent, index.toLong(), "[Fixture](/doc/$index) [Reject](https://example.org)"), correction = false)
    }
    assertEquals(80, model.turns.size)
    assertEquals(1L, model.turns.first().id)
    assertEquals(12, model.sources.size)
    model.add(TranscriptTurn(TranscriptTurn.Role.agent, 80, "x".repeat(13000)), correction = true)
    assertEquals(80, model.turns.size)
    assertEquals(12000, model.turns.last().text.length)
    model.add(TranscriptTurn(TranscriptTurn.Role.agent, -1, "Correct last"), correction = true)
    assertEquals(80L, model.turns.last().id)
    assertEquals("Correct last", model.turns.last().text)
  }

  @Test fun askLinksAreOnlyQuestionDraftsNotGenericFallbacksOrSearch() {
    for (path in listOf("/ask?q=Example+pay", "/ask?q=%2B", "/ask?q=Example#sources")) {
      assertEquals(path, EvidenceModel.sourcePath(path))
    }
    val model = EvidenceModel()
    for (path in listOf("/ask", "/ask#sources", "/ask?q=", "/ask?q=%20", "/ask?q=+", "/ask?q=&q=Example", "/ask?q=Example&view=search", "/ask?q=Example&view=", "/ask/?q=Example")) {
      assertNull(path, EvidenceModel.sourcePath(path))
      model.collect(JsonValue.parse(json(mapOf("title" to "Example pay", "url" to path))))
    }
    assertTrue(model.sources.isEmpty())
    // ask_opax's no-record fallback uses source_url, never a source row.
    model.collect(JsonValue.parse(json(mapOf("source_url" to "https://opax.com.au/ask", "sources" to emptyList<Any>()))))
    assertTrue(model.sources.isEmpty())
  }

  @Test fun standardReceiptAndClarificationToolShapes() {
    val model = EvidenceModel()
    val standard = json(mapOf("source_url" to "/doc/fixture", "sources" to listOf(mapOf("title" to "Fixture", "url" to "/doc/fixture")), "data" to emptyMap<String, Any>()))
    val receipt = json(mapOf("sources" to listOf(mapOf("title" to "Receipt", "url" to "/money/receipts")), "data" to mapOf("answer" to "Synthetic")))
    val clarification = json(mapOf("sources" to emptyList<Any>(), "data" to mapOf("needs_period" to true)))
    for (data in listOf(standard, receipt, clarification)) model.collect(JsonValue.parse(data))
    assertEquals(listOf("/doc/fixture", "/money/receipts"), model.sources.map { it.path })
  }

  /** The ask_opax and search tool results since im/voice-ask: Ask's fields on each source, a pay row on /ask. */
  @Test fun askStyleSourcesKeepTheirFieldsAndPayRows() {
    val model = EvidenceModel()
    val asked = json(mapOf("answered" to true, "spoken_answer" to "Synthetic", "source_url" to "https://opax.com.au/doc/speech-500101", "sources" to listOf(
      mapOf("title" to "Alex Example: Committees", "record_title" to "Committees", "speaker" to "Alex Example", "date" to "2001-06-21", "type" to "Speech", "url" to "https://opax.com.au/doc/speech-500101"),
      mapOf("title" to "Example office pay: every step since 1999", "record_title" to "Example office pay: every step since 1999", "speaker" to null, "date" to "1999–2026", "type" to "Pay record", "url" to "https://opax.com.au/ask?q=How%20much%20is%20the%20example%20office%20paid%3F"),
      mapOf("title" to "Example Office Determination 2025", "record_title" to "Example Office Determination 2025", "speaker" to "Remuneration Tribunal", "date" to "2025-07-01", "type" to "Pay determination", "url" to "https://opax.com.au/doc/legal-700001"),
    )))
    model.collect(JsonValue.parse(asked))
    assertEquals(listOf(
      VoiceSource("Alex Example: Committees", "/doc/speech-500101", "Committees", "Alex Example", "2001-06-21", "Speech"),
      VoiceSource("Example office pay: every step since 1999", "/ask?q=How%20much%20is%20the%20example%20office%20paid%3F",
        "Example office pay: every step since 1999", null, "1999–2026", "Pay record"),
      VoiceSource("Example Office Determination 2025", "/doc/legal-700001", "Example Office Determination 2025", "Remuneration Tribunal", "2025-07-01", "Pay determination"),
    ), model.sources)
    assertEquals(mapOf(
      "title" to "Alex Example: Committees", "path" to "/doc/speech-500101", "recordTitle" to "Committees",
      "speaker" to "Alex Example", "date" to "2001-06-21", "type" to "Speech",
    ), VoiceBridgeValue.source(model.sources[0]))
  }

  @Test fun shippedTitleOnlySourcesDecodeAsBefore() {
    val model = EvidenceModel()
    model.collect(JsonValue.parse(json(mapOf("source_url" to "https://opax.com.au/doc/fixture", "sources" to listOf(mapOf("title" to "Fixture — ESTIMATES — 2025-02-05", "url" to "https://opax.com.au/doc/fixture"))))))
    assertEquals(listOf(VoiceSource("Fixture — ESTIMATES — 2025-02-05", "/doc/fixture")), model.sources)
  }

  @Test fun spokenLinkTakesTheToolLabelsAndBadLabelsAreDropped() {
    val model = EvidenceModel()
    model.add(TranscriptTurn(TranscriptTurn.Role.agent, 1, "See [the speech](/doc/speech-1)."), correction = false)
    assertEquals(listOf(VoiceSource("the speech", "/doc/speech-1")), model.sources)
    model.collect(JsonValue.parse(json(mapOf("sources" to listOf(
      mapOf("title" to "Sam Sample: Pay", "record_title" to "  Pay  ", "speaker" to "x".repeat(121), "date" to "As at a date far too long to be one", "type" to " ", "url" to "/doc/speech-1"),
    )))))
    assertEquals(listOf(VoiceSource("Sam Sample: Pay", "/doc/speech-1", "Pay")), model.sources)
    // A labelled source is not replaced by a later title-only mention.
    model.add(TranscriptTurn(TranscriptTurn.Role.agent, 2, "Again, [the speech](/doc/speech-1)."), correction = false)
    assertEquals("Pay", model.sources.single().recordTitle)
  }

  @Test fun optionalProviderEventsToleratedAndInvalidPcmEventDropped() {
    for (type in listOf("vad_score", "internal_tentative_agent_response", "agent_chat_response_part", "client_tool_call", "queue_status", "future_event")) {
      assertEquals(type, ProviderEvent.Unknown, ProviderEvent.decode(json(mapOf("type" to type))))
    }
    assertThrows(VoiceException::class.java) {
      ProviderEvent.decode(json(mapOf("type" to "conversation_initiation_metadata", "conversation_initiation_metadata_event" to mapOf("agent_output_audio_format" to "pcm_abc"))))
    }
  }

  // Android additions: the parts of Foundation the port re-implements.

  @Test fun titlesAndCaptionsKeepWholeCharacters() {
    val flag = "🇦🇺" // one character, four UTF-16 units
    assertEquals(flag.repeat(2), EvidenceModel.prefix(flag.repeat(3), 2))
    val model = EvidenceModel()
    model.collect(JsonValue.parse(json(mapOf("title" to flag.repeat(230), "url" to "/doc/fixture"))))
    assertEquals(flag.repeat(220), model.sources.single().title)
    model.add(TranscriptTurn(TranscriptTurn.Role.agent, 1, "e\u0301".repeat(12001)), correction = false)
    assertEquals("e\u0301".repeat(12000), model.turns.single().text)
  }

  @Test fun hostileNestingAndMalformedFramesFailClosed() {
    val deep = "[".repeat(100_000) + "]".repeat(100_000)
    assertEquals(VoiceFailure.invalidResponse, assertThrows(VoiceException::class.java) { ProviderEvent.decode(deep.encodeToByteArray()) }.failure)
    for (bad in listOf("{", "{\"type\":\"ping\",}", "{\"type\":'ping'}", "{\"a\":1} trailing", byteArrayOf(-1, -2).decodeToString())) {
      assertThrows(bad, VoiceException::class.java) { ProviderEvent.decode(bad.encodeToByteArray()) }
    }
    assertThrows(VoiceException::class.java) { ProviderEvent.decode(byteArrayOf('{'.code.toByte(), -1, '}'.code.toByte())) }
    // Malformed base64 audio is dropped, as Data(base64Encoded:) returns nil.
    for (text in listOf("AAA", "AA=A", "AAAA====", "AA AA", "AA-_")) {
      assertEquals(text, ProviderEvent.Unknown, ProviderEvent.decode(json(mapOf("type" to "audio", "audio_event" to mapOf("audio_base_64" to text)))))
    }
    val ping = ProviderEvent.decode(json(mapOf("type" to "ping", "ping_event" to mapOf("event_id" to 7, "ping_ms" to 1.5))))
    assertEquals(ProviderEvent.Ping(7), ping)
    assertEquals(VoiceFailure.policy, assertThrows(VoiceException::class.java) { ProviderEvent.decode(json(mapOf("type" to "ping", "ping_event" to mapOf("event_id" to 7.5)))) }.failure)
    assertTrue(ProviderEvent.decode(json(mapOf("type" to "error", "error" to "max_duration_exceeded"))) == ProviderEvent.Deadline)
  }

  @Test fun clientMessagesMatchTheIosWireShape() {
    assertEquals("""{"type":"conversation_initiation_client_data"}""", ClientMessage.Initiation.data().decodeToString())
    assertEquals("""{"event_id":42,"type":"pong"}""", ClientMessage.Pong(42).data().decodeToString())
    assertEquals("""{"type":"user_activity"}""", ClientMessage.Activity.data().decodeToString())
    assertEquals("""{"text":"Say \"hi\"\n","type":"user_message"}""", ClientMessage.Message("Say \"hi\"\n").data().decodeToString())
    assertEquals(mapOf("text" to "Synthetic", "type" to "contextual_update"), bodyMap(ClientMessage.ContextualUpdate("Synthetic").data()))
    assertEquals(VoiceFailure.policy, assertThrows(VoiceException::class.java) { ClientMessage.Message("x".repeat(2001)).data() }.failure)
    assertEquals(VoiceFailure.policy, assertThrows(VoiceException::class.java) { ClientMessage.Audio(ByteArray(144001)).data() }.failure)
  }
}
