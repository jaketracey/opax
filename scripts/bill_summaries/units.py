#!/usr/bin/env python3
"""Render a lane brief over an arbitrary key list, grouped into per-batch units.

    python3 -I units.py --root <pack> --role audit2|fixer|verifier|neutrality --label <lane> \
        --keys k1,k2,... | --keys-file f [--engine codex|opus] [--notes notes.json] --checker <path>

Writes `<batch>/keys.<label>.txt` per batch and the brief to
`batches/_lanes/<label>.md`, and prints its path. Neutrality verdicts go to
`batches/_neutrality/reviews/`; everything else to the batch's own dirs.
`--notes` is a JSON object {bill_key: "coordinator note"} added to the brief.
"""
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

BRIEFS = Path(__file__).resolve().parent / "briefs"
ENGINES = {"codex": ("GPT-6.1 (Codex)", "OpenAI"), "opus": ("Claude Opus 5.5", "Anthropic"),
           "sonnet": ("Claude Sonnet 5.5", "Anthropic")}
NEUTRALITY_WHY = """
## Why this pass exists

These bills touch contested topics (the Voice and referendums, treaty, Israel and Gaza, unions and employers, industrial relations, climate and net zero, nuclear power, migration, citizenship, electoral law, protest, hate and terror offences, gambling, live exports, voluntary assisted dying, religion and marriage). The fact check has already accepted each draft; this is a second, neutrality-focused review. Read each draft as a sceptical reader from any side of politics would. Reject if any sentence, change or the affected line:
- carries the sponsor's or an opponent's framing, or loaded labels used in OPAX's own voice (for example a bill's own characterisation stated as fact rather than attributed: "the bill describes ... as ...");
- uses evaluative language, or claims effects the memorandum does not itself state as what the bill does;
- leaves out a qualification, threshold or alternative in a way that would mislead (quote the figure from the source so a fixer can add it);
- describes something the bill adds as something it "retains" or "preserves".
Every claim must be supported by the memorandum text, never by outside knowledge. Titles in this pass:
"""


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--root", required=True)
    ap.add_argument("--role", required=True, choices=["audit2", "fixer", "verifier", "neutrality"])
    ap.add_argument("--label", required=True)
    ap.add_argument("--keys")
    ap.add_argument("--keys-file")
    ap.add_argument("--engine", default="codex", choices=sorted(ENGINES))
    ap.add_argument("--notes")
    ap.add_argument("--checker", required=True)
    args = ap.parse_args()
    root = Path(args.root)
    keys = [k.strip() for k in (args.keys.split(",") if args.keys else Path(args.keys_file).read_text().split()) if k.strip()]
    keys = [k if k.startswith("au-federal-") else f"au-federal-{k}" for k in keys]
    index = json.loads((root / "batches" / "index.json").read_text())
    where = {k: n for n, b in index["batches"].items() for k in b["keys"]}
    missing = [k for k in keys if k not in where]
    if missing:
        raise SystemExit(f"unknown keys: {missing}")
    notes = json.loads(Path(args.notes).read_text()) if args.notes else {}
    by_batch: dict[str, list[str]] = {}
    for k in keys:
        by_batch.setdefault(where[k], []).append(k)
    units = []
    for name, ks in sorted(by_batch.items()):
        d = root / "batches" / name
        kf = d / f"keys.{args.label}.txt"
        kf.write_text("\n".join(ks) + "\n", encoding="utf-8")
        line = f"- Unit `{name}`: {len(ks)} bills. Keys: `{kf}`. Drafts (out dir): `{d / 'out'}`."
        if args.role == "fixer":
            line += f" Reviews (reviews dir): `{d / 'reviews'}`."
        elif args.role == "verifier":
            line += f" Verdicts (reviews dir): `{d / 'reviews'}`."
        elif args.role == "neutrality":
            line += f" Verdicts (reviews dir): `{root / 'batches' / '_neutrality' / 'reviews'}`."
        units.append(line)
    tmpl_name = {"audit2": "audit2.md", "fixer": "fixer.md", "verifier": "verifier.md", "neutrality": "verifier.md"}[args.role]
    text = (BRIEFS / tmpl_name).read_text(encoding="utf-8")
    model, provider = ENGINES[args.engine]
    text = (text.replace("{BATCH}", args.label).replace("{ROOT}", str(root)).replace("{COUNT}", str(len(keys)))
            .replace("{UNITS}", "\n".join(units)).replace("{CHECKER}", args.checker)
            .replace("{MODEL}", model).replace("{PROVIDER}", provider))
    if args.role == "neutrality":
        text = text.replace("You are the independent reviewer for draft", "You are the independent neutrality reviewer for draft")
        titles = []
        for k in keys:
            src = json.loads((root / "sources" / f"{k}.json").read_text())
            titles.append(f"- `{k}`: {src.get('title')}")
        text += NEUTRALITY_WHY + "\n".join(titles) + "\n"
    if notes:
        text += "\n## Coordinator notes per bill\n\n" + "\n".join(f"- `{k}`: {notes[k]}" for k in keys if k in notes) + "\n"
    out = root / "batches" / "_lanes"
    out.mkdir(exist_ok=True)
    (out / f"{args.label}.md").write_text(text, encoding="utf-8")
    print(out / f"{args.label}.md")
    return 0


if __name__ == "__main__":
    sys.exit(main())
