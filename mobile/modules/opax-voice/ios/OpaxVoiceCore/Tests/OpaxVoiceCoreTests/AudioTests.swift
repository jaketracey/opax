import XCTest
import AVFAudio
@testable import OpaxVoiceCore

@MainActor final class AudioTests: SafeVoiceTestCase {
    func testEveryCodecAndAcceptedRate() throws {
        for rate in AudioFormat.rates { for codec in ["pcm", "ulaw"] {
            let format = try AudioFormat("\(codec)_\(rate)")
            let samples: [Float] = [-1, -0.5, 0, 0.5, 1]
            let bytes = AudioCodec.encode(samples, format: format)
            let decoded = try AudioCodec.decode(bytes, format: format)
            XCTAssertEqual(decoded.count, samples.count)
            for (a, b) in zip(samples, decoded) { XCTAssertEqual(a, b, accuracy: codec == "pcm" ? 0.00004 : 0.021) }
        } }
    }
    func testLevelMeterMapsRMSDecibelsToUnitRange() {
        func level(_ samples: [Float]) -> Float { samples.withUnsafeBufferPointer { LevelMeter.level($0) } }
        XCTAssertEqual(level([]), 0)
        XCTAssertEqual(level([Float](repeating: 0, count: 1024)), 0)
        XCTAssertEqual(level([Float](repeating: 1, count: 1024)), 1, accuracy: 0.0001)
        XCTAssertEqual(level([Float](repeating: -0.1, count: 1024)), 2.0 / 3, accuracy: 0.001) // -20 dBFS
        XCTAssertEqual(level([Float](repeating: 0.0005, count: 1024)), 0) // under -60 dBFS
        XCTAssertEqual(level([.nan, .infinity, 1, 1]), LevelMeter.level(rms: Float(0.5).squareRoot()), accuracy: 0.0001) // non-finite counts as silence
    }
    func testFormatParserFailsClosed() {
        for input in ["opus_48000", "pcm_abc", "pcm_0", "pcm_96000", "pcm_016000", "pcm_16000_extra", "", "ulaw_-8000", "PCM_16000"] {
            XCTAssertThrowsError(try AudioFormat(input))
        }
    }
    func testPCMScalingClampingAndLittleEndian() throws {
        let bytes = AudioCodec.encode([-2, -1, -0.5, 0, 0.5, 1, 2, .nan], format: try AudioFormat("pcm_16000"))
        XCTAssertEqual(Array(bytes), [0,128, 0,128, 0,192, 0,0, 255,63, 255,127, 255,127, 0,0])
        for codec in ["pcm", "ulaw"] {
            let format = try AudioFormat("\(codec)_16000")
            XCTAssertEqual(AudioCodec.encode([-.infinity, .nan, .infinity], format: format),
                           AudioCodec.encode([-1, 0, 1], format: format))
        }
    }
    func testMuLawMatchesSDKForEveryInt16() {
        // Independent table algorithm from portal/public/voice-assets/rawAudioProcessor-6731b766e9e6.js.
        // The SDK table maps index n to floor(log2(n)), with entries 0 and 1 both zero.
        let table = (0..<256).map { index in index < 2 ? 0 : Int(log2(Double(index))) }
        for input in Int(Int16.min)...Int(Int16.max) {
            let sign = (input >> 8) & 128; var magnitude = sign != 0 ? -input : input
            magnitude = min(32635, magnitude + 132)
            let exponent = table[(magnitude >> 7) & 255]
            let expected = UInt8(truncatingIfNeeded: ~(sign | exponent << 4 | ((magnitude >> (exponent + 3)) & 15)))
            XCTAssertEqual(AudioCodec.encodeMuLaw(input), expected)
        }
    }
    func testMuLawRoundRuleAndKnownDecodeVectors() throws {
        let format = try AudioFormat("ulaw_8000")
        let values: [Float] = [-0.0039, -0.5, 0, 0.5, 1]
        let expected = values.map { value in
            let scaled = Double(value) * (value < 0 ? 32768 : 32767)
            return AudioCodec.encodeMuLaw(Int(floor(scaled + 0.5)))
        }
        XCTAssertEqual(Array(AudioCodec.encode(values, format: format)), expected)
        let decoded = try AudioCodec.decode(Data([255,127,0,128]), format: format)
        XCTAssertEqual(decoded, [0,0,Float(-32124)/32768,Float(32124)/32768])
    }
    func testOddBytesOnlyInvalidForPCM() throws {
        XCTAssertThrowsError(try AudioCodec.decode(Data([0]), format: AudioFormat("pcm_16000")))
        XCTAssertEqual(try AudioCodec.decode(Data([255,255,255]), format: AudioFormat("ulaw_8000")), [0,0,0])
    }
    func testBase64StandardAlphabetAndPadding() throws {
        let data = try ClientMessage.audio(Data([255,255])).data()
        XCTAssertEqual(try JSONSerialization.jsonObject(with: data) as? [String: String], ["user_audio_chunk": "//8="])
    }
    func testFractionalChunkSequences() {
        for (rate, expected) in [(16000,[400,400,400,400]), (22050,[551,551,551,552]), (44100,[1102,1103,1102,1103])] {
            var cadence = ChunkCadence(rate: rate)
            XCTAssertEqual((0..<4).map { _ in cadence.advance() }, expected)
        }
    }
    func testCadenceEveryRateEverySlidingSecondForOneHour() {
        for rate in AudioFormat.rates {
            var cadence = ChunkCadence(rate: rate); var window: [Int] = []; var total = 0
            for _ in 0..<(40 * 3600) {
                let next = cadence.advance(); total += next; window.append(next)
                if window.count > 40 { total -= window.removeFirst() }
                if window.count == 40 { XCTAssertEqual(total, rate) }
            }
        }
    }
    func testPartialChunkCarryAndOrdering() {
        for rate in AudioFormat.rates {
            var chunks = ChunkAccumulator(rate: rate)
            let first = chunks.nextCount
            XCTAssertTrue(chunks.append([Float](repeating: 0.25, count: first - 1)).isEmpty)
            let emitted = chunks.append([0.5])
            XCTAssertEqual(emitted.count, 1); XCTAssertEqual(emitted[0].count, first)
            XCTAssertEqual(emitted[0].last, 0.5); XCTAssertEqual(chunks.pendingCount, 0)
            XCTAssertEqual(chunks.append([Float](repeating: 0, count: rate)).count, 40)
        }
    }
    func testBoundedQueueFIFOAndOverflow() throws {
        var queue = BoundedQueue<Int>(limit: 4)
        try queue.append(1, weight: 2); try queue.append(2, weight: 2)
        XCTAssertThrowsError(try queue.append(3, weight: 1))
        XCTAssertEqual(queue.pop(), 1); XCTAssertEqual(queue.weight, 2); XCTAssertEqual(queue.pop(), 2)
        queue.clear(); XCTAssertEqual(queue.weight, 0); XCTAssertNil(queue.pop())
    }
    func testMuteEncodesSilenceForBothCodecs() throws {
        for codec in ["pcm", "ulaw"] {
            let format = try AudioFormat("\(codec)_\(16000)")
            let bytes = AudioCodec.encode([1,-1,1], format: format, muted: true)
            XCTAssertTrue(try AudioCodec.decode(bytes, format: format).allSatisfy { $0 == 0 })
        }
    }
    func testResamplerLengthsFrequencyAndSplitContinuity() async throws {
        for rate in [48000,44100,24000] {
            let count = rate / 5
            let input = (0..<count).map { Float(0.5 * sin(2 * Double.pi * 440 * Double($0) / Double(rate))) }
            let whole = try await CaptureConverter(outputRate: 16000).convert(CaptureBuffer(samples: input, rate: rate))
            let converter = CaptureConverter(outputRate: 16000)
            let first = try await converter.convert(CaptureBuffer(samples: Array(input.prefix(count / 2)), rate: rate))
            let second = try await converter.convert(CaptureBuffer(samples: Array(input.dropFirst(count / 2)), rate: rate))
            let split = first + second
            XCTAssertEqual(whole.count, 3200, accuracy: 1); XCTAssertEqual(split.count, whole.count, accuracy: 1)
            for (a, b) in zip(whole, split) { XCTAssertEqual(a, b, accuracy: 0.00001) }
            XCTAssertLessThan(whole.map { abs($0) }.max()!, 0.51)
            // Goertzel energy at the target dominates neighbouring tones; no hardware engine.
            func energy(_ frequency: Double) -> Double {
                let coefficient = 2 * cos(2 * Double.pi * frequency / 16000)
                var p = 0.0, q = 0.0
                for sample in whole { let next = Double(sample) + coefficient * p - q; q = p; p = next }
                return p * p + q * q - coefficient * p * q
            }
            XCTAssertGreaterThan(energy(440), 100 * energy(400)); XCTAssertGreaterThan(energy(440), 100 * energy(480))
        }
    }
    func testTapRingBoundsAndWorkerDownmixWithoutStartingEngine() throws {
        let format = AVAudioFormat(standardFormatWithSampleRate: 16000, channels: 2)!
        let buffer = AVAudioPCMBuffer(pcmFormat: format, frameCapacity: 400)!
        buffer.frameLength = 400
        for index in 0..<400 { buffer.floatChannelData![0][index] = 0.25; buffer.floatChannelData![1][index] = 0.75 }
        let ring = TapRing(rate: 16000, channels: 2); ring.copy(buffer)
        XCTAssertEqual(try ring.drain(rate: 16000)?.samples, Array(repeating: 0.5, count: 400))
        XCTAssertNil(try ring.drain(rate: 16000))
        for _ in 0..<81 { ring.copy(buffer) }
        XCTAssertThrowsError(try ring.drain(rate: 16000))
    }
    func testResamplerStreamingChunkLengthsAtHardwareRates() async throws {
        for rate in [48000,44100,24000] {
            let converter = CaptureConverter(outputRate: 16000)
            var cadence = ChunkCadence(rate: rate); var total = 0
            for _ in 0..<40 {
                let result = try await converter.convert(CaptureBuffer(samples: [Float](repeating: 0, count: cadence.advance()), rate: rate))
                XCTAssertEqual(result.count, 400, accuracy: 1); total += result.count
            }
            XCTAssertEqual(total, 16000, accuracy: 1)
        }
    }
    func testDebugSyntheticInputAllMetadataRatesWithoutHardware() async throws {
        for rate in AudioFormat.rates {
            let engine = try await DebugSyntheticEngineFactory().make()
            let format = try AudioFormat("pcm_\(rate)")
            try await engine.start(input: format, output: format)
            let capture = try await engine.capture()
            XCTAssertEqual(capture?.rate, rate); XCTAssertEqual(capture?.samples.count, rate / 40)
            XCTAssertTrue(capture!.samples.allSatisfy { $0 == 0 }); await engine.stop()
        }
    }
    func testAppleHardwareEntryPointsFailBeforeCreatingIO() async throws {
        try await VoiceTestSafety.$isolated.withValue(VoiceTestSafety.Monitor()) {
            #if targetEnvironment(simulator) || os(macOS)
            let engine = try await AppleVoiceEngineFactory().make()
            do { try await engine.start(input: AudioFormat("pcm_16000"), output: AudioFormat("pcm_16000")); XCTFail("Hardware guard missing") }
            catch { XCTAssertEqual(error as? VoiceFailure, .audio) }
            let allowed = await AppleMicrophonePermission().request(); XCTAssertFalse(allowed)
            do { try await AppleVoiceAudioSession().activate(); XCTFail("Session guard missing") }
            catch { XCTAssertEqual(error as? VoiceFailure, .audio) }
            #else
            throw XCTSkip("Hardware tests never run on devices")
            #endif

            XCTAssertFalse(VoiceTestSafety.audit().isClean)
            XCTAssertEqual(VoiceTestSafety.audit().inputOpens, 1); XCTAssertEqual(VoiceTestSafety.audit().outputOpens, 1)
        }
    }
}
