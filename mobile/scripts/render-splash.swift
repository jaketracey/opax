// Renders the launch artwork: `swift scripts/render-splash.swift` from mobile/.
//
// 1. Builds the SVG sources in assets/splash/: the brand mark from
//    portal/public/favicon.svg (the navy square and the gold seven-point star,
//    path copied unchanged) and the "OPAX" wordmark, outlined from the bundled
//    Merriweather Bold, so the SVGs need no font to render.
// 2. Renders every PNG from those SVG files with Core Graphics.
//
// macOS frameworks only: no Homebrew tools, npm packages or network. The
// output is deterministic; rerun after changing the mark, the font or the
// layout below, then commit the SVGs and PNGs together.
import CoreGraphics
import CoreText
import Foundation
import ImageIO
import UniformTypeIdentifiers

let root = URL(fileURLWithPath: FileManager.default.currentDirectoryPath)
let out = root.appendingPathComponent("assets/splash")
let favicon = root.appendingPathComponent("../portal/public/favicon.svg")
let fontURL = root.appendingPathComponent("assets/fonts/Merriweather-Bold.ttf")

// Palette roles (src/design/palette.ts).
let navy = "#142A43"
let gold = "#D9A84A"  // bronzeBright: the mark's star
let ink = "#23271F"
let paper = "#FAF9F6"

// The lockup, in points, on a 200 x 120 canvas: the 60pt mark above the
// wordmark, centred. The launch screen centres the canvas, so the lockup's
// centre is the screen's. LaunchHandoff (src/launch/) mirrors these numbers.
let canvas = CGSize(width: 200, height: 120)
let markSize: CGFloat = 60
let markTop: CGFloat = 6
let wordmarkSize: CGFloat = 30
let wordmarkGap: CGFloat = 16  // mark bottom to the wordmark's cap top

func fail(_ message: String) -> Never {
  FileHandle.standardError.write(Data("render-splash: \(message)\n".utf8))
  exit(1)
}

func n(_ value: CGFloat) -> String {
  let rounded = (value * 100).rounded() / 100
  var text = String(format: "%.2f", Double(rounded))
  while text.hasSuffix("0") { text.removeLast() }
  if text.hasSuffix(".") { text.removeLast() }
  return text == "-0" ? "0" : text
}

// MARK: The mark

guard let faviconText = try? String(contentsOf: favicon, encoding: .utf8) else {
  fail("cannot read \(favicon.path)")
}
guard
  let starMatch = faviconText.range(
    of: ##"<path transform="translate\(2 2\)" fill="#D9A84A" d="([^"]+)""##,
    options: .regularExpression)
else { fail("favicon.svg no longer has the translated star path") }
let starD = String(faviconText[starMatch]).components(separatedBy: " d=\"")[1]
  .dropLast()
var starPoints: [CGPoint] = []
for token in starD.split(whereSeparator: { "MLZ".contains($0) }) {
  let parts = token.split(separator: " ").compactMap { Double($0) }
  if parts.count != 2 { fail("unexpected star path token \(token)") }
  starPoints.append(CGPoint(x: parts[0], y: parts[1]))
}
if starPoints.count != 14 { fail("expected a seven-point star (14 vertices)") }

let markX = (canvas.width - markSize) / 2
let unit = markSize / 24  // favicon viewBox units to points
func markPoint(_ p: CGPoint) -> CGPoint {
  CGPoint(x: markX + (p.x + 2) * unit, y: markTop + (p.y + 2) * unit)
}
let starPath =
  "M" + starPoints.map { "\(n(markPoint($0).x)) \(n(markPoint($0).y))" }.joined(separator: "L")
  + "Z"

// MARK: The wordmark

guard
  let provider = CGDataProvider(url: fontURL as CFURL),
  let graphicsFont = CGFont(provider)
else { fail("cannot load \(fontURL.path)") }
let font = CTFontCreateWithGraphicsFont(graphicsFont, wordmarkSize, nil, nil)
let line = CTLineCreateWithAttributedString(
  NSAttributedString(string: "OPAX", attributes: [kCTFontAttributeName as NSAttributedString.Key: font]))
