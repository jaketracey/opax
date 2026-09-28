#!/usr/bin/env python3
"""Sanity-check the data files the nightly refresh is about to commit.

    python3 scripts/vm/validate_data.py bills votes corpus wrangler
    python3 scripts/vm/validate_data.py money grants suppliers access expenses interests
    python3 scripts/vm/validate_data.py fits speakers people pay discovery

Each named group is checked independently; exit status is the number of failing
groups (0 = all good) and each failure prints one line beginning "FAIL <group>".
The nightly script reverts a failing group to HEAD and carries on with the rest,
so a bad export never reaches the site but a good one is not held up by it.

  bills     index.json parses, count matches its array, every listed bill has a file
            whose key matches its name, no bill file is unparseable, and the index has
            not lost more than 2% of HEAD's bills
  votes     votes.json parses, is non-empty, and is not less than half HEAD's size
  corpus    corpus.json parses; its breakdown sums to expected_resources; the version is a date
  wrangler  portal/wrangler.jsonc carries exactly two CACHE_EPOCH values, both non-empty

The groups below share one shape: every file parses, is non-empty and carries its required
keys; each count named for it (an array or object length, or a meta count) is positive and
not under a fraction of HEAD's (the *_MIN_RATIO constants below; growth always passes); a file
that HEAD has and the working tree lacks is an error ("deleted"). Where HEAD lacks a file only
the absolute checks apply. For a directory of shards, the file count is held to HEAD's the same
way and every file that `git status` shows as changed or added must parse.

  money      graph/money.json, plus money.qld/vic/tas.json where they exist: meta, nodes, edges
  grants     graph/grants.federal.json: meta, agencies, programs, recipients; grants/federal
             shard-NN.json files match meta.shards, every listed program has its programs/ file,
             and every federal id in grants/program-notes.json is still in programs[] (the rule
             portal/test/program-notes.test.mjs enforces)
  suppliers  suppliers.json and agencies.json; the suppliers/ and agencies/ shard directories
  access     access.json: meta, donors, ministers, aliases
  expenses   expenses.json: meta, names, people, and meta.rows
  interests  interests/index.json (_meta, _by_name, people), a file for every person it lists,
             and the per-person files
  fits       fits.json: meta, by_entity, people
  speakers   speakers.json: a non-empty array
  people     parliamentarians.json: meta, people
  pay        pay.json: meta, base, offices, current, names, people
  discovery  discovery.json: signals, coverage, methodology, generated_at
  taxcharity entities/tax-charity: index.json (meta.counts, sources, caveats; the ABN counts held), names.json
             (by_name), and the <dd>.json shards by the last two digits of the ABN
"""
import json
import re
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
BILLS = ROOT / "portal" / "public" / "bills"
PUBLIC = "portal/public"  # repo-relative, for git and for the helpers below

# Smallest acceptable new/HEAD ratio for the counts each group checks: under ratio * HEAD's
# figure the group fails and the nightly reverts it. Tune here.
MONEY_MIN_RATIO = 0.80         # nodes and edges in each graph/money*.json
GRANTS_MIN_RATIO = 0.80        # programs, recipients, agencies in graph/grants.federal.json
GRANTS_FILES_MIN_RATIO = 0.90  # shard-NN.json and programs/*.json files under grants/federal
SUPPLIERS_MIN_RATIO = 0.95     # suppliers in suppliers.json (supplier_count too)
AGENCIES_MIN_RATIO = 0.90      # agencies in agencies.json
SHARDS_MIN_RATIO = 0.90        # files under suppliers/ and agencies/
ACCESS_MIN_RATIO = 0.80        # donors, ministers, aliases
EXPENSES_MIN_RATIO = 0.95      # people, names, rows: expenses only grow
INTERESTS_MIN_RATIO = 0.90     # people in the index, and files in interests/
FITS_MIN_RATIO = 0.80          # by_entity, people
SPEAKERS_MIN_RATIO = 0.95      # speakers
PEOPLE_MIN_RATIO = 0.95        # people in parliamentarians.json
PAY_MIN_RATIO = 0.80           # base, offices, current, names, people
DISCOVERY_MIN_RATIO = 0.80     # signals, methodology
TAXCHARITY_MIN_RATIO = 0.90    # ABNs written, charity/AIS/ATO matches, by_name keys, and the shard files


