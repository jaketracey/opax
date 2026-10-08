import Foundation
import XCTest
@testable import OpaxVoiceCore
private actor CommunityTransport: HTTPTransport {
    var requests: [URLRequest] = []
    var status = 200
    func send(_ request: URLRequest) async throws -> HTTPResponse {
        try LoopbackGuard.validate(request); requests.append(request)
        return HTTPResponse(status: status, body: Data("{\"threads\":[]}".utf8))
    }
    func setStatus(_ value: Int) { status = value }
}
@MainActor final class CommunityTests: SafeVoiceTestCase {
    func testOnlyExactMethodsAndParametersCarryCredentials() {
        let p = RoutePolicy.loopback(port: 8953)
        for (path,method) in [("threads?feed=all&q=source&page=0","GET"),("threads/fixture-a","POST"),("members/fixture-a/report","POST"),("conversations/fixture-a?before=4","GET"),("preferences","PATCH"),("lists/fixture-a/items","POST"),("items/fixture-a","DELETE")] {
            let url = URL(string:"http://127.0.0.1:8953/api/community/"+path)!
            XCTAssertTrue(p.permitsCommunity(url,method:method))
        }
        for path in ["keys","reports","threads?feed=other","threads?token=secret","threads?feed=all&feed=saved","threads/%61","conversations/x?before=NaN","members?following=1","preferences?x=1"] {
            XCTAssertFalse(p.permitsCommunity(URL(string:"http://127.0.0.1:8953/api/community/"+path)!,method:"GET"))
        }
        XCTAssertFalse(p.permitsCommunity(URL(string:"https://opax.com.au/api/community/threads")!,method:"GET"))
    }
    func testPublicReadAndSignedInMutationEachMakeOneRequestNoLaunchRead() async throws {
        let store=InMemoryCredentialStore(), transport=CommunityTransport()
        let client=VoiceHTTPClient(policy:.loopback(port:8953),store:store,transport:transport)
        let initial=await transport.requests; XCTAssertTrue(initial.isEmpty)
        _ = try await client.communityRequest(path:"/api/community/threads?feed=all",method:"GET",body:nil)
        let publicReads=await transport.requests;XCTAssertEqual(publicReads.count,1);XCTAssertNil(publicReads[0].value(forHTTPHeaderField:"Cookie"))
        do {_ = try await client.communityRequest(path:"/api/community/reports",method:"POST",body:"{}");XCTFail()}catch{XCTAssertEqual(error as? VoiceFailure,.signedOut)}
        try await store.write(SessionCredential(token:fixtureToken,expiresAt:.distantFuture))
        _ = try await client.communityRequest(path:"/api/community/reports",method:"POST",body:"{\"target\":\"fixture\",\"reason\":\"Concern\"}")
        let all=await transport.requests;XCTAssertEqual(all.count,2);XCTAssertEqual(all[1].value(forHTTPHeaderField:"Cookie"),"__Host-opax_session="+fixtureToken);XCTAssertFalse(all[1].httpShouldHandleCookies)
        await transport.setStatus(401)
        _ = try await client.communityRequest(path:"/api/community/lists",method:"GET",body:nil)
        let held=try await store.read();XCTAssertNil(held)
    }
}
