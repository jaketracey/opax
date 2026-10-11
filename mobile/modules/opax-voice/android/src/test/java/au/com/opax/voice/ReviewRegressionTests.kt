package au.com.opax.voice

import androidx.test.core.app.ApplicationProvider
import java.io.Serializable
import kotlinx.coroutines.runBlocking
import okhttp3.HttpUrl.Companion.toHttpUrl
import okhttp3.Request
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotEquals
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

/** Swift ReviewRegressionTests: the account and HTTP cases (audio and relay cases belong to the call lane). */
class ReviewRegressionTests : SafeVoiceTestCase() {
  @Test fun exactWorkerStatusFixturesAndUnlimitedStatus() = runBlocking {
    val shapes = statusShapes()
    for (name in listOf("signedOut", "allowance", "unlimited", "openSession", "budgetClosed", "budgetClosedFutureW8")) {
      val status = VoiceStatus.decode(shapes.getValue(name))
      if (name == "unlimited") { assertNull(status.totalSeconds); assertEquals(true, status.unlimited) }
      if (name == "signedOut") assertNull(status.unlimited)
      if (name == "openSession") assertNotNull(status.activeSession)
      if (name == "budgetClosedFutureW8") assertEquals(VoiceFailure.budgetClosed, status.refusal)
    }
    Rig.make().use { rig ->
      rig.server.configure(status = shapes.getValue("unlimited"))
      val status = rig.core.refreshStatus()
      assertNull(status.totalSeconds); assertEquals(true, status.unlimited)
      assertEquals(CallState.ready, rig.core.snapshot().state)
    }
  }

  @Test fun unknownSessionStateAndNullableFieldsStillRefuseAndBridgeHasNoId() = runBlocking {
    val body = parse(signedStatus(active = "future-open")).toMutableMap()
    body["active_session"] = (body["active_session"] as Map<*, *>).toMutableMap().apply { put("expires_at", null) }
    body["total_seconds"] = null; body["unlimited"] = null; body["budget_open"] = null
    val status = VoiceStatus.decode(json(body))
    assertEquals(ActiveSession.State.unknown("future-open"), status.activeSession?.state)
    assertEquals(VoiceFailure.callOpen, status.refusal)
    val projected = jsonObject(VoiceBridgeValue.status(status.bridgeValue)).toString()
    assertFalse(projected.contains(fixtureID)); assertFalse(projected.contains("\"id\""))
    Rig.make().use { rig ->
      rig.server.configure(status = json(body))
      rig.core.refreshStatus()
      assertEquals(CallState.unavailable, rig.core.snapshot().state)
      eventually { rig.recorder.hasError(VoiceFailure.callOpen) }
      assertEquals(0, rig.server.count(AuthRoute.voiceStart))
    }
  }

  @Test fun disabledPrecedesSignedOut() {
    val disabled = VoiceStatus.decode(signedStatus(signedIn = false, enabled = false))
    assertEquals(VoiceFailure.disabled, disabled.refusal)
  }

  @Test fun signedOutStatusSentBeforeSignInCannotClearNewCredential() = runBlocking {
    Rig.make().use { rig ->
      rig.store.clear(); rig.server.pauseNextStatus()
      var stale: Result<VoiceStatus>? = null
      val thread = Thread { stale = runCatching { runBlocking { rig.client.status() } } }.apply { start() }
      eventually { rig.server.statusWaiting }
      rig.client.consumeCode("fixture", "12345678")
      val fresh = rig.store.read(); assertNotNull(fresh)
      rig.server.resumeStatus(); thread.join(5000)
      assertFalse(stale!!.getOrThrow().signedIn)
      assertEquals(0, rig.server.count(AuthRoute.communityStatus))
      assertEquals(fresh, rig.store.read())
    }
  }

