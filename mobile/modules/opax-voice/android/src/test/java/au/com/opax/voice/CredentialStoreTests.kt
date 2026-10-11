package au.com.opax.voice

import android.content.Context
import android.security.keystore.KeyProperties
import androidx.test.core.app.ApplicationProvider
import java.util.Properties
import java.util.UUID
import java.util.concurrent.CyclicBarrier
import java.util.concurrent.atomic.AtomicInteger
import javax.crypto.KeyGenerator
import javax.crypto.SecretKey
import javax.xml.parsers.DocumentBuilderFactory
import kotlinx.coroutines.runBlocking
import org.junit.Assert.assertArrayEquals
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test
import org.robolectric.shadows.ShadowLog
import org.xmlpull.v1.XmlPullParser

/**
 * Robolectric has no AndroidKeyStore provider, so the store runs with a
 * software AES key here; [AndroidKeystoreKeys.spec] is checked on its own.
 */
class SoftwareKeys : CredentialKeys {
  private var key: SecretKey? = null
  @Volatile var reads = 0
  var fail = false
  @Synchronized override fun key(create: Boolean): SecretKey? {
    reads += 1
    if (fail) throw java.security.KeyStoreException("Synthetic keystore failure")
    if (key == null && create) key = KeyGenerator.getInstance("AES").apply { init(256) }.generateKey()
    return key
  }
  @Synchronized fun lose() { key = null }
}

/** Not in Swift (Keychain): the Android Keystore store, its races and its backup exclusion. */
class CredentialStoreTests : SafeVoiceTestCase() {
  private val context: Context get() = ApplicationProvider.getApplicationContext()
  private fun preferences() = context.getSharedPreferences(KeystoreCredentialStore.PREFERENCES, Context.MODE_PRIVATE)

  @Test fun keystoreStoreRoundTripsEncryptedAndScopedByOrigin() {
    val keys = SoftwareKeys()
    val production = KeystoreCredentialStore(context, RoutePolicy(), keys)
    val fixture = KeystoreCredentialStore(context, RoutePolicy.loopback(8901), keys)
    val credential = SessionCredential(fixtureToken, distantFuture)
    assertNull(production.read())
    production.write(credential)
    assertEquals(credential, production.read()); assertNull(fixture.read())
    val stored = preferences().all
    assertEquals(setOf(production.service), stored.keys)
    assertFalse(stored.values.single().toString().contains(fixtureToken))
    assertEquals("https://opax.com.au", production.origin); assertEquals("http://127.0.0.1:8901", fixture.origin)
    production.clear(); assertNull(production.read()); assertTrue(preferences().all.isEmpty())
  }

  @Test fun anItemCannotBeMovedToAnotherOrigin() {
    val keys = SoftwareKeys()
    val production = KeystoreCredentialStore(context, RoutePolicy(), keys)
    val fixture = KeystoreCredentialStore(context, RoutePolicy.loopback(8901), keys)
    production.write(SessionCredential(fixtureToken, distantFuture))
    val sealed = preferences().getString(production.service, null)
    preferences().edit().putString(fixture.service, sealed).commit()
    assertNull(fixture.read()) // the origin is authenticated data
    assertNull(preferences().getString(fixture.service, null))
    assertNotNull(production.read())
  }

  @Test fun undecryptableOrKeylessItemsReadAsSignedOut() {
    val keys = SoftwareKeys()
    val store = KeystoreCredentialStore(context, RoutePolicy(), keys)
    store.write(SessionCredential(fixtureToken, distantFuture))
    keys.lose() // a restored copy or a reset Keystore: the key is gone
    assertNull(store.read()); assertTrue(preferences().all.isEmpty())
    preferences().edit().putString(store.service, "not base64 !").commit()
    assertNull(store.read())
    store.write(SessionCredential(fixtureToken, distantFuture))
    val sealed = android.util.Base64.decode(preferences().getString(store.service, null), android.util.Base64.NO_WRAP)
    sealed[sealed.size - 1] = (sealed.last().toInt() xor 1).toByte()
    preferences().edit().putString(store.service, android.util.Base64.encodeToString(sealed, android.util.Base64.NO_WRAP)).commit()
    assertNull(store.read())
  }

  @Test fun keystoreFailuresAreUnavailableNotSignedOut() {
    val keys = SoftwareKeys()
    val store = KeystoreCredentialStore(context, RoutePolicy(), keys)
    store.write(SessionCredential(fixtureToken, distantFuture))
    keys.fail = true
    assertEquals(VoiceFailure.unavailable, assertThrows<VoiceException> { store.read() }.failure)
    assertEquals(VoiceFailure.unavailable, assertThrows<VoiceException> { store.write(SessionCredential(fixtureToken, distantFuture)) }.failure)
    keys.fail = false
    assertNotNull(store.read()) // a transient failure never deleted the item
  }

  @Test fun compareAndClearOnlyClearsTheMatchingCredential() {
    val store = KeystoreCredentialStore(context, RoutePolicy(), SoftwareKeys())
    val old = SessionCredential("a".repeat(43), distantFuture)
    val newer = SessionCredential("b".repeat(43), distantFuture)
    assertFalse(store.clearIfMatching(old))
    store.write(newer)
    assertFalse(store.clearIfMatching(old)); assertEquals(newer, store.read())
    assertTrue(store.clearIfMatching(newer)); assertNull(store.read())
  }

