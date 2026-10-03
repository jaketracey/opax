import Foundation

public struct CallTiming: Sendable {
    public var connectTimeout: Double = 35
    public var pollInterval: Double = 2
    public var pollMaxInterval: Double = 30
    public var pollMaxAttempts: Int = 24
    public init() {}
}
/// Serial actor owns state and decoding. Tap callbacks never enter this actor.
public actor VoiceCallController {
    public nonisolated let events: AsyncStream<VoiceEvent>
    private let continuation: AsyncStream<VoiceEvent>.Continuation
    public private(set) var state: CallState = .idle
    public private(set) var latestStatus: VoiceStatusSnapshot?
    public private(set) var playbackState: PlaybackState = .flowing
    private let http: VoiceHTTPClient
    private let relays: any RelayFactory
    private let engines: any VoiceEngineFactory
    private let permission: any MicrophonePermission
    private let consent: any VoiceConsent
    private let audioSession: any VoiceAudioSession
    private let lifecycle: any VoiceLifecycle
    private let clock: any VoiceClock
    private let timing: CallTiming
    private var lifecycleTask: Task<Void, Never>?
    private var playbackTask: Task<Void, Never>?
    private var playbackDrainTask: Task<Void, Never>?
    private struct PlaybackChunk: Sendable { let bytes: Data; let id: Int; let samples: Int }
    private var playbackBacklog = BoundedQueue<PlaybackChunk>(limit: 480000)
    private var playbackInFlight = 0
    private var playbackEpoch = 0
    private var playbackRevision = 0
    private var relayCredential: SessionCredential?
    private var refreshes = 0
    private var receiveTask: Task<Void, Never>?
    private var pongTasks: [UUID: Task<Void, Never>] = [:]
    private var captureTask: Task<Void, Never>?
    private var sendTask: Task<Void, Never>?
    private var timerTask: Task<Void, Never>?
    private var countdownTask: Task<Void, Never>?
    private var pollTask: Task<Void, Never>?
    private var socket: (any RelayTransport)?
    private var engine: (any VoiceAudioEngine)?
    private var converter: CaptureConverter?
    private var reservation: Reservation?
    private var inputFormat: AudioFormat?
    private var outputFormat: AudioFormat?
    private var chunks: ChunkAccumulator?
    private var sendQueue = BoundedQueue<Data>(limit: 80000) // replaced after metadata; 2 seconds, measured in samples
    private var inFlightSamples = 0
    private var epoch = 0
    private var muted = false
    private var mode: CallMode?
    private var reason: EndReason?
    private var interruptionID = 0
    private var evidence = EvidenceModel()
    private var remaining = 0
    private var endWaiters: [CheckedContinuation<Void, Never>] = []

    public init(http: VoiceHTTPClient, relays: any RelayFactory, engines: any VoiceEngineFactory,
                permission: any MicrophonePermission, consent: any VoiceConsent,
                audioSession: any VoiceAudioSession, lifecycle: any VoiceLifecycle,
                clock: any VoiceClock = SystemVoiceClock(), timing: CallTiming = CallTiming()) {
        self.http = http; self.relays = relays; self.engines = engines; self.permission = permission
        self.consent = consent; self.audioSession = audioSession; self.lifecycle = lifecycle
        self.clock = clock; self.timing = timing
        let stream = AsyncStream<VoiceEvent>.makeStream(bufferingPolicy: .bufferingNewest(128))
        events = stream.stream; continuation = stream.continuation
    }
    /// Reads actor-owned values atomically; does not refresh, emit or open a call.
    public func snapshot() -> VoiceSnapshot {
        VoiceSnapshot(state: state, reason: reason, mode: mode, playback: playbackState,
            remaining: remaining, transcript: evidence.turns, sources: evidence.sources, status: latestStatus)
    }
    private func observe() {
        guard lifecycleTask == nil else { return }
        let events = lifecycle.events
        lifecycleTask = Task { [weak self] in
            for await event in events { guard !Task.isCancelled else { break }; await self?.handle(event) }
        }
    }
    private func change(_ state: CallState, reason: EndReason? = nil) {
        self.state = state; self.reason = reason; continuation.yield(.state(state, reason: reason))
    }
    private func changeMode(_ value: CallMode) {
        guard value != mode else { return }; mode = value; continuation.yield(.mode(value))
    }
    private func changePlayback(_ value: PlaybackState) {
        guard playbackState != value else { return }; playbackState = value; continuation.yield(.playback(value))
    }
    func bufferedPlaybackSamples() async -> Int { playbackBacklog.weight + playbackInFlight + (await engine?.queuedSamples() ?? 0) }
    @discardableResult
    public func refreshStatus() async throws(VoiceFailure) -> VoiceStatusSnapshot {
        observe()
        refreshes += 1; defer { refreshes -= 1 }
        let requestEpoch = epoch
        let isBusy = [.reserving, .connecting, .live, .ending, .checking].contains(state)
        if !isBusy { change(.checking) }
        do {
            let status = try await http.status()
            guard requestEpoch == epoch else { return status.bridgeValue }
            latestStatus = status.bridgeValue; continuation.yield(.status(status.bridgeValue))
            if !isBusy { change(status.refusal == nil ? .ready : .unavailable) }
            if let refusal = status.refusal, !isBusy { continuation.yield(.error(refusal)) }
            if status.activeSession != nil { schedulePoll() }
            return status.bridgeValue
        } catch {
            if requestEpoch == epoch {
                latestStatus = nil
                if !isBusy { change(.failed); continuation.yield(.error(Self.failure(error))) }
            }
            throw Self.failure(error)
        }
    }
    public func start() async {
        observe()
        guard refreshes == 0 else { continuation.yield(.error(.statusChecking)); return }
        guard ![.checking, .reserving, .connecting, .live, .ending].contains(state) else {
            continuation.yield(.error(.callOpen)); return
        }
        epoch += 1; let attempt = epoch
        pollTask?.cancel(); pollTask = nil
        evidence = EvidenceModel(); interruptionID = 0; muted = false; mode = nil
        playbackEpoch += 1; playbackBacklog.clear(); playbackInFlight = 0; changePlayback(.flowing)
        continuation.yield(.transcript([])); continuation.yield(.sources([]))
        change(.checking)
        do {
            let status = try await http.status()
            guard epoch == attempt else { return }
            latestStatus = status.bridgeValue; continuation.yield(.status(status.bridgeValue))
            if let refusal = status.refusal {
                change(.unavailable); continuation.yield(.error(refusal))
                if status.activeSession != nil { schedulePoll() }; return
            }
            change(.ready)
            change(.checking)
            guard await consent.isGranted() else { throw VoiceFailure.consentRequired }
            guard epoch == attempt else { return }
            // Stay checking while permission is pending so a second Start is refused.
            change(.checking)
            guard await permission.request() else { throw VoiceFailure.microphoneDenied }
            guard epoch == attempt else { return }
            try await audioSession.activate()
            guard epoch == attempt else { await audioSession.deactivate(); return }
            change(.reserving)
            let reserved = try await http.start()
            guard epoch == attempt else {
                // A late reservation after End must still be cancelled, even though the caller no longer owns state.
                try? await http.finish(sessionID: reserved.sessionID)
                _ = try? await refreshStatus(); return
            }
            reservation = reserved; remaining = reserved.remainingSeconds
            continuation.yield(.remainingTime(remaining))
            change(.connecting)
            let request = try await http.relayRequest(reserved)
            guard epoch == attempt else { return }
            timerTask = Task { [weak self, clock, timing] in
                do { try await clock.sleep(seconds: timing.connectTimeout); await self?.timeout(attempt) } catch {}
            }
            relayCredential = request.credential
            let connected = try await relays.connect(request.request)
            guard epoch == attempt else { await connected.close(code: 1000); return }
            socket = connected
            // URLSession queues this first message until the upgrade opens. The
            // relay's ten-second initiation timer starts at upgrade, not here;
            // its provider setup can take twenty seconds before the 101.
            try await socket?.send(ClientMessage.initiation.data())
            guard epoch == attempt else { return }
            receiveTask = Task { [weak self] in await self?.receive(attempt) }
        } catch {
            guard epoch == attempt else { return }
            await transportEnded(error, fallback: .failed)
        }
    }
    private func timeout(_ attempt: Int) async {
        guard epoch == attempt, state == .connecting else { return }
        await terminate(reason: .failed, failure: .timeout)
    }
    private func transportEnded(_ error: any Error, fallback: EndReason) async {
        if let terminal = error as? RelayTerminated {
            await terminate(reason: terminal.close.endReason, failure: terminal.close.failure, closeCode: terminal.close.code)
        } else { await terminate(reason: fallback, failure: Self.failure(error), api: error as? APIFailure) }
    }
    private func receive(_ attempt: Int) async {
        do {
            while epoch == attempt, let socket {
                let message = try await socket.receive()
                guard epoch == attempt else { return }
                switch message {
                case .closed(let close): await terminate(reason: close.endReason, failure: close.failure, closeCode: close.code); return
                case .data(let data): try await process(ProviderEvent.decode(data), attempt: attempt)
                }
            }
        } catch {
            guard epoch == attempt else { return }
            await transportEnded(error, fallback: .failed)
        }
    }
    private func process(_ event: ProviderEvent, attempt: Int) async throws {
        switch event {
        case .metadata(let input, let output):
            guard state == .connecting, engine == nil else { throw VoiceFailure.policy }
            // Both formats were validated before any engine/converter/buffer allocation.
            inputFormat = input; outputFormat = output; chunks = ChunkAccumulator(rate: input.rate)
            converter = CaptureConverter(outputRate: input.rate)
            sendQueue = BoundedQueue(limit: input.rate * 2); inFlightSamples = 0
            playbackBacklog = BoundedQueue(limit: output.rate * PlaybackLimits.backlogSeconds)
            let created = try await engines.make()
            guard epoch == attempt else { await created.stop(); return }
            engine = created
            try await created.start(input: input, output: output)
            guard epoch == attempt else { await created.stop(); return }
            await created.flush(playbackEpoch: playbackEpoch)
            guard epoch == attempt else { await created.stop(); return }
            timerTask?.cancel(); timerTask = nil
            await audioSession.keepAwake(true)
            guard epoch == attempt else { return }
            change(.live); changeMode(.listening)
            captureTask = Task { [weak self] in await self?.capture(attempt) }
            countdownTask = Task { [weak self, clock] in
                do { while !Task.isCancelled { try await clock.sleep(seconds: 1); await self?.tick(attempt) } } catch {}
            }
        case .ping(let eventID):
            guard let socket else { return }
            let data = try ClientMessage.pong(eventID).data(), id = UUID()
            pongTasks[id] = Task { [weak self] in
                // The continuously pending receiver owns close/drop classification.
                // A pong racing a normal deadline close must not replace it with a send error.
                try? await socket.send(data); await self?.pongFinished(id)
            }
        case .audio(let data, let id):
            guard state == .live, id >= interruptionID, let outputFormat else { return }
            enqueuePlayback(data, id: id, format: outputFormat, attempt: attempt)
        case .interruption(let id):
            interruptionID = max(interruptionID, id); playbackRevision += 1; playbackEpoch += 1
            playbackDrainTask?.cancel(); playbackDrainTask = nil; playbackBacklog.clear(); playbackInFlight = 0
            await engine?.flush(playbackEpoch: playbackEpoch); changePlayback(.flowing)
            changeMode(muted ? .muted : .listening)
        case .transcript(let turn, let correction):
            evidence.add(turn, correction: correction)
            continuation.yield(.transcript(evidence.turns)); continuation.yield(.sources(evidence.sources))
        case .tool(let json, let endsCall):
            evidence.collect(json["agent_tool_response"])
            evidence.collect(json["agent_tool_response_full_payload"])
            evidence.collect(json)
            continuation.yield(.sources(evidence.sources))
            if endsCall { await terminate(reason: .provider, failure: nil) }
        case .deadline: await terminate(reason: .deadline, failure: nil)
        case .error: throw VoiceFailure.unavailable
        case .unknown: break
        }
    }
    private func pongFinished(_ id: UUID) { pongTasks.removeValue(forKey: id) }
    private func enqueuePlayback(_ bytes: Data, id: Int, format: AudioFormat, attempt: Int) {
        let stride = format.codec == .pcm ? 2 : 1
        guard bytes.count.isMultiple(of: stride) else { return }
        let samples = bytes.count / stride
        let accepted = min(samples, max(0, playbackBacklog.limit - playbackBacklog.weight - playbackInFlight))
        var offset = 0
        while offset < accepted {
            let count = min(format.rate, accepted - offset)
            let chunk = PlaybackChunk(bytes: bytes.subdata(in: offset * stride..<(offset + count) * stride), id: id, samples: count)
            // Capacity was checked on this actor without any suspension.
            try? playbackBacklog.append(chunk, weight: count); offset += count
        }
        if accepted < samples { changePlayback(.truncated) }
        else if accepted > 0, playbackState != .truncated { changePlayback(.buffering) }
        if playbackDrainTask == nil, playbackBacklog.count > 0 {
            let generation = playbackEpoch
            playbackDrainTask = Task { [weak self] in await self?.drainPlayback(attempt, generation: generation) }
        }
    }
    private func drainPlayback(_ attempt: Int, generation: Int) async {
        do {
            while epoch == attempt, playbackEpoch == generation, let engine, let format = outputFormat,
                  let chunk = playbackBacklog.pop() {
                playbackInFlight = chunk.samples
                try await engine.waitForPlayback(atMostSamples: format.rate * PlaybackLimits.maximumSeconds - chunk.samples)
                guard epoch == attempt, playbackEpoch == generation, chunk.id >= interruptionID else { return }
                let samples = try AudioCodec.decode(chunk.bytes, format: format)
                try await engine.schedule(samples, rate: format.rate, playbackEpoch: generation)
                guard epoch == attempt, playbackEpoch == generation else { return }
                playbackInFlight = 0; playbackRevision += 1
                changeMode(muted ? .muted : .speaking); watchPlayback(engine, attempt: attempt)
            }
            guard epoch == attempt, playbackEpoch == generation else { return }
            playbackDrainTask = nil
            if playbackState != .truncated { changePlayback(.flowing) }
        } catch {
            guard epoch == attempt, playbackEpoch == generation else { return }
            await terminate(reason: .failed, failure: Self.failure(error))
        }
    }
    private func watchPlayback(_ engine: any VoiceAudioEngine, attempt: Int) {
        guard playbackTask == nil else { return }
        playbackTask = Task { [weak self] in
            do { try await engine.waitForPlayback(atMostSamples: 0); await self?.playbackDrained(attempt) } catch {}
        }
    }
    private func playbackDrained(_ attempt: Int) async {
        guard epoch == attempt, let engine else { return }
        let revision = playbackRevision
        let queued = await engine.queuedSamples()
        guard epoch == attempt else { return }
        playbackTask = nil
        if queued > 0 || revision != playbackRevision { watchPlayback(engine, attempt: attempt); return }
        if playbackBacklog.count > 0 || playbackInFlight > 0 { return } // drain task installs the next completion watch
        changePlayback(.flowing)
        changeMode(muted ? .muted : .listening)
    }
    private func capture(_ attempt: Int) async {
        do {
            while epoch == attempt, state == .live, let engine, let converter, let inputFormat {
                guard let input = try await engine.capture() else { return }
                do {
                    let mono = try await converter.convert(input)
                    guard epoch == attempt else { return }
                    let audioChunks = chunks?.append(mono) ?? []
                    for chunk in audioChunks {
                        guard sendQueue.weight + inFlightSamples + chunk.count <= inputFormat.rate * 2 else { throw VoiceFailure.queueOverflow }
                        try sendQueue.append(AudioCodec.encode(chunk, format: inputFormat, muted: muted), weight: chunk.count)
                    }
                    if sendTask == nil, sendQueue.count > 0 { sendTask = Task { [weak self] in await self?.drain(attempt) } }
                }
            }
        } catch {
            guard epoch == attempt else { return }
            await terminate(reason: .failed, failure: Self.failure(error))
        }
    }
    private func drain(_ attempt: Int) async {
        do {
            while epoch == attempt, let bytes = sendQueue.pop(), let socket, let inputFormat {
                inFlightSamples = bytes.count / (inputFormat.codec == .pcm ? 2 : 1)
                try await socket.send(ClientMessage.audio(bytes).data())
                guard epoch == attempt else { return }
                inFlightSamples = 0
            }
            if epoch == attempt { sendTask = nil }
        } catch {
            guard epoch == attempt else { return }
            await transportEnded(error, fallback: .network)
        }
    }
    private func tick(_ attempt: Int) { guard epoch == attempt, state == .live else { return }
        remaining = max(0, remaining - 1); continuation.yield(.remainingTime(remaining))
        // Display only. Never end locally at zero; the relay deadline is authoritative.
    }
    public func setMuted(_ value: Bool) async {
        guard state == .live else { return }; muted = value; await engine?.setMuted(value)
        changeMode(value ? .muted : ((await engine?.queuedSamples() ?? 0) > 0 ? .speaking : .listening))
    }
    public func sendText(_ text: String) async throws {
        guard state == .live else { throw VoiceFailure.callOpen }
        try await socket?.send(ClientMessage.message(text).data())
    }
    public func contextualUpdate(_ text: String) async throws {
        guard state == .live else { throw VoiceFailure.callOpen }
        try await socket?.send(ClientMessage.contextualUpdate(text).data())
    }
    public func userActivity() async throws {
        guard state == .live else { throw VoiceFailure.callOpen }
        try await socket?.send(ClientMessage.activity.data())
    }
    public func end() async {
        if state == .ending {
            await withCheckedContinuation { endWaiters.append($0) }; return
        }
        await terminate(reason: .user, failure: nil)
    }
    public func withdrawConsent() async { await terminate(reason: .consentWithdrawn, failure: nil) }
    public func logout(everywhere: Bool = false) async throws(VoiceFailure) {
        await end()
        var failure: VoiceFailure?
        do { try await http.logout(everywhere: everywhere) }
        catch { failure = Self.failure(error) }
        _ = try? await refreshStatus()
        if let failure { throw failure }
    }
    public func requestDeletionCode() async throws(VoiceFailure) -> DeletionChallenge {
        do { return try await http.requestDeletionCode() } catch { throw Self.failure(error) }
    }
    public func deleteAccount(challengeID: String, code: String) async throws(VoiceFailure) -> AccountDeletion {
        await end() // finish/close before deleting; never infer a budget refund
        do {
            let result = try await http.deleteAccount(challengeID: challengeID, code: code)
            evidence = EvidenceModel(); latestStatus = nil
            continuation.yield(.transcript([])); continuation.yield(.sources([]))
            _ = try? await refreshStatus(); return result
        } catch { throw Self.failure(error) }
    }
    public func handle(_ event: LifecycleEvent) async {
        guard [.checking, .ready, .reserving, .connecting, .live].contains(state) else { return }
        switch event {
        case .interruptionBegan, .becameInactive: await terminate(reason: .interruption, failure: nil)
        case .background: await terminate(reason: .background, failure: nil)
        case .mediaServicesReset: await terminate(reason: .mediaReset, failure: nil)
        case .configurationChanged:
            guard state == .live, let engine, let inputFormat else { return }
            let attempt = epoch
            do {
                try await engine.reconfigure()
                guard epoch == attempt else { return }
                converter = CaptureConverter(outputRate: inputFormat.rate) // hardware format changed; socket stays open
            } catch { if epoch == attempt { await terminate(reason: .failed, failure: .audio) } }
        case .interruptionEnded, .resumptionRecommended, .foreground, .sceneInactive: break
        }
    }
    private func terminate(reason: EndReason, failure: VoiceFailure?, api: APIFailure? = nil, closeCode: Int? = nil) async {
        guard state != .ending, state != .ended, state != .failed, state != .idle else { return }
        epoch += 1; let endingEpoch = epoch; change(.ending)
        defer { for waiter in endWaiters { waiter.resume() }; endWaiters.removeAll() }
        for task in [receiveTask, captureTask, sendTask, timerTask, countdownTask, pollTask, playbackTask, playbackDrainTask] { task?.cancel() }
        for task in pongTasks.values { task.cancel() }; pongTasks.removeAll()
        receiveTask = nil; captureTask = nil; sendTask = nil; timerTask = nil; countdownTask = nil; pollTask = nil; playbackTask = nil
        playbackDrainTask = nil; playbackBacklog.clear(); playbackInFlight = 0; playbackEpoch += 1; changePlayback(.flowing)
        let oldEngine = engine; engine = nil; await oldEngine?.stop()
        let oldSocket = socket; socket = nil; await oldSocket?.close(code: 1000)
        await audioSession.keepAwake(false); await audioSession.deactivate()
        converter = nil; chunks = nil; sendQueue.clear(); inFlightSamples = 0
        let finishedReservation = reservation; reservation = nil; latestStatus = nil
        let failedCredential = relayCredential; relayCredential = nil
        // A receiver/watchdog may be the task we just cancelled. Cleanup must run
        // in a fresh unstructured Task so URLSession does not immediately cancel
        // finish/status too. This Task never starts/retries a reservation or socket.
        let refreshed = await Task { [http] () -> Result<VoiceStatus, VoiceFailure> in
            if let api { try? await http.observeRelayFailure(api, credential: failedCredential) }
            if let reserved = finishedReservation { try? await http.finish(sessionID: reserved.sessionID) }
            do { return .success(try await http.status()) }
            catch { return .failure(Self.failure(error)) }
        }.value
        var finalReason = reason, finalFailure = failure
        guard epoch == endingEpoch else { return }
        switch refreshed {
        case .success(let status):
            latestStatus = status.bridgeValue; continuation.yield(.status(status.bridgeValue))
            // A concurrent pong/upload can hide the close frame behind 1006.
            // Only fresh, signed-in status can recover a spent allowance/budget;
            // time left, unknown budget or a failed read remains a network error.
            if reason == .deadline || (closeCode == 1006 && status.signedIn) {
                if status.unlimited != true && status.remainingSeconds <= 0 {
                    finalReason = .allowanceExhausted; finalFailure = nil
                } else if status.budgetOpen == false {
                    finalReason = .budgetClosed; finalFailure = nil
                } else if reason == .deadline, status.unlimited == true { finalReason = .callLimit }
            }
            if status.activeSession != nil { schedulePoll() }
        case .failure(let failure): continuation.yield(.error(failure))
        }
        guard epoch == endingEpoch else { return }
        if let finalFailure { continuation.yield(.error(finalFailure)) }
        change(finalFailure == nil ? .ended : .failed, reason: finalReason)
    }
    private func schedulePoll() {
        guard pollTask == nil else { return }
        let pollEpoch = epoch
        pollTask = Task { [weak self, clock, timing] in
            do {
                for attempt in 0..<max(0, timing.pollMaxAttempts) {
                    guard !Task.isCancelled, let self else { return }
                    let expiry = await self.latestStatus?.activeSession?.expiresAt
                    let now = await clock.now().timeIntervalSince1970
                    let backoff = timing.pollInterval * pow(2, Double(min(attempt, 10)))
                    let delay = min(timing.pollMaxInterval, max(backoff, (expiry ?? now) - now + 0.5))
                    try await clock.sleep(seconds: max(0.001, delay))
                    guard await self.poll(pollEpoch) else { return }
                }
                await self?.pollingStopped(pollEpoch)
            } catch { await self?.pollingStopped(pollEpoch) }
        }
    }
    private func pollingStopped(_ pollEpoch: Int) { if epoch == pollEpoch { pollTask = nil } }
    private func poll(_ pollEpoch: Int) async -> Bool {
        do {
            let status = try await http.status()
            guard epoch == pollEpoch, !Task.isCancelled else { return false }
            latestStatus = status.bridgeValue; continuation.yield(.status(status.bridgeValue))
            if status.activeSession == nil {
                pollTask = nil
                if ![.reserving, .connecting, .live, .ending].contains(state) {
                    change(status.refusal == nil ? .ready : .unavailable)
                }
                return false
            }
            return true
        } catch {
            if epoch == pollEpoch, !Task.isCancelled { latestStatus = nil; continuation.yield(.error(Self.failure(error))); pollTask = nil }
            return false
        }
    }
    public func shutdown() async {
        await end(); lifecycleTask?.cancel(); lifecycleTask = nil; pollTask?.cancel(); pollTask = nil
        continuation.finish()
    }
    static func failure(_ error: any Error) -> VoiceFailure {
        if let api = error as? APIFailure { return api.failure }
        if let failure = error as? VoiceFailure { return failure }
        if error is DecodingError { return .invalidResponse }
        if error is CancellationError { return .cancelled }
        return .network
    }
    deinit {
        for task in [lifecycleTask, receiveTask, captureTask, sendTask, timerTask, countdownTask, pollTask, playbackTask, playbackDrainTask] { task?.cancel() }
        for task in pongTasks.values { task.cancel() }
        continuation.finish()
    }
}
