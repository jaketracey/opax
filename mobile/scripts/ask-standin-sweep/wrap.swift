// The Ask starter row's text, modelled for the stand-in sweep (README.md).
//
// A rough model, not the app: the system font, the body role (17 pt on a
// 22 pt line), the word-safe steps down from the Dynamic Type sizes, and
// TextKit's own line breaking. A word breaks at spaces and at hyphens, and
// the type steps down until its widest part fits the line.
//
//   wrap <row width, pt> <full text size, pt>     questions on stdin
//
// Prints, for each question: the size it settles at, its lines, its height
// and the question, separated by tabs.
import AppKit

// The Dynamic Type sizes the body role takes, largest first, with the
// word-safe steps between them (each no more than 10% below the last).
let anchors: [CGFloat] = [53, 47, 40, 33, 28, 23, 21, 19, 17]
var sizes: [CGFloat] = []
for p in anchors + [11] {
  if let above = sizes.last {
    if above - p < 0.005 { continue }
    let steps = Int(ceil(log(p / above) / log(0.9) - 1e-9))
    if steps > 1 { for i in 1..<steps { sizes.append(above * pow(p / above, CGFloat(i) / CGFloat(steps))) } }
  }
  sizes.append(p)
}

func wordWidth(_ w: String, _ size: CGFloat) -> CGFloat {
  let f = NSFont.systemFont(ofSize: size)
  return (w as NSString).size(withAttributes: [.font: f]).width
}
func lines(_ s: String, _ size: CGFloat, _ width: CGFloat) -> Int {
  let f = NSFont.systemFont(ofSize: size)
  let storage = NSTextStorage(string: s, attributes: [.font: f])
  let lm = NSLayoutManager()
  let tc = NSTextContainer(size: NSSize(width: width, height: 1e7))
  tc.lineFragmentPadding = 0
  lm.addTextContainer(tc)
  storage.addLayoutManager(lm)
  lm.ensureLayout(for: tc)
  var n = 0
  var idx = 0
  let glyphs = lm.numberOfGlyphs
  while idx < glyphs {
    var r = NSRange()
    lm.lineFragmentRect(forGlyphAt: idx, effectiveRange: &r)
    n += 1
    idx = NSMaxRange(r)
  }
  return n
}
func settle(_ s: String, full: CGFloat, width: CGFloat) -> (CGFloat, Int, CGFloat) {
  let words = s.split(separator: " ").flatMap { $0.split(separator: "-", omittingEmptySubsequences: false).enumerated().map { (i, p) in String(p) } }
  for size in sizes where size <= full + 0.01 {
    if words.allSatisfy({ wordWidth($0, size) <= width }) {
      let n = lines(s, size, width)
      return (size, n, CGFloat(n) * size * 22 / 17)
    }
  }
  return (11, lines(s, 11, width), 0)
}

let args = CommandLine.arguments
let width = CGFloat(Double(args[1])!)
let full = CGFloat(Double(args[2])!)
var input: [String] = Array(args.dropFirst(3))
if input.isEmpty { while let l = readLine() { if !l.isEmpty { input.append(l) } } }
for s in input {
  let (size, n, h) = settle(s, full: full, width: width)
  print(String(format: "%.1f\t%d\t%.1f\t", size, n, h) + s)
}
