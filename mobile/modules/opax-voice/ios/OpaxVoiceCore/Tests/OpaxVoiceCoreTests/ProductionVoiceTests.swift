import XCTest
@testable import OpaxVoiceCore

@MainActor final class ProductionVoiceTests: SafeVoiceTestCase {
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
