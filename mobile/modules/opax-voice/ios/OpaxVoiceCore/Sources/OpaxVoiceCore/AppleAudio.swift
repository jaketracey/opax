import Foundation
import AVFAudio
#if os(iOS)
import UIKit
#endif

/// Allocated before installing the tap. The tap copies hardware samples (and
/// LevelBox keeps one loudness value); downmixing, conversion, JSON and socket
/// work happen later on actors.
final class TapRing: @unchecked Sendable {
    private let lock = NSLock()
    private var storage: [Float]
    private let channels: Int
    private let capacity: Int
    private var readIndex = 0, writeIndex = 0, count = 0
    private var overflow = false
    let signals: AsyncStream<Void>
    private let signal: AsyncStream<Void>.Continuation
    init(rate: Int, channels: Int) {
        let stream = AsyncStream<Void>.makeStream(bufferingPolicy: .bufferingNewest(1))
        signals = stream.stream; signal = stream.continuation
        self.channels = channels; capacity = rate * 2
        storage = Array(repeating: 0, count: capacity * channels)
    }
    func copy(_ buffer: AVAudioPCMBuffer) {
        lock.lock(); defer { lock.unlock(); signal.yield(()) }
        let frames = Int(buffer.frameLength)
        guard let source = buffer.floatChannelData, frames <= capacity - count else { overflow = true; return }
        for frame in 0..<frames {
            for channel in 0..<channels { storage[writeIndex * channels + channel] = source[channel][frame] }
            writeIndex = (writeIndex + 1) % capacity
        }
        count += frames
    }
    func finish() { signal.finish() }
    func drain(rate: Int) throws -> CaptureBuffer? {
        lock.lock(); defer { lock.unlock() }
        guard !overflow else { throw VoiceFailure.queueOverflow }
        guard count > 0 else { return nil }
        // Limit each drain to 25 ms so the lock is short on the tap thread.
        let frames = min(count, max(1, rate / 40)); var mono = [Float](repeating: 0, count: frames)
        for frame in 0..<frames {
            var sum: Float = 0
            for channel in 0..<channels { sum += storage[readIndex * channels + channel] }
            mono[frame] = sum / Float(channels); readIndex = (readIndex + 1) % capacity
        }
        count -= frames; return CaptureBuffer(samples: mono, rate: rate)
    }
}
/// The latest loudness from each tap. Taps write one Float under a short lock;
/// the engine actor reads both. No samples are kept.
final class LevelBox: @unchecked Sendable {
    private let lock = NSLock()
    private var input: Float = 0, output: Float = 0
    func setInput(_ buffer: AVAudioPCMBuffer) { let value = Self.level(buffer); lock.lock(); input = value; lock.unlock() }
    func setOutput(_ buffer: AVAudioPCMBuffer) { let value = Self.level(buffer); lock.lock(); output = value; lock.unlock() }
    func read() -> AudioLevels { lock.lock(); defer { lock.unlock() }; return AudioLevels(input: input, output: output) }
    func reset() { lock.lock(); input = 0; output = 0; lock.unlock() }
    private static func level(_ buffer: AVAudioPCMBuffer) -> Float {
        guard let channel = buffer.floatChannelData?[0] else { return 0 }
        return LevelMeter.level(UnsafeBufferPointer(start: channel, count: Int(buffer.frameLength)))
    }
}
public struct AppleVoiceEngineFactory: VoiceEngineFactory {
    public init() {}
    public func make() async throws -> any VoiceAudioEngine { AppleVoiceEngine() }
}
/// Hardware entry points fail unconditionally on simulator and macOS. Tests use
/// FakeAudioEngine; no launch argument can opt into real input/output in this lane.
actor AppleVoiceEngine: VoiceAudioEngine {
    private var graph: AVAudioEngine?
    private var player: AVAudioPlayerNode?
    private var ring: TapRing?
    private var hardwareRate = 0
    private var hardwareChannels = 0
    private var tapInstalled = false
    private var meterTapInstalled = false
    private let meter = LevelBox()
    private var output: AudioFormat?
    private var queued = 0
    private var playbackGeneration = 0
    private var acceptedPlaybackEpoch = 0
    private var muted = false
    private var playbackWaiters: [(UUID, Int, CheckedContinuation<Void, any Error>)] = []
    func start(input: AudioFormat, output: AudioFormat) throws {
        acceptedPlaybackEpoch = 0
        #if DEBUG || OPAX_VOICE_E2E
        try VoiceTestSafety.willOpenAudio()
        #endif
        #if os(iOS) && !targetEnvironment(simulator)
        let graph = AVAudioEngine(); self.graph = graph
        try graph.inputNode.setVoiceProcessingEnabled(true) // stopped engine; switches both I/O nodes
        self.output = output
        let player = AVAudioPlayerNode(); self.player = player; graph.attach(player)
        try establishGraph()
        graph.prepare(); try graph.start(); player.play()
        #else
        throw VoiceFailure.audio
        #endif
    }
    private func establishGraph() throws {
        guard let graph, let player, let output,
              let playback = AVAudioFormat(standardFormatWithSampleRate: Double(output.rate), channels: 1) else { throw VoiceFailure.audio }
        let hardware = graph.inputNode.outputFormat(forBus: 0)
        guard hardware.sampleRate > 0, hardware.sampleRate <= 192000,
              hardware.channelCount > 0, hardware.channelCount <= 8, hardware.commonFormat == .pcmFormatFloat32,
              !hardware.isInterleaved else { throw VoiceFailure.audio }
        hardwareRate = Int(hardware.sampleRate); hardwareChannels = Int(hardware.channelCount)
        let ring = TapRing(rate: hardwareRate, channels: Int(hardware.channelCount)); self.ring = ring
        graph.connect(player, to: graph.mainMixerNode, format: playback)
        let meter = self.meter
        graph.inputNode.installTap(onBus: 0, bufferSize: 1024, format: hardware) { buffer, _ in ring.copy(buffer); meter.setInput(buffer) }
        tapInstalled = true
        // Output loudness for the call animation: what the mixer actually plays.
        graph.mainMixerNode.installTap(onBus: 0, bufferSize: 1024, format: nil) { buffer, _ in meter.setOutput(buffer) }
        meterTapInstalled = true
        graph.inputNode.isVoiceProcessingInputMuted = muted
    }
    func capture() async throws -> CaptureBuffer? {
        while let ring {
            if let capture = try ring.drain(rate: hardwareRate) { return capture }
            var signals = ring.signals.makeAsyncIterator()
            let signalled = await signals.next() != nil
            guard !Task.isCancelled else { return nil }
            if !signalled {
                if let current = self.ring, current !== ring { continue }
                return nil
            }
        }
        return nil
    }
    func schedule(_ samples: [Float], rate: Int, playbackEpoch: Int) async throws {
        guard playbackEpoch == acceptedPlaybackEpoch else { return }
        guard output?.rate == rate, samples.count <= rate * PlaybackLimits.maximumSeconds else { throw VoiceFailure.audio }
        try await waitForPlayback(atMostSamples: rate * PlaybackLimits.maximumSeconds - samples.count)
        guard playbackEpoch == acceptedPlaybackEpoch else { return }
        guard let player, output?.rate == rate,
              let format = AVAudioFormat(standardFormatWithSampleRate: Double(rate), channels: 1),
              let buffer = AVAudioPCMBuffer(pcmFormat: format, frameCapacity: AVAudioFrameCount(samples.count)) else { throw VoiceFailure.queueOverflow }
        guard !samples.isEmpty else { return }
        buffer.frameLength = AVAudioFrameCount(samples.count)
        samples.withUnsafeBufferPointer { buffer.floatChannelData![0].update(from: $0.baseAddress!, count: $0.count) }
        queued += samples.count; let generation = playbackGeneration; let count = samples.count
        player.scheduleBuffer(buffer, completionCallbackType: .dataPlayedBack) { [weak self] _ in
            Task { await self?.completed(count, generation: generation) }
        }
    }
    private func completed(_ count: Int, generation: Int) { if generation == playbackGeneration { queued = max(0, queued - count); wakePlaybackWaiters() } }
    func queuedSamples() -> Int { queued }
    func waitForPlayback(atMostSamples limit: Int) async throws {
        try Task.checkCancellation()
        guard queued > limit else { return }
        let id = UUID()
        try await withTaskCancellationHandler {
            try await withCheckedThrowingContinuation { (continuation: CheckedContinuation<Void, any Error>) in
                if Task.isCancelled { continuation.resume(throwing: CancellationError()) }
                else { playbackWaiters.append((id, limit, continuation)) }
            }
        } onCancel: { Task { await self.cancelPlaybackWaiter(id) } }
    }
    private func cancelPlaybackWaiter(_ id: UUID) {
        if let index = playbackWaiters.firstIndex(where: { $0.0 == id }) { playbackWaiters.remove(at: index).2.resume(throwing: CancellationError()) }
    }
    private func wakePlaybackWaiters() {
        let ready = playbackWaiters.filter { queued <= $0.1 }
        playbackWaiters.removeAll { queued <= $0.1 }; ready.forEach { $0.2.resume() }
    }
    func flush(playbackEpoch: Int) {
        guard playbackEpoch >= acceptedPlaybackEpoch else { return }
        acceptedPlaybackEpoch = playbackEpoch; flushPlayback()
    }
    private func flushPlayback() { playbackGeneration += 1; player?.stop(); queued = 0; wakePlaybackWaiters(); if graph?.isRunning == true { player?.play() } }
    func setMuted(_ muted: Bool) { self.muted = muted; graph?.inputNode.isVoiceProcessingInputMuted = muted }
    func reconfigure() throws {
        // Invoked from the controller actor after the notification yielded. Never in its handler.
        guard let graph else { throw VoiceFailure.audio }
        let hardware = graph.inputNode.outputFormat(forBus: 0)
        if graph.isRunning, Int(hardware.sampleRate) == hardwareRate, Int(hardware.channelCount) == hardwareChannels { return }
        ring?.finish(); graph.stop(); if tapInstalled { graph.inputNode.removeTap(onBus: 0); tapInstalled = false }
        removeMeterTap(graph); flushPlayback()
        graph.disconnectNodeOutput(player!)
        try establishGraph(); graph.prepare(); try graph.start(); player?.play()
    }
    func levels() -> AudioLevels { muted ? AudioLevels(input: 0, output: meter.read().output) : meter.read() }
    private func removeMeterTap(_ graph: AVAudioEngine) {
        if meterTapInstalled { graph.mainMixerNode.removeTap(onBus: 0); meterTapInstalled = false }
    }
    func stop() {
        acceptedPlaybackEpoch += 1
        if let graph { graph.stop(); if tapInstalled { graph.inputNode.removeTap(onBus: 0); tapInstalled = false }; removeMeterTap(graph) }
        meter.reset()
        ring?.finish(); playbackGeneration += 1; player?.stop(); queued = 0; wakePlaybackWaiters(); ring = nil; player = nil; graph = nil
    }
}
public struct AppleMicrophonePermission: MicrophonePermission {
    public init() {}
    public func request() async -> Bool {
        #if DEBUG || OPAX_VOICE_E2E
        if VoiceTestSafety.blocksHardware() { return false }
        #endif
        #if os(iOS) && !targetEnvironment(simulator)
        return await AVAudioApplication.requestRecordPermission()
        #else
        return false
        #endif
    }
}
public actor AppleVoiceAudioSession: VoiceAudioSession {
    public init() {}
    public func activate() throws {
        #if DEBUG || OPAX_VOICE_E2E
        if VoiceTestSafety.blocksHardware() { throw VoiceFailure.audio }
        #endif
        #if os(iOS) && !targetEnvironment(simulator)
        let session = AVAudioSession.sharedInstance()
        // The current SDK exposes this renamed constant back to iOS 1.0.
        let options: AVAudioSession.CategoryOptions = [.defaultToSpeaker, .allowBluetoothHFP]
        try session.setCategory(.playAndRecord, mode: .voiceChat, options: options)
        try session.setActive(true)
        #else
        throw VoiceFailure.audio
        #endif
    }
    public func deactivate() {
        #if os(iOS) && !targetEnvironment(simulator)
        try? AVAudioSession.sharedInstance().setActive(false, options: .notifyOthersOnDeactivation)
        #endif
    }
    public func keepAwake(_ enabled: Bool) async {
        #if os(iOS) && !targetEnvironment(simulator)
        await MainActor.run { UIApplication.shared.isIdleTimerDisabled = enabled }
        #endif
    }
}
/// Observers only yield Sendable values. Engine teardown/restart runs on the core actor.
public final class AppleVoiceLifecycle: VoiceLifecycle, @unchecked Sendable {
    public let events: AsyncStream<LifecycleEvent>
    private let continuation: AsyncStream<LifecycleEvent>.Continuation
    private var observers: [NSObjectProtocol] = [] // written only during init, removed only in deinit
    public init() {
        let stream = AsyncStream<LifecycleEvent>.makeStream(bufferingPolicy: .bufferingNewest(32))
        events = stream.stream; continuation = stream.continuation
        #if os(iOS)
        let center = NotificationCenter.default; let continuation = self.continuation
        observers.append(center.addObserver(forName: AVAudioSession.interruptionNotification, object: nil, queue: nil) { notification in
            let raw = notification.userInfo?[AVAudioSessionInterruptionTypeKey] as? UInt
            continuation.yield(raw == AVAudioSession.InterruptionType.began.rawValue ? .interruptionBegan : .interruptionEnded)
        })
        let mapped: [(Notification.Name, LifecycleEvent)] = [
            (AVAudioSession.routeChangeNotification, .configurationChanged),
            (.AVAudioEngineConfigurationChange, .configurationChanged),
            (AVAudioSession.mediaServicesWereResetNotification, .mediaServicesReset),
            (UIApplication.didEnterBackgroundNotification, .background),
            (UIApplication.willEnterForegroundNotification, .foreground)]
        for (name, event) in mapped {
            observers.append(center.addObserver(forName: name, object: nil, queue: nil) { _ in continuation.yield(event) })
        }
        if #available(iOS 27.0, *) {
            observers.append(center.addObserver(forName: AVAudioSession.didBecomeInactiveNotification, object: nil, queue: nil) { _ in continuation.yield(.becameInactive) })
            observers.append(center.addObserver(forName: AVAudioSession.resumptionRecommendationNotification, object: nil, queue: nil) { _ in continuation.yield(.resumptionRecommended) })
        }
        #endif
    }
    deinit { for observer in observers { NotificationCenter.default.removeObserver(observer) }; continuation.finish() }
}
