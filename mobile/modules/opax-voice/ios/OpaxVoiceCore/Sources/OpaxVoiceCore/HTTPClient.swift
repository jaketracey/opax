import Foundation

public enum AuthRoute: String, CaseIterable, Sendable {
    case voiceStatus = "/api/voice/status", voiceStart = "/api/voice/start"
    case voiceConnect = "/api/voice/connect", voiceFinish = "/api/voice/finish"
    case communityStatus = "/api/community/status"
    case requestCode = "/api/community/auth/request", consumeCode = "/api/community/auth/consume-code"
    case logout = "/api/community/auth/logout"
    case deletionCode = "/api/community/account/deletion-code", deleteAccount = "/api/community/account/delete"
    public var method: String {
        switch self { case .voiceStatus, .voiceConnect, .communityStatus: "GET"; default: "POST" }
    }
}
public struct RoutePolicy: Sendable {
    public static func productionConfigurationMatches(_ info: [String: Any]) -> Bool {
        guard info["OPAXProductionVoiceEnabled"] as? Bool == true,
              info["OPAXVoiceConsentDefault"] as? Bool == false,
              let routes = info["OPAXVoiceAllowedRoutes"] as? [String] else { return false }
        let expected = AuthRoute.allCases.map { $0.method + " " + $0.rawValue }
        return routes.count == expected.count && Set(routes) == Set(expected)
    }
    public let origin: URL
    private let loopback: Bool
    public init() { origin = URL(string: "https://opax.com.au")!; loopback = false }
    #if DEBUG || OPAX_VOICE_E2E
    /// Test fixtures only. Restricts *all* transports to this one numeric loopback origin.
    public static func loopback(port: UInt16) -> RoutePolicy {
        RoutePolicy(origin: URL(string: "http://127.0.0.1:\(port)")!, loopback: true)
    }
    #endif
    private init(origin: URL, loopback: Bool) { self.origin = origin; self.loopback = loopback }
    func permits(_ url: URL, method: String, webSocket: Bool = false) -> Bool {
        if !webSocket, permitsChat(url, method: method) { return true }
        guard let components = URLComponents(url: url, resolvingAgainstBaseURL: false),
              components.user == nil, components.password == nil, components.fragment == nil,
              url.host == origin.host, url.port == origin.port,
              let route = AuthRoute(rawValue: components.percentEncodedPath), route.method == method,
              (route == .voiceConnect) == webSocket else { return false }
        if loopback { return url.host == "127.0.0.1" && url.scheme == (webSocket ? "ws" : "http") }
        return url.scheme == (webSocket ? "wss" : "https")
    }
    // Only saved-chat data uses this additional credential-bearing surface.
    // No arbitrary native URL or headers may arrive from JavaScript.
    func permitsChat(_ url: URL, method: String) -> Bool {
        guard let c = URLComponents(url: url, resolvingAgainstBaseURL: false),
              c.user == nil, c.password == nil, c.fragment == nil, c.query == nil,
              url.host == origin.host, url.port == origin.port,
              url.scheme == (loopback ? "http" : "https") else { return false }
        if c.percentEncodedPath == "/api/community/chats" { return method == "GET" }
        return ["GET", "PUT", "DELETE"].contains(method) &&
            c.percentEncodedPath.range(of: "^/api/community/chats/[A-Za-z0-9_-]{8,64}$", options: .regularExpression) != nil
    }
    func decorate(_ original: URLRequest, credential: SessionCredential?, webSocket: Bool = false) -> URLRequest {
        var request = original
        for key in ["Cookie", "Origin", "Sec-WebSocket-Protocol", "X-Opax-Session", "Authorization"] {
            request.setValue(nil, forHTTPHeaderField: key)
        }
        request.httpShouldHandleCookies = false
        guard let url = request.url, permits(url, method: request.httpMethod ?? "GET", webSocket: webSocket) else { return request }
        request.setValue("https://opax.com.au", forHTTPHeaderField: "Origin")
        if let credential { request.setValue("__Host-opax_session=\(credential.token)", forHTTPHeaderField: "Cookie") }
        if webSocket { request.setValue("convai", forHTTPHeaderField: "Sec-WebSocket-Protocol") }
        return request
    }
    func validateRelay(_ reservation: Reservation) throws {
        guard reservation.transport == "websocket", permits(reservation.signedURL, method: "GET", webSocket: true),
              UUID(uuidString: reservation.sessionID) != nil,
              let parts = URLComponents(url: reservation.signedURL, resolvingAgainstBaseURL: false),
              parts.queryItems?.filter({ $0.name == "session_id" }).count == 1,
              parts.queryItems?.first(where: { $0.name == "session_id" })?.value == reservation.sessionID else {
            throw VoiceFailure.invalidResponse
        }
    }
}
public struct HTTPResponse: Sendable {
    public let status: Int
    public let headers: [String: String]
    public let body: Data
    public init(status: Int, headers: [String: String] = [:], body: Data) {
        self.status = status; self.headers = headers; self.body = body
    }
    func header(_ name: String) -> String? { headers.first { $0.key.lowercased() == name.lowercased() }?.value }
}
public protocol HTTPTransport: Sendable { func send(_ request: URLRequest) async throws -> HTTPResponse }
public enum ChargeDisposition: String, Sendable { case released, retained, unknown }
public struct APIFailure: Error, Sendable, Equatable, CustomStringConvertible {
    public let status: Int
    public let failure: VoiceFailure
    public let charge: ChargeDisposition
    public var description: String { "APIFailure(status: \(status), failure: \(failure.rawValue), charge: \(charge.rawValue))" }
    static func decode(_ response: HTTPResponse, route: AuthRoute) -> APIFailure {
        struct Body: Decodable { let error: String?; let reason: String?; let released: Bool? }
        let body = try? JSONDecoder().decode(Body.self, from: response.body)
        let failure: VoiceFailure
        switch response.status {
        case 400 where route == .deletionCode || route == .deleteAccount: failure = .deletionVerificationFailed
        case 401: failure = .signedOut
        case 409: failure = .callOpen
        case 403:
            failure = .forbidden // Start is classified using a fresh status below.
        case 429:
            switch body?.reason { case "budget": failure = .budgetClosed; case "capacity": failure = .capacity
            default: failure = .rateLimited }
        case 503: failure = .unavailable
        default: failure = .invalidResponse
        }
        return APIFailure(status: response.status, failure: failure,
                          charge: body?.released.map { $0 ? .released : .retained } ?? .unknown)
    }
}
struct CredentialRequest: Sendable {
    let request: URLRequest
    let credential: SessionCredential?
}
/// No logging APIs: response content and signed URLs never become diagnostics.
public actor VoiceHTTPClient {
    let policy: RoutePolicy
    private let store: any CredentialStore
    private let transport: any HTTPTransport
    private let clock: any VoiceClock
    private var revokedCredentials: [SessionCredential] = []
    public init(policy: RoutePolicy = RoutePolicy(), store: any CredentialStore,
                transport: any HTTPTransport, clock: any VoiceClock = SystemVoiceClock()) {
        self.policy = policy; self.store = store; self.transport = transport; self.clock = clock
    }
    private func clearCredential(_ sent: SessionCredential?) async throws {
        guard let sent else { return }
        // Keep this one credential blocked even if Keychain deletion fails.
        if !revokedCredentials.contains(sent) { revokedCredentials.append(sent) }
        try await store.clear(ifMatching: sent)
    }
    private func credential() async throws -> SessionCredential? {
        if let keychain = store as? KeychainCredentialStore, keychain.origin != policy.origin { throw VoiceFailure.forbidden }
        guard let value = try await store.read() else { return nil }
        // A stale read/response must never remove a newer revocation block.
        guard !revokedCredentials.contains(value) else { return nil }
        guard value.expiresAt > (await clock.now()) else { try await clearCredential(value); return nil }
        return value
    }
    public func chatRequest(path: String, method: String, body: String?) async throws -> String {
        guard path.hasPrefix("/api/community/chats"),
              let url = URL(string: path, relativeTo: policy.origin)?.absoluteURL,
              policy.permitsChat(url, method: method),
              (method == "PUT") == (body != nil),
              (body?.utf8.count ?? 0) <= 600000 else { throw VoiceFailure.forbidden }
        guard let sent = try await credential() else { throw VoiceFailure.signedOut }
        var request = URLRequest(url: url)
        request.httpMethod = method; request.httpBody = body.map { Data($0.utf8) }; request.timeoutInterval = 15
        request.setValue("application/json", forHTTPHeaderField: "Accept")
        if body != nil { request.setValue("application/json", forHTTPHeaderField: "Content-Type") }
        let response = try await transport.send(policy.decorate(request, credential: sent))
        if response.status == 401 { try await clearCredential(sent); throw VoiceFailure.signedOut }
        guard (200..<300).contains(response.status), response.body.count <= 2 * 1024 * 1024,
              let text = String(data: response.body, encoding: .utf8) else { throw VoiceFailure.invalidResponse }
        return text
    }
    private func prepare(_ route: AuthRoute, body: Data? = nil) async throws -> CredentialRequest {
        let sent = try await credential()
        return preparedRequest(route, body: body, credential: sent)
    }
    private func preparedRequest(_ route: AuthRoute, body: Data? = nil, credential sent: SessionCredential?) -> CredentialRequest {
        var request = URLRequest(url: policy.origin.appendingPathComponent(String(route.rawValue.dropFirst())))
        request.httpMethod = route.method; request.httpBody = body; request.timeoutInterval = 15
        if body != nil { request.setValue("application/json", forHTTPHeaderField: "Content-Type") }
        return CredentialRequest(request: policy.decorate(request, credential: sent), credential: sent)
    }
    private func execute(_ prepared: CredentialRequest, route: AuthRoute) async throws -> HTTPResponse {
        #if DEBUG || OPAX_VOICE_E2E
        try VoiceTestSafety.validate(prepared.request)
        #endif
        let response = try await transport.send(prepared.request)
        guard (200..<300).contains(response.status) else {
            var failure = APIFailure.decode(response, route: route)
            if route == .voiceStart, response.status == 403 {
                // Server prose is never a discriminator. If status fails, keep
                // the credential: an unexplained 403 is not evidence of revocation.
                if let fresh = try? await status() {
                    let reason = fresh.refusal ?? .forbidden
                    failure = APIFailure(status: 403, failure: reason, charge: failure.charge)
                    if reason == .forbidden { try await clearCredential(prepared.credential) }
                }
            } else if failure.failure == .signedOut || failure.failure == .forbidden {
                try await clearCredential(prepared.credential)
            }
            throw failure
        }
        // Start must recover/finish a reservation before rejecting even an
        // oversized successful body. Other routes have no reservation to clean up.
        guard route == .voiceStart || response.body.count <= 2 * 1024 * 1024 else { throw VoiceFailure.invalidResponse }
        return response
    }
    private func perform(_ route: AuthRoute, body: Data? = nil) async throws -> (HTTPResponse, SessionCredential?) {
        guard route != .voiceConnect else { throw VoiceFailure.invalidResponse }
        let prepared = try await prepare(route, body: body)
        return (try await execute(prepared, route: route), prepared.credential)
    }
    func request(_ route: AuthRoute, body: Data? = nil) async throws -> HTTPResponse { try await perform(route, body: body).0 }
    public func status() async throws -> VoiceStatus {
        let (response, sent) = try await perform(.voiceStatus)
        var status = try JSONDecoder().decode(VoiceStatus.self, from: response.body)
        status.accountHeld = sent != nil
        if !status.signedIn, let sent, !revokedCredentials.contains(sent) {
            // Voice deliberately hides disabled members. Confirm actual sign-out
            // with community using this request's snapshot, never a newer sign-in.
            // An unavailable/malformed confirmation cannot establish revocation.
            let prepared = preparedRequest(.communityStatus, credential: sent)
            if let confirmation = try? await execute(prepared, route: .communityStatus),
               let community = try? JSONDecoder().decode(CommunityStatus.self, from: confirmation.body),
               community.member == nil, community.canDeleteAccount != true {
                try await clearCredential(sent); status.accountHeld = false
            }
        }
        return status
    }
    public func communityStatus() async throws -> CommunityStatus {
        let (response, sent) = try await perform(.communityStatus)
        let status = try JSONDecoder().decode(CommunityStatus.self, from: response.body)
        if status.member == nil && status.canDeleteAccount != true { try await clearCredential(sent) }
        return status
    }
    public func requestDeletionCode() async throws -> DeletionChallenge {
        let response = try await request(.deletionCode, body: Data("{}".utf8))
        let result = try JSONDecoder().decode(DeletionChallenge.self, from: response.body)
        guard result.sent, result.challengeID.utf8.count == 43,
              result.challengeID.range(of: "^[A-Za-z0-9_-]{43}$", options: .regularExpression) != nil else { throw VoiceFailure.invalidResponse }
        return result
    }
    public func deleteAccount(challengeID: String, code: String) async throws -> AccountDeletion {
        struct Body: Encodable { let challenge_id: String; let code: String }
        // Let the Worker apply its generic proof/admission failure to every shape.
        let (response, sent) = try await perform(.deleteAccount, body: JSONEncoder().encode(Body(challenge_id: challengeID, code: code)))
        let result = try JSONDecoder().decode(AccountDeletion.self, from: response.body)
        guard result.deleted, result.signedOut else { throw VoiceFailure.invalidResponse }
        try await clearCredential(sent)
        return result
    }
    public func requestCode(email: String) async throws -> CodeChallenge {
        struct Body: Encodable { let email: String; let client = "ios" }
        return try JSONDecoder().decode(CodeChallenge.self, from: await request(.requestCode, body: JSONEncoder().encode(Body(email: email))).body)
    }
    public func consumeCode(challengeID: String, code: String) async throws {
        guard code.range(of: "^[0-9]{8}$", options: .regularExpression) != nil else { throw VoiceFailure.invalidResponse }
        struct Body: Encodable { let challenge_id: String; let code: String }
        let (response, sent) = try await perform(.consumeCode, body: JSONEncoder().encode(Body(challenge_id: challengeID, code: code)))
        struct Result: Decodable { let signed_in: Bool }
        guard try JSONDecoder().decode(Result.self, from: response.body).signed_in else {
            try await clearCredential(sent); throw VoiceFailure.signedOut
        }
        guard let header = response.header("Set-Cookie") else { throw VoiceFailure.invalidResponse }
        try await store.write(SessionCookie.parse(header, now: await clock.now()))
    }
    public func logout(everywhere: Bool = false) async throws {
        struct Body: Encodable { let everywhere: Bool }
        let prepared = try await prepare(.logout, body: JSONEncoder().encode(Body(everywhere: everywhere)))
        do { _ = try await execute(prepared, route: .logout) }
        catch { try await clearCredential(prepared.credential); throw error }
        try await clearCredential(prepared.credential)
    }
    func start() async throws -> Reservation {
        let response = try await request(.voiceStart, body: Data("{}".utf8))
        // Recover the ID independently, even when the rest of the 201 is malformed.
        struct Identity: Decodable { let session_id: String }
        let id = (try? JSONDecoder().decode(Identity.self, from: response.body))?.session_id
        do {
            guard response.status == 201, response.body.count <= 2 * 1024 * 1024 else { throw VoiceFailure.invalidResponse }
            let reservation = try JSONDecoder().decode(Reservation.self, from: response.body)
            try policy.validateRelay(reservation)
            guard reservation.remainingSeconds > 0, reservation.remainingSeconds <= 600,
                  reservation.expiresAt.isFinite else { throw VoiceFailure.invalidResponse }
            // expires_at is a server deadline; a fast device clock cannot veto it.
            return reservation
        } catch {
            if let id, UUID(uuidString: id) != nil {
                await Task { [self] in try? await finish(sessionID: id) }.value
            }
            throw VoiceFailure.invalidResponse
        }
    }
    func finish(sessionID: String) async throws {
        struct Body: Encodable { let session_id: String }
        _ = try await request(.voiceFinish, body: JSONEncoder().encode(Body(session_id: sessionID)))
        // finish's allowance is never published; callers must GET status freshly.
    }
    func observeRelayFailure(_ failure: APIFailure, credential: SessionCredential?) async throws {
        if failure.status == 401 || failure.failure == .forbidden { try await clearCredential(credential) }
    }
    func relayRequest(_ reservation: Reservation) async throws -> CredentialRequest {
        try policy.validateRelay(reservation)
        guard let sent = try await credential() else { throw VoiceFailure.signedOut }
        let request = policy.decorate(URLRequest(url: reservation.signedURL), credential: sent, webSocket: true)
        #if DEBUG || OPAX_VOICE_E2E
        try VoiceTestSafety.validate(request)
        #endif
        return CredentialRequest(request: request, credential: sent)
    }
}
/// Delegate callbacks and registration can run on different executors. Every
/// access to the private continuation map is protected by the same lock.
final class SocketCloseSignal: @unchecked Sendable {
    private let lock = NSLock()
    private var close: RelayClose?
    private var waiters: [UUID: AsyncStream<RelayClose>.Continuation] = [:]
    #if DEBUG
    var waiterCount: Int { lock.withLock { waiters.count } }
    #endif
    func value() async -> RelayClose? {
        let id = UUID(), stream = AsyncStream<RelayClose>.makeStream(bufferingPolicy: .bufferingNewest(1))
        stream.continuation.onTermination = { [weak self] _ in self?.remove(id) }
        let resolved = lock.withLock { () -> RelayClose? in
            if let close { return close }
            waiters[id] = stream.continuation; return nil
        }
        if let resolved { stream.continuation.yield(resolved); stream.continuation.finish() }
        var iterator = stream.stream.makeAsyncIterator(); return await iterator.next()
    }
    private func remove(_ id: UUID) { _ = lock.withLock { waiters.removeValue(forKey: id) } }
    func resolve(_ value: RelayClose) {
        let continuations = lock.withLock {
            guard close == nil else { return [AsyncStream<RelayClose>.Continuation]() }
            close = value; let current = Array(waiters.values); waiters.removeAll(); return current
        }
        for continuation in continuations { continuation.yield(value); continuation.finish() }
    }
}
final class SocketCloseSignals: @unchecked Sendable {
    private let lock = NSLock()
    private var pending: [Int: SocketCloseSignal] = [:]
    func register(_ task: URLSessionWebSocketTask) -> SocketCloseSignal {
        let signal = SocketCloseSignal()
        lock.withLock { pending[task.taskIdentifier] = signal }; return signal
    }
    func complete(_ task: URLSessionWebSocketTask, close: RelayClose) {
        let signal = lock.withLock { pending.removeValue(forKey: task.taskIdentifier) }
        signal?.resolve(close)
    }
}
/// Refuses redirects on both HTTP and WebSocket handshakes, including same-origin redirects.
final class NoRedirectDelegate: NSObject, URLSessionWebSocketDelegate, Sendable {
    let socketCloses = SocketCloseSignals()
    func urlSession(_ session: URLSession, task: URLSessionTask,
                    willPerformHTTPRedirection response: HTTPURLResponse, newRequest request: URLRequest,
                    completionHandler: @escaping @Sendable (URLRequest?) -> Void) { completionHandler(nil) }
    func urlSession(_ session: URLSession, webSocketTask: URLSessionWebSocketTask,
                    didCloseWith closeCode: URLSessionWebSocketTask.CloseCode, reason: Data?) {
        socketCloses.complete(webSocketTask, close: RelayClose(code: closeCode.rawValue,
            reason: reason.flatMap { String(data: $0, encoding: .utf8) } ?? ""))
    }
    func urlSession(_ session: URLSession, task: URLSessionTask, didCompleteWithError error: (any Error)?) {
        guard let socket = task as? URLSessionWebSocketTask else { return }
        // Task completion is the final delegate callback. A received close frame
        // has already resolved the stream; otherwise classify an abnormal drop.
        socketCloses.complete(socket, close: RelayClose(code: socket.closeCode == .invalid ? 1006 : socket.closeCode.rawValue,
            reason: socket.closeReason.flatMap { String(data: $0, encoding: .utf8) } ?? ""))
    }
}
public final class AuthenticatedURLSession: HTTPTransport, Sendable {
    let session: URLSession
    private let delegate: NoRedirectDelegate
    private let policy: RoutePolicy
    public init(policy: RoutePolicy = RoutePolicy()) {
        self.policy = policy
        let delegate = NoRedirectDelegate(); self.delegate = delegate
        let queue = OperationQueue(); queue.maxConcurrentOperationCount = 1
        session = URLSession(configuration: Self.configuration(), delegate: delegate, delegateQueue: queue)
    }
    func socketTermination(_ task: URLSessionWebSocketTask) -> SocketCloseSignal { delegate.socketCloses.register(task) }
    static func configuration() -> URLSessionConfiguration {
        let config = URLSessionConfiguration.ephemeral
        config.httpShouldSetCookies = false; config.httpCookieStorage = nil; config.httpCookieAcceptPolicy = .never
        config.urlCache = nil; config.requestCachePolicy = .reloadIgnoringLocalCacheData
        return config
    }
    public func send(_ request: URLRequest) async throws -> HTTPResponse {
        #if DEBUG || OPAX_VOICE_E2E
        try VoiceTestSafety.validate(request)
        #endif
        guard let url = request.url, policy.permits(url, method: request.httpMethod ?? "GET") else { throw VoiceFailure.forbidden }
        let (body, raw) = try await session.data(for: request)
        guard let response = raw as? HTTPURLResponse else { throw VoiceFailure.invalidResponse }
        return HTTPResponse(status: response.statusCode,
                            headers: response.allHeaderFields.reduce(into: [:]) { $0[String(describing: $1.key)] = String(describing: $1.value) }, body: body)
    }
    deinit { session.invalidateAndCancel() }
}
