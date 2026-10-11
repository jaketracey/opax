package au.com.opax.voice

import android.content.Context
import androidx.test.core.app.ApplicationProvider
import java.io.File
import java.util.UUID
import kotlinx.coroutines.runBlocking
import org.json.JSONObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

/** Swift VoiceBridgeValueTests, one test per XCTest case, plus the level rounding. */
class VoiceBridgeValueTests : SafeVoiceTestCase() {
  @Test fun idleSnapshotProjectsExplicitNullsAndOnlyPublicFields() {
    val value = VoiceSnapshot(CallState.idle, null, null, PlaybackState.flowing, 0, emptyList(), emptyList(), null)
    val projected = VoiceBridgeValue.snapshot(value)
    assertEquals(setOf("state", "reason", "mode", "playback", "remaining", "transcript", "sources", "status"), projected.keys)
    assertEquals("idle", projected["state"]); assertEquals(0, projected["remaining"])
    for (key in listOf("reason", "mode", "status")) assertTrue(projected.containsKey(key) && projected[key] == null)
    jsonObject(projected) // JSON-compatible
  }

  @Test fun liveSnapshotUsesTheEventProjectionAndStripsPrivateStatusFields() {
    val status = VoiceStatus.decode(json(mapOf("enabled" to true, "signed_in" to true, "remaining_seconds" to 480,
      "active_session" to mapOf("id" to "private-session", "state" to "raw-server-text", "expires_at" to 1234),
      "credential" to "private-credential", "audio" to "private-audio"))).bridgeValue
    val turns = listOf(TranscriptTurn(TranscriptTurn.Role.agent, 1, "Synthetic transcript"))
    val sources = listOf(VoiceSource("Public record", "/money/receipts"))
    val value = VoiceSnapshot(CallState.live, null, CallMode.muted, PlaybackState.buffering, 480, turns, sources, status)
    val projected = VoiceBridgeValue.snapshot(value)
    assertEquals("muted", projected["mode"]); assertEquals("buffering", projected["playback"])
    for ((key, eventKey, event) in listOf(Triple("transcript", "turns", VoiceEvent.Transcript(turns)),
      Triple("sources", "sources", VoiceEvent.Sources(sources)), Triple("status", "status", VoiceEvent.Status(status)))) {
      assertEquals(VoiceBridgeValue.event(event)[eventKey], projected[key])
    }
    val body = jsonObject(projected).toString()
    for (privateValue in listOf("private-session", "raw-server-text", "private-credential", "private-audio")) {
      assertFalse(body.contains(privateValue))
    }
    @Suppress("UNCHECKED_CAST")
    val open = (projected["status"] as Map<String, Any?>)["activeSession"] as Map<String, Any?>
    assertEquals("unknown", open["state"]); assertEquals(setOf("state", "expiresAt"), open.keys)
  }

  @Test fun clearedStatusEventProjectsNull() {
    val event = VoiceBridgeValue.event(VoiceEvent.Status(null))
    assertEquals("status", event["type"]); assertTrue(event.containsKey("status") && event["status"] == null)
  }

  /** Not in Swift's tests: the level projection's clamp and half-away-from-zero rounding. */
  @Test fun levelsAreTwoRoundedUnitValues() {
    assertEquals(mapOf("input" to 0.44, "output" to 1.0), VoiceBridgeValue.levels(0.444f, 0.995f))
    assertEquals(mapOf("input" to 0.0, "output" to 1.0), VoiceBridgeValue.levels(Float.NaN, 7f))
    assertEquals(mapOf("input" to 0.0, "output" to 0.13), VoiceBridgeValue.levels(-1f, 0.125f))
  }
}

/** The Expo bridge: names, value shapes, the unwired call half, consent, sign-out and deletion. */
class BridgeTests : SafeVoiceTestCase() {
  private val context: Context get() = ApplicationProvider.getApplicationContext()
  private fun controller(rig: Rig) = VoiceController(rig.core, rig.client, StoredVoiceConsent(context, "consent-" + UUID.randomUUID()))
  @Suppress("UNCHECKED_CAST")
  private fun value(result: Map<String, Any?>): Map<String, Any?> {
    assertEquals(result.toString(), true, result["ok"]); assertEquals(setOf("ok", "value"), result.keys)
    return result["value"] as Map<String, Any?>
  }
  private val statusKeys = setOf("enabled", "signedIn", "unlimited", "totalSeconds", "remainingSeconds", "activeSession", "budgetOpen", "accountHeld")

  @Test fun moduleRegistersEveryNativeVoiceMethodAndBothEvents() {
    val typed = File("../index.ts").readText().substringAfter("export type NativeVoice = {").substringBefore("\n};")
    val methods = Regex("^  (\\w+)\\(", RegexOption.MULTILINE).findAll(typed).map { it.groupValues[1] }.toSet() - "addListener"
    assertEquals(17, methods.size)
    val definition = OpaxVoiceModule().definition()
    assertEquals("OpaxVoice", definition.name)
    // Events() registers Expo's own startObserving/stopObserving, on iOS too.
    assertEquals(methods, definition.asyncFunctions.keys - setOf("startObserving", "stopObserving"))
    assertEquals(listOf("onVoiceEvent", "onVoiceLevel"), definition.eventsDefinition!!.names.toList())
    assertTrue(definition.syncFunctions.isEmpty())
  }

