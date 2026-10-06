import XCTest
@testable import OpaxVoiceCore

@MainActor final class ProductionVoiceTests: SafeVoiceTestCase {
    func testStoredWithdrawalBlocksTheNextCallBeforePermissionOrReservation() async throws {
        let suite = "opax-withdrawal-test-" + UUID().uuidString
        defer { UserDefaults(suiteName: suite)?.removePersistentDomain(forName: suite) }
        let consent = StoredVoiceConsent(suiteName: suite)
        await consent.setGranted(true)
        let rig = try await Rig.make(storedConsent: consent)
        try await rig.live()
        await consent.setGranted(false)
        await rig.controller.withdrawConsent()
        try await eventually { await rig.controller.state == .ended }
        await rig.controller.start()
        try await eventually { await rig.recorder.hasError(.consentRequired) }
        let permissions = await rig.permission.count, reservations = await rig.http.count(.voiceStart)
        XCTAssertEqual(permissions, 1); XCTAssertEqual(reservations, 1)
        await rig.close()
    }
    func testBuildPolicyMatchesEvaluatedNativeRouteMethodsAndPaths() throws {
        let policy = URL(fileURLWithPath: #filePath).deletingLastPathComponent()
            .appendingPathComponent("../../../../../../voice-production-policy.json").standardized
        let json = try JSONSerialization.jsonObject(with: Data(contentsOf: policy)) as! [String: Any]
        let routes = try XCTUnwrap(json["routes"] as? [String])
        XCTAssertEqual(routes.sorted(), AuthRoute.allCases.map { $0.method + " " + $0.rawValue }.sorted())
    }
    func testFreshConsentIsDeniedUntilExplicitGrantAndWithdrawalPersists() async {
        let suite = "opax-consent-test-" + UUID().uuidString
        defer { UserDefaults(suiteName: suite)?.removePersistentDomain(forName: suite) }
        let consent = StoredVoiceConsent(suiteName: suite)
        let fresh = await consent.isGranted(); XCTAssertFalse(fresh)
        await consent.setGranted(true)
        let reloaded = StoredVoiceConsent(suiteName: suite)
        let granted = await reloaded.isGranted(); XCTAssertTrue(granted)
        await reloaded.setGranted(false)
        let denied = await consent.isGranted(); XCTAssertFalse(denied)
        UserDefaults(suiteName: suite)?.set("true", forKey: StoredVoiceConsent.key)
        let malformed = await consent.isGranted(); XCTAssertFalse(malformed)
    }
    func testProductionConfigurationRequiresExactRoutesAndDeniedDefault() {
        let routes = AuthRoute.allCases.map { $0.method + " " + $0.rawValue }
        let valid: [String: Any] = ["OPAXProductionVoiceEnabled": true,
            "OPAXVoiceConsentDefault": false, "OPAXVoiceAllowedRoutes": routes]
        XCTAssertTrue(RoutePolicy.productionConfigurationMatches(valid))
        XCTAssertFalse(RoutePolicy.productionConfigurationMatches([:]))
        for key in valid.keys {
            var changed = valid; changed.removeValue(forKey: key)
            XCTAssertFalse(RoutePolicy.productionConfigurationMatches(changed))
        }
        for bad in [routes + ["POST /api/ask"], Array(routes.dropLast()), routes + [routes[0]],
                    routes.map { $0.replacingOccurrences(of: "POST", with: "GET") }] {
            var changed = valid; changed["OPAXVoiceAllowedRoutes"] = bad
            XCTAssertFalse(RoutePolicy.productionConfigurationMatches(changed))
        }
        var automaticConsent = valid; automaticConsent["OPAXVoiceConsentDefault"] = true
        XCTAssertFalse(RoutePolicy.productionConfigurationMatches(automaticConsent))
    }
}
