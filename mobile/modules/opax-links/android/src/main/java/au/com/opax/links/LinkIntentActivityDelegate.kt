package au.com.opax.links

import android.app.Activity
import android.content.Intent
import android.net.Uri
import android.nfc.NfcAdapter
import android.os.Bundle

/** Called before ReactActivity creates JS or forwards a new intent to Linking. */
class LinkIntentActivityDelegate(
  private val activity: Activity,
  private val inbox: LinkInbox = AndroidLinkInbox.get(activity),
) {
  fun onCreate(savedInstanceState: Bundle?) {
    AndroidLinkInbox.attach(activity)
    val intent = activity.intent ?: return
    val restoring = savedInstanceState != null || intent.flags and Intent.FLAG_ACTIVITY_LAUNCHED_FROM_HISTORY != 0
    if (restoring) {
      // The task slot also covers a delivery received after the last saved Bundle.
      val id = inbox.taskDelivery(activity.taskId) ?: savedInstanceState?.getString(DELIVERY_ID)
      val pending = id?.let { inbox.delivery(it) }
      if (pending != null) {
        activity.intent = Intent(intent).setAction(Intent.ACTION_VIEW).setData(Uri.parse(pending.url))
          .putExtra(DELIVERY_ID, pending.id)
      } else {
        clearUrl(activity, id)
      }
    } else {
      receive(intent)
    }
  }

  fun onNewIntent(intent: Intent) = receive(intent)

  fun onSaveInstanceState(outState: Bundle) {
    val id = activity.intent?.getStringExtra(DELIVERY_ID)
    if (id != null) outState.putString(DELIVERY_ID, id) else outState.remove(DELIVERY_ID)
  }

  private fun receive(intent: Intent) {
    AndroidLinkInbox.attach(activity)
    val url = if (intent.action == Intent.ACTION_VIEW || intent.action == NfcAdapter.ACTION_NDEF_DISCOVERED) intent.dataString else null
    if (url == null) {
      activity.intent = Intent(intent).apply { removeExtra(DELIVERY_ID) }
      return
    }
    // A new invocation is a new delivery, even if its URL or incoming extras repeat.
    val delivery = inbox.receive(activity.taskId, url)
    activity.intent = Intent(intent).putExtra(DELIVERY_ID, delivery.id)
  }

  companion object {
    private const val DELIVERY_ID = "au.com.opax.links.delivery"

    fun acknowledge(activity: Activity?, inbox: LinkInbox, id: String) {
      inbox.acknowledge(id)
      // A delayed acknowledgement for A must never clear a newer intent B.
      if (activity?.intent?.getStringExtra(DELIVERY_ID) == id) clearUrl(activity, id)
    }

    private fun clearUrl(activity: Activity, id: String?) {
      val clean = Intent(activity.intent).setAction(Intent.ACTION_MAIN).setData(null)
        .apply { removeCategory(Intent.CATEGORY_BROWSABLE) }
      if (id != null) clean.putExtra(DELIVERY_ID, id) else clean.removeExtra(DELIVERY_ID)
      activity.intent = clean
    }
  }
}
