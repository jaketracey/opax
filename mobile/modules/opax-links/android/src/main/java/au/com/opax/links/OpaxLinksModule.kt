package au.com.opax.links

import expo.modules.kotlin.exception.Exceptions
import expo.modules.kotlin.functions.Queues
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

class OpaxLinksModule : Module() {
  private var stopObserving: (() -> Unit)? = null
  private fun inbox(): LinkInbox = AndroidLinkInbox.get(appContext.reactContext ?: throw Exceptions.ReactContextLost())

  @Synchronized private fun observingInbox(): LinkInbox {
    val store = inbox()
    if (stopObserving == null) {
      stopObserving = store.observe {
        try {
          sendEvent("onLinkDeliveries", mapOf("deliveries" to store.pending().map { it.bridgeValue() }))
        } catch (_: RuntimeException) {
          // A destroyed JS context cannot receive events. Its successor reads the inbox.
        }
      }
    }
    return store
  }

  override fun definition() = ModuleDefinition {
    Name("OpaxLinks")
    Events("onLinkDeliveries")
    // Expo's OnStartObserving is asynchronous. Install the observer inside
    // this synchronous snapshot call so there is no subscription/snapshot gap.
    Function("pending") { observingInbox().pending().map { it.bridgeValue() } }
    AsyncFunction("acknowledge") { id: String ->
      LinkIntentActivityDelegate.acknowledge(appContext.currentActivity ?: AndroidLinkInbox.activity(), inbox(), id)
    }.runOnQueue(Queues.MAIN)
    OnDestroy { stopObserving?.invoke(); stopObserving = null }
  }
}
