@file:Suppress("EnumEntryName") // Entry names are the bridge's raw values, as in Swift.

package au.com.opax.voice

import java.nio.ByteBuffer
import java.nio.charset.CharacterCodingException
import java.nio.charset.CodingErrorAction
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.Flow
import org.json.JSONException
import org.json.JSONObject
import org.json.JSONTokener

enum class CallState { idle, checking, unavailable, ready, reserving, connecting, live, ending, ended, failed }
enum class CallMode { listening, speaking, muted }
enum class PlaybackState { flowing, buffering, truncated }
enum class VoiceFailure {
  signedOut, disabled, allowanceExhausted, budgetClosed, capacity, rateLimited, callOpen,
  forbidden, unavailable, network, policy, unsupportedFormat, audio, queueOverflow,
  microphoneDenied, consentRequired, timeout, invalidResponse, cancelled, statusChecking, deletionVerificationFailed,
}
enum class EndReason {
  user, interruption, background, mediaReset, provider, deadline, network, consentWithdrawn,
  allowanceExhausted, budgetClosed, callLimit, failed,
}

/** Swift's `throw VoiceFailure.x`. The message is the case name: never server or credential content. */
class VoiceException(val failure: VoiceFailure) : Exception(failure.name) {
  override fun equals(other: Any?) = other is VoiceException && other.failure == failure
  override fun hashCode() = failure.hashCode()
}

/** Swift's DecodingError: a malformed body. Carries no content. */
class DecodingException : Exception("Invalid response")

data class TranscriptTurn(val role: Role, val id: Int, val text: String) {
  enum class Role { user, agent }
}
/** A validated OPAX record path, never a signed URL. */
data class VoiceSource(val title: String, val path: String)

/** The only surface the Expo bridge forwards. Contains neither audio nor credentials. */
sealed class VoiceEvent {
  data class State(val state: CallState, val reason: EndReason?) : VoiceEvent()
  data class Mode(val mode: CallMode) : VoiceEvent()
  data class Playback(val playback: PlaybackState) : VoiceEvent()
  data class Transcript(val turns: List<TranscriptTurn>) : VoiceEvent()
  data class Sources(val sources: List<VoiceSource>) : VoiceEvent()
  data class RemainingTime(val seconds: Int) : VoiceEvent()
  data class Error(val failure: VoiceFailure) : VoiceEvent()
  data class Status(val status: VoiceStatusSnapshot?) : VoiceEvent()
}

/**
 * Atomic read model for a screen that missed events while unmounted.
 * No reservation, audio, credential or raw response is exposed.
 */
data class VoiceSnapshot(
  val state: CallState,
  val reason: EndReason?,
  val mode: CallMode?,
  val playback: PlaybackState,
  val remaining: Int,
  val transcript: List<TranscriptTurn>,
  val sources: List<VoiceSource>,
  val status: VoiceStatusSnapshot?,
)

class ActiveSession internal constructor(internal val id: String?, val state: State, val expiresAt: Double?) {
  sealed class State {
    object reserved : State()
    object connecting : State()
    object active : State()
    data class unknown(val raw: String) : State()
    companion object {
      fun from(raw: String): State = when (raw) {
        "reserved" -> reserved
        "connecting" -> connecting
        "active" -> active
        else -> unknown(raw)
      }
    }
  }
  override fun equals(other: Any?) =
    other is ActiveSession && other.id == id && other.state == state && other.expiresAt == expiresAt
  override fun hashCode() = listOf(id, state, expiresAt).hashCode()
  override fun toString() = "ActiveSession([redacted])"

  companion object {
    internal fun decode(json: JSONObject) = ActiveSession(
      id = json.optionalString("id"),
      state = State.from(json.requiredString("state")),
      expiresAt = json.optionalDouble("expires_at"),
    )
  }
}

data class VoiceStatus(
  val enabled: Boolean,
  val signedIn: Boolean,
  val unlimited: Boolean?,
  val totalSeconds: Long?,
  val remainingSeconds: Long,
  val activeSession: ActiveSession?,
  val budgetOpen: Boolean?,
  /**
   * Set by the client, never decoded: this phone holds an account session the
   * server has not revoked. Voice can refuse a member (a disabled one) whose
   * account can still be signed out and deleted.
   */
  val accountHeld: Boolean = false,
) {
  val bridgeValue: VoiceStatusSnapshot get() = VoiceStatusSnapshot(this)
  val refusal: VoiceFailure? get() = bridgeValue.refusal

  companion object {
    internal fun decode(body: ByteArray): VoiceStatus = decodeObject(body).let { json ->
      VoiceStatus(
        enabled = json.requiredBoolean("enabled"),
        signedIn = json.requiredBoolean("signed_in"),
        unlimited = json.optionalBoolean("unlimited"),
        totalSeconds = json.optionalLong("total_seconds"),
        remainingSeconds = json.requiredLong("remaining_seconds"),
        activeSession = json.optionalObject("active_session")?.let(ActiveSession::decode),
        budgetOpen = json.optionalBoolean("budget_open"),
      )
    }
  }
}