let glyphPath = CGMutablePath()
for run in CTLineGetGlyphRuns(line) as! [CTRun] {
  let count = CTRunGetGlyphCount(run)
  var glyphs = [CGGlyph](repeating: 0, count: count)
  var positions = [CGPoint](repeating: .zero, count: count)
  CTRunGetGlyphs(run, CFRange(location: 0, length: count), &glyphs)
  CTRunGetPositions(run, CFRange(location: 0, length: count), &positions)
  for index in 0..<count {
    guard let outline = CTFontCreatePathForGlyph(font, glyphs[index], nil) else { continue }
    glyphPath.addPath(
      outline, transform: CGAffineTransform(translationX: positions[index].x, y: positions[index].y))
  }
}
// Font space is y-up from the baseline. Centre the ink horizontally and put
// the cap top `wordmarkGap` below the mark.
let ink0 = glyphPath.boundingBoxOfPath
let capTop = markTop + markSize + wordmarkGap
let place = CGAffineTransform(
  a: 1, b: 0, c: 0, d: -1,
  tx: (canvas.width - ink0.width) / 2 - ink0.minX,
  ty: capTop + ink0.maxY)
var wordmarkD = ""
glyphPath.applyWithBlock { element in
  let e = element.pointee
  func p(_ i: Int) -> String {
    let point = e.points[i].applying(place)
    return "\(n(point.x)) \(n(point.y))"
  }
  switch e.type {
  case .moveToPoint: wordmarkD += "M" + p(0)
  case .addLineToPoint: wordmarkD += "L" + p(0)
  case .addQuadCurveToPoint: wordmarkD += "Q" + p(0) + " " + p(1)
  case .addCurveToPoint: wordmarkD += "C" + p(0) + " " + p(1) + " " + p(2)
  case .closeSubpath: wordmarkD += "Z"
  @unknown default: fail("unknown path element")
  }
}
let wordmarkBox = ink0.applying(place)

// MARK: SVG sources

func svg(_ body: [String], width: CGFloat, height: CGFloat) -> String {
  ([
    "<svg xmlns=\"http://www.w3.org/2000/svg\" width=\"\(n(width))\" height=\"\(n(height))\" viewBox=\"0 0 \(n(width)) \(n(height))\">"
  ] + body.map { "  " + $0 } + ["</svg>", ""]).joined(separator: "\n")
}
let square =
  "<rect x=\"\(n(markX))\" y=\"\(n(markTop))\" width=\"\(n(markSize))\" height=\"\(n(markSize))\" rx=\"\(n(4 * unit))\" fill=\"\(navy)\"/>"
let star = "<path fill=\"\(gold)\" d=\"\(starPath)\"/>"
let sources: [(name: String, text: String)] = [
  // Light: the full mark and ink wordmark, on paper (the launch background).
  ("splash", svg([square, star, "<path fill=\"\(ink)\" d=\"\(wordmarkD)\"/>"], width: canvas.width, height: canvas.height)),
  // Dark: the ground is navy, so the star stands alone and the wordmark is paper.
  ("splash-dark", svg([star, "<path fill=\"\(paper)\" d=\"\(wordmarkD)\"/>"], width: canvas.width, height: canvas.height)),
  // The mark alone, for the welcome tour's masthead.
  (
    "mark",
    svg(
      [
        "<rect x=\"0\" y=\"0\" width=\"24\" height=\"24\" rx=\"4\" fill=\"\(navy)\"/>",
        "<path fill=\"\(gold)\" d=\"M" + starPoints.map { "\(n($0.x + 2)) \(n($0.y + 2))" }.joined(separator: "L") + "Z\"/>",
      ], width: 24, height: 24)
  ),
]
try? FileManager.default.createDirectory(at: out, withIntermediateDirectories: true)
for source in sources {
  try! source.text.write(to: out.appendingPathComponent("\(source.name).svg"), atomically: true, encoding: .utf8)
}

// MARK: PNGs, rendered from the SVG files

