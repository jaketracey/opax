import Foundation

extension RoutePolicy {
    // Mirrors the reviewed web methods; no moderator, auth, MCP or arbitrary URL.
    func permitsCommunity(_ url: URL, method: String) -> Bool {
        guard let c = URLComponents(url: url, resolvingAgainstBaseURL: false),
              c.user == nil, c.password == nil, c.fragment == nil,
              url.host == origin.host, url.port == origin.port,
              url.scheme == origin.scheme, c.percentEncodedPath.hasPrefix("/api/community/") else { return false }
        let name = String(c.percentEncodedPath.dropFirst(15)), ident = "[A-Za-z0-9_-]{1,64}"
        func match(_ pattern: String) -> Bool { name.range(of: "^(?:" + pattern + ")$", options: .regularExpression) != nil }
        let items = c.queryItems ?? []
        guard Set(items.map(\.name)).count == items.count else { return false }
        if method != "GET" && c.percentEncodedQuery != nil { return false }
        if method == "GET" {
            let keys: Set<String>
            switch name {
            case "threads": keys = ["feed", "q", "page"]
            case "members": keys = ["q", "following", "page"]
            case "conversations": keys = ["page"]
            case "notifications": keys = ["before"]
            case "status", "preferences", "blocks", "lists": keys = []
            default:
                if match("threads/" + ident) { keys = ["reply"] }
                else if match("conversations/" + ident) { keys = ["before", "after"] }
                else if match("(?:members|lists)/" + ident) { keys = [] }
                else { return false }
            }
            for item in items {
                guard keys.contains(item.name), let v = item.value else { return false }
                switch item.name {
                case "feed": if !["all","following","saved"].contains(v) { return false }
                case "following": if !["true","false"].contains(v) { return false }
                case "q": if v.count > 120 { return false }
                case "page": if v.range(of: "^[0-9]{1,3}$", options: .regularExpression) == nil || (Int(v) ?? 501) > 500 { return false }
                case "before", "after": if v.range(of: "^[1-9][0-9]{0,15}$", options: .regularExpression) == nil || (UInt64(v) ?? UInt64.max) > 9007199254740991 { return false }
                case "reply": if v.range(of: "^" + ident + "$", options: .regularExpression) == nil { return false }
                default: break
                }
            }
            return true
        }
        switch method {
        case "POST": return ["threads","reports","conversations","notifications/read","lists"].contains(name) || match("threads/\(ident)|conversations/\(ident)/(?:read|messages)|messages/\(ident)/report|members/\(ident)/report|lists/\(ident)/items")
        case "PATCH": return ["profile","preferences"].contains(name) || match("lists/" + ident)
        case "PUT": return match("members/\(ident)/(?:follow|block)|threads/\(ident)/(?:like|save)")
        case "DELETE": return match("members/\(ident)/(?:follow|block)|threads/\(ident)/(?:like|save)|(?:threads|replies|lists|items)/\(ident)")
        default: return false
        }
    }
}
public struct CommunityResponse: Sendable {
    public let status: Int
    public let body: String
}