/** Bridge/read-model status deliberately has no session ID or signed URL. */
data class VoiceStatusSnapshot(
  val enabled: Boolean,
  val signedIn: Boolean,
  val unlimited: Boolean?,
  val totalSeconds: Long?,
  val remainingSeconds: Long,
  val activeSession: OpenSession?,
  val budgetOpen: Boolean?,
  /** Sign-out and deletion stay available while true, whatever voice allows. */
  val accountHeld: Boolean,
) {
  data class OpenSession(val state: ActiveSession.State, val expiresAt: Double?)

  internal constructor(status: VoiceStatus) : this(
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

data class CodeChallenge(val sent: Boolean, val challengeId: String) {
  companion object {
    internal fun decode(body: ByteArray) = decodeObject(body).let {
      CodeChallenge(it.requiredBoolean("sent"), it.requiredString("challenge_id"))
    }
  }
}
class CommunityStatus(val enabled: Boolean, val member: Member?, val canDeleteAccount: Boolean?) {
  class Member(val id: String)
  companion object {
    internal fun decode(body: ByteArray) = decodeObject(body).let { json ->
      CommunityStatus(
        enabled = json.requiredBoolean("enabled"),
        member = json.optionalObject("member")?.let { Member(it.requiredString("id")) },
        canDeleteAccount = json.optionalBoolean("can_delete_account"),
      )
    }
  }
}
data class DeletionChallenge(val sent: Boolean, val challengeId: String) {
  companion object {
    internal fun decode(body: ByteArray) = decodeObject(body).let {
      DeletionChallenge(it.requiredBoolean("sent"), it.requiredString("challenge_id"))
    }
  }
}
data class AccountDeletion(val deleted: Boolean, val signedOut: Boolean) {
  companion object {
    internal fun decode(body: ByteArray) = decodeObject(body).let {
      AccountDeletion(it.requiredBoolean("deleted"), it.requiredBoolean("signed_out"))
    }
  }
}
/** A voice reservation. Never printed: the signed URL and session ID are secrets. */
internal class Reservation(
  val sessionId: String,
  val transport: String,
  val signedUrl: String,
  val remainingSeconds: Long,
  val expiresAt: Double,
) {
  override fun toString() = "Reservation([redacted])"

  companion object {
    fun decode(body: ByteArray) = decodeObject(body).let { json ->
      Reservation(
        sessionId = json.requiredString("session_id"),
        transport = json.requiredString("transport"),
        signedUrl = json.requiredString("signed_url"),
        remainingSeconds = json.requiredLong("remaining_seconds"),
        expiresAt = json.requiredDouble("expires_at"),
      )
    }
  }
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
interface VoiceConsent { suspend fun isGranted(): Boolean }
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

// Strict JSON, as Swift's JSONDecoder: valid UTF-8, one object, exact types.
// org.json alone accepts trailing text, quoted numbers and boolean strings.

internal fun strictUtf8(bytes: ByteArray): String? = try {
  Charsets.UTF_8.newDecoder()
    .onMalformedInput(CodingErrorAction.REPORT)
    .onUnmappableCharacter(CodingErrorAction.REPORT)
    .decode(ByteBuffer.wrap(bytes)).toString()
} catch (_: CharacterCodingException) {
  null
}

internal fun decodeObject(bytes: ByteArray): JSONObject {
  val text = strictUtf8(bytes) ?: throw DecodingException()
  try {
    val tokener = JSONTokener(text)
    val value = tokener.nextValue()
    if (value !is JSONObject || tokener.nextClean() != 0.toChar()) throw DecodingException()
    return value
  } catch (_: JSONException) {
    throw DecodingException()
  }
}

private fun JSONObject.present(key: String): Any? = opt(key).takeUnless { it == null || it == JSONObject.NULL }
internal fun JSONObject.requiredBoolean(key: String) = optionalBoolean(key) ?: throw DecodingException()
internal fun JSONObject.optionalBoolean(key: String): Boolean? = when (val value = present(key)) {
  null -> null
  is Boolean -> value
  else -> throw DecodingException()
}
internal fun JSONObject.requiredString(key: String) = optionalString(key) ?: throw DecodingException()
internal fun JSONObject.optionalString(key: String): String? = when (val value = present(key)) {
  null -> null
  is String -> value
  else -> throw DecodingException()
}
internal fun JSONObject.requiredLong(key: String) = optionalLong(key) ?: throw DecodingException()
internal fun JSONObject.optionalLong(key: String): Long? = when (val value = present(key)) {
  null -> null
  is Int -> value.toLong()
  is Long -> value
  is Double -> value.takeIf { it % 1.0 == 0.0 && it >= Long.MIN_VALUE && it < Long.MAX_VALUE }?.toLong()
    ?: throw DecodingException()
  else -> throw DecodingException()
}
internal fun JSONObject.requiredDouble(key: String) = optionalDouble(key) ?: throw DecodingException()
internal fun JSONObject.optionalDouble(key: String): Double? = when (val value = present(key)) {
  null -> null
  is Number -> value.toDouble()
  else -> throw DecodingException()
}
internal fun JSONObject.optionalObject(key: String): JSONObject? = when (val value = present(key)) {
  null -> null
  is JSONObject -> value
  else -> throw DecodingException()
}
