package au.com.opax.voice

import android.app.Activity
import android.content.Context
import kotlin.coroutines.cancellation.CancellationException
import kotlin.math.max
import kotlin.math.min
import kotlin.math.pow
import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.NonCancellable
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.channels.BufferOverflow
import kotlinx.coroutines.channels.Channel
import kotlinx.coroutines.currentCoroutineContext
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.emptyFlow
import kotlinx.coroutines.flow.receiveAsFlow
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext

/**
 * What the bridge needs from the voice core: Swift's `VoiceCallController`
 * surface. [AccountVoiceCore] serves the account half today; the call half's
 * `CallController` implements the same contract and replaces it in
 * [VoiceController.create].
 */
interface VoiceCore {
  /** Single consumer, newest 128 kept, as Swift's `AsyncStream(.bufferingNewest(128))`. */
  val events: Flow<VoiceEvent>
  suspend fun snapshot(): VoiceSnapshot
  suspend fun refreshStatus(): VoiceStatusSnapshot
  suspend fun start()
  suspend fun setMuted(value: Boolean)
  suspend fun sendText(text: String)
  suspend fun end()
  suspend fun discardEvidence()
  suspend fun handle(event: LifecycleEvent)
  suspend fun withdrawConsent()
  suspend fun logout(everywhere: Boolean = false)
  suspend fun requestDeletionCode(): DeletionChallenge
  suspend fun deleteAccount(challengeId: String, code: String): AccountDeletion
  suspend fun shutdown()
}

class StatusPollTiming(
  val pollInterval: Double = 2.0,
  val pollMaxInterval: Double = 30.0,
  val pollMaxAttempts: Int = 24,
)

/**
 * The account half of Swift's `VoiceCallController`: status, refusals, the
 * open-session poll, sign-out, deletion and teardown, with the same states and
 * events. It never opens a call, so it holds no reservation, socket or audio.
 * Like the Swift actor, state lives on one serial dispatcher and other calls
 * interleave only while a request is in flight.
 */
