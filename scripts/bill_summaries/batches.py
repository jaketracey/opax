#!/usr/bin/env python3
"""Cut the source pack into writer batches and render the lane briefs.

    python3 batches.py make   --root R --wave w1 --engine fable --size 10 --years 2026,2025 [--max N] [--keys-file F]
    python3 batches.py render --root R --batch w1-fable-01 --role writer   --checker PATH
    python3 batches.py render --root R --batch w1-fable-01 --role verifier --checker PATH --engine codex
    python3 batches.py status --root R [--wave w1]

Layout under the pack root:
    batches/index.json                 batch -> keys, engine, wave; key -> batch
    batches/<batch>/keys.txt           one bill key per line
    batches/<batch>/out/               the writer's <key>.summary.json (+ checker output)
    batches/<batch>/reviews/           the verifier's <key>.review.json
    batches/<batch>/writer.md          rendered brief for the writing lane
    batches/<batch>/verifier-<eng>.md  rendered brief for the checking lane

Keys come from manifest.json newest first; a key already assigned to a batch
is never assigned again. Engines map to the model attribution a lane records.
"""
from __future__ import annotations

import argparse
import datetime as dt
import json
import sys
from pathlib import Path

ENGINES = {
    "fable": ("Claude Fable 5.1", "Anthropic"),
    "codex": ("GPT-6.1 (Codex)", "OpenAI"),
    "opus": ("Claude Opus 5.5", "Anthropic"),
}
BRIEFS = Path(__file__).resolve().parent / "briefs"


def load_index(root: Path) -> dict:
    p = root / "batches" / "index.json"
    if p.exists():
        return json.loads(p.read_text())
    return {"batches": {}, "assigned": {}}


def save_index(root: Path, index: dict) -> None:
    (root / "batches").mkdir(exist_ok=True)
    (root / "batches" / "index.json").write_text(json.dumps(index, indent=1), encoding="utf-8")


def cmd_make(args) -> int:
    root = Path(args.root)
    index = load_index(root)
    manifest = json.loads((root / "manifest.json").read_text())
    if args.keys_file:
        want = [k.strip() for k in Path(args.keys_file).read_text().splitlines() if k.strip()]
        order = {m["bill_key"]: i for i, m in enumerate(manifest)}
        rows = sorted((m for m in manifest if m["bill_key"] in set(want)), key=lambda m: order[m["bill_key"]])
    else:
        years = set(args.years.split(",")) if args.years else None
        rows = [m for m in manifest if not years or (m.get("introduced") or "")[:4] in years]
    if args.basis:
        rows = [m for m in rows if m["basis"] in set(args.basis.split(","))]
    rows = [m for m in rows if m["bill_key"] not in index["assigned"]]
    if args.max:
        rows = rows[: args.max]
    n = sum(1 for b in index["batches"] if b.startswith(f"{args.wave}-{args.engine}-"))
    made = []
    for i in range(0, len(rows), args.size):
        chunk = rows[i:i + args.size]
        n += 1
        name = f"{args.wave}-{args.engine}-{n:02d}"
        d = root / "batches" / name
        (d / "out").mkdir(parents=True, exist_ok=True)
        (d / "reviews").mkdir(parents=True, exist_ok=True)
        keys = [m["bill_key"] for m in chunk]
        (d / "keys.txt").write_text("\n".join(keys) + "\n", encoding="utf-8")
        index["batches"][name] = {"keys": keys, "engine": args.engine, "wave": args.wave,
                                  "created": dt.datetime.now(dt.timezone.utc).isoformat()}
        for k in keys:
            index["assigned"][k] = name
        made.append((name, len(keys)))
    save_index(root, index)
    for name, c in made:
        print(f"{name} {c}")
    print(f"{len(made)} batches, {sum(c for _, c in made)} bills; {len(index['assigned'])} assigned in total")
    return 0


