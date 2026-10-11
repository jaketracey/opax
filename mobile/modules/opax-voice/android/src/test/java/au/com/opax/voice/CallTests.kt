package au.com.opax.voice

import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Assert.fail
import org.junit.Test

class CallTests : SafeVoiceTest() {
  @Test fun idleReadyAndCancellationDuringStatusRead() = test {
    val rig = Rig.make()
    assertEquals(CallState.idle, rig.controller.state)
    rig.controller.refreshStatus()
    assertEquals(CallState.ready, rig.controller.state)
    rig.http.pauseNextStatus()
    val task = launch { rig.controller.start() }
    eventually { rig.http.count(Route.voiceStatus) == 2 }
    rig.controller.end()
    rig.http.resumeStatus()
    task.join()
    assertEquals(CallState.ended, rig.controller.state)
    assertEquals(0, rig.http.count(Route.voiceStart))
    rig.close()
  }

  @Test fun receiverTeardownFreshReadIgnoresItsOwnTaskCancellation() = test {
    val rig = Rig.make()
    rig.live()
    rig.http.configure(status = signedStatus(remaining = 123))
    rig.relay.enqueue(RelayMessage.Closed(RelayClose(1000)))
    eventually { rig.controller.state == CallState.ended }
    assertEquals(123L, rig.controller.latestStatus?.remainingSeconds)
    assertEquals(1, rig.http.count(Route.voiceFinish))
    rig.close()
  }

  @Test fun levelsStreamOnlyWhileLiveAndSettleSilentAtEnd() = test {
    val rig = Rig.make()
    val seen = mutableListOf<AudioLevels>()
    val reading = CoroutineScope(Dispatchers.Default).launch { rig.controller.levels.collect { synchronized(seen) { seen += it } } }
    rig.engine.setMeter(AudioLevels(0.4f, 0.7f))
    rig.live()
    eventually { synchronized(seen) { AudioLevels(0.4f, 0.7f) in seen } }
    rig.controller.end()
    eventually { synchronized(seen) { seen.lastOrNull() == AudioLevels.silent } }
    val count = synchronized(seen) { seen.size }
    delay(250)
    assertEquals(count, synchronized(seen) { seen.size })
    reading.cancel()
    rig.close()
  }

  @Test fun failedFreshStatusDoesNotExposeCachedAllowance() = test {
    val rig = Rig.make()
    rig.controller.refreshStatus()
    rig.http.setResponse(Route.voiceStatus, FixtureResponse(503, json(mapOf("error" to "Synthetic failure"))))
    try { rig.controller.refreshStatus(); fail() } catch (_: VoiceException) {}
    assertNull(rig.controller.latestStatus)
    assertEquals(CallState.failed, rig.controller.state)
    rig.close()
  }

  @Test fun happyPathEveryNormalStateAndFreshStatusAfterFinish() = test {
    val rig = Rig.make()
    rig.live()
    rig.controller.setMuted(true)
    rig.engine.feed(CaptureBuffer(FloatArray(400) { 1f }, 16000))
    eventually { rig.relay.messages.size >= 2 }
    val chunk = bodyMap(rig.relay.messages[1])["user_audio_chunk"] as String
    assertTrue(java.util.Base64.getDecoder().decode(chunk).all { it == 0.toByte() })
    rig.controller.end()
    eventually { rig.controller.state == CallState.ended }
    assertEquals(600L, rig.controller.latestStatus?.remainingSeconds)
    assertEquals(1, rig.http.count(Route.voiceFinish))
    assertEquals(2, rig.http.count(Route.voiceStatus))
    assertFalse(rig.session.awake)
    eventually { VoiceEvent.State(CallState.ended, EndReason.user) in rig.recorder }
    val states = rig.recorder.items.filterIsInstance<VoiceEvent.State>().map { it.state }
    for (state in listOf(CallState.checking, CallState.ready, CallState.reserving, CallState.connecting, CallState.live, CallState.ending, CallState.ended)) {
      assertTrue(state.name, state in states)
    }
    rig.close()
  }

