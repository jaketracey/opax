package au.com.opax.voice

import android.Manifest
import android.app.Activity
import android.app.Application
import android.content.Context
import android.content.pm.PackageManager
import android.media.AudioAttributes
import android.media.AudioDeviceCallback
import android.media.AudioDeviceInfo
import android.media.AudioFocusRequest
import android.media.AudioFormat as PlatformAudioFormat
import android.media.AudioManager
import android.media.AudioRecord
import android.media.AudioTrack
import android.media.MediaRecorder
import android.media.audiofx.AcousticEchoCanceler
import android.media.audiofx.AudioEffect
import android.media.audiofx.AutomaticGainControl
import android.media.audiofx.NoiseSuppressor
import android.os.Build
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.os.Process
import android.view.WindowManager
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.channels.BufferOverflow
import kotlinx.coroutines.channels.Channel
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.receiveAsFlow
import kotlinx.coroutines.currentCoroutineContext
import kotlinx.coroutines.delay
import kotlinx.coroutines.ensureActive
import kotlinx.coroutines.withContext
import java.util.concurrent.locks.ReentrantLock
import kotlin.concurrent.withLock

/**
 * Allocated before recording starts. The record thread copies samples (and
 * LevelBox keeps one loudness value); downmixing, conversion, JSON and socket
 * work happen later in the controller's context.
 */
internal class CaptureRing(val rate: Int, private val channels: Int) {
  private val capacity = rate * 2
  private val storage = FloatArray(capacity * channels)
  private var readIndex = 0
  private var writeIndex = 0
  private var count = 0
  private var overflow = false
  private var failed = false
  val signals = Channel<Unit>(Channel.CONFLATED)

  /** Interleaved frames from the record thread. */
  fun copy(interleaved: FloatArray, frames: Int) {
    synchronized(this) {
      if (frames > capacity - count) {
        overflow = true
      } else {
        for (frame in 0 until frames) {
          for (channel in 0 until channels) {
            storage[writeIndex * channels + channel] = interleaved[frame * channels + channel]
          }
          writeIndex = (writeIndex + 1) % capacity
        }
        count += frames
      }
    }
    signals.trySend(Unit)
  }

  fun fail() {
    synchronized(this) { failed = true }
    signals.trySend(Unit)
  }

  fun finish() { signals.close() }

  fun drain(rate: Int): CaptureBuffer? = synchronized(this) {
    if (overflow) throw VoiceException(VoiceFailure.queueOverflow)
    if (failed) throw VoiceException(VoiceFailure.audio)
    if (count == 0) return null
    // Limit each drain to 25 ms so the lock is short on the record thread.
    val frames = minOf(count, maxOf(1, rate / 40))
    val mono = FloatArray(frames)
    for (frame in 0 until frames) {
      var sum = 0f
      for (channel in 0 until channels) sum += storage[readIndex * channels + channel]
      mono[frame] = sum / channels
      readIndex = (readIndex + 1) % capacity
    }
    count -= frames
    CaptureBuffer(mono, rate)
  }
}

/** The latest input loudness. The record thread writes one Float; the engine reads it. */
internal class LevelBox {
  @Volatile var input = 0f
    private set

  fun setInput(samples: FloatArray, count: Int) { input = LevelMeter.level(samples, count) }
  fun reset() { input = 0f }
}

/** The playback device, behind an interface so drain signalling is testable without audio. */
internal interface PcmSink {
  /** Non-blocking; returns frames accepted or a negative error. */
  fun write(samples: ShortArray, offset: Int, count: Int): Int
  /** Frames presented since creation or the last flush. */
  fun playedFrames(): Long
  fun flush()
  fun release()
}

private class AudioTrackSink(rate: Int) : PcmSink {
  private val track: AudioTrack

