package au.com.opax.voice.call

import au.com.opax.voice.*

import java.io.IOException
import java.net.InetAddress
import java.net.Socket
import java.util.Base64
import java.util.concurrent.Executors
import java.util.concurrent.ScheduledFuture
import java.util.concurrent.TimeUnit
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.Response
import okhttp3.WebSocket
import okhttp3.WebSocketListener
import okhttp3.internal.ws.RealWebSocket
import okhttp3.mockwebserver.Dispatcher
import okhttp3.mockwebserver.MockResponse
import okhttp3.mockwebserver.MockWebServer
import okhttp3.mockwebserver.RecordedRequest

/**
 * Numeric-loopback convai fixture: no TLS trust bypass and no upstream
 * connection. It checks Origin, cookie and the convai protocol on upgrade,
 * enforces initiation and message limits, and supports deadline closes and
 * TCP aborts. Refusal scenarios answer the upgrade with a plain HTTP status.
 */
class LoopbackRelay(private val scenario: Scenario = Scenario.Conversation) {
  sealed interface Scenario {
    data object Conversation : Scenario
    data object Quiet : Scenario
    data object Ulaw : Scenario
    data object Unsupported : Scenario
    data object NoMetadata : Scenario
    data class Refuse(val status: Int) : Scenario
  }

  data class Log(
    val headers: Map<String, String> = emptyMap(),
    val types: List<String> = emptyList(),
    val audioSizes: List<Int> = emptyList(),
    val audioTimes: List<Double> = emptyList(),
    val allAudioSilent: Boolean = true,
    val pongIds: List<Long> = emptyList(),
    val peers: List<String> = emptyList(),
  )

  private val lock = Any()
  private val server = MockWebServer()
  private val timers = Executors.newSingleThreadScheduledExecutor()
  private val sockets = mutableListOf<WebSocket>()
  private val closing = mutableSetOf<WebSocket>()
  private var log = Log()
  private var initiated = false
  private var initiationTimer: ScheduledFuture<*>? = null
  private var window = 0.0
  private var hits = 0

  fun start(): Int {
    server.dispatcher = object : Dispatcher() {
      override fun dispatch(request: RecordedRequest): MockResponse = synchronized(lock) {
        initiated = false
        initiationTimer?.cancel(false)
        hits = 0
        window = 0.0
        // Bound to 127.0.0.1 only, so every accepted peer is numeric loopback.
        log = log.copy(peers = log.peers + "127.0.0.1", headers = request.headers.associate { (name, value) -> name.lowercase() to value })
        when (val scenario = scenario) {
          is Scenario.Refuse -> MockResponse().setResponseCode(scenario.status)
            .setHeader("Content-Type", "application/json").setBody("""{"error":"Synthetic upgrade refusal"}""")
          else ->
            if (request.getHeader("Sec-WebSocket-Protocol")?.split(",")?.map { it.trim() }?.contains("convai") != true) {
              MockResponse().setResponseCode(400)
            } else {
              MockResponse().withWebSocketUpgrade(ServerListener()).setHeader("Sec-WebSocket-Protocol", "convai")
            }
        }
      }
    }
    server.start(InetAddress.getByName("127.0.0.1"), 0)
    return server.port
  }

  private inner class ServerListener : WebSocketListener() {
    override fun onOpen(webSocket: WebSocket, response: Response) = synchronized(lock) {
      sockets += webSocket
      if (scenario != Scenario.NoMetadata) {
        val input = if (scenario == Scenario.Ulaw) "ulaw_8000" else "pcm_16000"
        val output = if (scenario == Scenario.Unsupported) "opus_48000" else input
        send(
          json(
            mapOf(
              "type" to "conversation_initiation_metadata",
              "conversation_initiation_metadata_event" to mapOf(
                "conversation_id" to "conv_fixture", "user_input_audio_format" to input, "agent_output_audio_format" to output,
              ),
            ),
          ),
          webSocket,
        )
      }
      initiationTimer = timers.schedule({
        synchronized(lock) { if (!initiated) close(1008, "Initiation timeout", webSocket) }
      }, 10, TimeUnit.SECONDS)
    }

    override fun onMessage(webSocket: WebSocket, text: String) = synchronized(lock) { receive(webSocket, text) }

    override fun onClosing(webSocket: WebSocket, code: Int, reason: String) = synchronized(lock) {
      if (webSocket in closing) abort(webSocket) else close(1000, "Voice conversation ended", webSocket)
    }
  }

  private fun receive(webSocket: WebSocket, text: String) {
    val now = epochSeconds()
    if (now - window >= 1) { window = now; hits = 0 }
    hits += 1
    val data = text.encodeToByteArray()
    val message = runCatching { JsonValue.parse(text) }.getOrNull() as? JsonValue.Obj
    if (hits > 150 || data.size > 192000 || message == null) { close(1008, "Invalid message", webSocket); return }
    val type = message["type"].string
    if (type == "conversation_initiation_client_data") {
      if (initiated) { close(1008, "Duplicate initiation", webSocket); return }
      initiated = true
      initiationTimer?.cancel(false)
      log = log.copy(types = log.types + type)
      if (scenario == Scenario.Conversation) canned(webSocket)
      return
    }
    if (!initiated) { close(1008, "Initiation required", webSocket); return }
    val audio = message["user_audio_chunk"].string
    val id = message["event_id"].int
    val messageText = message["text"].string
    when {
      audio != null && base64.matches(audio) -> {
        val bytes = Base64.getDecoder().decode(audio)
        log = log.copy(
          types = log.types + "user_audio_chunk", audioSizes = log.audioSizes + bytes.size, audioTimes = log.audioTimes + now,
          allAudioSilent = log.allAudioSilent && bytes.all { it == 0.toByte() || it == (-1).toByte() },
        )
      }
      type == "pong" && id != null -> log = log.copy(types = log.types + "pong", pongIds = log.pongIds + id)
      type == "user_activity" -> log = log.copy(types = log.types + type)
      (type == "user_message" || type == "contextual_update") && messageText != null && messageText.length <= 2000 ->
        log = log.copy(types = log.types + type)
    }
  }

