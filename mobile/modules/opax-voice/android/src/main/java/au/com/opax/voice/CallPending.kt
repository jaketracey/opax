package au.com.opax.voice

// PENDING LANE 1: stand-ins for Models.kt, Credentials.kt and HttpClient.kt so
// the call half compiles and tests before android/voice-account lands. Removed
// at the merge; the call files then use lane 1's real types.

import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.Flow
import okhttp3.HttpUrl
import okhttp3.Request

enum class CallState { idle, checking, unavailable, ready, reserving, connecting, live, ending, ended, failed }
enum class CallMode { listening, speaking, muted }
enum class PlaybackState { flowing, buffering, truncated }
enum class VoiceFailure {
  signedOut, disabled, allowanceExhausted, budgetClosed, capacity, rateLimited, callOpen,
  forbidden, unavailable, network, policy, unsupportedFormat, audio, queueOverflow,
  microphoneDenied, consentRequired, timeout, invalidResponse, cancelled, statusChecking, deletionVerificationFailed,
}
class VoiceException(val failure: VoiceFailure) : Exception(failure.name) {
  override fun equals(other: Any?) = other is VoiceException && other.failure == failure
  override fun hashCode() = failure.hashCode()
}
class DecodingException : Exception("Invalid response")
enum class EndReason {
  user, interruption, background, mediaReset, provider, deadline, network, consentWithdrawn,
  allowanceExhausted, budgetClosed, callLimit, failed,
}
data class TranscriptTurn(val role: Role, val id: Int, val text: String) {
  enum class Role { user, agent }
}
data class VoiceSource(val title: String, val path: String)
sealed interface VoiceEvent {
  data class State(val state: CallState, val reason: EndReason?) : VoiceEvent
  data class Mode(val mode: CallMode) : VoiceEvent
  data class Playback(val playback: PlaybackState) : VoiceEvent
  data class Transcript(val turns: List<TranscriptTurn>) : VoiceEvent
  data class Sources(val sources: List<VoiceSource>) : VoiceEvent
  data class RemainingTime(val seconds: Int) : VoiceEvent
  data class Error(val failure: VoiceFailure) : VoiceEvent
  data class Status(val status: VoiceStatusSnapshot?) : VoiceEvent
}
data class VoiceSnapshot(
  val state: CallState, val reason: EndReason?, val mode: CallMode?, val playback: PlaybackState,
  val remaining: Int, val transcript: List<TranscriptTurn>, val sources: List<VoiceSource>,
  val status: VoiceStatusSnapshot?,
)
data class ActiveSession(val id: String?, val state: String, val expiresAt: Double?)
data class VoiceStatus(
  val enabled: Boolean, val signedIn: Boolean, val unlimited: Boolean?, val totalSeconds: Long?,
  val remainingSeconds: Long, val activeSession: ActiveSession?, val budgetOpen: Boolean?,
  val accountHeld: Boolean = false,
) {
  val bridgeValue get() = VoiceStatusSnapshot(this)
  val refusal get() = bridgeValue.refusal
}
data class VoiceStatusSnapshot(
  val enabled: Boolean, val signedIn: Boolean, val unlimited: Boolean?, val totalSeconds: Long?,
  val remainingSeconds: Long, val activeSession: OpenSession?, val budgetOpen: Boolean?, val accountHeld: Boolean,
) {
  data class OpenSession(val state: String, val expiresAt: Double?)
  constructor(status: VoiceStatus) : this(
    status.enabled, status.signedIn, status.unlimited, status.totalSeconds, status.remainingSeconds,
    status.activeSession?.let { OpenSession(it.state, it.expiresAt) }, status.budgetOpen, status.accountHeld,
  )
  val refusal: VoiceFailure?
    get() = when {
      !enabled -> VoiceFailure.disabled
      !signedIn -> VoiceFailure.signedOut
      activeSession != null -> VoiceFailure.callOpen
      unlimited != true && remainingSeconds <= 0 -> VoiceFailure.allowanceExhausted
      budgetOpen == false -> VoiceFailure.budgetClosed
      else -> null
    }
}
data class DeletionChallenge(val sent: Boolean, val challengeId: String)
data class AccountDeletion(val deleted: Boolean, val signedOut: Boolean)
class Reservation(
  val sessionId: String, val transport: String, val signedUrl: String,
  val remainingSeconds: Long, val expiresAt: Double,
) {
  override fun toString() = "Reservation([redacted])"
}
class SessionCredential(internal val token: String, internal val expiresAt: Double) {
  override fun toString() = "SessionCredential([redacted])"
}
class CredentialRequest(val request: Request, val credential: SessionCredential?)
enum class ChargeDisposition { released, retained, unknown }
class APIFailure(val status: Int, val failure: VoiceFailure, val charge: ChargeDisposition) : Exception() {
  override val message get() = "APIFailure(status: $status, failure: ${failure.name}, charge: ${charge.name})"
  companion object {
    /** The relay only ever knows the upgrade status; there is no body to read. */
    fun upgrade(status: Int) = APIFailure(
      status,
      when (status) {
        401 -> VoiceFailure.signedOut
        409 -> VoiceFailure.callOpen
        403 -> VoiceFailure.forbidden
        429 -> VoiceFailure.rateLimited
        503 -> VoiceFailure.unavailable
        else -> VoiceFailure.invalidResponse
      },
      ChargeDisposition.unknown,
    )
  }
}
/** The relay URL check lane 1's RoutePolicy performs; numeric loopback only in tests. */
fun interface RelayRoute {
  fun permits(url: HttpUrl): Boolean
}
interface VoiceConsent {
  suspend fun isGranted(): Boolean
}
/** Seconds since 1970, as Swift's `Date.timeIntervalSince1970`. */
interface VoiceClock {
  fun now(): Double
  suspend fun sleep(seconds: Double)
}
object SystemVoiceClock : VoiceClock {
  override fun now() = System.currentTimeMillis() / 1000.0
  override suspend fun sleep(seconds: Double) = delay((maxOf(0.0, seconds) * 1000).toLong())
}
interface MicrophonePermission { suspend fun request(): Boolean }
interface VoiceAudioSession {
  suspend fun activate()
  suspend fun deactivate()
  suspend fun keepAwake(enabled: Boolean)
}
enum class LifecycleEvent {
  interruptionBegan, interruptionEnded, becameInactive, resumptionRecommended,
  background, foreground, sceneInactive, configurationChanged, mediaServicesReset,
}
interface VoiceLifecycle { val events: Flow<LifecycleEvent> }

