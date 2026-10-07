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

struct ShareRequest: Record {
  @Field var url: String = ""
  @Field var title: String = ""
}

final class InvalidShareURLException: Exception {
  override var reason: String { "Only canonical https links can be shared" }
}

final class NoPresenterException: Exception {
  override var reason: String { "There is no screen to present the share sheet from" }
}

public final class OpaxShareModule: Module {
  private func appIcon() -> UIImage? {
    if let icon = UIImage(named: "AppIcon") { return icon }
    let icons = Bundle.main.infoDictionary?["CFBundleIcons"] as? [String: Any]
    let primary = icons?["CFBundlePrimaryIcon"] as? [String: Any]
    let files = primary?["CFBundleIconFiles"] as? [String]
    return files?.last.flatMap { UIImage(named: $0) }
  }

  public func definition() -> ModuleDefinition {
    Name("OpaxShare")

    AsyncFunction("share") { (request: ShareRequest, promise: Promise) in
      guard let url = URL(string: request.url), url.scheme == "https", url.host != nil else {
        throw InvalidShareURLException()
      }
      // Resolve the active scene's presenter each time, including an open
      // profile or Account sheet. The application-wide keyWindow is legacy.
      guard let scene = SceneGeometry.foregroundScene(),
        let window = scene.windows.first(where: { $0.isKeyWindow }),
        var presenter = window.rootViewController else {
        throw NoPresenterException()
      }
      while let presented = presenter.presentedViewController, !presented.isBeingDismissed {
        presenter = presented
      }
      let item = OpaxLinkItem(url: url, title: request.title, icon: self.appIcon())
      let controller = UIActivityViewController(activityItems: [item], applicationActivities: nil)
      controller.popoverPresentationController?.sourceView = presenter.view
      controller.completionWithItemsHandler = { _, completed, _, _ in
        promise.resolve(completed)
      }
      presenter.present(controller, animated: true)
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
