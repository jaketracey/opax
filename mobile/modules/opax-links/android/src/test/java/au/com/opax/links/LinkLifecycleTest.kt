package au.com.opax.links

import android.app.Activity
import android.content.Context
import android.content.Intent
import android.content.SharedPreferences
import android.net.Uri
import android.nfc.NfcAdapter
import android.os.Bundle
import android.content.res.Configuration
import androidx.test.core.app.ApplicationProvider
import org.junit.Assert.*
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.Robolectric
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config
import org.robolectric.android.controller.ActivityController
import java.io.File

@RunWith(RobolectricTestRunner::class)
@Config(sdk = [35], manifest = Config.NONE)
class LinkLifecycleTest {
  private val context get() = ApplicationProvider.getApplicationContext<Context>()
  private val preferences get() = context.getSharedPreferences("link-lifecycle-test", Context.MODE_PRIVATE)
  private val a = "opax://party/one"
  private val b = "opax://party/two"

  class Host : Activity() {
    private lateinit var links: LinkIntentActivityDelegate
    override fun onCreate(state: Bundle?) {
      links = LinkIntentActivityDelegate(this, inbox)
      links.onCreate(state)
      super.onCreate(state)
    }
    override fun onNewIntent(intent: Intent) { links.onNewIntent(intent); super.onNewIntent(intent) }
    override fun onSaveInstanceState(state: Bundle) { links.onSaveInstanceState(state); super.onSaveInstanceState(state) }
    companion object { lateinit var inbox: LinkInbox }
  }

  @Before fun setup() {
    assertTrue(preferences.edit().clear().commit())
    Host.inbox = LinkInbox(preferences)
  }

  private fun view(url: String) = Intent(Intent.ACTION_VIEW, Uri.parse(url)).addCategory(Intent.CATEGORY_BROWSABLE)
  private fun newProcessInbox(): LinkInbox {
    // Bypass Context's process-local SharedPreferences cache. The replacement
    // reads the committed XML, as a new Android process does.
    val file = File(context.applicationInfo.dataDir, "shared_prefs/link-lifecycle-test.xml")
    assertTrue(file.isFile)
    val constructor = Class.forName("android.app.SharedPreferencesImpl")
      .getDeclaredConstructor(File::class.java, Int::class.javaPrimitiveType)
    constructor.isAccessible = true
    return LinkInbox(constructor.newInstance(file, Context.MODE_PRIVATE) as SharedPreferences)
  }
  private fun launch(intent: Intent, state: Bundle? = null): ActivityController<Host> =
    Robolectric.buildActivity(Host::class.java, intent).create(state).start().resume().visible()

  // React Native IntentModule.getInitialURL reads these exact Activity fields.
  private fun initialUrl(activity: Activity): String? = activity.intent?.let {
    if (it.action == Intent.ACTION_VIEW || it.action == NfcAdapter.ACTION_NDEF_DISCOVERED) it.dataString else null
  }

  @Test fun acknowledgementClearsTheInitialGetterAndDoesNotReopenAfterBackOrRouterRestart() {
    val host = launch(Intent(Intent.ACTION_MAIN))
    host.newIntent(view(a))
    val id = Host.inbox.pending().single().id
    assertEquals(a, initialUrl(host.get()))
    LinkIntentActivityDelegate.acknowledge(host.get(), Host.inbox, id)
    assertNull(initialUrl(host.get()))
    assertTrue(Host.inbox.pending().isEmpty())
    // Back is a JS operation. A subsequent Router initial read sees no consumed URL.
    assertNull(initialUrl(host.get()))
    assertFalse(preferences.getString("inbox", "")!!.replace("\\/", "/").contains(a))
    host.pause().stop().destroy()
  }

  @Test fun acknowledgingAnOlderDeliveryDoesNotClearTheNewerIntent() {
    val host = launch(view(a))
    val first = Host.inbox.pending().single()
    host.newIntent(view(b))
    val second = Host.inbox.pending().last()
    LinkIntentActivityDelegate.acknowledge(host.get(), Host.inbox, first.id)
    assertEquals(b, initialUrl(host.get()))
    assertEquals(listOf(second), Host.inbox.pending())
    LinkIntentActivityDelegate.acknowledge(host.get(), Host.inbox, second.id)
    assertNull(initialUrl(host.get()))
    host.pause().stop().destroy()
  }

  @Test fun eachDeliveryHasItsOwnIdentityEvenWhenTheUrlRepeatsBeforeJsStarts() {
    val host = launch(view(a))
    host.newIntent(view(b)).newIntent(view(a))
    val pending = Host.inbox.pending()
    assertEquals(listOf(a, b, a), pending.map { it.url })
    assertEquals(3, pending.map { it.id }.toSet().size)
    assertEquals(pending.sortedBy { it.sequence }, pending)
    // A new inbox instance reads the same FIFO, including deliveries made before JS.
    assertEquals(pending, newProcessInbox().pending())
    host.pause().stop().destroy()
  }

  @Test fun recreationKeepsPendingIdentityAndDoesNotCreateAnotherDelivery() {
    val host = launch(view(a))
    host.newIntent(view(b))
    val pending = Host.inbox.pending()
    host.recreate()
    assertEquals(pending, Host.inbox.pending())
    assertEquals(b, initialUrl(host.get()))
    host.pause().stop().destroy()
  }

