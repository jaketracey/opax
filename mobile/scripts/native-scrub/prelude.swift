// scripts/check-native-scrub.sh puts this before the Swift scrub block it cuts from the plugin
// patch: Foundation, and a stand-in for posthog-ios' PostHogEvent with the two members the
// scrub reads and writes.
import Foundation

final class PostHogEvent {
    let event: String
    var properties: [String: Any]

    init(event: String, properties: [String: Any]) {
        self.event = event
        self.properties = properties
    }
}
