"""Page text for scanned agency reports, from on-device OCR (nothing is sent off the Mac).

  python -m parli.ingest.agency_ocr render  --id <report_id> [--dpi 300]
  python -m parli.ingest.agency_ocr vision  --id <report_id>     # Apple Vision, scripts/ocr/vision_ocr.swift
  python -m parli.ingest.agency_ocr rows    --id <report_id>     # Vision lines -> reading-order rows

Page images and raw OCR output live beside the source PDF in the cache
(``~/.cache/autoresearch/agency-reports/ocr/<sha256>/``). ``rows`` writes
``data/agency-reports/ocr/<report_id>.json``: per page, the Vision lines regrouped into
rows (left to right, top to bottom) so a table row reads as its label followed by its
figures (``rows``), and in column reading order for two-column pages (``text``); a quote
may come from either rendering. ``agency_reports.page_text`` falls back to that file when the PDF has no text
layer, so OCR figures go through the same verbatim checks; each such fact carries
``extraction: {"method": "ocr", ...}``.
"""
from __future__ import annotations

import argparse
import json
import subprocess
import sys
from pathlib import Path

from parli.ingest import agency_reports as ar

OCR_CACHE = ar.CACHE / "ocr"
OUT = ar.DATA / "ocr"
SWIFT = ar.ROOT / "scripts" / "ocr" / "vision_ocr.swift"


def row_of(rid):
    row = ar.intake_rows().get(rid)
    if not row:
        raise SystemExit(f"unknown report id {rid}")
    return row


def render(args):
    row = row_of(args.id)
    d = OCR_CACHE / row["sha256"]
    d.mkdir(parents=True, exist_ok=True)
    subprocess.run(["pdftoppm", "-r", str(args.dpi), "-png", str(ar.CACHE / "files" / f"{row['sha256']}.pdf"), str(d / "page")], check=True)
    print(json.dumps({"images": len(list(d.glob("page-*.png"))), "dir": str(d)}))
    return 0


def vision(args):
    row = row_of(args.id)
    d = OCR_CACHE / row["sha256"]
    images = sorted(d.glob("page-*.png"), key=lambda p: int(p.stem.split("-")[1]))
    subprocess.run(["swift", str(SWIFT), str(d / "vision.json"), *map(str, images)], check=True)
    return 0


def rows(lines, tol=0.5):
    """Group Vision lines into rows: lines whose vertical centres sit within ``tol`` of a line height share a row."""
    items = sorted(lines, key=lambda l: -(l["box"][1] + l["box"][3] / 2))
    out = []
    for l in items:
        cy, h = l["box"][1] + l["box"][3] / 2, l["box"][3]
        if out and abs(out[-1]["cy"] - cy) <= tol * max(h, out[-1]["h"]):
            out[-1]["items"].append(l)
        else:
            out.append({"cy": cy, "h": h, "items": [l]})
    return [" ".join(i["text"] for i in sorted(r["items"], key=lambda l: l["box"][0])) for r in out]


def columns(lines, gutter=(0.48, 0.52)):
    """Reading order for two-column pages: bands split at lines that cross the gutter; in each
    band the left column's rows come before the right column's."""
    left, right = gutter
    items = sorted(lines, key=lambda l: -(l["box"][1] + l["box"][3]))
    out, band = [], []

    def flush():
        if band:
            out.extend(rows([l for l in band if l["box"][0] + l["box"][2] <= right]))
            out.extend(rows([l for l in band if l["box"][0] + l["box"][2] > right]))
            band.clear()

    for l in items:
        x, w = l["box"][0], l["box"][2]
        if x < left and x + w > right:  # spans the gutter: a heading or a full-width line
            flush()
            out.extend(rows([l]))
        else:
            band.append(l)
    flush()
    return out


def build(args):
    row = row_of(args.id)
    raw = json.loads((OCR_CACHE / row["sha256"] / "vision.json").read_text())
    raw.sort(key=lambda p: int(p["image"].split("-")[1].split(".")[0]))
    pages = []
    for p in raw:
        conf = [l["confidence"] for l in p["lines"]]
        pages.append({"page": int(p["image"].split("-")[1].split(".")[0]), "text": "\n".join(columns(p["lines"])),
                      "rows": "\n".join(rows(p["lines"])),
                      "lines": len(conf), "min_confidence": round(min(conf), 3) if conf else None})
    OUT.mkdir(parents=True, exist_ok=True)
    path = OUT / f"{args.id}.json"
    path.write_text(json.dumps({"report_id": args.id, "sha256": row["sha256"], "engine": "Apple Vision VNRecognizeTextRequest (accurate, en-US, no language correction), on device",
                                "dpi": args.dpi, "pages": pages}, ensure_ascii=False, indent=1) + "\n")
    print(json.dumps({"ocr": str(path.relative_to(ar.ROOT)), "pages": len(pages), "lines": sum(p["lines"] for p in pages)}))
    return 0


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    sub = ap.add_subparsers(dest="cmd", required=True)
    for name in ("render", "vision", "rows"):
        p = sub.add_parser(name)
        p.add_argument("--id", required=True)
        p.add_argument("--dpi", type=int, default=300)
    args = ap.parse_args(argv)
    return {"render": render, "vision": vision, "rows": build}[args.cmd](args)


if __name__ == "__main__":
    sys.exit(main())
