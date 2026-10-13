package au.com.opax.voice

import android.app.Activity
import android.content.Context

/** Production: hardware audio; the permission is checked only with the production voice switch on. */
internal object VoiceCallVariant {
  fun engines(lifecycle: AndroidVoiceLifecycle): VoiceEngineFactory = AndroidVoiceEngineFactory(lifecycle)

  fun permission(context: Context): MicrophonePermission =
    if (BuildConfig.OPAX_VOICE_PRODUCTION) AndroidMicrophonePermission(context) else Denied

  fun audioSession(context: Context, lifecycle: AndroidVoiceLifecycle, activity: () -> Activity?): VoiceAudioSession =
    AndroidVoiceAudioSession(context, lifecycle, activity)
}

/** iOS ReleaseGatedMicrophonePermission without the production switch: never opens the microphone. */
private object Denied : MicrophonePermission {
  override suspend fun request() = false
}
