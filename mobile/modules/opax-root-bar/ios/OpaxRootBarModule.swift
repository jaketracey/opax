import ExpoModulesCore
import UIKit

private final class SolidBarBacking: UIView {
  weak var screen: UIView?

  init() {
    super.init(frame: .zero)
    isUserInteractionEnabled = false
    accessibilityElementsHidden = true
  }

  required init?(coder: NSCoder) { fatalError("init(coder:) has not been implemented") }
}

public final class OpaxRootBarModule: Module {
  private var backings: [String: SolidBarBacking] = [:]
  private let verticalBar = VerticalBarObserver()

  public func definition() -> ModuleDefinition {
    Name("OpaxRootBar")
    Events("onVerticalBarEdge")

    OnCreate { DispatchQueue.main.async { MainActor.assumeIsolated { self.verticalBar.refresh() } } }
    Function("getVerticalBarEdge") { () -> String in self.verticalBar.snapshot() }
    OnStartObserving {
      DispatchQueue.main.async { MainActor.assumeIsolated {
        self.verticalBar.emit = { [weak self] edge in
          guard let self else { return }
          if edge != "unspecified" {
            self.backings.values.forEach { $0.removeFromSuperview() }
          }
          self.sendEvent("onVerticalBarEdge", ["edge": edge])
        }
        self.verticalBar.start()
      } }
    }
    OnStopObserving { DispatchQueue.main.async { MainActor.assumeIsolated { self.verticalBar.stop() } } }

    AsyncFunction("setSolid") { (identifier: String, ground: UIColor) in
      guard #available(iOS 26, *) else { return }
      let backing = self.backings[identifier] ?? SolidBarBacking()
      self.backings[identifier] = backing
      backing.backgroundColor = ground
      self.apply(identifier, backing: backing)
    }.runOnQueue(.main)

    AsyncFunction("remove") { (identifier: String) in
      self.backings.removeValue(forKey: identifier)?.removeFromSuperview()
    }.runOnQueue(.main)

    OnDestroy {
      let backings = Array(self.backings.values)
      self.backings.removeAll()
      DispatchQueue.main.async { MainActor.assumeIsolated {
        self.verticalBar.stop()
        backings.forEach { $0.removeFromSuperview() }
      } }
    }
  }

  // The existing native screen carries the identifier. No extra React
  // view precedes the scroll view, so UIKit's first-descendant discovery and
  // react-native-screens' native scroll-edge integration remain intact.
  private func findScreen(_ identifier: String, in view: UIView) -> UIView? {
    if view.accessibilityIdentifier == identifier { return view }
    for child in view.subviews {
      if let found = findScreen(identifier, in: child) { return found }
    }
    return nil
  }

  private func apply(_ identifier: String, backing: SolidBarBacking, attempt: Int = 0) {
    guard backings[identifier] === backing else { return }
    if backing.screen?.window == nil {
      let windows = UIApplication.shared.connectedScenes
        .compactMap { $0 as? UIWindowScene }.flatMap { $0.windows }
      backing.screen = windows.lazy.compactMap { self.findScreen(identifier, in: $0) }.first
    }
    var responder: UIResponder? = backing.screen
    var owner: UIViewController?
    while let current = responder {
      if let controller = current as? UIViewController {
        owner = controller
        break
      }
      responder = current.next
    }
    guard let owner, let navigation = owner.navigationController,
      let parent = navigation.navigationBar.superview, backing.screen?.window != nil
    else {
      // Options can arrive just before Fabric mounts the identified screen.
      // Removal invalidates queued attempts, including after blur or unmount.
      if attempt < 20 {
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.016) { [weak self, weak backing] in
          guard let self, let backing else { return }
          self.apply(identifier, backing: backing, attempt: attempt + 1)
        }
      }
      return
    }
    guard navigation.topViewController === owner else {
      backing.removeFromSuperview()
      return
    }
    let bar = navigation.navigationBar
    // Side bars use UIKit's appearance and title. Never extend a horizontal
    // backing across their content, including before the JS trait event.
    guard verticalBar.snapshot() == "unspecified", bar.bounds.width >= bar.bounds.height else {
      backing.removeFromSuperview()
      return
    }
    UIView.performWithoutAnimation {
      // A sibling below the bar protects the content, never UIKit's title or
      // buttons. Cover the status strip as well as any stacked search field.
      if backing.superview !== parent { parent.insertSubview(backing, belowSubview: bar) }
      let barFrame = bar.convert(bar.bounds, to: parent)
      let top = max(0, barFrame.minY - navigation.view.safeAreaInsets.top)
      backing.frame = CGRect(x: barFrame.minX, y: top, width: barFrame.width, height: barFrame.maxY - top)
      backing.layoutIfNeeded()
    }
    // Reduce Transparency, Increase Contrast and Today's AX title band use
    // this solid ground; other scrolling keeps UIKit's own edge treatment.
  }
}