  private fun canned(webSocket: WebSocket) {
    val events = listOf(
      mapOf("type" to "agent_response", "agent_response_event" to mapOf("event_id" to 1, "agent_response" to "Synthetic fixture greeting [Record](/doc/fixture) [Reject](https://example.org/private)")),
      mapOf("type" to "audio", "audio_event" to mapOf("event_id" to 1, "audio_base_64" to Base64.getEncoder().encodeToString(ByteArray(800)), "alignment" to mapOf("chars" to listOf("a"), "char_start_times_ms" to listOf(0)))),
      mapOf("type" to "ping", "ping_event" to mapOf("event_id" to 42, "ping_ms" to 0)),
      mapOf("type" to "user_transcript", "user_transcription_event" to mapOf("event_id" to 2, "user_transcript" to "Synthetic question")),
      mapOf("type" to "agent_tool_response", "agent_tool_response" to mapOf("tool_name" to "lookup", "status" to "success", "sources" to listOf(mapOf("title" to "Standard", "url" to "/bill/fixture")), "source_url" to "/bill/fixture")),
      mapOf("type" to "agent_tool_response_full_payload", "agent_tool_response_full_payload" to mapOf("tool_name" to "receipts", "full_tool_result" to jsonText(mapOf("sources" to listOf(mapOf("title" to "Receipt", "url" to "/money/receipts")), "data" to mapOf("answer" to "Synthetic answer"))))),
      mapOf("type" to "agent_tool_response_full_payload", "agent_tool_response_full_payload" to mapOf("tool_name" to "receipts", "full_tool_result" to mapOf("sources" to emptyList<Any>(), "data" to mapOf("needs_period" to true)))),
      mapOf("type" to "interruption", "interruption_event" to mapOf("event_id" to 8)),
      mapOf("type" to "audio", "audio_event" to mapOf("event_id" to 1, "audio_base_64" to Base64.getEncoder().encodeToString(ByteArray(400)))),
      mapOf("type" to "agent_response_correction", "agent_response_correction_event" to mapOf("event_id" to 1, "corrected_agent_response" to "Synthetic corrected greeting")),
    )
    for (event in events) send(json(event), webSocket)
  }

  private fun send(data: ByteArray, webSocket: WebSocket) { webSocket.send(data.decodeToString()) }

  private fun close(code: Int, reason: String, webSocket: WebSocket) {
    if (!closing.add(webSocket)) return
    webSocket.close(code, reason)
    // Complete the close handshake, or bound cleanup if the peer never replies.
    timers.schedule({ abort(webSocket) }, 1, TimeUnit.SECONDS)
  }

  fun close(code: Int, reason: String) = synchronized(lock) { sockets.toList().forEach { close(code, reason, it) } }

  /** Canned frames go only to accepted numeric-loopback peers. */
  fun broadcast(data: ByteArray) = synchronized(lock) { sockets.forEach { send(data, it) } }

  /** A TCP abort: no close frame. */
  fun drop() = abortConnections()

  /** MockWebServer keeps accepted sockets private; a reset is the only true TCP abort. */
  @Suppress("UNCHECKED_CAST")
  private fun abortConnections() {
    val field = MockWebServer::class.java.getDeclaredField("openClientSockets").apply { isAccessible = true }
    (field.get(server) as MutableSet<Socket>).toTypedArray().forEach { runCatching { it.setSoLinger(true, 0); it.close() } }
  }

  fun snapshot() = synchronized(lock) { log }

  fun stop() {
    synchronized(lock) {
      initiationTimer?.cancel(false)
      sockets.forEach(::abort)
    }
    abortConnections()
    server.shutdown()
    timers.shutdownNow()
  }

  private companion object {
    /** Server sockets have no Call to cancel; failing one closes its TCP stream with no close frame. */
    fun abort(webSocket: WebSocket) = (webSocket as RealWebSocket).failWebSocket(IOException("Synthetic TCP abort"), null)

    val base64 = Regex("^[A-Za-z0-9+/]*={0,2}$")
  }
}

/** One OkHttp client for every test socket, so connection pools are shared. */
val testClient: OkHttpClient by lazy { OkHttpClient() }

/** The real OkHttp relay restricted to one loopback port, behind the shared guard. */
class GuardedRelayFactory(port: Int) : RelayFactory {
  private val inner = OkHttpRelayFactory(testClient, RoutePolicy.loopback(port))

  override suspend fun connect(request: Request): RelayTransport {
    VoiceTestSafety.validate(request)
    return inner.connect(request)
  }
}