class AccountVoiceCore(
  private val http: VoiceHttpClient,
  private val clock: VoiceClock = SystemVoiceClock,
  private val timing: StatusPollTiming = StatusPollTiming(),
) : VoiceCore {
  private val serial = Dispatchers.Default.limitedParallelism(1)
  private val scope = CoroutineScope(SupervisorJob() + serial)
  private val channel = Channel<VoiceEvent>(128, BufferOverflow.DROP_OLDEST)
  override val events: Flow<VoiceEvent> = channel.receiveAsFlow()

  private var state = CallState.idle
  private var reason: EndReason? = null
  private var latestStatus: VoiceStatusSnapshot? = null
  private var transcript = emptyList<TranscriptTurn>()
  private var sources = emptyList<VoiceSource>()
  private var epoch = 0
  private var pollJob: Job? = null
  private val endWaiters = mutableListOf<CompletableDeferred<Unit>>()

  private suspend fun <T> serially(block: suspend () -> T): T = withContext(serial) { block() }
  private fun emit(event: VoiceEvent) {
    channel.trySend(event)
  }
  private fun change(value: CallState, reason: EndReason? = null) {
    state = value; this.reason = reason; emit(VoiceEvent.State(value, reason))
  }
  private fun clearStatus() {
    latestStatus = null; emit(VoiceEvent.Status(null))
  }

  /** Reads state atomically; does not refresh, emit or open a call. */
  override suspend fun snapshot() = serially {
    VoiceSnapshot(state, reason, null, PlaybackState.flowing, 0, transcript, sources, latestStatus)
  }

  override suspend fun refreshStatus(): VoiceStatusSnapshot = serially {
    val requestEpoch = epoch
    val busy = state in busyStates
    if (!busy) change(CallState.checking)
    try {
      val status = http.status()
      if (requestEpoch != epoch) return@serially status.bridgeValue
      latestStatus = status.bridgeValue; emit(VoiceEvent.Status(status.bridgeValue))
      val refusal = status.refusal
      if (!busy) change(if (refusal == null) CallState.ready else CallState.unavailable)
      if (refusal != null && !busy) emit(VoiceEvent.Error(refusal))
      if (status.activeSession != null) schedulePoll()
      status.bridgeValue
    } catch (error: Exception) {
      val failure = voiceFailure(error)
      if (requestEpoch == epoch) {
        clearStatus()
        if (!busy) {
          change(CallState.failed); emit(VoiceEvent.Error(failure))
        }
      }
      if (error is CancellationException) throw error
      throw VoiceException(failure)
    }
  }

  /** No call exists on this core; the bridge does not route Start here. */
  override suspend fun start() = serially { emit(VoiceEvent.Error(VoiceFailure.unavailable)) }
  override suspend fun setMuted(value: Boolean) = Unit // Only a live call can mute.
  override suspend fun sendText(text: String): Unit = throw VoiceException(VoiceFailure.callOpen)

  override suspend fun end() = serially {
    if (state == CallState.ending) {
      val waiter = CompletableDeferred<Unit>().also(endWaiters::add)
      waiter.await()
    } else {
      terminate(EndReason.user, null)
    }
  }

  /** The UI discards transient captions only after leaving a finished call. */
  override suspend fun discardEvidence() = serially {
    if (state in setOf(CallState.checking, CallState.reserving, CallState.connecting, CallState.live, CallState.ending)) {
      return@serially
    }
    transcript = emptyList(); sources = emptyList()
    emit(VoiceEvent.Transcript(emptyList())); emit(VoiceEvent.Sources(emptyList()))
  }

  override suspend fun handle(event: LifecycleEvent) = serially {
    if (state !in setOf(CallState.checking, CallState.ready, CallState.reserving, CallState.connecting, CallState.live)) {
      return@serially
    }
    when (event) {
      LifecycleEvent.interruptionBegan, LifecycleEvent.becameInactive -> terminate(EndReason.interruption, null)
      LifecycleEvent.background -> terminate(EndReason.background, null)
      LifecycleEvent.mediaServicesReset -> terminate(EndReason.mediaReset, null)
      // A route change matters only to a live call's engine.
      else -> Unit
    }
  }

  override suspend fun withdrawConsent() = serially { terminate(EndReason.consentWithdrawn, null) }

  override suspend fun logout(everywhere: Boolean) = serially {
    end()
    var failure: VoiceFailure? = null
    try {
      http.logout(everywhere)
    } catch (error: Exception) {
      failure = voiceFailure(error)
    }
    try {
      refreshStatus()
    } catch (_: Exception) {
    }
    if (failure != null) throw VoiceException(failure)
  }

  override suspend fun requestDeletionCode(): DeletionChallenge = try {
    http.requestDeletionCode()
  } catch (error: Exception) {
    throw VoiceException(voiceFailure(error))
  }

  override suspend fun deleteAccount(challengeId: String, code: String): AccountDeletion = serially {
    end() // finish/close before deleting; never infer a budget refund
    try {
      val result = http.deleteAccount(challengeId, code)
      transcript = emptyList(); sources = emptyList(); clearStatus()
      emit(VoiceEvent.Transcript(emptyList())); emit(VoiceEvent.Sources(emptyList()))
      try {
        refreshStatus()
      } catch (_: Exception) {
      }
      result
    } catch (error: Exception) {
      throw VoiceException(voiceFailure(error))
    }
  }

  override suspend fun shutdown() {
    end()
    serially { pollJob?.cancel(); pollJob = null }
    channel.close(); scope.cancel()
  }

  private suspend fun terminate(reason: EndReason, failure: VoiceFailure?) {
    if (state in setOf(CallState.ending, CallState.ended, CallState.failed, CallState.idle)) return
    epoch += 1
    val endingEpoch = epoch
    change(CallState.ending)
    try {
      pollJob?.cancel(); pollJob = null
      clearStatus()
      // Like Swift's fresh unstructured Task: the caller's cancellation cannot
      // cancel the fresh read.
      val refreshed = withContext(NonCancellable) { runCatching { http.status() } }
      if (epoch != endingEpoch) return
      refreshed.fold(
        onSuccess = { status ->
          latestStatus = status.bridgeValue; emit(VoiceEvent.Status(status.bridgeValue))
          if (status.activeSession != null) schedulePoll()
        },
        onFailure = { emit(VoiceEvent.Error(voiceFailure(it))) },
      )
      if (epoch != endingEpoch) return
      if (failure != null) emit(VoiceEvent.Error(failure))
      change(if (failure == null) CallState.ended else CallState.failed, reason)
    } finally {
      endWaiters.forEach { it.complete(Unit) }; endWaiters.clear()
    }
  }

  private fun schedulePoll() {
    if (pollJob != null) return
    val pollEpoch = epoch
    pollJob = scope.launch {
      try {
        for (attempt in 0 until max(0, timing.pollMaxAttempts)) {
          val expiry = latestStatus?.activeSession?.expiresAt
          val now = clock.now()
          val backoff = timing.pollInterval * 2.0.pow(min(attempt, 10))
          val delay = min(timing.pollMaxInterval, max(backoff, (expiry ?: now) - now + 0.5))
          clock.sleep(max(0.001, delay))
          if (!poll(pollEpoch)) return@launch
        }
      } finally {
        if (epoch == pollEpoch && pollJob === currentCoroutineContext()[Job]) pollJob = null
      }
    }
  }

  private suspend fun poll(pollEpoch: Int): Boolean = try {
    val status = http.status()
    if (epoch != pollEpoch || !currentCoroutineContext().isActive) {
      false
    } else {
      latestStatus = status.bridgeValue; emit(VoiceEvent.Status(status.bridgeValue))
      if (status.activeSession == null) {
        pollJob = null
        if (state !in setOf(CallState.reserving, CallState.connecting, CallState.live, CallState.ending)) {
          change(if (status.refusal == null) CallState.ready else CallState.unavailable)
        }
        false
      } else {
        true
      }
    }
  } catch (error: CancellationException) {
    throw error
  } catch (error: Exception) {
    if (epoch == pollEpoch) {
      clearStatus(); emit(VoiceEvent.Error(voiceFailure(error))); pollJob = null
    }
    false
  }

  private companion object {
    val busyStates = setOf(CallState.reserving, CallState.connecting, CallState.live, CallState.ending, CallState.checking)
  }
}

