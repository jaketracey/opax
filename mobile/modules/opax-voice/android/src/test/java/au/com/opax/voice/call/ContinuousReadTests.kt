package au.com.opax.voice.call

import au.com.opax.voice.*

import java.util.Base64
import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.NonCancellable
import kotlinx.coroutines.withContext
import kotlinx.coroutines.async
import kotlinx.coroutines.delay
import kotlinx.coroutines.withTimeout
import okhttp3.Request
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * Real loopback frames, with an injected terminal observation and write/receive
 * ordering. Models a lost close frame deterministically rather than hoping
 * OkHttp happens to surface 1006 during a concurrent pong or upload.
 */
class OrderedTerminationRelay(
  private val inner: RelayTransport,
  private val terminal: RelayClose,
  private val order: Order,
  private val write: Write,
) : RelayTransport {
  enum class Order { writeFirst, receiveFirst }
  enum class Write { pong, audio }

  private val lock = Any()
  private var writeGate: CompletableDeferred<Unit>? = null
  private var receiveGate: CompletableDeferred<Unit>? = null
  private var writeFinished = false
  private val seen = mutableListOf<String>()
  val observations get() = synchronized(lock) { seen.toList() }
  val writeWaiting get() = synchronized(lock) { writeGate != null }

  override suspend fun send(data: ByteArray) {
    val message = bodyMap(data)
    val selected = if (write == Write.pong) message["type"] == "pong" else "user_audio_chunk" in message
    if (!selected) { inner.send(data); return }
    val gate = synchronized(lock) { CompletableDeferred<Unit>().also { writeGate = it } }
    // Swift's checked continuation ignores task cancellation; so does this gate,
    // and the write is observed even when the controller cancelled the sender.
    withContext(NonCancellable) {
      gate.await()
      synchronized(lock) {
        seen += "write"
        writeFinished = true
        receiveGate?.complete(Unit)
        receiveGate = null
      }
    }
    throw RelayTerminated(terminal)
  }

  override suspend fun receive(): RelayMessage {
    val message = inner.receive()
    if (message !is RelayMessage.Closed) return message
    withContext(NonCancellable) {
      if (order == Order.writeFirst) {
        val gate = synchronized(lock) {
          releaseWrite()
          if (writeFinished) null else CompletableDeferred<Unit>().also { receiveGate = it }
        }
        gate?.await()
      }
      synchronized(lock) { seen += "receive" }
    }
    return RelayMessage.Closed(terminal)
  }

  override suspend fun close(code: Int) {
    // receiveFirst deliberately keeps the write pending until controller
    // cleanup. Both gates are released even if an assertion aborts the test.
    synchronized(lock) {
      releaseWrite()
      receiveGate?.complete(Unit)
      receiveGate = null
    }
    inner.close(code)
  }

  private fun releaseWrite() {
    writeGate?.complete(Unit)
    writeGate = null
  }
}

class OrderedTerminationFactory(
  port: Int,
  private val terminal: RelayClose,
  private val order: OrderedTerminationRelay.Order,
  private val write: OrderedTerminationRelay.Write = OrderedTerminationRelay.Write.pong,
) : RelayFactory {
  private val inner = GuardedRelayFactory(port)
  @Volatile var connected: OrderedTerminationRelay? = null

  override suspend fun connect(request: Request): RelayTransport {
    VoiceTestSafety.validate(request)
    return OrderedTerminationRelay(inner.connect(request), terminal, order, write).also { connected = it }
  }
}

class ContinuousReadTests : SafeVoiceTest() {
  private fun audio(seconds: Int = 1, id: Int = 1) = json(
    mapOf("type" to "audio", "audio_event" to mapOf("event_id" to id, "audio_base_64" to Base64.getEncoder().encodeToString(ByteArray(seconds * 16000 * 2)))),
  )

  private suspend fun deepCall(): Pair<LoopbackRelay, Rig> {
    val server = LoopbackRelay(LoopbackRelay.Scenario.Quiet)
    val port = server.start()
    val rig = Rig.make(relays = GuardedRelayFactory(port), port = port)
    rig.controller.start()
    eventually { rig.controller.state == CallState.live }
    fillPlayback(server, rig)
    return server to rig
  }

  private suspend fun fillPlayback(server: LoopbackRelay, rig: Rig) {
    repeat(30) { server.broadcast(audio()) }
    eventually { rig.engine.queued == 30 * 16000 }
    repeat(5) { server.broadcast(audio()) }
    eventually { rig.controller.bufferedPlaybackSamples() == 35 * 16000 }
  }

