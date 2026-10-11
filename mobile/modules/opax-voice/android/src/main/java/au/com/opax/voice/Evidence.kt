package au.com.opax.voice

import android.icu.text.BreakIterator
import okhttp3.HttpUrl.Companion.toHttpUrl

internal class EvidenceModel {
  var turns: List<TranscriptTurn> = emptyList()
    private set
  var sources: List<VoiceSource> = emptyList()
    private set
  private var serial = 0

  fun add(turn: TranscriptTurn, correction: Boolean) {
    var turn = turn.copy(text = prefix(turn.text, 12000))
    if (turn.text.isBlank()) return
    if (turn.id == -1) {
      val prior = if (correction) turns.lastOrNull { it.role == TranscriptTurn.Role.agent } else null
      turn = if (prior != null) turn.copy(id = prior.id) else { serial += 1; turn.copy(id = -serial - 1) }
    }
    val index = turns.indexOfFirst { it.role == turn.role && it.id == turn.id }
    turns = if (index >= 0) turns.toMutableList().also { it[index] = turn } else (turns + turn).takeLast(80)
    markdown(turn.text)
  }

  private fun addSource(title: String, url: String) {
    val path = sourcePath(url) ?: return
    if (sources.size >= 12 || sources.any { it.path == path }) return
    sources = sources + VoiceSource(prefix(title, 220), path)
  }

  private fun markdown(text: String) {
    for (match in link.findAll(text)) addSource(match.groupValues[1], match.groupValues[2])
  }

  fun collect(value: JsonValue, depth: Int = 0) {
    if (depth > 5) return
    when (value) {
      is JsonValue.Str -> {
        if (value.value.length > 160000) return
        collect(runCatching { JsonValue.parse(value.value) }.getOrNull() ?: return, depth + 1)
      }
      is JsonValue.Arr -> value.items.take(30).forEach { collect(it, depth + 1) }
      is JsonValue.Obj -> {
        val url = value["href"].string ?: value["destination"].string ?: value["url"].string
        if (url != null) addSource(value["title"].string ?: value["label"].string ?: "Open the source record", url)
        for (key in listOf("sources", "records", "result", "response", "body", "content", "text", "full_tool_result")) {
          collect(value[key], depth + 1)
        }
      }
      else -> Unit
    }
  }

  companion object {
    private val origin = "https://opax.com.au".toHttpUrl()
    private val record = Regex(
      "^/(?:doc/[^/]+|bill/[^/]+|subject/(?:person|party|supplier|donor|recipient|topic|campaigner|agency)/[^/]+|" +
        "money(?:/(?:contracts|grants|donations|receipts|expenses|interests))?|declared|search|connections|topics|parties|" +
        "reports(?:/[^/]+)?|journey/[^/]+)/?$",
    )
    private val control = Regex("%[01][0-9a-f]|%7f", RegexOption.IGNORE_CASE)
    // ICU's \s (Unicode White_Space), which NSRegularExpression uses.
    private const val space = "\\t\\n\\u000B\\f\\r \\u0085\\u00A0\\u1680\\u2000-\\u200A\\u2028\\u2029\\u202F\\u205F\\u3000"
    private val link = Regex("\\[([^\\]\\n]{1,220})\\]\\(([^$space)]+)\\)")

    /** A validated OPAX record path, never a signed URL. */
    fun sourcePath(value: String): String? {
      if (value.length > 1800) return null
      val url = origin.resolve(value) ?: return null
      // Match the web origin (HTTPS); HTTP links are cross-origin and refused.
      if (url.scheme != "https" || url.host != "opax.com.au" || url.port != 443 ||
        url.username.isNotEmpty() || url.password.isNotEmpty()
      ) {
        return null
      }
      if (!record.matches(url.encodedPath) || control.containsMatchIn(url.toString())) return null
      return url.encodedPath + (url.encodedQuery?.let { "?$it" } ?: "") + (url.encodedFragment?.let { "#$it" } ?: "")
    }

    /** Swift's String.prefix: whole user-perceived characters, never half a pair. */
    fun prefix(text: String, count: Int): String {
      if (text.length <= count) return text
      val characters = BreakIterator.getCharacterInstance().apply { setText(text) }
      var end = 0
      repeat(count) { end = characters.next().takeIf { it != BreakIterator.DONE } ?: return text }
      return text.substring(0, end)
    }
  }
}
