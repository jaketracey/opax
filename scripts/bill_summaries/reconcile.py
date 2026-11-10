#!/usr/bin/env python3
"""Per-key state of the bill-summaries pack, and the publish gate.

    python3 -I reconcile.py --root <pack root> [--json out.json] [--gate <dir>]

For every key in batches/index.json it reports the draft, checker, fact review,
fixes, the affected-line audit ledger, the neutrality review and whether the
bill is politically charged. `--gate <dir>` writes every key that clears all
gates into <dir> (a fresh directory), in the shape store_reviewed.py reads.

Gates (all must hold):
  draft and check.json ok; fact review accept, from another lane, newer than the draft;
  a key that was ever sent to a fixer carries the fixer's review note (revert guard);
  Codex-written drafts have an affected-line audit ledger entry (an audit rewrite
  makes the draft newer than its review, so it waits for a re-check);
  charged bills have a neutrality accept newer than the draft;
  not held; not already published (published/<wave>/manifest.json).
"""
from __future__ import annotations

import argparse
import datetime as dt
import json
import re
import sys
from pathlib import Path

FIX_MARK = re.compile(r"(Revised|Edited|corrected) after independent review", re.I)
CHARGED = re.compile(
    r"voice|referendum|constitution alteration|makarrata|first nations|treaty commission|truth-telling|"
    r"israel|gaza|palestin|hamas|"
    r"\bunion|industrial relations|fair work|building and construction|building industry|registered organisations|"
    r"ensuring integrity|secure jobs|right of entry|"
    r"climate|net zero|emission|carbon|nuclear|"
    r"migration|immigration|citizenship|asylum|refugee|border protection|deportation|"
    r"electoral|election|donation|"
    r"protest|hate|vilification|anti-semitism|antisemitism|"
    r"gambling|wagering|live export|live sheep|"
    r"assisted dying|euthanasia|territory rights|"
    r"religious discrimination|religious freedom|marriage|misinformation|abortion|"
    r"plebiscite|terroris|genocide|aboriginal|indigenous|robodebt|cashless",
    re.I)


def mtime(p: Path) -> float:
    return p.stat().st_mtime if p.exists() else 0.0


def load(p: Path):
    try:
        return json.loads(p.read_text())
    except Exception:
        return None