  @Test fun statusRefusalsBeforePermissionOrReservation() = test {
    val cases = listOf(
      signedStatus(signedIn = false) to VoiceFailure.signedOut, signedStatus(enabled = false) to VoiceFailure.disabled,
      signedStatus(remaining = 0) to VoiceFailure.allowanceExhausted, signedStatus(budget = false) to VoiceFailure.budgetClosed,
      signedStatus(active = "reserved") to VoiceFailure.callOpen, signedStatus(active = "connecting") to VoiceFailure.callOpen,
      signedStatus(active = "active") to VoiceFailure.callOpen,
    )
    for ((status, refusal) in cases) {
      val rig = Rig.make()
      rig.http.configure(status = status)
      rig.controller.start()
      assertEquals(CallState.unavailable, rig.controller.state)
      assertEquals(0, rig.permission.count)
      assertEquals(0, rig.http.count(Route.voiceStart))
      eventually { rig.recorder.hasError(refusal) }
      rig.close()
    }
  }

  @Test fun consentAndMicrophoneRefusedBeforeReserving() = test {
    for (consent in listOf(false, true)) {
      val rig = Rig.make()
      rig.consent.granted = consent
      if (consent) rig.permission.allowed = false
      rig.controller.start()
      eventually { rig.recorder.hasError(if (consent) VoiceFailure.microphoneDenied else VoiceFailure.consentRequired) }
      assertEquals(0, rig.http.count(Route.voiceStart))
      rig.close()
    }
  }

  @Test fun start409403429And503NeverRetryBlindly() = test {
    for ((code, body, refusal) in listOf(
      Triple(409, mapOf("error" to "Open"), VoiceFailure.callOpen),
      Triple(403, mapOf("error" to "You have used your ten free minutes of voice conversation."), VoiceFailure.allowanceExhausted),
      Triple(429, mapOf("error" to "Busy", "reason" to "budget"), VoiceFailure.budgetClosed),
      Triple(429, mapOf("error" to "Busy", "reason" to "capacity"), VoiceFailure.capacity),
      Triple(429, mapOf("error" to "Busy"), VoiceFailure.rateLimited),
      Triple(503, mapOf("error" to "Synthetic error"), VoiceFailure.unavailable),
    )) {
      val rig = Rig.make()
      rig.http.configure(
        start = FixtureResponse(code, json(body)),
        statusAfterStart = if (refusal == VoiceFailure.allowanceExhausted) signedStatus(remaining = 0) else null,
      )
      rig.controller.start()
      eventually { rig.recorder.hasError(refusal) }
      assertEquals(1, rig.http.count(Route.voiceStart))
      assertEquals(if (code == 403) 3 else 2, rig.http.count(Route.voiceStatus))
      assertEquals(0, rig.relay.connects)
      rig.close()
    }
  }

  @Test fun start503WithUnknownReservationPollsWithoutFinish() = test {
    val rig = Rig.make(timing = CallTiming(pollInterval = 0.05, pollMaxInterval = 0.05))
    rig.http.configure(start = FixtureResponse(503, json(mapOf("error" to "Synthetic failure"))))
    val startTask = launch { rig.controller.start() }
    eventually { rig.http.count(Route.voiceStart) == 1 }
    rig.http.configure(status = signedStatus(active = "reserved"), start = FixtureResponse(503, json(mapOf("error" to "Synthetic failure"))))
    startTask.join()
    // Refresh also exposes the held row when the status raced the initial failure.
    rig.controller.refreshStatus()
    assertEquals(0, rig.http.count(Route.voiceFinish))
    assertEquals(600L, rig.controller.latestStatus?.remainingSeconds)
    rig.http.configure(status = signedStatus())
    eventually { rig.controller.state == CallState.ready }
    rig.close()
  }

  @Test fun cancellationWhilePermissionPendingAndNoDuplicateStart() = test {
    val rig = Rig.make()
    rig.permission.pause()
    val task = launch { rig.controller.start() }
    eventually { rig.permission.count == 1 }
    rig.controller.start()
    rig.controller.end()
    rig.permission.resume()
    task.join()
    assertEquals(0, rig.http.count(Route.voiceStart))
    assertEquals(1, rig.permission.count)
    rig.close()
  }

  @Test fun cancellationWhileReservationPendingFinishesLateRow() = test {
    val rig = Rig.make()
    rig.http.pauseStart()
    val task = launch { rig.controller.start() }
    eventually { rig.controller.state == CallState.reserving }
    rig.controller.end()
    rig.http.resumeStart()
    task.join()
    assertEquals(1, rig.http.count(Route.voiceFinish))
    assertEquals(0, rig.relay.connects)
    rig.close()
  }

