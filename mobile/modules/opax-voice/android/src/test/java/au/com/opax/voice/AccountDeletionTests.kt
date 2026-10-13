package au.com.opax.voice

import kotlinx.coroutines.runBlocking
import okhttp3.Request
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

/** Swift AccountDeletionTests, one test per XCTest case, against the Worker fixtures. */
class AccountDeletionTests : SafeVoiceTestCase() {
  private val newer = "n".repeat(43)

  @Test fun workerSuccessBodiesHeadersAndMemoryKeystoreDeletion() = runBlocking {
    class MemoryKeystore : CredentialStore {
      var value: SessionCredential? = null
      var deletions = 0
      @Synchronized override fun read() = value
      @Synchronized override fun write(credential: SessionCredential) { value = credential }
      @Synchronized override fun clear() { value = null; deletions += 1 }
      @Synchronized override fun clearIfMatching(credential: SessionCredential): Boolean {
        if (value != credential) return false
        clear(); return true
      }
    }
    val store = MemoryKeystore()
    FixtureServer().use { transport ->
      store.write(SessionCredential(fixtureToken, distantFuture))
      val policy = RoutePolicy.loopback(transport.port)
      val client = VoiceHttpClient(policy, store, OkHttpTransport(policy))
      transport.setResponse(AuthRoute.deletionCode, deletionResponse("requestSuccess"))
      transport.setResponse(AuthRoute.deleteAccount, deletionResponse("deleteSuccess"))
      val challenge = client.requestDeletionCode()
      assertTrue(challenge.sent); assertEquals("c".repeat(43), challenge.challengeId)
      val result = client.deleteAccount(challenge.challengeId, "00001234")
      assertTrue(result.deleted); assertTrue(result.signedOut)
      assertNull(store.read()); assertEquals(1, store.deletions)
      val requests = transport.requests
      assertEquals(2, requests.size)
      for (request in requests) {
        assertEquals("POST", request.method)
        assertEquals(listOf("__Host-opax_session=$fixtureToken"), request.headers("Cookie"))
        assertEquals("https://opax.com.au", request.header("Origin"))
      }
      assertEquals(emptyMap<String, Any?>(), requests[0].json())
      assertEquals(mapOf("challenge_id" to challenge.challengeId, "code" to "00001234"), requests[1].json())
      assertTrue(deletionResponse("deleteSuccess").header("Set-Cookie")!!.contains("Max-Age=0"))
    }
  }

  @Test fun everyWorkerVerificationFailureIsGenericAndKeepsCredential() = runBlocking {
    for (name in deletionShapeNames().filter { "400" in it }) {
      Rig.make().use { rig ->
        val issuing = name.startsWith("request")
        val response = deletionResponse(name)
        rig.server.setResponse(if (issuing) AuthRoute.deletionCode else AuthRoute.deleteAccount, response)
        val error = assertThrows<APIFailure> {
          runBlocking {
            if (issuing) rig.client.requestDeletionCode() else rig.client.deleteAccount("c".repeat(43), "00001234")
          }
        }
        assertEquals(name, 400, error.status); assertEquals(name, VoiceFailure.deletionVerificationFailed, error.failure)
        assertNotNull(name, rig.store.read())
        assertEquals(mapOf("error" to "This deletion could not be completed. Request a new deletion code and try again."), parse(response.body))
      }
    }
  }

  @Test fun missingSessionAndWrongOriginClearOnlySentCredential() = runBlocking {
    for (name in listOf("request401", "delete401", "request403", "delete403")) {
      Rig.make().use { rig ->
        val issuing = name.startsWith("request")
        rig.server.setResponse(if (issuing) AuthRoute.deletionCode else AuthRoute.deleteAccount, deletionResponse(name))
        val error = assertThrows<APIFailure> {
          runBlocking { if (issuing) rig.client.requestDeletionCode() else rig.client.deleteAccount("fixture", "00001234") }
        }
        assertEquals(if (name.endsWith("401")) VoiceFailure.signedOut else VoiceFailure.forbidden, error.failure)
        assertNull(rig.store.read())
      }
    }
  }

  @Test fun everyWorkerUnavailableResponseKeepsCredentialWithoutRetry() = runBlocking {
    for (name in deletionShapeNames().filter { "503" in it }) {
      Rig.make().use { rig ->
        val route = if (name.startsWith("request")) AuthRoute.deletionCode else AuthRoute.deleteAccount
        rig.server.setResponse(route, deletionResponse(name))
        val error = assertThrows<APIFailure> {
          runBlocking { if (route == AuthRoute.deletionCode) rig.client.requestDeletionCode() else rig.client.deleteAccount("fixture", "00001234") }
        }
        assertEquals(VoiceFailure.unavailable, error.failure)
        assertNotNull(rig.store.read()); assertEquals(1, rig.server.count(route))
      }
    }
  }

