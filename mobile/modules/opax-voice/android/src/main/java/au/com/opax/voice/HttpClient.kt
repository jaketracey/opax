@file:Suppress("EnumEntryName")

package au.com.opax.voice

import java.io.IOException
import java.io.InterruptedIOException
import java.net.InetSocketAddress
import java.net.Proxy
import java.util.concurrent.TimeUnit
import kotlin.coroutines.cancellation.CancellationException
import kotlin.coroutines.resume
import kotlin.coroutines.resumeWithException
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.NonCancellable
import kotlinx.coroutines.currentCoroutineContext
import kotlinx.coroutines.ensureActive
import kotlinx.coroutines.suspendCancellableCoroutine
import kotlinx.coroutines.withContext
import okhttp3.Call
import okhttp3.Callback
import okhttp3.Connection
import okhttp3.CookieJar
import okhttp3.EventListener
import okhttp3.HttpUrl
import okhttp3.HttpUrl.Companion.toHttpUrl
import okhttp3.HttpUrl.Companion.toHttpUrlOrNull
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody
import okhttp3.RequestBody.Companion.toRequestBody
import okhttp3.Response
import org.json.JSONObject

enum class AuthRoute(val path: String, val method: String) {
  voiceStatus("/api/voice/status", "GET"),
  voiceStart("/api/voice/start", "POST"),
  voiceConnect("/api/voice/connect", "GET"),
  voiceFinish("/api/voice/finish", "POST"),
  communityStatus("/api/community/status", "GET"),
  requestCode("/api/community/auth/request", "POST"),
  consumeCode("/api/community/auth/consume-code", "POST"),
  logout("/api/community/auth/logout", "POST"),
  deletionCode("/api/community/account/deletion-code", "POST"),
  deleteAccount("/api/community/account/delete", "POST");

  companion object {
    fun fromPath(path: String) = entries.firstOrNull { it.path == path }
  }
}

/**
 * Every check runs on the [HttpUrl] that is sent. OkHttp represents ws and
 * wss as http and https, so a WebSocket URL is checked with [webSocket] set.
 */
class RoutePolicy internal constructor(val origin: HttpUrl, private val loopback: Boolean) {
  constructor() : this(PRODUCTION, false)

  init {
    require(!loopback || origin.host in LOOPBACK_HOSTS) { "Loopback policy needs a numeric loopback host" }
  }

  /** As Swift's `origin.absoluteString`: scheme and authority, no path. */
  val originString: String =
    "${origin.scheme}://${origin.host}" + if (origin.port == HttpUrl.defaultPort(origin.scheme)) "" else ":${origin.port}"

  internal fun permits(url: HttpUrl, method: String, webSocket: Boolean = false): Boolean {
    if (!webSocket && (permitsCommunity(url, method) || permitsChat(url, method))) return true
    if (url.username.isNotEmpty() || url.password.isNotEmpty() || url.fragment != null ||
      url.host != origin.host || url.port != origin.port
    ) return false
    val route = AuthRoute.fromPath(url.encodedPath) ?: return false
    if (route.method != method || (route == AuthRoute.voiceConnect) != webSocket) return false
    return if (loopback) url.host in LOOPBACK_HOSTS && url.scheme == "http" else url.scheme == "https"
  }

  // Only saved-chat data uses this additional credential-bearing surface.
  // No arbitrary native URL or headers may arrive from JavaScript.
  internal fun permitsChat(url: HttpUrl, method: String): Boolean {
    if (url.username.isNotEmpty() || url.password.isNotEmpty() || url.fragment != null || url.encodedQuery != null ||
      url.host != origin.host || url.port != origin.port || url.scheme != (if (loopback) "http" else "https")
    ) return false
    if (url.encodedPath == "/api/community/chats") return method == "GET"
    return method in setOf("GET", "PUT", "DELETE") && chatPath.matches(url.encodedPath)
  }

