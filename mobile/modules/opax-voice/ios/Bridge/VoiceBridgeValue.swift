import Foundation
import OpaxVoiceCore

// Explicit projection only: never serialize HTTP bodies, reservations or errors.
enum VoiceBridgeValue {
    static func snapshot(_ value: VoiceSnapshot) -> [String: Any] {
        return ["state": value.state.rawValue, "reason": value.reason?.rawValue as Any? ?? NSNull(),
                "mode": value.mode?.rawValue as Any? ?? NSNull(), "playback": value.playback.rawValue,
                "remaining": value.remaining,
                "transcript": event(.transcript(value.transcript))["turns"]!,
                "sources": event(.sources(value.sources))["sources"]!,
                "status": value.status.map { status($0) as Any } ?? NSNull()]
    }
    static func status(_ value: VoiceStatusSnapshot) -> [String: Any] {
        var open: Any = NSNull()
        if let session = value.activeSession {
            let state: String
            switch session.state {
            case .reserved: state = "reserved"
            case .connecting: state = "connecting"
            case .active: state = "active"
            case .unknown: state = "unknown"
            }
            open = ["state": state, "expiresAt": session.expiresAt.map { $0 as Any } ?? NSNull()]
        }
        return ["enabled": value.enabled, "signedIn": value.signedIn,
                "unlimited": value.unlimited.map { $0 as Any } ?? NSNull(),
                "totalSeconds": value.totalSeconds.map { $0 as Any } ?? NSNull(),
                "remainingSeconds": value.remainingSeconds, "activeSession": open,
                "budgetOpen": value.budgetOpen.map { $0 as Any } ?? NSNull()]
    }
    static func event(_ event: VoiceEvent) -> [String: Any] {
        switch event {
        case .state(let state, let reason):
            return ["type": "state", "state": state.rawValue, "reason": reason?.rawValue as Any? ?? NSNull()]
        case .mode(let mode): return ["type": "mode", "mode": mode.rawValue]
        case .playback(let playback): return ["type": "playback", "playback": playback.rawValue]
        case .remainingTime(let seconds): return ["type": "remainingTime", "seconds": seconds]
        case .error(let failure): return ["type": "error", "error": failure.rawValue]
        case .status(let value): return ["type": "status", "status": value.map { status($0) as Any } ?? NSNull()]
        case .transcript(let turns):
            return ["type": "transcript", "turns": turns.map { ["role": $0.role.rawValue, "id": $0.id, "text": $0.text] as [String: Any] }]
        case .sources(let sources):
            return ["type": "sources", "sources": sources.map { ["title": $0.title, "path": $0.path] }]
        }
    }
    static func success(_ value: Any = NSNull()) -> [String: Any] { ["ok": true, "value": value] }
    static func failure(_ error: any Error) -> [String: Any] {
        let failure = (error as? VoiceFailure) ?? (error as? APIFailure)?.failure
            ?? (error is DecodingError ? .invalidResponse : error is CancellationError ? .cancelled : .network)
        return ["ok": false, "error": failure.rawValue]
    }
}
