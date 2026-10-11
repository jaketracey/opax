package au.com.opax.voice

import java.nio.ByteBuffer
import java.nio.charset.CharacterCodingException
import java.nio.charset.CodingErrorAction
import java.util.concurrent.TimeUnit
import java.util.concurrent.atomic.AtomicInteger
import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.channels.Channel
import kotlinx.coroutines.channels.trySendBlocking
import kotlinx.coroutines.delay
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.Response
import okhttp3.WebSocket
import okhttp3.WebSocketListener
import okio.ByteString
import okio.ByteString.Companion.decodeBase64
import okio.ByteString.Companion.toByteString

data class RelayClose(val code: Int, val reason: String = "") {
  internal val failure: VoiceFailure?
    get() = when (code) {
      1000 -> null
      1008 -> VoiceFailure.policy
      else -> VoiceFailure.network
    }
  internal val endReason: EndReason
    get() = when {
      code != 1000 -> EndReason.network
      reason == "Your free voice time has finished" -> EndReason.deadline
      else -> EndReason.provider
    }
}

sealed interface RelayMessage {
  class Data(val bytes: ByteArray) : RelayMessage
  data class Closed(val close: RelayClose) : RelayMessage
}

interface RelayTransport {
  suspend fun send(data: ByteArray)
  suspend fun receive(): RelayMessage
  suspend fun close(code: Int)
}

fun interface RelayFactory {
  suspend fun connect(request: Request): RelayTransport
}

internal sealed interface ClientMessage {
  data object Initiation : ClientMessage
  class Audio(val bytes: ByteArray) : ClientMessage
  class Pong(val id: Int) : ClientMessage
  data object Activity : ClientMessage
  class Message(val text: String) : ClientMessage
  class ContextualUpdate(val text: String) : ClientMessage

  /** Keys sorted, as the iOS client writes them. */
  fun data(): ByteArray {
    val json = when (this) {
      Initiation -> """{"type":"conversation_initiation_client_data"}"""
      is Audio -> """{"user_audio_chunk":"${bytes.toByteString().base64()}"}"""
      is Pong -> """{"event_id":$id,"type":"pong"}"""
      Activity -> """{"type":"user_activity"}"""
      is Message -> textMessage(text, "user_message")
      is ContextualUpdate -> textMessage(text, "contextual_update")
    }
    val data = json.encodeToByteArray()
    if (data.size > 192000) throw VoiceException(VoiceFailure.policy)
    return data
  }

  private companion object {
    fun textMessage(text: String, type: String): String {
      if (text.length > 2000) throw VoiceException(VoiceFailure.policy) // UTF-16 units, as iOS counts
      return """{"text":${JsonValue.quote(text)},"type":"$type"}"""
    }
  }
}

/**
 * Opens the convai socket on the account half's client. Redirects stay off for
 * the upgrade, as for every credential-bearing request, and no compression is
 * offered: frames arrive exactly as iOS receives them.
 */
class OkHttpRelayFactory(client: OkHttpClient, private val policy: RoutePolicy = RoutePolicy()) : RelayFactory {
  private val client = client.newBuilder()
    .followRedirects(false)
    .followSslRedirects(false)
    .connectTimeout(60, TimeUnit.SECONDS) // URLSession's default; CallTiming ends the attempt first
    .readTimeout(60, TimeUnit.SECONDS)
    .pingInterval(0, TimeUnit.SECONDS)
    .minWebSocketMessageToCompress(Long.MAX_VALUE)
    .addInterceptor { chain ->
      chain.proceed(chain.request().newBuilder().removeHeader("Sec-WebSocket-Extensions").build())
    }
    .build()

  override suspend fun connect(request: Request): RelayTransport {
    VoiceTestSafety.validate(request.url)
    TransportGuard.check(request.url)
    if (request.method != "GET" || !policy.permits(request.url, "GET", webSocket = true) ||
      request.header("Sec-WebSocket-Protocol") != "convai" ||
      request.header("Origin") != "https://opax.com.au"
    ) {
      throw VoiceException(VoiceFailure.forbidden)
    }
    val listener = RelayListener()
    return OkHttpRelay(client.newWebSocket(request, listener), listener)
  }
}

/**
 * Listener callbacks run on OkHttp's reader thread. Frames queue in order ahead
 * of the close; a full queue blocks the reader, so the socket applies back-pressure
 * the way URLSession's pull-based receive does.
 */
internal class RelayListener : WebSocketListener() {
  val incoming = Channel<ByteArray>(64)
  val termination = SocketCloseSignal()
  @Volatile var refusedStatus: Int? = null
  @Volatile var open = false

