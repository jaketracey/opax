// Recognises the text lines drawn in a screenshot with Apple's Vision
// framework and prints them as JSON, in image pixels from the top left:
//   {"width":1170,"height":2532,"lines":[{"text":"Today","left":…,"top":…,
//    "width":…,"height":…}]}
// Journey checks use it to prove what was drawn, not what the accessibility
// tree claims. scripts/first-line-check.ts compiles and runs it.
import AppKit
import Foundation
import Vision

guard CommandLine.arguments.count == 2 else {
  FileHandle.standardError.write("Usage: ocr-lines <image.png>\n".data(using: .utf8)!)
  exit(2)
}
let path = CommandLine.arguments[1]
guard let image = NSImage(contentsOfFile: path),
  let cgImage = image.cgImage(forProposedRect: nil, context: nil, hints: nil)
else {
  FileHandle.standardError.write("Cannot read image: \(path)\n".data(using: .utf8)!)
  exit(2)
}
let request = VNRecognizeTextRequest()
request.recognitionLevel = .accurate
// Report the glyphs as drawn: no dictionary correction of names or numbers.
request.usesLanguageCorrection = false
request.recognitionLanguages = ["en-AU", "en-US"]
do {
  try VNImageRequestHandler(cgImage: cgImage).perform([request])
} catch {
  FileHandle.standardError.write("Text recognition failed: \(error)\n".data(using: .utf8)!)
  exit(1)
}
let width = Double(cgImage.width)
let height = Double(cgImage.height)
var lines: [[String: Any]] = []
for observation in request.results ?? [] {
  guard let candidate = observation.topCandidates(1).first else { continue }
  // Vision's boxes are normalised with the origin at the bottom left.
  let box = observation.boundingBox
  lines.append([
    "text": candidate.string,
    "left": box.minX * width,
    "top": (1 - box.maxY) * height,
    "width": box.width * width,
    "height": box.height * height,
  ])
}
let json = try JSONSerialization.data(
  withJSONObject: ["width": width, "height": height, "lines": lines],
  options: [.sortedKeys])
print(String(data: json, encoding: .utf8)!)
