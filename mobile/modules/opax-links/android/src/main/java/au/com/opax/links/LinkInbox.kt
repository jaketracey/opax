package au.com.opax.links

import android.content.Context
import android.content.SharedPreferences
import android.app.Activity
import java.lang.ref.WeakReference
import org.json.JSONArray
import org.json.JSONObject
import java.util.UUID

data class LinkDelivery(val id: String, val sequence: Long, val url: String) {
  fun bridgeValue(): Map<String, Any> = mapOf("id" to id, "sequence" to sequence.toDouble(), "url" to url)
}

/** A delivery exists until navigation acknowledges its ID, regardless of JS lifetime. */
class LinkInbox(private val preferences: SharedPreferences) {
  private data class State(
    val sequence: Long = 0,
    val pending: List<LinkDelivery> = emptyList(),
    // IDs only after consumption. No consumed URL is retained here.
    val tasks: Map<Int, String> = emptyMap(),
  )

  private var state = read()
  private val observers = mutableSetOf<() -> Unit>()

  @Synchronized fun pending(): List<LinkDelivery> = state.pending.toList()
  @Synchronized fun taskDelivery(taskId: Int): String? = state.tasks[taskId]
  @Synchronized fun delivery(id: String): LinkDelivery? = state.pending.firstOrNull { it.id == id }
  @Synchronized fun contains(id: String): Boolean = state.pending.any { it.id == id }

  @Synchronized fun receive(taskId: Int, url: String): LinkDelivery {
    val delivery = LinkDelivery(UUID.randomUUID().toString(), state.sequence + 1, url)
    val tasks = state.tasks.toMutableMap().apply { put(taskId, delivery.id) }
    // Old tasks can be removed from recents. Keep bounded ID metadata, never URLs.
    while (tasks.size > 32) tasks.remove(tasks.keys.first())
    persist(State(delivery.sequence, state.pending + delivery, tasks))
    observers.toList().forEach { it() }
    return delivery
  }

  @Synchronized fun acknowledge(id: String) {
    if (!contains(id)) return
    persist(state.copy(pending = state.pending.filterNot { it.id == id }))
    observers.toList().forEach { it() }
  }

  @Synchronized fun observe(observer: () -> Unit): () -> Unit {
    observers.add(observer)
    return { synchronized(this) { observers.remove(observer) }; Unit }
  }

  private fun persist(next: State) {
    val deliveries = JSONArray()
    next.pending.forEach {
      deliveries.put(JSONObject().put("id", it.id).put("sequence", it.sequence).put("url", it.url))
    }
    val tasks = JSONObject()
    next.tasks.forEach { (task, id) -> tasks.put(task.toString(), id) }
    val body = JSONObject().put("sequence", next.sequence).put("pending", deliveries).put("tasks", tasks)
    // One atomic document, synchronously committed before exposing or consuming a delivery.
    check(preferences.edit().putString("inbox", body.toString()).commit()) { "Could not save link delivery" }
    state = next
  }

  private fun read(): State {
    val raw = preferences.getString("inbox", null) ?: return State()
    return try {
      val body = JSONObject(raw)
      val rows = body.getJSONArray("pending")
      val tasks = body.getJSONObject("tasks")
      State(
        body.getLong("sequence"),
        (0 until rows.length()).map { index ->
          val row = rows.getJSONObject(index)
          LinkDelivery(row.getString("id"), row.getLong("sequence"), row.getString("url"))
        },
        tasks.keys().asSequence().associate { it.toInt() to tasks.getString(it) },
      )
    } catch (_: Exception) {
      // Corrupt metadata must not turn a history restoration into a new delivery.
      State()
    }
  }
}

object AndroidLinkInbox {
  @Volatile private var instance: LinkInbox? = null
  private var owner = WeakReference<Activity>(null)

  fun attach(activity: Activity) { owner = WeakReference(activity) }
  fun activity(): Activity? = owner.get()

  fun get(context: Context): LinkInbox = instance ?: synchronized(this) {
    instance ?: LinkInbox(context.applicationContext.getSharedPreferences("opax-link-inbox", Context.MODE_PRIVATE))
      .also { instance = it }
  }
}