  @Test fun everyAccountMethodReturnsTheIosShape() = runBlocking {
    Rig.make().use { rig ->
      rig.server.handler = { request -> if (request.path == "/api/community/chats") HttpResponse(200, body = "{\"chats\":[]}".toByteArray()) else null }
      val voice = controller(rig)
      assertEquals(statusKeys, value(voice.status()).keys)
      val snapshot = value(voice.snapshot())
      assertEquals(setOf("state", "reason", "mode", "playback", "remaining", "transcript", "sources", "status"), snapshot.keys)
      assertEquals("ready", snapshot["state"])
      assertEquals(mapOf("sent" to true, "challengeId" to "fixture-challenge"), value(voice.requestCode("synthetic@example.invalid")))
      val signedIn = value(voice.consumeCode("fixture-challenge", "12345678"))
      assertEquals(statusKeys, signedIn.keys); assertEquals(true, signedIn["accountHeld"])
      val community = value(voice.communityRequest("/api/community/status", "GET", null))
      assertEquals(setOf("status", "body"), community.keys); assertEquals(200, community["status"])
      assertEquals("fixture", JSONObject(community["body"] as String).getJSONObject("member").getString("id"))
      assertEquals(mapOf("ok" to true, "value" to "{\"chats\":[]}"), voice.chatRequest("/api/community/chats", "GET", null))
      rig.server.setResponse(AuthRoute.deletionCode, deletionResponse("requestSuccess"))
      assertEquals(mapOf("sent" to true, "challengeId" to "c".repeat(43)), value(voice.requestDeletionCode()))
      rig.server.setResponse(AuthRoute.deleteAccount, deletionResponse("deleteSuccess"))
      assertEquals(mapOf("ok" to true, "value" to mapOf("deleted" to true, "signedOut" to true)), voice.deleteAccount("c".repeat(43), "00001234"))
      for (result in listOf(voice.status(), voice.snapshot())) jsonObject(result)
    }
  }

  @Test fun failuresCarryOnlyTheTypedErrorNeverServerProse() = runBlocking {
    Rig.make().use { rig ->
      val voice = controller(rig)
      assertEquals(mapOf("ok" to false, "error" to "invalidResponse"), voice.consumeCode("fixture", "123"))
      assertEquals(mapOf("ok" to false, "error" to "forbidden"), voice.communityRequest("/api/ask", "GET", null))
      assertEquals(mapOf("ok" to false, "error" to "forbidden"), voice.chatRequest("/api/community/chats", "POST", "{}"))
      rig.server.setResponse(AuthRoute.voiceStatus, HttpResponse(503, body = json(mapOf("error" to "Synthetic server prose"))))
      assertEquals(mapOf("ok" to false, "error" to "unavailable"), voice.status())
      rig.server.setResponse(AuthRoute.deletionCode, deletionResponse("request401"))
      assertEquals(mapOf("ok" to false, "error" to "signedOut"), voice.requestDeletionCode())
      assertNull(rig.store.read())
      assertEquals(mapOf("ok" to false, "error" to "signedOut"), voice.chatRequest("/api/community/chats", "GET", null))
    }
  }

  /** iOS VoiceController's call methods: commands acknowledge dispatch; only sendText reports a failure. */
  @Test fun callMethodsReturnTheIosShapes() = runBlocking {
    Rig.make().use { rig ->
      val voice = controller(rig)
      assertEquals(mapOf("ok" to false, "error" to "callOpen"), voice.sendText("Synthetic"))
      assertEquals(mapOf("ok" to true, "value" to null), voice.mute(true))
      assertEquals(mapOf("ok" to true, "value" to null), voice.end())
      assertEquals(Unit, voice.discardEvidence())
      assertEquals(Unit, voice.background())
      assertEquals(mapOf("ok" to true, "value" to null), voice.start())
      assertEquals(0, rig.server.requests.size)
    }
  }

  /** Swift testStoredWithdrawalBlocksTheNextCall..., adapted: no live call yet, so withdrawal ends the ready core. */
  @Test fun consentStartsDeniedAndWithdrawalEndsTheCore() = runBlocking {
    Rig.make().use { rig ->
      val voice = controller(rig)
      assertFalse(voice.consent())
      voice.setConsent(true); assertTrue(voice.consent())
      voice.status()
      voice.setConsent(false); assertFalse(voice.consent())
      val snapshot = rig.core.snapshot()
      assertEquals(CallState.ended, snapshot.state); assertEquals(EndReason.consentWithdrawn, snapshot.reason)
      assertEquals(0, rig.server.count(AuthRoute.voiceStart))
    }
  }

  @Test fun logoutThroughTheBridgeClearsTheCredentialAndRefreshes() = runBlocking {
    Rig.make().use { rig ->
      val voice = controller(rig)
      assertEquals(mapOf("ok" to true, "value" to null), voice.logout())
      assertNull(rig.store.read())
      val snapshot = value(voice.snapshot())
      @Suppress("UNCHECKED_CAST")
      assertEquals(false, (snapshot["status"] as Map<String, Any?>)["signedIn"])
      assertEquals("unavailable", snapshot["state"])
      eventually { rig.recorder.hasError(VoiceFailure.signedOut) }
    }
  }
}
