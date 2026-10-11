package au.com.opax.voice

import android.content.Context
import android.content.SharedPreferences
import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyProperties
import android.util.Base64
import java.security.GeneralSecurityException
import java.security.KeyStore
import java.security.ProviderException
import javax.crypto.AEADBadTagException
import javax.crypto.Cipher
import javax.crypto.KeyGenerator
import javax.crypto.SecretKey
import javax.crypto.spec.GCMParameterSpec
import org.json.JSONObject

/**
 * Opaque outside this module: storage encoding and token access are internal.
 * Not Serializable or Parcelable, and its string form is redacted.
 */
class SessionCredential(internal val token: String, internal val expiresAt: Double) {
  init {
    if (!tokenPattern.matches(token)) throw VoiceException(VoiceFailure.invalidResponse)
  }
  internal fun storageData(): ByteArray =
    JSONObject().put("token", token).put("expiresAt", expiresAt).toString().toByteArray(Charsets.UTF_8)

  override fun equals(other: Any?) = other is SessionCredential && other.token == token && other.expiresAt == expiresAt
  override fun hashCode() = token.hashCode() * 31 + expiresAt.hashCode()
  override fun toString() = "SessionCredential([redacted])"

  companion object {
    private val tokenPattern = Regex("[A-Za-z0-9_-]{43}")
    internal fun fromStorage(data: ByteArray): SessionCredential = decodeObject(data).let {
      SessionCredential(it.requiredString("token"), it.requiredDouble("expiresAt"))
    }
  }
}

interface CredentialStore {
  fun read(): SessionCredential?
  fun write(credential: SessionCredential)
  fun clear()
  /** Atomic within the store; stale requests must never delete a newer sign-in. */
  fun clearIfMatching(credential: SessionCredential): Boolean
}

/** Where the store's AES key lives. Production: a non-exportable Android Keystore key. */
internal interface CredentialKeys {
  /** The existing key, or null. With [create], a new key replaces a missing one. */
  fun key(create: Boolean): SecretKey?
}

internal object AndroidKeystoreKeys : CredentialKeys {
  const val ALIAS = "au.com.opax.voice.session.v1"

  /** AES-256-GCM, encrypt/decrypt only, random IVs, no user authentication. */
  fun spec(): KeyGenParameterSpec =
    KeyGenParameterSpec.Builder(ALIAS, KeyProperties.PURPOSE_ENCRYPT or KeyProperties.PURPOSE_DECRYPT)
      .setBlockModes(KeyProperties.BLOCK_MODE_GCM)
      .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
      .setKeySize(256)
      .setRandomizedEncryptionRequired(true)
      .setUserAuthenticationRequired(false)
      .build()

  @Synchronized
  override fun key(create: Boolean): SecretKey? {
    val store = KeyStore.getInstance("AndroidKeyStore").apply { load(null) }
    (store.getKey(ALIAS, null) as? SecretKey)?.let { return it }
    if (!create) return null
    return KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, "AndroidKeyStore")
      .apply { init(spec()) }
      .generateKey()
  }
}

/**
 * One encrypted item per origin, so loopback fixtures never share production's
 * item. The ciphertext lives in a private preferences file excluded from
 * backup and device transfer (res/xml/opax_voice_*_rules.xml); the AES key never
 * leaves the Keystore. The origin is authenticated data, so an item cannot be
 * moved between origins. Every access holds one lock, so compare-and-clear
 * cannot interleave with a write.
 */
