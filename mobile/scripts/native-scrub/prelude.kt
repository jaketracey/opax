// scripts/check-native-scrub-kotlin.sh puts this before the Kotlin scrub block it cuts from the
// plugin patch: a stand-in for posthog-android's com.posthog.PostHogEvent with the members the
// scrub reads (`event`, `properties`) and writes (`copy(properties = ..., set = null)`).
data class PostHogEvent(
  val event: String,
  val properties: Map<String, Any>? = null,
  val set: Map<String, Any>? = null,
)
