#if DEBUG || OPAX_VOICE_E2E
import Foundation

/// Fixture-only microphone and playback implementation. It never constructs AVAudioEngine.
/// Available to DEBUG core tests and the compile-time e2e variant, never production Release.
public struct DebugSyntheticEngineFactory: VoiceEngineFactory {
    private let clock: any VoiceClock
    public init(clock: any VoiceClock = SystemVoiceClock()) { self.clock = clock }
    public func make() async throws -> any VoiceAudioEngine { DebugSyntheticEngine(clock: clock) }
}
actor DebugSyntheticEngine: VoiceAudioEngine {
    private let clock: any VoiceClock
    private var cadence: ChunkCadence?
    private var outputRate = 16000
    private var nextCapture = Date.distantPast
    private var playbackEnd = Date.distantPast
    private var acceptedPlaybackEpoch = 0
    init(clock: any VoiceClock) { self.clock = clock }
    func start(input: AudioFormat, output: AudioFormat) async {
        acceptedPlaybackEpoch = 0
        cadence = ChunkCadence(rate: input.rate); outputRate = output.rate
        nextCapture = await clock.now(); playbackEnd = nextCapture
    }
    func capture() async throws -> CaptureBuffer? {
        guard cadence != nil else { return nil }
        let delay = nextCapture.timeIntervalSince(await clock.now())
        if delay > 0 { try await clock.sleep(seconds: delay) }
        guard !Task.isCancelled, var cadence else { return nil }
        let now = await clock.now()
        let count = cadence.advance(); self.cadence = cadence
        nextCapture = now.addingTimeInterval(0.025)
        return CaptureBuffer(samples: Array(repeating: 0, count: count), rate: cadence.rate)
    }
    func schedule(_ samples: [Float], rate: Int, playbackEpoch: Int) async throws {
        guard playbackEpoch == acceptedPlaybackEpoch else { return }
        guard rate == outputRate, samples.count <= rate * PlaybackLimits.maximumSeconds else { throw VoiceFailure.audio }
        try await waitForPlayback(atMostSamples: rate * PlaybackLimits.maximumSeconds - samples.count)
        let now = await clock.now()
        guard playbackEpoch == acceptedPlaybackEpoch else { return }
        playbackEnd = max(now, playbackEnd).addingTimeInterval(Double(samples.count) / Double(rate))
        // Deliberately discard samples. There is no device or player node.
    }
    func queuedSamples() async -> Int {
        max(0, Int(ceil(playbackEnd.timeIntervalSince(await clock.now()) * Double(outputRate))))
    }
    func waitForPlayback(atMostSamples limit: Int) async throws {
        while cadence != nil {
            let queued = await queuedSamples()
            guard queued > limit else { return }
            try await clock.sleep(seconds: min(1, Double(queued - limit) / Double(outputRate)))
        }
        throw VoiceFailure.cancelled
    }
    func flush(playbackEpoch: Int) { acceptedPlaybackEpoch = max(acceptedPlaybackEpoch, playbackEpoch); playbackEnd = .distantPast }
    func setMuted(_ muted: Bool) {}
    func reconfigure() {}
    func stop() { acceptedPlaybackEpoch += 1; cadence = nil; playbackEnd = .distantPast }
}
public struct DebugMicrophonePermission: MicrophonePermission {
    public init() {}
    public func request() async -> Bool { true }
}
public struct DebugSilentAudioSession: VoiceAudioSession {
    public init() {}
    public func activate() async throws {}
    public func deactivate() async {}
    public func keepAwake(_ enabled: Bool) async {}
}
#endif
