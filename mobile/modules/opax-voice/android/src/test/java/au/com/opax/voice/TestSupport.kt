package au.com.opax.voice

import java.io.BufferedInputStream
import java.io.ByteArrayOutputStream
import java.io.Closeable
import java.io.InputStream
import java.net.InetAddress
import java.net.ServerSocket
import java.net.Socket
import java.util.UUID
import java.util.concurrent.CountDownLatch
import java.util.concurrent.TimeUnit
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import kotlinx.coroutines.runBlocking
import okhttp3.HttpUrl
import okio.Buffer
import org.json.JSONArray
import org.json.JSONObject
import org.junit.After
import org.junit.Assert.assertTrue
import org.junit.Assert.fail
import org.junit.Before
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

/**
 * Swift's VoiceTestSafety for these tests: every client and transport request
 * passes the installed guard, which refuses any host but 127.0.0.1. The
 * cumulative monitor is never reset; negative tests use an isolated one.
 */
object VoiceTestGuard {
  class Monitor(private val loopbackOnly: Boolean = true) {
    private val hosts = mutableSetOf<String>()
    fun validate(url: HttpUrl) = synchronized(this) {
      hosts += url.host
      if (loopbackOnly && (url.host != "127.0.0.1" || url.username.isNotEmpty() || url.password.isNotEmpty())) {
        throw VoiceException(VoiceFailure.forbidden)
      }
    }
    fun audit() = synchronized(this) { Audit(hosts.toSet()) }
  }
  data class Audit(val hosts: Set<String>) {
    val isClean get() = hosts.all { it == "127.0.0.1" }
  }
  private val shared = Monitor()
  @Volatile var isolated: Monitor? = null

  fun install() {
    TransportGuard.installed = TransportGuard { url -> (isolated ?: shared).validate(url) }
  }
  fun cumulativeAudit() = shared.audit()
  fun <T> isolated(block: (Monitor) -> T): T {
    val monitor = Monitor(); isolated = monitor
    try {
      return block(monitor)
    } finally {
      isolated = null
    }
  }
}

@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34])
abstract class SafeVoiceTestCase {
  @Before fun installLoopbackOnly() = VoiceTestGuard.install()

  @After fun auditHosts() {
    assertTrue("Unapproved host attempt recorded", VoiceTestGuard.cumulativeAudit().isClean)
  }
}

const val fixtureID = "11111111-1111-4111-8111-111111111111"
val fixtureToken = "f".repeat(43)
const val distantFuture = 64092211200.0 // as Date.distantFuture
const val distantPast = -62135769600.0

fun json(value: Any?): ByteArray = when (value) {
  is Map<*, *> -> jsonObject(value).toString()
  is List<*> -> JSONArray(value.map(::jsonValue)).toString()
  else -> error("JSON object or array")
}.toByteArray()

fun jsonObject(map: Map<*, *>): JSONObject = JSONObject().apply {
  for ((key, value) in map) put(key as String, jsonValue(value))
}
private fun jsonValue(value: Any?): Any? = when (value) {
  null -> JSONObject.NULL
  is Map<*, *> -> jsonObject(value)
  is List<*> -> JSONArray(value.map(::jsonValue))
  else -> value
}
fun parse(bytes: ByteArray): Map<String, Any?> = toMap(JSONObject(String(bytes)))
private fun toMap(json: JSONObject): Map<String, Any?> = json.keys().asSequence().associateWith { key ->
  when (val value = json.get(key)) {
    JSONObject.NULL -> null
    is JSONObject -> toMap(value)
    else -> value
  }
}

private fun resource(name: String): JSONObject =
  JSONObject(SafeVoiceTestCase::class.java.classLoader!!.getResourceAsStream("fixtures/$name")!!.readBytes().decodeToString())

