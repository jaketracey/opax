import Foundation

struct EvidenceModel: Sendable {
    private(set) var turns: [TranscriptTurn] = []
    private(set) var sources: [VoiceSource] = []
    private var serial = 0
    static func sourcePath(_ value: String) -> String? {
        guard value.utf16.count <= 1800,
              let url = URL(string: value, relativeTo: URL(string: "https://opax.com.au")!)?.absoluteURL,
              url.scheme == "https" || url.scheme == "http",
              url.host == "opax.com.au", url.port == nil || url.port == 443,
              url.user == nil, url.password == nil,
              // Match the web origin (HTTPS); HTTP links are cross-origin and refused.
              url.scheme == "https" else { return nil }
        let pattern = "^/(?:doc/[^/]+|bill/[^/]+|subject/(?:person|party|supplier|donor|recipient|topic|campaigner|agency)/[^/]+|money(?:/(?:contracts|grants|donations|receipts|expenses|interests))?|declared|search|connections|topics|parties|reports(?:/[^/]+)?|journey/[^/]+)/?$"
        let parts = URLComponents(url: url, resolvingAgainstBaseURL: false)!
        guard parts.percentEncodedPath.range(of: pattern, options: .regularExpression) != nil,
              url.absoluteString.range(of: "%[01][0-9a-f]|%7f", options: [.regularExpression, .caseInsensitive]) == nil else { return nil }
        return parts.percentEncodedPath + (parts.percentEncodedQuery.map { "?" + $0 } ?? "") + (parts.percentEncodedFragment.map { "#" + $0 } ?? "")
    }
    mutating func add(_ turn: TranscriptTurn, correction: Bool) {
        var turn = turn; turn.text = String(turn.text.prefix(12000))
        guard !turn.text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else { return }
        if turn.id == -1 {
            if correction, let prior = turns.last(where: { $0.role == .agent }) {
                turn = TranscriptTurn(role: turn.role, id: prior.id, text: turn.text)
            } else { serial += 1; turn = TranscriptTurn(role: turn.role, id: -serial - 1, text: turn.text) }
        }
        if let index = turns.firstIndex(where: { $0.role == turn.role && $0.id == turn.id }) { turns[index] = turn }
        else { turns.append(turn); if turns.count > 80 { turns.removeFirst() } }
        markdown(turn.text)
    }
    private mutating func addSource(title: String, url: String) {
        guard let path = Self.sourcePath(url), sources.count < 12, !sources.contains(where: { $0.path == path }) else { return }
        sources.append(VoiceSource(title: String(title.prefix(220)), path: path))
    }
    private mutating func markdown(_ text: String) {
        let pattern = try! NSRegularExpression(pattern: "\\[([^\\]\\n]{1,220})\\]\\(([^\\s)]+)\\)")
        let string = text as NSString
        for match in pattern.matches(in: text, range: NSRange(location: 0, length: string.length)) {
            addSource(title: string.substring(with: match.range(at: 1)), url: string.substring(with: match.range(at: 2)))
        }
    }
    mutating func collect(_ value: JSONValue, depth: Int = 0) {
        guard depth <= 5 else { return }
        switch value {
        case .string(let text):
            guard text.utf16.count <= 160000, let data = text.data(using: .utf8),
                  let json = try? JSONDecoder().decode(JSONValue.self, from: data) else { return }
            collect(json, depth: depth + 1)
        case .array(let items): for item in items.prefix(30) { collect(item, depth: depth + 1) }
        case .object:
            if let url = value["href"].string ?? value["destination"].string ?? value["url"].string {
                addSource(title: value["title"].string ?? value["label"].string ?? "Open the source record", url: url)
            }
            for key in ["sources", "records", "result", "response", "body", "content", "text", "full_tool_result"] {
                collect(value[key], depth: depth + 1)
            }
        default: break
        }
    }
}
