package au.com.opax.voice

import android.app.Activity
import android.content.Context

/**
 * The call half of iOS VoiceController's build switch. E2e selects synthetic
 * input, silent timed playback that still takes audio focus (so a phone call
 * interrupts it) and a permission stand-in; development keeps the
 * hardware path but never passes the permission check, so it cannot open the
 * microphone; only production voice builds check the real grant.
 */
internal object VoiceCallVariant {
  fun engines(lifecycle: AndroidVoiceLifecycle): VoiceEngineFactory =
    if (BuildConfig.OPAX_VOICE_E2E) DebugSyntheticEngineFactory() else AndroidVoiceEngineFactory(lifecycle)

  fun permission(context: Context): MicrophonePermission = when {
    BuildConfig.OPAX_VOICE_E2E -> DebugMicrophonePermission()
    BuildConfig.OPAX_VOICE_PRODUCTION -> AndroidMicrophonePermission(context)
    else -> Denied
  }

  fun audioSession(context: Context, lifecycle: AndroidVoiceLifecycle, activity: () -> Activity?): VoiceAudioSession =
    if (BuildConfig.OPAX_VOICE_E2E) DebugSilentAudioSession(context, lifecycle) else AndroidVoiceAudioSession(context, lifecycle, activity)
}

/** iOS ReleaseGatedMicrophonePermission without the production switch: never opens the microphone. */
private object Denied : MicrophonePermission {
  override suspend fun request() = false
}
