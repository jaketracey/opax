package au.com.opax.voice.call

import au.com.opax.voice.*

import android.Manifest
import android.app.Activity
import android.media.AudioManager
import android.os.Looper
import android.view.WindowManager
import java.util.UUID
import java.util.concurrent.atomic.AtomicBoolean
import java.util.concurrent.atomic.AtomicInteger
import java.util.concurrent.atomic.AtomicReference
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.launch
import kotlinx.coroutines.withTimeout
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Assert.fail
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.Robolectric
import org.robolectric.RobolectricTestRunner
import org.robolectric.RuntimeEnvironment
import org.robolectric.Shadows.shadowOf
import org.robolectric.annotation.Config

/**
 * The Android hardware path, on Robolectric's framework shadows: nothing here
 * reaches the host's microphone or speakers. Port of
 * testAppleHardwareEntryPointsFailBeforeCreatingIO plus focus, mode, wake and
 * permission behaviour that has no iOS test.
 */
@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34])
class AndroidAudioTests : SafeVoiceTest() {
  private val context get() = RuntimeEnvironment.getApplication()
  private val audioManager get() = context.getSystemService(AudioManager::class.java)

  @Test fun androidHardwareEntryPointsFailBeforeCreatingIo() = test {
    VoiceTestSafety.withIsolated(VoiceTestSafety.Monitor()) {
      val lifecycle = AndroidVoiceLifecycle()
      val engine = AndroidVoiceEngineFactory(lifecycle).make()
      try {
        engine.start(AudioFormat("pcm_16000"), AudioFormat("pcm_16000"))
        fail("Hardware guard missing")
      } catch (error: VoiceException) {
        assertEquals(VoiceFailure.audio, error.failure)
      }
      shadowOf(context).grantPermissions(Manifest.permission.RECORD_AUDIO)
      assertFalse(AndroidMicrophonePermission(context).request())
      try {
        AndroidVoiceAudioSession(context, lifecycle) { null }.activate()
        fail("Session guard missing")
      } catch (error: VoiceException) {
        assertEquals(VoiceFailure.audio, error.failure)
      }
      assertEquals(AudioManager.MODE_NORMAL, audioManager.mode)
      assertFalse(VoiceTestSafety.audit().isClean)
      assertEquals(1, VoiceTestSafety.audit().inputOpens)
      assertEquals(1, VoiceTestSafety.audit().outputOpens)
    }
  }

  @Test fun startOnlyChecksThePermissionJavaScriptAskedFor() = test {
    VoiceTestSafety.withIsolated(VoiceTestSafety.Monitor(loopbackOnly = false)) {
      val permission = AndroidMicrophonePermission(context)
      shadowOf(context).denyPermissions(Manifest.permission.RECORD_AUDIO)
      assertFalse(permission.request())
      shadowOf(context).grantPermissions(Manifest.permission.RECORD_AUDIO)
      assertTrue(permission.request())
      // No activity exists: the check can never show a dialog or rationale.
      assertEquals(0, VoiceTestSafety.audit().inputOpens)
    }
  }

  @Test fun developmentBuildsNeverPassTheMicrophoneCheck() = test {
    shadowOf(context).grantPermissions(Manifest.permission.RECORD_AUDIO)
    // Debug unit tests compile the development switch: neither e2e nor production voice.
    assertFalse(BuildConfig.OPAX_VOICE_E2E)
    assertFalse(BuildConfig.OPAX_VOICE_PRODUCTION)
    assertFalse(VoiceCallVariant.permission(context).request())
  }

  @Test fun focusModeAndInterruptionForOneCall() = test {
    VoiceTestSafety.withIsolated(VoiceTestSafety.Monitor(loopbackOnly = false)) {
      val lifecycle = AndroidVoiceLifecycle()
      val session = AndroidVoiceAudioSession(context, lifecycle) { null }
      session.activate()
      assertEquals(AudioManager.MODE_IN_COMMUNICATION, audioManager.mode)
      val request = shadowOf(audioManager).lastAudioFocusRequest
      assertNotNull(request)
      assertEquals(AudioManager.AUDIOFOCUS_GAIN_TRANSIENT, request.durationHint)
      // A phone call takes focus: the call ends as an iOS interruption does.
      request.listener.onAudioFocusChange(AudioManager.AUDIOFOCUS_LOSS_TRANSIENT)
      shadowOf(Looper.getMainLooper()).idle()
      assertEquals(LifecycleEvent.interruptionBegan, withTimeout(1000) { lifecycle.events.first() })
      session.deactivate()
      assertEquals(AudioManager.MODE_NORMAL, audioManager.mode)
      assertNotNull(shadowOf(audioManager).lastAbandonedAudioFocusRequest)
    }
  }