/** Explicit projection only: never serialize HTTP bodies, reservations or errors. */
object VoiceBridgeValue {
  fun status(value: VoiceStatusSnapshot): Map<String, Any?> = mapOf(
    "enabled" to value.enabled, "signedIn" to value.signedIn, "unlimited" to value.unlimited,
    "totalSeconds" to value.totalSeconds, "remainingSeconds" to value.remainingSeconds,
    "activeSession" to value.activeSession?.let {
      mapOf("state" to (it.state.takeIf { state -> state in listOf("reserved", "connecting", "active") } ?: "unknown"), "expiresAt" to it.expiresAt)
    },
    "budgetOpen" to value.budgetOpen, "accountHeld" to value.accountHeld,
  )

  fun event(event: VoiceEvent): Map<String, Any?> = when (event) {
    is VoiceEvent.State -> mapOf("type" to "state", "state" to event.state.name, "reason" to event.reason?.name)
    is VoiceEvent.Mode -> mapOf("type" to "mode", "mode" to event.mode.name)
    is VoiceEvent.Playback -> mapOf("type" to "playback", "playback" to event.playback.name)
    is VoiceEvent.RemainingTime -> mapOf("type" to "remainingTime", "seconds" to event.seconds)
    is VoiceEvent.Error -> mapOf("type" to "error", "error" to event.failure.name)
    is VoiceEvent.Status -> mapOf("type" to "status", "status" to event.status?.let(::status))
    is VoiceEvent.Transcript -> mapOf(
      "type" to "transcript",
      "turns" to event.turns.map { mapOf("role" to it.role.name, "id" to it.id, "text" to it.text) },
    )
    is VoiceEvent.Sources -> mapOf("type" to "sources", "sources" to event.sources.map { mapOf("title" to it.title, "path" to it.path) })
  }

  /** Two rounded loudness values: coarse enough to animate, never audio. */
  fun levels(value: AudioLevels): Map<String, Any?> {
    fun round(level: Float) = Math.round((if (level.isFinite()) level else 0f).coerceIn(0f, 1f) * 100.0) / 100.0
    return mapOf("input" to round(value.input), "output" to round(value.output))
  }

  fun success(value: Any? = null): Map<String, Any?> = mapOf("ok" to true, "value" to value)
  fun failure(error: Throwable): Map<String, Any?> = mapOf("ok" to false, "error" to voiceFailure(error).name)
}

/** The core's classification of any thrown error. */
internal fun voiceFailure(error: Throwable): VoiceFailure = when (error) {
  is APIFailure -> error.failure
  is VoiceException -> error.failure
  is DecodingException -> VoiceFailure.invalidResponse
  is kotlin.coroutines.cancellation.CancellationException -> VoiceFailure.cancelled
  else -> VoiceFailure.network
}
