import ExpoModulesCore
import UIKit

private func onMain(_ body: @escaping @MainActor () -> Void) {
  if Thread.isMainThread {
    MainActor.assumeIsolated { body() }
  } else {
    DispatchQueue.main.async { MainActor.assumeIsolated { body() } }
  }
}

/// The last published traits, readable from the JavaScript thread. The sync
/// getter never waits on the main thread (it may itself be waiting on
/// JavaScript during a synchronous layout), so it returns this snapshot and
/// schedules a refresh; the event carries any change.
private final class TraitsCache {
  static let shared = TraitsCache()
  private let lock = NSLock()
  private var value: [String: Any] = ["horizontal": "compact", "vertical": "compact", "foldable": false, "verticalBars": false]
  func get() -> [String: Any] { lock.lock(); defer { lock.unlock() }; return value }
  func set(_ next: [String: Any]) { lock.lock(); value = next; lock.unlock() }
}

private struct WindowTraits: Equatable {
  var horizontal = "compact"
  var vertical = "compact"
  var foldable = false
  var verticalBars = false

  var payload: [String: Any] {
    ["horizontal": horizontal, "vertical": vertical, "foldable": foldable, "verticalBars": verticalBars]
  }
}

// The SDK condition prevents older compilers from resolving 27.1 symbols.
// The runtime check also keeps apps built with 27.1 working on older iOS.
#if OPAX_RESERVED_REGIONS
@available(iOS 27.1, *)
private struct Region: Equatable {
  let frame: CGRect
  let active: Bool

  init(_ region: UIView.ReservedRegion) {
    // UIKit's frame is already in local points and includes its margins.
    frame = region.frame
    active = region.isActive
  }

  static func read(_ view: UIView, kind: UIView.ReservedRegion.Kind) -> [Region] {
    view.reservedRegions(kind: kind, options: .includeInactive).map(Region.init).sorted { a, b in
      let left: [CGFloat] = [a.frame.minX, a.frame.minY, a.frame.width, a.frame.height, a.active ? 1 : 0]
      let right: [CGFloat] = [b.frame.minX, b.frame.minY, b.frame.width, b.frame.height, b.active ? 1 : 0]
      return left.lexicographicallyPrecedes(right)
    }
  }

  var payload: [String: Any] {
    ["x": frame.minX, "y": frame.minY, "width": frame.width,
     "height": frame.height, "active": active]
  }
}

/// A transparent, non-interactive root-sized view tracks the same regions
/// as the root. Reading in updateConstraints opts into UIKit invalidation.
@available(iOS 27.1, *)
private final class RootRegionObserver: UIView {
  var onChange: (@MainActor (Bool) -> Void)?

  override func updateConstraints() {
    let foldable = !reservedRegions(kind: .division, options: .includeInactive).isEmpty
    onChange?(foldable)
    super.updateConstraints()
  }

  override func layoutSubviews() {
    super.layoutSubviews()
    setNeedsUpdateConstraints()
  }
}
#endif

@MainActor
private final class WindowTraitsObserver {
  private weak var window: UIWindow?
  private weak var preferredScene: UIWindowScene?
  private var observing = false
  private var registration: (any UITraitChangeRegistration)?
  private var barRegistration: (any UITraitChangeRegistration)?
  private var notifications: [NSObjectProtocol] = []
  private var last: WindowTraits?
  private var foldable = false
  var emit: (([String: Any]) -> Void)?
#if OPAX_RESERVED_REGIONS
  private var rootObserver: UIView?
#endif

  nonisolated init() {}

  func start() {
    guard !observing else { return }
    observing = true
    let names: [Notification.Name] = [
      UIWindow.didBecomeKeyNotification, UIWindow.didResignKeyNotification,
      UIWindow.didBecomeVisibleNotification,
      UIScene.didActivateNotification, UIScene.willDeactivateNotification,
      UIScene.didDisconnectNotification, UIApplication.didBecomeActiveNotification
    ]
    notifications = names.map { name in
      NotificationCenter.default.addObserver(forName: name, object: nil, queue: .main) { [weak self] notification in
        // Delivered on the main queue (queue: .main).
        MainActor.assumeIsolated {
          if name == UIWindow.didBecomeKeyNotification,
             let window = notification.object as? UIWindow {
            self?.preferredScene = window.windowScene
          } else if name == UIScene.didActivateNotification,
                    let scene = notification.object as? UIWindowScene {
            self?.preferredScene = scene
          }
          // Key-window changes can arrive while UIKit is transferring focus.
          DispatchQueue.main.async { [weak self] in
            MainActor.assumeIsolated {
              guard let self, self.observing else { return }
              _ = self.refresh()
            }
          }
        }
      }
    }
    _ = refresh()
  }

  func stop() {
    observing = false
    preferredScene = nil
    notifications.forEach { NotificationCenter.default.removeObserver($0) }
    notifications.removeAll()
    detach()
    last = nil
    emit = nil
  }

  private func detach() {
    if let registration { window?.unregisterForTraitChanges(registration) }
    registration = nil
    if let barRegistration { window?.unregisterForTraitChanges(barRegistration) }
    barRegistration = nil
#if OPAX_RESERVED_REGIONS
    rootObserver?.removeFromSuperview()
    rootObserver = nil
#endif
    window = nil
    foldable = false
  }