  internal fun decorate(original: Request, credential: SessionCredential?, webSocket: Boolean = false): Request {
    val request = original.newBuilder()
    for (key in listOf("Cookie", "Origin", "Sec-WebSocket-Protocol", "X-Opax-Session", "Authorization")) {
      request.removeHeader(key)
    }
    // OkHttp clients here have no cookie jar (see OkHttpTransport.configuration).
    if (!permits(original.url, original.method, webSocket)) return request.build()
    request.header("Origin", "https://opax.com.au")
    if (credential != null) request.header("Cookie", "__Host-opax_session=${credential.token}")
    if (webSocket) request.header("Sec-WebSocket-Protocol", "convai")
    return request.build()
  }

  internal fun validateRelay(reservation: Reservation) {
    val url = webSocketUrl(reservation.signedUrl)
    val ids = url?.encodedQuery.let(::queryItems)?.filter { it.first == "session_id" }
    if (reservation.transport != "websocket" || url == null || !permits(url, "GET", webSocket = true) ||
      !uuid.matches(reservation.sessionId) || ids?.size != 1 || ids[0].second != reservation.sessionId
    ) throw VoiceException(VoiceFailure.invalidResponse)
  }

  companion object {
    private val PRODUCTION = "https://opax.com.au".toHttpUrl()
    /** 10.0.2.2 is the Android emulator's address for the host loopback. */
    internal val LOOPBACK_HOSTS = setOf("127.0.0.1", "10.0.2.2")
    private val chatPath = Regex("/api/community/chats/[A-Za-z0-9_-]{8,64}")
    private val uuid = Regex("[0-9A-Fa-f]{8}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{12}")

    /** CNG metadata and compiled native routes must agree before any I/O. */
    fun productionConfigurationMatches(info: Map<String, Any?>): Boolean {
      if (info["OPAXProductionVoiceEnabled"] != true || info["OPAXVoiceConsentDefault"] != false) return false
      val routes = (info["OPAXVoiceAllowedRoutes"] as? List<*>)?.takeIf { list -> list.all { it is String } } ?: return false
      val expected = AuthRoute.entries.map { it.method + " " + it.path }
      return routes.size == expected.size && routes.toSet() == expected.toSet()
    }

    /** A ws/wss URL as OkHttp's http/https form; any other scheme is refused. */
    internal fun webSocketUrl(raw: String): HttpUrl? = when {
      raw.startsWith("ws://") -> ("http://" + raw.substring(5)).toHttpUrlOrNull()
      raw.startsWith("wss://") -> ("https://" + raw.substring(6)).toHttpUrlOrNull()
      else -> null
    }
  }
}

/**
 * URLComponents.queryItems: split on & and the first =, percent-decode names and
 * values, and never read + as a space. Null when an escape is malformed.
 */
internal fun queryItems(encodedQuery: String?): List<Pair<String, String?>>? {
  if (encodedQuery.isNullOrEmpty()) return emptyList()
  return encodedQuery.split("&").map { item ->
    val split = item.indexOf('=')
    val name = percentDecode(if (split < 0) item else item.substring(0, split)) ?: return null
    val value = if (split < 0) null else percentDecode(item.substring(split + 1)) ?: return null
    name to value
  }
}

private fun percentDecode(text: String): String? {
  if ('%' !in text) return text
  val bytes = java.io.ByteArrayOutputStream()
  var i = 0
  while (i < text.length) {
    if (text[i] == '%') {
      if (i + 2 >= text.length || !isHex(text[i + 1]) || !isHex(text[i + 2])) return null
      bytes.write(text.substring(i + 1, i + 3).toInt(16)); i += 3
    } else {
      val start = i
      while (i < text.length && text[i] != '%') i++
      bytes.write(text.substring(start, i).toByteArray(Charsets.UTF_8))
    }
  }
  return strictUtf8(bytes.toByteArray())
}

private fun isHex(c: Char) = c in '0'..'9' || c in 'a'..'f' || c in 'A'..'F'

class HttpResponse(val status: Int, val headers: Map<String, String> = emptyMap(), val body: ByteArray) {
  internal fun header(name: String) = headers.entries.firstOrNull { it.key.equals(name, ignoreCase = true) }?.value
}

fun interface HttpTransport {
  suspend fun send(request: Request): HttpResponse
}

/**
 * One boundary in front of every transport, real or fake. Unit tests install a
 * loopback-only guard for the whole process and the e2e build allows only its
 * fixture host; production installs nothing.
 */