  @Test fun stale401NullMemberAndLogoutFailureCannotClearNewSignIn() = runBlocking {
    for (route in listOf(AuthRoute.voiceStatus, AuthRoute.communityStatus, AuthRoute.logout)) {
      Rig.make().use { rig ->
        val response = if (route == AuthRoute.communityStatus) {
          HttpResponse(200, body = json(mapOf("enabled" to true, "member" to null)))
        } else {
          HttpResponse(if (route == AuthRoute.logout) 503 else 401, body = json(mapOf("error" to "Synthetic")))
        }
        rig.server.setResponse(route, response); rig.server.pauseResponse(route)
        val stale = Thread {
          runCatching {
            runBlocking {
              when (route) {
                AuthRoute.voiceStatus -> rig.client.status()
                AuthRoute.communityStatus -> rig.client.communityStatus()
                else -> rig.client.logout()
              }
            }
          }
        }.apply { start() }
        eventually { rig.server.responseWaiting }
        rig.client.consumeCode("fixture", "12345678")
        val fresh = rig.store.read(); rig.server.resumeResponse(); stale.join(5000)
        assertEquals(route.name, fresh, rig.store.read())
      }
    }
  }

  @Test fun credentialIsNotSerializableOrPrintableAndOriginSeparatesKeystoreItems() = runBlocking {
    val credential = SessionCredential(fixtureToken, distantFuture)
    val opaque: Any = credential
    assertFalse(opaque is Serializable); assertFalse(opaque is android.os.Parcelable)
    assertFalse(credential.toString().contains(fixtureToken))
    assertEquals(credential, SessionCredential.fromStorage(credential.storageData()))
    val context = ApplicationProvider.getApplicationContext<android.content.Context>()
    val keys = SoftwareKeys()
    val production = KeystoreCredentialStore(context, RoutePolicy(), keys).service
    val first = KeystoreCredentialStore(context, RoutePolicy.loopback(8901), keys).service
    val second = KeystoreCredentialStore(context, RoutePolicy.loopback(8902), keys).service
    assertNotEquals(production, first); assertNotEquals(first, second)
    // Mismatched store/policy is rejected before any real Keystore read.
    FixtureServer().use { fixture ->
      val policy = RoutePolicy.loopback(fixture.port)
      val mismatched = VoiceHttpClient(policy, KeystoreCredentialStore(context, RoutePolicy(), keys), OkHttpTransport(policy))
      assertEquals(VoiceFailure.forbidden, assertThrows<VoiceException> { runBlocking { mismatched.status() } }.failure)
      assertTrue(fixture.requests.isEmpty())
      assertEquals(0, keys.reads)
    }
  }

  /** HTTP level: Start accepts the server's deadline whatever the device clock says. */
  @Test fun fastClockDoesNotRejectServerReservation() = runBlocking {
    val fast = object : VoiceClock {
      override fun now() = System.currentTimeMillis() / 1000.0 + 86400
      override suspend fun sleep(seconds: Double) = SystemVoiceClock.sleep(seconds)
    }
    Rig.make(clock = fast).use { rig ->
      rig.store.write(SessionCredential(fixtureToken, distantFuture))
      val reservation = VoiceHttpClient(rig.policy, rig.store, OkHttpTransport(rig.policy), fast).start()
      assertEquals(600L, reservation.remainingSeconds)
      assertEquals(0, rig.server.count(AuthRoute.voiceFinish))
    }
  }

  /** HTTP level: every recoverable ID is finished exactly once and nothing connects. */
  @Test fun invalidStartResponseFinishesEveryValidRecoveredSessionId() = runBlocking {
    for (invalid in listOf("missing", "url", "remaining", "expiry", "oversized")) {
      Rig.make().use { rig ->
        val body = mutableMapOf<String, Any?>("session_id" to fixtureID, "transport" to "websocket", "remaining_seconds" to 600,
          "expires_at" to 0, "signed_url" to "ws://127.0.0.1:${rig.server.port}/api/voice/connect?session_id=$fixtureID")
        when (invalid) {
          "missing" -> body.remove("transport")
          "url" -> body["signed_url"] = "wss://opax.com.au/api/voice/connect?session_id=$fixtureID"
          "remaining" -> body["remaining_seconds"] = 0
          "expiry" -> body["expires_at"] = null
          "oversized" -> body["padding"] = "x".repeat(2 * 1024 * 1024)
        }
        rig.server.configure(start = HttpResponse(201, body = json(body)))
        val error = assertThrows<VoiceException> { runBlocking { rig.client.start() } }
        assertEquals(invalid, VoiceFailure.invalidResponse, error.failure)
        assertEquals(invalid, 1, rig.server.count(AuthRoute.voiceFinish))
        assertEquals(fixtureID, rig.server.requests.last { it.route == AuthRoute.voiceFinish }.json()["session_id"])
      }
    }
  }

