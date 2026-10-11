package au.com.opax.voice.call

import au.com.opax.voice.*

import java.io.IOException
import java.util.UUID
import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.channels.Channel
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.receiveAsFlow
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import kotlinx.coroutines.runBlocking
import okhttp3.Request
import org.junit.After
import org.junit.Assert.assertTrue
import org.junit.Assert.fail
import org.junit.Before
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config
import kotlinx.coroutines.currentCoroutineContext
import kotlinx.coroutines.ensureActive

/**
 * Every test runs under the loopback-only guard; the cumulative audit must stay
 * clean. Robolectric supplies Android's org.json, which the account half decodes with.
 */
@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34])
abstract class SafeVoiceTest {
  @Before fun installGuard() { VoiceTestSafety.installLoopbackOnly() }

  @After fun auditGuard() {
    assertTrue("Unapproved audio-open or host attempt recorded", VoiceTestSafety.cumulativeAudit().isClean)
  }
}

fun test(block: suspend CoroutineScope.() -> Unit) = runBlocking { block() }

/** Sorted-key JSON, as the iOS tests write fixtures with JSONSerialization. */
fun json(value: Any?): ByteArray = jsonText(value).encodeToByteArray()

fun jsonText(value: Any?): String = when (value) {
  null -> "null"
  is String -> JsonValue.quote(value)
  is Boolean, is Int, is Long -> value.toString()
  is Double -> if (value % 1.0 == 0.0 && kotlin.math.abs(value) < 1e15) value.toLong().toString() else value.toString()
  is Map<*, *> -> value.entries.sortedBy { it.key as String }
    .joinToString(",", "{", "}") { "${JsonValue.quote(it.key as String)}:${jsonText(it.value)}" }
  is List<*> -> value.joinToString(",", "[", "]") { jsonText(it) }
  else -> error("Unsupported fixture value")
}

/** Back to plain fixture maps, for reading and editing a JSON body in a test. */
internal fun plain(value: JsonValue): Any? = when (value) {
  is JsonValue.Obj -> value.values.mapValues { plain(it.value) }
  is JsonValue.Arr -> value.items.map { plain(it) }
  is JsonValue.Str -> value.value
  is JsonValue.Num -> value.value
  is JsonValue.Real -> value.value
  is JsonValue.Bool -> value.value
  JsonValue.Null -> null
}

@Suppress("UNCHECKED_CAST")
fun bodyMap(data: ByteArray) = plain(JsonValue.parse(data)) as Map<String, Any?>

const val fixtureId = "11111111-1111-4111-8111-111111111111"
val fixtureToken = "f".repeat(43)
fun epochSeconds() = System.currentTimeMillis() / 1000.0

@Suppress("UNCHECKED_CAST")
val workerShapes: Map<String, Map<String, Any?>> by lazy {
  val data = SafeVoiceTest::class.java.getResourceAsStream("/fixtures/worker-status.json")!!.readBytes()
  bodyMap(data)["shapes"] as Map<String, Map<String, Any?>>
}

@Suppress("UNCHECKED_CAST")
fun signedStatus(
  remaining: Int = 600, active: String? = null, unlimited: Boolean = false,
  budget: Boolean? = null, signedIn: Boolean = true, enabled: Boolean = true,
): ByteArray {
  val name = if (!signedIn) (if (enabled) "signedOut" else "disabledSignedOut")
  else if (unlimited) "unlimited" else if (active != null) "openSession" else "allowance"
  val body = workerShapes.getValue(name).toMutableMap()
  body["enabled"] = enabled
  body["remaining_seconds"] = remaining
  if (active != null) {
    val open = (workerShapes.getValue("openSession")["active_session"] as Map<String, Any?>).toMutableMap()
    open["state"] = active
    open["expires_at"] = epochSeconds() + 20
    body["active_session"] = open
  }
  if (budget != null) body["budget_open"] = budget // approved W8 extension, not present in current Worker
  return json(body)
}

/**
 * The iOS FixtureHTTP transport behind the real VoiceHttpClient: canned Worker
 * shapes per route, pausable responses and a request log. Every request
 * passes the loopback guard first.
 */
