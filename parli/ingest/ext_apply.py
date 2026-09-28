"""parli.ingest.ext_apply -- staged, guarded, id-preserving replacement of an ext_* register.

The ext_* loaders replace a whole source (DELETE ... INSERT). That is fine for a one-off load
on a scratch file but wrong for an unattended refresh of the live database: a bad fetch wipes
a register, every row id changes, and reviewed industry labels are lost. The 21 Sep 2026
refresh therefore fetched into a separate SQLite file and reconciled it into parli.db with
throw-away scripts; this module is that reconcile, made permanent.

    1. run the ordinary loader against a STAGING file        (loader ... --db stage.sqlite)
    2. python scripts/ext_apply.py <profile> --stage stage.sqlite --db parli.db

For every (table, source) the profile covers, ext_apply

  * refuses the source when the staged set is empty, or smaller than `min_ratio` (default 0.9,
    per-source overridable) of what is stored: nothing for that source is touched;
  * keeps the row id of every row the fresh fetch reproduces unchanged (multiset match on all
    source columns; live-only columns such as reviewed `industry` labels stay put);
  * updates in place, keeping the id and the labels, a row the source amended, when the table
    has an identity (register id, GUID) that finds it again;
  * inserts the genuinely new rows, carrying a reviewed label from earlier rows with the same
    label key (donor name) when they agree on one;
  * archives the superseded rows (deleted, and the pre-image of updated ones) as JSON under
    ~/.cache/opax/archive/<source>/<date>.json, with a sha256 in the report and the log;
  * applies everything in ONE transaction (BEGIN IMMEDIATE), checks that the stored rows now
    equal the staged rows column for column, and rolls back if they do not;
  * logs each applied (table, source) to ext_ingest_log.

A source is all-or-nothing across its tables (a lobbyist register's firms, clients, people and
contacts move together). Sources are independent of each other unless --strict.

Exit status: 0 = every requested source applied or already identical; 3 = at least one source
was refused or missing from the stage (the good ones were still applied unless --strict);
2 = usage / schema error (nothing applied).

Profiles: donations, lobbyists, fits, grants (windowed: only rows published on/after --since).
"""

from __future__ import annotations

import argparse
import collections
import datetime as _dt
import hashlib
import json
import os
import sqlite3
import sys
from dataclasses import dataclass, field
from pathlib import Path
from typing import Callable, Iterable, Sequence
from urllib.parse import quote

DEFAULT_MIN_RATIO = 0.9
DEFAULT_ARCHIVE_DIR = "~/.cache/opax/archive"

EXIT_OK = 0
EXIT_USAGE = 2
EXIT_REFUSED = 3


class ExtApplyError(RuntimeError):
    """Schema drift, a failed post-condition, or bad usage: nothing was applied."""


# ── profiles ─────────────────────────────────────────────────────────────────

@dataclass(frozen=True)
class TableSpec:
    table: str
    group_col: str = "source"                 # rows are reconciled per value of this column
    ignore: tuple = ("id", "ingested_at")     # never part of "did the source change this row?"
    identity: tuple | None = None             # columns that find the same record again after an amendment
    identity_unique: bool = False             # identity is a unique key: look outside the scope for it too
    label_cols: tuple = ()                    # live-only review columns (kept on unchanged / updated rows)
    label_key: str | None = None              # carry labels onto NEW rows from old rows sharing this column
    window_col: str | None = None             # profile is windowed on this column (needs --since)


@dataclass(frozen=True)
class Profile:
    name: str
    tables: tuple
    expected_sources: tuple = ()              # a source listed here but absent from the stage is "missing"