class KeystoreCredentialStore internal constructor(
  context: Context,
  policy: RoutePolicy,
  private val keys: CredentialKeys,
) : CredentialStore {
  constructor(context: Context, policy: RoutePolicy = RoutePolicy()) : this(context, policy, AndroidKeystoreKeys)

  val origin: String = policy.originString
  internal val service = "au.com.opax.voice.session:$origin"
  private val preferences: SharedPreferences =
    context.applicationContext.getSharedPreferences(PREFERENCES, Context.MODE_PRIVATE)
  private val lock = Any()

  override fun read(): SessionCredential? = synchronized(lock) {
    val stored = preferences.getString(service, null) ?: return null
    val sealed = try {
      Base64.decode(stored, Base64.NO_WRAP)
    } catch (_: IllegalArgumentException) {
      null
    }
    val key = guarded { keys.key(create = false) }
    if (sealed == null || sealed.size <= IV_BYTES || key == null) {
      // Not decryptable on this device (a restored copy or a lost key): signed out.
      remove(); return null
    }
    val plain = try {
      Cipher.getInstance(TRANSFORMATION).run {
        init(Cipher.DECRYPT_MODE, key, GCMParameterSpec(TAG_BITS, sealed, 0, IV_BYTES))
        updateAAD(service.toByteArray(Charsets.UTF_8))
        doFinal(sealed, IV_BYTES, sealed.size - IV_BYTES)
      }
    } catch (_: AEADBadTagException) {
      remove(); return null
    } catch (_: GeneralSecurityException) {
      throw VoiceException(VoiceFailure.unavailable)
    } catch (_: ProviderException) {
      throw VoiceException(VoiceFailure.unavailable)
    }
    SessionCredential.fromStorage(plain)
  }

  override fun write(credential: SessionCredential): Unit = synchronized(lock) {
    val sealed = guarded {
      val key = keys.key(create = true) ?: throw VoiceException(VoiceFailure.unavailable)
      Cipher.getInstance(TRANSFORMATION).run {
        init(Cipher.ENCRYPT_MODE, key) // The Keystore chooses a fresh random IV.
        updateAAD(service.toByteArray(Charsets.UTF_8))
        val body = doFinal(credential.storageData())
        check(iv.size == IV_BYTES)
        iv + body
      }
    }
    if (!preferences.edit().putString(service, Base64.encodeToString(sealed, Base64.NO_WRAP)).commit()) {
      throw VoiceException(VoiceFailure.unavailable)
    }
  }

  override fun clear(): Unit = synchronized(lock) { remove() }

  override fun clearIfMatching(credential: SessionCredential): Boolean = synchronized(lock) {
    if (read() != credential) return false
    remove(); true
  }

  private fun remove() {
    if (!preferences.edit().remove(service).commit()) throw VoiceException(VoiceFailure.unavailable)
  }

  private inline fun <T> guarded(block: () -> T): T = try {
    block()
  } catch (error: VoiceException) {
    throw error
  } catch (_: Exception) {
    throw VoiceException(VoiceFailure.unavailable)
  }

  companion object {
    /** Excluded by name in both backup rule files. */
    const val PREFERENCES = "au.com.opax.voice.session"
    private const val TRANSFORMATION = "AES/GCM/NoPadding"
    private const val IV_BYTES = 12
    private const val TAG_BITS = 128
  }
}

class InMemoryCredentialStore : CredentialStore {
  private var credential: SessionCredential? = null
  @Synchronized override fun read() = credential
  @Synchronized override fun write(credential: SessionCredential) { this.credential = credential }
  @Synchronized override fun clear() { credential = null }
  @Synchronized override fun clearIfMatching(credential: SessionCredential): Boolean {
    if (this.credential != credential) return false
    this.credential = null; return true
  }
}

internal object SessionCookie {
  private const val NAME = "__Host-opax_session="
  // Swift's Double(String) grammar for a decimal: no whitespace or type suffix.
  private val decimal = Regex("[+-]?(?:[0-9]+(?:\\.[0-9]*)?|\\.[0-9]+)(?:[eE][+-]?[0-9]+)?")

  fun parse(header: String, now: Double): SessionCredential {
    val pieces = header.split(";").map { it.trim(' ', '\t') }.filter { it.isNotEmpty() }
    val first = pieces.firstOrNull()
    val maxAge = pieces.firstOrNull { it.lowercase().startsWith("max-age=") }
    val seconds = maxAge?.substring(8)?.takeIf(decimal::matches)?.toDoubleOrNull()
    if (first == null || !first.startsWith(NAME) ||
      pieces.none { it.lowercase() == "secure" } ||
      pieces.none { it.lowercase() == "httponly" } ||
      pieces.none { it.lowercase() == "path=/" } ||
      pieces.any { it.lowercase().startsWith("domain=") } ||
      seconds == null || !(seconds > 0 && seconds <= 30 * 86400.0)
    ) throw VoiceException(VoiceFailure.invalidResponse)
    return SessionCredential(first.substring(NAME.length), now + seconds)
  }
}