class FixtureHttp(val port: Int = 8901) : HttpTransport {
  private val lock = Any()
  private var statusBody = signedStatus()
  private var startResponse: HttpResponse? = null
  private var statusAfterStart: ByteArray? = null
  private var throwOnSend = false
  private val responses = mutableMapOf<AuthRoute, HttpResponse>()
  private val log = mutableListOf<AuthRoute>()
  private var delayStatus = false
  @Volatile var statusWaiter: CompletableDeferred<Unit>? = null
  private var delayedRoute: AuthRoute? = null
  @Volatile var responseWaiter: CompletableDeferred<Unit>? = null
  private var delayStart = false
  private var startWaiter: CompletableDeferred<Unit>? = null

  val requests: List<AuthRoute> get() = synchronized(lock) { log.toList() }
  fun count(route: AuthRoute) = synchronized(lock) { log.count { it == route } }

  fun configure(status: ByteArray? = null, start: HttpResponse? = null, statusAfterStart: ByteArray? = null) = synchronized(lock) {
    if (status != null) statusBody = status
    startResponse = start
    this.statusAfterStart = statusAfterStart
  }
  fun setResponse(route: AuthRoute, response: HttpResponse) = synchronized(lock) { responses[route] = response }
  fun pauseResponse(route: AuthRoute) = synchronized(lock) { delayedRoute = route }
  fun resumeResponse() = synchronized(lock) { responseWaiter?.complete(Unit); responseWaiter = null; delayedRoute = null }
  fun pauseNextStatus() = synchronized(lock) { delayStatus = true }
  fun resumeStatus() = synchronized(lock) { statusWaiter?.complete(Unit); statusWaiter = null }
  fun pauseStart() = synchronized(lock) { delayStart = true }
  fun resumeStart() = synchronized(lock) { delayStart = false; startWaiter?.complete(Unit); startWaiter = null }
  fun failTransport() = synchronized(lock) { throwOnSend = true }

  override suspend fun send(request: Request): HttpResponse {
    currentCoroutineContext().ensureActive()
    VoiceTestSafety.validate(request.url)
    var gate: CompletableDeferred<Unit>? = null
    val route = AuthRoute.fromPath(request.url.encodedPath) ?: throw VoiceException(VoiceFailure.forbidden)
    val immediate = synchronized(lock) {
      log += route
      if (throwOnSend) throw IOException("Synthetic offline transport")
      responses[route]?.let {
        if (delayedRoute == route) gate = CompletableDeferred<Unit>().also { waiter -> responseWaiter = waiter }
        return@synchronized it
      }
      when (route) {
        AuthRoute.voiceStatus -> {
          val body = if (request.header("Cookie") == null) signedStatus(signedIn = false) else statusBody
          if (delayStatus) { delayStatus = false; gate = CompletableDeferred<Unit>().also { statusWaiter = it } }
          HttpResponse(200, body = body)
        }
        AuthRoute.voiceStart -> {
          if (delayStart) gate = CompletableDeferred<Unit>().also { startWaiter = it }
          null
        }
        // Must never supply the displayed allowance.
        AuthRoute.voiceFinish -> HttpResponse(200, body = signedStatus(remaining = 1))
        AuthRoute.communityStatus -> HttpResponse(200, body = json(mapOf("enabled" to true, "member" to mapOf("id" to "fixture"))))
        AuthRoute.requestCode -> HttpResponse(200, body = json(mapOf("sent" to true, "challenge_id" to "fixture-challenge")))
        AuthRoute.consumeCode -> HttpResponse(
          200,
          mapOf("Set-Cookie" to "__Host-opax_session=$fixtureToken; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=2592000"),
          json(mapOf("signed_in" to true)),
        )
        AuthRoute.logout -> { statusBody = signedStatus(signedIn = false); HttpResponse(200, body = json(mapOf("signed_out" to true))) }
        AuthRoute.deletionCode, AuthRoute.deleteAccount -> throw VoiceException(VoiceFailure.invalidResponse) // explicit Worker fixture required
        AuthRoute.voiceConnect -> throw VoiceException(VoiceFailure.forbidden)
      }
    }
    gate?.await()
    if (immediate != null) return immediate
    return synchronized(lock) {
      startResponse?.let { start ->
        val failure = APIFailure.decode(start, AuthRoute.voiceStart).failure
        statusAfterStart?.let { statusBody = it }
        if (failure == VoiceFailure.budgetClosed) statusBody = signedStatus(budget = false)
        if (failure == VoiceFailure.callOpen) statusBody = signedStatus(active = "active")
        return@synchronized start
      }
      val id = UUID.randomUUID().toString()
      HttpResponse(
        201,
        body = json(
          mapOf(
            "session_id" to id, "transport" to "websocket",
            "signed_url" to "ws://127.0.0.1:$port/api/voice/connect?session_id=$id",
            "remaining_seconds" to 600, "expires_at" to epochSeconds() + 60,
          ),
        ),
      )
    }
  }
}

