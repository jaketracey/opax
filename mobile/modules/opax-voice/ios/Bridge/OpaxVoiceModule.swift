import ExpoModulesCore
import OpaxVoiceCore

public final class OpaxVoiceModule: Module {
    private let controller = VoiceController()
    private var eventTask: Task<Void, Never>?
    deinit {
        eventTask?.cancel()
        let owner = controller
        Task { await owner.shutdown() }
    }
    public func definition() -> ModuleDefinition {
        Name("OpaxVoice")
        Events("onVoiceEvent")
        OnCreate { [weak self] in
            guard let self else { return }
            eventTask = Task { [weak self, controller] in
                let call = controller.call
                for await event in call.events {
                    guard !Task.isCancelled else { break }
                    self?.sendEvent("onVoiceEvent", VoiceBridgeValue.event(event))
                }
            }
        }
        OnDestroy { [weak self] in
            guard let self else { return }
            eventTask?.cancel(); eventTask = nil
            Task { [controller] in await controller.shutdown() }
        }
        AsyncFunction("snapshot") { await self.controller.snapshot() }
        AsyncFunction("status") { await self.controller.status() }
        AsyncFunction("requestCode") { (email: String) in await self.controller.requestCode(email) }
        AsyncFunction("consumeCode") { (challenge: String, code: String) in await self.controller.consumeCode(challenge, code) }
        AsyncFunction("consent") { await self.controller.consent() }
        AsyncFunction("setConsent") { (granted: Bool) in await self.controller.setConsent(granted) }
        AsyncFunction("start") { await self.controller.start() }
        AsyncFunction("mute") { (muted: Bool) in await self.controller.mute(muted) }
        AsyncFunction("end") { await self.controller.end() }
        AsyncFunction("logout") { await self.controller.logout() }
        AsyncFunction("requestDeletionCode") { await self.controller.requestDeletionCode() }
        AsyncFunction("deleteAccount") { (challenge: String, code: String) in await self.controller.deleteAccount(challenge, code) }
    }
}