def head_bytes(rel: str) -> bytes | None:
    r = subprocess.run(["git", "show", f"HEAD:{rel}"], cwd=ROOT, capture_output=True)
    return r.stdout if r.returncode == 0 else None


_MISSING = object()


def _get(doc, path: str):
    """The value at a dotted path through nested objects ("" is the document itself), or _MISSING."""
    for part in filter(None, path.split(".")):
        if not isinstance(doc, dict) or part not in doc:
            return _MISSING
        doc = doc[part]
    return doc


def _count(doc, path: str) -> int | None:
    """len() of the array or object at path, or the integer itself (a meta count); None if it is neither."""
    v = _get(doc, path)
    if isinstance(v, (list, dict)):
        return len(v)
    return v if isinstance(v, int) and not isinstance(v, bool) else None


def _tolerance(errs: list[str], name: str, new: int, old: int | None, ratio: float) -> None:
    """Flag new when it is under ratio * old. No HEAD figure (or a zero one) leaves nothing to compare with."""
    if old and new < old * ratio:
        errs.append(f"{name} fell from {old:,} to {new:,}, under {ratio:.0%} of HEAD")


def _load_json(rel: str):
    """(document, None) for a JSON file that parses and is non-empty; (None, error) otherwise."""
    p = ROOT / rel
    if not p.is_file():
        return None, (f"{rel} deleted (HEAD has it)" if head_bytes(rel) is not None else f"{rel} missing")
    try:
        doc = json.loads(p.read_text(encoding="utf-8"))
    except (OSError, ValueError) as e:
        return None, f"{rel} unreadable: {e}"
    return (doc, None) if doc else (None, f"{rel} is empty")


def _check_json(rel: str, keys=(), counts=(), ratio: float = 0.8, optional: bool = False) -> list[str]:
    """One data file: parses, non-empty, every dotted path in keys present, and every path in counts a
    positive count that is not under ratio * HEAD's. optional forgives a file that is neither on disk
    nor in HEAD; one that HEAD has must still be there."""
    if optional and not (ROOT / rel).exists() and head_bytes(rel) is None:
        return []
    doc, err = _load_json(rel)
    if err:
        return [err]
    errs = [f"{rel} lacks {k!r}" for k in keys if _get(doc, k) is _MISSING]
    old_raw = head_bytes(rel)
    try:
        old = json.loads(old_raw) if old_raw else None
    except ValueError:
        old = None
    for path in counts:
        label = f"{rel} {path or 'rows'}"
        n = _count(doc, path)
        if n is None:
            errs.append(f"{label} is not an array, object or count")
        elif n == 0:
            errs.append(f"{label} is empty")
        elif old is not None:
            _tolerance(errs, label, n, _count(old, path), ratio)
    return errs


def _head_names(rel_dir: str, pattern: str) -> list[str] | None:
    """Names of the files directly under rel_dir in HEAD that fully match pattern; None if HEAD lacks the dir."""
    r = subprocess.run(["git", "ls-tree", "-z", "--name-only", "HEAD", f"{rel_dir}/"], cwd=ROOT,
                       capture_output=True, text=True)
    names = [Path(n).name for n in r.stdout.split("\0") if n]
    return [n for n in names if re.fullmatch(pattern, n)] if r.returncode == 0 and names else None


