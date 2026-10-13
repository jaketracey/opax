package au.com.opax.voice.call

import au.com.opax.voice.*

import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class LoopbackCallTests : SafeVoiceTest() {
  private fun fixture(scenario: LoopbackRelay.Scenario = LoopbackRelay.Scenario.Conversation, timing: CallTiming = CallTiming()): Pair<LoopbackRelay, Rig> {
    val server = LoopbackRelay(scenario)
    val port = server.start()
    return server to Rig.make(relays = GuardedRelayFactory(port), port = port, timing = timing)
  }

  @Test fun realLoopbackHandshakeCannedConversationAndSilence() = test {
    val (server, rig) = fixture()
    rig.controller.start()
    eventually { rig.controller.state == CallState.live }
    eventually { server.snapshot().pongIds == listOf(42L) }
    repeat(4) {
      rig.engine.feed(CaptureBuffer(FloatArray(400), 16000))
      delay(25)
    }
    eventually { server.snapshot().audioSizes.size == 4 }
    eventually { rig.recorder.items.any { it is VoiceEvent.Sources && it.sources.size == 3 } }
    rig.controller.sendText("Synthetic text")
    rig.controller.contextualUpdate("Synthetic context")
    rig.controller.userActivity()
    val log = server.snapshot()
    assertEquals("__Host-opax_session=$fixtureToken", log.headers["cookie"])
    assertEquals("https://opax.com.au", log.headers["origin"])
    assertEquals("conversation_initiation_client_data", log.types.first())
    assertEquals(listOf(800, 800, 800, 800), log.audioSizes)
    assertTrue(log.allAudioSilent)
    assertEquals(listOf("127.0.0.1"), log.peers)
    val played = rig.engine.played
    assertEquals(1, played.size)
    assertTrue(played.all { buffer -> buffer.all { it == 0f } })
    eventually { rig.recorder.items.any { it is VoiceEvent.Transcript && it.turns.any { turn -> turn.text == "Synthetic corrected greeting" } } }
    rig.controller.end()
    assertEquals(600L, rig.controller.latestStatus?.remainingSeconds)
    rig.close()
    server.stop()
    val audit = VoiceTestSafety.audit()
    assertEquals(0, audit.inputOpens)
    assertEquals(0, audit.outputOpens)
    assertEquals(setOf("127.0.0.1"), audit.hosts)
    println("AUDIT: measured input opens=${audit.inputOpens} output opens=${audit.outputOpens}; hosts=${audit.hosts.sorted()}")
  }

  @Test fun loopbackMuLawMetadataAndSyntheticAudio() = test {
    val (server, rig) = fixture(LoopbackRelay.Scenario.Ulaw)
    rig.controller.start()
    eventually { rig.controller.state == CallState.live }
    rig.engine.feed(CaptureBuffer(FloatArray(200), 8000))
    eventually { server.snapshot().audioSizes == listOf(200) }
    assertTrue(server.snapshot().allAudioSilent)
    rig.close()
    server.stop()
  }

  @Test fun loopbackUnknownFormatAndMetadataTimeout() = test {
    for (scenario in listOf(LoopbackRelay.Scenario.Unsupported, LoopbackRelay.Scenario.NoMetadata)) {
      val (server, rig) = fixture(scenario, CallTiming(connectTimeout = 0.2))
      rig.controller.start()
      eventually { rig.controller.state == CallState.failed }
      assertEquals(0, rig.engine.starts)
      rig.close()
      server.stop()
    }
  }

  @Test fun loopbackDeadlinePersonalBudgetAndUnlimited() = test {
    for ((status, reason) in listOf(
      signedStatus(remaining = 0) to EndReason.allowanceExhausted,
      signedStatus(remaining = 300, budget = false) to EndReason.budgetClosed,
      signedStatus(unlimited = true) to EndReason.callLimit,
    )) {
      val (server, rig) = fixture(LoopbackRelay.Scenario.Quiet)
      rig.controller.start()
      eventually { rig.controller.state == CallState.live }
      rig.http.configure(status = status)
      server.close(1000, "Your free voice time has finished")
      eventually { VoiceEvent.State(CallState.ended, reason) in rig.recorder }
      rig.close()
      server.stop()
    }
  }

  @Test fun loopbackProviderCloseAndPolicyClose() = test {
    for ((code, reason, failure) in listOf(
      Triple(1000, "Voice conversation ended", null),
      Triple(1011, "Voice provider connection interrupted", VoiceFailure.network),
      Triple(1008, "Initiation timeout", VoiceFailure.policy),
    )) {
      val (server, rig) = fixture(LoopbackRelay.Scenario.Quiet)
      rig.controller.start()
      eventually { rig.controller.state == CallState.live }
      server.close(code, reason)
      eventually { rig.controller.state == if (failure == null) CallState.ended else CallState.failed }
      if (failure != null) eventually { rig.recorder.hasError(failure) }
      rig.close()
      server.stop()
    }
  }

  @Test fun loopbackAbnormalDropAndReconnectRefusedUntilStatusClears() = test {
    val (server, rig) = fixture(LoopbackRelay.Scenario.Quiet, CallTiming(pollInterval = 0.05, pollMaxInterval = 0.05))
    rig.controller.start()
    eventually { rig.controller.state == CallState.live }
    rig.http.configure(status = signedStatus(active = "active"))
    server.drop()
    eventually { rig.controller.state == CallState.failed }
    rig.controller.start()
    assertEquals(CallState.unavailable, rig.controller.state)
    assertEquals(1, rig.http.count(AuthRoute.voiceStart))
    assertEquals(1, server.snapshot().peers.size)
    rig.http.configure(status = signedStatus(remaining = 0)) // fixture expiry fully charges reservation
    eventually { rig.controller.latestStatus?.activeSession == null }
    assertEquals(0L, rig.controller.latestStatus?.remainingSeconds)
    rig.close()
    server.stop()
  }

  @Test fun newCallAfterDropGetsFreshReservationAndSocket() = test {
    val (server, rig) = fixture(LoopbackRelay.Scenario.Quiet)
    rig.controller.start()
    eventually { rig.controller.state == CallState.live }
    server.drop()
    eventually { rig.controller.state == CallState.failed }
    // An explicit retry can still race a server-side open row: the 409 is never retried.
    rig.http.configure(start = HttpResponse(409, body = json(mapOf("error" to "Open"))))
    rig.controller.start()
    assertEquals(2, rig.http.count(AuthRoute.voiceStart))
    rig.http.configure(status = signedStatus(), start = null)
    rig.controller.start()
    eventually { rig.controller.state == CallState.live }
    assertEquals(3, rig.http.requests.count { it == AuthRoute.voiceStart })
    assertEquals(2, server.snapshot().peers.size)
    rig.close()
    server.stop()
  }

  @Test fun loopbackUpgrade503ReleasedReservedConnectingActiveAndRevoked401() = test {
    for (active in listOf(null, "reserved", "connecting", "active")) {
      val (server, rig) = fixture(LoopbackRelay.Scenario.Refuse(503), CallTiming(pollInterval = 0.05, pollMaxInterval = 0.05))
      // Status is clear before reservation, then changes when the fixture accepts start.
      rig.http.pauseStart()
      val task = launch { rig.controller.start() }
      eventually { rig.controller.state == CallState.reserving }
      rig.http.configure(status = signedStatus(active = active))
      rig.http.resumeStart()
      task.join()
      eventually { rig.recorder.hasError(VoiceFailure.unavailable) }
      assertEquals(1, rig.http.count(AuthRoute.voiceFinish))
      assertEquals(600L, rig.controller.latestStatus?.remainingSeconds)
      if (active != null) {
        rig.controller.start()
        assertEquals(1, rig.http.count(AuthRoute.voiceStart))
        val remaining = if (active == "connecting" || active == "active") 0 else 600
        rig.http.configure(status = signedStatus(remaining = remaining))
        eventually { rig.controller.latestStatus?.activeSession == null }
        assertEquals(remaining.toLong(), rig.controller.latestStatus?.remainingSeconds)
      }
      rig.close()
      server.stop()
    }
    val (server, rig) = fixture(LoopbackRelay.Scenario.Refuse(401))
    rig.controller.start()
    eventually { rig.recorder.hasError(VoiceFailure.signedOut) }
    assertNull(rig.store.read())
    assertEquals(false, rig.controller.latestStatus?.signedIn)
    rig.close()
    server.stop()
  }

  // Android addition: the e2e variant's synthetic input and silent playback over a real socket.
  @Test fun syntheticInputStreamsSilentChunksAtTheTwentyFiveMillisecondCadence() = test {
    val server = LoopbackRelay(LoopbackRelay.Scenario.Quiet)
    val port = server.start()
    val rig = Rig.make(relays = GuardedRelayFactory(port), port = port, engines = DebugSyntheticEngineFactory())
    val levels = mutableListOf<AudioLevels>()
    val reading = launch { rig.controller.levels.collect { synchronized(levels) { levels += it } } }
    rig.controller.start()
    eventually { rig.controller.state == CallState.live }
    eventually { server.snapshot().audioSizes.size >= 41 }
    val log = server.snapshot()
    assertTrue(log.audioSizes.all { it == 800 })
    assertTrue(log.allAudioSilent)
    val perSecond = (log.audioTimes.size - 1) / (log.audioTimes.last() - log.audioTimes.first())
    assertTrue("cadence $perSecond per second", perSecond in 30.0..50.0)
    // Silent playback still moves the output meter while it is due; input stays silent.
    server.broadcast(audioEvent(1, FloatArray(16000)))
    eventually { synchronized(levels) { levels.any { it.output > 0.1f } } }
    assertTrue(synchronized(levels) { levels.all { it.input == 0f } })
    reading.cancel()
    rig.close()
    server.stop()
    val audit = VoiceTestSafety.audit()
    assertEquals(0, audit.inputOpens)
    assertEquals(setOf("127.0.0.1"), audit.hosts)
  }

  @Test fun loopbackPreflightFixtureRowsAllowanceBudgetCapacityAndRevocation() = test {
    for ((response, failure) in listOf(
      HttpResponse(403, body = json(mapOf("error" to "You have used your ten free minutes of voice conversation."))) to VoiceFailure.allowanceExhausted,
      HttpResponse(429, body = json(mapOf("error" to "Busy", "reason" to "budget"))) to VoiceFailure.budgetClosed,
      HttpResponse(429, body = json(mapOf("error" to "Busy", "reason" to "capacity"))) to VoiceFailure.capacity,
      HttpResponse(401, body = json(mapOf("error" to "Revoked"))) to VoiceFailure.signedOut,
    )) {
      val (server, rig) = fixture(LoopbackRelay.Scenario.Quiet)
      rig.http.configure(start = response, statusAfterStart = if (failure == VoiceFailure.allowanceExhausted) signedStatus(remaining = 0) else null)
      rig.controller.start()
      eventually { rig.recorder.hasError(failure) }
      assertTrue(server.snapshot().peers.isEmpty())
      val status = rig.controller.latestStatus
      if (failure == VoiceFailure.signedOut) assertEquals(false, status?.signedIn)
      if (failure == VoiceFailure.allowanceExhausted) assertEquals(0L, status?.remainingSeconds)
      if (failure == VoiceFailure.budgetClosed) assertEquals(false, status?.budgetOpen)
      rig.close()
      server.stop()
    }
  }
}