  @Test fun realSocketInterruptionImmediatelyFlushesThirtyFiveSecondsAndBacklog() = test {
    val (server, rig) = deepCall()
    server.broadcast(json(mapOf("type" to "interruption", "interruption_event" to mapOf("event_id" to 9))))
    eventually { rig.engine.flushes == 2 }
    assertEquals(0, rig.controller.bufferedPlaybackSamples())
    server.broadcast(audio(id = 1))
    delay(30)
    assertEquals(0, rig.controller.bufferedPlaybackSamples())
    assertEquals(CallState.live, rig.controller.state)
    server.broadcast(audio(id = 10))
    eventually { rig.engine.queued == 16000 }
    rig.close()
    server.stop()
  }

  @Test fun realSocketPingIsAnsweredWithThirtyFiveSecondsStillQueued() = test {
    val (server, rig) = deepCall()
    server.broadcast(json(mapOf("type" to "ping", "ping_event" to mapOf("event_id" to 991))))
    eventually { 991 in server.snapshot().pongIds }
    assertEquals(30 * 16000, rig.engine.queued)
    assertEquals(CallState.live, rig.controller.state)
    rig.close()
    server.stop()
  }

  @Test fun realSocketDeadlineCloseEndsAsDeadlineWhilePlaybackIsDeep() = test {
    val (server, rig) = deepCall()
    server.close(1000, "Your free voice time has finished")
    eventually { VoiceEvent.State(CallState.ended, EndReason.deadline) in rig.recorder }
    val events = rig.recorder.items
    assertFalse(VoiceEvent.Error(VoiceFailure.network) in events)
    assertFalse(events.any { it is VoiceEvent.State && it.state == CallState.failed })
    rig.close()
    server.stop()
  }

  @Test fun realSocketTranscriptAndSourcesDoNotWaitForPlayback() = test {
    val (server, rig) = deepCall()
    server.broadcast(json(mapOf("type" to "agent_response", "agent_response_event" to mapOf("event_id" to 2, "agent_response" to "Synthetic deep-buffer text"))))
    server.broadcast(json(mapOf("type" to "agent_tool_response", "agent_tool_response" to mapOf("tool_name" to "fixture", "sources" to listOf(mapOf("title" to "Synthetic", "url" to "/doc/fixture"))))))
    eventually { rig.recorder.items.any { it is VoiceEvent.Transcript && it.turns.any { turn -> turn.text == "Synthetic deep-buffer text" } } }
    eventually { rig.recorder.items.any { it is VoiceEvent.Sources && it.sources.any { source -> source.path == "/doc/fixture" } } }
    assertEquals(30 * 16000, rig.engine.queued)
    rig.close()
    server.stop()
  }

  @Test fun nativeSocketAbnormalDropAfterPingUsesFreshExhaustedStatus() = test {
    val (server, rig) = deepCall()
    server.broadcast(json(mapOf("type" to "ping", "ping_event" to mapOf("event_id" to 994))))
    eventually { 994 in server.snapshot().pongIds }
    rig.http.configure(status = signedStatus(remaining = 0))
    server.drop() // actual TCP abort; no close-code injection
    eventually { VoiceEvent.State(CallState.ended, EndReason.allowanceExhausted) in rig.recorder }
    assertFalse(rig.recorder.hasError(VoiceFailure.network))
    rig.close()
    server.stop()
  }

  @Test fun realSocketInterruptionPingAndImmediateDeadlineCloseTogether() = test {
    var completed = 0
    var failures = 0
    for (iteration in 0 until 200) {
      val server = LoopbackRelay(LoopbackRelay.Scenario.Quiet)
      val port = server.start()
      val order = if (iteration % 2 == 0) OrderedTerminationRelay.Order.writeFirst else OrderedTerminationRelay.Order.receiveFirst
      val factory = OrderedTerminationFactory(port, RelayClose(1006), order)
      val rig = Rig.make(relays = factory, port = port)
      rig.controller.start()
      eventually { rig.controller.state == CallState.live }
      fillPlayback(server, rig)
      val socket = factory.connected!!
      server.broadcast(json(mapOf("type" to "interruption", "interruption_event" to mapOf("event_id" to 9))))
      server.broadcast(json(mapOf("type" to "ping", "ping_event" to mapOf("event_id" to 993))))
      eventually { socket.writeWaiting }
      val budgetDeadline = iteration % 4 >= 2
      val expected = if (budgetDeadline) EndReason.budgetClosed else EndReason.allowanceExhausted
      rig.http.configure(status = if (budgetDeadline) signedStatus(remaining = 300, budget = false) else signedStatus(remaining = 0))
      server.close(1000, "Your free voice time has finished")
      eventually { VoiceEvent.State(CallState.ended, expected) in rig.recorder }
      eventually { socket.observations.size == 2 }
      val observed = socket.observations
      val wanted = if (order == OrderedTerminationRelay.Order.writeFirst) listOf("write", "receive") else listOf("receive", "write")
      assertEquals("iteration $iteration", wanted, observed)
      val events = rig.recorder.items
      assertFalse("iteration $iteration", VoiceEvent.Error(VoiceFailure.network) in events)
      assertEquals("iteration $iteration", 2, rig.engine.flushes)
      val expectedRequests = listOf(AuthRoute.voiceStatus, AuthRoute.voiceStart, AuthRoute.voiceFinish, AuthRoute.voiceStatus)
      assertEquals(expectedRequests, rig.http.requests)
      if (observed != wanted || VoiceEvent.Error(VoiceFailure.network) in events || rig.engine.flushes != 2 || rig.http.requests != expectedRequests) failures += 1
      rig.close()
      server.stop()
      completed += 1
    }
    assertEquals(200, completed)
    assertEquals(0, failures)
    println("CLOSE RACE: $completed loopback iterations, injected write-first/receive-first 1006; failures=$failures")
  }

