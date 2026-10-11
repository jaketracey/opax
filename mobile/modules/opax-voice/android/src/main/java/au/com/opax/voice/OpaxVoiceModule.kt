package au.com.opax.voice

import expo.modules.kotlin.exception.Exceptions
import expo.modules.kotlin.functions.Coroutine
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.launch

// The name index.ts loads (requireOptionalNativeModule('OpaxVoice')), as on iOS.
class OpaxVoiceModule : Module() {
  @Volatile private var controller: VoiceController? = null
  @Volatile private var scope: CoroutineScope? = null
  private val voice get() = controller ?: throw Exceptions.ModuleNotFound(OpaxVoiceModule::class)

  override fun definition() = ModuleDefinition {
    Name("OpaxVoice")
    Events("onVoiceEvent", "onVoiceLevel")

    OnCreate {
      val context = appContext.reactContext ?: throw Exceptions.ReactContextLost()
      val created = VoiceController.create(context) { appContext.currentActivity }
      controller = created
      scope = CoroutineScope(SupervisorJob() + Dispatchers.Default).also {
        it.launch { created.core.events.collect { event -> sendEvent("onVoiceEvent", VoiceBridgeValue.event(event)) } }
        // A separate event, so levels never displace call events.
        it.launch { created.levels.collect { sendEvent("onVoiceLevel", VoiceBridgeValue.levels(it.input, it.output)) } }
      }
    }
    OnDestroy {
      scope?.cancel(); scope = null
      val owner = controller ?: return@OnDestroy
      controller = null
      CoroutineScope(Dispatchers.Default).launch { owner.shutdown() }
    }

    // The call ends in the background, as on iOS; no foreground service keeps it.
    OnActivityEntersBackground { controller?.lifecycle?.emit(LifecycleEvent.background) }
    OnActivityEntersForeground { controller?.lifecycle?.emit(LifecycleEvent.foreground) }

    AsyncFunction("snapshot") Coroutine { -> voice.snapshot() }
    AsyncFunction("status") Coroutine { -> voice.status() }
    AsyncFunction("requestCode") Coroutine { email: String -> voice.requestCode(email) }
    AsyncFunction("consumeCode") Coroutine { challenge: String, code: String -> voice.consumeCode(challenge, code) }
    AsyncFunction("consent") Coroutine { -> voice.consent() }
    AsyncFunction("setConsent") Coroutine { granted: Boolean -> voice.setConsent(granted) }
    AsyncFunction("logout") Coroutine { -> voice.logout() }
    AsyncFunction("requestDeletionCode") Coroutine { -> voice.requestDeletionCode() }
    AsyncFunction("deleteAccount") Coroutine { challenge: String, code: String -> voice.deleteAccount(challenge, code) }
    AsyncFunction("communityRequest") Coroutine { path: String, method: String, body: String? ->
      voice.communityRequest(path, method, body)
    }
    AsyncFunction("chatRequest") Coroutine { path: String, method: String, body: String? ->
      voice.chatRequest(path, method, body)
    }
    AsyncFunction("start") Coroutine { -> voice.start() }
    AsyncFunction("mute") Coroutine { muted: Boolean -> voice.mute(muted) }
    AsyncFunction("end") Coroutine { -> voice.end() }
    AsyncFunction("sendText") Coroutine { text: String -> voice.sendText(text) }
    AsyncFunction("discardEvidence") Coroutine { -> voice.discardEvidence() }
    AsyncFunction("background") Coroutine { -> voice.background() }
  }
}
