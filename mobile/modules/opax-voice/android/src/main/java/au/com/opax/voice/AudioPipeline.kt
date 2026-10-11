package au.com.opax.voice

import kotlin.math.PI
import kotlin.math.abs
import kotlin.math.ceil
import kotlin.math.cos
import kotlin.math.floor
import kotlin.math.log10
import kotlin.math.sin
import kotlin.math.sqrt

class AudioFormat private constructor(val codec: Codec, val rate: Int) {
  enum class Codec { pcm, ulaw }

  override fun equals(other: Any?) = other is AudioFormat && other.codec == codec && other.rate == rate
  override fun hashCode() = codec.hashCode() * 31 + rate
  override fun toString() = "${codec.name}_$rate"

  companion object {
    val rates = listOf(8000, 16000, 22050, 24000, 44100, 48000)

    operator fun invoke(metadata: String): AudioFormat {
      val parts = metadata.split("_")
      val codec = Codec.entries.firstOrNull { it.name == parts[0] }
      val rate = parts.getOrNull(1)?.toIntOrNull()
      if (parts.size != 2 || codec == null || rate == null || rate.toString() != parts[1] || rate !in rates) {
        throw VoiceException(VoiceFailure.unsupportedFormat)
      }
      return AudioFormat(codec, rate)
    }
  }
}

object AudioCodec {
  fun encode(samples: FloatArray, format: AudioFormat, muted: Boolean = false): ByteArray {
    val bytes = ByteArray(samples.size * if (format.codec == AudioFormat.Codec.pcm) 2 else 1)
    for ((index, sample) in samples.withIndex()) {
      val clamped = if (muted || sample.isNaN()) 0.0 else sample.toDouble().coerceIn(-1.0, 1.0)
      val scaled = clamped * if (clamped < 0) 32768 else 32767
      when (format.codec) {
        AudioFormat.Codec.pcm -> {
          val value = scaled.toInt() // toward zero
          bytes[index * 2] = (value and 255).toByte()
          bytes[index * 2 + 1] = ((value shr 8) and 255).toByte()
        }
        // JavaScript Math.round: ties toward +infinity, including negative halves.
        AudioFormat.Codec.ulaw -> bytes[index] = encodeMuLaw(floor(scaled + 0.5).toInt())
      }
    }
    return bytes
  }

  fun encodeMuLaw(value: Int): Byte {
    val clamped = value.coerceIn(-32768, 32767)
    val sign = (clamped shr 8) and 0x80
    val biased = minOf(32635, abs(clamped) + 0x84)
    var exponent = 7
    var mask = 0x4000
    while (exponent > 0 && (biased and mask) == 0) { exponent -= 1; mask = mask shr 1 }
    return (sign or (exponent shl 4) or ((biased shr (exponent + 3)) and 15)).inv().toByte()
  }

  fun decode(bytes: ByteArray, format: AudioFormat): FloatArray = when (format.codec) {
    AudioFormat.Codec.pcm -> {
      if (bytes.size % 2 != 0) throw VoiceException(VoiceFailure.invalidResponse)
      FloatArray(bytes.size / 2) {
        ((bytes[it * 2].toInt() and 255) or (bytes[it * 2 + 1].toInt() shl 8)).toShort() / 32768f
      }
    }
    AudioFormat.Codec.ulaw -> FloatArray(bytes.size) {
      val u = bytes[it].toInt().inv() and 255
      val magnitude = (((u and 15) shl 3) + 0x84) shl ((u shr 4) and 7)
      val pcm = if ((u and 0x80) == 0) magnitude - 0x84 else 0x84 - magnitude
      pcm / 32768f
    }
  }
}

/** Integer fractional-sample accumulator: no drift, including nonintegral 25 ms rates. */
class ChunkCadence(val rate: Int) {
  private var remainder = 0

  init { require(rate in AudioFormat.rates) }

  val nextCount get() = (rate + remainder) / 40

  fun advance(): Int {
    val count = nextCount
    remainder = (rate + remainder) % 40
    return count
  }
}

class ChunkAccumulator(rate: Int) {
  private val cadence = ChunkCadence(rate)
  private var pending = FloatArray(0)
  val rate get() = cadence.rate
  val nextCount get() = cadence.nextCount
  val pendingCount get() = pending.size

  fun append(samples: FloatArray): List<FloatArray> {
    val joined = pending + samples
    val chunks = mutableListOf<FloatArray>()
    var offset = 0
    while (joined.size - offset >= nextCount) {
      val count = cadence.advance()
      chunks += joined.copyOfRange(offset, offset + count)
      offset += count
    }
    pending = joined.copyOfRange(offset, joined.size)
    return chunks
  }
}

class BoundedQueue<E>(val limit: Int) {
  private val elements = ArrayDeque<Pair<E, Int>>()
  var weight = 0
    private set
  val count get() = elements.size

  init { require(limit > 0) }

  fun append(element: E, weight: Int) {
    if (weight < 0 || weight > limit - this.weight) throw VoiceException(VoiceFailure.queueOverflow)
    elements.addLast(element to weight)
    this.weight += weight
  }

  fun pop(): E? {
    val first = elements.removeFirstOrNull() ?: return null
    weight -= first.second
    return first.first
  }

  fun clear() { elements.clear(); weight = 0 }
}

/** Mono samples copied out of the capture ring on the audio worker. */
class CaptureBuffer(val samples: FloatArray, val rate: Int)

