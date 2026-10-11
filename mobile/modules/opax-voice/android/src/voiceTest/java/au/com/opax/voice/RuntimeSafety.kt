package au.com.opax.voice

import kotlinx.coroutines.asContextElement
import kotlinx.coroutines.withContext
import okhttp3.HttpUrl
import okhttp3.Request

/**
 * One execution boundary for real and fake HTTP/WebSocket transports and audio
 * I/O. Compiled into debug (unit tests, development) and the e2e variant only;
 * production compiles the no-op in src/voiceProduction.
 */
internal object VoiceTestSafety {
  data class Audit(val inputOpens: Int, val outputOpens: Int, val hosts: Set<String>) {
    // Attempted opens and hosts, including refused attempts.
    val isClean get() = inputOpens == 0 && outputOpens == 0 && loopbackHosts.containsAll(hosts)
  }

  class Monitor(loopbackOnly: Boolean = true) {
    @Volatile var loopbackOnly = loopbackOnly
    internal var inputOpens = 0
    internal var outputOpens = 0
    internal val hosts = mutableSetOf<String>()
    fun audit() = synchronized(this) { Audit(inputOpens, outputOpens, hosts.toSet()) }
  }

  // The emulator reaches the Mac's loopback fixture through its host alias.
  private val loopbackHosts = if (BuildConfig.OPAX_VOICE_E2E) setOf("127.0.0.1", "10.0.2.2") else setOf("127.0.0.1")
  private val shared = Monitor(loopbackOnly = BuildConfig.OPAX_VOICE_E2E || underJUnit())
  // Negative guard self-tests use a separate measured scope and assert it is
  // dirty. Every ordinary test uses the cumulative monitor; it is never reset.
  private val isolated = ThreadLocal<Monitor?>()
  private val monitor get() = isolated.get() ?: shared

  suspend fun <T> withIsolated(scope: Monitor, block: suspend () -> T): T =
    withContext(isolated.asContextElement(scope)) { block() }

  fun installLoopbackOnly() { shared.loopbackOnly = true }

  fun validate(request: Request) = validate(request.url)

  fun validate(url: HttpUrl) {
    val state = monitor
    synchronized(state) {
      state.hosts += url.host
      if (!state.loopbackOnly) return
      if (url.host !in loopbackHosts || url.username.isNotEmpty() || url.password.isNotEmpty()) {
        throw VoiceException(VoiceFailure.forbidden)
      }
    }
  }

  fun willOpenAudio() {
    val state = monitor
    synchronized(state) {
      state.inputOpens += 1
      state.outputOpens += 1
      if (state.loopbackOnly) throw VoiceException(VoiceFailure.audio)
    }
  }

  fun blocksHardware() = monitor.loopbackOnly
  fun audit() = monitor.audit()
  fun cumulativeAudit() = shared.audit()

  private fun underJUnit() = runCatching { Class.forName("org.junit.runner.JUnitCore") }.isSuccess
}