/** The generated Worker status shapes, as Swift's `signedStatus`. */
fun signedStatus(
  remaining: Long = 600,
  active: String? = null,
  unlimited: Boolean = false,
  budget: Boolean? = null,
  signedIn: Boolean = true,
  enabled: Boolean = true,
): ByteArray {
  val shapes = resource("worker-status.json").getJSONObject("shapes")
  val name = when {
    !signedIn -> if (enabled) "signedOut" else "disabledSignedOut"
    unlimited -> "unlimited"
    active != null -> "openSession"
    else -> "allowance"
  }
  val body = JSONObject(shapes.getJSONObject(name).toString())
  body.put("enabled", enabled); body.put("remaining_seconds", remaining)
  if (active != null) {
    val open = JSONObject(shapes.getJSONObject("openSession").getJSONObject("active_session").toString())
    open.put("state", active); open.put("expires_at", System.currentTimeMillis() / 1000.0 + 20)
    body.put("active_session", open)
  }
  if (budget != null) body.put("budget_open", budget) // approved W8 extension, not present in current Worker
  return body.toString().toByteArray()
}
fun statusShapes(): Map<String, ByteArray> = resource("worker-status.json").getJSONObject("shapes").let { shapes ->
  shapes.keys().asSequence().associateWith { shapes.getJSONObject(it).toString().toByteArray() }
}
fun deletionShapeNames(): List<String> = resource("worker-deletion.json").getJSONObject("shapes").keys().asSequence().sorted().toList()
fun deletionResponse(name: String): HttpResponse {
  val shape = resource("worker-deletion.json").getJSONObject("shapes").getJSONObject(name)
  val headers = shape.getJSONObject("headers").let { h -> h.keys().asSequence().associateWith { h.getString(it) } }
  return HttpResponse(shape.getInt("status"), headers, shape.get("body").toString().toByteArray())
}

fun eventually(timeoutSeconds: Double = 4.0, predicate: suspend () -> Boolean) = runBlocking {
  val deadline = System.nanoTime() + (timeoutSeconds * 1e9).toLong()
  while (!predicate()) {
    if (System.nanoTime() > deadline) fail("Timed out waiting for fixture")
    delay(10)
  }
}

/** One request as it arrived on the loopback socket. */
class Received(val method: String, val target: String, val headers: List<Pair<String, String>>, val body: ByteArray) {
  val path: String get() = target.substringBefore('?')
  val route: AuthRoute? get() = AuthRoute.fromPath(path)
  fun headers(name: String) = headers.filter { it.first.equals(name, ignoreCase = true) }.map { it.second }
  fun header(name: String) = headers(name).singleOrNull()
  fun json() = parse(body)
}

/**
 * A real loopback HTTP/1.1 server with Swift's FixtureHTTP behaviour: each
 * route's default Worker shape, per-route overrides, a paused route or status
 * read, and a transport failure (the socket closes with no response).
 */
class FixtureServer : Closeable {
  private val server = ServerSocket(0, 50, InetAddress.getByName("127.0.0.1"))
  val port: Int get() = server.localPort
  private val lock = Object()
  private val received = mutableListOf<Received>()
  private val responses = mutableMapOf<AuthRoute, HttpResponse>()
  private var statusBody = signedStatus()
  private var startResponse: HttpResponse? = null
  private var statusAfterStart: ByteArray? = null
  private var throwOnSend = false
  private var delayStatus = false
  private var statusGate: CountDownLatch? = null
  private var delayedRoute: AuthRoute? = null
  private var responseGate: CountDownLatch? = null
  /** Answers first; null falls through to the Worker routes. */
  @Volatile var handler: ((Received) -> HttpResponse?)? = null
  @Volatile var accepted = 0; private set
  private val sockets = mutableListOf<Socket>()
  private val acceptor = Thread {
    while (!server.isClosed) {
      val socket = try {
        server.accept()
      } catch (_: Exception) {
        break
      }
      synchronized(lock) { accepted++; sockets += socket }
      Thread { serve(socket) }.apply { isDaemon = true }.start()
    }
  }.apply { isDaemon = true; start() }

