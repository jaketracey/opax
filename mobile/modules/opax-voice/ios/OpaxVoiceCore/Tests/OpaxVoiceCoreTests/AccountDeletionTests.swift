import Foundation
import XCTest
@testable import OpaxVoiceCore

private func deletionShapes() throws -> [String: [String: Any]] {
    let data = try Data(contentsOf: Bundle.module.url(forResource: "worker-deletion", withExtension: "json")!)
    return (try JSONSerialization.jsonObject(with: data) as! [String: Any])["shapes"] as! [String: [String: Any]]
}
private func deletionResponse(_ name: String) throws -> HTTPResponse {
    let shape = try deletionShapes()[name]!
    return HTTPResponse(status: shape["status"] as! Int, headers: shape["headers"] as! [String: String], body: json(shape["body"]!))
}
@MainActor final class AccountDeletionTests: SafeVoiceTestCase {
    func testWorkerSuccessBodiesHeadersAndMemoryKeychainDeletion() async throws {
        actor MemoryKeychain: CredentialStore {
            var value: SessionCredential?, deletions = 0
            func read() -> SessionCredential? { value }
            func write(_ credential: SessionCredential) { value = credential }
            func clear() { value = nil; deletions += 1 }
            func clear(ifMatching credential: SessionCredential) -> Bool {
                guard value == credential else { return false }; clear(); return true
            }
        }
        let store = MemoryKeychain(), transport = FixtureHTTP()
        try await store.write(SessionCredential(token: fixtureToken, expiresAt: .distantFuture))
        let client = VoiceHTTPClient(policy: .loopback(port: 8901), store: store, transport: transport)
        await transport.setResponse(.deletionCode, try deletionResponse("requestSuccess"))
        await transport.setResponse(.deleteAccount, try deletionResponse("deleteSuccess"))
        let challenge = try await client.requestDeletionCode(); XCTAssertTrue(challenge.sent); XCTAssertEqual(challenge.challengeID, String(repeating: "c", count: 43))
        let result = try await client.deleteAccount(challengeID: challenge.challengeID, code: "00001234")
        XCTAssertTrue(result.deleted); XCTAssertTrue(result.signedOut)
        let stored = await store.read(), deletions = await store.deletions; XCTAssertNil(stored); XCTAssertEqual(deletions, 1)
        let requests = await transport.requests; XCTAssertEqual(requests.count, 2)
        for request in requests {
            XCTAssertEqual(request.httpMethod, "POST"); XCTAssertEqual(request.value(forHTTPHeaderField: "Cookie"), "__Host-opax_session=\(fixtureToken)")
            XCTAssertEqual(request.value(forHTTPHeaderField: "Origin"), "https://opax.com.au"); XCTAssertFalse(request.httpShouldHandleCookies)
        }
        XCTAssertEqual(try JSONSerialization.jsonObject(with: requests[0].httpBody!) as? [String: String], [:])
        XCTAssertEqual(try JSONSerialization.jsonObject(with: requests[1].httpBody!) as? [String: String], ["challenge_id": challenge.challengeID, "code": "00001234"])
        XCTAssertTrue(try deletionResponse("deleteSuccess").header("Set-Cookie")!.contains("Max-Age=0"))
    }
    func testEveryWorkerVerificationFailureIsGenericAndKeepsCredential() async throws {
        for name in try deletionShapes().keys.sorted().filter({ $0.contains("400") }) {
            let rig = try await Rig.make(), issuing = name.hasPrefix("request")
            let response = try deletionResponse(name)
            await rig.http.setResponse(issuing ? .deletionCode : .deleteAccount, response)
            do {
                if issuing { _ = try await rig.client.requestDeletionCode() }
                else { _ = try await rig.client.deleteAccount(challengeID: String(repeating: "c", count: 43), code: "00001234") }
                XCTFail(name)
            } catch { XCTAssertEqual((error as? APIFailure)?.status, 400, name); XCTAssertEqual((error as? APIFailure)?.failure, .deletionVerificationFailed, name) }
            let credential = await rig.store.read(); XCTAssertNotNil(credential, name)
            XCTAssertEqual(try JSONSerialization.jsonObject(with: response.body) as? [String: String], ["error": "This deletion could not be completed. Request a new deletion code and try again."])
            await rig.close()
        }
    }
    func testMissingSessionAndWrongOriginClearOnlySentCredential() async throws {
        for name in ["request401", "delete401", "request403", "delete403"] {
            let rig = try await Rig.make(), issuing = name.hasPrefix("request")
            await rig.http.setResponse(issuing ? .deletionCode : .deleteAccount, try deletionResponse(name))
            do {
                if issuing { _ = try await rig.client.requestDeletionCode() }
                else { _ = try await rig.client.deleteAccount(challengeID: "fixture", code: "00001234") }; XCTFail()
            } catch { XCTAssertEqual((error as? APIFailure)?.failure, name.hasSuffix("401") ? .signedOut : .forbidden) }
            let credential = await rig.store.read(); XCTAssertNil(credential); await rig.close()
        }
    }
    func testEveryWorkerUnavailableResponseKeepsCredentialWithoutRetry() async throws {
        for name in try deletionShapes().keys.sorted().filter({ $0.contains("503") }) {
            let rig = try await Rig.make(), route: AuthRoute = name.hasPrefix("request") ? .deletionCode : .deleteAccount
            await rig.http.setResponse(route, try deletionResponse(name))
            do {
                if route == .deletionCode { _ = try await rig.client.requestDeletionCode() }
                else { _ = try await rig.client.deleteAccount(challengeID: "fixture", code: "00001234") }; XCTFail(name)
            } catch { XCTAssertEqual((error as? APIFailure)?.failure, .unavailable) }
            let credential = await rig.store.read(), count = await rig.http.count(route)
            XCTAssertNotNil(credential); XCTAssertEqual(count, 1); await rig.close()
        }
    }
    func testDisabledAndPausedWorkerStatusesPermitDeletion() async throws {
        for name in ["requestDisabled", "requestPaused"] {
            let rig = try await Rig.make()
            await rig.http.setResponse(.communityStatus, try deletionResponse(name + "Status"))
            let status = try await rig.client.communityStatus(); XCTAssertEqual(status.canDeleteAccount, true)
            if name == "requestDisabled" { XCTAssertNil(status.member) }
            let credential = await rig.store.read(); XCTAssertNotNil(credential)
            await rig.http.setResponse(.deletionCode, try deletionResponse(name))
            await rig.http.setResponse(.deleteAccount, try deletionResponse(name == "requestDisabled" ? "deleteDisabled" : "deletePaused"))
            let challenge = try await rig.client.requestDeletionCode()
            let result = try await rig.client.deleteAccount(challengeID: challenge.challengeID, code: "00001234")
            XCTAssertTrue(result.deleted); let after = await rig.store.read(); XCTAssertNil(after); await rig.close()
        }
    }
    func testNullMemberWithoutDeletionRightClearsCredential() async throws {
        for flag in [Optional<Bool>.none, false] {
            let rig = try await Rig.make(), response = try deletionResponse("request401Status")
            var body = try JSONSerialization.jsonObject(with: response.body) as! [String: Any]
            body.removeValue(forKey: "can_delete_account"); if let flag { body["can_delete_account"] = flag }
            await rig.http.setResponse(.communityStatus, HTTPResponse(status: 200, body: json(body)))
            _ = try await rig.client.communityStatus(); let credential = await rig.store.read(); XCTAssertNil(credential); await rig.close()
        }
    }
    func testSignedOutVoiceStatusKeepsDisabledMembersDeletionCookie() async throws {
        let rig = try await Rig.make()
        await rig.http.configure(status: signedStatus(signedIn: false))
        await rig.http.setResponse(.communityStatus, try deletionResponse("requestDisabledStatus"))
        await rig.http.setResponse(.deletionCode, try deletionResponse("requestDisabled"))
        let voice = try await rig.client.status(); XCTAssertFalse(voice.signedIn)
        XCTAssertEqual(voice.refusal, .signedOut) // retention never grants voice access
        // ...but the account stays held, so sign-out and deletion stay offered.
        XCTAssertTrue(voice.accountHeld); XCTAssertTrue(voice.bridgeValue.accountHeld)
        let challenge = try await rig.client.requestDeletionCode(); XCTAssertTrue(challenge.sent)
        let requests = await rig.http.requests
        XCTAssertEqual(requests.map { $0.url!.path }, [AuthRoute.voiceStatus.rawValue, AuthRoute.communityStatus.rawValue, AuthRoute.deletionCode.rawValue])
        for request in requests {
            XCTAssertEqual(request.value(forHTTPHeaderField: "Cookie"), "__Host-opax_session=\(fixtureToken)")
            XCTAssertEqual(request.value(forHTTPHeaderField: "Origin"), "https://opax.com.au")
        }
        let stored = await rig.store.read(); XCTAssertNotNil(stored); await rig.close()
    }
    func testSignedOutVoiceClearsOnlyAfterConfirmedAbsentMemberWithoutDeletion() async throws {
        for flag in [Optional<Bool>.none, false] {
            let rig = try await Rig.make()
            await rig.http.configure(status: signedStatus(signedIn: false))
            var body = try JSONSerialization.jsonObject(with: deletionResponse("request401Status").body) as! [String: Any]
            body.removeValue(forKey: "can_delete_account"); if let flag { body["can_delete_account"] = flag }
            await rig.http.setResponse(.communityStatus, HTTPResponse(status: 200, body: json(body)))
            let voice = try await rig.client.status(); XCTAssertFalse(voice.bridgeValue.accountHeld)
            let stored = await rig.store.read(); XCTAssertNil(stored)
            let reads = await rig.http.count(.communityStatus); XCTAssertEqual(reads, 1); await rig.close()
        }
    }
    func testAccountHeldFollowsTheSessionNotVoiceAccess() async throws {
        let rig = try await Rig.make()
        await rig.http.configure(status: signedStatus())
        let signedIn = try await rig.client.status()
        XCTAssertTrue(signedIn.signedIn); XCTAssertTrue(signedIn.bridgeValue.accountHeld)
        await rig.store.clear()
        await rig.http.configure(status: signedStatus(signedIn: false))
        let signedOut = try await rig.client.status()
        XCTAssertFalse(signedOut.bridgeValue.accountHeld)
        let reads = await rig.http.count(.communityStatus); XCTAssertEqual(reads, 0); await rig.close()
    }
    func testVoiceSignOutWithExistingMemberOrUnconfirmedCommunityKeepsCredential() async throws {
        let responses = [try deletionResponse("requestPausedStatus"),
            HTTPResponse(status: 200, body: json(["enabled": true, "member": ["id": "fixture"], "can_delete_account": false])),
            HTTPResponse(status: 200, body: Data("invalid".utf8)),
            HTTPResponse(status: 503, body: json(["error": "Synthetic unavailable"]))]
        for response in responses {
            let rig = try await Rig.make()
            await rig.http.configure(status: signedStatus(signedIn: false))
            await rig.http.setResponse(.communityStatus, response)
            let status = try await rig.client.status(); XCTAssertFalse(status.signedIn)
            XCTAssertTrue(status.accountHeld) // unconfirmed revocation keeps the controls
            let stored = await rig.store.read(); XCTAssertNotNil(stored); await rig.close()
        }
    }
    func testVoiceSignOutConfirmationNeverUsesOrClearsNewSignIn() async throws {
        for delayed in [AuthRoute.voiceStatus, .communityStatus] {
            for response in [try deletionResponse("request401Status"), try deletionResponse("request401"), try deletionResponse("request403")] {
                let rig = try await Rig.make()
                await rig.http.configure(status: signedStatus(signedIn: false))
                await rig.http.setResponse(.voiceStatus, HTTPResponse(status: 200, body: signedStatus(signedIn: false)))
                await rig.http.setResponse(.communityStatus, response); await rig.http.pauseResponse(delayed)
                let stale = Task { try await rig.client.status() }
                try await eventually { await rig.http.responseWaiter != nil }
                let newer = try SessionCredential(token: String(repeating: "n", count: 43), expiresAt: .distantFuture)
                await rig.store.write(newer); await rig.http.resumeResponse(); _ = try await stale.value
                let stored = await rig.store.read(); XCTAssertEqual(stored, newer)
                let confirmation = await rig.http.requests.first { $0.url!.path == AuthRoute.communityStatus.rawValue }
                XCTAssertEqual(confirmation?.value(forHTTPHeaderField: "Cookie"), "__Host-opax_session=\(fixtureToken)")
                await rig.http.setResponse(.deletionCode, try deletionResponse("requestSuccess"))
                _ = try await rig.client.requestDeletionCode()
                let last = await rig.http.requests.last
                XCTAssertEqual(last?.value(forHTTPHeaderField: "Cookie"), "__Host-opax_session=\(String(repeating: "n", count: 43))")
                await rig.close()
            }
        }
    }
    func testUnavailableCommunityTransportCannotRevokeOnVoiceSignOut() async throws {
        struct UnreachableCommunity: HTTPTransport {
            let inner: FixtureHTTP
            func send(_ request: URLRequest) async throws -> HTTPResponse {
                try LoopbackGuard.validate(request)
                if request.url?.path == AuthRoute.communityStatus.rawValue { throw URLError(.notConnectedToInternet) }
                return try await inner.send(request)
            }
        }
        let rig = try await Rig.make()
        await rig.http.configure(status: signedStatus(signedIn: false))
        let client = VoiceHTTPClient(policy: .loopback(port: 8901), store: rig.store, transport: UnreachableCommunity(inner: rig.http))
        let status = try await client.status(); XCTAssertFalse(status.signedIn)
        let credential = await rig.store.read(); XCTAssertNotNil(credential)
        await rig.http.setResponse(.deletionCode, try deletionResponse("requestDisabled"))
        _ = try await client.requestDeletionCode()
        let request = await rig.http.requests.last
        XCTAssertEqual(request?.value(forHTTPHeaderField: "Cookie"), "__Host-opax_session=\(fixtureToken)")
        await rig.close()
    }
    func testStaleDeletionSuccessAndFailuresPreserveNewSignIn() async throws {
        for name in ["deleteSuccess", "delete401", "delete403"] {
            let rig = try await Rig.make()
            await rig.http.setResponse(.deleteAccount, try deletionResponse(name)); await rig.http.pauseResponse(.deleteAccount)
            let stale = Task { _ = try? await rig.client.deleteAccount(challengeID: "fixture", code: "00001234") }
            try await eventually { await rig.http.responseWaiter != nil }
            let newer = try SessionCredential(token: String(repeating: "n", count: 43), expiresAt: .distantFuture)
            await rig.store.write(newer); await rig.http.resumeResponse(); await stale.value
            let stored = await rig.store.read(); XCTAssertEqual(stored, newer)
            _ = try await rig.client.communityStatus(); let request = await rig.http.requests.last
            XCTAssertEqual(request?.value(forHTTPHeaderField: "Cookie"), "__Host-opax_session=\(String(repeating: "n", count: 43))")
            await rig.close()
        }
    }
    func testControllerEndsLiveCallBeforeDeletionAndClearsEvidence() async throws {
        let rig = try await Rig.make(); try await rig.live()
        await rig.http.setResponse(.deleteAccount, try deletionResponse("deleteSuccess"))
        let result = try await rig.controller.deleteAccount(challengeID: "fixture", code: "00001234"); XCTAssertTrue(result.deleted)
        let requests = await rig.http.requests.map { $0.url!.path }
        XCTAssertLessThan(requests.firstIndex(of: AuthRoute.voiceFinish.rawValue)!, requests.firstIndex(of: AuthRoute.deleteAccount.rawValue)!)
        let stops = await rig.engine.stops; XCTAssertEqual(stops, 1)
        let status = await rig.controller.latestStatus; XCTAssertEqual(status?.signedIn, false)
        let credential = await rig.store.read(); XCTAssertNil(credential); await rig.close()
    }
    func testControllerDeletionErrorsAreCoreFailuresAndMethod405IsTyped() async throws {
        let rig = try await Rig.make()
        await rig.http.setResponse(.deletionCode, try deletionResponse("request405"))
        do { _ = try await rig.controller.requestDeletionCode(); XCTFail() } catch { XCTAssertEqual(error, .invalidResponse) }
        await rig.http.setResponse(.deleteAccount, try deletionResponse("delete400"))
        do { _ = try await rig.controller.deleteAccount(challengeID: "bad", code: "bad"); XCTFail() } catch { XCTAssertEqual(error, .deletionVerificationFailed) }
        XCTAssertEqual(AuthRoute.allCases.count, 10); await rig.close()
    }
}