  @Test fun refusedFocusFailsTheSessionWithoutChangingMode() = test {
    VoiceTestSafety.withIsolated(VoiceTestSafety.Monitor(loopbackOnly = false)) {
      shadowOf(audioManager).setNextFocusRequestResponse(AudioManager.AUDIOFOCUS_REQUEST_FAILED)
      try {
        AndroidVoiceAudioSession(context, AndroidVoiceLifecycle()) { null }.activate()
        fail()
      } catch (error: VoiceException) {
        assertEquals(VoiceFailure.audio, error.failure)
      }
      assertEquals(AudioManager.MODE_NORMAL, audioManager.mode)
    }
  }

  @Test fun keepAwakeFollowsCallOrderOnTheMainThread() = test {
    val activity = Robolectric.buildActivity(Activity::class.java).setup().get()
    val session = AndroidVoiceAudioSession(context, AndroidVoiceLifecycle()) { activity }
    session.keepAwake(true)
    session.keepAwake(false)
    session.keepAwake(true)
    shadowOf(Looper.getMainLooper()).idle()
    assertTrue((activity.window.attributes.flags and WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON) != 0)
    session.keepAwake(false)
    shadowOf(Looper.getMainLooper()).idle()
    assertEquals(0, activity.window.attributes.flags and WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
  }

  @Test fun backgroundIsTheLastActivityStoppingNotAPause() = test {
    val activity = Robolectric.buildActivity(Activity::class.java).setup()
    val lifecycle = AndroidVoiceLifecycle()
    lifecycle.observe(context, visible = true)
    val events = mutableListOf<LifecycleEvent>()
    val collecting = launch(Dispatchers.Unconfined) { lifecycle.events.collect { events += it } }
    activity.pause() // a permission dialog or other window over the app
    activity.resume()
    assertEquals(emptyList<LifecycleEvent>(), events)
    activity.pause().stop()
    assertEquals(listOf(LifecycleEvent.background), events)
    activity.start()
    assertEquals(listOf(LifecycleEvent.background, LifecycleEvent.foreground), events)
    lifecycle.stopObserving(context)
    activity.stop()
    assertEquals(2, events.size)
    collecting.cancel()
  }

  /**
   * Review P2-1. React Native's Android AppState says "background" on every
   * pause, and Talk then calls background(). A pause (a dialog, split screen, a
   * share sheet) must not end the call; the last activity stopping does.
   */
  @Test fun aPauseNeverEndsALiveCallARealBackgroundDoes() = test {
    val activity = Robolectric.buildActivity(Activity::class.java).setup()
    val lifecycle = AndroidVoiceLifecycle()
    lifecycle.observe(context, visible = true)
    val rig = Rig.make(androidLifecycle = lifecycle)
    val voice = VoiceController(rig.controller, rig.client, StoredVoiceConsent(context, "consent-" + UUID.randomUUID()), lifecycle)
    try {
      rig.live()
      activity.pause()
      assertFalse(lifecycle.inBackground)
      voice.background()
      assertEquals(CallState.live, rig.controller.state)
      activity.resume()
      // Home: JS hears the pause first, then the stop ends the call natively.
      activity.pause()
      voice.background()
      assertEquals(CallState.live, rig.controller.state)
      activity.stop()
      assertTrue(lifecycle.inBackground)
      eventually { rig.controller.state == CallState.ended }
      assertEquals(EndReason.background, rig.controller.snapshot().reason)
      voice.background() // the late bridge call changes nothing
      assertEquals(CallState.ended, rig.controller.state)
    } finally {
      lifecycle.stopObserving(context)
      rig.close()
    }
  }

  @Test fun theBridgeEndsTheCallWhenNoActivityIsStarted() = test {
    val lifecycle = AndroidVoiceLifecycle()
    lifecycle.observe(context, visible = false)
    val rig = Rig.make(androidLifecycle = lifecycle)
    val voice = VoiceController(rig.controller, rig.client, StoredVoiceConsent(context, "consent-" + UUID.randomUUID()), lifecycle)
    try {
      rig.live()
      assertTrue(lifecycle.inBackground)
      voice.background()
      eventually { rig.controller.state == CallState.ended }
      assertEquals(EndReason.background, rig.controller.snapshot().reason)
      // Before the module observes anything, the bridge fails safe and acts, as on iOS.
      assertTrue(AndroidVoiceLifecycle().inBackground)
    } finally {
      lifecycle.stopObserving(context)
      rig.close()
    }
  }

  /** As AudioTrack: any call on a released track throws IllegalStateException. */
  private class TrackLikeSink : PcmSink {
    @Volatile var released = false
    private fun live() = check(!released) { "released track" }
    override fun write(samples: ShortArray, offset: Int, count: Int): Int { live(); return count }
    override fun playedFrames(): Long { live(); return 0 }
    override fun flush() = live()
    override fun release() { live(); released = true }
  }

  /**
   * Review P2-2. A rebuild releases the AudioTrack while the controller's meter
   * and drain polls keep reading the play head; none may reach the released track.
   */
  @Test fun playbackWriterNeverTouchesAReleasedTrack() = test {
    val sink = TrackLikeSink()
    val writer = PlaybackWriter(sink)
    writer.enqueue(FloatArray(1600) { 0.25f })
    writer.release()
    assertTrue(sink.released)
    assertEquals(0f, writer.level())
    assertEquals(0, writer.queued())
    writer.flush()
    writer.release()
    repeat(200) { round ->
      val track = TrackLikeSink()
      val racing = PlaybackWriter(track)
      racing.enqueue(FloatArray(800) { 0.5f })
      val failure = AtomicReference<Throwable?>(null)
      val stop = AtomicBoolean(false)
      val polls = AtomicInteger()
      val meter = Thread {
        while (!stop.get()) {
          try { racing.level(); racing.queued() } catch (error: Throwable) { failure.compareAndSet(null, error) }
          polls.incrementAndGet()
        }
      }.apply { start() }
      racing.release()
      val after = polls.get()
      eventually { polls.get() > after + 20 }
      stop.set(true); meter.join()
      assertTrue(track.released)
      assertNull("round $round", failure.get())
    }
  }

  /** A playback device that presents frames only when the test says so. */
  private class FakeSink(private val capacity: Int) : PcmSink {
    @Volatile var written = 0L
    @Volatile var played = 0L
    var flushes = 0
    var released = false
    override fun write(samples: ShortArray, offset: Int, count: Int): Int = synchronized(this) {
      val accepted = minOf(count.toLong(), capacity - (written - played)).toInt()
      written += accepted
      accepted
    }
    override fun playedFrames() = synchronized(this) { played }
    fun play(frames: Int) = synchronized(this) { played = minOf(written, played + frames) }
    override fun flush() = synchronized(this) { flushes += 1; written = 0; played = 0 }
    override fun release() { released = true }
  }

  @Test fun playbackWriterQueuesDrainsFlushesAndMetersThePlayHead() = test {
    val sink = FakeSink(3200)
    val writer = PlaybackWriter(sink)
    writer.enqueue(FloatArray(8000) { 0.5f })
    writer.enqueue(FloatArray(8000))
    eventually { sink.written == 3200L }
    assertEquals(16000, writer.queued())
    assertTrue(writer.level() > 0.8f) // loud slice at the play head
    sink.play(1600)
    eventually { sink.written == 4800L }
    assertEquals(14400, writer.queued())
    // Drain signal: the queue reaches a bound only as frames are presented.
    repeat(4) {
      eventually { sink.written == minOf(16000L, sink.played + 3200) } // the writer refilled the device
      sink.play(3200)
      eventually { writer.queued() <= 16000 - 1600 - 3200 * (it + 1) }
    }
    eventually { sink.written == 16000L }
    sink.play(16000)
    assertEquals(0, writer.queued())
    assertEquals(0f, writer.level())
    writer.enqueue(FloatArray(4000) { 0.5f })
    eventually { sink.written == 16000L + 3200 }
    writer.flush()
    assertEquals(1, sink.flushes)
    assertEquals(0, writer.queued())
    assertEquals(0f, writer.level())
    writer.release()
    assertTrue(sink.released)
  }
}
