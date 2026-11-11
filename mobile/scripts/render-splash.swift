// Renders the launch artwork: `swift scripts/render-splash.swift` from mobile/.
//
// 1. Builds the SVG sources in assets/splash/: the gold seven-point star from
//    portal/public/favicon.svg (path copied unchanged) and the "OPAX"
//    wordmark, outlined from the bundled Merriweather Bold, so the SVGs need
//    no font to render. The ground is navy (app.config.ts paints it), so the
//    mark's navy square is not drawn: the star stands alone.
// 2. Renders every PNG from those SVG files with Core Graphics.
// 3. Writes src/launch/geometry.generated.ts: where each glyph of the wordmark
//    sits on the canvas and the advances of the full name's words, so the
//    animated splash (src/launch/LaunchHandoff.tsx) starts from the same
//    pixels the native splash shows and the two can never drift apart.
//
// macOS frameworks only: no Homebrew tools, npm packages or network. The
// output is deterministic; rerun after changing the mark, the font or the
// layout below, then commit the SVGs, PNGs and the generated file together.
import CoreGraphics
import CoreText
import Foundation
import ImageIO
import UniformTypeIdentifiers

let root = URL(fileURLWithPath: FileManager.default.currentDirectoryPath)
let out = root.appendingPathComponent("assets/splash")
let generated = root.appendingPathComponent("src/launch/geometry.generated.ts")
let favicon = root.appendingPathComponent("../portal/public/favicon.svg")
let fontURL = root.appendingPathComponent("assets/fonts/Merriweather-Bold.ttf")

// Palette roles (src/design/palette.ts). The launch field is brand artwork:
// navy in both appearances, like the icon.
let navy = "#142A43"
let gold = "#D9A84A"  // bronzeBright: the mark's star
let paper = "#FAF9F6"

// The lockup, in points, on a 200 x 120 canvas: the 60pt mark above the
// wordmark, centred. The launch screen centres the canvas, so the lockup's
// centre is the screen's. LaunchHandoff (src/launch/) draws the same layers.
let canvas = CGSize(width: 200, height: 120)
let markSize: CGFloat = 60
let markTop: CGFloat = 6
let wordmarkSize: CGFloat = 30
let wordmarkGap: CGFloat = 16  // mark bottom to the wordmark's cap top

// The full name, as the README and opax.com.au write it. The X of eXchange is
// the wordmark's X, so each line of the name carries one letter of the mark.
let words = ["Open", "Parliamentary", "Accountability", "eXchange"]

func fail(_ message: String) -> Never {
  FileHandle.standardError.write(Data("render-splash: \(message)\n".utf8))
  exit(1)
}

