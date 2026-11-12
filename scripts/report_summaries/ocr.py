#!/usr/bin/env python3
"""On-device OCR for report PDFs that have no usable text layer (scans, broken glyph maps).

Renders each page with PyMuPDF and reads it with Apple Vision (scripts/ocr/vision_ocr.swift),
so nothing leaves the Mac and nothing is paid for. Writes one JSON list of page strings
(index 0 = PDF page 1) to ~/.cache/autoresearch/report-summaries/ocr/<sha256>.json, which
prepare.py uses for a pack when the report's own text cache is blank. The file's sha256 is
checked before reading, so the OCR text always belongs to the summarised file.

  python3 scripts/report_summaries/ocr.py --pdf FILE --sha256 HASH [--dpi 200] [--batch 24]
"""
from __future__ import annotations

import argparse
import hashlib
import json
import os
import subprocess
import sys
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
SWIFT = ROOT / "scripts" / "ocr" / "vision_ocr.swift"
OCR_TEXT = Path(os.environ.get("OPAX_SUMMARY_OCR", str(Path("~/.cache/autoresearch/report-summaries/ocr").expanduser())))
BINARY = OCR_TEXT / "bin" / "vision_ocr"


def vision_binary() -> Path:
    """Compile the Vision helper once; the script itself is the source of truth."""
    if not BINARY.exists() or BINARY.stat().st_mtime < SWIFT.stat().st_mtime:
        BINARY.parent.mkdir(parents=True, exist_ok=True)
        subprocess.run(["swiftc", "-O", str(SWIFT), "-o", str(BINARY)], check=True)
    return BINARY


def page_text(page: dict) -> str:
    # Vision returns lines in reading order; keep it, one line per recognised line.
    return "\n".join(line["text"] for line in page.get("lines", []))


def ocr(pdf: Path, sha256: str, dpi: int = 200, batch: int = 24) -> Path:
    import pymupdf

    data = pdf.read_bytes()
    if hashlib.sha256(data).hexdigest() != sha256:
        raise SystemExit(f"{pdf}: sha256 does not match {sha256}")
    out = OCR_TEXT / f"{sha256}.json"
    if out.exists():
        return out
    binary = vision_binary()
    doc = pymupdf.open(stream=data, filetype="pdf")
    pages: list[str] = []
    with tempfile.TemporaryDirectory() as tmp:
        for start in range(0, doc.page_count, batch):
            images = []
            for n in range(start, min(start + batch, doc.page_count)):
                path = Path(tmp) / f"p{n + 1:05d}.png"
                doc[n].get_pixmap(dpi=dpi).save(str(path))
                images.append(str(path))
            result = Path(tmp) / f"batch-{start}.json"
            subprocess.run([str(binary), str(result), *images], check=True, stderr=subprocess.DEVNULL)
            pages.extend(page_text(p) for p in json.loads(result.read_text()))
            for path in images:
                os.remove(path)
            print(f"{pdf.name}: {len(pages)}/{doc.page_count} pages", file=sys.stderr, flush=True)
    OCR_TEXT.mkdir(parents=True, exist_ok=True)
    tmp_out = out.with_suffix(".tmp")
    tmp_out.write_text(json.dumps({"sha256": sha256, "engine": "Apple Vision (on device)", "dpi": dpi, "pages": pages}), encoding="utf-8")
    os.replace(tmp_out, out)
    return out


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("--pdf", required=True, type=Path)
    ap.add_argument("--sha256", required=True)
    ap.add_argument("--dpi", type=int, default=200)
    ap.add_argument("--batch", type=int, default=24)
    args = ap.parse_args()
    print(ocr(args.pdf, args.sha256, args.dpi, args.batch))
    return 0


if __name__ == "__main__":
    sys.exit(main())
