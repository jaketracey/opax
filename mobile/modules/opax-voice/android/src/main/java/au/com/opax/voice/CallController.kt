package au.com.opax.voice

import java.util.concurrent.CancellationException
import kotlin.math.max
import kotlin.math.min
import kotlin.math.pow
import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.Job
import kotlinx.coroutines.NonCancellable
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.channels.BufferOverflow
import kotlinx.coroutines.channels.Channel
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.receiveAsFlow
import kotlinx.coroutines.currentCoroutineContext
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import kotlinx.coroutines.yield

data class CallTiming(
  val connectTimeout: Double = 35.0,
  val pollInterval: Double = 2.0,
  val pollMaxInterval: Double = 30.0,
  val pollMaxAttempts: Int = 24,
)

/** What the call needs from the account half's HTTP client (VoiceHTTPClient on iOS). */
interface VoiceCallHttp {
  suspend fun status(): VoiceStatus
  suspend fun start(): Reservation
  suspend fun finish(sessionId: String)
  suspend fun relayRequest(reservation: Reservation): CredentialRequest
  suspend fun observeRelayFailure(failure: APIFailure, credential: SessionCredential?)
  suspend fun logout(everywhere: Boolean)
  suspend fun requestDeletionCode(): DeletionChallenge
  suspend fun deleteAccount(challengeId: String, code: String): AccountDeletion
}

/**
 * The iOS actor: one serial context owns state and decoding, and calls
 * interleave only at suspension points. Record and playback threads never enter it.
 */
