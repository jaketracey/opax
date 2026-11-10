#!/usr/bin/env python3
"""Mechanical checks on drafted bill summaries before any model or human review.

    python3 check_summaries.py --root <pack root> --out <dir with *.summary.json> [KEY ...]

For each `<out>/<bill_key>.summary.json` it loads the matching private source
(`<root>/sources/<bill_key>.json` + `.txt`) and checks the contract shape,
the house style rules that can be tested mechanically, that every public
sentence, bullet and the affected line carries evidence, that every evidence
quote is an exact excerpt of the source text, and that no public sentence
copies a run of twelve or more words from the source. Writes
`<out>/<bill_key>.check.json` and exits 1 when anything fails. Warnings never
fail a summary; a reviewer reads them.
"""
from __future__ import annotations

import argparse
import datetime as dt
import json
import re
import sys
import unicodedata
from pathlib import Path

PROMPT_VERSION = "bill-summaries-source-review-20261110"
ALLOWED_MODELS = {
    ("Claude Fable 5.1", "Anthropic"),
    ("Claude Opus 5.5", "Anthropic"),
    ("GPT-6.1 (Codex)", "OpenAI"),
    ("GPT-6 (Codex)", "OpenAI"),
}
DESCRIBES = {
    "em": "original",
    "digest": "original",
    "text": "as introduced",
    "speech": "as introduced",
}
BANNED_PHRASES = [
    "controversial", "unfortunately", "fortunately", "sadly", "radical", "extreme ",
    "common sense", "commonsense", "sensible", "welcome ", "disappointing", "landmark",
    "draconian", "attack on", "fair go", "so-called", "finally", "long overdue",
    "in short", "machine-written", "this summary", "the memorandum says", "according to the em",
]
FIRST_PERSON = re.compile(r"\b(I|we|our|us|my)\b")
MARKUP = re.compile(r"[*#`\[\]<>{}|]")
SHINGLE = 12


def norm(text: str) -> str:
    t = unicodedata.normalize("NFKC", text or "")
    t = t.replace("‘", "'").replace("’", "'").replace("“", '"').replace("”", '"')
    t = re.sub(r"[‐-―−]", "-", t)
    t = re.sub(r"\s+", " ", t)
    return t.strip().casefold()


def words(s: str) -> list[str]:
    return re.findall(r"[\w'-]+", s or "")


