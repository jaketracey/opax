import ExpoModulesCore
import ObjectiveC
import UIKit

// iPad support that React Native does not provide on iOS: hardware-keyboard
// commands (Cmd-F, Cmd-N, Cmd-1…5, arrows in a split list) and the system
// pointer effect over buttons, rows and cards. Nothing here reads or sends
// data; a key press only tells JavaScript which command ran.

struct KeyCommandSpec: Record {
  @Field var id: String = ""
  /** One character, or "up", "down", "escape", "return". */
  @Field var input: String = ""
  /** "command", "shift", "option", "control". */
  @Field var modifiers: [String] = []
  /** The name the Cmd-hold shortcut list and the menu bar show. */
  @Field var title: String = ""
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
      // A focused text field keeps its own arrows, Return and Escape.
      command.wantsPriorityOverSystemBehavior = false
      return command
    }
    Self.adoptAppDelegate()
  }

  private static func input(_ value: String) -> String? {
    switch value {
    case "up": return UIKeyCommand.inputUpArrow
    case "down": return UIKeyCommand.inputDownArrow
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
final class PointerHoverView: ExpoView, UIPointerInteractionDelegate {
  let onHoverChange = EventDispatcher()
  var effect = "highlight"
  var cornerRadius: CGFloat = -1

  required init(appContext: AppContext? = nil) {
    super.init(appContext: appContext)
    addInteraction(UIPointerInteraction(delegate: self))
  }

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

    // E2E harness only (the JS caller is gated to e2e builds): run a command
    // through the same path a key press takes after UIKit matches it.
    AsyncFunction("runKeyCommand") { (id: String) in
      KeyCommandCenter.shared.emit?(id)
    }
    .runOnQueue(.main)

    // E2E harness only: ask the window scene for a narrow maximum width, as a
    // Split View or Stage Manager window would be. iPadOS honours it only in
    // windowed multitasking; it returns false where scenes cannot resize.
    AsyncFunction("constrainWindowWidth") { (width: Double) -> Bool in
      guard let scene = UIApplication.shared.connectedScenes
        .compactMap({ $0 as? UIWindowScene })
        .first(where: { $0.activationState == .foregroundActive }),
        let restrictions = scene.sizeRestrictions
      else { return false }
      if width > 0 {
        restrictions.maximumSize = CGSize(width: width, height: .greatestFiniteMagnitude)
      } else {
        restrictions.maximumSize = CGSize(width: CGFloat.greatestFiniteMagnitude, height: .greatestFiniteMagnitude)
      }
      return true
    }
    .runOnQueue(.main)

    View(PointerHoverView.self) {
      Events("onHoverChange")
      Prop("effect") { (view: PointerHoverView, effect: String) in
        view.effect = effect
      }
      Prop("cornerRadius") { (view: PointerHoverView, radius: Double) in
        view.cornerRadius = CGFloat(radius)
      }
    }
  }
}
