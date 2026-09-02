"""
parli.ingest.abr_match -- ABNs for donor entities from the ABN Bulk Extract.

The Australian Business Register publishes the whole ABN register as 20 XML
files (two ~500 MB zips) on data.gov.au under CC BY 3.0 AU, no registration:
https://data.gov.au/data/dataset/abn-bulk-extract . (The ABN Lookup web
service needs a registered GUID; this module never calls it.)

Two phases, both run on the box that holds the download:

  scan   stream every <ABR> record out of the zips with iterparse (one worker
         per XML file), keep every NON-individual name (main name MN, business
         names BN, trading names TRD, other OTN, DGR fund names) with its ABN,
         ABN status, entity type and business-address state/postcode, and load
         them into ~/.cache/autoresearch/abr/abr_names.sqlite keyed by the same
         normalisers the donor resolver uses (norm_exact, norm_rule). Sole
         traders' personal names are skipped: the resolver never fuzzy-matches
         people, and an individual's ABN is not something the site should attach.

  match  for every non-individual entity in ext_donor_entities (or a resolver
         --dump), look the canonical name and each alias up in that index and
         pick one ABN when the evidence is unambiguous:
           1. exact-normalised match on the entity's MAIN name (type MN) that is
              the only ABN with that main name           -> method "main_exact"
           2. rule-normalised (legal suffix off) match on a main name, unique
                                                          -> method "main_rule"
           3. an alias (any spelling we hold) matching a main name uniquely
                                                          -> method "alias_main"
           4. a business/trading name (BN/TRD/OTN) that belongs to exactly one
              ABN, where that ABN's main name also shares the entity's first
              significant token (guards "Westpac" the business name of a corner
              shop)                                       -> method "business_name"
         Several ACTIVE ABNs with the same main name (franchisees, state bodies
         of one association, unions registered per branch) = ambiguous: no ABN,
         and the candidate count goes in the notes so a curator can pick one.
         Cancelled ABNs are used only when no active one matches.

    PYTHONPATH=. python -m parli.ingest.abr_match scan  --abr-dir ~/.cache/autoresearch/abr
    PYTHONPATH=. python -m parli.ingest.abr_match match --db ~/.cache/autoresearch/parli.db \
        --out ~/.cache/autoresearch/abr/matches.json
    PYTHONPATH=. python -m parli.ingest.donor_entities --db ... --abr ~/.cache/autoresearch/abr/matches.json
"""

from __future__ import annotations

import argparse
import json
import os
import sqlite3
import sys
import time
import zipfile
from collections import defaultdict
from concurrent.futures import ProcessPoolExecutor, as_completed
from datetime import datetime, timezone
from pathlib import Path
from xml.etree import ElementTree as ET

from parli.ingest.donor_entities import ORG_SUFFIX, STOPWORDS, looks_like_person, norm_exact, norm_rule

ABR_DIR = Path(os.environ.get("OPAX_ABR_DIR", "~/.cache/autoresearch/abr")).expanduser()
INDEX_NAME = "abr_names.sqlite"
SOURCE_URL = "https://data.gov.au/data/dataset/abn-bulk-extract"
LICENCE = "CC BY 3.0 AU (Australian Business Register, ABN Bulk Extract)"

NAME_TYPES = {"MN", "BN", "TRD", "OTN", "DGR"}


def log(*a):
    print(*a, file=sys.stderr, flush=True)


# ── scan ─────────────────────────────────────────────────────────────────────

def _scan_member(zip_path: str, member: str, shard_path: str) -> dict:
    """Worker: parse one XML file inside the zip into a shard sqlite file."""
    t0 = time.time()
    if os.path.exists(shard_path):
        os.remove(shard_path)
    db = sqlite3.connect(shard_path)
    db.execute("PRAGMA journal_mode = OFF")
    db.execute("PRAGMA synchronous = OFF")
    db.execute("CREATE TABLE names (abn TEXT, name TEXT, ntype TEXT, status TEXT, etype TEXT, "
               "state TEXT, postcode TEXT, norm_exact TEXT, norm_rule TEXT)")
    buf = []
    n_rec = n_names = 0
    with zipfile.ZipFile(zip_path) as zf, zf.open(member) as fh:
        for _, el in ET.iterparse(fh, events=("end",)):
            if el.tag != "ABR":
                continue
            n_rec += 1
            abn_el = el.find("ABN")
            abn = (abn_el.text or "").strip() if abn_el is not None else ""
            status = abn_el.get("status") if abn_el is not None else None
            et_el = el.find("EntityType/EntityTypeInd")
            etype = (et_el.text or "").strip() if et_el is not None else None
            state = postcode = None
            addr = el.find("MainEntity/BusinessAddress/AddressDetails")
            if addr is None:
                addr = el.find("LegalEntity/BusinessAddress/AddressDetails")
            if addr is not None:
                st = addr.find("State")
                pc = addr.find("Postcode")
                state = (st.text or "").strip() if st is not None else None
                postcode = (pc.text or "").strip() if pc is not None else None
            if abn:
                for nm in el.iter("NonIndividualName"):
                    ntype = nm.get("type") or ""
                    if ntype not in NAME_TYPES:
                        continue
                    txt_el = nm.find("NonIndividualNameText")
                    txt = (txt_el.text or "").strip() if txt_el is not None else ""
                    if not txt:
                        continue
                    buf.append((abn, txt, ntype, status, etype, state, postcode, norm_exact(txt), norm_rule(txt)))
                    n_names += 1
            el.clear()
            if len(buf) >= 20000:
                db.executemany("INSERT INTO names VALUES (?,?,?,?,?,?,?,?,?)", buf)
                buf.clear()
    if buf:
        db.executemany("INSERT INTO names VALUES (?,?,?,?,?,?,?,?,?)", buf)
    db.commit()
    db.close()
    return {"member": member, "records": n_rec, "names": n_names, "seconds": round(time.time() - t0)}


