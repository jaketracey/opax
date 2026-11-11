import ExpoModulesCore
import UIKit

private func onMain<T>(_ body: () -> T) -> T {
  if Thread.isMainThread { return body() }
  return DispatchQueue.main.sync(execute: body)
}

private struct WindowTraits: Equatable {
  var horizontal = "compact"
  var vertical = "compact"
  var foldable = false

  var payload: [String: Any] {
    ["horizontal": horizontal, "vertical": vertical, "foldable": foldable]
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
  var onChange: ((Bool) -> Void)?

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

private final class WindowTraitsObserver {
  private weak var window: UIWindow?
  private weak var preferredScene: UIWindowScene?
  private var observing = false
  private var registration: (any UITraitChangeRegistration)?
  private var notifications: [NSObjectProtocol] = []
  private var last: WindowTraits?
  private var foldable = false
  var emit: (([String: Any]) -> Void)?
#if OPAX_RESERVED_REGIONS
  private var rootObserver: UIView?
#endif

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
        if name == UIWindow.didBecomeKeyNotification,
           let window = notification.object as? UIWindow {
          self?.preferredScene = window.windowScene
        } else if name == UIScene.didActivateNotification,
                  let scene = notification.object as? UIWindowScene {
          self?.preferredScene = scene
        }
        // Key-window changes can arrive while UIKit is transferring focus.
        DispatchQueue.main.async { [weak self] in
          guard let self, self.observing else { return }
          _ = self.refresh()
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
    }
#if OPAX_RESERVED_REGIONS
    if #available(iOS 27.1, *), let root = key?.rootViewController?.view {
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
    let traits = WindowTraits(
      horizontal: window?.traitCollection.horizontalSizeClass == .regular ? "regular" : "compact",
      vertical: window?.traitCollection.verticalSizeClass == .regular ? "regular" : "compact",
      foldable: foldable
    )
    if traits != last {
      last = traits
      emit?(traits.payload)
    }
    return traits.payload
  }
}

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

    Function("getWindowTraits") { onMain { self.observer.refresh() } }

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
