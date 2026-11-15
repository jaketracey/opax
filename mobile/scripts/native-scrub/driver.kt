// scripts/check-native-scrub-kotlin.sh puts this after the Kotlin scrub block: it runs every case
// in the fixture through that block and prints what the scrub keeps, as JSON. The JSON reader and
// writer are local and minimal, so the check needs only the Kotlin standard library. Whole numbers
// read as Long and the rest as Double, as posthog-android and the JS bridge hand them over.
private class OpaxJsonReader(private val text: String) {
  private var at = 0

  fun read(): Any? {
    val value = value()
    space()
    check(at == text.length) { "Trailing JSON at $at" }
    return value
  }

  private fun space() {
    while (at < text.length && text[at] in " \t\r\n") at++
  }

  private fun value(): Any? {
    space()
    return when (text[at]) {
      '{' -> obj()
      '[' -> arr()
      '"' -> str()
      't' -> word("true", true)
      'f' -> word("false", false)
      'n' -> word("null", null)
      else -> number()
    }
  }

  private fun word(
    literal: String,
    value: Any?,
  ): Any? {
    check(text.startsWith(literal, at)) { "Bad literal at $at" }
    at += literal.length
    return value
  }

  private fun obj(): Map<String, Any?> {
    val out = LinkedHashMap<String, Any?>()
    at++
    space()
    if (text[at] == '}') return out.also { at++ }
    while (true) {
      space()
      val key = str()
      space()
      check(text[at++] == ':') { "Expected : at $at" }
      out[key] = value()
      space()
      when (text[at++]) {
        ',' -> continue
        '}' -> return out
        else -> error("Bad object at $at")
      }
    }
  }

  private fun arr(): List<Any?> {
    val out = ArrayList<Any?>()
    at++
    space()
    if (text[at] == ']') return out.also { at++ }
    while (true) {
      out.add(value())
      space()
      when (text[at++]) {
        ',' -> continue
        ']' -> return out
        else -> error("Bad array at $at")
      }
    }
  }

  private fun str(): String {
    check(text[at++] == '"') { "Expected a string at $at" }
    val out = StringBuilder()
    while (true) {
      when (val c = text[at++]) {
        '"' -> return out.toString()
        '\\' ->
          when (val escape = text[at++]) {
            '"', '\\', '/' -> out.append(escape)
            'b' -> out.append('\b')
            'f' -> out.append('\u000C')
            'n' -> out.append('\n')
            'r' -> out.append('\r')
            't' -> out.append('\t')
            'u' -> out.append(text.substring(at, at + 4).toInt(16).toChar()).also { at += 4 }
            else -> error("Bad escape at $at")
          }
        else -> out.append(c)
      }
    }
  }

  private fun number(): Any {
    val start = at
    while (at < text.length && text[at] in "+-0123456789.eE") at++
    val token = text.substring(start, at)
    return if (token.any { it in ".eE" }) token.toDouble() else token.toLongOrNull() ?: token.toDouble()
  }
}

// Plain ASCII out: every other UTF-16 unit is escaped, so JSON.parse rebuilds the exact string.
private fun opaxWriteJson(
  value: Any?,
  out: StringBuilder,
) {
  when (value) {
    null -> out.append("null")
    is String -> {
      out.append('"')
      for (c in value) {
        when {
          c == '"' -> out.append("\\\"")
          c == '\\' -> out.append("\\\\")
          c < ' ' || c > '~' -> out.append(String.format("\\u%04x", c.code))
          else -> out.append(c)
        }
      }
      out.append('"')
    }
    is Boolean, is Long, is Int, is Short, is Byte -> out.append(value.toString())
    is Double -> out.append(if (value.isFinite()) value.toString() else "null")
    is Float -> opaxWriteJson(value.toDouble(), out)
    is Map<*, *> -> {
      out.append('{')
      value.entries.forEachIndexed { index, (key, item) ->
        if (index > 0) out.append(',')
        opaxWriteJson(key.toString(), out)
        out.append(':')
        opaxWriteJson(item, out)
      }
      out.append('}')
    }
    is List<*> -> {
      out.append('[')
      value.forEachIndexed { index, item ->
        if (index > 0) out.append(',')
        opaxWriteJson(item, out)
      }
      out.append(']')
    }
    else -> error("Unexpected ${value::class.java.name} in the scrub output")
  }
}

fun main(args: Array<String>) {
  val cases = OpaxJsonReader(java.io.File(args[0]).readText()).read() as Map<*, *>
  val messages = (cases["messages"] as List<*>).map { opaxScrubMessage(it) }
  val events =
    (cases["events"] as List<*>).map { input ->
      input as Map<*, *>
      @Suppress("UNCHECKED_CAST")
      val event = PostHogEvent(event = input["event"] as String, properties = input["properties"] as Map<String, Any>?)
      opaxScrubNativeEvent(event)?.properties
    }
  val out = StringBuilder()
  // Reaching here means the file's rules compiled: a bad pattern fails the class's initialiser.
  opaxWriteJson(mapOf("rulesCompiled" to opaxMessageRules.isNotEmpty(), "messages" to messages, "events" to events), out)
  println(out)
}
