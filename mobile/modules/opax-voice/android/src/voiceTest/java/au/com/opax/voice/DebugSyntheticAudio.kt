package au.com.opax.voice

import android.content.Context
import android.media.AudioAttributes
import android.media.AudioFocusRequest
import android.media.AudioManager
import android.os.Build
import android.os.Handler
import android.os.Looper
import kotlin.math.PI
import kotlin.math.ceil
import kotlin.math.sin
import kotlinx.coroutines.currentCoroutineContext
import kotlinx.coroutines.isActive

/**
 * Fixture-only microphone and playback. It never constructs AudioRecord or
 * AudioTrack. Available to debug unit tests and the compile-time e2e variant,
 * never to production.
 */
class DebugSyntheticEngineFactory(private val clock: VoiceClock = SystemVoiceClock) : VoiceEngineFactory {
  override suspend fun make(): VoiceAudioEngine = DebugSyntheticEngine(clock)
}

/** Confined to the call controller's serial context, like the iOS actor. */
internal class DebugSyntheticEngine(private val clock: VoiceClock) : VoiceAudioEngine {
  private var cadence: ChunkCadence? = null
  private var outputRate = 16000
  private var nextCapture = Double.NEGATIVE_INFINITY
  private var playbackEnd = Double.NEGATIVE_INFINITY
  private var acceptedPlaybackEpoch = 0

  override suspend fun start(input: AudioFormat, output: AudioFormat) {
    acceptedPlaybackEpoch = 0
    cadence = ChunkCadence(input.rate)
    outputRate = output.rate
    nextCapture = clock.now()
    playbackEnd = nextCapture
  }

  override suspend fun capture(): CaptureBuffer? {
    if (cadence == null) return null
    val delay = nextCapture - clock.now()
    if (delay > 0) clock.sleep(delay)
    val cadence = cadence
    if (!currentCoroutineContext().isActive || cadence == null) return null
    val now = clock.now()
    val count = cadence.advance()
    nextCapture = now + 0.025
    return CaptureBuffer(FloatArray(count), cadence.rate)
  }

  override suspend fun schedule(samples: FloatArray, rate: Int, playbackEpoch: Int) {
    if (playbackEpoch != acceptedPlaybackEpoch) return
    if (rate != outputRate || samples.size > rate * PlaybackLimits.maximumSeconds) throw VoiceException(VoiceFailure.audio)
    waitForPlayback(rate * PlaybackLimits.maximumSeconds - samples.size)
    val now = clock.now()
    if (playbackEpoch != acceptedPlaybackEpoch) return
    playbackEnd = maxOf(now, playbackEnd) + samples.size.toDouble() / rate
    // Deliberately discard samples. There is no device or track.
  }

  override suspend fun queuedSamples(): Int {
    val seconds = playbackEnd - clock.now()
    return if (seconds > 0) ceil(seconds * outputRate).toInt() else 0
  }

  override suspend fun waitForPlayback(atMostSamples: Int) {
    while (cadence != null) {
      val queued = queuedSamples()
      if (queued <= atMostSamples) return
      clock.sleep(minOf(1.0, (queued - atMostSamples).toDouble() / outputRate))
    }
    throw VoiceException(VoiceFailure.cancelled)
  }

  override suspend fun flush(playbackEpoch: Int) {
    acceptedPlaybackEpoch = maxOf(acceptedPlaybackEpoch, playbackEpoch)
    playbackEnd = Double.NEGATIVE_INFINITY
  }

  override suspend fun setMuted(muted: Boolean) = Unit

  /**
   * Silent playback still moves the call animation: a speech-shaped envelope
   * while synthetic playback is due. Input stays silent.
   */
  override suspend fun levels(): AudioLevels {
    val now = clock.now()
    if (cadence == null || playbackEnd <= now) return AudioLevels.silent
    val syllable = 0.5 + 0.5 * sin(now * 2 * PI * 4.1)
    val phrase = 0.7 + 0.3 * sin(now * 2 * PI * 0.31)
    return AudioLevels(0f, (0.5 + 0.35 * syllable * phrase).toFloat())
  }

  override suspend fun reconfigure() = Unit

  override suspend fun stop() {
    acceptedPlaybackEpoch += 1
    cadence = null
    playbackEnd = Double.NEGATIVE_INFINITY
  }
}

class DebugMicrophonePermission : MicrophonePermission {
  override suspend fun request() = true
}

/**
 * Silent, but it takes transient audio focus as a real call does, so an
 * incoming phone call (`adb emu gsm call` on the emulator) interrupts an e2e
 * call exactly as it does a production one. It never changes the audio mode
 * or route and opens no audio. Without a context it holds nothing.
 */
class DebugSilentAudioSession(
  private val context: Context? = null,
  private val lifecycle: AndroidVoiceLifecycle? = null,
) : VoiceAudioSession {
  private val main = Handler(Looper.getMainLooper())
  private var focus: AudioFocusRequest? = null
  private var held = false
  private val listener = AudioManager.OnAudioFocusChangeListener { change ->
    when (change) {
      AudioManager.AUDIOFOCUS_LOSS, AudioManager.AUDIOFOCUS_LOSS_TRANSIENT -> lifecycle?.emit(LifecycleEvent.interruptionBegan)
      AudioManager.AUDIOFOCUS_GAIN -> lifecycle?.emit(LifecycleEvent.interruptionEnded)
    }
  }

  override suspend fun activate() {
    val manager = context?.getSystemService(AudioManager::class.java) ?: return
    synchronized(this) {
      val granted = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
        val request = AudioFocusRequest.Builder(AudioManager.AUDIOFOCUS_GAIN_TRANSIENT)
          .setAudioAttributes(
            AudioAttributes.Builder()
              .setUsage(AudioAttributes.USAGE_VOICE_COMMUNICATION)
              .setContentType(AudioAttributes.CONTENT_TYPE_SPEECH)
              .build(),
          )
          .setOnAudioFocusChangeListener(listener, main)
          .build()
        focus = request
        manager.requestAudioFocus(request)
      } else {
        @Suppress("DEPRECATION")
        manager.requestAudioFocus(listener, AudioManager.STREAM_VOICE_CALL, AudioManager.AUDIOFOCUS_GAIN_TRANSIENT)
      }
      // As the production session: refused focus (a phone call already ringing) fails the start.
      if (granted != AudioManager.AUDIOFOCUS_REQUEST_GRANTED) {
        abandon(manager)
        throw VoiceException(VoiceFailure.audio)
      }
      held = true
    }
  }

  override suspend fun deactivate() {
    val manager = context?.getSystemService(AudioManager::class.java) ?: return
    synchronized(this) {
      if (held) abandon(manager)
      held = false
    }
  }

  override suspend fun keepAwake(enabled: Boolean) = Unit

  private fun abandon(manager: AudioManager) {
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
      focus?.let { manager.abandonAudioFocusRequest(it) }
    } else {
      @Suppress("DEPRECATION")
      manager.abandonAudioFocus(listener)
    }
    focus = null
  }
}
