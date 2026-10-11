package au.com.opax.voice

import android.content.Context
import android.os.Build
import okhttp3.HttpUrl

/** Debug and e2e builds (iOS `DEBUG || OPAX_VOICE_E2E`). Never compiled into a production release. */
internal object VoiceVariant {
  /** The emulator's address for the host loopback, as the e2e catalog origin uses. */
  const val E2E_HOST = "10.0.2.2"

  fun policy(): RoutePolicy {
    // Development builds use production, as iOS DEBUG does.
    if (!BuildConfig.OPAX_VOICE_E2E) return RoutePolicy()
    val port = BuildConfig.OPAX_VOICE_FIXTURE_PORT
    // A missing/mismatched configuration cannot fall back to production.
    check(port in 8900..8999) { "Missing e2e voice configuration" }
    val policy = RoutePolicy.loopback(port, E2E_HOST)
    TransportGuard.installed = e2eGuard(policy, runningOnEmulator())
    return policy
  }

  /**
   * iOS compiles its e2e loopback for the simulator only
   * (`targetEnvironment(simulator)`). Android cannot tell at compile time, so
   * the e2e APK checks where it runs: on a physical phone 10.0.2.2 is an
   * ordinary local-network address, and neither the synthetic sign-in nor its
   * session may go there. Every voice request is refused instead.
   */
  internal fun e2eGuard(policy: RoutePolicy, emulator: Boolean) = TransportGuard { url ->
    if (!emulator || url.host != policy.origin.host) throw VoiceException(VoiceFailure.forbidden)
  }

  /** The emulator's virtual boards: QEMU's "ranchu" and the older "goldfish". No phone reports either. */
  internal fun runningOnEmulator(hardware: String = Build.HARDWARE) = hardware == "ranchu" || hardware == "goldfish"

  /** The e2e fixture injects in-memory credentials, as the iOS e2e pod does. */
  fun store(context: Context, policy: RoutePolicy): CredentialStore =
    if (BuildConfig.OPAX_VOICE_E2E) InMemoryCredentialStore() else KeystoreCredentialStore(context, policy)
}

/** Test fixtures and the e2e build only. Restricts all transports to this one numeric loopback origin. */
internal fun RoutePolicy.Companion.loopback(port: Int, host: String = "127.0.0.1"): RoutePolicy =
  RoutePolicy(HttpUrl.Builder().scheme("http").host(host).port(port).build(), loopback = true)
