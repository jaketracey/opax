import ExpoModulesCore
import LinkPresentation
import UIKit

// Supplies the share sheet's link preview from data the app already holds.
// With metadata provided here, the sheet does not fetch the page or its
// share image (/og/*) from the phone.
final class OpaxLinkItem: NSObject, UIActivityItemSource {
  private let url: URL
  private let metadata: LPLinkMetadata

  init(url: URL, title: String, icon: UIImage?) {
    self.url = url
    let metadata = LPLinkMetadata()
    metadata.originalURL = url
    metadata.url = url
    metadata.title = title
    if let icon {
      metadata.iconProvider = NSItemProvider(object: icon)
    }
    self.metadata = metadata
  }

  func activityViewControllerPlaceholderItem(_ controller: UIActivityViewController) -> Any {
    url
  }

  func activityViewController(
    _ controller: UIActivityViewController,
    itemForActivityType activityType: UIActivity.ActivityType?
  ) -> Any? {
    url
  }

  func activityViewController(
    _ controller: UIActivityViewController,
    subjectForActivityType activityType: UIActivity.ActivityType?
  ) -> String {
    metadata.title ?? ""
  }

  func activityViewControllerLinkMetadata(_ controller: UIActivityViewController) -> LPLinkMetadata? {
    metadata
  }
}

// On iPad the sheet is a popover. Share actions sit in the navigation bar's
// trailing buttons, so it points up at that corner, under the bar, rather
// than at the window's top-left origin. A compact window has no popover.
func anchorPopover(_ controller: UIViewController, in presenter: UIViewController) {
  guard let popover = controller.popoverPresentationController, let view = presenter.view else { return }
  let insets = view.safeAreaInsets
  popover.sourceView = view
  popover.sourceRect = CGRect(
    x: view.bounds.maxX - insets.right - 44, y: insets.top, width: 1, height: 1)
  popover.permittedArrowDirections = [.up]
}

// UIKit shows an action sheet (and a share sheet React Native presents) as a
// popover whenever the window is horizontally regular: on iPad, and in a
// regular-width iPhone window such as the unfolded iPhone Duo. A popover with
// no source raises NSGenericException as it is presented. React Native sets
// the source on the iPad idiom only, so this presenter replaces it on iOS.
// Compact windows keep the sheet that rises from the bottom, with no source,
// exactly as React Native shows it: from iOS 26 a sheet that has a source
// is anchored to it even on a phone.
func presentsAsPopover(_ presenter: UIViewController) -> Bool {
  UIDevice.current.userInterfaceIdiom == .pad
    || presenter.traitCollection.horizontalSizeClass == .regular
}

/// The trigger when it is on screen, else the middle of what the reader sees
/// of the presenter, with no arrow.
func anchorActionSheet(_ controller: UIViewController, in presenter: UIViewController, anchor: UIView?) {
  controller.modalPresentationStyle = .popover
  guard presentsAsPopover(presenter), let popover = controller.popoverPresentationController,
    let view = presenter.view else { return }
  if let anchor, let window = anchor.window, window === view.window, !anchor.isHidden,
    !anchor.bounds.isEmpty {
    popover.sourceView = anchor
    popover.sourceRect = anchor.bounds
    return
  }
  var visible = view.bounds
  if let window = view.window {
    let onScreen = view.convert(window.bounds, from: window).intersection(view.bounds)
    if !onScreen.isNull, !onScreen.isEmpty { visible = onScreen }
  }
  popover.sourceView = view
  popover.sourceRect = CGRect(x: visible.midX, y: visible.midY, width: 0, height: 0)
  popover.permittedArrowDirections = []
}

/// The top view controller of the active scene's key window, including an
/// open sheet. The application-wide keyWindow is legacy.
func topPresenter() -> UIViewController? {
  guard let scene = SceneGeometry.foregroundScene(),
    let window = scene.windows.first(where: { $0.isKeyWindow }),
    var presenter = window.rootViewController else { return nil }
  while let presented = presenter.presentedViewController, !presented.isBeingDismissed {
    presenter = presented
  }
  return presenter
}

struct ActionSheetRequest: Record {
  @Field var title: String? = nil
  @Field var message: String? = nil
  @Field var options: [String] = []
  @Field var cancelButtonIndex: Int? = nil
  @Field var destructiveButtonIndices: [Int] = []
  /// React tag of the control the sheet comes from.
  @Field var anchor: Int? = nil
}

struct ShareRequest: Record {
  @Field var url: String = ""
  @Field var title: String = ""
  @Field var text: String? = nil
  /// A source's own link (http or https, any host): no OPAX icon.
  @Field var external: Bool = false
}

struct TextShareRequest: Record {
  @Field var text: String = ""
  @Field var filename: String = "record.txt"
}

final class InvalidShareURLException: Exception {
  override var reason: String { "Only canonical https links can be shared" }
}

final class NoPresenterException: Exception {
  override var reason: String { "There is no screen to present the sheet from" }
}