PROFILES: dict[str, Profile] = {
    "donations": Profile(
        "donations",
        (TableSpec("ext_donations", ignore=("id", "ingested_at", "industry", "industry_source"),
                   identity=("source", "source_record_id"),
                   label_cols=("industry", "industry_source"), label_key="donor_name"),),
        expected_sources=("qld_ecq", "vic_vec", "tas_tec"),
    ),
    "lobbyists": Profile(
        "lobbyists",
        (TableSpec("ext_lobbyists", identity=("source", "register_id")),
         TableSpec("ext_lobbyist_clients"),
         TableSpec("ext_lobbyist_people"),
         TableSpec("ext_lobbyist_contacts", identity=("source", "record_id"))),
        expected_sources=("agd_register", "nsw_ec_register", "qld_integrity", "vic_vpsc", "sa_dpc", "wa_psc"),
    ),
    "fits": Profile(
        "fits",
        (TableSpec("ext_fits_registrants", identity=("source", "registrant_id")),
         TableSpec("ext_fits_principals", identity=("source", "principal_id")),
         TableSpec("ext_fits_registrations", identity=("source", "registrant_id", "principal_id")),
         TableSpec("ext_fits_activities", identity=("source", "activity_id"))),
        expected_sources=("agd_fits_register",),
    ),
    "grants": Profile(
        "grants",
        # `window` names the fetch window a row came from (loader bookkeeping, not source data): the same award
        # fetched in a differently split window is not a change
        (TableSpec("ext_grants", ignore=("id", "ingested_at", "window"), identity=("source", "ga_id"),
                   identity_unique=True, window_col="publish_date"),),
        expected_sources=("grantconnect",),
    ),
}


# ── small helpers ────────────────────────────────────────────────────────────

def _q(name: str) -> str:
    return '"' + name.replace('"', '""') + '"'


def _columns(con: sqlite3.Connection, table: str) -> list[str]:
    return [r[1] for r in con.execute(f"PRAGMA table_info({_q(table)})")]


