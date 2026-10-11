package au.com.opax.voice

import kotlinx.coroutines.runBlocking
import okhttp3.CookieJar
import okhttp3.HttpUrl.Companion.toHttpUrl
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

/** Swift HTTPTests, one test per XCTest case. */
class HttpTests : SafeVoiceTestCase() {
  private fun request(url: String, method: String) =
    Request.Builder().url(url).method(method, if (method == "POST") ByteArray(0).toRequestBody() else null).build()

  @Test fun exactHeadersOnEachAllowedPathAndMethod() {
    val credential = SessionCredential(fixtureToken, distantFuture)
    val policy = RoutePolicy()
    for (route in AuthRoute.entries) {
      val websocket = route == AuthRoute.voiceConnect
      val original = request("https://opax.com.au${route.path}", route.method)
      val output = policy.decorate(original, credential, websocket)
      assertEquals(listOf("__Host-opax_session=$fixtureToken"), output.headers("Cookie"))
      assertEquals("https://opax.com.au", output.header("Origin"))
      assertEquals(if (websocket) "convai" else null, output.header("Sec-WebSocket-Protocol"))
      val wrong = request("https://opax.com.au${route.path}", if (route.method == "GET") "POST" else "GET")
      assertNull(policy.decorate(wrong, credential, websocket).header("Cookie"))
    }
  }

  @Test fun noCredentialOrOriginAnywhereElse() {
    val policy = RoutePolicy()
    val credential = SessionCredential(fixtureToken, distantFuture)
    val urls = listOf("https://example.org/api/voice/status", "https://opax.com.au:8443/api/voice/status", "http://opax.com.au/api/voice/status",
      "https://opax.com.au/api/community/auth/consume", "https://opax.com.au/api/community/auth/new",
      "https://opax.com.au/api/community/account/delete", "https://opax.com.au/api/voice/tools/search",
      "https://opax.com.au/api/search-all", "https://opax.com.au/api/voice/status/", "https://opax.com.au/api/%76oice/status",
      "https://user@opax.com.au/api/voice/status", "https://opax.com.au/api/voice/status#fragment")
    for (url in urls) {
      val original = Request.Builder().url(url).header("Cookie", "should-strip").header("Origin", "should-strip").build()
      val output = policy.decorate(original, credential)
      assertNull(url, output.header("Cookie")); assertNull(url, output.header("Origin"))
    }
  }

  @Test fun signedOutHasOriginWithoutCookie() {
    val output = RoutePolicy().decorate(request("https://opax.com.au/api/voice/status", "GET"), null)
    assertNull(output.header("Cookie")); assertEquals("https://opax.com.au", output.header("Origin"))
  }

  @Test fun sessionHasNoCookieStoreOrCache() {
    val client = OkHttpTransport.configuration()
    assertTrue(client.cookieJar === CookieJar.NO_COOKIES); assertNull(client.cache)
    assertFalse(client.retryOnConnectionFailure)
  }

  @Test fun redirectsAreRefused() = runBlocking {
    // A real 302 to a second loopback server is returned as-is and never followed.
    val destination = FixtureServer()
    val redirect = FixtureServer().apply {
      handler = { HttpResponse(302, mapOf("Location" to "http://127.0.0.1:${destination.port}/stolen"), ByteArray(0)) }
    }
    val client = OkHttpTransport.configuration()
    assertFalse(client.followRedirects); assertFalse(client.followSslRedirects)
    val policy = RoutePolicy.loopback(redirect.port)
    val response = OkHttpTransport(policy).send(request("http://127.0.0.1:${redirect.port}/api/voice/status", "GET"))
    assertEquals(302, response.status); assertEquals(0, destination.accepted)
    redirect.close(); destination.close()
  }

  @Test fun secureCookieValidationAndExpiry() {
    val good = "__Host-opax_session=$fixtureToken; Secure; HttpOnly; Path=/; Max-Age=2592000"
    val now = 1.0
    assertEquals(now + 2592000, SessionCookie.parse(good, now).expiresAt, 0.0)
    for (bad in listOf(good.replace("Secure; ", ""), "$good; Domain=opax.com.au", good.replace("Path=/", "Path=/api"),
      good.replace("2592000", "0"), good.replace(fixtureToken, "bad\r\nheader"))) {
      assertThrows<VoiceException> { SessionCookie.parse(bad, now) }
    }
  }

  @Test fun codeBodyAndKeystoreLifecycle() = runBlocking {
    Rig.make().use { rig ->
      rig.store.clear()
      val challenge = rig.client.requestCode("synthetic@example.invalid")
      assertTrue(challenge.sent)
      rig.client.consumeCode(challenge.challengeId, "12345678")
      assertNotNull(rig.store.read())
      val requests = rig.server.requests
      assertEquals("ios", requests[0].json()["client"])
      assertEquals(mapOf("challenge_id" to "fixture-challenge", "code" to "12345678"), requests[1].json())
      rig.client.logout(); assertNull(rig.store.read())
    }
  }

