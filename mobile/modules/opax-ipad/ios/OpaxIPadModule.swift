import ExpoModulesCore
import ObjectiveC
import UIKit

/// UIKit owns the sidebar labels, so configure them through its public item
/// delegate rather than touching private label views. Unlimited word-wrapped
/// lines retain the reader's type size; fitting may step down to body default
/// when a single word is wider than the sidebar.
@available(iOS 18.0, *)
final class SidebarLabels: NSObject, UITabBarController.Sidebar.Delegate {
  static let shared = SidebarLabels()

  static func install(attempt: Int = 0) {
    guard UIDevice.current.userInterfaceIdiom == .pad else { return }
    func tabs(in controller: UIViewController) -> UITabBarController? {
      if let tabs = controller as? UITabBarController { return tabs }
      for child in controller.children {
        if let found = tabs(in: child) { return found }
      }
      return nil
    }
    let windows = UIApplication.shared.connectedScenes.compactMap { $0 as? UIWindowScene }.flatMap { $0.windows }
    for window in windows where window.isKeyWindow {
      if let root = window.rootViewController, let controller = tabs(in: root) {
        // Do not replace another owner's delegate.
        guard controller.sidebar.delegate == nil || controller.sidebar.delegate === shared else { return }
        controller.sidebar.delegate = shared
        for tab in controller.tabs { controller.sidebar.reconfigureItem(for: tab) }
        return
      }
    }
    // The JS tab layout can mount before UIKit has attached its controller.
    if attempt < 20 {
      DispatchQueue.main.asyncAfter(deadline: .now() + 0.1) { install(attempt: attempt + 1) }
    }
  }

  func tabBarController(_ tabBarController: UITabBarController, sidebar: UITabBarController.Sidebar, update item: UITabSidebarItem) {
    var content = item.defaultContentConfiguration()
    content.textProperties.numberOfLines = 0
    content.textProperties.lineBreakMode = .byWordWrapping
    if tabBarController.traitCollection.preferredContentSizeCategory.isAccessibilityCategory {
      // Reserve 128pt for uninterrupted words beside the sidebar symbol. Fit the longest word, not the entire label, so
      // "Your MP" can still wrap between words. UILabel autoshrink alone
      // only supports one line; keep all lines and the default-size floor.
      let font = content.textProperties.font
      let widest = (content.text ?? "").split(whereSeparator: { $0.isWhitespace })
        .map { (String($0) as NSString).size(withAttributes: [.font: font]).width }
        .max() ?? 0
      if widest > 128 {
        content.textProperties.font = font.withSize(max(17, font.pointSize * 128 / widest))
        content.textProperties.adjustsFontForContentSizeCategory = false
      }
    }
    item.contentConfiguration = content
  }
}

// iPad support that React Native does not provide on iOS: hardware-keyboard
// commands (Cmd-F, Cmd-N, Cmd-1…5, arrows in a split list) and the system
// pointer effect and outbound URL drags over buttons, rows and cards.
// Nothing is fetched: a key press emits an action; a drag exports its title
// and public URL only after the reader starts dragging.

struct KeyCommandSpec: Record {
  @Field var id: String = ""
  /** One character, or "up", "down", "left", "right", "escape", "return". */
  @Field var input: String = ""
  /** "command", "shift", "option", "control". */
  @Field var modifiers: [String] = []
  /** The name the Cmd-hold shortcut list and the menu bar show. */
  @Field var title: String = ""
  /** Runs before the system's own use of the key; surfaces without text input only. */
  @Field var priority: Bool = false
}

/// Holds the current commands and hands each press to JavaScript.
final class KeyCommandCenter {
  static let shared = KeyCommandCenter()
  var emit: ((String) -> Void)?
  private(set) var commands: [UIKeyCommand] = []