func n(_ value: CGFloat) -> String {
  let rounded = (value * 1000).rounded() / 1000
  var text = String(format: "%.3f", Double(rounded))
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
func starPath(_ place: (CGPoint) -> CGPoint) -> String {
  "M" + starPoints.map { "\(n(place($0).x)) \(n(place($0).y))" }.joined(separator: "L") + "Z"
}

// MARK: The wordmark

guard
  let provider = CGDataProvider(url: fontURL as CFURL),
  let graphicsFont = CGFont(provider)
else { fail("cannot load \(fontURL.path)") }
let font = CTFontCreateWithGraphicsFont(graphicsFont, wordmarkSize, nil, nil)
func line(_ text: String, _ font: CTFont) -> CTLine {
  CTLineCreateWithAttributedString(
    NSAttributedString(
      string: text, attributes: [kCTFontAttributeName as NSAttributedString.Key: font]))
}
let wordmarkLine = line("OPAX", font)
let glyphPath = CGMutablePath()
var penX: [CGFloat] = []
for run in CTLineGetGlyphRuns(wordmarkLine) as! [CTRun] {
  let count = CTRunGetGlyphCount(run)
  var glyphs = [CGGlyph](repeating: 0, count: count)
  var positions = [CGPoint](repeating: .zero, count: count)
  CTRunGetGlyphs(run, CFRange(location: 0, length: count), &glyphs)
  CTRunGetPositions(run, CFRange(location: 0, length: count), &positions)
  for index in 0..<count {
    penX.append(positions[index].x)
    guard let outline = CTFontCreatePathForGlyph(font, glyphs[index], nil) else { continue }
    glyphPath.addPath(
      outline, transform: CGAffineTransform(translationX: positions[index].x, y: positions[index].y))
  }
}
if penX.count != 4 { fail("the wordmark laid out as \(penX.count) glyphs, not four") }
// Font space is y-up from the baseline. Centre the ink horizontally and put
// the cap top `wordmarkGap` below the mark.
let ink0 = glyphPath.boundingBoxOfPath
let capTop = markTop + markSize + wordmarkGap
let baseline = capTop + ink0.maxY
let penOrigin = (canvas.width - ink0.width) / 2 - ink0.minX
let place = CGAffineTransform(a: 1, b: 0, c: 0, d: -1, tx: penOrigin, ty: baseline)
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

// MARK: Name metrics, in ems (size 1), for the animated name

let em = CTFontCreateWithGraphicsFont(graphicsFont, 1, nil, nil)
struct Word {
  let text: String
  /// Pen x of each glyph as CoreText lays the word out (kerning applied).
  let pens: [CGFloat]
  let advance: CGFloat
}
func measure(_ text: String) -> Word {
  let l = line(text, em)
  var pens: [CGFloat] = []
  for run in CTLineGetGlyphRuns(l) as! [CTRun] {
    let count = CTRunGetGlyphCount(run)
    var positions = [CGPoint](repeating: .zero, count: count)
    CTRunGetPositions(run, CFRange(location: 0, length: count), &positions)
    pens += positions.map { $0.x }
  }
  if pens.count != text.count { fail("'\(text)' laid out as \(pens.count) glyphs") }
  return Word(text: text, pens: pens, advance: CTLineGetTypographicBounds(l, nil, nil, nil))
}
let measured = words.map(measure)

// MARK: SVG sources

func svg(_ body: [String], width: CGFloat, height: CGFloat) -> String {
  ([
    "<svg xmlns=\"http://www.w3.org/2000/svg\" width=\"\(n(width))\" height=\"\(n(height))\" viewBox=\"0 0 \(n(width)) \(n(height))\">"
  ] + body.map { "  " + $0 } + ["</svg>", ""]).joined(separator: "\n")
}
let star = "<path fill=\"\(gold)\" d=\"\(starPath(markPoint))\"/>"
let wordmark = "<path fill=\"\(paper)\" d=\"\(wordmarkD)\"/>"
let sources: [(name: String, text: String)] = [
  // The native launch image: the star and the paper wordmark on the navy
  // ground the launch screen paints. One image for both appearances.
  ("splash", svg([star, wordmark], width: canvas.width, height: canvas.height)),
  // The star alone on the mark's 60pt square, for the animated splash: it
  // scales about the square's centre, as the icon would.
  (
    "star",
    svg(
      [
        "<path fill=\"\(gold)\" d=\"\(starPath { CGPoint(x: ($0.x + 2) * unit, y: ($0.y + 2) * unit) })\"/>"
      ], width: markSize, height: markSize)
  ),
  // The wordmark alone on the same canvas, for the animated splash's first
  // frame; the live letters replace it as they start to move.
  ("wordmark", svg([wordmark], width: canvas.width, height: canvas.height)),
  // The mark alone (square and star), for the welcome's masthead.
  (
    "mark",
    svg(
      [
        "<rect x=\"0\" y=\"0\" width=\"24\" height=\"24\" rx=\"4\" fill=\"\(navy)\"/>",
        "<path fill=\"\(gold)\" d=\"\(starPath { CGPoint(x: $0.x + 2, y: $0.y + 2) })\"/>",
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

// The launch screen plugin resizes its own 1x and 2x copies from the @3x
// file. React Native picks the screen's scale for the animated layers.
render(svgNamed: "splash", width: canvas.width, scale: 3, to: "splash@3x.png")
for scale in 1...3 {
  let suffix = scale == 1 ? "" : "@\(scale)x"
  render(svgNamed: "star", width: markSize, scale: scale, to: "star\(suffix).png")
  render(svgNamed: "wordmark", width: canvas.width, scale: scale, to: "wordmark\(suffix).png")
  render(svgNamed: "mark", width: 28, scale: scale, to: "mark\(suffix).png")
}
for stale in ["splash.png", "splash@2x.png", "splash-dark.svg", "splash-dark@3x.png"] {
  try? FileManager.default.removeItem(at: out.appendingPathComponent(stale))
}

// MARK: The generated geometry

var ts = """
  // Launch artwork geometry. Generated by scripts/render-splash.swift from the
  // same layout and font as assets/splash/*.svg; never edit by hand.
  //
  // Canvas coordinates are points on the 200 x 120 launch image, y down. Em
  // values multiply by a font size. The wordmark pens are where CoreText puts
  // each glyph of "OPAX" at \(n(wordmarkSize))pt with kerning, so four separate
  // glyphs drawn at these pens reproduce the wordmark image exactly.

  export const splashGeometry = {
    canvas: { width: \(n(canvas.width)), height: \(n(canvas.height)) },
    /** The star's 60pt square (the mark without its navy ground). */
    mark: { x: \(n(markX)), y: \(n(markTop)), size: \(n(markSize)) },
    wordmark: {
      fontSize: \(n(wordmarkSize)),
      /** Baseline of the wordmark on the canvas. */
      baseline: \(n(baseline)),
      /** Pen x of O, P, A and X on the canvas. */
      pens: [\(penX.map { n($0 + penOrigin) }.joined(separator: ", "))],
      ink: { x: \(n(wordmarkBox.minX)), y: \(n(wordmarkBox.minY)), width: \(n(wordmarkBox.width)), height: \(n(wordmarkBox.height)) },
    },
    /** Merriweather Bold, in ems. */
    font: {
      ascent: \(n(CTFontGetAscent(em))),
      descent: \(n(CTFontGetDescent(em))),
      capHeight: \(n(CTFontGetCapHeight(em))),
    },
    /** The full name, one word a line; `pens` are each glyph's pen x in ems. */
    words: [

  """
for word in measured {
  ts += "    { text: '\(word.text)', advance: \(n(word.advance)), pens: [\(word.pens.map { n($0) }.joined(separator: ", "))] },\n"
}
ts += """
    ],
  } as const;

  """
try! ts.write(to: generated, atomically: true, encoding: .utf8)
// The repository's prettier, so the generated file reads like the rest of
// src/. Rendering never needs it: a missing node_modules only skips this.
let prettier = Process()
prettier.executableURL = root.appendingPathComponent("node_modules/.bin/prettier")
prettier.arguments = ["--log-level", "warn", "--write", generated.path]
if (try? prettier.run()) != nil {
  prettier.waitUntilExit()
  if prettier.terminationStatus != 0 { print("warning: prettier failed on \(generated.lastPathComponent)") }
} else {
  print("warning: node_modules/.bin/prettier not found; format \(generated.lastPathComponent) by hand")
}
print("wordmark ink \(n(wordmarkBox.minX)),\(n(wordmarkBox.minY)) \(n(wordmarkBox.width))x\(n(wordmarkBox.height)); baseline \(n(baseline)); pens \(penX.map { n($0 + penOrigin) })")
print("wrote \(generated.path)")
