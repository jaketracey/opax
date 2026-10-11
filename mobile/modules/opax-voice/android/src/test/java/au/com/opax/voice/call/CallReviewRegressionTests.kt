package au.com.opax.voice.call

import au.com.opax.voice.*

import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import kotlinx.coroutines.yield
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Assert.fail
import org.junit.Test

/** The call half of the iOS ReviewRegressionTests; the account half ports in lane 1. */
class CallReviewRegressionTests : SafeVoiceTest() {
  @Test fun exactWorkerStatusFixturesAndUnlimitedCall() = test {
    for (name in listOf("signedOut", "allowance", "unlimited", "openSession", "budgetClosed", "budgetClosedFutureW8")) {
      val status = VoiceStatus.decode(json(workerShapes.getValue(name)))
      if (name == "unlimited") { assertNull(status.totalSeconds); assertEquals(true, status.unlimited) }
      if (name == "signedOut") assertNull(status.unlimited)
      if (name == "openSession") assertNotNull(status.activeSession)
      if (name == "budgetClosedFutureW8") assertEquals(VoiceFailure.budgetClosed, status.refusal)
    }
    val rig = Rig.make()
    rig.http.configure(status = json(workerShapes.getValue("unlimited")))
    rig.live()
    val status = rig.controller.latestStatus
    assertNull(status?.totalSeconds)
    assertEquals(true, status?.unlimited)
    rig.close()
  }

  @Suppress("UNCHECKED_CAST")
  @Test fun unknownSessionStateAndNullableFieldsStillRefuseStart() = test {
    val body = bodyMap(signedStatus(active = "future-open")).toMutableMap()
    body["active_session"] = (body["active_session"] as Map<String, Any?>).toMutableMap().also { it["expires_at"] = null }
    body["total_seconds"] = null
    body["unlimited"] = null
    body["budget_open"] = null
    val status = VoiceStatus.decode(json(body))
    assertEquals(VoiceFailure.callOpen, status.refusal)
    val rig = Rig.make()
    rig.http.configure(status = json(body))
    rig.controller.start()
    assertEquals(CallState.unavailable, rig.controller.state)
    assertEquals(0, rig.http.count(AuthRoute.voiceStart))
    rig.close()
  }

  @Test fun disabledPrecedesSignedOutAndStartDuringRefreshHasSpecificError() = test {
    assertEquals(VoiceFailure.disabled, VoiceStatus.decode(signedStatus(signedIn = false, enabled = false)).refusal)
    val rig = Rig.make()
    rig.http.pauseNextStatus()
    val refreshing = launch { rig.controller.refreshStatus() }
    eventually { rig.http.statusWaiter != null }
    rig.controller.start()
    eventually { rig.recorder.hasError(VoiceFailure.statusChecking) }
    rig.http.resumeStatus()
    refreshing.join()
    rig.close()
  }

  @Test fun fastClockDoesNotRejectServerReservation() = test {
    val fast = object : VoiceClock {
      override fun now() = epochSeconds() + 86400
      override suspend fun sleep(seconds: Double) = SystemVoiceClock.sleep(seconds)
    }
    val rig = Rig.make(clock = fast)
    rig.store.write(SessionCredential(fixtureToken, distantFuture))
    rig.live()
    rig.close()
    assertEquals(1, rig.http.count(AuthRoute.voiceFinish))
  }

  @Test fun invalidStartResponseFinishesEveryValidRecoveredSessionId() = test {
    for (invalid in listOf("missing", "url", "remaining", "expiry", "oversized")) {
      val rig = Rig.make()
      val body = mutableMapOf<String, Any?>(
        "session_id" to fixtureId, "transport" to "websocket", "remaining_seconds" to 600, "expires_at" to 0,
        "signed_url" to "ws://127.0.0.1:8901/api/voice/connect?session_id=$fixtureId",
      )
      if (invalid == "missing") body.remove("transport")
      if (invalid == "url") body["signed_url"] = "wss://opax.com.au/api/voice/connect?session_id=$fixtureId"
      if (invalid == "remaining") body["remaining_seconds"] = 0
      if (invalid == "expiry") body["expires_at"] = null
      if (invalid == "oversized") body["padding"] = "x".repeat(2 * 1024 * 1024)
      rig.http.configure(start = HttpResponse(201, body = json(body)))
      rig.controller.start()
      assertEquals(invalid, 1, rig.http.count(AuthRoute.voiceFinish))
      assertEquals(0, rig.relay.connects)
      assertEquals(600L, rig.controller.latestStatus?.remainingSeconds)
      rig.close()
    }
  }

  @Test fun start403UsesFreshStatusRegardlessOfWordingAndRetainsCredential() = test {
    for (text in listOf("Reworded allowance", "Origin-looking prose", "")) {
      val rig = Rig.make()
      rig.http.configure(start = HttpResponse(403, body = json(mapOf("error" to text))), statusAfterStart = signedStatus(remaining = 0))
      rig.controller.start()
      eventually { rig.recorder.hasError(VoiceFailure.allowanceExhausted) }
      assertNotNull(rig.store.read())
      rig.close()
    }
  }

