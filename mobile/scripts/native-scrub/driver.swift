// scripts/check-native-scrub.sh puts this after the Swift scrub block: it runs every case in the
// fixture through that block and prints what the scrub keeps, as JSON.
let opaxCasesPath = CommandLine.arguments[1]
let opaxCases = try! JSONSerialization.jsonObject(
    with: Data(contentsOf: URL(fileURLWithPath: opaxCasesPath))
) as! [String: Any]
let opaxMessagesOut: [Any] = (opaxCases["messages"] as! [Any]).map { opaxScrubMessage($0).map { $0 as Any } ?? NSNull() }
let opaxEventsOut: [Any] = (opaxCases["events"] as! [[String: Any]]).map { input in
    let event = PostHogEvent(event: input["event"] as! String, properties: input["properties"] as! [String: Any])
    return opaxScrubNativeEvent(event)?.properties ?? NSNull()
}
let opaxOutput: [String: Any] = [
    "rulesCompiled": opaxMessageRules.allSatisfy { $0.0 != nil },
    "messages": opaxMessagesOut,
    "events": opaxEventsOut,
]
FileHandle.standardOutput.write(
    try! JSONSerialization.data(withJSONObject: opaxOutput, options: [.sortedKeys, .withoutEscapingSlashes])
)