/** Exactly one core and authenticated client per Expo module instance. */
internal class VoiceController(
  val core: VoiceCore,
  private val http: VoiceHttpClient,
  private val consentStore: StoredVoiceConsent,
  /** The Activity's background and foreground reach the call through this. */
  val lifecycle: AndroidVoiceLifecycle = AndroidVoiceLifecycle(),
) {
  /** Call-screen loudness, about 15 a second while live. */
  val levels: Flow<AudioLevels> = (core as? VoiceCallController)?.levels ?: emptyFlow()

  // Consent starts false in every build. Only an explicit UI choice writes it.
  fun consent(): Boolean = consentStore.granted()
  suspend fun setConsent(granted: Boolean) {
    consentStore.setGranted(granted)
    if (!granted) core.withdrawConsent()
  }

  suspend fun snapshot() = VoiceBridgeValue.success(VoiceBridgeValue.snapshot(core.snapshot()))
  suspend fun status(): Map<String, Any?> = bridged { VoiceBridgeValue.status(core.refreshStatus()) }
  suspend fun requestCode(email: String) = bridged {
    val result = http.requestCode(email)
    mapOf("sent" to result.sent, "challengeId" to result.challengeId)
  }
  suspend fun consumeCode(challenge: String, code: String): Map<String, Any?> = try {
    http.consumeCode(challenge, code)
    status()
  } catch (error: Exception) {
    VoiceBridgeValue.failure(error)
  }
  suspend fun logout() = bridged { core.logout(); null }
  suspend fun requestDeletionCode() = bridged {
    val value = core.requestDeletionCode()
    mapOf("sent" to value.sent, "challengeId" to value.challengeId)
  }
  suspend fun deleteAccount(challenge: String, code: String) = bridged {
    val value = core.deleteAccount(challenge, code)
    mapOf("deleted" to value.deleted, "signedOut" to value.signedOut)
  }
  suspend fun communityRequest(path: String, method: String, body: String?) = bridged {
    val response = http.communityRequest(path, method, body)
    mapOf("status" to response.status, "body" to response.body)
  }
  suspend fun chatRequest(path: String, method: String, body: String?) = bridged { http.chatRequest(path, method, body) }

  suspend fun sendText(text: String) = bridged { core.sendText(text); null }
  suspend fun discardEvidence() = core.discardEvidence()
  suspend fun background() = core.handle(LifecycleEvent.background)
  // Success acknowledges dispatch, not a live call: refusals and failures arrive as events.
  suspend fun start(): Map<String, Any?> { core.start(); return VoiceBridgeValue.success() }
  suspend fun mute(muted: Boolean): Map<String, Any?> { core.setMuted(muted); return VoiceBridgeValue.success() }
  suspend fun end(): Map<String, Any?> { core.end(); return VoiceBridgeValue.success() }

  suspend fun shutdown() = core.shutdown()

  private suspend fun bridged(block: suspend () -> Any?): Map<String, Any?> = try {
    VoiceBridgeValue.success(block())
  } catch (error: Exception) {
    VoiceBridgeValue.failure(error)
  }

  companion object {
    fun create(context: Context, activity: () -> Activity? = { null }): VoiceController {
      if (BuildConfig.OPAX_VOICE_PRODUCTION) {
        // Embedded policy and compiled native routes must agree before any I/O.
        check(RoutePolicy.productionConfigurationMatches(embeddedProductionConfiguration())) {
          "Invalid production voice configuration"
        }
      }
      val policy = VoiceVariant.policy()
      val store = VoiceVariant.store(context, policy)
      val transport = OkHttpTransport(policy)
      val http = VoiceHttpClient(policy, store, transport)
      val consent = StoredVoiceConsent(context)
      val lifecycle = AndroidVoiceLifecycle()
      val call = VoiceCallController(
        http = http,
        relays = OkHttpRelayFactory(transport.client, policy),
        engines = VoiceCallVariant.engines(lifecycle),
        permission = VoiceCallVariant.permission(context),
        consent = consent,
        audioSession = VoiceCallVariant.audioSession(context, lifecycle, activity),
        lifecycle = lifecycle,
      )
      return VoiceController(call, http, consent, lifecycle)
    }

    /** iOS reads these from Info.plist; Gradle embeds them from voice-production-policy.json. */
    internal fun embeddedProductionConfiguration(): Map<String, Any?> = mapOf(
      "OPAXProductionVoiceEnabled" to BuildConfig.OPAX_VOICE_PRODUCTION,
      "OPAXVoiceConsentDefault" to BuildConfig.OPAX_VOICE_CONSENT_DEFAULT,
      "OPAXVoiceAllowedRoutes" to BuildConfig.OPAX_VOICE_ALLOWED_ROUTES.split(",").filter { it.isNotEmpty() },
    )
  }
}