  @Test fun disabledAndPausedWorkerStatusesPermitDeletion() = runBlocking {
    for (name in listOf("requestDisabled", "requestPaused")) {
      Rig.make().use { rig ->
        rig.server.setResponse(AuthRoute.communityStatus, deletionResponse(name + "Status"))
        val status = rig.client.communityStatus(); assertEquals(true, status.canDeleteAccount)
        if (name == "requestDisabled") assertNull(status.member)
        assertNotNull(rig.store.read())
        rig.server.setResponse(AuthRoute.deletionCode, deletionResponse(name))
        rig.server.setResponse(AuthRoute.deleteAccount, deletionResponse(if (name == "requestDisabled") "deleteDisabled" else "deletePaused"))
        val challenge = rig.client.requestDeletionCode()
        val result = rig.client.deleteAccount(challenge.challengeId, "00001234")
        assertTrue(result.deleted); assertNull(rig.store.read())
      }
    }
  }

  @Test fun nullMemberWithoutDeletionRightClearsCredential() = runBlocking {
    for (flag in listOf<Boolean?>(null, false)) {
      Rig.make().use { rig ->
        val body = parse(deletionResponse("request401Status").body).toMutableMap()
        body.remove("can_delete_account"); if (flag != null) body["can_delete_account"] = flag
        rig.server.setResponse(AuthRoute.communityStatus, HttpResponse(200, body = json(body)))
        rig.client.communityStatus(); assertNull(rig.store.read())
      }
    }
  }

  @Test fun signedOutVoiceStatusKeepsDisabledMembersDeletionCookie() = runBlocking {
    Rig.make().use { rig ->
      rig.server.configure(status = signedStatus(signedIn = false))
      rig.server.setResponse(AuthRoute.communityStatus, deletionResponse("requestDisabledStatus"))
      rig.server.setResponse(AuthRoute.deletionCode, deletionResponse("requestDisabled"))
      val voice = rig.client.status(); assertFalse(voice.signedIn)
      assertEquals(VoiceFailure.signedOut, voice.refusal) // retention never grants voice access
      // ...but the account stays held, so sign-out and deletion stay offered.
      assertTrue(voice.accountHeld); assertTrue(voice.bridgeValue.accountHeld)
      assertTrue(rig.client.requestDeletionCode().sent)
      val requests = rig.server.requests
      assertEquals(listOf(AuthRoute.voiceStatus.path, AuthRoute.communityStatus.path, AuthRoute.deletionCode.path), requests.map { it.path })
      for (request in requests) {
        assertEquals("__Host-opax_session=$fixtureToken", request.header("Cookie"))
        assertEquals("https://opax.com.au", request.header("Origin"))
      }
      assertNotNull(rig.store.read())
    }
  }

  @Test fun signedOutVoiceClearsOnlyAfterConfirmedAbsentMemberWithoutDeletion() = runBlocking {
    for (flag in listOf<Boolean?>(null, false)) {
      Rig.make().use { rig ->
        rig.server.configure(status = signedStatus(signedIn = false))
        val body = parse(deletionResponse("request401Status").body).toMutableMap()
        body.remove("can_delete_account"); if (flag != null) body["can_delete_account"] = flag
        rig.server.setResponse(AuthRoute.communityStatus, HttpResponse(200, body = json(body)))
        val voice = rig.client.status(); assertFalse(voice.bridgeValue.accountHeld)
        assertNull(rig.store.read())
        assertEquals(1, rig.server.count(AuthRoute.communityStatus))
      }
    }
  }

  @Test fun accountHeldFollowsTheSessionNotVoiceAccess() = runBlocking {
    Rig.make().use { rig ->
      rig.server.configure(status = signedStatus())
      val signedIn = rig.client.status()
      assertTrue(signedIn.signedIn); assertTrue(signedIn.bridgeValue.accountHeld)
      rig.store.clear()
      rig.server.configure(status = signedStatus(signedIn = false))
      assertFalse(rig.client.status().bridgeValue.accountHeld)
      assertEquals(0, rig.server.count(AuthRoute.communityStatus))
    }
  }

  @Test fun voiceSignOutWithExistingMemberOrUnconfirmedCommunityKeepsCredential() = runBlocking {
    val responses = listOf(deletionResponse("requestPausedStatus"),
      HttpResponse(200, body = json(mapOf("enabled" to true, "member" to mapOf("id" to "fixture"), "can_delete_account" to false))),
      HttpResponse(200, body = "invalid".toByteArray()),
      HttpResponse(503, body = json(mapOf("error" to "Synthetic unavailable"))))
    for (response in responses) {
      Rig.make().use { rig ->
        rig.server.configure(status = signedStatus(signedIn = false))
        rig.server.setResponse(AuthRoute.communityStatus, response)
        val status = rig.client.status(); assertFalse(status.signedIn)
        assertTrue(status.accountHeld) // unconfirmed revocation keeps the controls
        assertNotNull(rig.store.read())
      }
    }
  }

