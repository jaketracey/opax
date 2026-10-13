package au.com.opax.voice

import java.text.BreakIterator
import okhttp3.HttpUrl

private const val IDENT = "[A-Za-z0-9_-]{1,64}"
private val identPattern = Regex(IDENT)
private val pagePattern = Regex("[0-9]{1,3}")
private val cursorPattern = Regex("[1-9][0-9]{0,15}")

// Mirrors the reviewed web methods; no moderator, auth, MCP or arbitrary URL.
internal fun RoutePolicy.permitsCommunity(url: HttpUrl, method: String): Boolean {
  if (url.username.isNotEmpty() || url.password.isNotEmpty() || url.fragment != null ||
    url.host != origin.host || url.port != origin.port || url.scheme != origin.scheme ||
    !url.encodedPath.startsWith("/api/community/")
  ) return false
  val name = url.encodedPath.substring(15)
  fun match(pattern: String) = Regex("(?:$pattern)").matches(name)
  val items = queryItems(url.encodedQuery) ?: return false
  if (items.map { it.first }.toSet().size != items.size) return false
  if (method != "GET" && url.encodedQuery != null) return false
  if (method == "GET") {
    val keys = when {
      name == "threads" -> setOf("feed", "q", "page")
      name == "members" -> setOf("q", "following", "page")
      name == "conversations" -> setOf("page")
      name == "notifications" -> setOf("before")
      name in setOf("status", "preferences", "blocks", "lists") -> emptySet()
      match("threads/$IDENT") -> setOf("reply")
      match("conversations/$IDENT") -> setOf("before", "after")
      match("(?:members|lists)/$IDENT") -> emptySet()
      else -> return false
    }
    for ((key, value) in items) {
      if (key !in keys || value == null) return false
      when (key) {
        "feed" -> if (value !in setOf("all", "following", "saved")) return false
        "following" -> if (value !in setOf("true", "false")) return false
        "q" -> if (characterCount(value) > 120) return false
        "page" -> if (!pagePattern.matches(value) || value.toInt() > 500) return false
        "before", "after" -> if (!cursorPattern.matches(value) || value.toLong() > 9007199254740991L) return false
        "reply" -> if (!identPattern.matches(value)) return false
      }
    }
    return true
  }
  return when (method) {
    "POST" -> name in setOf("threads", "reports", "conversations", "notifications/read", "lists") ||
      match("threads/$IDENT|conversations/$IDENT/(?:read|messages)|messages/$IDENT/report|members/$IDENT/report|lists/$IDENT/items")
    "PATCH" -> name in setOf("profile", "preferences") || match("lists/$IDENT")
    "PUT" -> match("members/$IDENT/(?:follow|block)|threads/$IDENT/(?:like|save)")
    "DELETE" -> match("members/$IDENT/(?:follow|block)|threads/$IDENT/(?:like|save)|(?:threads|replies|lists|items)/$IDENT")
    else -> false
  }
}

/** Swift's `String.count`: user-perceived characters, not UTF-16 units. */
private fun characterCount(text: String): Int {
  val boundaries = BreakIterator.getCharacterInstance().apply { setText(text) }
  var count = 0
  while (boundaries.next() != BreakIterator.DONE) count++
  return count
}