  @Test fun compareAndClearRacesNeverDeleteANewerSignIn() {
    for (store in listOf(KeystoreCredentialStore(context, RoutePolicy(), SoftwareKeys()), InMemoryCredentialStore())) {
      repeat(200) { round ->
        val old = SessionCredential("a".repeat(42) + (round % 10), distantFuture)
        val newer = SessionCredential("b".repeat(42) + (round % 10), distantFuture)
        store.write(old)
        val barrier = CyclicBarrier(2)
        val cleared = AtomicInteger()
        val stale = Thread { barrier.await(); if (store.clearIfMatching(old)) cleared.incrementAndGet() }
        val signIn = Thread { barrier.await(); store.write(newer) }
        stale.start(); signIn.start(); stale.join(); signIn.join()
        // Either order is fine; the newer sign-in always survives.
        assertEquals("round $round", newer, store.read())
        store.clear()
      }
    }
  }

  @Test fun logoutAndDeletionClearTheStoredItem() = runBlocking {
    FixtureServer().use { server ->
      val policy = RoutePolicy.loopback(server.port)
      val store = KeystoreCredentialStore(context, policy, SoftwareKeys())
      val client = VoiceHttpClient(policy, store, OkHttpTransport(policy))
      client.consumeCode("fixture", "12345678")
      assertNotNull(store.read()); assertEquals(setOf(store.service), preferences().all.keys)
      client.logout()
      assertNull(store.read()); assertTrue(preferences().all.isEmpty())
      client.consumeCode("fixture", "12345678")
      server.setResponse(AuthRoute.deleteAccount, deletionResponse("deleteSuccess"))
      client.deleteAccount("c".repeat(43), "00001234")
      assertNull(store.read()); assertTrue(preferences().all.isEmpty())
    }
  }

  /**
   * Review P2-7: a Keystore fault that never clears. Sign-out and deletion keep
   * iOS's order; the unreadable item still leaves this device (removal needs no
   * key), the local state is cleared, and the fault is reported.
   */
  @Test fun aKeystoreFaultThatNeverClearsStillEndsTheSessionOnThisDevice() = runBlocking {
    fun bridge(rig: Rig) = VoiceController(rig.core, rig.client, StoredVoiceConsent(context, "consent-" + UUID.randomUUID()))
    val unavailable = mapOf("ok" to false, "error" to "unavailable")
    // Sign-out with the item unreadable from the start: it cannot be sent or revoked.
    var keys = SoftwareKeys()
    Rig.make(store = { KeystoreCredentialStore(context, it, keys) }).use { rig ->
      val voice = bridge(rig)
      rig.core.refreshStatus(); assertEquals(true, rig.core.snapshot().status?.signedIn)
      keys.fail = true
      assertEquals(unavailable, voice.logout())
      assertEquals(0, rig.server.count(AuthRoute.logout))
      assertTrue(preferences().all.isEmpty())
      // Signed out from here, with no cookie on the next read.
      assertEquals(false, rig.core.snapshot().status?.signedIn)
      assertNull(rig.server.requests.last().header("Cookie"))
    }
    // Sign-out where the fault starts after the Worker revoked the session.
    keys = SoftwareKeys()
    Rig.make(store = { KeystoreCredentialStore(context, it, keys) }).use { rig ->
      val voice = bridge(rig)
      rig.server.handler = { request -> if (request.route == AuthRoute.logout) keys.fail = true; null }
      assertEquals(unavailable, voice.logout())
      assertEquals(listOf("__Host-opax_session=$fixtureToken"), rig.server.requests.first { it.route == AuthRoute.logout }.headers("Cookie"))
      assertTrue(preferences().all.isEmpty())
    }
    // Deletion with the item unreadable: no deletion request, the item and the
    // call's evidence and status cleared, then a fresh signed-out read.
    keys = SoftwareKeys()
    Rig.make(store = { KeystoreCredentialStore(context, it, keys) }).use { rig ->
      val voice = bridge(rig)
      rig.core.refreshStatus()
      rig.server.setResponse(AuthRoute.deleteAccount, deletionResponse("deleteSuccess"))
      keys.fail = true
      assertEquals(unavailable, voice.deleteAccount("c".repeat(43), "00001234"))
      assertEquals(0, rig.server.count(AuthRoute.deleteAccount))
      assertTrue(preferences().all.isEmpty())
      eventually { VoiceEvent.Transcript(emptyList()) in rig.recorder.items && VoiceEvent.Sources(emptyList()) in rig.recorder.items }
      assertEquals(false, rig.core.snapshot().status?.signedIn)
    }
    // A transient fault on an ordinary read still keeps the item (unchanged).
    keys = SoftwareKeys()
    Rig.make(store = { KeystoreCredentialStore(context, it, keys) }).use { rig ->
      keys.fail = true
      assertEquals(VoiceFailure.unavailable, assertThrows<VoiceException> { runBlocking { rig.client.status() } }.failure)
      keys.fail = false
      assertNotNull(rig.store.read())
    }
  }

