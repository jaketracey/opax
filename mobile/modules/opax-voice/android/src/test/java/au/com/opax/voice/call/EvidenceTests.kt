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
    )) {
      assertEquals(path, EvidenceModel.sourcePath(path))
    }
    for (path in listOf(
      "https://example.org/doc/fixture", "http://opax.com.au/doc/fixture", "https://user@opax.com.au/doc/fixture",
      "/api/voice/start", "/api/ask", "/community", "/doc/a/b", "/subject/invalid/a", "/doc/a%00", "/doc/a%1f", "/doc/a%7F",
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

  @Test fun standardReceiptAndClarificationToolShapes() {
    val model = EvidenceModel()
    val standard = json(mapOf("source_url" to "/doc/fixture", "sources" to listOf(mapOf("title" to "Fixture", "url" to "/doc/fixture")), "data" to emptyMap<String, Any>()))
    val receipt = json(mapOf("sources" to listOf(mapOf("title" to "Receipt", "url" to "/money/receipts")), "data" to mapOf("answer" to "Synthetic")))
    val clarification = json(mapOf("sources" to emptyList<Any>(), "data" to mapOf("needs_period" to true)))
    for (data in listOf(standard, receipt, clarification)) model.collect(JsonValue.parse(data))
    assertEquals(listOf("/doc/fixture", "/money/receipts"), model.sources.map { it.path })
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