  @Test fun cancellationWhileConnectingAndRepeatedEndAreIdempotent() = test {
    val rig = Rig.make()
    rig.controller.start()
    assertEquals(CallState.connecting, rig.controller.state)
    rig.controller.end()
    rig.controller.end()
    assertEquals(1, rig.relay.closes)
    assertEquals(1, rig.http.count(Route.voiceFinish))
    rig.close()
  }

  @Test fun logoutWaitsForExistingTeardownBeforeRevokingSession() = test {
    val rig = Rig.make()
    rig.live()
    rig.http.pauseNextStatus()
    val ending = launch { rig.controller.end() }
    eventually { rig.http.count(Route.voiceStatus) == 2 }
    val logout = launch { rig.controller.logout() }
    delay(30)
    assertEquals(0, rig.http.count(Route.logout))
    rig.http.resumeStatus()
    ending.join()
    logout.join()
    assertEquals(1, rig.http.count(Route.logout))
    assertNull(rig.http.credential)
    rig.close()
  }

  @Test fun connectTimeoutClosesAndRefreshes() = test {
    val rig = Rig.make(timing = CallTiming(connectTimeout = 0.03))
    rig.controller.start()
    eventually { rig.recorder.hasError(VoiceFailure.timeout) }
    assertEquals(1, rig.http.count(Route.voiceFinish))
    assertEquals(CallState.failed, rig.controller.state)
    rig.close()
  }

  @Test fun upgradeMayTakeLongerThanTenSecondsBeforeInitiation() = test {
    val rig = Rig.make(clock = ScaledClock)
    rig.relay.pauseHandshake()
    rig.relay.metadata()
    val starting = launch { rig.controller.start() }
    eventually { rig.relay.handshakeWaiting }
    // Accelerated clock: 18 seconds before upgrade, below the 35-second
    // connection limit. The relay's ten seconds only starts after upgrade.
    delay(180)
    assertEquals(CallState.connecting, rig.controller.state)
    rig.relay.resumeHandshake()
    starting.join()
    eventually { rig.controller.state == CallState.live }
    rig.close()
  }

  @Test fun unsupportedFormatFailsBeforeEngineAllocationAndMissingInputDefaults() = test {
    val rig = Rig.make()
    rig.relay.metadata(output = "opus_48000")
    rig.controller.start()
    eventually { rig.recorder.hasError(VoiceFailure.unsupportedFormat) }
    assertEquals(0, rig.engine.starts)
    rig.close()
    val defaultRig = Rig.make()
    defaultRig.relay.metadata(input = null)
    defaultRig.controller.start()
    eventually { defaultRig.controller.state == CallState.live }
    defaultRig.close()
  }

  @Test fun audioSessionEngineAndRouteFailuresEndAndRefresh() = test {
    for (step in 0 until 3) {
      val rig = Rig.make()
      if (step == 0) rig.session.fail()
      if (step == 1) rig.engine.fail(start = true)
      if (step == 2) {
        rig.live()
        rig.engine.fail(route = true)
        rig.controller.handle(LifecycleEvent.configurationChanged)
      } else {
        rig.relay.metadata()
        rig.controller.start()
      }
      eventually { rig.recorder.hasError(VoiceFailure.audio) }
      assertEquals(2, rig.http.count(Route.voiceStatus))
      rig.close()
    }
  }

  @Test fun lifecycleBothOsNotificationFormsNoAutoRestart() = test {
    for ((event, reason) in listOf(
      LifecycleEvent.interruptionBegan to EndReason.interruption, LifecycleEvent.becameInactive to EndReason.interruption,
      LifecycleEvent.background to EndReason.background, LifecycleEvent.mediaServicesReset to EndReason.mediaReset,
    )) {
      val rig = Rig.make()
      rig.live()
      rig.lifecycle.emit(event)
      eventually { VoiceEvent.State(CallState.ended, reason) in rig.recorder }
      rig.controller.handle(LifecycleEvent.interruptionEnded)
      rig.controller.handle(LifecycleEvent.resumptionRecommended)
      rig.controller.handle(LifecycleEvent.foreground)
      assertEquals(1, rig.http.count(Route.voiceStart))
      rig.close()
    }
  }

