package au.com.opax.voice.call

import au.com.opax.voice.*

import kotlin.math.PI
import kotlin.math.abs
import kotlin.math.cos
import kotlin.math.sin
import kotlin.math.sqrt
import org.junit.Assert.assertArrayEquals
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertThrows
import org.junit.Assert.assertTrue
import org.junit.Test

class AudioTests : SafeVoiceTest() {
  @Test fun everyCodecAndAcceptedRate() {
    for (rate in AudioFormat.rates) for (codec in listOf("pcm", "ulaw")) {
      val format = AudioFormat("${codec}_$rate")
      val samples = floatArrayOf(-1f, -0.5f, 0f, 0.5f, 1f)
      val decoded = AudioCodec.decode(AudioCodec.encode(samples, format), format)
      assertEquals(samples.size, decoded.size)
      for ((a, b) in samples.zip(decoded.toList())) assertEquals(a, b, if (codec == "pcm") 0.00004f else 0.021f)
    }
  }

  @Test fun levelMeterMapsRmsDecibelsToUnitRange() {
    assertEquals(0f, LevelMeter.level(FloatArray(0)))
    assertEquals(0f, LevelMeter.level(FloatArray(1024)))
    assertEquals(1f, LevelMeter.level(FloatArray(1024) { 1f }), 0.0001f)
    assertEquals(2f / 3, LevelMeter.level(FloatArray(1024) { -0.1f }), 0.001f) // -20 dBFS
    assertEquals(0f, LevelMeter.level(FloatArray(1024) { 0.0005f })) // under -60 dBFS
    // Non-finite counts as silence.
    assertEquals(LevelMeter.level(rms = sqrt(0.5f)), LevelMeter.level(floatArrayOf(Float.NaN, Float.POSITIVE_INFINITY, 1f, 1f)), 0.0001f)
  }

  @Test fun formatParserFailsClosed() {
    for (input in listOf("opus_48000", "pcm_abc", "pcm_0", "pcm_96000", "pcm_016000", "pcm_16000_extra", "", "ulaw_-8000", "PCM_16000", "pcm_+16000")) {
      val error = assertThrows(VoiceException::class.java) { AudioFormat(input) }
      assertEquals(VoiceFailure.unsupportedFormat, error.failure)
    }
  }

  @Test fun pcmScalingClampingAndLittleEndian() {
    val bytes = AudioCodec.encode(floatArrayOf(-2f, -1f, -0.5f, 0f, 0.5f, 1f, 2f, Float.NaN), AudioFormat("pcm_16000"))
    assertEquals(listOf(0, 128, 0, 128, 0, 192, 0, 0, 255, 63, 255, 127, 255, 127, 0, 0), bytes.map { it.toInt() and 255 })
    for (codec in listOf("pcm", "ulaw")) {
      val format = AudioFormat("${codec}_16000")
      assertArrayEquals(
        AudioCodec.encode(floatArrayOf(-1f, 0f, 1f), format),
        AudioCodec.encode(floatArrayOf(Float.NEGATIVE_INFINITY, Float.NaN, Float.POSITIVE_INFINITY), format),
      )
    }
  }

  @Test fun muLawMatchesSdkForEveryInt16() {
    // Independent table algorithm from portal/public/voice-assets/rawAudioProcessor-6731b766e9e6.js.
    // The SDK table maps index n to floor(log2(n)), with entries 0 and 1 both zero.
    val table = IntArray(256) { if (it < 2) 0 else 31 - Integer.numberOfLeadingZeros(it) }
    for (input in Short.MIN_VALUE..Short.MAX_VALUE) {
      val sign = (input shr 8) and 128
      var magnitude = if (sign != 0) -input else input
      magnitude = minOf(32635, magnitude + 132)
      val exponent = table[(magnitude shr 7) and 255]
      val expected = (sign or (exponent shl 4) or ((magnitude shr (exponent + 3)) and 15)).inv().toByte()
      assertEquals(expected, AudioCodec.encodeMuLaw(input))
    }
  }

  @Test fun muLawRoundRuleAndKnownDecodeVectors() {
    val format = AudioFormat("ulaw_8000")
    val values = floatArrayOf(-0.0039f, -0.5f, 0f, 0.5f, 1f)
    val expected = values.map { value ->
      val scaled = value.toDouble() * if (value < 0) 32768 else 32767
      AudioCodec.encodeMuLaw(kotlin.math.floor(scaled + 0.5).toInt())
    }
    assertEquals(expected, AudioCodec.encode(values, format).toList())
    val decoded = AudioCodec.decode(byteArrayOf(255.toByte(), 127, 0, 128.toByte()), format)
    assertArrayEquals(floatArrayOf(0f, 0f, -32124f / 32768, 32124f / 32768), decoded, 0f)
  }

  @Test fun oddBytesOnlyInvalidForPcm() {
    assertThrows(VoiceException::class.java) { AudioCodec.decode(byteArrayOf(0), AudioFormat("pcm_16000")) }
    assertArrayEquals(floatArrayOf(0f, 0f, 0f), AudioCodec.decode(byteArrayOf(-1, -1, -1), AudioFormat("ulaw_8000")), 0f)
  }

  @Test fun base64StandardAlphabetAndPadding() {
    assertEquals(mapOf("user_audio_chunk" to "//8="), bodyMap(ClientMessage.Audio(byteArrayOf(-1, -1)).data()))
  }