  init {
    val minimum = AudioTrack.getMinBufferSize(rate, PlatformAudioFormat.CHANNEL_OUT_MONO, PlatformAudioFormat.ENCODING_PCM_16BIT)
    if (minimum <= 0) throw VoiceException(VoiceFailure.audio)
    track = AudioTrack.Builder()
      .setAudioAttributes(voiceAttributes)
      .setAudioFormat(
        PlatformAudioFormat.Builder()
          .setSampleRate(rate)
          .setChannelMask(PlatformAudioFormat.CHANNEL_OUT_MONO)
          .setEncoding(PlatformAudioFormat.ENCODING_PCM_16BIT)
          .build(),
      )
      .setTransferMode(AudioTrack.MODE_STREAM)
      .setBufferSizeInBytes(maxOf(minimum, rate / 5 * 2))
      .build()
    if (track.state != AudioTrack.STATE_INITIALIZED) {
      track.release()
      throw VoiceException(VoiceFailure.audio)
    }
    track.play()
  }

  override fun write(samples: ShortArray, offset: Int, count: Int) =
    track.write(samples, offset, count, AudioTrack.WRITE_NON_BLOCKING)

  override fun playedFrames() = track.playbackHeadPosition.toLong() and 0xFFFFFFFFL

  override fun flush() {
    track.pause()
    track.flush()
    track.play()
  }

  override fun release() {
    runCatching { track.pause(); track.flush(); track.stop() }
    track.release()
  }
}

/**
 * Up to thirty seconds of scheduled output ahead of the track's own buffer,
 * written by one thread without blocking so a flush is immediate. Queued
 * samples = waiting here + written but not yet presented; waiters poll it,
 * which is the drain signal (iOS uses per-buffer completion callbacks).
 */
internal class PlaybackWriter(private val sink: PcmSink) {
  private val lock = ReentrantLock()
  private val ready = lock.newCondition()
  private val pending = ArrayDeque<FloatArray>()
  private var offset = 0
  private var pendingSamples = 0
  private var written = 0L
  private var flushedAt = 0L
  private val blocks = ArrayDeque<Pair<Long, Float>>() // (end frame, loudness) of written slices
  private var running = true
  @Volatile var failed = false
    private set
  private val thread = Thread(::writeLoop, "opax-voice-playback").apply { start() }

  fun enqueue(samples: FloatArray) = lock.withLock {
    pending.addLast(samples)
    pendingSamples += samples.size
    ready.signalAll()
  }

  fun queued(): Int = lock.withLock { pendingSamples + maxOf(0L, written - played()).toInt() }

  /** What the listener hears now: the slice at the play head, not the newest write. */
  fun level(): Float = lock.withLock {
    val head = played()
    while (blocks.isNotEmpty() && blocks.first().first <= head) blocks.removeFirst()
    blocks.firstOrNull()?.second ?: 0f
  }

  fun flush() = lock.withLock {
    pending.clear()
    offset = 0
    pendingSamples = 0
    blocks.clear()
    sink.flush()
    written = 0
    flushedAt = sink.playedFrames() // zero after flush on most devices; never assumed
  }

  fun release() {
    lock.withLock {
      running = false
      pending.clear()
      pendingSamples = 0
      blocks.clear()
      ready.signalAll()
    }
    thread.join(1000)
    sink.release()
  }

  private fun played() = sink.playedFrames() - flushedAt

  private fun writeLoop() {
    Process.setThreadPriority(Process.THREAD_PRIORITY_URGENT_AUDIO)
    val shorts = ShortArray(4096)
    while (true) {
      var idle = false
      lock.withLock {
        while (running && pending.isEmpty()) ready.await()
        if (!running) return
        val chunk = pending.first()
        val count = minOf(shorts.size, chunk.size - offset)
        for (index in 0 until count) {
          val sample = chunk[offset + index].coerceIn(-1f, 1f)
          shorts[index] = (sample * if (sample < 0) 32768 else 32767).toInt().toShort()
        }
        val accepted = sink.write(shorts, 0, count)
        when {
          accepted < 0 -> { failed = true; running = false; return }
          accepted == 0 -> idle = true
          else -> {
            val level = LevelMeter.level(chunk.copyOfRange(offset, offset + accepted))
            offset += accepted
            pendingSamples -= accepted
            written += accepted
            blocks.addLast(written to level)
            if (offset == chunk.size) { pending.removeFirst(); offset = 0 }
          }
        }
      }
      if (idle) Thread.sleep(5)
    }
  }
}