  /** HTTP level: a 403 is classified by a fresh status, never by its wording, and keeps the credential. */
  @Test fun start403UsesFreshStatusRegardlessOfWordingAndRetainsCredential() = runBlocking {
    for (text in listOf("Reworded allowance", "Origin-looking prose", "")) {
      Rig.make().use { rig ->
        rig.server.configure(start = HttpResponse(403, body = json(mapOf("error" to text))), statusAfterStart = signedStatus(remaining = 0))
        val error = assertThrows<APIFailure> { runBlocking { rig.client.start() } }
        assertEquals(VoiceFailure.allowanceExhausted, error.failure); assertEquals(403, error.status)
        assertNotNull(rig.store.read())
      }
    }
  }

  @Test fun refreshAndLogoutExposeOnlyCoreFailures() = runBlocking {
    Rig.make().use { rig ->
      rig.server.setResponse(AuthRoute.voiceStatus, HttpResponse(200, body = "bad JSON".toByteArray()))
      assertEquals(VoiceFailure.invalidResponse, assertThrows<VoiceException> { runBlocking { rig.core.refreshStatus() } }.failure)
      rig.server.failTransport()
      assertEquals(VoiceFailure.network, assertThrows<VoiceException> { runBlocking { rig.core.refreshStatus() } }.failure)
      assertEquals(VoiceFailure.network, assertThrows<VoiceException> { runBlocking { rig.core.logout() } }.failure)
    }
  }

  @Test fun pollingUsesExpiryBackoffAndAttemptCap() = runBlocking {
    class StepClock : VoiceClock {
      var time = System.currentTimeMillis() / 1000.0
      val delays = mutableListOf<Double>()
      @Synchronized override fun now() = time
      override suspend fun sleep(seconds: Double) {
        synchronized(this) { delays += seconds; time += seconds }
        kotlinx.coroutines.yield()
      }
    }
    for (expired in listOf(false, true)) {
      val clock = StepClock()
      Rig.make(clock = clock, timing = CallTiming(pollMaxInterval = 30.0, pollMaxAttempts = 4)).use { rig ->
        rig.store.write(SessionCredential(fixtureToken, distantFuture))
        val body = parse(signedStatus(active = "reserved")).toMutableMap()
        body["active_session"] = (body["active_session"] as Map<*, *>).toMutableMap()
          .apply { put("expires_at", clock.now() + if (expired) -100 else 20) }
        rig.server.configure(status = json(body)); rig.core.refreshStatus()
        eventually { rig.server.count(AuthRoute.voiceStatus) == 5 }
        val delays = synchronized(clock) { clock.delays.toList() }
        assertEquals(4, delays.size)
        if (expired) assertEquals(listOf(2.0, 4.0, 8.0, 16.0), delays) else assertEquals(20.5, delays[0], 0.01)
        Thread.sleep(30); assertEquals(5, rig.server.count(AuthRoute.voiceStatus))
      }
    }
  }

  /** The HTTP half; the relay factory half belongs to the call lane. */
  @Test fun coreTransportGuardProtectsRealSessions() = runBlocking {
    VoiceTestGuard.isolated { monitor ->
      val session = OkHttpTransport()
      val request = Request.Builder().url("https://opax.com.au/api/voice/status").build()
      assertEquals(VoiceFailure.forbidden, assertThrows<VoiceException> { runBlocking { session.send(request) } }.failure)
      assertEquals(setOf("opax.com.au"), monitor.audit().hosts)
      assertFalse(monitor.audit().isClean)
    }
  }
}

/** Swift CallTests: the status, refusal and teardown cases that need no live call. */
class CallStatusTests : SafeVoiceTestCase() {
  @Test fun idleThenReadyAfterStatusRead() = runBlocking {
    Rig.make().use { rig ->
      assertEquals(CallState.idle, rig.core.snapshot().state)
      rig.core.refreshStatus()
      assertEquals(CallState.ready, rig.core.snapshot().state)
      eventually { rig.recorder.items.filterIsInstance<VoiceEvent.State>().map { it.state } == listOf(CallState.checking, CallState.ready) }
      assertEquals(0, rig.server.count(AuthRoute.voiceStart))
    }
  }

