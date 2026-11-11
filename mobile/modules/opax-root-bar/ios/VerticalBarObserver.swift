import UIKit

// Like the foundation traits, the synchronous JS read never waits on UIKit.
@MainActor
final class VerticalBarObserver {
  // Read from the JavaScript thread through `snapshot()`, always under the lock.
  nonisolated(unsafe) private let lock = NSLock()
  nonisolated(unsafe) private var edge = "unspecified"
  private weak var window: UIWindow?
  private weak var preferredScene: UIWindowScene?
  private var registration: (any UITraitChangeRegistration)?
  private var notifications: [NSObjectProtocol] = []
  var emit: ((String) -> Void)?

  nonisolated init() {}

  nonisolated func snapshot() -> String {
    lock.lock()
    defer { lock.unlock() }
    return edge
  }

  func start() {
    guard notifications.isEmpty else { return }
    let names: [Notification.Name] = [
      UIWindow.didBecomeKeyNotification, UIWindow.didResignKeyNotification,
      UIWindow.didBecomeVisibleNotification, UIScene.didActivateNotification,
      UIScene.didDisconnectNotification, UIApplication.didBecomeActiveNotification
    ]
    notifications = names.map { name in
      NotificationCenter.default.addObserver(forName: name, object: nil, queue: .main) { [weak self] note in
        // Delivered on the main queue (queue: .main).
        MainActor.assumeIsolated {
          if let window = note.object as? UIWindow, window.isKeyWindow {
            self?.preferredScene = window.windowScene
          } else if let scene = note.object as? UIWindowScene,
                    scene.activationState == .foregroundActive {
            self?.preferredScene = scene
          }
          DispatchQueue.main.async { [weak self] in
            MainActor.assumeIsolated {
              guard let self, !self.notifications.isEmpty else { return }
              self.refresh()
            }
          }
        }
      }
    }
    refresh()
  }

  func stop() {
    notifications.forEach { NotificationCenter.default.removeObserver($0) }
    notifications.removeAll()
    detach()
    preferredScene = nil
    emit = nil
  }

  private func detach() {
    if let registration { window?.unregisterForTraitChanges(registration) }
    registration = nil
    window = nil
  }

  func refresh() {
    let scenes = UIApplication.shared.connectedScenes.compactMap { $0 as? UIWindowScene }
    let active = scenes.filter { $0.activationState == .foregroundActive }
    let key = (active.filter { $0 === preferredScene } + active)
      .flatMap { $0.windows }.first { $0.isKeyWindow }
    if key !== window {
      detach()
      window = key
#if OPAX_VERTICAL_BARS
      if #available(iOS 27.1, *) {
        registration = key?.registerForTraitChanges(UITraitCollection.systemTraitsAffectingVerticalBarEdge) {
          [weak self] (_: UIWindow, _: UITraitCollection) in self?.refresh()
        }
      }
#endif
    }
    var next = "unspecified"
#if OPAX_VERTICAL_BARS
    if #available(iOS 27.1, *) {
      switch key?.traitCollection.verticalBarEdge {
      case .leading: next = "leading"
      case .trailing: next = "trailing"
      default: break
      }
    }
#endif
    lock.lock()
    let changed = edge != next
    edge = next
    lock.unlock()
    if changed { emit?(next) }
  }
}