def _now() -> str:
    return _dt.datetime.now(_dt.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def _scope(spec: TableSpec, since: str | None) -> tuple[str, list]:
    """WHERE fragment (after the group column) restricting a table to the profile's scope."""
    if spec.window_col:
        if not since:
            raise ExtApplyError(f"{spec.table}: this profile is windowed on {spec.window_col}; pass --since YYYY-MM-DD")
        return f" AND {_q(spec.window_col)} >= ?", [since]
    return "", []


def _fetch(con: sqlite3.Connection, spec: TableSpec, source: str, since: str | None) -> list[dict]:
    """The rows of `source` in scope, each with `__rid` = the SQLite rowid."""
    if not _columns(con, spec.table):
        return []
    frag, params = _scope(spec, since)
    cur = con.execute(f"SELECT rowid AS __rid, * FROM {_q(spec.table)} WHERE {_q(spec.group_col)} = ?{frag}", [source, *params])
    names = [d[0] for d in cur.description]
    return [dict(zip(names, r)) for r in cur.fetchall()]


def _sources(con: sqlite3.Connection, spec: TableSpec) -> set[str]:
    if not _columns(con, spec.table):
        return set()
    return {r[0] for r in con.execute(f"SELECT DISTINCT {_q(spec.group_col)} FROM {_q(spec.table)}") if r[0] is not None}


def _open_readonly(path: Path) -> sqlite3.Connection:
    if not path.exists():
        raise ExtApplyError(f"stage file not found: {path}")
    return sqlite3.connect(f"file:{quote(str(path.resolve()))}?mode=ro", uri=True)


# ── the plan for one (table, source) ─────────────────────────────────────────

@dataclass
class TablePlan:
    table: str
    source: str
    old_n: int = 0
    new_n: int = 0
    unchanged: int = 0
    updates: list = field(default_factory=list)    # (old_row, new_row): amended, updated in place
    inserts: list = field(default_factory=list)    # new rows (labels already carried)
    removed: list = field(default_factory=list)    # old rows with no counterpart in the stage
    new_rows: list = field(default_factory=list)   # every staged row (for the post-condition)
    refusal: str | None = None
    compare_cols: list = field(default_factory=list)
    write_cols: list = field(default_factory=list)
    labels_carried: int = 0

    @property
    def changed(self) -> bool:
        return bool(self.updates or self.inserts or self.removed)


def guard(old_n: int, new_n: int, min_ratio: float) -> str | None:
    """Refusal reason for replacing old_n stored rows with new_n staged rows, else None."""
    if new_n <= 0:
        return "staged set is empty" + (f" ({old_n:,} rows stored)" if old_n else "")
    if old_n > 0 and new_n < old_n * min_ratio:
        return f"staged set has {new_n:,} rows against {old_n:,} stored: below {min_ratio:.0%}"
    return None


def plan_table(spec: TableSpec, source: str, old: list[dict], new: list[dict], live_cols: Sequence[str],
               stage_cols: Sequence[str], min_ratio: float,
               live_lookup: Callable[[dict], dict | None] | None = None) -> TablePlan:
    """Diff staged rows against stored rows. Pure: no database access beyond `live_lookup`.

    `old` / `new` carry `__rid`. `live_lookup(identity_dict)` finds a stored row by unique identity
    outside the scope (an award that re-enters the publication window).
    """
    plan = TablePlan(spec.table, source, old_n=len(old), new_n=len(new), new_rows=new)
    unknown = [c for c in stage_cols if c not in live_cols and c not in spec.ignore]
    if unknown:
        raise ExtApplyError(f"{spec.table}: staged columns missing from the live table: {unknown} (schema drift; migrate first)")
    plan.compare_cols = [c for c in stage_cols if c not in spec.ignore and c != "__rid"]
    plan.write_cols = [c for c in stage_cols if c in live_cols and c not in ("id", "__rid") and c not in spec.label_cols]
    plan.refusal = guard(len(old), len(new), min_ratio)
    if plan.refusal:
        return plan

    def key(row: dict) -> tuple:
        return tuple(row.get(c) for c in plan.compare_cols)

    pool: dict[tuple, list[dict]] = collections.defaultdict(list)
    for r in old:
        pool[key(r)].append(r)
    used: set = set()
    added: list[dict] = []
    for r in new:
        bucket = pool.get(key(r))
        if bucket:
            used.add(bucket.pop()["__rid"])
            plan.unchanged += 1
        else:
            added.append(r)
    removed = [r for r in old if r["__rid"] not in used]

    if spec.identity:
        def ident(r: dict):
            vals = tuple(r.get(c) for c in spec.identity)
            return vals if all(v not in (None, "") for v in vals) else None

        rem_by: dict = collections.defaultdict(list)
        for r in removed:
            i = ident(r)
            if i:
                rem_by[i].append(r)
        add_count = collections.Counter(i for i in (ident(r) for r in added) if i)
        retained: set = set()
        left: list[dict] = []
        for r in added:
            i = ident(r)
            match = None
            if i and add_count[i] == 1:
                cands = [c for c in rem_by.get(i, []) if c["__rid"] not in retained]
                if len(cands) == 1:
                    match = cands[0]
                elif not cands and spec.identity_unique and live_lookup is not None:
                    outside = live_lookup(dict(zip(spec.identity, i)))
                    if outside is not None and outside["__rid"] not in used and outside["__rid"] not in retained:
                        match = outside
            if match is not None:
                retained.add(match["__rid"])
                plan.updates.append((match, r))
            else:
                left.append(r)
        added = left
        removed = [r for r in removed if r["__rid"] not in retained]

    labels: dict = {}
    if spec.label_key and spec.label_cols:
        seen: dict = collections.defaultdict(set)
        for r in old:
            if any(r.get(c) is not None for c in spec.label_cols):
                seen[r.get(spec.label_key)].add(tuple(r.get(c) for c in spec.label_cols))
        labels = {k: next(iter(v)) for k, v in seen.items() if len(v) == 1}
    for r in added:
        row = dict(r)
        known = labels.get(r.get(spec.label_key)) if labels else None
        if known:
            for c, v in zip(spec.label_cols, known):
                row[c] = v
            plan.labels_carried += 1
        plan.inserts.append(row)
    plan.removed = removed
    return plan


# ── archive ──────────────────────────────────────────────────────────────────

def _clean(row: dict) -> dict:
    out = {k: v for k, v in row.items() if k != "__rid"}
    out["rowid"] = row["__rid"]
    return out


def write_archive(archive_dir: Path, source: str, plans: list[TablePlan], profile: str, since: str | None) -> tuple[Path, str]:
    """Write the superseded rows of one source (all its tables) as JSON; return (path, sha256)."""
    d = archive_dir / source
    d.mkdir(parents=True, exist_ok=True)
    today = _dt.date.today().isoformat()
    path = d / f"{today}.json"
    if path.exists():
        path = d / f"{today}-{_dt.datetime.now().strftime('%H%M%S%f')}.json"
    doc = {
        "profile": profile, "source": source, "archived_at": _now(), "window_since": since,
        "note": ("rows superseded by ext_apply: `removed` were deleted; `amended_before` are the "
                 "pre-images of rows updated in place (same rowid)"),
        "tables": {p.table: {"removed": [_clean(r) for r in p.removed],
                             "amended_before": [_clean(o) for o, _ in p.updates]} for p in plans},
    }
    data = json.dumps(doc, ensure_ascii=False, default=str).encode("utf-8")
    tmp = path.with_name(path.name + ".tmp")
    with open(tmp, "wb") as f:
        f.write(data)
        f.flush()
        os.fsync(f.fileno())
    os.replace(tmp, path)
    return path, hashlib.sha256(data).hexdigest()


# ── apply ────────────────────────────────────────────────────────────────────

INGEST_LOG_DDL = """CREATE TABLE IF NOT EXISTS ext_ingest_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    table_name TEXT NOT NULL,
    source TEXT NOT NULL,
    rows_loaded INTEGER,
    rows_deleted INTEGER,
    loaded_at TEXT NOT NULL,
    notes TEXT
)"""


def _plan_summary(p: TablePlan) -> dict:
    d = {"old": p.old_n, "new": p.new_n, "unchanged_ids": p.unchanged, "amended_in_place": len(p.updates),
         "inserted": len(p.inserts), "superseded": len(p.removed), "labels_carried": p.labels_carried}
    if p.refusal:
        d["refusal"] = p.refusal
    return d


def _apply_plan(con: sqlite3.Connection, spec: TableSpec, p: TablePlan, since: str | None) -> None:
    t = _q(p.table)
    con.executemany(f"DELETE FROM {t} WHERE rowid = ?", [(r["__rid"],) for r in p.removed])
    for old, new in p.updates:
        cols = [c for c in p.write_cols if c in new]
        con.execute(f"UPDATE {t} SET {', '.join(_q(c) + ' = ?' for c in cols)} WHERE rowid = ?",
                    [new[c] for c in cols] + [old["__rid"]])
    live_cols = set(_columns(con, p.table))
    for row in p.inserts:
        cols = [c for c in row if c in live_cols and c not in ("id", "__rid")]
        con.execute(f"INSERT INTO {t} ({', '.join(_q(c) for c in cols)}) VALUES ({', '.join('?' for _ in cols)})",
                    [row[c] for c in cols])
    # post-condition: the scope now equals the stage, column for column
    frag, params = _scope(spec, since)
    got = con.execute(f"SELECT {', '.join(_q(c) for c in p.compare_cols)} FROM {t} WHERE {_q(spec.group_col)} = ?{frag}",
                      [p.source, *params]).fetchall()
    want = collections.Counter(tuple(r.get(c) for c in p.compare_cols) for r in p.new_rows)
    if collections.Counter(map(tuple, got)) != want:
        raise ExtApplyError(f"{p.table} source={p.source}: stored rows do not equal the staged rows after apply; rolled back")


def apply_profile(profile: Profile | str, live_path: str | Path, stages: Sequence[str | Path], *,
                  min_ratio: float = DEFAULT_MIN_RATIO, source_ratio: dict[str, float] | None = None,
                  only_sources: Iterable[str] | None = None, since: str | None = None,
                  archive_dir: str | Path = DEFAULT_ARCHIVE_DIR, dry_run: bool = False,
                  strict: bool = False) -> dict:
    """Reconcile the staged files into the live database; return the report (the CLI prints it as JSON)."""
    prof = PROFILES[profile] if isinstance(profile, str) else profile
    source_ratio = source_ratio or {}
    wanted = set(only_sources) if only_sources else None
    archive_root = Path(archive_dir).expanduser()
    stage_cons = [_open_readonly(Path(s).expanduser()) for s in stages]
    live_file = Path(live_path).expanduser()
    if not live_file.exists():
        raise ExtApplyError(f"live database not found: {live_file}")
    con = sqlite3.connect(str(live_file), timeout=600, isolation_level=None)   # explicit transactions below
    written: list[Path] = []
    try:
        con.execute("PRAGMA busy_timeout = 600000")
        report = {"profile": prof.name, "live": str(live_file), "stages": [str(s) for s in stages],
                  "min_ratio": min_ratio, "since": since, "dry_run": dry_run, "checked_at": _now(),
                  "strict": strict, "sources": {}, "exit": EXIT_OK}

        # which stage holds which (table, source)
        stage_of: dict[tuple, sqlite3.Connection] = {}
        for spec in prof.tables:
            for sc in stage_cons:
                for src in _sources(sc, spec):
                    if (spec.table, src) in stage_of:
                        raise ExtApplyError(f"{spec.table} source {src!r} is in two stage files; stage each source once")
                    stage_of[(spec.table, src)] = sc
        sources = {s for (_, s) in stage_of} | set(prof.expected_sources)
        if wanted is not None:
            sources &= wanted
            sources |= wanted

        # BEGIN IMMEDIATE first: the stored rows we plan against are the rows we change
        con.execute("BEGIN IMMEDIATE")
        try:
            plans: dict[str, list[TablePlan]] = {}
            for src in sorted(sources):
                for spec in prof.tables:
                    live_cols = _columns(con, spec.table)
                    sc = stage_of.get((spec.table, src))
                    if not live_cols:
                        if sc is None:
                            continue
                        raise ExtApplyError(f"live database has no table {spec.table}")
                    old = _fetch(con, spec, src, since)
                    new = _fetch(sc, spec, src, since) if sc is not None else []
                    if not old and not new:
                        continue
                    stage_cols = _columns(sc, spec.table) if sc is not None else live_cols

                    def lookup(ident: dict, _spec=spec) -> dict | None:
                        cond = " AND ".join(f"{_q(c)} = ?" for c in _spec.identity)
                        cur = con.execute(f"SELECT rowid AS __rid, * FROM {_q(_spec.table)} WHERE {cond}",
                                          [ident[c] for c in _spec.identity])
                        names = [d[0] for d in cur.description]
                        row = cur.fetchone()
                        return dict(zip(names, row)) if row else None

                    plans.setdefault(src, []).append(
                        plan_table(spec, src, old, new, live_cols, stage_cols, source_ratio.get(src, min_ratio), lookup))

            refused = {s: [p for p in ps if p.refusal] for s, ps in plans.items()}
            refused = {s: ps for s, ps in refused.items() if ps}
            missing = sorted(s for s in prof.expected_sources if (wanted is None or s in wanted) and s not in plans)
            todo = {s: ps for s, ps in plans.items() if s not in refused}
            if strict and (refused or missing):
                todo = {}
            for s in sorted(set(plans) | set(missing)):
                ps = plans.get(s, [])
                entry: dict = {"tables": {p.table: _plan_summary(p) for p in ps}}
                if s in refused:
                    entry["status"] = "refused"
                    entry["reason"] = "; ".join(f"{p.table}: {p.refusal}" for p in refused[s])
                elif s in missing:
                    entry["status"] = "missing"
                    entry["reason"] = "expected source has no rows in the stage and none stored"
                elif s not in todo:
                    entry["status"] = "not-applied"
                    entry["reason"] = "--strict and another source was refused or missing"
                elif not any(p.changed for p in ps):
                    entry["status"] = "unchanged"
                else:
                    entry["status"] = "would-apply" if dry_run else "applied"
                report["sources"][s] = entry

            if not dry_run:
                con.execute(INGEST_LOG_DDL)
                spec_of = {sp.table: sp for sp in prof.tables}
                for src, ps in todo.items():
                    if not any(p.changed for p in ps):
                        continue
                    arch_path, sha = write_archive(archive_root, src, ps, prof.name, since)
                    written.append(arch_path)
                    report["sources"][src]["archive"] = str(arch_path)
                    report["sources"][src]["archive_sha256"] = sha
                    for p in ps:
                        _apply_plan(con, spec_of[p.table], p, since)
                        con.execute(
                            "INSERT INTO ext_ingest_log (table_name, source, rows_loaded, rows_deleted, loaded_at, notes) "
                            "VALUES (?,?,?,?,?,?)",
                            (p.table, src, len(p.inserts) + len(p.updates), len(p.removed) + len(p.updates), _now(),
                             f"ext_apply {prof.name}: unchanged={p.unchanged} amended_in_place={len(p.updates)} "
                             f"inserted={len(p.inserts)} superseded={len(p.removed)} old={p.old_n} new={p.new_n} "
                             f"archive={arch_path} sha256={sha}"))
                con.execute("COMMIT")
            else:
                con.execute("ROLLBACK")
        except BaseException:
            if con.in_transaction:
                con.execute("ROLLBACK")
            # an archive written for a transaction that never committed must not pass for the record of one
            for path in written:
                if path.exists():
                    os.replace(path, path.with_name(path.name + ".aborted"))
            raise
        if refused or missing:
            report["exit"] = EXIT_REFUSED
        return report
    finally:
        con.close()
        for sc in stage_cons:
            sc.close()


# ── CLI ──────────────────────────────────────────────────────────────────────

def main(argv: Sequence[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    ap.add_argument("profile", choices=sorted(PROFILES))
    ap.add_argument("--db", default=os.environ.get("OPAX_DB") or "~/.cache/autoresearch/parli.db",
                    help="the live parli.db (default: $OPAX_DB, else ~/.cache/autoresearch/parli.db)")
    ap.add_argument("--stage", action="append", default=[], help="staging SQLite file (repeatable)")
    ap.add_argument("--stage-dir", help="apply every *.sqlite in this directory")
    ap.add_argument("--min-ratio", type=float, default=DEFAULT_MIN_RATIO,
                    help="refuse a source when staged rows < ratio x stored rows (default %(default)s)")
    ap.add_argument("--source-ratio", action="append", default=[], metavar="SOURCE=RATIO",
                    help="per-source override of --min-ratio, e.g. tas_tec=0.7 (repeatable)")
    ap.add_argument("--source", action="append", default=[], help="only these source keys (repeatable)")
    ap.add_argument("--since", help="windowed profiles (grants): only rows published on/after this date")
    ap.add_argument("--archive-dir", default=DEFAULT_ARCHIVE_DIR,
                    help="where superseded rows are archived (default %(default)s)")
    ap.add_argument("--strict", action="store_true", help="apply nothing if any source is refused or missing")
    ap.add_argument("--dry-run", action="store_true", help="plan and report; write nothing (no archive, no log)")
    ap.add_argument("--report", help="also write the JSON report to this file")
    args = ap.parse_args(argv)

    stages = list(args.stage)
    if args.stage_dir:
        stages += sorted(str(p) for p in Path(args.stage_dir).expanduser().glob("*.sqlite"))
    if not stages:
        ap.error("give --stage FILE (repeatable) or --stage-dir DIR (no *.sqlite found there?)")
    ratios: dict[str, float] = {}
    for item in args.source_ratio:
        k, _, v = item.partition("=")
        ratios[k] = float(v)
    try:
        report = apply_profile(args.profile, args.db, stages, min_ratio=args.min_ratio, source_ratio=ratios,
                               only_sources=args.source or None, since=args.since, archive_dir=args.archive_dir,
                               dry_run=args.dry_run, strict=args.strict)
    except ExtApplyError as e:
        print(f"ext_apply: {e}", file=sys.stderr)
        return EXIT_USAGE
    text = json.dumps(report, indent=2, ensure_ascii=False, default=str)
    print(text)
    if args.report:
        Path(args.report).expanduser().write_text(text)
    for s, e in report["sources"].items():
        if e["status"] in ("refused", "missing"):
            print(f"ext_apply: {e['status'].upper()} {s}: {e['reason']}", file=sys.stderr)
    return report["exit"]


if __name__ == "__main__":
    sys.exit(main())
