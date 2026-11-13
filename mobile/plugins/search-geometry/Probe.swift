import UIKit

private enum OpaxSearchGeometryProbe {
  static var timer: Timer?
  static var keyboardHeight: CGFloat = 0
  static var last = ""
  static let label = UILabel()
  static let maximumLogBytes: UInt64 = 512 * 1024
  static func start() {
    NotificationCenter.default.addObserver(forName: UIResponder.keyboardWillChangeFrameNotification, object: nil, queue: .main) { note in
      if let frame = note.userInfo?[UIResponder.keyboardFrameEndUserInfoKey] as? CGRect {
        keyboardHeight = max(0, UIScreen.main.bounds.maxY - frame.minY)
      }
    }
    label.isAccessibilityElement = true
    label.accessibilityIdentifier = "search-geometry"
    label.isUserInteractionEnabled = false
    timer = Timer.scheduledTimer(withTimeInterval: 0.25, repeats: true) { _ in sample() }
  }
  static func views(_ root: UIView) -> [UIView] {
    [root] + root.subviews.flatMap { views($0) }
  }
  static func rect(_ view: UIView?, _ window: UIWindow) -> [String: CGFloat] {
    guard let view else { return [:] }
    let r = view.convert(view.bounds, to: window)
    return ["x": r.minX, "y": r.minY, "width": r.width, "height": r.height]
  }
  // Ignore hidden ancestors and clip to the actual window/scroll viewport.
  // Insets describe scroll layout, not the opaque controls covering a reader.
  static func visibleFrame(_ view: UIView?, _ window: UIWindow) -> CGRect? {
    guard let view, view.window === window else { return nil }
    var frame = view.convert(view.bounds, to: window).intersection(window.bounds)
    var ancestor: UIView? = view
    while let current = ancestor {
      if current.isHidden || current.alpha <= 0.01 { return nil }
      if current.clipsToBounds {
        frame = frame.intersection(current.convert(current.bounds, to: window))
      }
      ancestor = current.superview
    }
    return frame.isNull || frame.isEmpty ? nil : frame
  }
  static func visibleRect(_ view: UIView?, _ window: UIWindow) -> [String: CGFloat] {
    guard let r = visibleFrame(view, window) else { return [:] }
    return ["x": r.minX, "y": r.minY, "width": r.width, "height": r.height]
  }
  static func inset(_ value: UIEdgeInsets) -> [String: CGFloat] {
    ["top": value.top, "bottom": value.bottom, "left": value.left, "right": value.right]
  }
  static func sample() {
    guard let window = UIApplication.shared.connectedScenes.compactMap({ $0 as? UIWindowScene }).flatMap({ $0.windows }).first(where: { $0.isKeyWindow }) else { return }
    let all = views(window)
    guard let screen = all.first(where: { ["search-screen", "today-screen", "ask-screen"].contains($0.accessibilityIdentifier ?? "") && !$0.isHidden }),
          let scroll = views(screen).compactMap({ $0 as? UIScrollView }).first else { return }
    if label.superview !== window {
      label.frame = CGRect(x: 2, y: window.bounds.midY, width: 2, height: 2)
      window.addSubview(label)
    }
    let inScreen = views(screen)
    let field = all.compactMap { $0 as? UISearchTextField }.first { !$0.isHidden && $0.window != nil }
    // Ask: the current question (asked or failed), its progress line and error.
    let askQuestion = inScreen.last { ["ask-user-question", "ask-failed-question"].contains($0.accessibilityIdentifier ?? "") }
    let askProgress = inScreen.first { $0.accessibilityIdentifier == "ask-progress" }
    let askError = inScreen.first { ($0.accessibilityIdentifier ?? "").hasPrefix("ask-error-") }
    let nav = all.compactMap { $0 as? UINavigationBar }.first { !$0.isHidden && $0.window != nil && $0.convert($0.bounds, to: window).minX >= 0 }
    let large = nav.flatMap { views($0).first { String(describing: type(of: $0)).contains("LargeTitleView") } }
    let placeholderFont = field.flatMap { f -> UIFont? in
      guard let text = f.attributedPlaceholder, text.length > 0 else { return nil }
      return text.attribute(.font, at: 0, effectiveRange: nil) as? UIFont
    }
    let placeholderSize = field.flatMap { f in placeholderFont.map { ((f.placeholder ?? "") as NSString).size(withAttributes: [.font: $0]) } }
    let placeholderRect = field.map { $0.placeholderRect(forBounds: $0.bounds).intersection($0.bounds).insetBy(dx: 1, dy: 1) }
    // In a conversation Ask uses an inline title. UIKit can retain the full
    // 106 pt bar frame with its hidden large-title band; the visible controls
    // end at the compact content view instead. Keep nav/largeTitle for diagnosis.
    let navContent = nav.flatMap { views($0).first {
      String(describing: type(of: $0)).contains("BarContentView") && visibleFrame($0, window) != nil
    } }
    let tab = all.compactMap { $0 as? UITabBar }.first { visibleFrame($0, window) != nil }
    let askDock = all.last { $0.accessibilityIdentifier == "ask-dock" && visibleFrame($0, window) != nil }
    let data: [String: Any] = [
      "screen": screen.accessibilityIdentifier ?? "", "button": rect(field, window),
      "windowHeight": window.bounds.height,
      "offset": ["x": scroll.contentOffset.x, "y": scroll.contentOffset.y],
      "inset": inset(scroll.contentInset), "adjustedInset": inset(scroll.adjustedContentInset),
      "contentHeight": scroll.contentSize.height, "viewportHeight": scroll.bounds.height,
      "nav": rect(nav, window), "largeTitle": rect(large, window),
      "navContent": visibleRect(navContent, window), "tab": visibleRect(tab, window),
      "scrollFrame": visibleRect(scroll, window), "askDock": visibleRect(askDock, window),
      "firstLine": rect(views(screen).first { $0.accessibilityIdentifier == "search-input" }?.superview?.subviews.first ?? views(screen).first { $0.accessibilityIdentifier == "today-screen-message" }, window),
      "keyboardHeight": keyboardHeight,
      "editing": views(screen).contains { $0.isFirstResponder },
      // Results are on screen: a catalog or record count line (pass 5).
      "results": views(screen).contains { ["search-cache-state", "search-count", "search-results-count"].contains($0.accessibilityIdentifier ?? "") },
      // The query field itself: an answered search collapses the form below it.
      "field": rect(field, window),
      "placeholder": field?.placeholder ?? "",
      "placeholderPointSize": placeholderFont?.pointSize ?? 0,
      "placeholderWidth": placeholderSize?.width ?? 0,
      "placeholderLineHeight": placeholderFont?.lineHeight ?? 0,
      "placeholderAvailableWidth": placeholderRect?.width ?? 0,
      "placeholderAvailableHeight": placeholderRect?.height ?? 0,
      "askViewport": rect(scroll, window),
      "askComposer": rect(all.first { $0.accessibilityIdentifier == "ask-phone-dock" }, window),
      "askQuestion": rect(askQuestion, window), "askProgress": rect(askProgress, window), "askError": rect(askError, window),
    ]
    guard let raw = try? JSONSerialization.data(withJSONObject: data, options: [.sortedKeys]), let text = String(data: raw, encoding: .utf8) else { return }
    if text == last { return }; last = text
    label.accessibilityLabel = text
    var record = data; record["time"] = Date().timeIntervalSince1970
    guard let bytes = try? JSONSerialization.data(withJSONObject: record, options: [.sortedKeys]),
          let directory = FileManager.default.urls(for: .documentDirectory, in: .userDomainMask).first else { return }
    let url = directory.appendingPathComponent("search-geometry.jsonl")
    if !FileManager.default.fileExists(atPath: url.path) { FileManager.default.createFile(atPath: url.path, contents: nil) }
    if let file = try? FileHandle(forWritingTo: url) {
      let size = file.seekToEndOfFile()
      if size + UInt64(bytes.count + 1) > maximumLogBytes {
        file.truncateFile(atOffset: 0)
        file.seek(toFileOffset: 0)
      }
      file.write(bytes); file.write(Data([10])); try? file.close()
    }
  }
}