  override fun onOpen(webSocket: WebSocket, response: Response) { open = true }
  override fun onMessage(webSocket: WebSocket, text: String) = deliver(webSocket, text.encodeToByteArray())
  override fun onMessage(webSocket: WebSocket, bytes: ByteString) = deliver(webSocket, bytes.toByteArray())

  private fun deliver(webSocket: WebSocket, data: ByteArray) {
    if (data.size > maximumMessageSize) {
      // URLSession's maximumMessageSize: the socket fails with "message too big".
      termination.resolve(RelayClose(1009))
      incoming.close()
      webSocket.cancel()
      return
    }
    incoming.trySendBlocking(data)
  }

  override fun onClosing(webSocket: WebSocket, code: Int, reason: String) {
    termination.resolve(RelayClose(code, reason))
    incoming.close()
    webSocket.close(1000, null) // URLSession answers a close frame itself
  }

  override fun onClosed(webSocket: WebSocket, code: Int, reason: String) {
    termination.resolve(RelayClose(code, reason))
    incoming.close()
  }

  override fun onFailure(webSocket: WebSocket, t: Throwable, response: Response?) {
    response?.code?.takeIf { it != 101 }?.let { refusedStatus = it }
    termination.resolve(RelayClose(1006))
    incoming.close()
  }

  companion object {
    const val maximumMessageSize = 2 * 1024 * 1024
  }
}

internal class OkHttpRelay(private val socket: WebSocket, private val listener: RelayListener) : RelayTransport {
  private var initiated = false

  override suspend fun send(data: ByteArray) {
    if (data.size > 192000) throw VoiceException(VoiceFailure.policy)
    val text = try { strictUtf8(data) } catch (_: CharacterCodingException) { throw VoiceException(VoiceFailure.policy) }
    val obj = runCatching { JsonValue.parse(text) }.getOrNull() as? JsonValue.Obj
      ?: throw VoiceException(VoiceFailure.policy)
    val isInitiation = obj["type"].string == "conversation_initiation_client_data"
    synchronized(this) {
      if (!initiated) {
        if (!isInitiation) throw VoiceException(VoiceFailure.policy)
        initiated = true
      } else if (isInitiation) {
        throw VoiceException(VoiceFailure.policy)
      }
    }
    // OkHttp queues frames, including those sent before the upgrade opens. Like
    // URLSession's send, return once this frame has left the queue for the socket.
    if (socket.send(text)) {
      var wait = 1L
      while (socket.queueSize() > 0 && !listener.termination.isResolved) {
        delay(wait)
        wait = minOf(wait * 2, 20)
      }
      if (socket.queueSize() == 0L) return
    }
    listener.refusedStatus?.let { throw refused(it) }
    val close = listener.termination.value()
    listener.refusedStatus?.let { throw refused(it) }
    throw RelayTerminated(close)
  }

  override suspend fun receive(): RelayMessage {
    listener.incoming.receiveCatching().getOrNull()?.let { return RelayMessage.Data(it) }
    // The frame queue ends at the close; classify it like URLSession's terminal
    // callback. This neither reads another frame nor reconnects.
    listener.refusedStatus?.let { throw refused(it) }
    val close = listener.termination.value()
    listener.refusedStatus?.let { throw refused(it) }
    return RelayMessage.Closed(close)
  }

  override suspend fun close(code: Int) {
    listener.termination.resolve(RelayClose(code))
    listener.incoming.cancel()
    val closing = listener.open && runCatching { socket.close(code, null) }.getOrDefault(false)
    if (!closing) socket.cancel()
  }

  private companion object {
    fun strictUtf8(data: ByteArray): String = Charsets.UTF_8.newDecoder()
      .onMalformedInput(CodingErrorAction.REPORT)
      .onUnmappableCharacter(CodingErrorAction.REPORT)
      .decode(ByteBuffer.wrap(data)).toString()

    /** A refused upgrade is classified by its status alone; its body is never read. */
    fun refused(status: Int) = APIFailure.decode(HttpResponse(status, body = ByteArray(0)), AuthRoute.voiceConnect)
  }
}

/** Internal transport terminal signal; provider prose remains opaque to callers. */
internal class RelayTerminated(val close: RelayClose) : Exception("RelayTerminated")

/** The first terminal observation wins, is cached and reaches every waiter. */
internal class SocketCloseSignal {
  private val close = CompletableDeferred<RelayClose>()
  private val waiters = AtomicInteger()
  val waiterCount get() = waiters.get()
  val isResolved get() = close.isCompleted

  suspend fun value(): RelayClose {
    waiters.incrementAndGet()
    try { return close.await() } finally { waiters.decrementAndGet() }
  }