@OptIn(ExperimentalCoroutinesApi::class)
class VoiceCallController(
  private val http: VoiceCallHttp,
  private val relays: RelayFactory,
  private val engines: VoiceEngineFactory,
  private val permission: MicrophonePermission,
  private val consent: VoiceConsent,
  private val audioSession: VoiceAudioSession,
  private val lifecycle: VoiceLifecycle,
  private val clock: VoiceClock = SystemVoiceClock,
  private val timing: CallTiming = CallTiming(),
) {
  private val actor = Dispatchers.Default.limitedParallelism(1)
  private val scope = CoroutineScope(SupervisorJob() + actor)
  private val eventChannel = Channel<VoiceEvent>(128, BufferOverflow.DROP_OLDEST)
  /** Single consumer, newest 128 kept, as Swift's `AsyncStream(.bufferingNewest(128))`. */
  val events: Flow<VoiceEvent> = eventChannel.receiveAsFlow()
  /** Call-screen animation only, kept apart so levels never displace events. */
  private val levelChannel = Channel<AudioLevels>(Channel.CONFLATED)
  val levels: Flow<AudioLevels> = levelChannel.receiveAsFlow()

  @Volatile var state = CallState.idle
    private set
  @Volatile var latestStatus: VoiceStatusSnapshot? = null
    private set
  @Volatile var playbackState = PlaybackState.flowing
    private set

  private var lifecycleJob: Job? = null
  private var playbackJob: Job? = null
  private var playbackDrainJob: Job? = null
  private class PlaybackChunk(val bytes: ByteArray, val id: Int, val samples: Int)
  private var playbackBacklog = BoundedQueue<PlaybackChunk>(480000)
  private var playbackInFlight = 0
  private var playbackEpoch = 0
  private var playbackRevision = 0
  private var relayCredential: SessionCredential? = null
  private var refreshes = 0
  private var receiveJob: Job? = null
  private val pongJobs = mutableMapOf<Any, Job>()
  private var captureJob: Job? = null
  private var sendJob: Job? = null
  private var timerJob: Job? = null
  private var countdownJob: Job? = null
  private var meterJob: Job? = null
  private var pollJob: Job? = null
  private var socket: RelayTransport? = null
  private var engine: VoiceAudioEngine? = null
  private var converter: CaptureConverter? = null
  private var reservation: Reservation? = null
  private var inputFormat: AudioFormat? = null
  private var outputFormat: AudioFormat? = null
  private var chunks: ChunkAccumulator? = null
  private var sendQueue = BoundedQueue<ByteArray>(80000) // replaced after metadata; 2 seconds, measured in samples
  private var inFlightSamples = 0
  private var epoch = 0
  private var muted = false
  private var mode: CallMode? = null
  private var reason: EndReason? = null
  private var interruptionId = 0
  private var evidence = EvidenceModel()
  private var remaining = 0
  private val endWaiters = mutableListOf<CompletableDeferred<Unit>>()

  /** Reads controller-owned values atomically; does not refresh, emit or open a call. */
  suspend fun snapshot(): VoiceSnapshot = withContext(actor) {
    VoiceSnapshot(state, reason, mode, playbackState, remaining, evidence.turns, evidence.sources, latestStatus)
  }

  /**
   * The UI discards transient captions only after leaving a finished call.
   * End itself retains them for the on-screen end state and snapshot recovery.
   */
  suspend fun discardEvidence() = withContext(actor) {
    if (state in callBusy) return@withContext
    evidence = EvidenceModel()
    emit(VoiceEvent.Transcript(emptyList()))
    emit(VoiceEvent.Sources(emptyList()))
  }

  private fun observe() {
    if (lifecycleJob != null) return
    val events = lifecycle.events
    lifecycleJob = scope.launch { events.collect { handleOnActor(it) } }
  }

  private fun emit(event: VoiceEvent) { eventChannel.trySend(event) }

  private fun change(state: CallState, reason: EndReason? = null) {
    this.state = state
    this.reason = reason
    emit(VoiceEvent.State(state, reason))
  }

  private fun clearStatus() {
    latestStatus = null
    emit(VoiceEvent.Status(null))
  }

  private fun changeMode(value: CallMode) {
    if (value == mode) return
    mode = value
    emit(VoiceEvent.Mode(value))
  }

  private fun changePlayback(value: PlaybackState) {
    if (playbackState == value) return
    playbackState = value
    emit(VoiceEvent.Playback(value))
  }

  internal suspend fun bufferedPlaybackSamples(): Int = withContext(actor) {
    playbackBacklog.weight + playbackInFlight + (engine?.queuedSamples() ?: 0)
  }

  suspend fun refreshStatus(): VoiceStatusSnapshot = withContext(actor) { refreshOnActor() }

  private suspend fun refreshOnActor(): VoiceStatusSnapshot {
    observe()
    refreshes += 1
    try {
      val requestEpoch = epoch
      val isBusy = state in refreshBusy
      if (!isBusy) change(CallState.checking)
      try {
        val status = http.status()
        if (requestEpoch != epoch) return status.bridgeValue
        latestStatus = status.bridgeValue
        emit(VoiceEvent.Status(status.bridgeValue))
        if (!isBusy) change(if (status.refusal == null) CallState.ready else CallState.unavailable)
        status.refusal?.takeIf { !isBusy }?.let { emit(VoiceEvent.Error(it)) }
        if (status.activeSession != null) schedulePoll()
        return status.bridgeValue
      } catch (error: Throwable) {
        if (requestEpoch == epoch) {
          clearStatus()
          if (!isBusy) {
            change(CallState.failed)
            emit(VoiceEvent.Error(failureOf(error)))
          }
        }
        if (error is CancellationException) throw error
        throw VoiceException(failureOf(error))
      }
    } finally {
      refreshes -= 1
    }
  }

  suspend fun start() = withContext(actor) { startOnActor() }

  private suspend fun startOnActor() {
    observe()
    if (refreshes != 0) { emit(VoiceEvent.Error(VoiceFailure.statusChecking)); return }
    if (state in callBusy) { emit(VoiceEvent.Error(VoiceFailure.callOpen)); return }
    epoch += 1
    val attempt = epoch
    pollJob?.cancel()
    pollJob = null
    evidence = EvidenceModel()
    interruptionId = 0
    muted = false
    mode = null
    playbackEpoch += 1
    playbackBacklog.clear()
    playbackInFlight = 0
    changePlayback(PlaybackState.flowing)
    emit(VoiceEvent.Transcript(emptyList()))
    emit(VoiceEvent.Sources(emptyList()))
    change(CallState.checking)
    try {
      val status = http.status()
      if (epoch != attempt) return
      latestStatus = status.bridgeValue
      emit(VoiceEvent.Status(status.bridgeValue))
      status.refusal?.let {
        change(CallState.unavailable)
        emit(VoiceEvent.Error(it))
        if (status.activeSession != null) schedulePoll()
        return
      }
      change(CallState.ready)
      change(CallState.checking)
      if (!consent.isGranted()) throw VoiceException(VoiceFailure.consentRequired)
      if (epoch != attempt) return
      // Stay checking while permission is pending so a second Start is refused.
      change(CallState.checking)
      if (!permission.request()) throw VoiceException(VoiceFailure.microphoneDenied)
      if (epoch != attempt) return
      audioSession.activate()
      if (epoch != attempt) { audioSession.deactivate(); return }
      change(CallState.reserving)
      val reserved = http.start()
      if (epoch != attempt) {
        // A late reservation after End must still be cancelled, even though the caller no longer owns state.
        withContext(NonCancellable) {
          runCatching { http.finish(reserved.sessionId) }
          runCatching { refreshOnActor() }
        }
        return
      }
      reservation = reserved
      remaining = reserved.remainingSeconds.toInt()
      emit(VoiceEvent.RemainingTime(remaining))
      change(CallState.connecting)
      val request = http.relayRequest(reserved)
      if (epoch != attempt) return
      timerJob = scope.launch {
        clock.sleep(timing.connectTimeout)
        timeout(attempt)
      }
      relayCredential = request.credential
      val connected = relays.connect(request.request)
      if (epoch != attempt) { connected.close(1000); return }
      socket = connected
      // OkHttp queues this first message until the upgrade opens. The relay's
      // ten-second initiation timer starts at upgrade, not here; its provider
      // setup can take twenty seconds before the 101.
      connected.send(ClientMessage.Initiation.data())
      if (epoch != attempt) return
      receiveJob = scope.launch { receive(attempt) }
    } catch (error: Throwable) {
      if (epoch == attempt) transportEnded(error, EndReason.failed)
      if (error is CancellationException) throw error
    }
  }

  private suspend fun timeout(attempt: Int) {
    if (epoch != attempt || state != CallState.connecting) return
    terminate(EndReason.failed, VoiceFailure.timeout)
  }

  private suspend fun transportEnded(error: Throwable, fallback: EndReason) {
    if (error is RelayTerminated) {
      terminate(error.close.endReason, error.close.failure, closeCode = error.close.code)
    } else {
      terminate(fallback, failureOf(error), api = error as? APIFailure)
    }
  }

  private suspend fun receive(attempt: Int) {
    try {
      while (epoch == attempt) {
        val socket = socket ?: return
        // iOS hops to the relay actor for every frame. Yield likewise, so a burst
        // of buffered frames never starves playback, capture or sends.
        yield()
        if (epoch != attempt) return
        val message = socket.receive()
        if (epoch != attempt) return
        when (message) {
          is RelayMessage.Closed -> {
            terminate(message.close.endReason, message.close.failure, closeCode = message.close.code)
            return
          }
          is RelayMessage.Data -> process(ProviderEvent.decode(message.bytes), attempt)
        }
      }
    } catch (error: Throwable) {
      if (epoch != attempt) return
      transportEnded(error, EndReason.failed)
    }
  }

  private suspend fun process(event: ProviderEvent, attempt: Int) {
    when (event) {
      is ProviderEvent.Metadata -> {
        if (state != CallState.connecting || engine != null) throw VoiceException(VoiceFailure.policy)
        // Both formats were validated before any engine, converter or buffer allocation.
        val input = event.input
        val output = event.output
        inputFormat = input
        outputFormat = output
        chunks = ChunkAccumulator(input.rate)
        converter = CaptureConverter(input.rate)
        sendQueue = BoundedQueue(input.rate * 2)
        inFlightSamples = 0
        playbackBacklog = BoundedQueue(output.rate * PlaybackLimits.backlogSeconds)
        val created = engines.make()
        if (epoch != attempt) { withContext(NonCancellable) { created.stop() }; return }
        // Adopted before it opens anything: teardown stops it from here on.
        engine = created
        created.start(input, output)
        if (epoch != attempt) return
        created.flush(playbackEpoch)
        if (epoch != attempt) return
        timerJob?.cancel()
        timerJob = null
        audioSession.keepAwake(true)
        if (epoch != attempt) return
        change(CallState.live)
        changeMode(CallMode.listening)
        captureJob = scope.launch { capture(attempt) }
        countdownJob = scope.launch {
          while (isActive) {
            clock.sleep(1.0)
            tick(attempt)
          }
        }
        meterJob = scope.launch {
          while (isActive) {
            clock.sleep(1.0 / 15)
            meter(attempt)
          }
        }
      }
      is ProviderEvent.Ping -> {
        val socket = socket ?: return
        val data = ClientMessage.Pong(event.id).data()
        val key = Any()
        pongJobs[key] = scope.launch {
          // The continuously pending receiver owns close/drop classification.
          // A pong racing a normal deadline close must not replace it with a send error.
          runCatching { socket.send(data) }
          pongJobs.remove(key)
        }
      }
      is ProviderEvent.Audio -> {
        val format = outputFormat ?: return
        if (state != CallState.live || event.id < interruptionId) return
        enqueuePlayback(event.bytes, event.id, format, attempt)
      }
      is ProviderEvent.Interruption -> {
        interruptionId = max(interruptionId, event.id)
        playbackRevision += 1
        playbackEpoch += 1
        playbackDrainJob?.cancel()
        playbackDrainJob = null
        playbackBacklog.clear()
        playbackInFlight = 0
        engine?.flush(playbackEpoch)
        changePlayback(PlaybackState.flowing)
        changeMode(if (muted) CallMode.muted else CallMode.listening)
      }
      is ProviderEvent.Transcript -> {
        evidence.add(event.turn, event.correction)
        emit(VoiceEvent.Transcript(evidence.turns))
        emit(VoiceEvent.Sources(evidence.sources))
      }
      is ProviderEvent.Tool -> {
        evidence.collect(event.json["agent_tool_response"])
        evidence.collect(event.json["agent_tool_response_full_payload"])
        evidence.collect(event.json)
        emit(VoiceEvent.Sources(evidence.sources))
        if (event.endsCall) terminate(EndReason.provider, null)
      }
      ProviderEvent.Deadline -> terminate(EndReason.deadline, null)
      ProviderEvent.Error -> throw VoiceException(VoiceFailure.unavailable)
      ProviderEvent.Unknown -> Unit
    }
  }

  private fun enqueuePlayback(bytes: ByteArray, id: Int, format: AudioFormat, attempt: Int) {
    val stride = if (format.codec == AudioFormat.Codec.pcm) 2 else 1
    if (bytes.size % stride != 0) return
    val samples = bytes.size / stride
    val accepted = min(samples, max(0, playbackBacklog.limit - playbackBacklog.weight - playbackInFlight))
    var offset = 0
    while (offset < accepted) {
      val count = min(format.rate, accepted - offset)
      val chunk = PlaybackChunk(bytes.copyOfRange(offset * stride, (offset + count) * stride), id, count)
      // Capacity was checked in this serial context without any suspension.
      playbackBacklog.append(chunk, count)
      offset += count
    }
    if (accepted < samples) changePlayback(PlaybackState.truncated)
    else if (accepted > 0 && playbackState != PlaybackState.truncated) changePlayback(PlaybackState.buffering)
    if (playbackDrainJob == null && playbackBacklog.count > 0) {
      val generation = playbackEpoch
      playbackDrainJob = scope.launch { drainPlayback(attempt, generation) }
    }
  }

  private suspend fun drainPlayback(attempt: Int, generation: Int) {
    try {
      while (epoch == attempt && playbackEpoch == generation) {
        val engine = engine ?: break
        val format = outputFormat ?: break
        val chunk = playbackBacklog.pop() ?: break
        playbackInFlight = chunk.samples
        engine.waitForPlayback(format.rate * PlaybackLimits.maximumSeconds - chunk.samples)
        if (epoch != attempt || playbackEpoch != generation || chunk.id < interruptionId) return
        val samples = AudioCodec.decode(chunk.bytes, format)
        engine.schedule(samples, format.rate, generation)
        if (epoch != attempt || playbackEpoch != generation) return
        playbackInFlight = 0
        playbackRevision += 1
        changeMode(if (muted) CallMode.muted else CallMode.speaking)
        watchPlayback(engine, attempt)
      }
      if (epoch != attempt || playbackEpoch != generation) return
      playbackDrainJob = null
      if (playbackState != PlaybackState.truncated) changePlayback(PlaybackState.flowing)
    } catch (error: Throwable) {
      if (epoch != attempt || playbackEpoch != generation) return
      terminate(EndReason.failed, failureOf(error))
    }
  }

  private fun watchPlayback(engine: VoiceAudioEngine, attempt: Int) {
    if (playbackJob != null) return
    playbackJob = scope.launch {
      try {
        engine.waitForPlayback(0)
      } catch (_: Throwable) {
        return@launch
      }
      playbackDrained(attempt)
    }
  }

  private suspend fun playbackDrained(attempt: Int) {
    if (epoch != attempt) return
    val engine = engine ?: return
    val revision = playbackRevision
    val queued = engine.queuedSamples()
    if (epoch != attempt) return
    playbackJob = null
    if (queued > 0 || revision != playbackRevision) { watchPlayback(engine, attempt); return }
    if (playbackBacklog.count > 0 || playbackInFlight > 0) return // the drain installs the next completion watch
    changePlayback(PlaybackState.flowing)
    changeMode(if (muted) CallMode.muted else CallMode.listening)
  }

  private suspend fun capture(attempt: Int) {
    try {
      while (epoch == attempt && state == CallState.live) {
        val engine = engine ?: return
        val converter = converter ?: return
        val inputFormat = inputFormat ?: return
        val input = engine.capture() ?: return
        val mono = converter.convert(input)
        if (epoch != attempt) return
        for (chunk in chunks?.append(mono).orEmpty()) {
          if (sendQueue.weight + inFlightSamples + chunk.size > inputFormat.rate * 2) {
            throw VoiceException(VoiceFailure.queueOverflow)
          }
          sendQueue.append(AudioCodec.encode(chunk, inputFormat, muted), chunk.size)
        }
        if (sendJob == null && sendQueue.count > 0) sendJob = scope.launch { drain(attempt) }
      }
    } catch (error: Throwable) {
      if (epoch != attempt) return
      terminate(EndReason.failed, failureOf(error))
    }
  }

  private suspend fun drain(attempt: Int) {
    try {
      while (epoch == attempt) {
        val bytes = sendQueue.pop() ?: break
        val socket = socket ?: break
        val inputFormat = inputFormat ?: break
        inFlightSamples = bytes.size / if (inputFormat.codec == AudioFormat.Codec.pcm) 2 else 1
        socket.send(ClientMessage.Audio(bytes).data())
        if (epoch != attempt) return
        inFlightSamples = 0
      }
      if (epoch == attempt) sendJob = null
    } catch (error: Throwable) {
      if (epoch != attempt) return
      transportEnded(error, EndReason.network)
    }
  }

  private suspend fun meter(attempt: Int) {
    if (epoch != attempt || state != CallState.live) return
    val engine = engine ?: return
    val value = engine.levels()
    if (epoch != attempt || state != CallState.live) return
    levelChannel.trySend(value)
  }

  private fun tick(attempt: Int) {
    if (epoch != attempt || state != CallState.live) return
    remaining = max(0, remaining - 1)
    emit(VoiceEvent.RemainingTime(remaining))
    // Display only. Never end locally at zero; the relay deadline is authoritative.
  }

  suspend fun setMuted(value: Boolean) = withContext(actor) {
    if (state != CallState.live) return@withContext
    muted = value
    engine?.setMuted(value)
    changeMode(
      when {
        value -> CallMode.muted
        (engine?.queuedSamples() ?: 0) > 0 -> CallMode.speaking
        else -> CallMode.listening
      },
    )
  }

  suspend fun sendText(text: String): Unit = withContext(actor) {
    if (state != CallState.live) throw VoiceException(VoiceFailure.callOpen)
    socket?.send(ClientMessage.Message(text).data())
  }

  suspend fun contextualUpdate(text: String): Unit = withContext(actor) {
    if (state != CallState.live) throw VoiceException(VoiceFailure.callOpen)
    socket?.send(ClientMessage.ContextualUpdate(text).data())
  }

  suspend fun userActivity(): Unit = withContext(actor) {
    if (state != CallState.live) throw VoiceException(VoiceFailure.callOpen)
    socket?.send(ClientMessage.Activity.data())
  }

  suspend fun end() = withContext(actor) { endOnActor() }

  private suspend fun endOnActor() {
    if (state == CallState.ending) {
      val waiter = CompletableDeferred<Unit>()
      endWaiters += waiter
      waiter.await()
      return
    }
    terminate(EndReason.user, null)
  }

  suspend fun withdrawConsent() = withContext(actor) { terminate(EndReason.consentWithdrawn, null) }

  suspend fun logout(everywhere: Boolean = false) = withContext(actor) {
    endOnActor()
    var failure: VoiceFailure? = null
    try {
      http.logout(everywhere)
    } catch (error: Throwable) {
      if (error is CancellationException) throw error
      failure = failureOf(error)
    }
    runCatching { refreshOnActor() }
    failure?.let { throw VoiceException(it) }
  }

  suspend fun requestDeletionCode(): DeletionChallenge = withContext(actor) {
    try {
      http.requestDeletionCode()
    } catch (error: Throwable) {
      if (error is CancellationException) throw error
      throw VoiceException(failureOf(error))
    }
  }

  suspend fun deleteAccount(challengeId: String, code: String): AccountDeletion = withContext(actor) {
    endOnActor() // finish/close before deleting; never infer a budget refund
    try {
      val result = http.deleteAccount(challengeId, code)
      evidence = EvidenceModel()
      clearStatus()
      emit(VoiceEvent.Transcript(emptyList()))
      emit(VoiceEvent.Sources(emptyList()))
      runCatching { refreshOnActor() }
      result
    } catch (error: Throwable) {
      if (error is CancellationException) throw error
      throw VoiceException(failureOf(error))
    }
  }

  suspend fun handle(event: LifecycleEvent) = withContext(actor) { handleOnActor(event) }

  private suspend fun handleOnActor(event: LifecycleEvent) {
    if (state !in lifecycleWatched) return
    when (event) {
      LifecycleEvent.interruptionBegan, LifecycleEvent.becameInactive -> terminate(EndReason.interruption, null)
      LifecycleEvent.background -> terminate(EndReason.background, null)
      LifecycleEvent.mediaServicesReset -> terminate(EndReason.mediaReset, null)
      LifecycleEvent.configurationChanged -> {
        val engine = engine ?: return
        val inputFormat = inputFormat ?: return
        if (state != CallState.live) return
        val attempt = epoch
        try {
          engine.reconfigure()
          if (epoch != attempt) return
          converter = CaptureConverter(inputFormat.rate) // hardware format changed; socket stays open
        } catch (error: Throwable) {
          if (epoch == attempt) terminate(EndReason.failed, VoiceFailure.audio)
        }
      }
      LifecycleEvent.interruptionEnded, LifecycleEvent.resumptionRecommended,
      LifecycleEvent.foreground, LifecycleEvent.sceneInactive -> Unit
    }
  }

  /**
   * Runs to completion even when it cancels the job that called it (a receiver
   * or watchdog ending its own call): iOS reaches the same end with a fresh
   * Task for finish/status. Never starts or retries a reservation or socket.
   */
  private suspend fun terminate(
    reason: EndReason,
    failure: VoiceFailure?,
    api: APIFailure? = null,
    closeCode: Int? = null,
  ) = withContext(NonCancellable) { terminateNow(reason, failure, api, closeCode) }

  private suspend fun terminateNow(reason: EndReason, failure: VoiceFailure?, api: APIFailure?, closeCode: Int?) {
    if (state == CallState.ending || state == CallState.ended || state == CallState.failed || state == CallState.idle) return
    epoch += 1
    val endingEpoch = epoch
    change(CallState.ending)
    try {
      for (job in listOf(receiveJob, captureJob, sendJob, timerJob, countdownJob, meterJob, pollJob, playbackJob, playbackDrainJob)) {
        job?.cancel()
      }
      pongJobs.values.forEach { it.cancel() }
      pongJobs.clear()
      receiveJob = null; captureJob = null; sendJob = null; timerJob = null
      countdownJob = null; meterJob = null; pollJob = null; playbackJob = null
      levelChannel.trySend(AudioLevels.silent)
      playbackDrainJob = null
      playbackBacklog.clear()
      playbackInFlight = 0
      playbackEpoch += 1
      changePlayback(PlaybackState.flowing)
      val oldEngine = engine
      engine = null
      oldEngine?.stop()
      val oldSocket = socket
      socket = null
      oldSocket?.close(1000)
      audioSession.keepAwake(false)
      audioSession.deactivate()
      converter = null
      chunks = null
      sendQueue.clear()
      inFlightSamples = 0
      val finishedReservation = reservation
      reservation = null
      clearStatus()
      val failedCredential = relayCredential
      relayCredential = null
      if (api != null) runCatching { http.observeRelayFailure(api, failedCredential) }
      if (finishedReservation != null) runCatching { http.finish(finishedReservation.sessionId) }
      val refreshed = runCatching { http.status() }
      var finalReason = reason
      var finalFailure = failure
      if (epoch != endingEpoch) return
      refreshed.onSuccess { status ->
        latestStatus = status.bridgeValue
        emit(VoiceEvent.Status(status.bridgeValue))
        // A concurrent pong/upload can hide the close frame behind 1006.
        // Only fresh, signed-in status can recover a spent allowance/budget;
        // time left, unknown budget or a failed read remains a network error.
        if (reason == EndReason.deadline || (closeCode == 1006 && status.signedIn)) {
          if (status.unlimited != true && status.remainingSeconds <= 0) {
            finalReason = EndReason.allowanceExhausted
            finalFailure = null
          } else if (status.budgetOpen == false) {
            finalReason = EndReason.budgetClosed
            finalFailure = null
          } else if (reason == EndReason.deadline && status.unlimited == true) {
            finalReason = EndReason.callLimit
          }
        }
        if (status.activeSession != null) schedulePoll()
      }.onFailure { emit(VoiceEvent.Error(failureOf(it))) }
      if (epoch != endingEpoch) return
      finalFailure?.let { emit(VoiceEvent.Error(it)) }
      change(if (finalFailure == null) CallState.ended else CallState.failed, finalReason)
    } finally {
      endWaiters.forEach { it.complete(Unit) }
      endWaiters.clear()
    }
  }

  private fun schedulePoll() {
    if (pollJob != null) return
    val pollEpoch = epoch
    pollJob = scope.launch {
      try {
        for (attempt in 0 until max(0, timing.pollMaxAttempts)) {
          val expiry = latestStatus?.activeSession?.expiresAt
          val now = clock.now()
          val backoff = timing.pollInterval * 2.0.pow(min(attempt, 10))
          val delay = min(timing.pollMaxInterval, max(backoff, (expiry ?: now) - now + 0.5))
          clock.sleep(max(0.001, delay))
          if (!poll(pollEpoch)) return@launch
        }
        pollingStopped(pollEpoch)
      } catch (_: Throwable) {
        pollingStopped(pollEpoch)
      }
    }
  }

  private fun pollingStopped(pollEpoch: Int) { if (epoch == pollEpoch) pollJob = null }

  private suspend fun poll(pollEpoch: Int): Boolean {
    try {
      val status = http.status()
      if (epoch != pollEpoch || !currentCoroutineContext().isActive) return false
      latestStatus = status.bridgeValue
      emit(VoiceEvent.Status(status.bridgeValue))
      if (status.activeSession == null) {
        pollJob = null
        if (state !in pollQuiet) change(if (status.refusal == null) CallState.ready else CallState.unavailable)
        return false
      }
      return true
    } catch (error: Throwable) {
      if (epoch == pollEpoch && currentCoroutineContext().isActive) {
        clearStatus()
        emit(VoiceEvent.Error(failureOf(error)))
        pollJob = null
      }
      return false
    }
  }

  suspend fun shutdown() {
    end()
    withContext(actor) {
      lifecycleJob?.cancel()
      lifecycleJob = null
      pollJob?.cancel()
      pollJob = null
      eventChannel.close()
      levelChannel.close()
    }
    scope.cancel()
  }

  internal companion object {
    private val callBusy = setOf(CallState.checking, CallState.reserving, CallState.connecting, CallState.live, CallState.ending)
    private val refreshBusy = callBusy
    private val pollQuiet = setOf(CallState.reserving, CallState.connecting, CallState.live, CallState.ending)
    private val lifecycleWatched = setOf(CallState.checking, CallState.ready, CallState.reserving, CallState.connecting, CallState.live)

    fun failureOf(error: Throwable) = voiceFailure(error)
  }
}