class FakeAudioEngine : VoiceAudioEngine, VoiceEngineFactory {
  private val lock = Any()
  private val captures = ArrayDeque<CaptureBuffer>()
  private val playedBuffers = mutableListOf<FloatArray>()
  private var captureWaiter: CompletableDeferred<CaptureBuffer?>? = null
  private val playbackWaiters = mutableListOf<Pair<Int, CompletableDeferred<Unit>>>()
  private var acceptedPlaybackEpoch = 0
  var queued = 0; private set
  var starts = 0; private set
  var stops = 0; private set
  var flushes = 0; private set
  var routes = 0; private set
  var maxQueued = 0; private set
  var captureReads = 0; private set
  var muted = false; private set
  private var failStart = false
  private var failRoute = false
  private var meter = AudioLevels.silent

  val played get() = synchronized(lock) { playedBuffers.toList() }
  val hasCaptureWaiter get() = synchronized(lock) { captureWaiter != null }

  override suspend fun make(): VoiceAudioEngine = this
  override suspend fun levels() = synchronized(lock) { meter }
  fun setMeter(value: AudioLevels) = synchronized(lock) { meter = value }

  override suspend fun start(input: AudioFormat, output: AudioFormat) = synchronized(lock) {
    acceptedPlaybackEpoch = 0
    starts += 1
    if (failStart) throw VoiceException(VoiceFailure.audio)
  }

  override suspend fun capture(): CaptureBuffer? {
    val waiter = synchronized(lock) {
      captureReads += 1
      captures.removeFirstOrNull()?.let { return it }
      CompletableDeferred<CaptureBuffer?>().also { captureWaiter = it }
    }
    try { return waiter.await() } finally { synchronized(lock) { if (captureWaiter === waiter) captureWaiter = null } }
  }

  fun feed(capture: CaptureBuffer) = synchronized(lock) {
    val waiter = captureWaiter
    if (waiter != null) { captureWaiter = null; waiter.complete(capture) } else captures.addLast(capture)
  }

  override suspend fun schedule(samples: FloatArray, rate: Int, playbackEpoch: Int) = synchronized(lock) {
    if (playbackEpoch != acceptedPlaybackEpoch) return@synchronized
    playedBuffers += samples
    queued += samples.size
    maxQueued = maxOf(maxQueued, queued)
  }

  override suspend fun waitForPlayback(atMostSamples: Int) {
    val waiter = synchronized(lock) {
      if (queued <= atMostSamples) return
      CompletableDeferred<Unit>().also { playbackWaiters += atMostSamples to it }
    }
    waiter.await()
  }

  private fun wakePlayback() {
    val ready = playbackWaiters.filter { queued <= it.first }
    playbackWaiters.removeAll { queued <= it.first }
    ready.forEach { it.second.complete(Unit) }
  }

  override suspend fun queuedSamples() = synchronized(lock) { queued }

  override suspend fun flush(playbackEpoch: Int) = synchronized(lock) {
    acceptedPlaybackEpoch = maxOf(acceptedPlaybackEpoch, playbackEpoch)
    flushes += 1
    queued = 0
    wakePlayback()
  }

  fun drainPlayback() = synchronized(lock) { queued = 0; wakePlayback() }

  override suspend fun setMuted(muted: Boolean) = synchronized(lock) { this.muted = muted }

  override suspend fun reconfigure() = synchronized(lock) {
    routes += 1
    if (failRoute) throw VoiceException(VoiceFailure.audio)
    queued = 0
    wakePlayback()
  }