private val voiceAttributes: AudioAttributes = AudioAttributes.Builder()
  .setUsage(AudioAttributes.USAGE_VOICE_COMMUNICATION)
  .setContentType(AudioAttributes.CONTENT_TYPE_SPEECH)
  .build()

class AndroidVoiceEngineFactory(private val lifecycle: AndroidVoiceLifecycle) : VoiceEngineFactory {
  override suspend fun make(): VoiceAudioEngine = AndroidVoiceEngine { lifecycle.emit(LifecycleEvent.mediaServicesReset) }
}

/**
 * One voice-communication path: AudioRecord on VOICE_COMMUNICATION with the
 * platform echo canceller, noise suppressor and gain control when present, and
 * an AudioTrack for speech. Hardware calls run on the engine's own serial
 * executor. Tests use FakeAudioEngine; in debug and e2e builds the guard refuses
 * before any AudioRecord or AudioTrack exists.
 */
@OptIn(ExperimentalCoroutinesApi::class)
internal class AndroidVoiceEngine(private val onMediaReset: () -> Unit) : VoiceAudioEngine {
  private val serial = Dispatchers.IO.limitedParallelism(1)
  private var record: AudioRecord? = null
  private var effects: List<AudioEffect> = emptyList()
  private var recordThread: Thread? = null
  @Volatile private var ring: CaptureRing? = null
  private val meter = LevelBox()
  private var input: AudioFormat? = null
  private var output: AudioFormat? = null
  @Volatile private var playback: PlaybackWriter? = null
  private var acceptedPlaybackEpoch = 0
  @Volatile private var muted = false
  private var stopped = false

  override suspend fun start(input: AudioFormat, output: AudioFormat): Unit = withContext(serial) {
    acceptedPlaybackEpoch = 0
    VoiceTestSafety.willOpenAudio()
    // Engines are single use: a stop that overtook this start wins.
    if (stopped) throw VoiceException(VoiceFailure.audio)
    this@AndroidVoiceEngine.input = input
    this@AndroidVoiceEngine.output = output
    try {
      openCapture(input.rate)
      playback = PlaybackWriter(AudioTrackSink(output.rate))
    } catch (error: Exception) {
      closeAll()
      throw VoiceException(VoiceFailure.audio)
    }
  }

  /** The metadata rate when the device records it; otherwise a common rate the converter resamples. */
  private fun openCapture(preferred: Int) {
    for (rate in listOf(preferred, 48000, 44100, 16000).distinct()) {
      val minimum = AudioRecord.getMinBufferSize(rate, PlatformAudioFormat.CHANNEL_IN_MONO, PlatformAudioFormat.ENCODING_PCM_16BIT)
      if (minimum <= 0) continue
      val candidate = try {
        AudioRecord(
          MediaRecorder.AudioSource.VOICE_COMMUNICATION, rate, PlatformAudioFormat.CHANNEL_IN_MONO,
          PlatformAudioFormat.ENCODING_PCM_16BIT, maxOf(minimum, rate / 5 * 2),
        )
      } catch (_: Exception) {
        continue // unsupported rate, or no permission
      }
      if (candidate.state != AudioRecord.STATE_INITIALIZED) { candidate.release(); continue }
      val session = candidate.audioSessionId
      effects = listOfNotNull(
        if (AcousticEchoCanceler.isAvailable()) AcousticEchoCanceler.create(session) else null,
        if (NoiseSuppressor.isAvailable()) NoiseSuppressor.create(session) else null,
        if (AutomaticGainControl.isAvailable()) AutomaticGainControl.create(session) else null,
      ).onEach { runCatching { it.enabled = true } }
      val ring = CaptureRing(rate, 1)
      candidate.startRecording()
      if (candidate.recordingState != AudioRecord.RECORDSTATE_RECORDING) {
        effects.forEach { it.release() }
        effects = emptyList()
        candidate.release()
        throw VoiceException(VoiceFailure.audio)
      }
      record = candidate
      this.ring = ring
      recordThread = Thread({ readLoop(candidate, ring, rate) }, "opax-voice-capture").apply { start() }
      return
    }
    throw VoiceException(VoiceFailure.audio)
  }