  val requests: List<Received> get() = synchronized(lock) { received.toList() }
  fun count(route: AuthRoute) = requests.count { it.route == route }
  fun configure(status: ByteArray? = null, start: HttpResponse? = null, statusAfterStart: ByteArray? = null) = synchronized(lock) {
    if (status != null) statusBody = status
    startResponse = start; this.statusAfterStart = statusAfterStart
  }
  fun setResponse(route: AuthRoute, response: HttpResponse) = synchronized(lock) { responses[route] = response }
  fun failTransport() = synchronized(lock) { throwOnSend = true }
  fun pauseResponse(route: AuthRoute) = synchronized(lock) { delayedRoute = route; responseGate = CountDownLatch(1) }
  fun resumeResponse() = synchronized(lock) { responseGate?.countDown(); delayedRoute = null }
  fun pauseNextStatus() = synchronized(lock) { delayStatus = true; statusGate = CountDownLatch(1) }
  fun resumeStatus() = synchronized(lock) { statusGate?.countDown() }
  @Volatile var responseWaiting = false; private set
  @Volatile var statusWaiting = false; private set

  private fun respond(request: Received): HttpResponse? {
    handler?.invoke(request)?.let { return it }
    val route = request.route ?: return HttpResponse(404, body = ByteArray(0))
    val (override, gate) = synchronized(lock) {
      responses[route] to (if (delayedRoute == route) responseGate else null)
    }
    if (override != null) {
      if (gate != null) {
        responseWaiting = true; gate.await(10, TimeUnit.SECONDS); responseWaiting = false
      }
      return override
    }
    return when (route) {
      AuthRoute.voiceStatus -> {
        val (body, wait) = synchronized(lock) {
          val body = if (request.header("Cookie") == null) signedStatus(signedIn = false) else statusBody
          val wait = if (delayStatus) statusGate else null
          delayStatus = false
          body to wait
        }
        if (wait != null) {
          statusWaiting = true; wait.await(10, TimeUnit.SECONDS); statusWaiting = false
        }
        HttpResponse(200, body = body)
      }
      AuthRoute.voiceStart -> synchronized(lock) {
        startResponse?.let { start ->
          val failure = APIFailure.decode(start, AuthRoute.voiceStart).failure
          statusAfterStart?.let { statusBody = it }
          if (failure == VoiceFailure.budgetClosed) statusBody = signedStatus(budget = false)
          if (failure == VoiceFailure.callOpen) statusBody = signedStatus(active = "active")
          return start
        }
        val id = UUID.randomUUID().toString()
        HttpResponse(201, body = json(mapOf("session_id" to id, "transport" to "websocket",
          "signed_url" to "ws://127.0.0.1:$port/api/voice/connect?session_id=$id",
          "remaining_seconds" to 600, "expires_at" to System.currentTimeMillis() / 1000.0 + 60)))
      }
      AuthRoute.voiceFinish -> HttpResponse(200, body = signedStatus(remaining = 1)) // must never supply displayed allowance
      AuthRoute.communityStatus -> HttpResponse(200, body = json(mapOf("enabled" to true, "member" to mapOf("id" to "fixture"))))
      AuthRoute.requestCode -> HttpResponse(200, body = json(mapOf("sent" to true, "challenge_id" to "fixture-challenge")))
      AuthRoute.consumeCode -> HttpResponse(200,
        mapOf("Set-Cookie" to "__Host-opax_session=$fixtureToken; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=2592000"),
        json(mapOf("signed_in" to true)))
      AuthRoute.logout -> {
        synchronized(lock) { statusBody = signedStatus(signedIn = false) }
        HttpResponse(200, body = json(mapOf("signed_out" to true)))
      }
      // An explicit Worker fixture is required for deletion; the socket stays silent.
      AuthRoute.deletionCode, AuthRoute.deleteAccount, AuthRoute.voiceConnect -> null
    }
  }

