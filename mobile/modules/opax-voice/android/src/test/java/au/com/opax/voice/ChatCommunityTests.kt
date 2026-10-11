package au.com.opax.voice

import java.util.concurrent.atomic.AtomicInteger
import kotlinx.coroutines.runBlocking
import okhttp3.HttpUrl.Companion.toHttpUrl
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

/** Swift ChatTests and CommunityTests, one test per XCTest case. */
class ChatCommunityTests : SafeVoiceTestCase() {
  @Test fun chatPolicyAdmitsOnlyExactOwnerDataRoutesAndMethods() {
    val p = RoutePolicy.loopback(8940)
    for (method in listOf("GET", "PUT", "DELETE")) {
      assertTrue(p.permitsChat("http://127.0.0.1:8940/api/community/chats/fixture-chat-001".toHttpUrl(), method))
    }
    assertTrue(p.permitsChat("http://127.0.0.1:8940/api/community/chats".toHttpUrl(), "GET"))
    for (path in listOf("/api/community/chats/short", "/api/community/chats/fixture-chat-001?x=1", "/api/community/chats/fixture-chat-001#token",
      "/api/community/chats/", "/api/ask", "/api/community/account/delete")) {
      assertFalse(path, p.permitsChat("http://127.0.0.1:8940$path".toHttpUrl(), "GET"))
    }
    assertFalse(p.permitsChat("https://opax.com.au/api/community/chats".toHttpUrl(), "GET"))
    assertFalse(p.permitsChat("http://127.0.0.1:8940/api/community/chats".toHttpUrl(), "DELETE"))
    assertFalse(p.permitsChat("http://127.0.0.1:8940/api/community/chats/fixture-chat-001".toHttpUrl(), "POST"))
  }

  @Test fun chatRequestKeepsCredentialNativeAndHasNoLaunchRead() = runBlocking {
    FixtureServer().use { transport ->
      transport.handler = { HttpResponse(200, body = "{\"chats\":[]}".toByteArray()) }
      val store = InMemoryCredentialStore().apply { write(SessionCredential(fixtureToken, distantFuture)) }
      val policy = RoutePolicy.loopback(transport.port)
      val client = VoiceHttpClient(policy, store, OkHttpTransport(policy))
      assertTrue(transport.requests.isEmpty())
      assertEquals("{\"chats\":[]}", client.chatRequest("/api/community/chats", "GET", null))
      val requests = transport.requests
      assertEquals(1, requests.size)
      assertEquals(listOf("__Host-opax_session=$fixtureToken"), requests[0].headers("Cookie"))
      assertEquals("https://opax.com.au", requests[0].header("Origin"))
      val error = assertThrows<VoiceException> { runBlocking { client.chatRequest("/api/ask", "PUT", "{}") } }
      assertEquals(VoiceFailure.forbidden, error.failure)
      assertEquals(1, transport.requests.size)
    }
  }

  @Test fun onlyExactMethodsAndParametersCarryCredentials() {
    val p = RoutePolicy.loopback(8953)
    for ((path, method) in listOf("threads?feed=all&q=source&page=0" to "GET", "threads/fixture-a" to "POST", "members/fixture-a/report" to "POST",
      "conversations/fixture-a?before=4" to "GET", "preferences" to "PATCH", "lists/fixture-a/items" to "POST", "items/fixture-a" to "DELETE")) {
      assertTrue(path, p.permitsCommunity("http://127.0.0.1:8953/api/community/$path".toHttpUrl(), method))
    }
    for (path in listOf("keys", "reports", "threads?feed=other", "threads?token=secret", "threads?feed=all&feed=saved", "threads/%61",
      "conversations/x?before=NaN", "members?following=1", "preferences?x=1")) {
      assertFalse(path, p.permitsCommunity("http://127.0.0.1:8953/api/community/$path".toHttpUrl(), "GET"))
    }
    assertFalse(p.permitsCommunity("https://opax.com.au/api/community/threads".toHttpUrl(), "GET"))
  }