  private fun readLoop(record: AudioRecord, ring: CaptureRing, rate: Int) {
    Process.setThreadPriority(Process.THREAD_PRIORITY_URGENT_AUDIO)
    val frames = maxOf(1, rate / 100) // 10 ms reads
    val shorts = ShortArray(frames)
    val floats = FloatArray(frames)
    while (true) {
      val read = record.read(shorts, 0, frames)
      when {
        read > 0 -> {
          for (index in 0 until read) floats[index] = shorts[index] / 32768f
          ring.copy(floats, read)
          meter.setInput(floats, read)
        }
        read == AudioRecord.ERROR_DEAD_OBJECT -> { onMediaReset(); break }
        read < 0 -> { ring.fail(); break }
        record.recordingState != AudioRecord.RECORDSTATE_RECORDING -> break
      }
    }
    // stop() and reconfigure() finish the ring, after any replacement is in place.
  }

  override suspend fun capture(): CaptureBuffer? {
    while (true) {
      val ring = ring ?: return null
      ring.drain(ring.rate)?.let { return it }
      if (ring.signals.receiveCatching().isClosed) {
        // A rebuilt capture path replaces the ring; keep reading from the new one.
        val current = this.ring
        if (current != null && current !== ring) continue
        return null
      }
    }
  }

  override suspend fun schedule(samples: FloatArray, rate: Int, playbackEpoch: Int): Unit = withContext(serial) {
    if (playbackEpoch != acceptedPlaybackEpoch) return@withContext
    if (output?.rate != rate || samples.size > rate * PlaybackLimits.maximumSeconds) throw VoiceException(VoiceFailure.audio)
    waitForPlayback(rate * PlaybackLimits.maximumSeconds - samples.size)
    if (playbackEpoch != acceptedPlaybackEpoch) return@withContext
    val playback = playback?.takeIf { output?.rate == rate } ?: throw VoiceException(VoiceFailure.queueOverflow)
    if (playback.failed) throw VoiceException(VoiceFailure.audio)
    if (samples.isNotEmpty()) playback.enqueue(samples)
  }

  override suspend fun queuedSamples() = playback?.queued() ?: 0

  override suspend fun waitForPlayback(atMostSamples: Int) {
    currentCoroutineContext().ensureActive()
    while (queuedSamples() > atMostSamples) delay(10)
  }

  override suspend fun flush(playbackEpoch: Int): Unit = withContext(serial) {
    if (playbackEpoch < acceptedPlaybackEpoch) return@withContext
    acceptedPlaybackEpoch = playbackEpoch
    playback?.flush()
  }

  override suspend fun setMuted(muted: Boolean) { this.muted = muted }

  /** Invoked by the controller after a route change, never from the device callback itself. */
  override suspend fun reconfigure(): Unit = withContext(serial) {
    val record = record ?: throw VoiceException(VoiceFailure.audio)
    val input = input ?: throw VoiceException(VoiceFailure.audio)
    val output = output ?: throw VoiceException(VoiceFailure.audio)
    val healthy = record.recordingState == AudioRecord.RECORDSTATE_RECORDING &&
      recordThread?.isAlive == true && playback?.failed == false
    if (healthy) return@withContext // Android reroutes both streams itself
    val oldRing = ring
    closeAll()
    try {
      openCapture(input.rate)
      playback = PlaybackWriter(AudioTrackSink(output.rate))
    } catch (error: Exception) {
      closeAll()
      throw VoiceException(VoiceFailure.audio)
    } finally {
      oldRing?.finish()
    }
  }

  override suspend fun levels(): AudioLevels {
    val output = playback?.level() ?: 0f
    return if (muted) AudioLevels(0f, output) else AudioLevels(meter.input, output)
  }

  override suspend fun stop(): Unit = withContext(serial) {
    acceptedPlaybackEpoch += 1
    stopped = true
    closeAll()
    meter.reset()
    ring?.finish()
    ring = null
  }

  private fun closeAll() {
    record?.let { runCatching { it.stop() } }
    recordThread?.join(1000)
    recordThread = null
    effects.forEach { runCatching { it.release() } }
    effects = emptyList()
    record?.release()
    record = null
    playback?.release()
    playback = null
  }
}