  @Test fun refreshAndLogoutExposeOnlyCoreFailures() = test {
    val rig = Rig.make()
    rig.http.setResponse(AuthRoute.voiceStatus, HttpResponse(200, body = "bad JSON".encodeToByteArray()))
    try { rig.controller.refreshStatus(); fail() } catch (error: VoiceException) { assertEquals(VoiceFailure.invalidResponse, error.failure) }
    rig.http.failTransport()
    try { rig.controller.refreshStatus(); fail() } catch (error: VoiceException) { assertEquals(VoiceFailure.network, error.failure) }
    try { rig.controller.logout(); fail() } catch (error: VoiceException) { assertEquals(VoiceFailure.network, error.failure) }
    rig.close()
  }

  @Test fun captureSleepsUntilBufferArrives() = test {
    val rig = Rig.make()
    rig.live()
    eventually { rig.engine.hasCaptureWaiter }
    val before = rig.engine.captureReads
    delay(80)
    assertEquals(before, rig.engine.captureReads)
    rig.engine.feed(CaptureBuffer(FloatArray(400), 16000))
    eventually { rig.relay.messages.size == 2 }
    rig.close()
  }

  @Test fun playbackThreeThirtyAndOverBoundBurstsDoNotEndCallAndKeepReading() = test {
    for (seconds in listOf(3, 30, 70)) {
      val rig = Rig.make()
      rig.relay.metadata(input = "pcm_8000", output = "pcm_8000")
      rig.controller.start()
      eventually { rig.controller.state == CallState.live }
      rig.relay.enqueue(audioEvent(1, FloatArray(seconds * 8000), "pcm_8000"))
      if (seconds <= 30) {
        eventually { rig.engine.queued == seconds * 8000 }
      } else {
        eventually { rig.engine.queued == 30 * 8000 }
        eventually { VoiceEvent.Playback(PlaybackState.truncated) in rig.recorder }
      }
      assertEquals(CallState.live, rig.controller.state)
      assertTrue(rig.engine.maxQueued <= 30 * 8000)
      rig.relay.enqueue(json(mapOf("type" to "ping", "ping_event" to mapOf("event_id" to 99))))
      eventually { rig.relay.messages.any { "99" in it.decodeToString() } }
      assertFalse(rig.recorder.hasError(VoiceFailure.queueOverflow))
      rig.close()
    }
  }

  @Suppress("UNCHECKED_CAST")
  @Test fun pollingUsesExpiryBackoffAndAttemptCap() = test {
    class StepClock : VoiceClock {
      @Volatile var time = epochSeconds()
      val delays = mutableListOf<Double>()
      override fun now() = time
      override suspend fun sleep(seconds: Double) {
        synchronized(delays) { delays += seconds }
        time += seconds
        yield()
      }
    }
    for (expired in listOf(false, true)) {
      val clock = StepClock()
      val rig = Rig.make(timing = CallTiming(pollMaxInterval = 30.0, pollMaxAttempts = 4), clock = clock)
      rig.store.write(SessionCredential(fixtureToken, distantFuture))
      val body = bodyMap(signedStatus(active = "reserved")).toMutableMap()
      body["active_session"] = (body["active_session"] as Map<String, Any?>).toMutableMap()
        .also { it["expires_at"] = clock.now() + if (expired) -100 else 20 }
      rig.http.configure(status = json(body))
      rig.controller.refreshStatus()
      eventually { rig.http.count(AuthRoute.voiceStatus) == 5 }
      val delays = synchronized(clock.delays) { clock.delays.toList() }
      assertEquals(4, delays.size)
      if (expired) assertEquals(listOf(2.0, 4.0, 8.0, 16.0), delays) else assertEquals(20.5, delays[0], 0.01)
      delay(30)
      assertEquals(5, rig.http.count(AuthRoute.voiceStatus))
      rig.close()
    }
  }

  @Test fun coreTransportGuardProtectsRealRelayFactory() = test {
    VoiceTestSafety.withIsolated(VoiceTestSafety.Monitor()) {
      val socket = okhttp3.Request.Builder().url("wss://opax.com.au/api/voice/connect?session_id=$fixtureId")
        .header("Sec-WebSocket-Protocol", "convai").header("Origin", "https://opax.com.au").build()
      try {
        OkHttpRelayFactory(testClient).connect(socket)
        fail()
      } catch (error: VoiceException) {
        assertEquals(VoiceFailure.forbidden, error.failure)
      }
      val audit = VoiceTestSafety.audit()
      assertEquals(0, audit.inputOpens)
      assertEquals(0, audit.outputOpens)
      assertEquals(setOf("opax.com.au"), audit.hosts)
      assertFalse(VoiceTestSafety.audit().isClean)
    }
  }
}