  @Test fun voiceSignOutConfirmationNeverUsesOrClearsNewSignIn() = runBlocking {
    for (delayed in listOf(AuthRoute.voiceStatus, AuthRoute.communityStatus)) {
      for (response in listOf(deletionResponse("request401Status"), deletionResponse("request401"), deletionResponse("request403"))) {
        Rig.make().use { rig ->
          rig.server.configure(status = signedStatus(signedIn = false))
          rig.server.setResponse(AuthRoute.voiceStatus, HttpResponse(200, body = signedStatus(signedIn = false)))
          rig.server.setResponse(AuthRoute.communityStatus, response); rig.server.pauseResponse(delayed)
          var stale: Result<VoiceStatus>? = null
          val thread = Thread { stale = runCatching { runBlocking { rig.client.status() } } }.apply { start() }
          eventually { rig.server.responseWaiting }
          val credential = SessionCredential(newer, distantFuture)
          rig.store.write(credential); rig.server.resumeResponse(); thread.join(5000)
          stale!!.getOrThrow()
          assertEquals(credential, rig.store.read())
          val confirmation = rig.server.requests.first { it.path == AuthRoute.communityStatus.path }
          assertEquals("__Host-opax_session=$fixtureToken", confirmation.header("Cookie"))
          rig.server.setResponse(AuthRoute.deletionCode, deletionResponse("requestSuccess"))
          rig.client.requestDeletionCode()
          assertEquals("__Host-opax_session=$newer", rig.server.requests.last().header("Cookie"))
        }
      }
    }
  }

  @Test fun unavailableCommunityTransportCannotRevokeOnVoiceSignOut() = runBlocking {
    Rig.make().use { rig ->
      rig.server.configure(status = signedStatus(signedIn = false))
      val inner = OkHttpTransport(rig.policy)
      val unreachableCommunity = HttpTransport { request: Request ->
        TransportGuard.check(request.url)
        if (request.url.encodedPath == AuthRoute.communityStatus.path) throw java.io.IOException("Synthetic offline")
        inner.send(request)
      }
      val client = VoiceHttpClient(rig.policy, rig.store, unreachableCommunity)
      assertFalse(client.status().signedIn)
      assertNotNull(rig.store.read())
      rig.server.setResponse(AuthRoute.deletionCode, deletionResponse("requestDisabled"))
      client.requestDeletionCode()
      assertEquals("__Host-opax_session=$fixtureToken", rig.server.requests.last().header("Cookie"))
    }
  }

  @Test fun staleDeletionSuccessAndFailuresPreserveNewSignIn() = runBlocking {
    for (name in listOf("deleteSuccess", "delete401", "delete403")) {
      Rig.make().use { rig ->
        rig.server.setResponse(AuthRoute.deleteAccount, deletionResponse(name)); rig.server.pauseResponse(AuthRoute.deleteAccount)
        val stale = Thread { runCatching { runBlocking { rig.client.deleteAccount("fixture", "00001234") } } }.apply { start() }
        eventually { rig.server.responseWaiting }
        val credential = SessionCredential(newer, distantFuture)
        rig.store.write(credential); rig.server.resumeResponse(); stale.join(5000)
        assertEquals(credential, rig.store.read())
        rig.client.communityStatus()
        assertEquals("__Host-opax_session=$newer", rig.server.requests.last().header("Cookie"))
      }
    }
  }

  /** Adapted: no live call on the account core, so this covers its deletion order and clearing. */
  @Test fun controllerDeletionClearsCredentialStatusAndEvidenceThenRefreshes() = runBlocking {
    Rig.make().use { rig ->
      rig.core.refreshStatus()
      rig.server.setResponse(AuthRoute.deleteAccount, deletionResponse("deleteSuccess"))
      assertTrue(rig.core.deleteAccount("fixture", "00001234").deleted)
      val requests = rig.server.requests.map { it.path }
      // End's fresh read precedes deletion; the post-deletion read follows it.
      assertEquals(listOf(AuthRoute.voiceStatus.path, AuthRoute.voiceStatus.path, AuthRoute.deleteAccount.path, AuthRoute.voiceStatus.path), requests)
      val snapshot = rig.core.snapshot()
      assertEquals(false, snapshot.status?.signedIn); assertFalse(snapshot.status!!.accountHeld)
      assertNull(rig.store.read())
      eventually { VoiceEvent.Transcript(emptyList()) in rig.recorder.items && VoiceEvent.Sources(emptyList()) in rig.recorder.items }
    }
  }

  @Test fun controllerDeletionErrorsAreCoreFailuresAndMethod405IsTyped() = runBlocking {
    Rig.make().use { rig ->
      rig.server.setResponse(AuthRoute.deletionCode, deletionResponse("request405"))
      assertEquals(VoiceFailure.invalidResponse, assertThrows<VoiceException> { runBlocking { rig.core.requestDeletionCode() } }.failure)
      rig.server.setResponse(AuthRoute.deleteAccount, deletionResponse("delete400"))
      assertEquals(VoiceFailure.deletionVerificationFailed,
        assertThrows<VoiceException> { runBlocking { rig.core.deleteAccount("bad", "bad") } }.failure)
      assertEquals(10, AuthRoute.entries.size)
    }
  }
}