fun interface TransportGuard {
  /** Throws `VoiceException(forbidden)` to refuse before any I/O. */
  fun validate(url: HttpUrl)

  companion object {
    @Volatile internal var installed: TransportGuard? = null
    internal fun check(url: HttpUrl) {
      installed?.validate(url)
    }
  }
}

enum class ChargeDisposition { released, retained, unknown }

class APIFailure(val status: Int, val failure: VoiceFailure, val charge: ChargeDisposition) : Exception() {
  override val message get() = toString()
  override fun toString() = "APIFailure(status: $status, failure: ${failure.name}, charge: ${charge.name})"
  override fun equals(other: Any?) =
    other is APIFailure && other.status == status && other.failure == failure && other.charge == charge
  override fun hashCode() = listOf(status, failure, charge).hashCode()

  companion object {
    internal fun decode(response: HttpResponse, route: AuthRoute): APIFailure {
      // As a Swift struct decode: one wrongly typed field discards the whole body.
      val body = try {
        decodeObject(response.body).let {
          it.optionalString("error")
          it.optionalString("reason") to it.optionalBoolean("released")
        }
      } catch (_: DecodingException) {
        null
      }
      val deletion = route == AuthRoute.deletionCode || route == AuthRoute.deleteAccount
      val failure = when {
        response.status == 400 && deletion -> VoiceFailure.deletionVerificationFailed
        response.status == 401 -> VoiceFailure.signedOut
        response.status == 409 -> VoiceFailure.callOpen
        response.status == 403 -> VoiceFailure.forbidden // Start is classified using a fresh status in the client.
        response.status == 429 -> when (body?.first) {
          "budget" -> VoiceFailure.budgetClosed
          "capacity" -> VoiceFailure.capacity
          else -> VoiceFailure.rateLimited
        }
        response.status == 503 -> VoiceFailure.unavailable
        else -> VoiceFailure.invalidResponse
      }
      val charge = body?.second?.let { if (it) ChargeDisposition.released else ChargeDisposition.retained }
        ?: ChargeDisposition.unknown
      return APIFailure(response.status, failure, charge)
    }
  }
}

/** The core's classification of any thrown error. */
internal fun voiceFailure(error: Throwable): VoiceFailure = when (error) {
  is APIFailure -> error.failure
  is VoiceException -> error.failure
  is DecodingException -> VoiceFailure.invalidResponse
  is CancellationException -> VoiceFailure.cancelled
  else -> VoiceFailure.network
}

class CredentialRequest internal constructor(val request: Request, internal val credential: SessionCredential?) {
  override fun toString() = "CredentialRequest([redacted])"
}

class CommunityResponse(val status: Int, val body: String)

