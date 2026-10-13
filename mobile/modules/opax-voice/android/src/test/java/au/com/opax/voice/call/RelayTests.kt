package au.com.opax.voice.call

import au.com.opax.voice.*

import java.net.InetAddress
import kotlinx.coroutines.delay
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import okhttp3.Response
import okhttp3.WebSocket
import okhttp3.WebSocketListener
import okhttp3.mockwebserver.Dispatcher
import okhttp3.mockwebserver.MockResponse
import okhttp3.mockwebserver.MockWebServer
import okhttp3.mockwebserver.RecordedRequest
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Assert.fail
import org.junit.Test

/** Port of the socket half of the iOS RedirectTests, plus the OkHttp-specific relay contract. */
class RelayTests : SafeVoiceTest() {
  /** A fixture peer that completes the close handshake, so the server can shut down. */
  private open class Answering : WebSocketListener() {
    override fun onClosing(webSocket: WebSocket, code: Int, reason: String) { webSocket.close(1000, null) }
  }

  private class Receipt(val cookie: Boolean, val origin: String?, val upgrade: Boolean)

  private fun server(respond: (RecordedRequest) -> MockResponse): Pair<MockWebServer, MutableList<RecordedRequest>> {
    val seen = mutableListOf<RecordedRequest>()
    val server = MockWebServer()
    server.dispatcher = object : Dispatcher() {
      override fun dispatch(request: RecordedRequest): MockResponse {
        synchronized(seen) { seen += request }
        return respond(request)
      }
    }
    server.start(InetAddress.getByName("127.0.0.1"), 0)
    return server to seen
  }

  private fun relayRequest(port: Int) = Request.Builder()
    .url("ws://127.0.0.1:$port/api/voice/connect?session_id=$fixtureId")
    .header("Origin", "https://opax.com.au")
    .header("Cookie", "__Host-opax_session=$fixtureToken")
    .header("Sec-WebSocket-Protocol", "convai")
    .build()

  @Test fun realWebSocketRedirectNeverReachesSecondServer() = test {
    val (destination, followed) = server { MockResponse().setBody("{}") }
    val (redirect, received) = server { MockResponse().setResponseCode(302).setHeader("Location", "http://127.0.0.1:${destination.port}/stolen") }
    val socket = GuardedRelayFactory(redirect.port).connect(relayRequest(redirect.port))
    try {
      socket.send(ClientMessage.Initiation.data())
      socket.receive()
      fail()
    } catch (error: APIFailure) {
      assertEquals(302, error.status)
      assertEquals(VoiceFailure.invalidResponse, error.failure)
    }
    socket.close(1000)
    delay(80)
    val receipts = synchronized(received) {
      received.map { Receipt(it.getHeader("Cookie") == "__Host-opax_session=$fixtureToken", it.getHeader("Origin"), it.getHeader("Upgrade")?.lowercase() == "websocket") }
    }
    assertEquals(1, receipts.size)
    assertTrue(receipts.all { it.cookie && it.origin == "https://opax.com.au" && it.upgrade })
    assertEquals(0, synchronized(followed) { followed.size })
    redirect.shutdown()
    destination.shutdown()
  }

  @Test fun refusedUpgradesClassifyByStatusAlone() = test {
    for ((status, failure) in listOf(401 to VoiceFailure.signedOut, 409 to VoiceFailure.callOpen, 403 to VoiceFailure.forbidden, 429 to VoiceFailure.rateLimited, 503 to VoiceFailure.unavailable)) {
      // A budget reason in the body is never read for the upgrade, as on iOS.
      val (refusing, _) = server { MockResponse().setResponseCode(status).setBody("""{"reason":"budget"}""") }
      val socket = GuardedRelayFactory(refusing.port).connect(relayRequest(refusing.port))
      try {
        socket.send(ClientMessage.Initiation.data())
        socket.receive()
        fail()
      } catch (error: APIFailure) {
        assertEquals(status, error.status)
        assertEquals(failure, error.failure)
      }
      socket.close(1000)
      refusing.shutdown()
    }
  }