  fun resolve(value: RelayClose) { close.complete(value) }
}

/**
 * The decoded shape of a provider frame. Fractional numbers (VAD, alignment)
 * are never read: like iOS's JSONValue they are neither strings nor integers.
 */
internal sealed interface JsonValue {
  data class Obj(val values: Map<String, JsonValue>) : JsonValue
  data class Arr(val items: List<JsonValue>) : JsonValue
  data class Str(val value: String) : JsonValue
  data class Num(val value: Long) : JsonValue
  data class Real(val value: Double) : JsonValue
  data class Bool(val value: Boolean) : JsonValue
  data object Null : JsonValue

  operator fun get(key: String): JsonValue = (this as? Obj)?.values?.get(key) ?: Null
  val string get() = (this as? Str)?.value
  val int get() = (this as? Num)?.value?.takeIf { it in Int.MIN_VALUE..Int.MAX_VALUE }?.toInt()

  companion object {
    fun parse(text: String): JsonValue = JsonReader(text).document()

    fun parse(data: ByteArray): JsonValue = parse(
      try {
        Charsets.UTF_8.newDecoder().onMalformedInput(CodingErrorAction.REPORT)
          .onUnmappableCharacter(CodingErrorAction.REPORT).decode(ByteBuffer.wrap(data)).toString()
      } catch (_: CharacterCodingException) {
        throw VoiceException(VoiceFailure.invalidResponse)
      },
    )

    fun quote(text: String): String = buildString(text.length + 2) {
      append('"')
      for (char in text) {
        when {
          char == '"' -> append("\\\"")
          char == '\\' -> append("\\\\")
          char == '\n' -> append("\\n")
          char == '\r' -> append("\\r")
          char == '\t' -> append("\\t")
          char < ' ' -> append("\\u%04x".format(char.code))
          else -> append(char)
        }
      }
      append('"')
    }
  }
}

/** Strict RFC 8259 reader with a nesting bound, so a hostile frame cannot exhaust the stack. */
private class JsonReader(private val text: String) {
  private var index = 0

  fun document(): JsonValue {
    val value = value(0)
    whitespace()
    if (index != text.length) fail()
    return value
  }

  private fun value(depth: Int): JsonValue {
    if (depth > 512) fail()
    whitespace()
    if (index >= text.length) fail()
    return when (text[index]) {
      '{' -> obj(depth)
      '[' -> arr(depth)
      '"' -> JsonValue.Str(string())
      't' -> literal("true", JsonValue.Bool(true))
      'f' -> literal("false", JsonValue.Bool(false))
      'n' -> literal("null", JsonValue.Null)
      else -> number()
    }
  }

  private fun obj(depth: Int): JsonValue {
    index += 1
    val values = LinkedHashMap<String, JsonValue>()
    whitespace()
    if (peek() == '}') { index += 1; return JsonValue.Obj(values) }
    while (true) {
      whitespace()
      if (peek() != '"') fail()
      val key = string()
      whitespace()
      if (peek() != ':') fail()
      index += 1
      values[key] = value(depth + 1)
      whitespace()
      when (peek()) {
        ',' -> index += 1
        '}' -> { index += 1; return JsonValue.Obj(values) }
        else -> fail()
      }
    }
  }

  private fun arr(depth: Int): JsonValue {
    index += 1
    val items = mutableListOf<JsonValue>()
    whitespace()
    if (peek() == ']') { index += 1; return JsonValue.Arr(items) }
    while (true) {
      items += value(depth + 1)
      whitespace()
      when (peek()) {
        ',' -> index += 1
        ']' -> { index += 1; return JsonValue.Arr(items) }
        else -> fail()
      }
    }
  }

  private fun string(): String {
    index += 1
    val out = StringBuilder()
    while (true) {
      if (index >= text.length) fail()
      val char = text[index++]
      when {
        char == '"' -> return out.toString()
        char == '\\' -> {
          if (index >= text.length) fail()
          when (val escape = text[index++]) {
            '"', '\\', '/' -> out.append(escape)
            'b' -> out.append('\b')
            'f' -> out.append('\u000C')
            'n' -> out.append('\n')
            'r' -> out.append('\r')
            't' -> out.append('\t')
            'u' -> {
              if (index + 4 > text.length) fail()
              out.append(text.substring(index, index + 4).toIntOrNull(16)?.toChar() ?: fail())
              index += 4
            }
            else -> fail()
          }
        }
        char < ' ' -> fail()
        else -> out.append(char)
      }
    }
  }

