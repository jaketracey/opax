package au.com.opax.voice

import android.app.Activity
import android.content.Context
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.emptyFlow

/**
 * What the bridge needs from the voice core: Swift's `VoiceCallController`
 * surface, implemented by [VoiceCallController] for the call and the account
 * alike.
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
  /**
   * React Native's Android AppState reports "background" on any pause: a
   * dialog, split screen, a translucent activity such as a share sheet. Only a
   * real background, no started activity, ends the call here. The lifecycle
   * observer also ends it natively when the last activity stops, so a bridge
   * call that arrives on the pause before that stop changes nothing.
   */
  suspend fun background() {
    if (lifecycle.inBackground) core.handle(LifecycleEvent.background)
  }
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