  @Test fun publicReadAndSignedInMutationEachMakeOneRequestNoLaunchRead() = runBlocking {
    FixtureServer().use { transport ->
      val status = AtomicInteger(200)
      transport.handler = { HttpResponse(status.get(), body = "{\"threads\":[]}".toByteArray()) }
      val store = InMemoryCredentialStore()
      val policy = RoutePolicy.loopback(transport.port)
      val client = VoiceHttpClient(policy, store, OkHttpTransport(policy))
      assertTrue(transport.requests.isEmpty())
      client.communityRequest("/api/community/threads?feed=all", "GET", null)
      val publicReads = transport.requests
      assertEquals(1, publicReads.size); assertNull(publicReads[0].header("Cookie"))
      val error = assertThrows<VoiceException> { runBlocking { client.communityRequest("/api/community/reports", "POST", "{}") } }
      assertEquals(VoiceFailure.signedOut, error.failure)
      store.write(SessionCredential(fixtureToken, distantFuture))
      client.communityRequest("/api/community/reports", "POST", "{\"target\":\"fixture\",\"reason\":\"Concern\"}")
      val all = transport.requests
      assertEquals(2, all.size); assertEquals(listOf("__Host-opax_session=$fixtureToken"), all[1].headers("Cookie"))
      assertEquals("application/json", all[1].header("Content-Type"))
      status.set(401)
      client.communityRequest("/api/community/lists", "GET", null)
      assertNull(store.read())
    }
  }

  /** Not in Swift: the grapheme cap, the query decoder and the PUT body OkHttp requires. */
  @Test fun queryCapCountsCharactersAndBodylessPutStaysBodyless() = runBlocking {
    val p = RoutePolicy.loopback(8953)
    val faces = "😀".repeat(120) // 120 characters, 240 UTF-16 units
    assertTrue(p.permitsCommunity("http://127.0.0.1:8953/api/community/threads?q=$faces".toHttpUrl(), "GET"))
    assertFalse(p.permitsCommunity("http://127.0.0.1:8953/api/community/threads?q=${faces}a".toHttpUrl(), "GET"))
    assertFalse(p.permitsCommunity("http://127.0.0.1:8953/api/community/threads?q".toHttpUrl(), "GET"))
    assertTrue(p.permitsCommunity("http://127.0.0.1:8953/api/community/threads?f%65ed=all".toHttpUrl(), "GET"))
    assertFalse(p.permitsCommunity("http://127.0.0.1:8953/api/community/threads?page=501".toHttpUrl(), "GET"))
    assertFalse(p.permitsCommunity("http://127.0.0.1:8953/api/community/notifications?before=9007199254740992".toHttpUrl(), "GET"))
    FixtureServer().use { transport ->
      transport.handler = { HttpResponse(200, body = "{}".toByteArray()) }
      val store = InMemoryCredentialStore().apply { write(SessionCredential(fixtureToken, distantFuture)) }
      val policy = RoutePolicy.loopback(transport.port)
      val client = VoiceHttpClient(policy, store, OkHttpTransport(policy))
      client.communityRequest("/api/community/threads/fixture-a/like", "PUT", null)
      val put = transport.requests.single()
      assertEquals("PUT", put.method); assertEquals(0, put.body.size); assertNull(put.header("Content-Type"))
      for (path in listOf("/api/community/threads\\x", "/api/community/threads#x", "/api/community/threads x", "/api/community/threads\u0085")) {
        assertEquals(VoiceFailure.forbidden, assertThrows<VoiceException> { runBlocking { client.communityRequest(path, "GET", null) } }.failure)
      }
      assertEquals(VoiceFailure.forbidden,
        assertThrows<VoiceException> { runBlocking { client.communityRequest("/api/community/threads", "POST", "x".repeat(16001)) } }.failure)
      assertEquals(1, transport.requests.size)
    }
  }
}

