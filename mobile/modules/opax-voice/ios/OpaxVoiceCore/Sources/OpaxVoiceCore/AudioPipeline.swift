import Foundation
import AVFAudio

public struct AudioFormat: Sendable, Equatable {
    public enum Codec: String, Sendable { case pcm, ulaw }
    public static let rates = [8000, 16000, 22050, 24000, 44100, 48000]
    public let codec: Codec
    public let rate: Int
    public init(_ metadata: String) throws {
        let parts = metadata.split(separator: "_", omittingEmptySubsequences: false)
        guard parts.count == 2, let codec = Codec(rawValue: String(parts[0])),
              let rate = Int(parts[1]), String(rate) == parts[1], Self.rates.contains(rate) else {
            throw VoiceFailure.unsupportedFormat
        }
        self.codec = codec; self.rate = rate
    }
}
public enum AudioCodec {
    public static func encode(_ samples: [Float], format: AudioFormat, muted: Bool = false) -> Data {
        var bytes = Data(capacity: samples.count * (format.codec == .pcm ? 2 : 1))
        for sample in samples {
            let clamped = muted || sample.isNaN ? 0 : min(1, max(-1, Double(sample)))
            let scaled = clamped * (clamped < 0 ? 32768 : 32767)
            switch format.codec {
            case .pcm:
                let value = UInt16(bitPattern: Int16(scaled.rounded(.towardZero)))
                bytes.append(UInt8(value & 255)); bytes.append(UInt8(value >> 8))
            case .ulaw:
                // JavaScript Math.round: ties toward +infinity, including negative halves.
                bytes.append(encodeMuLaw(Int(floor(scaled + 0.5))))
            }
        }
        return bytes
    }
    public static func encodeMuLaw(_ value: Int) -> UInt8 {
        let value = min(32767, max(-32768, value))
        let sign = (value >> 8) & 0x80
        let biased = min(32635, abs(value) + 0x84)
        var exponent = 7
        var mask = 0x4000
        while exponent > 0 && biased & mask == 0 { exponent -= 1; mask >>= 1 }
        return UInt8(truncatingIfNeeded: ~(sign | (exponent << 4) | ((biased >> (exponent + 3)) & 15)))
    }
    public static func decode(_ bytes: Data, format: AudioFormat) throws -> [Float] {
        switch format.codec {
        case .pcm:
            guard bytes.count.isMultiple(of: 2) else { throw VoiceFailure.invalidResponse }
            let array = Array(bytes)
            return stride(from: 0, to: array.count, by: 2).map {
                Float(Int16(bitPattern: UInt16(array[$0]) | UInt16(array[$0 + 1]) << 8)) / 32768
            }
        case .ulaw:
            return bytes.map {
                let u = Int(~$0)
                let magnitude = (((u & 15) << 3) + 0x84) << ((u >> 4) & 7)
                let pcm = u & 0x80 == 0 ? magnitude - 0x84 : 0x84 - magnitude
                return Float(pcm) / 32768
            }
        }
    }
}
/// Integer fractional-sample accumulator: no drift, including nonintegral 25 ms rates.
public struct ChunkCadence: Sendable {
    public let rate: Int
    private var remainder = 0
    public init(rate: Int) { precondition(AudioFormat.rates.contains(rate)); self.rate = rate }
    public var nextCount: Int { (rate + remainder) / 40 }
    public mutating func advance() -> Int {
        let count = nextCount; remainder = (rate + remainder) % 40; return count
    }
}
public struct ChunkAccumulator: Sendable {
    private var cadence: ChunkCadence
    private var pending: [Float] = []
    public var rate: Int { cadence.rate }
    public init(rate: Int) { cadence = ChunkCadence(rate: rate) }
    public var nextCount: Int { cadence.nextCount }
    public mutating func append(_ samples: [Float]) -> [[Float]] {
        pending.append(contentsOf: samples)
        var chunks: [[Float]] = []; var offset = 0
        while pending.count - offset >= nextCount {
            let count = cadence.advance()
            chunks.append(Array(pending[offset..<(offset + count)])); offset += count
        }
        if offset > 0 { pending.removeFirst(offset) }
        return chunks
    }
    public var pendingCount: Int { pending.count }
}
public struct BoundedQueue<Element: Sendable>: Sendable {
    private var elements: [(Element, Int)] = []
    public private(set) var weight = 0
    public let limit: Int
    public init(limit: Int) { precondition(limit > 0); self.limit = limit }
    public mutating func append(_ element: Element, weight: Int) throws {
        guard weight >= 0, weight <= limit - self.weight else { throw VoiceFailure.queueOverflow }
        elements.append((element, weight)); self.weight += weight
    }
    public mutating func pop() -> Element? {
        guard !elements.isEmpty else { return nil }
        let first = elements.removeFirst(); weight -= first.1; return first.0
    }
    public mutating func clear() { elements.removeAll(keepingCapacity: true); weight = 0 }
    public var count: Int { elements.count }
}
public struct CaptureBuffer: Sendable {
    public let samples: [Float] // mono, copied out of the tap ring on the audio worker
    public let rate: Int
    public init(samples: [Float], rate: Int) { self.samples = samples; self.rate = rate }
}
enum PlaybackLimits {
    static let maximumSeconds = 30 // scheduled output; another 30 seconds in encoded backlog
    static let backlogSeconds = 30
}
public protocol VoiceAudioEngine: Sendable {
    func start(input: AudioFormat, output: AudioFormat) async throws
    /// Suspends until a capture arrives; nil means capture stopped.
    func capture() async throws -> CaptureBuffer?
    /// Accept only the current playback epoch, checking again after any suspension.
    func schedule(_ samples: [Float], rate: Int, playbackEpoch: Int) async throws
    func queuedSamples() async -> Int
    func waitForPlayback(atMostSamples: Int) async throws
    /// Clear scheduled output and accept this epoch; older pending schedules are discarded.
    func flush(playbackEpoch: Int) async
    func setMuted(_ muted: Bool) async
    func reconfigure() async throws
    func stop() async
}
public protocol VoiceEngineFactory: Sendable { func make() async throws -> any VoiceAudioEngine }
/// One converter instance per hardware rate, retained across tap drains. Does not open audio I/O.
actor CaptureConverter {
    private var converter: AVAudioConverter?
    private var inputRate = 0
    private let outputRate: Int
    init(outputRate: Int) { self.outputRate = outputRate }
    func convert(_ input: CaptureBuffer) throws -> [Float] {
        guard input.rate > 0, input.rate <= 192000, input.samples.count <= input.rate * 2 else { throw VoiceFailure.audio }
        if input.rate == outputRate { return input.samples }
        guard let sourceFormat = AVAudioFormat(standardFormatWithSampleRate: Double(input.rate), channels: 1),
              let targetFormat = AVAudioFormat(standardFormatWithSampleRate: Double(outputRate), channels: 1) else { throw VoiceFailure.audio }
        if converter == nil || inputRate != input.rate {
            converter = AVAudioConverter(from: sourceFormat, to: targetFormat); inputRate = input.rate
            converter?.primeMethod = .none
        }
        guard let converter,
              let destination = AVAudioPCMBuffer(pcmFormat: targetFormat,
                frameCapacity: AVAudioFrameCount(ceil(Double(input.samples.count) * Double(outputRate) / Double(input.rate)) + 64)) else { throw VoiceFailure.audio }
        var offset = 0; var error: NSError?
        let result = converter.convert(to: destination, error: &error) { requested, status in
            let count = min(Int(requested), input.samples.count - offset)
            guard count > 0 else { status.pointee = .noDataNow; return nil }
            guard let portion = AVAudioPCMBuffer(pcmFormat: sourceFormat, frameCapacity: AVAudioFrameCount(count)) else {
                status.pointee = .noDataNow; return nil
            }
            portion.frameLength = AVAudioFrameCount(count)
            input.samples.withUnsafeBufferPointer { pointer in
                portion.floatChannelData![0].update(from: pointer.baseAddress!.advanced(by: offset), count: count)
            }
            offset += count; status.pointee = .haveData; return portion
        }
        guard result != .error, error == nil else { throw VoiceFailure.audio }
        return Array(UnsafeBufferPointer(start: destination.floatChannelData![0], count: Int(destination.frameLength)))
    }
}