/** No logging APIs: response content and signed URLs never become diagnostics. */
class VoiceHttpClient(
  internal val policy: RoutePolicy = RoutePolicy(),
  private val store: CredentialStore,
  private val transport: HttpTransport,
  private val clock: VoiceClock = SystemVoiceClock,
) {
  private val lock = Any()
  private val revokedCredentials = mutableListOf<SessionCredential>()

  private fun revoked(value: SessionCredential) = synchronized(lock) { value in revokedCredentials }

  private fun clearCredential(sent: SessionCredential?) {
    if (sent == null) return
    // Keep this one credential blocked even if Keystore deletion fails.
    synchronized(lock) { if (sent !in revokedCredentials) revokedCredentials.add(sent) }
    stored { store.clearIfMatching(sent) }
  }

  /** Store calls, with the store's own failures told apart from the server's. */
  private inline fun <T> stored(block: () -> T): T = try {
    block()
  } catch (fault: CredentialStoreFault) {
    throw fault
  } catch (_: Exception) {
    throw CredentialStoreFault()
  }

  /**
   * Logout and deletion end the session on this device even when the store
   * cannot read or compare its item, and so can never send it again: the
   * sent credential stays blocked and the unreadable item is removed (removal
   * needs no key). The caller then reports the fault.
   */
  private fun discardUnreadable(sent: SessionCredential?) {
    if (sent != null) synchronized(lock) { if (sent !in revokedCredentials) revokedCredentials.add(sent) }
    runCatching { store.clear() }
  }

  /** iOS's order first; a store fault on the way still clears what it can. */
  private inline fun <T> endingSession(sent: () -> SessionCredential?, block: () -> T): T = try {
    block()
  } catch (fault: CredentialStoreFault) {
    discardUnreadable(sent()); throw fault
  }

  private fun credential(): SessionCredential? {
    if (store is KeystoreCredentialStore && store.origin != policy.originString) throw VoiceException(VoiceFailure.forbidden)
    val value = stored { store.read() } ?: return null
    // A stale read/response must never remove a newer revocation block.
    if (revoked(value)) return null
    if (value.expiresAt <= clock.now()) {
      clearCredential(value); return null
    }
    return value
  }

  suspend fun communityRequest(path: String, method: String, body: String?): CommunityResponse = io {
    val url = path.takeIf {
      it.startsWith("/api/community/") && '\\' !in it && '#' !in it && it.none(::isWhitespaceOrNewline)
    }?.let(policy.origin::resolve)
    val size = body?.toByteArray(Charsets.UTF_8)?.size ?: 0
    if (url == null || !policy.permitsCommunity(url, method) ||
      (method == "POST" || method == "PATCH") != (body != null) || size > 16000
    ) throw VoiceException(VoiceFailure.forbidden)
    val sent = credential()
    val name = url.encodedPath.substring(15)
    val publicRead = method == "GET" && (name == "status" || name == "threads" || publicName.matches(name))
    if (!publicRead && sent == null) throw VoiceException(VoiceFailure.signedOut)
    val request = Request.Builder().url(url).method(method, requestBody(method, body))
      .header("Accept", "application/json").build()
    TransportGuard.check(request.url)
    val response = transport.send(policy.decorate(request, sent))
    if (response.status == 401) clearCredential(sent)
    val text = strictUtf8(response.body)
    if (response.status in 300..399 || response.body.size > MAX_BODY || text == null) {
      throw VoiceException(VoiceFailure.invalidResponse)
    }
    CommunityResponse(response.status, text)
  }

  suspend fun chatRequest(path: String, method: String, body: String?): String = io {
    val url = path.takeIf { it.startsWith("/api/community/chats") }?.let(policy.origin::resolve)
    val size = body?.toByteArray(Charsets.UTF_8)?.size ?: 0
    if (url == null || !policy.permitsChat(url, method) || (method == "PUT") != (body != null) || size > 600000) {
      throw VoiceException(VoiceFailure.forbidden)
    }
    val sent = credential() ?: throw VoiceException(VoiceFailure.signedOut)
    val request = Request.Builder().url(url).method(method, requestBody(method, body))
      .header("Accept", "application/json").build()
    TransportGuard.check(request.url)
    val response = transport.send(policy.decorate(request, sent))
    if (response.status == 401) {
      clearCredential(sent); throw VoiceException(VoiceFailure.signedOut)
    }
    val text = strictUtf8(response.body)
    if (response.status !in 200..299 || response.body.size > MAX_BODY || text == null) {
      throw VoiceException(VoiceFailure.invalidResponse)
    }
    text
  }

  private fun prepare(route: AuthRoute, body: ByteArray? = null) = preparedRequest(route, body, credential())

  private fun preparedRequest(route: AuthRoute, body: ByteArray?, credential: SessionCredential?): CredentialRequest {
    val url = policy.origin.newBuilder().encodedPath(route.path).build()
    val request = Request.Builder().url(url).method(route.method, body?.toRequestBody(JSON)).build()
    return CredentialRequest(policy.decorate(request, credential), credential)
  }

  private suspend fun execute(prepared: CredentialRequest, route: AuthRoute): HttpResponse {
    TransportGuard.check(prepared.request.url)
    val response = transport.send(prepared.request)
    if (response.status !in 200..299) {
      var failure = APIFailure.decode(response, route)
      if (route == AuthRoute.voiceStart && response.status == 403) {
        // Server prose is never a discriminator. If status fails, keep the
        // credential: an unexplained 403 is not evidence of revocation.
        val fresh = try {
          status()
        } catch (error: CancellationException) {
          throw error
        } catch (_: Exception) {
          null
        }
        if (fresh != null) {
          val reason = fresh.refusal ?: VoiceFailure.forbidden
          failure = APIFailure(403, reason, failure.charge)
          if (reason == VoiceFailure.forbidden) clearCredential(prepared.credential)
        }
      } else if (failure.failure == VoiceFailure.signedOut || failure.failure == VoiceFailure.forbidden) {
        clearCredential(prepared.credential)
      }
      throw failure
    }
    // Start must recover/finish a reservation before rejecting even an
    // oversized successful body. Other routes have no reservation to clean up.
    if (route != AuthRoute.voiceStart && response.body.size > MAX_BODY) throw VoiceException(VoiceFailure.invalidResponse)
    return response
  }

  private suspend fun perform(route: AuthRoute, body: ByteArray? = null): Pair<HttpResponse, SessionCredential?> {
    if (route == AuthRoute.voiceConnect) throw VoiceException(VoiceFailure.invalidResponse)
    val prepared = prepare(route, body)
    return execute(prepared, route) to prepared.credential
  }

  internal suspend fun request(route: AuthRoute, body: ByteArray? = null) = io { perform(route, body).first }

  suspend fun status(): VoiceStatus = io {
    val (response, sent) = perform(AuthRoute.voiceStatus)
    var status = VoiceStatus.decode(response.body).copy(accountHeld = sent != null)
    if (!status.signedIn && sent != null && !revoked(sent)) {
      // Voice deliberately hides disabled members. Confirm actual sign-out
      // with community using this request's snapshot, never a newer sign-in.
      // An unavailable/malformed confirmation cannot establish revocation.
      val prepared = preparedRequest(AuthRoute.communityStatus, null, sent)
      val community = try {
        CommunityStatus.decode(execute(prepared, AuthRoute.communityStatus).body)
      } catch (error: CancellationException) {
        throw error
      } catch (_: Exception) {
        null
      }
      if (community != null && community.member == null && community.canDeleteAccount != true) {
        clearCredential(sent); status = status.copy(accountHeld = false)
      }
    }
    status
  }

  suspend fun communityStatus(): CommunityStatus = io {
    val (response, sent) = perform(AuthRoute.communityStatus)
    val status = CommunityStatus.decode(response.body)
    if (status.member == null && status.canDeleteAccount != true) clearCredential(sent)
    status
  }

  suspend fun requestDeletionCode(): DeletionChallenge = io {
    val result = DeletionChallenge.decode(perform(AuthRoute.deletionCode, "{}".toByteArray()).first.body)
    if (!result.sent || !challengePattern.matches(result.challengeId)) throw VoiceException(VoiceFailure.invalidResponse)
    result
  }

  suspend fun deleteAccount(challengeId: String, code: String): AccountDeletion = io {
    // Let the Worker apply its generic proof/admission failure to every shape.
    val body = JSONObject().put("challenge_id", challengeId).put("code", code).toString().toByteArray()
    // An unreadable credential cannot authenticate the deletion; it is still removed from this device.
    val (response, sent) = endingSession({ null }) { perform(AuthRoute.deleteAccount, body) }
    val result = AccountDeletion.decode(response.body)
    if (!result.deleted || !result.signedOut) throw VoiceException(VoiceFailure.invalidResponse)
    endingSession({ sent }) { clearCredential(sent) }
    result
  }

  /** The Worker's native code sign-in is named "ios"; Android uses the same flow. */
  suspend fun requestCode(email: String): CodeChallenge = io {
    val body = JSONObject().put("email", email).put("client", "ios").toString().toByteArray()
    CodeChallenge.decode(perform(AuthRoute.requestCode, body).first.body)
  }

  suspend fun consumeCode(challengeId: String, code: String): Unit = io {
    if (!signInCode.matches(code)) throw VoiceException(VoiceFailure.invalidResponse)
    val body = JSONObject().put("challenge_id", challengeId).put("code", code).toString().toByteArray()
    val (response, sent) = perform(AuthRoute.consumeCode, body)
    if (!decodeObject(response.body).requiredBoolean("signed_in")) {
      clearCredential(sent); throw VoiceException(VoiceFailure.signedOut)
    }
    val header = response.header("Set-Cookie") ?: throw VoiceException(VoiceFailure.invalidResponse)
    store.write(SessionCookie.parse(header, clock.now()))
  }

  suspend fun logout(everywhere: Boolean = false): Unit = io {
    val body = JSONObject().put("everywhere", everywhere).toString().toByteArray()
    // An unreadable credential cannot be sent or revoked; it is still removed from this device.
    val prepared = endingSession({ null }) { prepare(AuthRoute.logout, body) }
    try {
      execute(prepared, AuthRoute.logout)
    } catch (error: Exception) {
      endingSession({ prepared.credential }) { clearCredential(prepared.credential) }; throw error
    }
    endingSession({ prepared.credential }) { clearCredential(prepared.credential) }
  }

  internal suspend fun start(): Reservation = io {
    val response = perform(AuthRoute.voiceStart, "{}".toByteArray()).first
    // Recover the ID independently, even when the rest of the 201 is malformed.
    val id = try {
      decodeObject(response.body).requiredString("session_id")
    } catch (_: DecodingException) {
      null
    }
    try {
      if (response.status != 201 || response.body.size > MAX_BODY) throw VoiceException(VoiceFailure.invalidResponse)
      val reservation = Reservation.decode(response.body)
      policy.validateRelay(reservation)
      if (reservation.remainingSeconds <= 0 || reservation.remainingSeconds > 600 || !reservation.expiresAt.isFinite()) {
        throw VoiceException(VoiceFailure.invalidResponse)
      }
      // expires_at is a server deadline; a fast device clock cannot veto it.
      reservation
    } catch (_: Exception) {
      if (id != null && uuidPattern.matches(id)) {
        withContext(NonCancellable) {
          try {
            finish(id)
          } catch (_: Exception) {
          }
        }
      }
      throw VoiceException(VoiceFailure.invalidResponse)
    }
  }

  internal suspend fun finish(sessionId: String) {
    request(AuthRoute.voiceFinish, JSONObject().put("session_id", sessionId).toString().toByteArray())
    // finish's allowance is never published; callers must GET status freshly.
  }

  internal fun observeRelayFailure(failure: APIFailure, credential: SessionCredential?) {
    if (failure.status == 401 || failure.failure == VoiceFailure.forbidden) clearCredential(credential)
  }

  internal fun relayRequest(reservation: Reservation): CredentialRequest {
    policy.validateRelay(reservation)
    val sent = credential() ?: throw VoiceException(VoiceFailure.signedOut)
    val url = RoutePolicy.webSocketUrl(reservation.signedUrl) ?: throw VoiceException(VoiceFailure.invalidResponse)
    val request = policy.decorate(Request.Builder().url(url).build(), sent, webSocket = true)
    TransportGuard.check(request.url)
    return CredentialRequest(request, sent)
  }

  // Keystore and preferences calls block; OkHttp calls are asynchronous.
  private suspend fun <T> io(block: suspend () -> T): T = withContext(Dispatchers.IO) { block() }

  companion object {
    internal const val MAX_BODY = 2 * 1024 * 1024
    private val JSON = "application/json".toMediaType()
    private val publicName = Regex("(threads|members|lists)/[A-Za-z0-9_-]{1,64}")
    private val challengePattern = Regex("[A-Za-z0-9_-]{43}")
    private val signInCode = Regex("[0-9]{8}")
    private val uuidPattern = Regex("[0-9A-Fa-f]{8}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{12}")

    /** JSON bodies only where Swift sets httpBody; OkHttp requires a (blank) body for PUT. */
    private fun requestBody(method: String, body: String?): RequestBody? = when {
      body != null -> body.toByteArray(Charsets.UTF_8).toRequestBody(JSON)
      method == "PUT" -> ByteArray(0).toRequestBody(null)
      else -> null
    }

    /** CharacterSet.whitespacesAndNewlines, including NEL. */
    private fun isWhitespaceOrNewline(c: Char) = c.isWhitespace() || c == '\u0085'
  }
}