def _changed(rel_dir: str, pattern: str) -> list[str]:
    """Files under rel_dir that the working tree changed or added (not deleted), as paths relative to
    rel_dir, whose relative path fully matches pattern."""
    out = subprocess.run(["git", "status", "--porcelain", "-z", "--untracked-files=all", "--", rel_dir], cwd=ROOT,
                         capture_output=True, text=True).stdout
    entries, found, i = out.split("\0"), [], 0
    while i < len(entries):
        entry, i = entries[i], i + 1
        if len(entry) < 4:
            continue
        code, path = entry[:2], entry[3:]
        if code[0] in "RC":
            i += 1  # a rename or copy is followed by its source path
        rel = path[len(rel_dir) + 1:]
        if "D" not in code and re.fullmatch(pattern, rel) and (ROOT / path).is_file():
            found.append(rel)
    return found


def _check_dir(rel_dir: str, pattern: str, ratio: float) -> list[str]:
    """A directory of shard files: some match pattern, no fewer than ratio * HEAD's count, and every one
    the working tree changed or added parses and is non-empty."""
    errs: list[str] = []
    d = ROOT / rel_dir
    now = [f.name for f in d.iterdir() if f.is_file() and re.fullmatch(pattern, f.name)] if d.is_dir() else []
    if not now:
        errs.append(f"{rel_dir}/ has no files matching {pattern}")
    else:
        was = _head_names(rel_dir, pattern)
        _tolerance(errs, f"{rel_dir}/ file count", len(now), len(was) if was else None, ratio)
    for name in _changed(rel_dir, pattern):
        _, err = _load_json(f"{rel_dir}/{name}")
        if err:
            errs.append(err)
            if len(errs) > 10:
                break
    return errs


def check_bills() -> list[str]:
    errs: list[str] = []
    try:
        index = json.loads((BILLS / "index.json").read_text(encoding="utf-8"))
    except (OSError, ValueError) as e:
        return [f"index.json unreadable: {e}"]
    rows = index.get("bills")
    if not isinstance(rows, list) or not rows:
        return ["index.json has no bills"]
    if index.get("count") != len(rows):
        errs.append(f"index count {index.get('count')} != {len(rows)} rows")
    old = head_bytes("portal/public/bills/index.json")
    if old:
        try:
            was = len(json.loads(old).get("bills", []))
            if was and len(rows) < was * 0.98:
                errs.append(f"index shrank from {was} to {len(rows)} bills")
        except ValueError:
            pass
    keys = [r.get("key") for r in rows]
    if len(set(keys)) != len(keys):
        errs.append("duplicate keys in index.json")
    for key in keys:
        if not (BILLS / f"{key}.json").exists():
            errs.append(f"index lists {key} but {key}.json is missing")
            if len(errs) > 10:
                break
    changed = subprocess.run(["git", "status", "--porcelain", "--", "portal/public/bills"], cwd=ROOT,
                             capture_output=True, text=True).stdout.splitlines()
    for line in changed:
        path = line[3:].strip().strip('"')
        if not path.endswith(".json") or path.endswith("/index.json") or line.startswith(" D") or line.startswith("D"):
            continue
        p = ROOT / path
        try:
            doc = json.loads(p.read_text(encoding="utf-8"))
        except (OSError, ValueError) as e:
            errs.append(f"{p.name} unreadable: {e}")
            continue
        if doc.get("key") != p.stem:
            errs.append(f"{p.name} carries key {doc.get('key')!r}")
        if len(errs) > 10:
            break
    return errs


def check_votes() -> list[str]:
    p = ROOT / "portal" / "public" / "votes.json"
    try:
        raw = p.read_bytes()
        data = json.loads(raw)
    except (OSError, ValueError) as e:
        return [f"votes.json unreadable: {e}"]
    if not data:
        return ["votes.json is empty"]
    old = head_bytes("portal/public/votes.json")
    if old and len(raw) < len(old) * 0.5:
        return [f"votes.json is {len(raw):,} bytes, under half of HEAD's {len(old):,}"]
    return []