  @Test fun failedFreshStatusDoesNotExposeCachedAllowance() = runBlocking {
    Rig.make().use { rig ->
      rig.core.refreshStatus()
      rig.server.setResponse(AuthRoute.voiceStatus, HttpResponse(503, body = json(mapOf("error" to "Synthetic failure"))))
      assertThrows<VoiceException> { runBlocking { rig.core.refreshStatus() } }
      val snapshot = rig.core.snapshot()
      assertNull(snapshot.status); assertEquals(CallState.failed, snapshot.state)
    }
  }

  /** Adapted: End from ready runs the call teardown; logout waits for it before revoking. */
  @Test fun logoutWaitsForExistingTeardownBeforeRevokingSession() = runBlocking {
    Rig.make().use { rig ->
      rig.core.refreshStatus()
      rig.server.pauseNextStatus()
      val ending = Thread { runBlocking { rig.core.end() } }.apply { start() }
      eventually { rig.server.count(AuthRoute.voiceStatus) == 2 }
      var logout: Result<Unit>? = null
      val signingOut = Thread { logout = runCatching { runBlocking { rig.core.logout() } } }.apply { start() }
      Thread.sleep(30)
      assertEquals(0, rig.server.count(AuthRoute.logout))
      rig.server.resumeStatus(); ending.join(5000); signingOut.join(5000)
      logout!!.getOrThrow()
      assertEquals(1, rig.server.count(AuthRoute.logout))
      assertNull(rig.store.read())
      val snapshot = rig.core.snapshot()
      assertEquals(CallState.unavailable, snapshot.state); assertEquals(false, snapshot.status?.signedIn)
    }
  }

  @Test fun refusalsArePublishedWithUnavailableState() = runBlocking {
    for ((body, failure) in listOf(signedStatus(signedIn = false) to VoiceFailure.signedOut,
      signedStatus(signedIn = false, enabled = false) to VoiceFailure.disabled, signedStatus(remaining = 0) to VoiceFailure.allowanceExhausted,
      signedStatus(active = "active") to VoiceFailure.callOpen, signedStatus(budget = false) to VoiceFailure.budgetClosed)) {
      Rig.make().use { rig ->
        rig.server.configure(status = body)
        rig.server.setResponse(AuthRoute.communityStatus, HttpResponse(200, body = json(mapOf("enabled" to true, "member" to mapOf("id" to "fixture")))))
        rig.core.refreshStatus()
        assertEquals(CallState.unavailable, rig.core.snapshot().state)
        eventually { rig.recorder.hasError(failure) }
      }
    }
  }
}

/** Swift ProductionVoiceTests: consent and configuration (the live withdrawal case is adapted in BridgeTests). */
class ProductionVoiceTests : SafeVoiceTestCase() {
  @Test fun buildPolicyMatchesEvaluatedNativeRouteMethodsAndPaths() {
    val policy = org.json.JSONObject(java.io.File("../../../voice-production-policy.json").readText())
    val routes = policy.getJSONArray("routes").let { list -> (0 until list.length()).map(list::getString) }
    assertEquals(AuthRoute.entries.map { it.method + " " + it.path }.sorted(), routes.sorted())
  }

  @Test fun freshConsentIsDeniedUntilExplicitGrantAndWithdrawalPersists() = runBlocking {
    val context = ApplicationProvider.getApplicationContext<android.content.Context>()
    val suite = "opax-consent-test-" + java.util.UUID.randomUUID()
    val consent = StoredVoiceConsent(context, suite)
    assertFalse(consent.isGranted())
    consent.setGranted(true)
    val reloaded = StoredVoiceConsent(context, suite)
    assertTrue(reloaded.isGranted())
    reloaded.setGranted(false)
    assertFalse(consent.isGranted())
    context.getSharedPreferences(suite, android.content.Context.MODE_PRIVATE).edit().putString(StoredVoiceConsent.KEY, "true").commit()
    assertFalse(consent.isGranted())
  }