def check_one(key: str, root: Path, out: Path) -> dict:
    fails: list[str] = []
    warns: list[str] = []
    path = out / f"{key}.summary.json"
    try:
        doc = json.loads(path.read_text(encoding="utf-8"))
    except Exception as e:  # noqa: BLE001
        return {"bill_key": key, "ok": False, "fails": [f"unreadable summary file: {e}"], "warns": []}
    try:
        src = json.loads((root / "sources" / f"{key}.json").read_text(encoding="utf-8"))
        text = (root / "sources" / f"{key}.txt").read_text(encoding="utf-8")
    except Exception as e:  # noqa: BLE001
        return {"bill_key": key, "ok": False, "fails": [f"source missing: {e}"], "warns": []}

    if doc.get("bill_key") != key:
        fails.append("bill_key does not match the file name")
    if doc.get("basis") != src["basis"]:
        fails.append(f"basis {doc.get('basis')!r} != source basis {src['basis']!r}")
    if not doc.get("describes_version"):
        fails.append("describes_version missing")
    elif doc.get("describes_version") != DESCRIBES.get(src["basis"]):
        warns.append(f"describes_version {doc.get('describes_version')!r}; expected {DESCRIBES.get(src['basis'])!r}")
    if doc.get("as_of") != src.get("as_of"):
        fails.append(f"as_of {doc.get('as_of')!r} != source as_of {src.get('as_of')!r}")
    if (doc.get("model"), doc.get("provider")) not in ALLOWED_MODELS:
        fails.append(f"model/provider {doc.get('model')!r}/{doc.get('provider')!r} not in the allowed set")
    if doc.get("prompt_version") != PROMPT_VERSION:
        fails.append(f"prompt_version must be {PROMPT_VERSION}")
    try:
        dt.datetime.fromisoformat((doc.get("generated_at") or "").replace("Z", "+00:00"))
    except ValueError:
        fails.append("generated_at is not an ISO timestamp")

    p = doc.get("summary_json") or {}
    sentences = p.get("sentences")
    changes = p.get("changes")
    affected = p.get("affected")
    if not (isinstance(sentences, list) and len(sentences) == 3 and all(isinstance(s, str) and s.strip() for s in sentences)):
        fails.append("sentences must be exactly three non-empty strings")
        sentences = [s for s in (sentences or []) if isinstance(s, str)]
    if not (isinstance(changes, list) and 3 <= len(changes) <= 6 and all(isinstance(s, str) and s.strip() for s in changes)):
        fails.append("changes must be three to six non-empty strings")
        changes = [s for s in (changes or []) if isinstance(s, str)]
    if not (isinstance(affected, str) and affected.strip()):
        fails.append("affected must be one non-empty sentence")
        affected = affected if isinstance(affected, str) else ""
    if p.get("confidence") not in ("high", "medium", "low"):
        fails.append("confidence must be high, medium or low")
    if p.get("flags") not in ([], None):
        fails.append(f"flags must be empty to publish: {p.get('flags')}")
    if not isinstance(p.get("evidence"), list) or not p.get("evidence"):
        fails.append("evidence list missing")
    review = p.get("review") or {}
    if not (review.get("method") and isinstance(review.get("sections"), list) and review["sections"]):
        fails.append("review.method and review.sections are required")
    psrc = p.get("source") or {}
    for k in ("content_hash", "review_text_sha256", "kind", "id"):
        if psrc.get(k) != src["source"].get(k):
            fails.append(f"source.{k} does not match the pack ({psrc.get(k)!r} vs {src['source'].get(k)!r})")

    public = list(sentences) + list(changes) + ([affected] if affected else [])
    for s in sentences:
        n = len(words(s))
        if "\n" in s or not s.strip().endswith("."):
            fails.append(f"sentence must be one line ending with a full stop: {s[:60]!r}")
        if not 8 <= n <= 48:
            fails.append(f"sentence length {n} words outside 8-48: {s[:60]!r}")
        if re.search(r"[.!?]\s+[A-Z]", s.strip()[:-1]):
            warns.append(f"sentence may contain more than one sentence: {s[:60]!r}")
    for c in changes:
        n = len(words(c))
        if not c.strip().endswith("."):
            fails.append(f"change must end with a full stop: {c[:60]!r}")
        if not 4 <= n <= 40:
            fails.append(f"change length {n} words outside 4-40: {c[:60]!r}")
    if affected:
        n = len(words(affected))
        if not 5 <= n <= 45 or not affected.strip().endswith("."):
            fails.append(f"affected must be one sentence of 5-45 words ending with a full stop ({n} words)")
    total = sum(len(words(s)) for s in public)
    if not 100 <= total <= 260:
        fails.append(f"public text is {total} words; keep it between 100 and 260")
    joined = " ".join(public)
    if "—" in joined:
        fails.append("em dash (U+2014) in public text")
    if "–" in joined:
        warns.append("en dash (U+2013) in public text; use 'to' or a hyphen unless it is a year range")
    if MARKUP.search(joined):
        fails.append("markup characters in public text")
    if FIRST_PERSON.search(joined):
        fails.append("first person in public text")
    low = joined.casefold()
    for b in BANNED_PHRASES:
        if b in low:
            fails.append(f"banned phrase {b.strip()!r} in public text")
    if src["status"] in ("lapsed", "before_parliament") and "would" not in low:
        warns.append("no 'would' in public text for a bill that is not law")
    if re.search(r"\b(is|are) now law\b|\bcame into force\b|\bcommenced on\b", low):
        warns.append("public text may assert current law rather than the proposal")

    ntext = norm(text)
    ntitle = norm(src["title"])
    evidence = [e for e in (p.get("evidence") or []) if isinstance(e, dict)]
    claims = {norm(e.get("claim", "")) for e in evidence}
    for s in public:
        if norm(s) not in claims:
            fails.append(f"no evidence entry for: {s[:70]!r}")
    for e in evidence:
        q = e.get("quote") or ""
        nq = len(words(q))
        if not 4 <= nq <= 80:
            fails.append(f"quote must be 4-80 words ({nq}): {q[:60]!r}")
            continue
        if norm(q) not in ntext:
            fails.append(f"quote not found in the source text: {q[:80]!r}")
        if norm(e.get("claim", "")) not in {norm(s) for s in public}:
            warns.append(f"evidence claim is not one of the public lines: {str(e.get('claim'))[:60]!r}")
    for s in public:
        toks = norm(s).split(" ")
        for i in range(0, max(0, len(toks) - SHINGLE + 1)):
            sh = " ".join(toks[i:i + SHINGLE])
            if sh in ntitle:
                continue
            if sh in ntext:
                fails.append(f"copies {SHINGLE}+ source words verbatim: {sh[:70]!r}")
                break

    result = {"bill_key": key, "ok": not fails, "fails": fails, "warns": warns, "words": total,
              "checked_at": dt.datetime.now(dt.timezone.utc).isoformat()}
    (out / f"{key}.check.json").write_text(json.dumps(result, ensure_ascii=False, indent=1), encoding="utf-8")
    return result


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--root", required=True)
    ap.add_argument("--out", required=True)
    ap.add_argument("--quiet", action="store_true")
    ap.add_argument("keys", nargs="*")
    args = ap.parse_args()
    root, out = Path(args.root), Path(args.out)
    keys = args.keys or sorted(p.name[: -len(".summary.json")] for p in out.glob("*.summary.json"))
    bad = 0
    for key in keys:
        r = check_one(key, root, out)
        bad += 0 if r["ok"] else 1
        if not args.quiet or not r["ok"]:
            print(f"{'PASS' if r['ok'] else 'FAIL'} {key} ({r.get('words', '?')} words)")
            for f in r["fails"]:
                print(f"   FAIL {f}")
            for w in r["warns"]:
                print(f"   warn {w}")
    print(f"{len(keys) - bad} pass, {bad} fail of {len(keys)}")
    return 1 if bad else 0


if __name__ == "__main__":
    sys.exit(main())