/**
 * Talk only checks the permission. JS asks for it after stored consent with its
 * own rationale, the only system dialog, and calls start() once granted; start()
 * never requests it or shows UI. A missing grant is an iOS denial.
 */
class AndroidMicrophonePermission(private val context: Context) : MicrophonePermission {
  override suspend fun request(): Boolean {
    if (VoiceTestSafety.blocksHardware()) return false
    return context.checkSelfPermission(Manifest.permission.RECORD_AUDIO) == PackageManager.PERMISSION_GRANTED
  }
}

/**
 * Audio focus, communication mode and routing for one call: speaker by default,
 * a headset when one is connected (iOS .voiceChat with defaultToSpeaker and
 * Bluetooth HFP). Losing focus, as to a phone call, is an interruption.
 */
class AndroidVoiceAudioSession(
  private val context: Context,
  private val lifecycle: AndroidVoiceLifecycle,
  private val activity: () -> Activity?,
) : VoiceAudioSession {
  private val main = Handler(Looper.getMainLooper())
  private var focus: AudioFocusRequest? = null
  private var previousMode: Int? = null
  private var bluetooth = false
  private var knownDevices = emptySet<Int>()
  private val focusListener = AudioManager.OnAudioFocusChangeListener { change ->
    when (change) {
      AudioManager.AUDIOFOCUS_LOSS, AudioManager.AUDIOFOCUS_LOSS_TRANSIENT -> lifecycle.emit(LifecycleEvent.interruptionBegan)
      AudioManager.AUDIOFOCUS_GAIN -> lifecycle.emit(LifecycleEvent.interruptionEnded)
    }
  }
  private val devices = object : AudioDeviceCallback() {
    override fun onAudioDevicesAdded(addedDevices: Array<out AudioDeviceInfo>) = routeChanged()
    override fun onAudioDevicesRemoved(removedDevices: Array<out AudioDeviceInfo>) = routeChanged()
  }

  private val manager get() = context.getSystemService(AudioManager::class.java)

  override suspend fun activate() {
    if (VoiceTestSafety.blocksHardware()) throw VoiceException(VoiceFailure.audio)
    synchronized(this) {
      val manager = manager
      val granted = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
        val request = AudioFocusRequest.Builder(AudioManager.AUDIOFOCUS_GAIN_TRANSIENT)
          .setAudioAttributes(voiceAttributes)
          .setOnAudioFocusChangeListener(focusListener, main)
          .build()
        focus = request
        manager.requestAudioFocus(request)
      } else {
        @Suppress("DEPRECATION")
        manager.requestAudioFocus(focusListener, AudioManager.STREAM_VOICE_CALL, AudioManager.AUDIOFOCUS_GAIN_TRANSIENT)
      }
      if (granted != AudioManager.AUDIOFOCUS_REQUEST_GRANTED) {
        abandonFocus(manager)
        throw VoiceException(VoiceFailure.audio)
      }
      previousMode = manager.mode
      manager.mode = AudioManager.MODE_IN_COMMUNICATION
      route(manager)
      knownDevices = deviceIds(manager)
      manager.registerAudioDeviceCallback(devices, main)
    }
  }

  override suspend fun deactivate() {
    synchronized(this) {
      val mode = previousMode ?: return
      val manager = manager
      manager.unregisterAudioDeviceCallback(devices)
      unroute(manager)
      manager.mode = mode
      previousMode = null
      abandonFocus(manager)
    }
  }

  override suspend fun keepAwake(enabled: Boolean) {
    // Posted in call order, so a late "on" can never follow the "off".
    main.post {
      val window = activity()?.window ?: return@post
      if (enabled) window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
      else window.clearFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
    }
  }

  /** Registration replays the current devices; only a real change is a route change. */
  private fun routeChanged() {
    val changed = synchronized(this) {
      val manager = manager
      val current = deviceIds(manager)
      if (previousMode == null || current == knownDevices) return@synchronized false
      knownDevices = current
      route(manager)
      true
    }
    if (changed) lifecycle.emit(LifecycleEvent.configurationChanged)
  }

  private fun deviceIds(manager: AudioManager) = manager.getDevices(AudioManager.GET_DEVICES_ALL).map { it.id }.toSet()

  @Suppress("DEPRECATION")
  private fun route(manager: AudioManager) {
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
      val available = manager.availableCommunicationDevices
      preferredRoutes.firstNotNullOfOrNull { type -> available.firstOrNull { it.type == type } }
        ?.let { manager.setCommunicationDevice(it) }
    } else {
      val outputs = manager.getDevices(AudioManager.GET_DEVICES_OUTPUTS).map { it.type }
      if (AudioDeviceInfo.TYPE_BLUETOOTH_SCO in outputs && manager.isBluetoothScoAvailableOffCall) {
        if (!bluetooth) { manager.startBluetoothSco(); manager.isBluetoothScoOn = true; bluetooth = true }
        manager.isSpeakerphoneOn = false
      } else {
        if (bluetooth) { manager.stopBluetoothSco(); manager.isBluetoothScoOn = false; bluetooth = false }
        manager.isSpeakerphoneOn = outputs.none { it in wiredRoutes }
      }
    }
  }

  @Suppress("DEPRECATION")
  private fun unroute(manager: AudioManager) {
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
      manager.clearCommunicationDevice()
    } else {
      if (bluetooth) { manager.stopBluetoothSco(); manager.isBluetoothScoOn = false; bluetooth = false }
      manager.isSpeakerphoneOn = false
    }
  }

  private fun abandonFocus(manager: AudioManager) {
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
      focus?.let { manager.abandonAudioFocusRequest(it) }
    } else {
      @Suppress("DEPRECATION")
      manager.abandonAudioFocus(focusListener)
    }
    focus = null
  }

  private companion object {
    val wiredRoutes = setOf(
      AudioDeviceInfo.TYPE_WIRED_HEADSET, AudioDeviceInfo.TYPE_WIRED_HEADPHONES, AudioDeviceInfo.TYPE_USB_HEADSET,
    )
    val preferredRoutes = listOf(
      AudioDeviceInfo.TYPE_BLE_HEADSET, AudioDeviceInfo.TYPE_BLUETOOTH_SCO, AudioDeviceInfo.TYPE_HEARING_AID,
      AudioDeviceInfo.TYPE_WIRED_HEADSET, AudioDeviceInfo.TYPE_USB_HEADSET, AudioDeviceInfo.TYPE_WIRED_HEADPHONES,
      AudioDeviceInfo.TYPE_BUILTIN_SPEAKER,
    )
  }
}