def check_corpus() -> list[str]:
    try:
        c = json.loads((ROOT / "portal" / "public" / "corpus.json").read_text(encoding="utf-8"))
    except (OSError, ValueError) as e:
        return [f"corpus.json unreadable: {e}"]
    errs = []
    if not re.fullmatch(r"\d{4}-\d\d-\d\d", str(c.get("version", ""))):
        errs.append(f"version {c.get('version')!r} is not a date")
    if sum(c.get("expected_resources_breakdown", {}).values()) != c.get("expected_resources"):
        errs.append("expected_resources_breakdown does not sum to expected_resources")
    if c.get("collected_speeches") != c.get("refresh", {}).get("resource_counts", {}).get("speech"):
        errs.append("collected_speeches disagrees with resource_counts.speech")
    return errs


def check_wrangler() -> list[str]:
    text = (ROOT / "portal" / "wrangler.jsonc").read_text(encoding="utf-8")
    vals = re.findall(r'"CACHE_EPOCH"\s*:\s*"([^"]*)"', text)
    if len(vals) != 2 or not all(vals):
        return [f"expected two non-empty CACHE_EPOCH values, found {vals}"]
    return []


def check_money() -> list[str]:
    errs = _check_json(f"{PUBLIC}/graph/money.json", ("meta", "nodes", "edges"), ("nodes", "edges"), MONEY_MIN_RATIO)
    for jur in ("qld", "vic", "tas"):
        errs += _check_json(f"{PUBLIC}/graph/money.{jur}.json", ("meta", "nodes", "edges"), ("nodes", "edges"),
                            MONEY_MIN_RATIO, optional=True)
    return errs


def check_grants() -> list[str]:
    index, fed = f"{PUBLIC}/graph/grants.federal.json", f"{PUBLIC}/grants/federal"
    errs = _check_json(index, ("meta", "agencies", "programs", "recipients"), ("programs", "recipients", "agencies"),
                       GRANTS_MIN_RATIO)
    if errs:
        return errs
    doc, _ = _load_json(index)
    errs += _check_dir(fed, r"shard-\d+\.json", GRANTS_FILES_MIN_RATIO)
    errs += _check_dir(f"{fed}/programs", r"[^/]+\.json", GRANTS_FILES_MIN_RATIO)
    shards = len(list((ROOT / fed).glob("shard-*.json")))
    if _count(doc, "meta.shards") not in (None, shards):
        errs.append(f"{index} says {doc['meta']['shards']} shards but {fed} has {shards}")
    programs = [p for p in doc["programs"] if isinstance(p, dict)] if isinstance(doc["programs"], list) else []
    for p in programs:
        if not p.get("key") or not (ROOT / fed / "programs" / f"{p['key']}.json").is_file():
            errs.append(f"index lists program {p.get('id')} but programs/{p.get('key')}.json is missing")
            if len(errs) > 10:
                break
    # The rule portal/test/program-notes.test.mjs enforces: every federal id the notes name is still in programs[].
    notes, _ = _load_json(f"{PUBLIC}/grants/program-notes.json")
    named = (notes.get("programs") if isinstance(notes, dict) else None) or {}
    ids = {p.get("id") for p in programs}
    gone = sorted(str(i) for i in (named.get("federal") if isinstance(named, dict) else None) or () if i not in ids)
    if gone:
        more = f" (+{len(gone) - 8} more)" if len(gone) > 8 else ""
        errs.append(f"program-notes.json names federal programs missing from {index}: {', '.join(gone[:8])}{more}")
    return errs


def check_suppliers() -> list[str]:
    errs = _check_json(f"{PUBLIC}/suppliers.json", ("meta", "suppliers"), ("suppliers", "meta.supplier_count"),
                       SUPPLIERS_MIN_RATIO)
    errs += _check_json(f"{PUBLIC}/agencies.json", ("meta", "agencies"), ("agencies", "meta.agency_count"),
                        AGENCIES_MIN_RATIO)
    errs += _check_dir(f"{PUBLIC}/suppliers", r"[0-9a-f]{2}\.json", SHARDS_MIN_RATIO)
    errs += _check_dir(f"{PUBLIC}/agencies", r"a-[0-9a-f]+\.json", SHARDS_MIN_RATIO)
    return errs