  @Test fun noCredentialInLogsOrDiagnostics() = runBlocking {
    ShadowLog.clear()
    val transcript = StringBuilder()
    Rig.make().use { rig ->
      rig.store.clear()
      rig.client.requestCode("synthetic@example.invalid")
      rig.client.consumeCode("fixture-challenge", "12345678")
      transcript.append(rig.client.status()).append(rig.core.refreshStatus()).append(rig.core.snapshot())
      rig.server.setResponse(AuthRoute.voiceStart, HttpResponse(503, body = json(mapOf("error" to fixtureToken))))
      val error = assertThrows<APIFailure> { runBlocking { rig.client.start() } }
      transcript.append(error).append(error.message).append(error.stackTraceToString())
      rig.core.logout()
      transcript.append(rig.recorder.items)
    }
    for (log in ShadowLog.getLogs()) transcript.append(log.tag).append(log.msg).append(log.throwable)
    assertFalse(transcript.toString().contains(fixtureToken))
  }

  @Test fun keySpecIsAnAesGcmKeyWithoutUserAuthentication() {
    val spec = AndroidKeystoreKeys.spec()
    assertEquals(AndroidKeystoreKeys.ALIAS, spec.keystoreAlias)
    assertEquals(KeyProperties.PURPOSE_ENCRYPT or KeyProperties.PURPOSE_DECRYPT, spec.purposes)
    assertArrayEquals(arrayOf(KeyProperties.BLOCK_MODE_GCM), spec.blockModes)
    assertArrayEquals(arrayOf(KeyProperties.ENCRYPTION_PADDING_NONE), spec.encryptionPaddings)
    assertEquals(256, spec.keySize)
    assertTrue(spec.isRandomizedEncryptionRequired); assertFalse(spec.isUserAuthenticationRequired)
  }
}

/** Not in Swift (the Keychain item is this-device-only): Android backup and transfer exclusion. */
class BackupRulesTests : SafeVoiceTestCase() {
  private val context: Context get() = ApplicationProvider.getApplicationContext()
  private val credentialFile = KeystoreCredentialStore.PREFERENCES + ".xml"

  private fun rules(resource: Int): List<Triple<String, String, String>> {
    val parser = context.resources.getXml(resource)
    val found = mutableListOf<Triple<String, String, String>>()
    val sections = ArrayDeque<String>()
    while (parser.next() != XmlPullParser.END_DOCUMENT) {
      when (parser.eventType) {
        XmlPullParser.START_TAG -> if (parser.name == "exclude" || parser.name == "include") {
          // An include would narrow what is backed up; it is listed so the comparison fails.
          found += Triple(sections.lastOrNull() + if (parser.name == "include") ":include" else "",
            parser.getAttributeValue(null, "domain"), parser.getAttributeValue(null, "path"))
        } else {
          sections.addLast(parser.name)
        }
        XmlPullParser.END_TAG -> if (parser.name != "exclude" && parser.name != "include") sections.removeLastOrNull()
      }
    }
    return found
  }

  @Test fun dataExtractionRulesExcludeTheCredentialFromCloudBackupAndDeviceTransfer() {
    val found = rules(R.xml.opax_voice_data_extraction_rules)
    assertEquals(listOf(Triple("cloud-backup", "sharedpref", credentialFile), Triple("device-transfer", "sharedpref", credentialFile)), found)
  }

  @Test fun fullBackupContentExcludesTheCredential() {
    assertEquals(listOf(Triple("full-backup-content", "sharedpref", credentialFile)), rules(R.xml.opax_voice_backup_rules))
  }

  @Test fun mergedManifestDeclaresBothRulesAndNoMicrophone() {
    val config = Properties().apply {
      BackupRulesTests::class.java.classLoader!!.getResourceAsStream("com/android/tools/test_config.properties").use(::load)
    }
    val android = "http://schemas.android.com/apk/res/android"
    fun parse(file: java.io.File) = DocumentBuilderFactory.newInstance().apply { isNamespaceAware = true }.newDocumentBuilder().parse(file)
    fun permissions(manifest: org.w3c.dom.Document) = manifest.getElementsByTagName("uses-permission").let { list ->
      (0 until list.length).map { (list.item(it) as org.w3c.dom.Element).getAttributeNS(android, "name") }
    }
    // This module asks for the network only; the call lane adds the microphone.
    assertEquals(listOf("android.permission.INTERNET"), permissions(parse(java.io.File("src/main/AndroidManifest.xml"))))
    val merged = parse(java.io.File(config.getProperty("android_merged_manifest")))
    val application = merged.getElementsByTagName("application").item(0) as org.w3c.dom.Element
    assertEquals("@xml/opax_voice_data_extraction_rules", application.getAttributeNS(android, "dataExtractionRules"))
    assertEquals("@xml/opax_voice_backup_rules", application.getAttributeNS(android, "fullBackupContent"))
    assertTrue("android.permission.INTERNET" in permissions(merged))
    assertFalse("android.permission.RECORD_AUDIO" in permissions(merged))
  }
}
