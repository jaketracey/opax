// On-device OCR with Apple's Vision framework (nothing leaves the Mac).
//   swift scripts/ocr/vision_ocr.swift <out.json> <page image>...
// Writes one entry per image: every recognised text line with its confidence and
// normalised bounding box (origin bottom-left, as Vision reports it).
import Foundation
import Vision

struct Line: Codable { let text: String; let confidence: Float; let box: [Double] }
struct Page: Codable { let image: String; let width: Int; let height: Int; let lines: [Line] }

let args = CommandLine.arguments
guard args.count >= 3 else { fputs("usage: vision_ocr <out.json> <image>...\n", stderr); exit(2) }
var pages: [Page] = []
for path in args.dropFirst(2) {
    let url = URL(fileURLWithPath: path)
    guard let src = CGImageSourceCreateWithURL(url as CFURL, nil),
          let img = CGImageSourceCreateImageAtIndex(src, 0, nil) else { fputs("cannot read \(path)\n", stderr); exit(1) }
    let req = VNRecognizeTextRequest()
    req.recognitionLevel = .accurate
    req.recognitionLanguages = ["en-US"]   // Vision has no en-AU model; en-US is its English
    req.usesLanguageCorrection = false     // keep figures exactly as read, no dictionary rewriting
    try VNImageRequestHandler(cgImage: img, options: [:]).perform([req])
    let lines = (req.results ?? []).compactMap { obs -> Line? in
        guard let top = obs.topCandidates(1).first else { return nil }
        let b = obs.boundingBox
        return Line(text: top.string, confidence: top.confidence, box: [b.origin.x, b.origin.y, b.width, b.height])
    }
    pages.append(Page(image: url.lastPathComponent, width: img.width, height: img.height, lines: lines))
    fputs("\(url.lastPathComponent): \(lines.count) lines\n", stderr)
}
let enc = JSONEncoder(); enc.outputFormatting = [.prettyPrinted, .sortedKeys]
try enc.encode(pages).write(to: URL(fileURLWithPath: args[1]))
