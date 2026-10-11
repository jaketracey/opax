package au.com.opax.voice

import java.io.IOException
import java.net.InetAddress
import java.util.concurrent.TimeUnit
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.async
import kotlinx.coroutines.runBlocking
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import okhttp3.mockwebserver.MockResponse
import okhttp3.mockwebserver.MockWebServer
import okhttp3.mockwebserver.SocketPolicy
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotNull
import org.junit.Before
import org.junit.Test

/**
 * Review P2-B: URLSession's one retry, as iOS gets it. A GET whose reused
 * connection failed before any response headers is sent once more; a POST,
 * a failure after the headers, a fresh connection's failure, a server error
 * and a cancelled call are not. All on a loopback MockWebServer.
 */
class TransportRetryTests : SafeVoiceTestCase() {
  private lateinit var server: MockWebServer
  private lateinit var transport: OkHttpTransport

  @Before fun startServer() {
    server = MockWebServer()
    server.start(InetAddress.getByName("127.0.0.1"), 0)
    transport = OkHttpTransport(RoutePolicy.loopback(server.port))
  }

  @After fun stopServer() { server.shutdown() }

  private fun url(path: String) = "http://127.0.0.1:${server.port}$path"
  private fun get() = Request.Builder().url(url(AuthRoute.voiceStatus.path)).build()
  private fun post() = Request.Builder().url(url(AuthRoute.voiceStart.path)).post("{}".toByteArray().toRequestBody()).build()
  private fun ok(body: String = "{}") = MockResponse().setBody(body)
  private fun closed() = MockResponse().setSocketPolicy(SocketPolicy.DISCONNECT_AFTER_REQUEST)

  /** The first request leaves a pooled keep-alive connection for the next call to reuse. */
  private fun warm() = runBlocking {
    server.enqueue(ok())
    assertEquals(200, transport.send(get()).status)
    assertEquals(0, server.takeRequest().sequenceNumber)
  }

  @Test fun aGetOnAConnectionTheServerClosedIsSentOnceMoreOnANewOne() = runBlocking {
    warm()
    server.enqueue(closed())
    server.enqueue(ok("""{"retried":true}"""))
    val response = transport.send(get())
    assertEquals(200, response.status)
    assertEquals("""{"retried":true}""", response.body.decodeToString())
    assertEquals(3, server.requestCount)
    assertEquals(1, server.takeRequest().sequenceNumber) // the reused connection
    assertEquals(0, server.takeRequest().sequenceNumber) // the retry, on a new one
  }

  @Test fun aPostOnAClosedConnectionIsNeverResent() = runBlocking {
    warm()
    server.enqueue(closed())
    server.enqueue(ok())
    val error = assertThrows<IOException> { runBlocking { transport.send(post()) } }
    assertEquals(VoiceFailure.network, voiceFailure(error))
    assertEquals(2, server.requestCount)
  }

  @Test fun aFailureAfterTheHeadersIsNotRetried() = runBlocking {
    warm()
    server.enqueue(ok("x".repeat(64 * 1024)).setSocketPolicy(SocketPolicy.DISCONNECT_DURING_RESPONSE_BODY))
    server.enqueue(ok())
    assertThrows<IOException> { runBlocking { transport.send(get()) } }
    assertEquals(2, server.requestCount)
  }

  @Test fun aFreshConnectionsFailureIsNotRetried() = runBlocking {
    server.enqueue(closed())
    server.enqueue(ok())
    assertThrows<IOException> { runBlocking { transport.send(get()) } }
    assertEquals(1, server.requestCount)
  }

  @Test fun neverMoreThanOneRetry() = runBlocking {
    warm()
    server.enqueue(closed())
    server.enqueue(closed())
    server.enqueue(ok())
    assertThrows<IOException> { runBlocking { transport.send(get()) } }
    assertEquals(3, server.requestCount)
  }

  @Test fun aServerErrorIsAnAnswerNotARetry() = runBlocking {
    warm()
    server.enqueue(ok("""{"error":"Synthetic unavailable"}""").setResponseCode(503))
    server.enqueue(ok())
    assertEquals(503, transport.send(get()).status)
    assertEquals(2, server.requestCount)
  }

  @Test fun cancellingTheFirstAttemptStartsNoSecond() = runBlocking {
    warm()
    server.enqueue(ok().setSocketPolicy(SocketPolicy.NO_RESPONSE)) // read, then hold the connection open
    server.enqueue(ok())
    val sending = CoroutineScope(Dispatchers.IO).async { transport.send(get()) }
    assertNotNull(server.takeRequest(5, TimeUnit.SECONDS)) // the first attempt is in flight
    sending.cancel()
    assertThrows<CancellationException> { runBlocking { sending.await() } }
    Thread.sleep(300)
    assertEquals(2, server.requestCount)
    assertFalse(sending.isActive)
  }

  @Test fun theRelaySocketCarriesNoAttempt() {
    // Only transport calls are tagged; OkHttp's broad retry stays off for all.
    val client = transport.client
    assertFalse(client.retryOnConnectionFailure)
    assertEquals(okhttp3.EventListener.NONE, client.eventListenerFactory.create(client.newCall(get())))
  }
}
