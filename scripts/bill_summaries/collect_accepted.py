#!/usr/bin/env python3
"""Gather the summaries that passed both gates into one directory for storage.

    python3 collect_accepted.py --root <pack root> [--wave w1]

A summary is accepted when, in its batch, `<key>.check.json` says ok,
`<key>.review.json` says accept, and the reviewer's model is not the writer's
model (the check must be independent). Accepted files are copied to
`<root>/accepted/<key>.summary.json` with the review attached under
`summary_json.review.independent_check`, and `<root>/accepted/manifest.json`
lists them with batch, writer and reviewer. Rejections and bills still waiting
are listed in `<root>/accepted/pending.json` for the next round.
"""
from __future__ import annotations

import argparse
import datetime as dt
import json
import sys
from pathlib import Path


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--root", required=True)
    ap.add_argument("--wave")
    args = ap.parse_args()
    root = Path(args.root)
    index = json.loads((root / "batches" / "index.json").read_text())
    acc_dir = root / "accepted"
    acc_dir.mkdir(exist_ok=True)
    manifest_path = acc_dir / "manifest.json"
    manifest = json.loads(manifest_path.read_text()) if manifest_path.exists() else {}
    pending: list[dict] = []
    new = 0
    held_path = root / "batches" / "_fixround" / "held.txt"
    held = {}
    if held_path.exists():
        for line in held_path.read_text().splitlines():
            if line.strip():
                k, _, why = line.strip().partition(" ")
                held[k] = why
    for name, b in sorted(index["batches"].items()):
        if args.wave and b["wave"] != args.wave:
            continue
        d = root / "batches" / name
        for key in b["keys"]:
            if key in manifest:
                continue
            if key in held:
                pending.append({"bill_key": key, "batch": name, "state": "held", "reason": held[key]})
                continue
            spath = d / "out" / f"{key}.summary.json"
            cpath = d / "out" / f"{key}.check.json"
            rpath = d / "reviews" / f"{key}.review.json"
            if not spath.exists():
                pending.append({"bill_key": key, "batch": name, "state": "no_draft"})
                continue
            check = json.loads(cpath.read_text()) if cpath.exists() else None
            if not check or not check.get("ok"):
                pending.append({"bill_key": key, "batch": name, "state": "check_failed",
                                "fails": (check or {}).get("fails")})
                continue
            if not rpath.exists():
                pending.append({"bill_key": key, "batch": name, "state": "unreviewed"})
                continue
            review = json.loads(rpath.read_text())
            doc = json.loads(spath.read_text())
            # The check must come from a different lane; a different engine is preferred and recorded.
            if review.get("reviewer_lane") == name:
                pending.append({"bill_key": key, "batch": name, "state": "same_lane_review"})
                continue
            if review.get("verdict") != "accept":
                pending.append({"bill_key": key, "batch": name, "state": "rejected", "issues": review.get("issues")})
                continue
            # Publish only the version that was verified: a draft touched after its review waits for a re-check.
            if spath.stat().st_mtime > rpath.stat().st_mtime + 1:
                pending.append({"bill_key": key, "batch": name, "state": "modified_after_review"})
                continue
            # Politically sensitive bills get a second, neutrality-focused review; it must also accept.
            npath = root / "batches" / "_neutrality" / "reviews" / f"{key}.review.json"
            if npath.exists():
                nrev = json.loads(npath.read_text())
                if nrev.get("verdict") != "accept":
                    pending.append({"bill_key": key, "batch": name, "state": "neutrality_rejected", "issues": nrev.get("issues")})
                    continue
            doc["summary_json"]["review"]["independent_check"] = {
                "model": review.get("reviewer_model"), "provider": review.get("reviewer_provider"),
                "lane": review.get("reviewer_lane"), "cross_engine": review.get("reviewer_model") != doc.get("model"),
                "reviewed_at": review.get("reviewed_at"), "sections": review.get("sections_read"),
            }
            (acc_dir / f"{key}.summary.json").write_text(json.dumps(doc, ensure_ascii=False, indent=1), encoding="utf-8")
            manifest[key] = {"batch": name, "writer": doc.get("model"), "reviewer": review.get("reviewer_model"),
                             "reviewer_lane": review.get("reviewer_lane"),
                             "cross_engine": review.get("reviewer_model") != doc.get("model"),
                             "basis": doc.get("basis"), "confidence": doc["summary_json"].get("confidence"),
                             "accepted_at": dt.datetime.now(dt.timezone.utc).isoformat()}
            new += 1
    manifest_path.write_text(json.dumps(manifest, ensure_ascii=False, indent=1), encoding="utf-8")
    (acc_dir / "pending.json").write_text(json.dumps(pending, ensure_ascii=False, indent=1), encoding="utf-8")
    states: dict[str, int] = {}
    for p in pending:
        states[p["state"]] = states.get(p["state"], 0) + 1
    print(json.dumps({"accepted_total": len(manifest), "accepted_new": new, "pending": states}, indent=1))
    return 0


if __name__ == "__main__":
    sys.exit(main())
