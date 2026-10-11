package au.com.opax.voice.call

import au.com.opax.voice.*

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

/** The event half of the iOS VoiceBridgeValueTests: the shapes onVoiceEvent and onVoiceLevel carry. */
class BridgeEventTests {
  @Test fun clearedStatusEventProjectsNull() {
    val event = VoiceBridgeValue.event(VoiceEvent.Status(null))
    assertEquals("status", event["type"])
    assertNull(event["status"])
    assertEquals(setOf("type", "status"), event.keys)
  }

  @Test fun everyEventProjectsOnlyItsPublicFields() {
    assertEquals(mapOf("type" to "state", "state" to "ended", "reason" to "allowanceExhausted"), VoiceBridgeValue.event(VoiceEvent.State(CallState.ended, EndReason.allowanceExhausted)))
    assertEquals(mapOf("type" to "state", "state" to "live", "reason" to null), VoiceBridgeValue.event(VoiceEvent.State(CallState.live, null)))
    assertEquals(mapOf("type" to "mode", "mode" to "muted"), VoiceBridgeValue.event(VoiceEvent.Mode(CallMode.muted)))
    assertEquals(mapOf("type" to "playback", "playback" to "truncated"), VoiceBridgeValue.event(VoiceEvent.Playback(PlaybackState.truncated)))
    assertEquals(mapOf("type" to "remainingTime", "seconds" to 42), VoiceBridgeValue.event(VoiceEvent.RemainingTime(42)))
    assertEquals(mapOf("type" to "error", "error" to "queueOverflow"), VoiceBridgeValue.event(VoiceEvent.Error(VoiceFailure.queueOverflow)))
    assertEquals(
      mapOf("type" to "transcript", "turns" to listOf(mapOf("role" to "agent", "id" to 1, "text" to "Synthetic"))),
      VoiceBridgeValue.event(VoiceEvent.Transcript(listOf(TranscriptTurn(TranscriptTurn.Role.agent, 1, "Synthetic")))),
    )
    assertEquals(
      mapOf("type" to "sources", "sources" to listOf(mapOf("title" to "Public record", "path" to "/money/receipts"))),
      VoiceBridgeValue.event(VoiceEvent.Sources(listOf(VoiceSource("Public record", "/money/receipts")))),
    )
  }

  @Test fun levelsAreTwoRoundedUnitValues() {
    assertEquals(mapOf("input" to 0.0, "output" to 1.0), VoiceBridgeValue.levels(-0.2f, 1.7f))
    assertEquals(mapOf("input" to 0.12, "output" to 0.99), VoiceBridgeValue.levels(0.1234f, 0.987f))
    assertEquals(mapOf("input" to 0.0, "output" to 0.0), VoiceBridgeValue.levels(Float.NaN, Float.POSITIVE_INFINITY))
  }
}