/**
 * The platform session: no cookie jar or cache and no redirects (HTTP or
 * WebSocket handshake, same origin included). OkHttp's own retry stays off,
 * because it can resend a POST. The one retry is URLSession's, as iOS gets it
 * (Apple QA1941): a GET or HEAD whose reused connection failed before any
 * response headers arrived, as when the server closed it while idle, is sent
 * once more at once. Never a POST, never after a timeout, a fresh
 * connection's failure or a cancellation, and never twice. The relay socket
 * has no retry.
 */
class OkHttpTransport(private val policy: RoutePolicy = RoutePolicy()) : HttpTransport {
  internal val client: OkHttpClient = configuration()

  /** VoiceHttpClient sees one outcome, as from URLSession. */
  override suspend fun send(request: Request): HttpResponse {
    val first = Attempt()
    try {
      return attempt(request, first)
    } catch (error: IOException) {
      if (!first.retryable(request.method, error)) throw error
    }
    currentCoroutineContext().ensureActive()
    return attempt(request, Attempt())
  }

  private suspend fun attempt(request: Request, attempt: Attempt): HttpResponse {
    TransportGuard.check(request.url)
    if (!policy.permits(request.url, request.method)) throw VoiceException(VoiceFailure.forbidden)
    val call = client.newCall(request.newBuilder().tag(Attempt::class.java, attempt).build())
    return suspendCancellableCoroutine { continuation ->
      continuation.invokeOnCancellation { call.cancel() }
      call.enqueue(object : Callback {
        override fun onFailure(call: Call, e: IOException) = continuation.resumeWithException(e)
        override fun onResponse(call: Call, response: Response) {
          val result = try {
            response.use { Result.success(read(it)) }
          } catch (error: Exception) {
            Result.failure(error)
          }
          result.fold(continuation::resume, continuation::resumeWithException)
        }
      })
    }
  }