def cmd_render(args) -> int:
    root = Path(args.root)
    index = load_index(root)
    if args.role == "writer":
        b = index["batches"][args.batch]
        engine = args.engine or b["engine"]
        model, provider = ENGINES[engine]
        d = root / "batches" / args.batch
        tmpl = (BRIEFS / "writer.md").read_text(encoding="utf-8")
        text = (tmpl.replace("{BATCH}", args.batch).replace("{ROOT}", str(root))
                .replace("{KEYS_FILE}", str(d / "keys.txt")).replace("{COUNT}", str(len(b["keys"])))
                .replace("{OUT}", str(d / "out")).replace("{REVIEWS}", str(d / "reviews"))
                .replace("{CHECKER}", args.checker).replace("{MODEL}", model).replace("{PROVIDER}", provider))
        (d / "writer.md").write_text(text, encoding="utf-8")
        print(d / "writer.md")
        return 0
    # verifier: one brief over several batches (or a slice of one), for the other engine
    names = args.batch.split(",")
    engine = args.engine
    if not engine:
        raise SystemExit("verifier briefs need --engine (the engine that did NOT write the drafts)")
    model, provider = ENGINES[engine]
    units, count = [], 0
    for name in names:
        b = index["batches"][name]
        if b["engine"] == engine:
            # Independence is by lane (a separate run with its own context); a different
            # engine is preferred and collect_accepted.py records whether it was cross-engine.
            print(f"note: {name} was also written by {engine}; the check is by a separate lane", file=sys.stderr)
        d = root / "batches" / name
        keys = b["keys"]
        keys_file = d / "keys.txt"
        if args.part:
            i, n = (int(x) for x in args.part.split("/"))
            size = -(-len(keys) // n)
            keys = keys[(i - 1) * size: i * size]
            keys_file = d / f"keys.part{i}of{n}.txt"
            keys_file.write_text("\n".join(keys) + "\n", encoding="utf-8")
        count += len(keys)
        units.append(f"- Unit `{name}`{' part ' + args.part if args.part else ''}: {len(keys)} bills. Keys: `{keys_file}`. Drafts (out dir): `{d / 'out'}`. Verdicts (reviews dir): `{d / 'reviews'}`.")
    label = args.label or ("v-" + engine + "-" + "+".join(names) + (("-p" + args.part.replace("/", "of")) if args.part else ""))
    tmpl = (BRIEFS / "verifier.md").read_text(encoding="utf-8")
    text = (tmpl.replace("{BATCH}", label).replace("{ROOT}", str(root)).replace("{COUNT}", str(count))
            .replace("{UNITS}", "\n".join(units)).replace("{CHECKER}", args.checker)
            .replace("{MODEL}", model).replace("{PROVIDER}", provider))
    vdir = root / "batches" / "_verify"
    vdir.mkdir(exist_ok=True)
    (vdir / f"{label}.md").write_text(text, encoding="utf-8")
    print(vdir / f"{label}.md")
    return 0


def cmd_status(args) -> int:
    root = Path(args.root)
    index = load_index(root)
    tot = {"keys": 0, "drafts": 0, "pass": 0, "accept": 0, "reject": 0, "skipped": 0}
    for name, b in sorted(index["batches"].items()):
        if args.wave and b["wave"] != args.wave:
            continue
        d = root / "batches" / name
        drafts = sum(1 for k in b["keys"] if (d / "out" / f"{k}.summary.json").exists())
        passed = 0
        for k in b["keys"]:
            p = d / "out" / f"{k}.check.json"
            if p.exists() and json.loads(p.read_text()).get("ok"):
                passed += 1
        acc = rej = 0
        for k in b["keys"]:
            p = d / "reviews" / f"{k}.review.json"
            if p.exists():
                v = json.loads(p.read_text()).get("verdict")
                acc += v == "accept"
                rej += v == "reject"
        skipped = 0
        sk = d / "out" / "_skipped.txt"
        if sk.exists():
            skipped = sum(1 for line in sk.read_text().splitlines() if line.strip())
        print(f"{name:18} {b['engine']:6} keys={len(b['keys']):3} drafts={drafts:3} pass={passed:3} accept={acc:3} reject={rej:3} skipped={skipped}")
        for k2, v in (("keys", len(b["keys"])), ("drafts", drafts), ("pass", passed), ("accept", acc), ("reject", rej), ("skipped", skipped)):
            tot[k2] += v
    print("total", tot)
    return 0


def main() -> int:
    ap = argparse.ArgumentParser()
    sub = ap.add_subparsers(dest="cmd", required=True)
    m = sub.add_parser("make")
    m.add_argument("--root", required=True)
    m.add_argument("--wave", required=True)
    m.add_argument("--engine", required=True, choices=sorted(ENGINES))
    m.add_argument("--size", type=int, default=10)
    m.add_argument("--years")
    m.add_argument("--basis")
    m.add_argument("--max", type=int, default=0)
    m.add_argument("--keys-file")
    m.set_defaults(fn=cmd_make)
    r = sub.add_parser("render")
    r.add_argument("--root", required=True)
    r.add_argument("--batch", required=True)
    r.add_argument("--role", required=True, choices=["writer", "verifier"])
    r.add_argument("--engine", choices=sorted(ENGINES))
    r.add_argument("--checker", required=True)
    r.add_argument("--part", help="verifier only: slice of the batch, e.g. 1/4")
    r.add_argument("--label", help="verifier only: brief name")
    r.set_defaults(fn=cmd_render)
    s = sub.add_parser("status")
    s.add_argument("--root", required=True)
    s.add_argument("--wave")
    s.set_defaults(fn=cmd_status)
    args = ap.parse_args()
    return args.fn(args)


if __name__ == "__main__":
    sys.exit(main())