def check_access() -> list[str]:
    return _check_json(f"{PUBLIC}/access.json", ("meta", "donors", "ministers", "aliases"),
                       ("donors", "ministers", "aliases"), ACCESS_MIN_RATIO)


def check_expenses() -> list[str]:
    return _check_json(f"{PUBLIC}/expenses.json", ("meta", "names", "people"), ("people", "names", "meta.rows"),
                       EXPENSES_MIN_RATIO)


def check_interests() -> list[str]:
    d = f"{PUBLIC}/interests"
    errs = _check_json(f"{d}/index.json", ("_meta", "_by_name", "people"), ("people",), INTERESTS_MIN_RATIO)
    if errs:
        return errs
    doc, _ = _load_json(f"{d}/index.json")
    for pid in doc["people"]:
        if not (ROOT / d / f"{pid}.json").is_file():
            errs.append(f"index lists {pid} but {pid}.json is missing")
            if len(errs) > 10:
                break
    return errs + _check_dir(d, r"[^/]+\.json", INTERESTS_MIN_RATIO)


def check_fits() -> list[str]:
    return _check_json(f"{PUBLIC}/fits.json", ("meta", "by_entity", "people"), ("by_entity", "people"), FITS_MIN_RATIO)


def check_speakers() -> list[str]:
    return _check_json(f"{PUBLIC}/speakers.json", (), ("",), SPEAKERS_MIN_RATIO)


def check_people() -> list[str]:
    return _check_json(f"{PUBLIC}/parliamentarians.json", ("meta", "people"), ("people", "meta.people"),
                       PEOPLE_MIN_RATIO)


def check_pay() -> list[str]:
    return _check_json(f"{PUBLIC}/pay.json", ("meta", "base", "offices", "current", "names", "people"),
                       ("base", "offices", "current", "names", "people"), PAY_MIN_RATIO)


def check_discovery() -> list[str]:
    return _check_json(f"{PUBLIC}/discovery.json", ("signals", "coverage", "methodology", "generated_at"),
                       ("signals", "methodology"), DISCOVERY_MIN_RATIO)


def check_taxcharity() -> list[str]:
    d = f"{PUBLIC}/entities/tax-charity"
    errs = _check_json(f"{d}/index.json", ("meta", "meta.counts", "meta.sources", "meta.caveats"),
                       ("meta.counts.abns_written", "meta.counts.charity", "meta.counts.ais", "meta.counts.ato",
                        "meta.counts.register_rows"), TAXCHARITY_MIN_RATIO)
    errs += _check_json(f"{d}/names.json", ("by_name",), ("by_name",), TAXCHARITY_MIN_RATIO)
    return errs + _check_dir(d, r"[0-9]{2}\.json", TAXCHARITY_MIN_RATIO)


CHECKS = {"bills": check_bills, "votes": check_votes, "corpus": check_corpus, "wrangler": check_wrangler,
          "money": check_money, "grants": check_grants, "suppliers": check_suppliers, "access": check_access,
          "expenses": check_expenses, "interests": check_interests, "fits": check_fits, "speakers": check_speakers,
          "people": check_people, "pay": check_pay, "discovery": check_discovery, "taxcharity": check_taxcharity}


def main() -> int:
    groups = sys.argv[1:] or list(CHECKS)
    bad = 0
    for g in groups:
        if g not in CHECKS:
            print(f"unknown group {g!r}; choose from {', '.join(CHECKS)}", file=sys.stderr)
            return 64
        errs = CHECKS[g]()
        if errs:
            bad += 1
            for e in errs:
                print(f"FAIL {g}: {e}")
        else:
            print(f"ok   {g}")
    return bad


if __name__ == "__main__":
    sys.exit(main())
