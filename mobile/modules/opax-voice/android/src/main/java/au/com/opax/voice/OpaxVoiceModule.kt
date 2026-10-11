package au.com.opax.voice

// PENDING LANE 1: placeholder bridge so the call half builds before
// android/voice-account lands. Only the call wiring survives the merge.

import expo.modules.kotlin.functions.Coroutine
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import kotlinx.coroutines.Job
import kotlinx.coroutines.launch

class OpaxVoiceModule : Module() {
  private val lifecycle = AndroidVoiceLifecycle()
  private var controller: VoiceCallController? = null
  private var forwarding: List<Job> = emptyList()

  override fun definition() = ModuleDefinition {
    Name("OpaxVoice")
    Events("onVoiceEvent", "onVoiceLevel")

    OnCreate {
      val context = requireNotNull(appContext.reactContext).applicationContext
      val call = VoiceCallController(
        http = PendingHttp, relays = RelayFactory { throw VoiceException(VoiceFailure.unavailable) },
        engines = VoiceCallVariant.engines(lifecycle), permission = VoiceCallVariant.permission(context),
        consent = PendingConsent, audioSession = VoiceCallVariant.audioSession(context, lifecycle) { appContext.currentActivity },
        lifecycle = lifecycle,
      )
      controller = call
      forwarding = listOf(
        appContext.backgroundCoroutineScope.launch { call.events.collect { sendEvent("onVoiceEvent", VoiceBridgeValue.event(it)) } },
        appContext.backgroundCoroutineScope.launch { call.levels.collect { sendEvent("onVoiceLevel", VoiceBridgeValue.levels(it)) } },
      )
    }
    OnDestroy {
      forwarding.forEach { it.cancel() }
      val call = controller ?: return@OnDestroy
      appContext.backgroundCoroutineScope.launch { call.shutdown() }
    }
    OnActivityEntersBackground { lifecycle.emit(LifecycleEvent.background) }
    OnActivityEntersForeground { lifecycle.emit(LifecycleEvent.foreground) }

    AsyncFunction("sendText") Coroutine { text: String ->
      try { call().sendText(text); VoiceBridgeValue.success() } catch (error: Exception) { VoiceBridgeValue.failure(error) }
    }
    AsyncFunction("discardEvidence") Coroutine { -> call().discardEvidence() }
    AsyncFunction("background") Coroutine { -> call().handle(LifecycleEvent.background) }
    AsyncFunction("start") Coroutine { -> call().start(); VoiceBridgeValue.success() }
    AsyncFunction("mute") Coroutine { muted: Boolean -> call().setMuted(muted); VoiceBridgeValue.success() }
    AsyncFunction("end") Coroutine { -> call().end(); VoiceBridgeValue.success() }
  }

  private fun call() = requireNotNull(controller)

  private object PendingConsent : VoiceConsent {
    override suspend fun isGranted() = false
  }

  private object PendingHttp : VoiceCallHttp {
    private fun pending(): Nothing = throw VoiceException(VoiceFailure.unavailable)
    override suspend fun status() = pending()
    override suspend fun start() = pending()
    override suspend fun finish(sessionId: String) = pending()
    override suspend fun relayRequest(reservation: Reservation) = pending()
    override suspend fun observeRelayFailure(failure: APIFailure, credential: SessionCredential?) = pending()
    override suspend fun logout(everywhere: Boolean) = pending()
    override suspend fun requestDeletionCode() = pending()
    override suspend fun deleteAccount(challengeId: String, code: String) = pending()
  }
}
