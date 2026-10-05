import UIKit

private enum OpaxSearchGeometryProbe {
  static var timer: Timer?
  static var keyboardHeight: CGFloat = 0
  static var last = ""
  static let label = UILabel()
  static func start() {
    NotificationCenter.default.addObserver(forName: UIResponder.keyboardWillChangeFrameNotification, object: nil, queue: .main) { note in
      if let frame = note.userInfo?[UIResponder.keyboardFrameEndUserInfoKey] as? CGRect {
        keyboardHeight = max(0, UIScreen.main.bounds.maxY - frame.minY)
      }
    }
    label.isAccessibilityElement = true
    label.accessibilityIdentifier = "search-geometry"
    label.isUserInteractionEnabled = false
    timer = Timer.scheduledTimer(withTimeInterval: 0.1, repeats: true) { _ in sample() }
  }
  static func views(_ root: UIView) -> [UIView] {
    [root] + root.subviews.flatMap { views($0) }
  }
  static func rect(_ view: UIView?, _ window: UIWindow) -> [String: CGFloat] {
    guard let view else { return [:] }
    let r = view.convert(view.bounds, to: window)
    return ["x": r.minX, "y": r.minY, "width": r.width, "height": r.height]
  }
  static func inset(_ value: UIEdgeInsets) -> [String: CGFloat] {
    ["top": value.top, "bottom": value.bottom, "left": value.left, "right": value.right]
  }
  static func sample() {
    guard let window = UIApplication.shared.connectedScenes.compactMap({ $0 as? UIWindowScene }).flatMap({ $0.windows }).first(where: { $0.isKeyWindow }) else { return }
    let all = views(window)
    guard let screen = all.first(where: { ["search-screen", "today-screen"].contains($0.accessibilityIdentifier ?? "") && !$0.isHidden }),
          let scroll = views(screen).compactMap({ $0 as? UIScrollView }).first else { return }
    if label.superview !== window {
      label.frame = CGRect(x: 2, y: window.bounds.midY, width: 2, height: 2)
      window.addSubview(label)
    }
    let button = views(screen).first(where: { $0.accessibilityIdentifier == "search-submit" })
    let nav = all.compactMap { $0 as? UINavigationBar }.first { !$0.isHidden && $0.window != nil && $0.convert($0.bounds, to: window).minX >= 0 }
    let large = nav.flatMap { views($0).first { String(describing: type(of: $0)).contains("LargeTitleView") } }
    let data: [String: Any] = [
      "screen": screen.accessibilityIdentifier ?? "", "button": rect(button, window),
      "windowHeight": window.bounds.height,
      "offset": ["x": scroll.contentOffset.x, "y": scroll.contentOffset.y],
      "inset": inset(scroll.contentInset), "adjustedInset": inset(scroll.adjustedContentInset),
      "contentHeight": scroll.contentSize.height, "viewportHeight": scroll.bounds.height,
      "nav": rect(nav, window), "largeTitle": rect(large, window),
      "firstLine": rect(views(screen).first { $0.accessibilityIdentifier == "search-input" }?.superview?.subviews.first ?? views(screen).first { $0.accessibilityIdentifier == "today-screen-message" }, window),
      "keyboardHeight": keyboardHeight,
      "editing": views(screen).contains { $0.isFirstResponder },
      "results": views(screen).contains { $0.accessibilityIdentifier == "search-cache-state" },
    ]
    guard let raw = try? JSONSerialization.data(withJSONObject: data, options: [.sortedKeys]), let text = String(data: raw, encoding: .utf8) else { return }
    label.accessibilityLabel = text
    if text == last { return }; last = text
    var record = data; record["time"] = Date().timeIntervalSince1970
    guard let bytes = try? JSONSerialization.data(withJSONObject: record, options: [.sortedKeys]),
          let directory = FileManager.default.urls(for: .documentDirectory, in: .userDomainMask).first else { return }
    let url = directory.appendingPathComponent("search-geometry.jsonl")
    if !FileManager.default.fileExists(atPath: url.path) { FileManager.default.createFile(atPath: url.path, contents: nil) }
    if let file = try? FileHandle(forWritingTo: url) {
      file.seekToEndOfFile(); file.write(bytes); file.write(Data([10])); try? file.close()
    }
  }
}