/** Observers only post values; engine teardown and restart run in the controller. */
class AndroidVoiceLifecycle : VoiceLifecycle {
  private val channel = Channel<LifecycleEvent>(32, BufferOverflow.DROP_OLDEST)
  override val events: Flow<LifecycleEvent> = channel.receiveAsFlow()
  private var started = 0 // main thread only

  /**
   * Background is the last visible activity stopping, as UIApplication's
   * didEnterBackground. A dialog over the app, such as the permission prompt,
   * only pauses it and ends nothing.
   */
  private val activities = object : Application.ActivityLifecycleCallbacks {
    override fun onActivityStarted(activity: Activity) {
      if (started++ == 0) emit(LifecycleEvent.foreground)
    }
    override fun onActivityStopped(activity: Activity) {
      started = maxOf(0, started - 1)
      if (started == 0 && !activity.isChangingConfigurations) emit(LifecycleEvent.background)
    }
    override fun onActivityCreated(activity: Activity, state: Bundle?) = Unit
    override fun onActivityResumed(activity: Activity) = Unit
    override fun onActivityPaused(activity: Activity) = Unit
    override fun onActivitySaveInstanceState(activity: Activity, state: Bundle) = Unit
    override fun onActivityDestroyed(activity: Activity) = Unit
  }

  fun emit(event: LifecycleEvent) { channel.trySend(event) }

  /** Call on the main thread; [visible] counts the activity already started. */
  fun observe(application: Application, visible: Boolean) {
    started = if (visible) 1 else 0
    application.registerActivityLifecycleCallbacks(activities)
  }

  fun stopObserving(application: Application) { application.unregisterActivityLifecycleCallbacks(activities) }
}