  @Test fun recreationAfterConsumptionClearsAnOriginalOsIntent() {
    val original = view(a)
    val host = launch(original)
    val state = Bundle()
    host.pause().saveInstanceState(state).stop()
    LinkIntentActivityDelegate.acknowledge(host.get(), Host.inbox, Host.inbox.pending().single().id)
    host.destroy()
    val recreated = launch(original, state)
    assertNull(initialUrl(recreated.get()))
    assertTrue(Host.inbox.pending().isEmpty())
    recreated.pause().stop().destroy()
  }

  @Test fun configurationChangeDoesNotReopenAConsumedDelivery() {
    val host = launch(view(a))
    LinkIntentActivityDelegate.acknowledge(host.get(), Host.inbox, Host.inbox.pending().single().id)
    val configuration = Configuration(host.get().resources.configuration).apply { fontScale = 1.5f }
    host.configurationChange(configuration)
    assertNull(initialUrl(host.get()))
    assertTrue(Host.inbox.pending().isEmpty())
    host.pause().stop().destroy()
  }

  @Test fun subscribingBeforeSnapshotRetainsBothEarlierAndConcurrentDeliveries() {
    val first = Host.inbox.receive(1, a)
    val events = mutableListOf<List<LinkDelivery>>()
    val stop = Host.inbox.observe { events.add(Host.inbox.pending()) }
    val second = Host.inbox.receive(1, b)
    val snapshot = Host.inbox.pending()
    assertEquals(listOf(first, second), snapshot)
    assertEquals(listOf(snapshot), events)
    stop()
  }

  @Test fun processDeathPreservesPendingDeliveriesWithNoJsObjects() {
    val original = view(a)
    val host = launch(original)
    host.newIntent(view(b))
    val before = Host.inbox.pending()
    val state = Bundle()
    host.pause().saveInstanceState(state).stop().destroy()
    Host.inbox = newProcessInbox() // No process-local preferences, observers or JS queue.
    val restored = launch(original, state)
    assertEquals(before, Host.inbox.pending())
    assertEquals(b, initialUrl(restored.get()))
    restored.pause().stop().destroy()
  }

  @Test fun processDeathAfterConsumptionDoesNotReplayEvenWithAnOlderSavedBundle() {
    val original = view(a)
    val host = launch(original)
    val oldState = Bundle()
    host.pause().saveInstanceState(oldState).resume()
    host.newIntent(view(b)) // Received after the saved Bundle.
    Host.inbox.pending().forEach { LinkIntentActivityDelegate.acknowledge(host.get(), Host.inbox, it.id) }
    host.pause().stop().destroy()
    Host.inbox = newProcessInbox()
    val restored = launch(original, oldState)
    assertNull(initialUrl(restored.get()))
    assertTrue(Host.inbox.pending().isEmpty())
    restored.pause().stop().destroy()
  }

  @Test fun processDeathRestoresADeliveryReceivedAfterTheLastSavedBundle() {
    val original = view(a)
    val host = launch(original)
    val oldState = Bundle()
    host.pause().saveInstanceState(oldState).resume()
    host.newIntent(view(b))
    val before = Host.inbox.pending()
    host.pause().stop().destroy()
    Host.inbox = newProcessInbox()
    val restored = launch(original, oldState)
    assertEquals(before, Host.inbox.pending())
    assertEquals(b, initialUrl(restored.get()))
    restored.pause().stop().destroy()
  }

  @Test fun processDeathWithoutABundleKeepsThePendingFifo() {
    val host = launch(view(a))
    host.newIntent(view(b))
    val before = Host.inbox.pending()
    host.pause().stop().destroy()
    Host.inbox = newProcessInbox()
    val restored = launch(view(a).addFlags(Intent.FLAG_ACTIVITY_LAUNCHED_FROM_HISTORY))
    assertEquals(before, Host.inbox.pending())
    assertEquals(b, initialUrl(restored.get()))
    restored.pause().stop().destroy()
  }

  @Test fun historyRestorationWithoutABundleDoesNotReopenAConsumedUrl() {
    val original = view(a)
    val host = launch(original)
    LinkIntentActivityDelegate.acknowledge(host.get(), Host.inbox, Host.inbox.pending().single().id)
    host.pause().stop().destroy()
    Host.inbox = newProcessInbox()
    val restored = launch(view(a).addFlags(Intent.FLAG_ACTIVITY_LAUNCHED_FROM_HISTORY))
    assertNull(initialUrl(restored.get()))
    assertTrue(Host.inbox.pending().isEmpty())
    restored.pause().stop().destroy()
  }

  @Test fun corruptMetadataCannotTurnAHistoryRestorationIntoANewDelivery() {
    assertTrue(preferences.edit().putString("inbox", "invalid-json").commit())
    Host.inbox = newProcessInbox()
    val restored = launch(view(a).addFlags(Intent.FLAG_ACTIVITY_LAUNCHED_FROM_HISTORY))
    assertNull(initialUrl(restored.get()))
    assertTrue(Host.inbox.pending().isEmpty())
    restored.pause().stop().destroy()
  }

  @Test fun aFreshUserIntentAfterConsumptionIsStillANewDelivery() {
    val host = launch(view(a))
    val first = Host.inbox.pending().single().id
    LinkIntentActivityDelegate.acknowledge(host.get(), Host.inbox, first)
    host.newIntent(view(a))
    assertEquals(a, initialUrl(host.get()))
    assertNotEquals(first, Host.inbox.pending().single().id)
    host.pause().stop().destroy()
  }
}
