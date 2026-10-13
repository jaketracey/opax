package au.com.opax.voice

import android.content.Context

/** Production release: the opax.com.au origin and the Keystore only; no loopback code. */
internal object VoiceVariant {
  fun policy() = RoutePolicy()
  fun store(context: Context, policy: RoutePolicy): CredentialStore = KeystoreCredentialStore(context, policy)
}