  override suspend fun stop() = synchronized(lock) {
    acceptedPlaybackEpoch += 1
    stops += 1
    queued = 0
    wakePlayback()
    captureWaiter?.complete(null)
    captureWaiter = null
  }

  fun fail(start: Boolean = false, route: Boolean = false) = synchronized(lock) { failStart = start; failRoute = route }
}

class FakePermission : MicrophonePermission {
  @Volatile var allowed = true
  @Volatile var count = 0; private set
  private var paused = false
  private var waiter: CompletableDeferred<Unit>? = null

  override suspend fun request(): Boolean {
    val gate = synchronized(this) {
      count += 1
      if (paused) CompletableDeferred<Unit>().also { waiter = it } else null
    }
    gate?.await()
    return allowed
  }

  fun pause() = synchronized(this) { paused = true }
  fun resume() = synchronized(this) { paused = false; waiter?.complete(Unit); waiter = null }
}

class FakeConsent : VoiceConsent {
  @Volatile var granted = true
  override suspend fun isGranted() = granted
}

class FakeSession : VoiceAudioSession {
  @Volatile var activations = 0; private set
  @Volatile var deactivations = 0; private set
  @Volatile var awake = false; private set
  @Volatile private var fails = false

  override suspend fun activate() {
    activations += 1
    if (fails) throw VoiceException(VoiceFailure.audio)
  }
  override suspend fun deactivate() { deactivations += 1 }
  override suspend fun keepAwake(enabled: Boolean) { awake = enabled }
  fun fail() { fails = true }
}

class FakeLifecycle : VoiceLifecycle {
  private val channel = Channel<LifecycleEvent>(Channel.UNLIMITED)
  override val events: Flow<LifecycleEvent> = channel.receiveAsFlow()
  fun emit(event: LifecycleEvent) { channel.trySend(event) }
}

class InMemoryRelay : RelayTransport, RelayFactory {
  private val lock = Any()
  private val sent = mutableListOf<ByteArray>()
  private val incoming = ArrayDeque<RelayMessage>()
  private var waiter: CompletableDeferred<RelayMessage>? = null
  var connects = 0; private set
  var closes = 0; private set
  var receives = 0; private set
  private var stalledAudio = false
  private var audioWaiter: CompletableDeferred<Unit>? = null
  private var connectError: APIFailure? = null
  private var stalledHandshake = false
  private var handshakeWaiter: CompletableDeferred<Unit>? = null

  val messages get() = synchronized(lock) { sent.toList() }
  val handshakeWaiting get() = synchronized(lock) { handshakeWaiter != null }

  override suspend fun connect(request: Request): RelayTransport = synchronized(lock) {
    VoiceTestSafety.validate(request)
    connects += 1
    connectError?.let { throw it }
    this
  }

  override suspend fun send(data: ByteArray) {
    val text = data.decodeToString()
    val gate = synchronized(lock) {
      sent += data
      when {
        stalledHandshake && "conversation_initiation_client_data" in text -> CompletableDeferred<Unit>().also { handshakeWaiter = it }
        stalledAudio && "user_audio_chunk" in text -> CompletableDeferred<Unit>().also { audioWaiter = it }
        else -> null
      }
    }
    gate?.await()
  }

  override suspend fun receive(): RelayMessage {
    val pending = synchronized(lock) {
      receives += 1
      incoming.removeFirstOrNull()?.let { return it }
      CompletableDeferred<RelayMessage>().also { waiter = it }
    }
    try { return pending.await() } finally { synchronized(lock) { if (waiter === pending) waiter = null } }
  }

  fun enqueue(message: RelayMessage) = synchronized(lock) {
    val current = waiter
    if (current != null) { waiter = null; current.complete(message) } else incoming.addLast(message)
  }

  fun enqueue(data: ByteArray) = enqueue(RelayMessage.Data(data))

  fun metadata(input: String? = "pcm_16000", output: String = "pcm_16000") {
    val event = mutableMapOf<String, Any?>("agent_output_audio_format" to output)
    if (input != null) event["user_input_audio_format"] = input
    enqueue(json(mapOf("type" to "conversation_initiation_metadata", "conversation_initiation_metadata_event" to event)))
  }