internal object PlaybackLimits {
  const val maximumSeconds = 30 // scheduled output; another 30 seconds in encoded backlog
  const val backlogSeconds = 30
}

/**
 * Coarse loudness for the call screen's animation, never audio: 0 is -60 dBFS
 * or quieter, 1 is full scale. Read about 15 times a second while live.
 */
data class AudioLevels(val input: Float, val output: Float) {
  companion object {
    val silent = AudioLevels(0f, 0f)
  }
}

object LevelMeter {
  /** RMS of one buffer, mapped linearly in decibels from -60 dBFS (0) to 0 dBFS (1). */
  fun level(samples: FloatArray, count: Int = samples.size): Float {
    if (count <= 0) return 0f
    var sum = 0f
    for (index in 0 until count) {
      val sample = samples[index]
      if (sample.isFinite()) sum += sample * sample
    }
    return level(rms = sqrt(sum / count))
  }

  fun level(rms: Float): Float {
    if (!rms.isFinite() || rms <= 0.001f) return 0f // below -60 dBFS
    return ((20 * log10(rms) + 60) / 60).coerceIn(0f, 1f)
  }
}

interface VoiceAudioEngine {
  suspend fun start(input: AudioFormat, output: AudioFormat)
  /** Suspends until a capture arrives; null means capture stopped. */
  suspend fun capture(): CaptureBuffer?
  /** Accept only the current playback epoch, checking again after any suspension. */
  suspend fun schedule(samples: FloatArray, rate: Int, playbackEpoch: Int)
  suspend fun queuedSamples(): Int
  suspend fun waitForPlayback(atMostSamples: Int)
  /** Clear scheduled output and accept this epoch; older pending schedules are discarded. */
  suspend fun flush(playbackEpoch: Int)
  suspend fun setMuted(muted: Boolean)
  suspend fun reconfigure()
  suspend fun stop()
  /** Latest input (after voice processing) and output loudness. */
  suspend fun levels(): AudioLevels = AudioLevels.silent
}

fun interface VoiceEngineFactory {
  suspend fun make(): VoiceAudioEngine
}

/**
 * One converter per hardware rate, retained across capture drains. Does not
 * open audio I/O. Confined to the call controller's serial context.
 */
internal class CaptureConverter(private val outputRate: Int) {
  private var resampler: StreamingResampler? = null
  private var inputRate = 0

  fun convert(input: CaptureBuffer): FloatArray {
    if (input.rate <= 0 || input.rate > 192000 || input.samples.size > input.rate * 2) {
      throw VoiceException(VoiceFailure.audio)
    }
    if (input.rate == outputRate) return input.samples
    val current = resampler?.takeIf { inputRate == input.rate }
      ?: StreamingResampler(input.rate, outputRate).also { resampler = it; inputRate = input.rate }
    return current.process(input.samples)
  }
}

/**
 * Band-limited rational resampler (Blackman-windowed sinc). Like AVAudioConverter
 * with no priming, output keeps pace with input: n input samples yield
 * ceil(n x out / in) in total, delayed by the filter's half width, and a
 * stream split anywhere yields the same samples as one whole buffer.
 */
internal class StreamingResampler(inputRate: Int, outputRate: Int) {
  private val up: Int
  private val down: Int
  private val half: Int
  private val phases: Array<FloatArray>
  // Virtual index v = input index + 2 x half; the leading 2 x half samples are silence.
  private var buffer: FloatArray
  private var bufferBase = 0L
  private var received = 0L
  private var produced = 0L

  init {
    val divisor = gcd(inputRate, outputRate)
    up = outputRate / divisor
    down = inputRate / divisor
    // Cutoff in cycles per input sample, below the lower Nyquist frequency.
    val cutoff = 0.46 * minOf(1.0, outputRate.toDouble() / inputRate)
    half = ceil(16 / (2 * cutoff)).toInt()
    phases = Array(up) { phase ->
      val taps = FloatArray(2 * half)
      var sum = 0.0
      val raw = DoubleArray(2 * half) { k ->
        val t = k + 1 - half - phase.toDouble() / up
        val x = 2 * cutoff * t
        val sinc = if (x == 0.0) 1.0 else sin(PI * x) / (PI * x)
        val w = (t + half) / (2.0 * half)
        val window = 0.42 - 0.5 * cos(2 * PI * w) + 0.08 * cos(4 * PI * w)
        (sinc * window).also { sum += it }
      }
      for (k in taps.indices) taps[k] = (raw[k] / sum).toFloat()
      taps
    }
    buffer = FloatArray(2 * half)
  }

  fun process(input: FloatArray): FloatArray {
    buffer += input
    received += input.size
    // Output j sits at input position j x down / up; emit it once that sample arrived.
    val total = (received * up + down - 1) / down
    val output = FloatArray((total - produced).toInt())
    for (index in output.indices) {
      val position = produced * down
      val newest = position / up + 2 * half - bufferBase
      val taps = phases[(position % up).toInt()]
      var sum = 0.0
      val start = (newest - 2 * half + 1).toInt()
      for (k in taps.indices) sum += buffer[start + k] * taps[k]
      output[index] = sum.toFloat()
      produced += 1
    }
    val keep = (produced * down / up + 1 - bufferBase).toInt().coerceIn(0, buffer.size)
    buffer = buffer.copyOfRange(keep, buffer.size)
    bufferBase += keep
    return output
  }

  private companion object {
    tailrec fun gcd(a: Int, b: Int): Int = if (b == 0) a else gcd(b, a % b)
  }
}