  func install(_ specs: [KeyCommandSpec]) {
    commands = specs.compactMap { spec in
      guard let input = Self.input(spec.input) else { return nil }
      let command = UIKeyCommand(
        title: spec.title,
        action: #selector(UIResponder.opaxIPadKeyCommand(_:)),
        input: input,
        modifierFlags: Self.flags(spec.modifiers),
        propertyList: spec.id
      )
      command.discoverabilityTitle = spec.title.isEmpty ? nil : spec.title
      // Text input keeps arrows and Return. Escape closes the active sheet.
      // A surface with no text input (the welcome tour) may take its arrows.
      command.wantsPriorityOverSystemBehavior = spec.input == "escape" || spec.priority
      return command
    }
    Self.adoptAppDelegate()
  }

  private static func input(_ value: String) -> String? {
    switch value {
    case "up": return UIKeyCommand.inputUpArrow
    case "down": return UIKeyCommand.inputDownArrow
    case "left": return UIKeyCommand.inputLeftArrow
    case "right": return UIKeyCommand.inputRightArrow
    case "escape": return UIKeyCommand.inputEscape
    case "return": return "\r"
    default: return value.count == 1 ? value.lowercased() : nil
    }
  }

  private static func flags(_ names: [String]) -> UIKeyModifierFlags {
    var flags: UIKeyModifierFlags = []
    for name in names {
      switch name {
      case "command": flags.insert(.command)
      case "shift": flags.insert(.shift)
      case "option": flags.insert(.alternate)
      case "control": flags.insert(.control)
      default: break
      }
    }
    return flags
  }

  // The application delegate is the last responder in every chain, whatever
  // is focused and whichever sheet is open, so its key commands are always
  // found. Expo generates the AppDelegate on every prebuild, so instead of
  // editing it the getter is added to its class once at runtime. It only
  // overrides UIResponder's default (nil); a class that already implements
  // `keyCommands` itself is left alone.
  private static var adopted = false
  private static func adoptAppDelegate() {
    guard !adopted, let delegate = UIApplication.shared.delegate as? UIResponder else { return }
    adopted = true
    let selector = #selector(getter: UIResponder.keyCommands)
    let block: @convention(block) (AnyObject) -> [UIKeyCommand]? = { _ in
      KeyCommandCenter.shared.commands
    }
    guard let method = class_getInstanceMethod(UIResponder.self, selector) else { return }
    class_addMethod(
      type(of: delegate),
      selector,
      imp_implementationWithBlock(block),
      method_getTypeEncoding(method)
    )
  }
}

extension UIResponder {
  /// The action of every OPAX key command; the first responder that UIKit
  /// asks runs it, so it works with or without a focused field.
  @objc func opaxIPadKeyCommand(_ sender: UIKeyCommand) {
    if let id = sender.propertyList as? String {
      KeyCommandCenter.shared.emit?(id)
    }
  }
}

/// The system pointer effect over its one child: "highlight" for buttons
/// (the pointer becomes the button's platter), "lift" for cards, "hover" for
/// rows (an overlay tint), "none" for hover events only.
final class PointerHoverView: ExpoView, UIPointerInteractionDelegate, UIDragInteractionDelegate {
  let onHoverChange = EventDispatcher()
  let onActivate = EventDispatcher()
  var effect = "highlight"
  var cornerRadius: CGFloat = -1
  var dragUrl = ""
  var dragTitle = ""
  var keyboardFocusable = false

  override var canBecomeFocused: Bool { keyboardFocusable && !isHidden }
  override var canBecomeFirstResponder: Bool { keyboardFocusable }

  override func didUpdateFocus(in context: UIFocusUpdateContext, with coordinator: UIFocusAnimationCoordinator) {
    super.didUpdateFocus(in: context, with: coordinator)
    if context.nextFocusedView === self { becomeFirstResponder() }
    if context.previouslyFocusedView === self { resignFirstResponder() }
    onHoverChange(["hovered": isFocused])
  }