  @Test fun realSocketSyntheticUploadRacingDeadlineStillEndsAsDeadline() = test {
    for (order in OrderedTerminationRelay.Order.entries) {
      val server = LoopbackRelay(LoopbackRelay.Scenario.Quiet)
      val port = server.start()
      val factory = OrderedTerminationFactory(port, RelayClose(1006), order, OrderedTerminationRelay.Write.audio)
      val rig = Rig.make(relays = factory, port = port)
      rig.controller.start()
      eventually { rig.controller.state == CallState.live }
      fillPlayback(server, rig)
      val socket = factory.connected!!
      rig.engine.feed(CaptureBuffer(FloatArray(400), 16000))
      eventually { socket.writeWaiting }
      rig.http.configure(status = signedStatus(remaining = 0))
      server.close(1000, "Your free voice time has finished")
      eventually { VoiceEvent.State(CallState.ended, EndReason.allowanceExhausted) in rig.recorder }
      eventually { socket.observations.size == 2 }
      val wanted = if (order == OrderedTerminationRelay.Order.writeFirst) listOf("write", "receive") else listOf("receive", "write")
      assertEquals(wanted, socket.observations)
      assertFalse(rig.recorder.hasError(VoiceFailure.network))
      rig.close()
      server.stop()
    }
  }

  @Test fun terminalSignalBroadcastsCachesAndCancelsWithoutOverwritingClose() = test {
    val signal = SocketCloseSignal()
    val expected = RelayClose(1000, "Your free voice time has finished")
    val first = async { signal.value() }
    val second = async { signal.value() }
    eventually { signal.waiterCount == 2 }
    signal.resolve(expected)
    signal.resolve(RelayClose(1006))
    assertEquals(expected, first.await())
    assertEquals(expected, second.await())
    assertEquals(expected, signal.value())
    val pending = SocketCloseSignal()
    val cancelled = async { pending.value() }
    eventually { pending.waiterCount == 1 }
    cancelled.cancel()
    // Kotlin cancels the waiter rather than returning nil; it leaves without a value.
    assertTrue(runCatching { cancelled.await() }.isFailure)
    assertEquals(0, pending.waiterCount)
    pending.resolve(expected)
    assertEquals(expected, withTimeout(1000) { pending.value() })
  }

  @Test fun realSocketOverflowTruncatesAndInterruptionClearsItWithoutFailure() = test {
    val (server, rig) = deepCall()
    repeat(45) { server.broadcast(audio()) }
    eventually { VoiceEvent.Playback(PlaybackState.truncated) in rig.recorder }
    assertTrue(rig.controller.bufferedPlaybackSamples() <= 60 * 16000)
    assertEquals(CallState.live, rig.controller.state)
    server.broadcast(json(mapOf("type" to "interruption", "interruption_event" to mapOf("event_id" to 9))))
    server.broadcast(json(mapOf("type" to "ping", "ping_event" to mapOf("event_id" to 992))))
    eventually { 992 in server.snapshot().pongIds }
    assertEquals(0, rig.controller.bufferedPlaybackSamples())
    assertEquals(PlaybackState.flowing, rig.controller.playbackState)
    assertFalse(rig.recorder.hasError(VoiceFailure.queueOverflow))
    server.close(1000, "Your free voice time has finished")
    eventually { rig.controller.state == CallState.ended }
    rig.close()
    server.stop()
  }
}