def scan(abr_dir: Path, workers: int) -> None:
    zips = sorted(abr_dir.glob("public_split_*.zip"))
    if not zips:
        sys.exit(f"no public_split_*.zip under {abr_dir}")
    jobs = []
    for z in zips:
        with zipfile.ZipFile(z) as zf:
            for m in zf.namelist():
                if m.lower().endswith(".xml"):
                    jobs.append((str(z), m))
    log(f"{len(jobs)} XML files in {len(zips)} zips; {workers} workers")
    shard_dir = abr_dir / "shards"
    shard_dir.mkdir(exist_ok=True)
    results = []
    with ProcessPoolExecutor(max_workers=workers) as ex:
        futs = {ex.submit(_scan_member, z, m, str(shard_dir / (Path(m).stem + ".sqlite"))): m for z, m in jobs}
        for f in as_completed(futs):
            r = f.result()
            results.append(r)
            log(f"  {r['member']}: {r['records']:,} records, {r['names']:,} names, {r['seconds']}s")
    # merge shards
    index = abr_dir / INDEX_NAME
    tmp = abr_dir / (INDEX_NAME + ".tmp")
    if tmp.exists():
        tmp.unlink()
    db = sqlite3.connect(tmp)
    db.execute("PRAGMA journal_mode = OFF")
    db.execute("PRAGMA synchronous = OFF")
    db.execute("CREATE TABLE names (abn TEXT, name TEXT, ntype TEXT, status TEXT, etype TEXT, "
               "state TEXT, postcode TEXT, norm_exact TEXT, norm_rule TEXT)")
    for sh in sorted(shard_dir.glob("*.sqlite")):
        db.execute("ATTACH ? AS sh", (str(sh),))
        db.execute("INSERT INTO names SELECT * FROM sh.names")
        db.commit()
        db.execute("DETACH sh")
    log("indexing ...")
    db.execute("CREATE INDEX ix_names_exact ON names(norm_exact)")
    db.execute("CREATE INDEX ix_names_rule ON names(norm_rule)")
    db.execute("CREATE INDEX ix_names_abn ON names(abn)")
    db.execute("CREATE TABLE meta (key TEXT, value TEXT)")
    total = db.execute("SELECT COUNT(*) FROM names").fetchone()[0]
    db.executemany("INSERT INTO meta VALUES (?,?)", [
        ("built", datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")),
        ("source_url", SOURCE_URL), ("licence", LICENCE), ("rows", str(total)),
        ("files", json.dumps(results)),
    ])
    db.commit()
    db.close()
    if index.exists():
        index.unlink()
    tmp.rename(index)
    for sh in shard_dir.glob("*.sqlite"):
        sh.unlink()
    log(f"index {index}: {total:,} names from {sum(r['records'] for r in results):,} ABR records")


# ── match ────────────────────────────────────────────────────────────────────

def _first_token(key: str) -> str:
    toks = [t for t in key.split() if t not in STOPWORDS and t not in ORG_SUFFIX and t not in {"australia", "australian"}]
    return toks[0] if toks else (key.split() or [""])[0]


class Index:
    def __init__(self, path: Path):
        self.db = sqlite3.connect(f"file:{path}?mode=ro", uri=True)
        self.db.row_factory = sqlite3.Row

    def by_exact(self, key: str):
        return self.db.execute("SELECT * FROM names WHERE norm_exact = ?", (key,)).fetchall()

    def by_rule(self, key: str):
        return self.db.execute("SELECT * FROM names WHERE norm_rule = ?", (key,)).fetchall()

    def main_name(self, abn: str):
        r = self.db.execute("SELECT name FROM names WHERE abn = ? AND ntype = 'MN' LIMIT 1", (abn,)).fetchone()
        return r["name"] if r else None


def _pick(rows, prefer_active=True):
    """-> (abn, row) if the rows point at exactly one ABN (active ones first), else (None, n_candidates)."""
    active = {r["abn"]: r for r in rows if r["status"] == "ACT"}
    pool = active if (active and prefer_active) else {r["abn"]: r for r in rows}
    if len(pool) == 1:
        abn, row = next(iter(pool.items()))
        return abn, row
    return None, len(pool)


def match_entity(idx: Index, canonical: str, aliases: list[str]) -> dict | None:
    """One entity -> {abn, name, status, entity_type, state, postcode, method, matched} or
    {abn: None, candidates, method: 'ambiguous'} or None."""
    names = [canonical] + [a for a in aliases if a != canonical]
    ambiguous = None
    # 1 + 2: canonical against main names
    for method, keyf, lookup in (("main_exact", norm_exact, idx.by_exact), ("main_rule", norm_rule, idx.by_rule)):
        rows = [r for r in lookup(keyf(canonical)) if r["ntype"] == "MN"]
        if rows:
            abn, row = _pick(rows)
            if abn:
                return _hit(abn, row, method, canonical)
            ambiguous = ambiguous or {"abn": None, "method": "ambiguous", "candidates": row, "matched": canonical, "on": method}
    # 3: any alias against main names
    for a in names[1:]:
        if looks_like_person(a):
            continue
        rows = [r for r in idx.by_rule(norm_rule(a)) if r["ntype"] == "MN"]
        if rows:
            abn, row = _pick(rows)
            if abn:
                return _hit(abn, row, "alias_main", a)
            ambiguous = ambiguous or {"abn": None, "method": "ambiguous", "candidates": row, "matched": a, "on": "alias_main"}
    # 4: business / trading names, guarded by the main name sharing the first token
    ft = _first_token(norm_rule(canonical))
    for a in names:
        if looks_like_person(a):
            continue
        rows = [r for r in idx.by_rule(norm_rule(a)) if r["ntype"] in ("BN", "TRD", "OTN")]
        if not rows:
            continue
        abn, row = _pick(rows)
        if abn:
            main = idx.main_name(abn) or ""
            if ft and _first_token(norm_rule(main)) == ft:
                hit = _hit(abn, row, "business_name", a)
                hit["name"] = main
                return hit
    return ambiguous


def _hit(abn, row, method, matched):
    return {"abn": abn, "name": row["name"], "status": row["status"], "entity_type": row["etype"],
            "state": row["state"], "postcode": row["postcode"], "method": method, "matched": matched}


def load_entities_from_db(db_path: str) -> list[dict]:
    db = sqlite3.connect(f"file:{db_path}?mode=ro", uri=True)
    db.execute("PRAGMA busy_timeout = 600000")
    ents = {r[0]: {"id": r[0], "canonical": r[1], "kind": r[2], "abn": r[3], "aliases": []}
            for r in db.execute("SELECT entity_id, canonical_name, kind, abn FROM ext_donor_entities")}
    for eid, raw in db.execute("SELECT entity_id, alias_raw FROM ext_donor_aliases"):
        if eid in ents:
            ents[eid]["aliases"].append(raw)
    db.close()
    return list(ents.values())


def load_entities_from_dump(path: str) -> list[dict]:
    data = json.load(open(path, encoding="utf-8"))
    return [{"id": e["id"], "canonical": e["canonical"], "kind": e["kind"], "abn": e.get("abn"),
             "aliases": [a["raw"] for a in e["aliases"]]} for e in data]


def match(abr_dir: Path, entities: list[dict], out: Path, only_kinds=("company", "union", "association", "other")) -> None:
    idx = Index(abr_dir / INDEX_NAME)
    matches, stats = {}, defaultdict(int)
    t0 = time.time()
    for i, e in enumerate(entities):
        if e["kind"] not in only_kinds:
            stats["skipped_kind"] += 1
            continue
        m = match_entity(idx, e["canonical"], e["aliases"])
        if m is None:
            stats["no_match"] += 1
            continue
        stats[m["method"]] += 1
        matches[e["id"]] = m
        if i and i % 2000 == 0:
            log(f"  {i:,}/{len(entities):,} entities, {time.time() - t0:.0f}s")
    meta = {"generated": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"), "source": LICENCE,
            "source_url": SOURCE_URL, "entities": len(entities), "stats": dict(stats)}
    json.dump({"meta": meta, "matches": matches}, open(out, "w", encoding="utf-8"), ensure_ascii=False, indent=0)
    log(f"matched: {dict(stats)} -> {out}")


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    ap.add_argument("phase", choices=["scan", "match"])
    ap.add_argument("--abr-dir", default=str(ABR_DIR))
    ap.add_argument("--workers", type=int, default=max(2, (os.cpu_count() or 4) - 2))
    ap.add_argument("--db", default=None, help="parli.db with ext_donor_entities/aliases (match)")
    ap.add_argument("--dump", default=None, help="resolver --dump JSON instead of --db (match)")
    ap.add_argument("--out", default=None, help="matches JSON path (match)")
    args = ap.parse_args()
    abr_dir = Path(args.abr_dir).expanduser()
    if args.phase == "scan":
        scan(abr_dir, args.workers)
        return
    if args.dump:
        ents = load_entities_from_dump(args.dump)
    else:
        ents = load_entities_from_db(args.db or "/home/jake/.cache/autoresearch/parli.db")
    match(abr_dir, ents, Path(args.out or (abr_dir / "matches.json")).expanduser())


if __name__ == "__main__":
    main()