  @Test fun inactiveAndRouteChangesKeepSocket() = test {
    val rig = Rig.make()
    rig.live()
    rig.controller.handle(LifecycleEvent.sceneInactive)
    rig.controller.handle(LifecycleEvent.configurationChanged)
    assertEquals(CallState.live, rig.controller.state)
    assertEquals(1, rig.engine.routes)
    assertEquals(0, rig.relay.closes)
    rig.controller.withdrawConsent()
    eventually { VoiceEvent.State(CallState.ended, EndReason.consentWithdrawn) in rig.recorder }
    rig.close()
  }

  @Test fun playbackOrderBoundsInterruptionStaleDropAndDrainMode() = test {
    val rig = Rig.make()
    rig.live()
    fun audio(id: Int, value: Float, count: Int = 400) = audioEvent(id, FloatArray(count) { value })
    rig.relay.enqueue(audio(1, 0.25f))
    rig.relay.enqueue(audio(2, 0.5f))
    eventually { rig.engine.played.size == 2 }
    val played = rig.engine.played
    assertEquals(0.25f, played[0][0], 0.0001f)
    assertEquals(0.5f, played[1][0], 0.0001f)
    rig.relay.enqueue(json(mapOf("type" to "interruption", "interruption_event" to mapOf("event_id" to 3))))
    rig.relay.enqueue(audio(2, 1f))
    eventually { rig.engine.flushes == 2 } // initial epoch installation, then interruption
    assertEquals(2, rig.engine.played.size)
    rig.engine.drainPlayback()
    eventually { VoiceEvent.Mode(CallMode.listening) in rig.recorder }
    rig.relay.enqueue(audio(4, 0f, 32001))
    eventually { rig.engine.played.size == 5 }
    assertEquals(CallState.live, rig.controller.state)
    rig.close()
  }

  @Test fun stalledSendEndsAtTwoSecondBound() = test {
    val rig = Rig.make()
    rig.live()
    rig.relay.stallAudio()
    rig.engine.feed(CaptureBuffer(FloatArray(16000), 16000))
    eventually { rig.relay.messages.size > 1 }
    rig.engine.feed(CaptureBuffer(FloatArray(16001), 16000))
    rig.engine.feed(CaptureBuffer(FloatArray(400), 16000))
    eventually { rig.recorder.hasError(VoiceFailure.queueOverflow) }
    rig.close()
  }

  @Test fun closeCodesAndDeadlineUsesFreshStatusForReason() = test {
    for ((code, failure) in listOf(1000 to null, 1008 to VoiceFailure.policy, 1011 to VoiceFailure.network, 1006 to VoiceFailure.network)) {
      val rig = Rig.make()
      rig.live()
      rig.relay.enqueue(RelayMessage.Closed(RelayClose(code, "Voice conversation ended")))
      eventually { rig.controller.state == if (failure == null) CallState.ended else CallState.failed }
      if (failure != null) eventually { rig.recorder.hasError(failure) }
      rig.close()
    }
    for ((status, reason) in listOf(
      signedStatus(remaining = 0) to EndReason.allowanceExhausted,
      signedStatus(remaining = 300, budget = false) to EndReason.budgetClosed,
      signedStatus(unlimited = true) to EndReason.callLimit,
    )) {
      val rig = Rig.make()
      rig.live()
      rig.http.configure(status = status)
      rig.relay.enqueue(RelayMessage.Closed(RelayClose(1000, "Your free voice time has finished")))
      eventually { VoiceEvent.State(CallState.ended, reason) in rig.recorder }
      rig.close()
    }
  }

  @Test fun agentEndToolAndMaxDurationError() = test {
    for (event in listOf(
      mapOf("type" to "agent_tool_response", "agent_tool_response" to mapOf("tool_name" to "end_call")),
      mapOf("type" to "error", "error_event" to mapOf("error_type" to "max_duration_exceeded")),
    )) {
      val rig = Rig.make()
      rig.live()
      rig.relay.enqueue(json(event))
      eventually { rig.controller.state == CallState.ended }
      rig.close()
    }
  }