def fixer_keys(root: Path) -> set[str]:
    keys: set[str] = set()
    fr = root / "batches" / "_fixround"
    for f in list(fr.glob("*.md")) + list(fr.glob("*.txt")):
        if f.name.startswith("verify"):
            continue
        keys |= set(re.findall(r"au-federal-[a-z]+-?\d+", f.read_text()))
    # Keys files referenced by fix briefs.
    for f in fr.glob("fix-*.md"):
        for kf in re.findall(r"`(/[^`]+keys[^`]*\.txt)`", f.read_text()):
            p = Path(kf)
            if p.exists():
                keys |= set(re.findall(r"au-federal-[a-z]+-?\d+", p.read_text()))
    return keys


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--root", required=True)
    ap.add_argument("--json")
    ap.add_argument("--gate")
    args = ap.parse_args()
    root = Path(args.root)
    index = json.loads((root / "batches" / "index.json").read_text())
    held = {}
    hp = root / "batches" / "_fixround" / "held.txt"
    if hp.exists():
        for line in hp.read_text().splitlines():
            if line.strip():
                k, _, why = line.strip().partition(" ")
                held[k] = why
    fixed_ever = fixer_keys(root)
    ndir = root / "batches" / "_neutrality" / "reviews"
    ep = root / "batches" / "_neutrality" / "charged-extra.txt"
    extra_charged = set(ep.read_text().split()) if ep.exists() else set()
    published: set[str] = set()
    for pm in (root / "published").glob("*/manifest.json"):
        published |= set(json.loads(pm.read_text()))
    ledger = root / "batches" / "_audit" / "ledger"
    rows = []
    for name, b in sorted(index["batches"].items()):
        d = root / "batches" / name
        for key in b["keys"]:
            s = d / "out" / f"{key}.summary.json"
            c = d / "out" / f"{key}.check.json"
            r = d / "reviews" / f"{key}.review.json"
            src = load(root / "sources" / f"{key}.json") or {}
            title = src.get("title") or ""
            doc = load(s)
            check = load(c)
            rev = load(r)
            nrev = load(ndir / f"{key}.review.json")
            led = load(ledger / f"{key}.json")
            method = ((doc or {}).get("summary_json") or {}).get("review", {}).get("method", "") if doc else ""
            row = {
                "key": key, "batch": name, "title": title,
                "writer": (doc or {}).get("model"),
                "codex": bool(doc and "codex" in (doc.get("model") or "").lower()),
                "draft": doc is not None,
                "check_ok": bool(check and check.get("ok")) and mtime(c) + 1 >= mtime(s),
                "review": (rev or {}).get("verdict"),
                "review_lane": (rev or {}).get("reviewer_lane"),
                "review_fresh": bool(rev) and mtime(r) + 1 >= mtime(s),
                "fixed_ever": key in fixed_ever,
                "fix_mark": bool(FIX_MARK.search(method)),
                "audit": (led or {}).get("result"),
                "charged": bool(CHARGED.search(title)) or nrev is not None or key in extra_charged,
                "published": key in published,
                "neutrality": (nrev or {}).get("verdict"),
                "neutrality_lane": (nrev or {}).get("reviewer_lane"),
                "neutrality_fresh": bool(nrev) and mtime(ndir / f"{key}.review.json") + 1 >= mtime(s),
                "held": held.get(key),
            }
            why = []
            if not row["draft"]:
                why.append("no_draft")
            else:
                if not row["check_ok"]:
                    why.append("check")
                if row["review"] is None:
                    why.append("unreviewed")
                elif row["review"] != "accept":
                    why.append("fact_rejected")
                elif not row["review_fresh"]:
                    why.append("modified_after_review")
                elif row["review_lane"] == name:
                    why.append("same_lane_review")
                if row["fixed_ever"] and not row["fix_mark"]:
                    why.append("fix_missing")
                if row["audit"] is None:
                    why.append("unaudited")
                if row["charged"]:
                    if row["neutrality"] is None:
                        why.append("neutrality_owed")
                    elif row["neutrality"] != "accept":
                        why.append("neutrality_rejected")
                    elif not row["neutrality_fresh"]:
                        why.append("neutrality_stale")
                if (doc.get("summary_json") or {}).get("flags"):
                    why.append("flags")
                if row["held"]:
                    why.append("held")
                if row["published"]:
                    why = ["published"]
            row["blocked"] = why
            rows.append(row)
    states: dict[str, int] = {}
    for r_ in rows:
        for w in r_["blocked"] or ["READY"]:
            states[w] = states.get(w, 0) + 1
    ready = [r_ for r_ in rows if not r_["blocked"]]
    print(json.dumps({"keys": len(rows), "ready": len(ready), "charged": sum(r_["charged"] for r_ in rows),
                      "blockers": dict(sorted(states.items(), key=lambda x: -x[1]))}, indent=1))
    if args.json:
        Path(args.json).write_text(json.dumps(rows, ensure_ascii=False, indent=1))
    if args.gate:
        out = Path(args.gate)
        out.mkdir(parents=True, exist_ok=False)
        manifest = {}
        for r_ in ready:
            d = root / "batches" / r_["batch"]
            doc = load(d / "out" / f"{r_['key']}.summary.json")
            review = load(d / "reviews" / f"{r_['key']}.review.json")
            doc["summary_json"]["review"]["independent_check"] = {
                "model": review.get("reviewer_model"), "provider": review.get("reviewer_provider"),
                "lane": review.get("reviewer_lane"), "cross_engine": review.get("reviewer_model") != doc.get("model"),
                "reviewed_at": review.get("reviewed_at"), "sections": review.get("sections_read"),
            }
            if r_["charged"]:
                nrev = load(root / "batches" / "_neutrality" / "reviews" / f"{r_['key']}.review.json")
                doc["summary_json"]["review"]["neutrality_check"] = {
                    "model": nrev.get("reviewer_model"), "provider": nrev.get("reviewer_provider"),
                    "lane": nrev.get("reviewer_lane"), "reviewed_at": nrev.get("reviewed_at")}
            (out / f"{r_['key']}.summary.json").write_text(json.dumps(doc, ensure_ascii=False, indent=1), encoding="utf-8")
            manifest[r_["key"]] = {"batch": r_["batch"], "writer": doc.get("model"), "reviewer": review.get("reviewer_model"),
                                   "reviewer_lane": review.get("reviewer_lane"), "charged": r_["charged"],
                                   "neutrality_lane": r_["neutrality_lane"], "audit": r_["audit"],
                                   "gated_at": dt.datetime.now(dt.timezone.utc).isoformat()}
        (out / "manifest.json").write_text(json.dumps(manifest, ensure_ascii=False, indent=1), encoding="utf-8")
        print(f"gated {len(manifest)} into {out}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
