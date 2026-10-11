package au.com.opax.voice

import android.Manifest
import android.app.Activity
import android.media.AudioManager
import android.os.Looper
import android.view.WindowManager
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.withTimeout
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotNull
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