  @Test fun firstSendWaitsForTheUpgradeAndFramesArriveAheadOfTheClose() = test {
    val opened = mutableListOf<String>()
    val (slow, _) = server {
      Thread.sleep(400) // provider setup before the 101
      MockResponse().withWebSocketUpgrade(object : Answering() {
        override fun onMessage(webSocket: WebSocket, text: String) {
          synchronized(opened) { opened += text }
          for (index in 1..3) webSocket.send("""{"type":"ping","ping_event":{"event_id":$index}}""")
          webSocket.close(1000, "Your free voice time has finished")
        }
      })
    }
    val socket = GuardedRelayFactory(slow.port).connect(relayRequest(slow.port))
    val started = System.nanoTime()
    socket.send(ClientMessage.Initiation.data())
    assertTrue("send returned before the upgrade", System.nanoTime() - started >= 300_000_000)
    for (index in 1..3) {
      val frame = socket.receive() as RelayMessage.Data
      assertEquals(ProviderEvent.Ping(index.toLong()), ProviderEvent.decode(frame.bytes))
    }
    assertEquals(RelayMessage.Closed(RelayClose(1000, "Your free voice time has finished")), socket.receive())
    assertEquals(listOf("""{"type":"conversation_initiation_client_data"}"""), synchronized(opened) { opened.toList() })
    socket.close(1000)
    slow.shutdown()
  }

  @Test fun oversizedFrameFailsTheSocketLikeUrlSessionsMessageLimit() = test {
    val (big, _) = server {
      MockResponse().withWebSocketUpgrade(object : Answering() {
        override fun onOpen(webSocket: WebSocket, response: Response) { webSocket.send("x".repeat(RelayListener.maximumMessageSize + 1)) }
      })
    }
    val socket = GuardedRelayFactory(big.port).connect(relayRequest(big.port))
    socket.send(ClientMessage.Initiation.data())
    val close = socket.receive() as RelayMessage.Closed
    assertEquals(1009, close.close.code)
    assertEquals(VoiceFailure.network, close.close.failure)
    socket.close(1000)
    big.shutdown()
  }

  @Test fun initiationComesFirstAndOnlyOnce() = test {
    val (quiet, _) = server { MockResponse().withWebSocketUpgrade(Answering()) }
    val socket = GuardedRelayFactory(quiet.port).connect(relayRequest(quiet.port))
    for (early in listOf(ClientMessage.Activity, ClientMessage.Pong(1))) {
      try { socket.send(early.data()); fail() } catch (error: VoiceException) { assertEquals(VoiceFailure.policy, error.failure) }
    }
    socket.send(ClientMessage.Initiation.data())
    try { socket.send(ClientMessage.Initiation.data()); fail() } catch (error: VoiceException) { assertEquals(VoiceFailure.policy, error.failure) }
    for (invalid in listOf(byteArrayOf(-1), "[1]".encodeToByteArray(), ByteArray(192001) { ' '.code.toByte() })) {
      try { socket.send(invalid); fail() } catch (error: VoiceException) { assertEquals(VoiceFailure.policy, error.failure) }
    }
    socket.send(ClientMessage.Activity.data())
    socket.close(1000)
    quiet.shutdown()
  }

  @Test fun factoryRefusesAnythingButTheDecoratedConvaiUpgrade() = test {
    val factory = GuardedRelayFactory(8901)
    val good = relayRequest(8901)
    for (bad in listOf(
      good.newBuilder().removeHeader("Sec-WebSocket-Protocol").build(),
      good.newBuilder().header("Origin", "https://example.org").build(),
      good.newBuilder().post(ByteArray(0).toRequestBody()).build(),
      good.newBuilder().url("ws://127.0.0.1:8902/api/voice/connect?session_id=$fixtureId").build(),
      good.newBuilder().url("ws://127.0.0.1:8901/api/voice/start").build(),
    )) {
      try { factory.connect(bad); fail() } catch (error: VoiceException) { assertEquals(VoiceFailure.forbidden, error.failure) }
    }
  }
}