/** Swift RedirectTests: the HTTP half. The WebSocket upgrade half belongs to the call lane. */
class RedirectTests : SafeVoiceTestCase() {
  @Test fun realHttpRedirectsNeverReachSecondServer() = runBlocking {
    val destination = FixtureServer()
    val redirect = FixtureServer().apply {
      handler = { HttpResponse(302, mapOf("Location" to "http://127.0.0.1:${destination.port}/stolen"), ByteArray(0)) }
    }
    val policy = RoutePolicy.loopback(redirect.port)
    val store = InMemoryCredentialStore().apply { write(SessionCredential(fixtureToken, distantFuture)) }
    val client = VoiceHttpClient(policy, store, OkHttpTransport(policy))
    val error = assertThrows<APIFailure> { runBlocking { client.status() } }
    assertEquals(302, error.status); assertEquals(VoiceFailure.invalidResponse, error.failure)
    val error2 = assertThrows<VoiceException> { runBlocking { client.communityRequest("/api/community/status", "GET", null) } }
    assertEquals(VoiceFailure.invalidResponse, error2.failure)
    val receipts = redirect.requests
    assertEquals(2, receipts.size)
    assertTrue(receipts.all { it.header("Cookie") == "__Host-opax_session=$fixtureToken" && it.header("Origin") == "https://opax.com.au" })
    assertEquals(0, destination.accepted)
    redirect.close(); destination.close()
  }
}

/** Swift SnapshotTests: the cases that need no live call. */
class SnapshotTests : SafeVoiceTestCase() {
  @Test fun failedRefreshPublishesTheSameClearedStatusAsSnapshot() = runBlocking {
    Rig.make().use { rig ->
      rig.core.refreshStatus()
      rig.server.failTransport()
      assertThrows<VoiceException> { runBlocking { rig.core.refreshStatus() } }
      eventually { VoiceEvent.Status(null) in rig.recorder.items }
      assertNull(rig.core.snapshot().status)
    }
  }

  /** Adapted: End from ready runs the same teardown a call does. */
  @Test fun cleanupPublishesClearedStatusBeforeItsFreshRead() = runBlocking {
    Rig.make().use { rig ->
      rig.core.refreshStatus()
      rig.server.failTransport()
      rig.core.end()
      eventually { VoiceEvent.Status(null) in rig.recorder.items }
      val value = rig.core.snapshot()
      assertNull(value.status); assertEquals(CallState.ended, value.state); assertEquals(EndReason.user, value.reason)
      assertTrue(rig.recorder.hasError(VoiceFailure.network))
    }
  }

  /** Adapted: dismissing a finished screen makes no request; a refresh in flight keeps its evidence. */
  @Test fun dismissDiscardsEvidenceWithoutRequestsButNotWhileChecking() = runBlocking {
    Rig.make().use { rig ->
      rig.server.pauseNextStatus()
      val checking = Thread { runCatching { runBlocking { rig.core.refreshStatus() } } }.apply { start() }
      eventually { rig.server.statusWaiting }
      rig.core.discardEvidence()
      assertFalse(rig.recorder.items.any { it is VoiceEvent.Transcript })
      rig.server.resumeStatus(); checking.join(5000)
      rig.core.end()
      val requests = rig.server.count(AuthRoute.voiceStatus)
      rig.core.discardEvidence()
      val closed = rig.core.snapshot()
      assertEquals(emptyList<TranscriptTurn>(), closed.transcript); assertEquals(emptyList<VoiceSource>(), closed.sources)
      eventually { VoiceEvent.Transcript(emptyList()) in rig.recorder.items }
      assertEquals(requests, rig.server.count(AuthRoute.voiceStatus))
    }
  }

  @Test fun idleSnapshotDoesNotEmitOrMakeRequests() = runBlocking {
    Rig.make().use { rig ->
      val value = rig.core.snapshot()
      assertEquals(CallState.idle, value.state); assertNull(value.reason); assertNull(value.mode)
      assertEquals(PlaybackState.flowing, value.playback); assertEquals(0, value.remaining)
      assertEquals(emptyList<TranscriptTurn>(), value.transcript); assertEquals(emptyList<VoiceSource>(), value.sources)
      assertNull(value.status)
      assertEquals(0, rig.server.count(AuthRoute.voiceStatus))
      Thread.sleep(50); assertTrue(rig.recorder.items.isEmpty())
    }
  }
}