  @Test fun abnormalCloseRecoversOnlyFreshConfirmedDeadlineSignals() = test {
    val rows = listOf(
      Triple(signedStatus(remaining = 0), CallState.ended, EndReason.allowanceExhausted),
      Triple(signedStatus(remaining = 300, budget = false), CallState.ended, EndReason.budgetClosed),
      Triple(signedStatus(remaining = 300), CallState.failed, EndReason.network),
      Triple(signedStatus(unlimited = true), CallState.failed, EndReason.network),
      Triple(signedStatus(remaining = 0, signedIn = false), CallState.failed, EndReason.network),
      Triple(signedStatus(remaining = 0, enabled = false), CallState.ended, EndReason.allowanceExhausted),
    )
    for ((body, state, reason) in rows) {
      val rig = Rig.make()
      rig.live()
      rig.http.configure(status = body)
      rig.relay.enqueue(RelayMessage.Closed(RelayClose(1006, "Your free voice time has finished")))
      eventually { VoiceEvent.State(state, reason) in rig.recorder }
      assertEquals(decodeStatus(body).remainingSeconds, rig.controller.latestStatus?.remainingSeconds)
      assertEquals(state == CallState.failed, rig.recorder.hasError(VoiceFailure.network))
      rig.close()
    }
  }

  @Test fun abnormalCloseWithFailedStatusStaysNetworkAndPolicyFaultsStayFailures() = test {
    for (code in listOf(1006, 1008, 1011)) {
      val rig = Rig.make()
      rig.live()
      if (code == 1006) rig.http.setResponse(Route.voiceStatus, FixtureResponse(503, json(mapOf("error" to "Synthetic unavailable"))))
      else rig.http.configure(status = signedStatus(remaining = 0))
      rig.relay.enqueue(RelayMessage.Closed(RelayClose(code)))
      // The recorder trails the controller; its failed state follows every error event.
      eventually { rig.recorder.items.any { it is VoiceEvent.State && it.state == CallState.failed } }
      assertTrue(rig.recorder.hasError(if (code == 1008) VoiceFailure.policy else VoiceFailure.network))
      if (code == 1006) assertTrue(rig.recorder.hasError(VoiceFailure.unavailable))
      rig.close()
    }
  }

  @Test fun textActivityAndContextUpdateLimits() = test {
    val rig = Rig.make()
    rig.live()
    rig.controller.sendText("Synthetic input")
    rig.controller.contextualUpdate("Synthetic context")
    rig.controller.userActivity()
    try {
      rig.controller.sendText("x".repeat(2001))
      fail()
    } catch (error: VoiceException) {
      assertEquals(VoiceFailure.policy, error.failure)
    }
    assertEquals(4, rig.relay.messages.size)
    rig.close()
  }

  // Android additions: the monthly cap end to end, and the countdown's display-only role.

  @Test fun countdownAtZeroNeverEndsLocallyOnlyTheRelayDeadlineDoes() = test {
    val rig = Rig.make(clock = ScaledClock)
    rig.http.configure(start = null)
    rig.live()
    // 600 accelerated seconds pass in about six; the call stays live at zero.
    eventually(timeout = 15.0) { VoiceEvent.RemainingTime(0) in rig.recorder }
    delay(100)
    assertEquals(CallState.live, rig.controller.state)
    rig.http.configure(status = signedStatus(remaining = 0))
    rig.relay.enqueue(RelayMessage.Closed(RelayClose(1000, "Your free voice time has finished")))
    eventually { VoiceEvent.State(CallState.ended, EndReason.allowanceExhausted) in rig.recorder }
    // Over the cap: the next Start is refused before permission or reservation.
    rig.controller.start()
    assertEquals(CallState.unavailable, rig.controller.state)
    eventually { rig.recorder.hasError(VoiceFailure.allowanceExhausted) }
    assertEquals(1, rig.http.count(Route.voiceStart))
    assertEquals(1, rig.permission.count)
    rig.close()
  }

  @Test fun noMicrophoneBeforeStart() = test {
    val rig = Rig.make()
    rig.controller.refreshStatus()
    rig.controller.snapshot()
    rig.controller.discardEvidence()
    rig.controller.setMuted(true)
    try { rig.controller.sendText("Synthetic") } catch (_: VoiceException) {}
    for (event in LifecycleEvent.entries) rig.controller.handle(event)
    rig.consent.granted = false
    rig.controller.start()
    eventually { rig.recorder.hasError(VoiceFailure.consentRequired) }
    assertEquals(0, rig.permission.count)
    assertEquals(0, rig.session.activations)
    assertEquals(0, rig.engine.starts)
    assertEquals(0, rig.http.count(Route.voiceStart))
    rig.close()
  }
}