  private fun read(response: Response): HttpResponse {
    val source = response.body?.source()
    // Swift buffers the whole body; this caps memory well above the 2 MiB rule.
    val body = if (source == null) ByteArray(0) else {
      if (source.request(MAX_TRANSPORT_BYTES + 1L)) throw VoiceException(VoiceFailure.invalidResponse)
      source.buffer.readByteArray()
    }
    // HTTPURLResponse joins repeated fields with ", ".
    val headers = response.headers.names().associateWith { response.headers.values(it).joinToString(", ") }
    return HttpResponse(response.code, headers, body)
  }

  /** What one call's connection did, recorded by OkHttp's event listener on its threads. */
  internal class Attempt {
    @Volatile var connected = false
    @Volatile var reused = false
    @Volatile var headers = false
    @Volatile var canceled = false

    fun retryable(method: String, error: IOException) =
      method in idempotent && error !is InterruptedIOException && reused && !headers && !canceled
  }

  private class AttemptListener(private val attempt: Attempt) : EventListener() {
    override fun connectStart(call: Call, inetSocketAddress: InetSocketAddress, proxy: Proxy) {
      attempt.connected = true
    }
    override fun connectionAcquired(call: Call, connection: Connection) { attempt.reused = !attempt.connected }
    override fun responseHeadersStart(call: Call) { attempt.headers = true }
    override fun canceled(call: Call) { attempt.canceled = true }
  }

  companion object {
    private const val MAX_TRANSPORT_BYTES = 8 * 1024 * 1024
    // URLSession's own retry covers idempotent requests only; POST never.
    private val idempotent = setOf("GET", "HEAD")

    internal fun configuration(): OkHttpClient = OkHttpClient.Builder()
      .cookieJar(CookieJar.NO_COOKIES)
      .cache(null)
      .followRedirects(false)
      .followSslRedirects(false)
      .retryOnConnectionFailure(false)
      // Only transport calls carry an Attempt; the relay socket records nothing.
      .eventListenerFactory { call -> call.request().tag(Attempt::class.java)?.let(::AttemptListener) ?: EventListener.NONE }
      .connectTimeout(15, TimeUnit.SECONDS)
      .readTimeout(15, TimeUnit.SECONDS)
      .writeTimeout(15, TimeUnit.SECONDS)
      .build()
  }
}