  override suspend fun close(code: Int) = synchronized(lock) {
    closes += 1
    waiter?.complete(RelayMessage.Closed(RelayClose(code)))
    waiter = null
    audioWaiter?.completeExceptionally(VoiceException(VoiceFailure.network))
    audioWaiter = null
    handshakeWaiter?.completeExceptionally(VoiceException(VoiceFailure.network))
    handshakeWaiter = null
  }

  fun stallAudio() = synchronized(lock) { stalledAudio = true }
  fun pauseHandshake() = synchronized(lock) { stalledHandshake = true }
  fun resumeHandshake() = synchronized(lock) { stalledHandshake = false; handshakeWaiter?.complete(Unit); handshakeWaiter = null }
  fun refuse(failure: APIFailure) = synchronized(lock) { connectError = failure }
}

class EventRecorder {
  private val events = mutableListOf<VoiceEvent>()
  val items get() = synchronized(this) { events.toList() }
  fun record(event: VoiceEvent) = synchronized(this) { events += event }
  fun hasError(failure: VoiceFailure) = VoiceEvent.Error(failure) in items
  operator fun contains(event: VoiceEvent) = event in items
}

class Rig private constructor(
  val http: FixtureHttp, val client: VoiceHttpClient, val store: InMemoryCredentialStore, val engine: FakeAudioEngine, val relay: InMemoryRelay, val permission: FakePermission,
  val session: FakeSession, val consent: FakeConsent, val lifecycle: FakeLifecycle,
  val controller: VoiceCallController, val recorder: EventRecorder, private val recording: Job,
) {
  suspend fun close() {
    controller.shutdown()
    recording.cancel()
  }

  suspend fun live() {
    relay.metadata()
    controller.start()
    eventually { controller.state == CallState.live }
  }

  companion object {
    fun make(
      relays: RelayFactory? = null, port: Int = 8901, timing: CallTiming = CallTiming(),
      clock: VoiceClock = SystemVoiceClock, storedConsent: VoiceConsent? = null, engines: VoiceEngineFactory? = null,
    ): Rig {
      val http = FixtureHttp(port)
      val store = InMemoryCredentialStore()
      store.write(SessionCredential(fixtureToken, epochSeconds() + 100))
      val client = VoiceHttpClient(RoutePolicy.loopback(port), store, http, clock)
      val engine = FakeAudioEngine()
      val relay = InMemoryRelay()
      val permission = FakePermission()
      val session = FakeSession()
      val consent = FakeConsent()
      val lifecycle = FakeLifecycle()
      val controller = VoiceCallController(
        client, relays ?: relay, engines ?: engine, permission, storedConsent ?: consent, session, lifecycle, clock, timing,
      )
      val recorder = EventRecorder()
      val recording = CoroutineScope(Dispatchers.Default).launch { controller.events.collect { recorder.record(it) } }
      return Rig(http, client, store, engine, relay, permission, session, consent, lifecycle, controller, recorder, recording)
    }
  }
}

/** Accelerated whole seconds; sub-second sleeps stay real. */
object ScaledClock : VoiceClock {
  override fun now() = epochSeconds()
  override suspend fun sleep(seconds: Double) = delay(((if (seconds >= 1) seconds * 0.01 else seconds) * 1000).toLong())
}

suspend fun eventually(timeout: Double = 4.0, predicate: suspend () -> Boolean) {
  // Coroutine frames lose the caller's line after a suspension; record it now.
  val site = Throwable().stackTrace.firstOrNull { it.className.contains("Tests") }
  val deadline = System.nanoTime() + (timeout * 1e9).toLong()
  while (!predicate()) {
    if (System.nanoTime() > deadline) fail("Timed out waiting for fixture at ${site?.fileName}:${site?.lineNumber}")
    delay(10)
  }
}

fun audioEvent(id: Int, samples: FloatArray, format: String = "pcm_16000") = json(
  mapOf("type" to "audio", "audio_event" to mapOf("event_id" to id, "audio_base_64" to java.util.Base64.getEncoder().encodeToString(AudioCodec.encode(samples, AudioFormat(format))))),
)