  private fun serve(socket: Socket): Unit = socket.use {
    val input = BufferedInputStream(socket.getInputStream())
    val head = readHead(input) ?: return
    val lines = head.split("\r\n")
    val (method, target) = lines[0].split(" ").let { it[0] to it[1] }
    val headers = lines.drop(1).filter { ':' in it }.map { it.substringBefore(':') to it.substringAfter(':').trim() }
    val length = headers.firstOrNull { it.first.equals("Content-Length", true) }?.second?.toInt() ?: 0
    val body = ByteArray(length).also { var read = 0; while (read < length) read += input.read(it, read, length - read) }
    val request = Received(method, target, headers, body)
    val failing = synchronized(lock) { received += request; throwOnSend }
    if (failing) return
    val response = respond(request) ?: return
    val out = ByteArrayOutputStream()
    out.write("HTTP/1.1 ${response.status} Fixture\r\n".toByteArray())
    for ((name, value) in response.headers) {
      if (!name.equals("Content-Length", true)) out.write("$name: $value\r\n".toByteArray())
    }
    out.write("Content-Length: ${response.body.size}\r\nConnection: close\r\n\r\n".toByteArray())
    out.write(response.body)
    socket.getOutputStream().apply { write(out.toByteArray()); flush() }
    Unit
  }

  private fun readHead(input: InputStream): String? {
    val buffer = ByteArrayOutputStream()
    while (true) {
      val byte = input.read()
      if (byte < 0 || buffer.size() > 16384) return null
      buffer.write(byte)
      val bytes = buffer.toByteArray()
      if (bytes.size >= 4 && String(bytes, bytes.size - 4, 4) == "\r\n\r\n") return String(bytes, 0, bytes.size - 4)
    }
  }

  override fun close() {
    resumeResponse(); resumeStatus()
    server.close()
    synchronized(lock) { sockets.forEach { runCatching { it.close() } } }
    acceptor.join(1000)
  }
}

/** Records the core's events, as Swift's EventRecorder. */
class EventRecorder(core: VoiceCore) {
  private val scope = CoroutineScope(SupervisorJob() + Dispatchers.Default)
  private val list = mutableListOf<VoiceEvent>()
  init {
    scope.launch { core.events.collect { synchronized(list) { list += it } } }
  }
  val items: List<VoiceEvent> get() = synchronized(list) { list.toList() }
  fun hasError(failure: VoiceFailure) = VoiceEvent.Error(failure) in items
  fun cancel() = scope.cancel()
}

class Rig private constructor(
  val server: FixtureServer,
  val store: InMemoryCredentialStore,
  val client: VoiceHttpClient,
  val core: AccountVoiceCore,
  val recorder: EventRecorder,
) : Closeable {
  val policy get() = client.policy
  override fun close() {
    runBlocking { core.shutdown() }
    recorder.cancel(); server.close()
  }

  companion object {
    fun make(clock: VoiceClock = SystemVoiceClock, timing: StatusPollTiming = StatusPollTiming()): Rig {
      val server = FixtureServer()
      val store = InMemoryCredentialStore()
      store.write(SessionCredential(fixtureToken, System.currentTimeMillis() / 1000.0 + 100))
      val policy = RoutePolicy.loopback(server.port)
      val client = VoiceHttpClient(policy, store, OkHttpTransport(policy), clock)
      val core = AccountVoiceCore(client, clock, timing)
      return Rig(server, store, client, core, EventRecorder(core))
    }
  }
}

fun bodyText(request: okhttp3.Request): String? = request.body?.let { body -> Buffer().also(body::writeTo).readUtf8() }

inline fun <reified E : Throwable> assertThrows(block: () -> Unit): E {
  try {
    block()
  } catch (error: Throwable) {
    if (error is E) return error
    throw AssertionError("Expected ${E::class.simpleName}, got $error")
  }
  throw AssertionError("Expected ${E::class.simpleName}")
}