  @Test fun productionConfigurationRequiresExactRoutesAndDeniedDefault() {
    val routes = AuthRoute.entries.map { it.method + " " + it.path }
    val valid = mapOf("OPAXProductionVoiceEnabled" to true, "OPAXVoiceConsentDefault" to false, "OPAXVoiceAllowedRoutes" to routes)
    assertTrue(RoutePolicy.productionConfigurationMatches(valid))
    assertFalse(RoutePolicy.productionConfigurationMatches(emptyMap()))
    for (key in valid.keys) assertFalse(RoutePolicy.productionConfigurationMatches(valid - key))
    for (bad in listOf(routes + "POST /api/ask", routes.dropLast(1), routes + routes[0], routes.map { it.replace("POST", "GET") })) {
      assertFalse(RoutePolicy.productionConfigurationMatches(valid + ("OPAXVoiceAllowedRoutes" to bad)))
    }
    assertFalse(RoutePolicy.productionConfigurationMatches(valid + ("OPAXVoiceConsentDefault" to true)))
    assertFalse(RoutePolicy.productionConfigurationMatches(valid + ("OPAXVoiceAllowedRoutes" to routes.map { 1 })))
  }

  /**
   * Not in Swift (Info.plist): the production switch embeds voice-production-policy.json
   * and it matches AuthRoute; any other build embeds nothing that could match.
   */
  @Test fun embeddedProductionConfigurationMatchesOnlyWithTheSwitch() {
    val embedded = VoiceController.embeddedProductionConfiguration()
    assertEquals(BuildConfig.OPAX_VOICE_PRODUCTION, embedded["OPAXProductionVoiceEnabled"])
    assertEquals(BuildConfig.OPAX_VOICE_PRODUCTION, RoutePolicy.productionConfigurationMatches(embedded))
  }

  /**
   * Review P2-6, as iOS's `targetEnvironment(simulator)`: the e2e loopback works
   * on the emulator only. On a phone 10.0.2.2 is a local-network address, so
   * neither the synthetic sign-in nor its session may reach it.
   */
  @Test fun e2eLoopbackIsEmulatorOnly() = runBlocking {
    assertTrue(Emulator.running("ranchu")); assertTrue(Emulator.running("goldfish"))
    for (board in listOf("qcom", "tensor", "exynos990", "mt6789", "robolectric", "")) {
      assertFalse(board, Emulator.running(board))
    }
    assertFalse(Emulator.running()) // Robolectric reports its own board
    val policy = RoutePolicy.loopback(8953, VoiceVariant.E2E_HOST)
    val fixture = "http://10.0.2.2:8953/api/voice/status".toHttpUrl()
    VoiceVariant.e2eGuard(policy, emulator = true).validate(fixture)
    assertEquals(VoiceFailure.forbidden, assertThrows<VoiceException> {
      VoiceVariant.e2eGuard(policy, emulator = true).validate("https://opax.com.au/api/voice/status".toHttpUrl())
    }.failure)
    val phone = VoiceVariant.e2eGuard(policy, emulator = false)
    assertEquals(VoiceFailure.forbidden, assertThrows<VoiceException> { phone.validate(fixture) }.failure)
    // The real client under the phone's guard: nothing is sent and nothing stored.
    val sent = mutableListOf<Request>()
    val store = InMemoryCredentialStore()
    val client = VoiceHttpClient(policy, store, HttpTransport { request: Request ->
      TransportGuard.check(request.url)
      synchronized(sent) { sent += request }
      HttpResponse(200, body = json(mapOf("sent" to true, "challenge_id" to "fixture-challenge")))
    })
    val previous = TransportGuard.installed
    TransportGuard.installed = phone // stricter than the suite's guard: it refuses every host
    try {
      for (call in listOf<suspend () -> Unit>(
        { client.requestCode("synthetic@example.invalid") },
        { client.consumeCode("fixture-challenge", "12345678") },
        { client.status() },
      )) {
        assertEquals(VoiceFailure.forbidden, assertThrows<VoiceException> { runBlocking { call() } }.failure)
      }
    } finally {
      TransportGuard.installed = previous
    }
    assertTrue(sent.isEmpty()); assertNull(store.read())
  }
}