  private fun number(): JsonValue {
    val start = index
    if (peek() == '-') index += 1
    when {
      peek() == '0' -> index += 1
      peek() in '1'..'9' -> while (peek() in '0'..'9') index += 1
      else -> fail()
    }
    var integral = true
    if (peek() == '.') {
      integral = false
      index += 1
      if (peek() !in '0'..'9') fail()
      while (peek() in '0'..'9') index += 1
    }
    if (peek() == 'e' || peek() == 'E') {
      integral = false
      index += 1
      if (peek() == '+' || peek() == '-') index += 1
      if (peek() !in '0'..'9') fail()
      while (peek() in '0'..'9') index += 1
    }
    val literal = text.substring(start, index)
    return (if (integral) literal.toLongOrNull()?.let { JsonValue.Num(it) } else null) ?: JsonValue.Real(literal.toDouble())
  }

  private fun literal(word: String, value: JsonValue): JsonValue {
    if (!text.startsWith(word, index)) fail()
    index += word.length
    return value
  }

  private fun whitespace() {
    while (index < text.length && text[index] in " \t\n\r") index += 1
  }

  private fun peek(): Char = if (index < text.length) text[index] else '\u0000'

  private fun fail(): Nothing = throw VoiceException(VoiceFailure.invalidResponse)
}

internal sealed interface ProviderEvent {
  data class Metadata(val input: AudioFormat, val output: AudioFormat) : ProviderEvent
  data class Ping(val id: Int) : ProviderEvent
  class Audio(val bytes: ByteArray, val id: Int) : ProviderEvent
  data class Interruption(val id: Int) : ProviderEvent
  data class Transcript(val turn: TranscriptTurn, val correction: Boolean) : ProviderEvent
  class Tool(val json: JsonValue, val endsCall: Boolean) : ProviderEvent
  data object Deadline : ProviderEvent
  data object Error : ProviderEvent
  data object Unknown : ProviderEvent

  companion object {
    fun decode(data: ByteArray): ProviderEvent {
      if (data.size > RelayListener.maximumMessageSize) throw VoiceException(VoiceFailure.policy)
      val root = JsonValue.parse(data)
      return when (root["type"].string) {
        "conversation_initiation_metadata" -> {
          val event = root["conversation_initiation_metadata_event"]
          Metadata(
            input = AudioFormat(event["user_input_audio_format"].string ?: "pcm_16000"),
            output = AudioFormat(event["agent_output_audio_format"].string ?: ""),
          )
        }
        "ping" -> Ping(root["ping_event"]["event_id"].int ?: throw VoiceException(VoiceFailure.policy))
        "audio" -> {
          val event = root["audio_event"]
          val bytes = event["audio_base_64"].string?.let(::strictBase64) ?: return Unknown
          Audio(bytes, event["event_id"].int ?: 0)
        }
        "interruption" -> Interruption(root["interruption_event"]["event_id"].int ?: 0)
        "user_transcript" -> {
          val event = root["user_transcription_event"]
          Transcript(
            TranscriptTurn(TranscriptTurn.Role.user, event["event_id"].int ?: root["event_id"].int ?: -1, event["user_transcript"].string ?: ""),
            correction = false,
          )
        }
        "agent_response", "agent_response_correction" -> {
          val correction = root["type"].string == "agent_response_correction"
          val event = root[if (correction) "agent_response_correction_event" else "agent_response_event"]
          Transcript(
            TranscriptTurn(
              TranscriptTurn.Role.agent,
              event["event_id"].int ?: root["event_id"].int ?: -1,
              event[if (correction) "corrected_agent_response" else "agent_response"].string ?: "",
            ),
            correction,
          )
        }
        "agent_tool_response", "agent_tool_response_full_payload" -> Tool(
          root,
          endsCall = root["agent_tool_response"]["tool_name"].string == "end_call" ||
            root["agent_tool_response_full_payload"]["tool_name"].string == "end_call",
        )
        "error" ->
          if (root["error_event"]["error_type"].string == "max_duration_exceeded" || root["error"].string == "max_duration_exceeded") Deadline
          else Error
        else -> Unknown
      }
    }

    /** Foundation's Data(base64Encoded:): standard alphabet, padded, nothing else. */
    private fun strictBase64(text: String): ByteArray? {
      if (text.length % 4 != 0) return null
      val padding = text.length - text.trimEnd('=').length
      if (padding > 2) return null
      for (index in 0 until text.length - padding) {
        val char = text[index]
        if (!(char in 'A'..'Z' || char in 'a'..'z' || char in '0'..'9' || char == '+' || char == '/')) return null
      }
      return text.decodeBase64()?.toByteArray()
    }
  }
}