class SnapshotTests : SafeVoiceTest() {
  @Test fun failedRefreshPublishesTheSameClearedStatusAsSnapshot() = test {
    val rig = Rig.make()
    rig.controller.refreshStatus()
    rig.http.failTransport()
    try { rig.controller.refreshStatus(); fail("Expected failed read") } catch (_: VoiceException) {}
    eventually { VoiceEvent.Status(null) in rig.recorder }
    assertNull(rig.controller.snapshot().status)
    rig.close()
  }

  @Test fun callCleanupPublishesClearedStatusBeforeItsFreshRead() = test {
    val rig = Rig.make()
    rig.live()
    rig.http.failTransport()
    rig.controller.end()
    eventually { VoiceEvent.Status(null) in rig.recorder }
    assertNull(rig.controller.snapshot().status)
    rig.close()
  }

  @Test fun dismissDiscardsEvidenceWithoutRequestsButCannotClearLiveCaptions() = test {
    val rig = Rig.make()
    rig.live()
    rig.relay.enqueue(json(mapOf("type" to "agent_response", "agent_response_event" to mapOf("event_id" to 1, "agent_response" to "Transient caption"))))
    eventually { rig.controller.snapshot().transcript.size == 1 }
    rig.controller.discardEvidence()
    assertEquals(1, rig.controller.snapshot().transcript.size)
    rig.controller.end()
    val requests = rig.http.count(AuthRoute.voiceStatus)
    rig.controller.discardEvidence()
    val closed = rig.controller.snapshot()
    assertEquals(emptyList<TranscriptTurn>(), closed.transcript)
    assertEquals(emptyList<VoiceSource>(), closed.sources)
    assertEquals(requests, rig.http.count(AuthRoute.voiceStatus))
    rig.close()
  }

  @Test fun idleSnapshotDoesNotEmitOrMakeRequests() = test {
    val rig = Rig.make()
    val value = rig.controller.snapshot()
    assertEquals(CallState.idle, value.state)
    assertNull(value.reason)
    assertNull(value.mode)
    assertEquals(PlaybackState.flowing, value.playback)
    assertEquals(0, value.remaining)
    assertEquals(emptyList<TranscriptTurn>(), value.transcript)
    assertEquals(emptyList<VoiceSource>(), value.sources)
    assertNull(value.status)
    assertEquals(0, rig.http.count(AuthRoute.voiceStatus))
    rig.close()
  }

  @Test fun remountSnapshotContainsLiveEvidenceAndCurrentMode() = test {
    val rig = Rig.make()
    rig.live()
    rig.controller.setMuted(true)
    rig.relay.enqueue(json(mapOf("type" to "agent_response", "agent_response_event" to mapOf("event_id" to 1, "agent_response" to "Synthetic transcript"))))
    rig.relay.enqueue(json(mapOf("type" to "agent_tool_response_full_payload", "agent_tool_response_full_payload" to mapOf("tool_name" to "receipts", "full_tool_result" to mapOf("sources" to listOf(mapOf("title" to "Public record", "url" to "/money/receipts")))))))
    eventually { val value = rig.controller.snapshot(); value.transcript.size == 1 && value.sources.size == 1 }
    val first = rig.controller.snapshot()
    val second = rig.controller.snapshot()
    // Countdown may advance between reads; stable evidence/state must not.
    assertEquals(first.state, second.state)
    assertEquals(first.mode, second.mode)
    assertEquals(first.transcript, second.transcript)
    assertEquals(first.sources, second.sources)
    assertEquals(CallState.live, first.state)
    assertEquals(CallMode.muted, first.mode)
    assertEquals("Synthetic transcript", first.transcript.first().text)
    assertEquals("/money/receipts", first.sources.first().path)
    assertNotNull(first.status)
    assertEquals(1, rig.http.count(AuthRoute.voiceStatus))
    rig.controller.end()
    val ended = rig.controller.snapshot()
    assertEquals(CallState.ended, ended.state)
    assertEquals(EndReason.user, ended.reason)
    assertEquals(first.transcript, ended.transcript)
    assertEquals(first.sources, ended.sources)
    rig.close()
  }
}

class CallProductionVoiceTests : SafeVoiceTest() {
  /** Stands in for lane 1's StoredVoiceConsent: a persisted choice the controller re-reads. */
  private class StoredChoice(@Volatile var granted: Boolean) : VoiceConsent {
    override suspend fun isGranted() = granted
  }

  @Test fun storedWithdrawalBlocksTheNextCallBeforePermissionOrReservation() = test {
    val consent = StoredChoice(true)
    val rig = Rig.make(storedConsent = consent)
    rig.live()
    consent.granted = false
    rig.controller.withdrawConsent()
    eventually { rig.controller.state == CallState.ended }
    rig.controller.start()
    eventually { rig.recorder.hasError(VoiceFailure.consentRequired) }
    assertEquals(1, rig.permission.count)
    assertEquals(1, rig.http.count(AuthRoute.voiceStart))
    rig.close()
  }
}