  override var keyCommands: [UIKeyCommand]? {
    guard keyboardFocusable, isFirstResponder else { return nil }
    return [UIKeyCommand(title: "Open focused row", action: #selector(activateRow), input: "\r", modifierFlags: [])]
  }

  @objc private func activateRow() { onActivate([:]) }

  required init(appContext: AppContext? = nil) {
    super.init(appContext: appContext)
    addInteraction(UIPointerInteraction(delegate: self))
    if UIDevice.current.userInterfaceIdiom == .pad {
      addInteraction(UIDragInteraction(delegate: self))
    }
  }

  func dragInteraction(_ interaction: UIDragInteraction, itemsForBeginning session: UIDragSession) -> [UIDragItem] {
    guard UIDevice.current.userInterfaceIdiom == .pad,
      let url = URL(string: dragUrl), url.scheme == "https",
      (url.host == "opax.com.au" || url.host == "opax.invalid"), url.user == nil, url.password == nil else { return [] }
    let provider = NSItemProvider(object: url as NSURL)
    provider.suggestedName = dragTitle
    provider.registerObject("\(dragTitle)\n\(url.absoluteString)" as NSString, visibility: .all)
    return [UIDragItem(itemProvider: provider)]
  }

  func dragInteraction(_ interaction: UIDragInteraction, sessionAllowsMoveOperation session: UIDragSession) -> Bool { false }
  func dragInteraction(_ interaction: UIDragInteraction, sessionIsRestrictedToDraggingApplication session: UIDragSession) -> Bool { false }

  func pointerInteraction(
    _ interaction: UIPointerInteraction,
    styleFor region: UIPointerRegion
  ) -> UIPointerStyle? {
    guard effect != "none", window != nil else { return nil }
    let target = subviews.first ?? self
    guard target.window != nil else { return nil }
    let parameters = UIPreviewParameters()
    if cornerRadius >= 0 {
      parameters.visiblePath = UIBezierPath(
        roundedRect: target.bounds, cornerRadius: cornerRadius)
    }
    let preview = UITargetedPreview(view: target, parameters: parameters)
    switch effect {
    case "lift":
      return UIPointerStyle(effect: .lift(preview))
    case "hover":
      return UIPointerStyle(
        effect: .hover(preview, preferredTintMode: .overlay, prefersShadow: false, prefersScaledContent: false))
    default:
      return UIPointerStyle(effect: .highlight(preview))
    }
  }

  func pointerInteraction(
    _ interaction: UIPointerInteraction,
    willEnter region: UIPointerRegion,
    animator: UIPointerInteractionAnimating
  ) {
    onHoverChange(["hovered": true])
  }

  func pointerInteraction(
    _ interaction: UIPointerInteraction,
    willExit region: UIPointerRegion,
    animator: UIPointerInteractionAnimating
  ) {
    onHoverChange(["hovered": false])
  }
}

public final class OpaxIPadModule: Module {
  public func definition() -> ModuleDefinition {
    Name("OpaxIPad")
    Events("onKeyCommand")

    OnCreate {
      KeyCommandCenter.shared.emit = { [weak self] id in
        self?.sendEvent("onKeyCommand", ["id": id])
      }
    }

    AsyncFunction("setKeyCommands") { (specs: [KeyCommandSpec]) in
      KeyCommandCenter.shared.install(specs)
    }
    .runOnQueue(.main)

    AsyncFunction("configureWordSafeSidebarLabels") {
      if #available(iOS 18.0, *) { SidebarLabels.install() }
    }
    .runOnQueue(.main)

    View(PointerHoverView.self) {
      Events("onHoverChange", "onActivate")
      Prop("dragUrl") { (view: PointerHoverView, value: String?) in view.dragUrl = value ?? "" }
      Prop("dragTitle") { (view: PointerHoverView, value: String?) in view.dragTitle = value ?? "" }
      Prop("keyboardFocusable") { (view: PointerHoverView, value: Bool) in view.keyboardFocusable = value }
      Prop("effect") { (view: PointerHoverView, effect: String) in
        view.effect = effect
      }
      Prop("cornerRadius") { (view: PointerHoverView, radius: Double) in
        view.cornerRadius = CGFloat(radius)
      }
    }
  }
}
