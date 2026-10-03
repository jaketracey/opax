import Foundation
import Security

/// Opaque outside this module: storage encoding and token access are internal.
public struct SessionCredential: Sendable, CustomStringConvertible, CustomDebugStringConvertible, CustomReflectable, Equatable {
    let token: String
    let expiresAt: Date
    public init(token: String, expiresAt: Date) throws {
        guard token.utf8.count == 43, token.range(of: "^[A-Za-z0-9_-]{43}$", options: .regularExpression) != nil else { throw VoiceFailure.invalidResponse }
        self.token = token; self.expiresAt = expiresAt
    }
    private struct Stored: Codable { let token: String; let expiresAt: Date }
    func storageData() throws -> Data { try JSONEncoder().encode(Stored(token: token, expiresAt: expiresAt)) }
    static func fromStorage(_ data: Data) throws -> Self {
        let stored = try JSONDecoder().decode(Stored.self, from: data)
        return try Self(token: stored.token, expiresAt: stored.expiresAt)
    }
    public var description: String { "SessionCredential([redacted])" }
    public var debugDescription: String { description }
    public var customMirror: Mirror { Mirror(self, children: EmptyCollection<Mirror.Child>(), displayStyle: .struct) }
}
public protocol CredentialStore: Sendable {
    func read() async throws -> SessionCredential?
    func write(_ credential: SessionCredential) async throws
    func clear() async throws
    /// Atomic within the store; stale requests must never delete a newer sign-in.
    @discardableResult func clear(ifMatching credential: SessionCredential) async throws -> Bool
}
public actor KeychainCredentialStore: CredentialStore {
    let service: String
    public nonisolated let origin: URL
    /// Different origins (including DEBUG loopback ports) have different items.
    public init(policy: RoutePolicy = RoutePolicy()) { origin = policy.origin; service = "au.com.opax.voice.session:" + policy.origin.absoluteString }
    private var query: [String: Any] {
        [kSecClass as String: kSecClassGenericPassword, kSecAttrService as String: service,
         kSecAttrAccount as String: "session", kSecAttrSynchronizable as String: false]
    }
    public func read() throws -> SessionCredential? {
        var q = query; q[kSecReturnData as String] = true; q[kSecMatchLimit as String] = kSecMatchLimitOne
        var result: CFTypeRef?
        let status = SecItemCopyMatching(q as CFDictionary, &result)
        if status == errSecItemNotFound { return nil }
        guard status == errSecSuccess, let data = result as? Data else { throw VoiceFailure.unavailable }
        return try SessionCredential.fromStorage(data)
    }
    public func write(_ credential: SessionCredential) throws {
        let attributes: [String: Any] = [kSecValueData as String: try credential.storageData(),
            kSecAttrAccessible as String: kSecAttrAccessibleWhenUnlockedThisDeviceOnly]
        let status = SecItemUpdate(query as CFDictionary, attributes as CFDictionary)
        if status == errSecItemNotFound {
            var q = query; attributes.forEach { q[$0.key] = $0.value }
            guard SecItemAdd(q as CFDictionary, nil) == errSecSuccess else { throw VoiceFailure.unavailable }
        } else if status != errSecSuccess { throw VoiceFailure.unavailable }
    }
    public func clear() throws {
        let result = SecItemDelete(query as CFDictionary)
        guard result == errSecSuccess || result == errSecItemNotFound else { throw VoiceFailure.unavailable }
    }
    public func clear(ifMatching credential: SessionCredential) throws -> Bool {
        // No suspension between comparison and deletion: same actor as write().
        guard try read() == credential else { return false }
        try clear(); return true
    }
}
public actor InMemoryCredentialStore: CredentialStore {
    private var credential: SessionCredential?
    public init() {}
    public func read() -> SessionCredential? { credential }
    public func write(_ credential: SessionCredential) { self.credential = credential }
    public func clear() { credential = nil }
    public func clear(ifMatching credential: SessionCredential) -> Bool {
        guard self.credential == credential else { return false }; self.credential = nil; return true
    }
}

struct SessionCookie {
    static func parse(_ header: String, now: Date) throws -> SessionCredential {
        let pieces = header.split(separator: ";").map { $0.trimmingCharacters(in: .whitespaces) }
        guard let first = pieces.first, first.hasPrefix("__Host-opax_session="),
              pieces.contains(where: { $0.lowercased() == "secure" }),
              pieces.contains(where: { $0.lowercased() == "httponly" }),
              pieces.contains(where: { $0.lowercased() == "path=/" }),
              !pieces.contains(where: { $0.lowercased().hasPrefix("domain=") }),
              let maxAge = pieces.first(where: { $0.lowercased().hasPrefix("max-age=") }),
              let seconds = TimeInterval(maxAge.dropFirst(8)), seconds > 0, seconds <= 30 * 86400 else { throw VoiceFailure.invalidResponse }
        return try SessionCredential(token: String(first.dropFirst("__Host-opax_session=".count)), expiresAt: now.addingTimeInterval(seconds))
    }
}
