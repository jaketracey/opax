package au.com.opax.voice

import kotlin.math.floor

// Explicit projection only: never serialize HTTP bodies, reservations or errors.
// Kotlin null crosses as JS null, matching iOS's NSNull.
internal object VoiceBridgeValue {
  fun snapshot(value: VoiceSnapshot): Map<String, Any?> = mapOf(
    "state" to value.state.name,
    "reason" to value.reason?.name,
    "mode" to value.mode?.name,
    "playback" to value.playback.name,
    "remaining" to value.remaining,
    "transcript" to event(VoiceEvent.Transcript(value.transcript))["turns"],
    "sources" to event(VoiceEvent.Sources(value.sources))["sources"],
    "status" to value.status?.let(::status),
  )

  fun status(value: VoiceStatusSnapshot): Map<String, Any?> {
    val open = value.activeSession?.let { session ->
      val state = when (session.state) {
        ActiveSession.State.reserved -> "reserved"
        ActiveSession.State.connecting -> "connecting"
        ActiveSession.State.active -> "active"
        is ActiveSession.State.unknown -> "unknown"
      }
      mapOf("state" to state, "expiresAt" to session.expiresAt)
    }
    return mapOf(
      "enabled" to value.enabled,
      "signedIn" to value.signedIn,
      "unlimited" to value.unlimited,
      "totalSeconds" to value.totalSeconds,
      "remainingSeconds" to value.remainingSeconds,
      "activeSession" to open,
      "budgetOpen" to value.budgetOpen,
      "accountHeld" to value.accountHeld,
    )
  }

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
    is VoiceEvent.Sources -> mapOf(
      "type" to "sources",
      "sources" to event.sources.map { mapOf("title" to it.title, "path" to it.path) },
    )
  }

  /** Two rounded loudness values: coarse enough to animate, never audio. */
  fun levels(input: Float, output: Float): Map<String, Any?> {
    // Swift's rounded() is half away from zero; these values are never negative.
    fun round(level: Float) = floor((if (level.isFinite()) level else 0f).coerceIn(0f, 1f).toDouble() * 100 + 0.5) / 100
    return mapOf("input" to round(input), "output" to round(output))
  }

  fun success(value: Any? = null): Map<String, Any?> = mapOf("ok" to true, "value" to value)
  fun failure(error: Throwable): Map<String, Any?> = mapOf("ok" to false, "error" to voiceFailure(error).name)
  fun failure(failure: VoiceFailure): Map<String, Any?> = mapOf("ok" to false, "error" to failure.name)
}