  @Test fun unauthorizedAndBothSignedOutStatusShapesClearCredential() = runBlocking {
    for (signal in 0 until 3) {
      Rig.make().use { rig ->
        when (signal) {
          0 -> {
            rig.server.setResponse(AuthRoute.voiceStart, HttpResponse(401, body = json(mapOf("error" to "Synthetic revoked"))))
            val error = assertThrows<APIFailure> { runBlocking { rig.client.start() } }
            assertEquals(VoiceFailure.signedOut, error.failure)
          }
          1 -> {
            rig.server.configure(status = signedStatus(signedIn = false))
            rig.server.setResponse(AuthRoute.communityStatus, HttpResponse(200, body = json(mapOf("enabled" to true, "member" to null))))
            rig.client.status()
          }
          else -> {
            rig.server.setResponse(AuthRoute.communityStatus, HttpResponse(200, body = json(mapOf("enabled" to true, "member" to null))))
            rig.client.communityStatus()
          }
        }
        assertNull(rig.store.read())
      }
    }
  }

  @Test fun logoutClearsLocallyEvenWhenTransportFails() = runBlocking {
    Rig.make().use { rig ->
      rig.server.setResponse(AuthRoute.logout, HttpResponse(503, body = json(mapOf("error" to "Synthetic failure"))))
      assertThrows<APIFailure> { runBlocking { rig.client.logout() } }
      assertNull(rig.store.read())
    }
  }

  @Test fun signedOutCodeResponseClearsAnExistingCredential() = runBlocking {
    Rig.make().use { rig ->
      rig.server.setResponse(AuthRoute.consumeCode, HttpResponse(200, body = json(mapOf("signed_in" to false))))
      val error = assertThrows<VoiceException> { runBlocking { rig.client.consumeCode("fixture", "12345678") } }
      assertEquals(VoiceFailure.signedOut, error.failure)
      assertNull(rig.store.read())
    }
  }

  @Test fun revokedCredentialCannotReattachIfKeystoreClearFails() = runBlocking {
    class FailedClearStore(var value: SessionCredential?) : CredentialStore {
      @Synchronized override fun read() = value
      @Synchronized override fun write(credential: SessionCredential) { value = credential }
      override fun clear() = throw VoiceException(VoiceFailure.unavailable)
      @Synchronized override fun clearIfMatching(credential: SessionCredential): Boolean {
        if (value != credential) return false
        throw VoiceException(VoiceFailure.unavailable)
      }
    }
    val store = FailedClearStore(SessionCredential(fixtureToken, distantFuture))
    FixtureServer().use { fixture ->
      val policy = RoutePolicy.loopback(fixture.port)
      val client = VoiceHttpClient(policy, store, OkHttpTransport(policy))
      fixture.setResponse(AuthRoute.voiceStart, HttpResponse(401, body = json(mapOf("error" to "Revoked"))))
      assertThrows<Exception> { runBlocking { client.start() } }
      assertFalse(client.status().signedIn)
      val requests = fixture.requests
      assertNotNull(requests[0].header("Cookie")); assertNull(requests[1].header("Cookie"))

      // A stale old response must not replace the newer credential's block.
      val old = SessionCredential("a".repeat(43), distantFuture)
      val newer = SessionCredential("b".repeat(43), distantFuture)
      store.write(old)
      fixture.setResponse(AuthRoute.communityStatus, HttpResponse(200, body = json(mapOf("enabled" to true, "member" to null))))
      fixture.pauseResponse(AuthRoute.communityStatus)
      val stale = Thread { runCatching { runBlocking { client.communityStatus() } } }.apply { start() }
      eventually { fixture.responseWaiting }
      store.write(newer)
      assertThrows<Exception> { runBlocking { client.start() } }
      fixture.resumeResponse(); stale.join(5000)
      client.status()
      assertNull(fixture.requests.last().header("Cookie"))
    }
  }

  @Test fun storedCredentialDecodeAlsoValidatesTokenAndDebugRedaction() {
    val encoded = SessionCredential(fixtureToken, distantFuture).storageData()
    val bad = String(encoded).replace(fixtureToken, "bad")
    assertThrows<VoiceException> { SessionCredential.fromStorage(bad.toByteArray()) }
    assertThrows<VoiceException> { SessionCredential(fixtureToken + "\n", distantFuture) }
    assertFalse(SessionCredential(fixtureToken, distantFuture).toString().contains(fixtureToken))
  }