/// The subset these SVGs use: <rect x y width height rx fill> and
/// <path fill d> with absolute M, L, Q, C and Z. Anything else fails.
func render(svgNamed name: String, width points: CGFloat, scale: Int, to file: String) {
  let text = try! String(contentsOf: out.appendingPathComponent("\(name).svg"), encoding: .utf8)
  func attribute(_ key: String, in tag: String) -> String? {
    guard let range = tag.range(of: " \(key)=\"[^\"]*\"", options: .regularExpression) else { return nil }
    return String(tag[range].dropFirst(key.count + 3).dropLast())
  }
  let svgTag = String(text[text.range(of: "<svg[^>]*>", options: .regularExpression)!])
  let viewWidth = CGFloat(Double(attribute("width", in: svgTag)!)!)
  let viewHeight = CGFloat(Double(attribute("height", in: svgTag)!)!)
  let factor = points / viewWidth * CGFloat(scale)
  let pixelWidth = Int((viewWidth * factor).rounded())
  let pixelHeight = Int((viewHeight * factor).rounded())
  guard
    let context = CGContext(
      data: nil, width: pixelWidth, height: pixelHeight, bitsPerComponent: 8, bytesPerRow: 0,
      space: CGColorSpace(name: CGColorSpace.sRGB)!,
      bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue)
  else { fail("no bitmap context") }
  context.translateBy(x: 0, y: CGFloat(pixelHeight))
  context.scaleBy(x: factor, y: -factor)
  context.setShouldAntialias(true)
  func color(_ hex: String) -> CGColor {
    let value = UInt32(hex.dropFirst(), radix: 16)!
    return CGColor(
      srgbRed: CGFloat((value >> 16) & 0xFF) / 255, green: CGFloat((value >> 8) & 0xFF) / 255,
      blue: CGFloat(value & 0xFF) / 255, alpha: 1)
  }
  let tagPattern = try! NSRegularExpression(pattern: "<(rect|path)[^>]*/>")
  for match in tagPattern.matches(in: text, range: NSRange(text.startIndex..., in: text)) {
    let tag = String(text[Range(match.range, in: text)!])
    let path = CGMutablePath()
    if tag.hasPrefix("<rect") {
      let value = { (key: String) in CGFloat(Double(attribute(key, in: tag) ?? "0")!) }
      path.addRoundedRect(
        in: CGRect(x: value("x"), y: value("y"), width: value("width"), height: value("height")),
        cornerWidth: value("rx"), cornerHeight: value("rx"))
    } else {
      var command: Character = "M"
      var numbers: [CGFloat] = []
      func flush() {
        let need: [Character: Int] = ["M": 2, "L": 2, "Q": 4, "C": 6, "Z": 0]
        guard let count = need[command] else { fail("unsupported path command \(command)") }
        if count == 0 { path.closeSubpath(); return }
        if numbers.count != count { fail("\(name).svg: \(command) needs \(count) numbers") }
        let p = stride(from: 0, to: count, by: 2).map { CGPoint(x: numbers[$0], y: numbers[$0 + 1]) }
        switch command {
        case "M": path.move(to: p[0])
        case "L": path.addLine(to: p[0])
        case "Q": path.addQuadCurve(to: p[1], control: p[0])
        default: path.addCurve(to: p[2], control1: p[0], control2: p[1])
        }
      }
      var token = ""
      for character in attribute("d", in: tag)! + "M" {
        if "MLQCZ".contains(character) {
          if !token.isEmpty || command == "Z" {
            numbers = token.split(separator: " ").map { CGFloat(Double($0)!) }
            flush()
          }
          command = character
          token = ""
        } else {
          token.append(character)
        }
      }
    }
    context.addPath(path)
    context.setFillColor(color(attribute("fill", in: tag)!))
    context.fillPath()
  }
  let image = context.makeImage()!
  let url = out.appendingPathComponent(file)
  let destination = CGImageDestinationCreateWithURL(url as CFURL, UTType.png.identifier as CFString, 1, nil)!
  CGImageDestinationAddImage(destination, image, nil)
  if !CGImageDestinationFinalize(destination) { fail("cannot write \(url.path)") }
  print("\(file) \(pixelWidth)x\(pixelHeight)")
}

for scale in 1...3 {
  let suffix = scale == 1 ? "" : "@\(scale)x"
  // React Native picks the screen's scale; the launch screen plugin resizes
  // its own copies from the @3x files.
  render(svgNamed: "splash", width: canvas.width, scale: scale, to: "splash\(suffix).png")
  render(svgNamed: "mark", width: 28, scale: scale, to: "mark\(suffix).png")
}
render(svgNamed: "splash-dark", width: canvas.width, scale: 3, to: "splash-dark@3x.png")
print(
  "wordmark ink \(n(wordmarkBox.minX)),\(n(wordmarkBox.minY)) \(n(wordmarkBox.width))x\(n(wordmarkBox.height)) on a \(n(canvas.width))x\(n(canvas.height)) canvas"
)
