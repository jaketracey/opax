#!/usr/bin/env python3
"""Bring a published discovery.json up to the current export's donation labels and methodology.

    python3 scripts/rewrite_discovery_labels.py portal/public/discovery.json

The discovery export needs the corpus database and runs in the monthly refresh group.
This rewrites a committed snapshot without it. Each donation label is read back into
its parts and rebuilt with export_discovery.donation_label, which drops the
"· local record N" tail older exports wrote (N was OPAX's own row number), and the
methodology becomes export_discovery.METHODOLOGY. Contract labels, record_id and
everything else are left alone. A label it cannot rebuild exactly stops the run before
anything is written. Running it again changes nothing, and the next export of the same
rows writes the same labels.
"""
import argparse
import importlib.util
import json
from pathlib import Path
import re
import sys

# "<donor> → <recipient>: $1,803.00 · FY 2024-25 · AEC annual receipt[ · local record 643745]"
DONATION_LABEL_RE = re.compile(
    r"(?P<donor>.+) → (?P<recipient>.+): \$(?P<amount>\d{1,3}(?:,\d{3})*\.\d{2})"
    r" · FY (?P<year>.+) · AEC annual receipt(?P<tail> · local record (?P<row>\d+))?")


def _export():
    path = Path(__file__).resolve().parent / "export_discovery.py"
    spec = importlib.util.spec_from_file_location("export_discovery", path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def rewrite(data, export=None):
    """Rewrite data in place. Returns (donation labels changed, methodology changed)."""
    export = export or _export()
    labels = 0
    for signal in data["signals"]:
        for evidence in signal["evidence"]:
            if evidence["table"] != "donations":
                continue
            old = evidence["label"]
            match = DONATION_LABEL_RE.fullmatch(old)
            if not match or (match["row"] and match["row"] != evidence["record_id"]):
                raise ValueError(f"unrecognised donation label: {old!r}")
            label = export.donation_label(match["donor"], match["recipient"],
                                          float(match["amount"].replace(",", "")),
                                          None if match["year"] == "unknown" else match["year"])
            if label != old.removesuffix(match["tail"] or ""):
                raise ValueError(f"the export would write {label!r} for {old!r}")
            if label != old:
                evidence["label"] = label
                labels += 1
    methodology = data["methodology"] != export.METHODOLOGY
    data["methodology"] = list(export.METHODOLOGY)
    return labels, methodology


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("path", type=Path, help="discovery.json to rewrite in place")
    args = parser.parse_args(argv)
    export = _export()
    data = json.loads(args.path.read_text())
    labels, methodology = rewrite(data, export)
    temporary = args.path.with_suffix(args.path.suffix + ".tmp")
    temporary.write_text(export.dump(data))
    temporary.replace(args.path)
    print(f"Rewrote {labels} donation labels{' and the methodology' if methodology else ''} in {args.path}",
          file=sys.stderr)


if __name__ == "__main__":
    main()