  @Test fun expiredCredentialNeverAttaches() = runBlocking {
    Rig.make().use { rig ->
      rig.store.write(SessionCredential(fixtureToken, distantPast))
      rig.client.status()
      assertNull(rig.server.requests.last().header("Cookie"))
      assertNull(rig.store.read())
    }
  }

  @Test fun everyHttpErrorShapeIncludingFutureReasonAndChargeHints() {
    val cases = listOf(
      Triple(401, mapOf("error" to "Signed out"), VoiceFailure.signedOut to ChargeDisposition.unknown),
      Triple(409, mapOf("error" to "Call open"), VoiceFailure.callOpen to ChargeDisposition.unknown),
      Triple(403, mapOf("error" to "Any wording"), VoiceFailure.forbidden to ChargeDisposition.unknown),
      Triple(403, mapOf("error" to "Origin refused"), VoiceFailure.forbidden to ChargeDisposition.unknown),
      Triple(429, mapOf("error" to "Busy"), VoiceFailure.rateLimited to ChargeDisposition.unknown),
      Triple(429, mapOf("error" to "Busy", "reason" to "capacity"), VoiceFailure.capacity to ChargeDisposition.unknown),
      Triple(429, mapOf("error" to "Busy", "reason" to "budget"), VoiceFailure.budgetClosed to ChargeDisposition.unknown),
      Triple(429, mapOf("error" to "Busy", "reason" to "future"), VoiceFailure.rateLimited to ChargeDisposition.unknown),
      Triple(503, mapOf("error" to "Failed", "released" to true), VoiceFailure.unavailable to ChargeDisposition.released),
      Triple(503, mapOf("error" to "Failed", "released" to false), VoiceFailure.unavailable to ChargeDisposition.retained),
      Triple(503, mapOf("error" to "Failed"), VoiceFailure.unavailable to ChargeDisposition.unknown),
      Triple(400, mapOf("error" to "Invalid"), VoiceFailure.invalidResponse to ChargeDisposition.unknown),
      Triple(413, emptyMap(), VoiceFailure.invalidResponse to ChargeDisposition.unknown),
      Triple(415, emptyMap(), VoiceFailure.invalidResponse to ChargeDisposition.unknown),
      Triple(426, emptyMap(), VoiceFailure.invalidResponse to ChargeDisposition.unknown),
      Triple(302, emptyMap<String, Any?>(), VoiceFailure.invalidResponse to ChargeDisposition.unknown),
    )
    for ((status, body, expected) in cases) {
      val result = APIFailure.decode(HttpResponse(status, body = json(body)), AuthRoute.voiceStart)
      assertEquals("$status $body", expected.first, result.failure); assertEquals(expected.second, result.charge)
    }
  }

  @Test fun logsRedactCredentialSignedUrlAndServerContent() {
    val credential = SessionCredential(fixtureToken, distantFuture)
    assertFalse(credential.toString().contains(fixtureToken)); assertFalse("$credential".contains(fixtureToken))
    val error = APIFailure.decode(HttpResponse(503, body = json(mapOf("error" to fixtureToken))), AuthRoute.voiceStart)
    assertFalse(error.toString().contains(fixtureToken)); assertFalse(error.message.contains(fixtureToken))
    val reservation = Reservation.decode(json(mapOf("session_id" to fixtureID, "transport" to "websocket",
      "remaining_seconds" to 600, "expires_at" to 0, "signed_url" to "ws://127.0.0.1:8901/api/voice/connect?session_id=$fixtureID")))
    assertFalse(reservation.toString().contains(fixtureID))
    val prepared = RoutePolicy.loopback(8901).let { policy ->
      VoiceHttpClient(policy, InMemoryCredentialStore().apply { write(credential) }, { error("unused") }).relayRequest(reservation)
    }
    assertFalse(prepared.toString().contains(fixtureToken)); assertFalse(prepared.toString().contains(fixtureID))
  }

  @Test fun loopbackGuardRejectsAnyOtherHostBeforeNetwork() {
    VoiceTestGuard.isolated { monitor ->
      for (url in listOf("https://opax.com.au/api/voice/status", "https://api.elevenlabs.io", "http://localhost:8901",
        "http://127.0.0.2:8901", "http://127.0.0.1.example.org")) {
        assertThrows<VoiceException> { TransportGuard.check(url.toHttpUrl()) }
      }
      TransportGuard.check(RoutePolicy.webSocketUrl("ws://127.0.0.1:8901")!!)
      val audit = monitor.audit()
      assertEquals(setOf("opax.com.au", "api.elevenlabs.io", "localhost", "127.0.0.2", "127.0.0.1.example.org", "127.0.0.1"), audit.hosts)
      assertFalse(audit.isClean)
    }
  }
}