public final class OpaxShareModule: Module {
  /// The open action sheet and how to settle its promise when it is
  /// dismissed without a choice (Escape on a hardware keyboard).
  private weak var sheet: UIAlertController?
  private var settleSheet: ((Int) -> Void)?

  private func appIcon() -> UIImage? {
    if let icon = UIImage(named: "AppIcon") { return icon }
    let icons = Bundle.main.infoDictionary?["CFBundleIcons"] as? [String: Any]
    let primary = icons?["CFBundlePrimaryIcon"] as? [String: Any]
    let files = primary?["CFBundleIconFiles"] as? [String]
    return files?.last.flatMap { UIImage(named: $0) }
  }

  public func definition() -> ModuleDefinition {
    Name("OpaxShare")

    AsyncFunction("copyText") { (text: String) in
      UIPasteboard.general.string = text
    }.runOnQueue(.main)

    AsyncFunction("shareText") { (request: TextShareRequest, promise: Promise) in
      guard request.filename.range(of: "^[a-z0-9-]+\\.(txt|bib|ris)$", options: .regularExpression) != nil else {
        throw InvalidShareURLException()
      }
      guard let presenter = topPresenter() else { throw NoPresenterException() }
      let directory = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString, isDirectory: true)
      try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
      let file = directory.appendingPathComponent(request.filename)
      do { try request.text.write(to: file, atomically: true, encoding: .utf8) }
      catch { try? FileManager.default.removeItem(at: directory); throw error }
      let controller = UIActivityViewController(activityItems: [file], applicationActivities: nil)
      anchorPopover(controller, in: presenter)
      controller.completionWithItemsHandler = { _, completed, _, _ in
        try? FileManager.default.removeItem(at: directory)
        promise.resolve(completed)
      }
      presenter.present(controller, animated: true)
    }.runOnQueue(.main)

    AsyncFunction("share") { (request: ShareRequest, promise: Promise) in
      guard let url = URL(string: request.url), url.host != nil,
        url.scheme == "https" || (request.external && url.scheme == "http") else {
        throw InvalidShareURLException()
      }
      // Resolve the active scene's presenter each time, including an open
      // profile or Account sheet.
      guard let presenter = topPresenter() else { throw NoPresenterException() }
      let item = OpaxLinkItem(url: url, title: request.title, icon: request.external ? nil : self.appIcon())
      let sentence = request.text?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
      let items: [Any] = sentence.isEmpty ? [item] : [String(sentence.prefix(4000)), item]
      let controller = UIActivityViewController(activityItems: items, applicationActivities: nil)
      anchorPopover(controller, in: presenter)
      controller.completionWithItemsHandler = { _, completed, _, _ in
        promise.resolve(completed)
      }
      presenter.present(controller, animated: true)
    }
    .runOnQueue(.main)

    // Menus and confirmations: React Native's action sheet, anchored.
    // Resolves with the chosen index (tapping outside a popover chooses
    // Cancel), or -1 when the app dismisses the sheet.
    AsyncFunction("showActionSheet") { (request: ActionSheetRequest, promise: Promise) in
      guard let presenter = topPresenter() else { throw NoPresenterException() }
      let cancel = request.cancelButtonIndex ?? -1
      let alert = UIAlertController(
        title: request.title, message: request.message, preferredStyle: .actionSheet)
      var settled = false
      let settle: (Int) -> Void = { [weak self, weak alert] index in
        guard !settled else { return }
        settled = true
        if let self, self.sheet === alert {
          self.sheet = nil
          self.settleSheet = nil
        }
        promise.resolve(index)
      }
      for (index, option) in request.options.enumerated() {
        let style: UIAlertAction.Style = request.destructiveButtonIndices.contains(index)
          ? .destructive : index == cancel ? .cancel : .default
        alert.addAction(UIAlertAction(title: option, style: style) { _ in settle(index) })
      }
      let anchor = request.anchor.flatMap { self.appContext?.findView(withTag: $0, ofType: UIView.self) }
      anchorActionSheet(alert, in: presenter, anchor: anchor)
      self.settleSheet?(-1)
      self.sheet = alert
      self.settleSheet = settle
      presenter.present(alert, animated: true)
    }
    .runOnQueue(.main)

    AsyncFunction("dismissActionSheet") {
      let settle = self.settleSheet
      let sheet = self.sheet
      self.sheet = nil
      self.settleSheet = nil
      guard let sheet else { settle?(-1); return }
      sheet.dismiss(animated: true) { settle?(-1) }
    }
    .runOnQueue(.main)

    // Light confirmation for Follow and Share. The system respects the
    // reader's System Haptics setting; this plays no sound.
    AsyncFunction("haptic") { (kind: String) in
      switch kind {
      case "success":
        UINotificationFeedbackGenerator().notificationOccurred(.success)
      case "selection":
        UISelectionFeedbackGenerator().selectionChanged()
      default:
        UIImpactFeedbackGenerator(style: .light).impactOccurred()
      }
    }
    .runOnQueue(.main)
  }
}