  @discardableResult
  func refresh() -> [String: Any] {
    let scenes = UIApplication.shared.connectedScenes.compactMap { $0 as? UIWindowScene }
    let active = scenes.filter { $0.activationState == .foregroundActive }
    // Each scene may have a key window. Prefer the scene UIKit most recently
    // activated or made key, rather than relying on connectedScenes set order.
    let preferred = active.filter { $0 === preferredScene }
    let key = (preferred + active + scenes.filter { $0.activationState != .foregroundActive })
      .flatMap { $0.windows }.first { $0.isKeyWindow }
    if key !== window {
      detach()
      window = key
      registration = key?.registerForTraitChanges([
        UITraitHorizontalSizeClass.self, UITraitVerticalSizeClass.self
      ]) { [weak self] (_: UIWindow, _: UITraitCollection) in
        _ = self?.refresh()
      }
#if OPAX_RESERVED_REGIONS
      if #available(iOS 27.1, *) {
        barRegistration = key?.registerForTraitChanges(
          UITraitCollection.systemTraitsAffectingVerticalBarEdge
        ) { [weak self] (_: UIWindow, _: UITraitCollection) in
          _ = self?.refresh()
        }
      }
#endif
    }
#if OPAX_RESERVED_REGIONS
    // The observer sits on the window itself, behind the root view: React
    // Native mounts its own children into the root view by index, so an
    // extra subview there would shift them.
    if #available(iOS 27.1, *), let root = key {
      foldable = !root.reservedRegions(kind: .division, options: .includeInactive).isEmpty
      if rootObserver?.superview !== root {
        rootObserver?.removeFromSuperview()
        let observer = RootRegionObserver(frame: root.bounds)
        observer.autoresizingMask = [.flexibleWidth, .flexibleHeight]
        observer.isUserInteractionEnabled = false
        observer.accessibilityElementsHidden = true
        observer.onChange = { [weak self] value in
          guard let self else { return }
          self.foldable = value
          _ = self.publish()
        }
        root.insertSubview(observer, at: 0)
        rootObserver = observer
        observer.setNeedsUpdateConstraints()
      }
    }
#endif
    return publish()
  }

  private func publish() -> [String: Any] {
    // Vertical bars (iPhone Duo's outer display, or its inner display in
    // landscape) mark an adaptive phone too: the closed Duo's outer display
    // has no fold region, so `foldable` alone is false there at launch.
    var verticalBars = false
#if OPAX_RESERVED_REGIONS
    if #available(iOS 27.1, *), let window {
      verticalBars = window.traitCollection.verticalBarEdge != .unspecified
    }
#endif
    let traits = WindowTraits(
      horizontal: window?.traitCollection.horizontalSizeClass == .regular ? "regular" : "compact",
      vertical: window?.traitCollection.verticalSizeClass == .regular ? "regular" : "compact",
      foldable: foldable,
      verticalBars: verticalBars
    )
    if traits != last {
      last = traits
      TraitsCache.shared.set(traits.payload)
      emit?(traits.payload)
    }
    return traits.payload
  }
}

#if OPAX_DUO_E2E
/// E2E builds only: `-OPAXWindowTraits regular` (Maestro `arguments:`) sets
/// every window scene's size classes, standing in on an iPhone simulator for
/// the unfolded iPhone Duo (regular/regular), which Xcode cannot show.
/// `regular-compact` is a regular width with a compact height.
@MainActor
private func overrideWindowTraitsForE2E() {
  guard let value = UserDefaults.standard.string(forKey: "OPAXWindowTraits") else { return }
  let words = value.split(separator: "-").map(String.init)
  let classes: [String: UIUserInterfaceSizeClass] = ["regular": .regular, "compact": .compact]
  guard let horizontal = words.first.flatMap({ classes[$0] }),
    let vertical = classes[words.count > 1 ? words[1] : words[0]] else { return }
  for case let scene as UIWindowScene in UIApplication.shared.connectedScenes {
    scene.traitOverrides.horizontalSizeClass = horizontal
    scene.traitOverrides.verticalSizeClass = vertical
  }
}
#endif

/// React Native owns child layout, exactly as in a plain View.
final class ReservedRegionView: ExpoView {
  let onReservedRegions = EventDispatcher()
#if OPAX_RESERVED_REGIONS
  @available(iOS 27.1, *)
  private struct Snapshot: Equatable {
    let divisions: [Region]
    let occlusions: [Region]
  }
  // Stored as Any because the app's deployment target predates 27.1.
  private var previous: Any?

  private func readRegions() {
    if #available(iOS 27.1, *) {
      let snapshot = Snapshot(
        divisions: Region.read(self, kind: .division),
        occlusions: Region.read(self, kind: .occlusion)
      )
      guard snapshot != (previous as? Snapshot) else { return }
      previous = snapshot
      onReservedRegions([
        "divisions": snapshot.divisions.map { $0.payload },
        "occlusions": snapshot.occlusions.map { $0.payload }
      ])
    }
  }

  override func updateConstraints() {
    readRegions()
    super.updateConstraints()
  }

  override func layoutSubviews() {
    super.layoutSubviews()
    readRegions()
    setNeedsUpdateConstraints()
  }
#endif
}

public final class OpaxDuoModule: Module {
  private let observer = WindowTraitsObserver()

  public func definition() -> ModuleDefinition {
    Name("OpaxDuo")
    Events("onWindowTraits")

    OnCreate {
      onMain {
#if OPAX_DUO_E2E
        overrideWindowTraitsForE2E()
#endif
        self.observer.refresh()
      }
    }

    Function("getWindowTraits") { () -> [String: Any] in
      if Thread.isMainThread {
        return MainActor.assumeIsolated { self.observer.refresh() }
      }
      onMain { self.observer.refresh() }
      return TraitsCache.shared.get()
    }

    OnStartObserving {
      onMain {
        self.observer.emit = { [weak self] traits in self?.sendEvent("onWindowTraits", traits) }
        self.observer.start()
      }
    }
    OnStopObserving { onMain { self.observer.stop() } }
    OnDestroy { onMain { self.observer.stop() } }

    View(ReservedRegionView.self) { Events("onReservedRegions") }
  }
}