  @Test fun fractionalChunkSequences() {
    for ((rate, expected) in listOf(16000 to listOf(400, 400, 400, 400), 22050 to listOf(551, 551, 551, 552), 44100 to listOf(1102, 1103, 1102, 1103))) {
      val cadence = ChunkCadence(rate)
      assertEquals(expected, List(4) { cadence.advance() })
    }
  }

  @Test fun cadenceEveryRateEverySlidingSecondForOneHour() {
    for (rate in AudioFormat.rates) {
      val cadence = ChunkCadence(rate)
      val window = ArrayDeque<Int>()
      var total = 0
      repeat(40 * 3600) {
        val next = cadence.advance()
        total += next
        window.addLast(next)
        if (window.size > 40) total -= window.removeFirst()
        if (window.size == 40) assertEquals(rate, total)
      }
    }
  }

  @Test fun partialChunkCarryAndOrdering() {
    for (rate in AudioFormat.rates) {
      val chunks = ChunkAccumulator(rate)
      val first = chunks.nextCount
      assertTrue(chunks.append(FloatArray(first - 1) { 0.25f }).isEmpty())
      val emitted = chunks.append(floatArrayOf(0.5f))
      assertEquals(1, emitted.size)
      assertEquals(first, emitted[0].size)
      assertEquals(0.5f, emitted[0].last())
      assertEquals(0, chunks.pendingCount)
      assertEquals(40, chunks.append(FloatArray(rate)).size)
    }
  }

  @Test fun boundedQueueFifoAndOverflow() {
    val queue = BoundedQueue<Int>(4)
    queue.append(1, 2)
    queue.append(2, 2)
    assertThrows(VoiceException::class.java) { queue.append(3, 1) }
    assertEquals(1, queue.pop())
    assertEquals(2, queue.weight)
    assertEquals(2, queue.pop())
    queue.clear()
    assertEquals(0, queue.weight)
    assertNull(queue.pop())
  }

  @Test fun muteEncodesSilenceForBothCodecs() {
    for (codec in listOf("pcm", "ulaw")) {
      val format = AudioFormat("${codec}_16000")
      val bytes = AudioCodec.encode(floatArrayOf(1f, -1f, 1f), format, muted = true)
      assertTrue(AudioCodec.decode(bytes, format).all { it == 0f })
    }
  }

  @Test fun resamplerLengthsFrequencyAndSplitContinuity() {
    for (rate in listOf(48000, 44100, 24000)) {
      val count = rate / 5
      val input = FloatArray(count) { (0.5 * sin(2 * PI * 440 * it / rate)).toFloat() }
      val whole = CaptureConverter(16000).convert(CaptureBuffer(input, rate))
      val converter = CaptureConverter(16000)
      val first = converter.convert(CaptureBuffer(input.copyOfRange(0, count / 2), rate))
      val second = converter.convert(CaptureBuffer(input.copyOfRange(count / 2, count), rate))
      val split = first + second
      assertEquals(3200.0, whole.size.toDouble(), 1.0)
      assertEquals(whole.size.toDouble(), split.size.toDouble(), 1.0)
      for ((a, b) in whole.zip(split)) assertEquals(a, b, 0.00001f)
      assertTrue(whole.maxOf { abs(it) } < 0.51f)
      // Goertzel energy at the target dominates neighbouring tones; no hardware.
      fun energy(frequency: Double): Double {
        val coefficient = 2 * cos(2 * PI * frequency / 16000)
        var p = 0.0
        var q = 0.0
        for (sample in whole) { val next = sample + coefficient * p - q; q = p; p = next }
        return p * p + q * q - coefficient * p * q
      }
      assertTrue(energy(440.0) > 100 * energy(400.0))
      assertTrue(energy(440.0) > 100 * energy(480.0))
    }
  }

  @Test fun captureRingBoundsAndWorkerDownmixWithoutStartingEngine() {
    val stereo = FloatArray(800) { if (it % 2 == 0) 0.25f else 0.75f }
    val ring = CaptureRing(16000, 2)
    ring.copy(stereo, 400)
    assertArrayEquals(FloatArray(400) { 0.5f }, ring.drain(16000)!!.samples, 0f)
    assertNull(ring.drain(16000))
    repeat(81) { ring.copy(stereo, 400) }
    assertThrows(VoiceException::class.java) { ring.drain(16000) }
  }

  @Test fun resamplerStreamingChunkLengthsAtHardwareRates() {
    for (rate in listOf(48000, 44100, 24000)) {
      val converter = CaptureConverter(16000)
      val cadence = ChunkCadence(rate)
      var total = 0
      repeat(40) {
        val result = converter.convert(CaptureBuffer(FloatArray(cadence.advance()), rate))
        assertEquals(400.0, result.size.toDouble(), 1.0)
        total += result.size
      }
      assertEquals(16000.0, total.toDouble(), 1.0)
    }
  }

  @Test fun debugSyntheticInputAllMetadataRatesWithoutHardware() = test {
    for (rate in AudioFormat.rates) {
      val engine = DebugSyntheticEngineFactory().make()
      val format = AudioFormat("pcm_$rate")
      engine.start(format, format)
      val capture = engine.capture()!!
      assertEquals(rate, capture.rate)
      assertEquals(rate / 40, capture.samples.size)
      assertTrue(capture.samples.all { it == 0f })
      engine.stop()
    }
  }
}
