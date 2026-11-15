"""
Migrate the OPAX text corpus from parli.db into the Progress Agentic RAG
knowledge box. Resumable, backpressure-aware, cost-guarded.

What migrates here is the TEXT corpus only:
  speeches         1.19M rows, ~4.4B chars   -> resource slug speech-{speech_id}
  legal_documents  232K rows,  ~9.2B chars   -> resource slug legal-{doc_id}

News articles are excluded from the corpus.

Structured tables (votes, donations, contracts, members, ...) stay in
Postgres/SQLite — they are relational analytics, not retrieval documents.

COST GUARD: a full run pushes ~13.6 GB of text through platform processing.
The script refuses to run more than --limit 100 per table unless --full is
passed. No enrichment (DA) task is ever registered or started from here.

Run on the machine that has parli.db (the WSL box):
  uv run python -m parli.ingest.arag_sync --tables speeches --limit 25   # smoke test
  uv run python -m parli.ingest.arag_sync --tables speeches,legal_documents --full

Checkpoint: ~/.cache/autoresearch/arag_sync_state.json (per-table last rowid
+ failed ids). Re-running skips everything already pushed; --retry-failed
re-attempts recorded failures.
"""

import os
import argparse
import json
import sqlite3
import sys
import time
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path
from typing import Any, Iterator, Optional

from parli.arag import AragConfig, AragError, KbClient, load_dotenv
from parli.ingest import nsw_publication, backfill_guard as growth
from itertools import groupby
from parli.ingest.speaker_roles import chair_role, chair_party_sql
from parli.ingest import senate_backfill_policy as senate_policy
from parli.ingest.speech_hygiene import (
    clean_party,
    clean_speaker_name,
    clean_speech_text,
    legacy_clean_speech_text,
)

STATE_PATH = Path("~/.cache/autoresearch/arag_sync_state.json").expanduser()
SPEECH_REPAIR_STATE_PATH = Path(
    "~/.cache/autoresearch/arag_speech_text_repair_state.json"
).expanduser()
DB_PATH = Path(os.environ.get("OPAX_DB") or "~/.cache/autoresearch/parli.db").expanduser()

# Corpus cutoff: nothing predating any currently serving parliamentarian.
# The members table is too dirty to derive this (1901 senators linked to
# current members), so it's pinned to the March 1993 federal election — the
# entry of the longest-serving current federal MP (Bob Katter). Speeches
# under 200 chars are procedural fragments ("business start") — excluded.
# Together these halve the speech corpus: 627K rows / 2.22 GB kept.
DEFAULT_SINCE = "1993-03-13"
MIN_SPEECH_CHARS = 200

# Junk exclusions from the 2026-09-01 corpus QA pass (measured on the
# post-filter 627K set; ~34K rows, 5.4%). P-numbers match MIGRATION-ARAG.md.
# NULL-SAFETY: topic is 100% NULL for zenodo and speaker_name is NULL on 9K
# rows; a bare `topic IN (...)` yields NULL, which poisons the whole
# `NOT (a OR b OR ...)` chain and silently drops the row. Every nullable
# column below therefore goes through COALESCE.
JUNK_PREDICATES = " AND NOT (" + " OR ".join([
    # P1 zenodo division roll-calls / incorporated tables (4,074)
    "(source='zenodo' AND COALESCE(speaker_name,'')='stage direction')",
    # P2 presiding-officer procedural rows, all sources (27,233)
    "((source='openaustralia' AND " + chair_party_sql() + ") OR (source!='openaustralia' AND ("
    "UPPER(COALESCE(speaker_name,'')) LIKE '%SPEAKER%'"
    " OR UPPER(COALESCE(speaker_name,'')) LIKE '%PRESIDENT%'"
    " OR UPPER(COALESCE(speaker_name,'')) LIKE '%CHAIR%')))",
    # P3 qld whole-day TOC documents (50)
    "(source='qld_hansard' AND text LIKE '%ISSN 1322-0330%')",
    # P4 nsw alphabetical day indexes (119)
    "(source='nsw_hansard' AND COALESCE(topic,'')='Start of Day')",
    # P5 gallery welcomes / notice boilerplate (2,362)
    "(COALESCE(topic,'') IN ('Visitors','Distinguished Visitors','Postponement of Business')"
    " OR (source='openaustralia' AND COALESCE(topic,'')='Notices'))",
    # P6 nsw clerk ceremonial records (186)
    "(source='nsw_hansard' AND substr(text,1,300) LIKE '%The Clerk announced%')",
    # P7 qld standalone division roll-calls (56)
    "(source='qld_hansard' AND text LIKE '%Division: Question put%'"
    " AND text LIKE '%AYES%' AND LENGTH(text)<2000)",
]) + ")"

# Dedupe rules from the 2026-09-01 QA pass (validated live; final ~550K):
#  a) wragge_xml is 1998-2005 federal House Hansard sitting entirely inside
#     zenodo's coverage (94% prefix-confirmed redundant) — dropped wholesale.
#  b) zenodo is House-ONLY; openaustralia House rows on zenodo sitting dates
#     are redundant, its Senate rows and post-2022 House rows are unique.
#  c) exact (date, speaker_name, text) duplicates — 17.8K rows, almost all
#     committee_senate transcripts double-ingested on 8 dates.
# The temp tables are built once per run by prepare_dedupe() (TEMP tables are
# writable even on a read-only connection).
DEDUPE_PREDICATES = (
    " AND source != 'wragge_xml'"
    " AND NOT (source='openaustralia' AND COALESCE(chamber,'')='representatives'"
    " AND date IN (SELECT date FROM temp.zenodo_dates))"
    " AND speech_id NOT IN (SELECT speech_id FROM temp.dedupe_excluded)"
)


def prepare_dedupe(db: sqlite3.Connection, since: str, after: int | None = None) -> None:
    """Materialize the zenodo sitting dates and the exact-duplicate exclusion
    set (window function over rows that would otherwise migrate, keeping the
    highest-priority source / lowest speech_id per (date, speaker, text)).

    `after` is the push checkpoint: only rows with a larger speech_id are about to be pushed, and a
    row's exclusion depends only on the rows sharing its date (the partition is date, speaker, text),
    so the window function runs over the dates that hold such rows instead of the whole table. On
    the whole table it partitions and sorts every speech's text (1.3M rows, 4.6 GB): two minutes on
    the desktop's NVMe, a night's worth of temp-file I/O on a network disk. Leave `after` unset (the
    repair path, --full) for every date."""
    t0 = time.time()
    owned_dates = (" OR speech_id IN (SELECT speech_id FROM nsw_backfill_turns WHERE speech_id IS NOT NULL)"
                   if nsw_publication.managed(db) else "")
    only_new_dates = (f"date IN (SELECT DISTINCT date FROM speeches WHERE speech_id > {int(after)}{owned_dates}) AND "
                      if after else "")
    db.execute("CREATE TEMP TABLE IF NOT EXISTS zenodo_dates AS "
               "SELECT DISTINCT date FROM speeches WHERE source='zenodo'")
    db.execute(f"""
        CREATE TEMP TABLE IF NOT EXISTS dedupe_excluded AS
        SELECT speech_id FROM (
            SELECT speech_id,
                   ROW_NUMBER() OVER (
                       PARTITION BY date, speaker_name, text
                       ORDER BY CASE source
                           WHEN 'zenodo' THEN 0 WHEN 'openaustralia' THEN 1
                           WHEN 'committee_senate' THEN 2 WHEN 'committee_house' THEN 2 WHEN 'committee_joint' THEN 2 WHEN 'nsw_hansard' THEN 3
                           WHEN 'vic_hansard' THEN 4 WHEN 'sa_hansard' THEN 5
                           WHEN 'qld_hansard' THEN 6 ELSE 7 END,
                         speech_id) AS rn
            FROM speeches
            WHERE {only_new_dates}date >= {since!r} AND LENGTH(text) >= {MIN_SPEECH_CHARS}
              AND source != 'wragge_xml'
              AND NOT (source='openaustralia' AND COALESCE(chamber,'')='representatives'
                       AND date IN (SELECT date FROM temp.zenodo_dates))
              {JUNK_PREDICATES}
        ) WHERE rn > 1
    """)
    n = db.execute("SELECT COUNT(*) FROM temp.dedupe_excluded").fetchone()[0]
    print(f"[dedupe] {n:,} duplicate speech_ids excluded "
          f"({time.time() - t0:.0f}s to materialize)")

# A single text field caps out well below this; split anything bigger into
# continuation fields on the same resource (legal docs reach 100s of KB).
MAX_FIELD_CHARS = 900_000

SAFETY_LIMIT = 100  # per-table cap unless --full

WORKERS = 10  # backpressure (429 try_after) throttles this automatically
MAX_SPEECH_REPAIRS_PER_RUN = 20_000
SPEECH_REPAIR_SAMPLE_SIZE = 50

# ---------------------------------------------------------------------------
# Row -> resource mapping
# ---------------------------------------------------------------------------


def _classifications(pairs: list[tuple[str, Optional[str]]]) -> list[dict]:
    return [
        {"labelset": labelset, "label": str(label)}
        for labelset, label in pairs
        if label not in (None, "", "None")
    ]


def _texts(body: str) -> dict[str, dict]:
    """Split oversized bodies into numbered continuation fields."""
    if len(body) <= MAX_FIELD_CHARS:
        return {"body": {"body": body, "format": "PLAIN"}}
    fields = {}
    for i in range(0, len(body), MAX_FIELD_CHARS):
        key = "body" if i == 0 else f"body-{i // MAX_FIELD_CHARS}"
        fields[key] = {"body": body[i : i + MAX_FIELD_CHARS], "format": "PLAIN"}
    return fields


def _optional_column(row: sqlite3.Row, name: str) -> Any:
    return row[name] if name in row.keys() else None


def map_speech(row: sqlite3.Row) -> dict:
    from parli.ingest.speaker_identity import resolve_attribution
    row = resolve_attribution(row)
    date = row["date"] or ""
    decade = f"{date[:3]}0s" if len(date) >= 4 and date[:4].isdigit() else None
    speaker = _optional_column(row, "speaker_name_clean") or clean_speaker_name(row["speaker_name"])
    party = _optional_column(row, "party_canonical") or clean_party(row["party"])
    clean_body = _optional_column(row, "text_clean")
    if clean_body is None:
        clean_body = clean_speech_text(
            row["text"], row["source"] or "", row["topic"], row["speaker_name"]
        )
    title_bits = [b for b in (speaker, row["topic"], date) if b]
    # Committee transcripts (parli.ingest.committee_witnesses): who the speaker
    # is at the table. A witness is never a member; the label lets the portal
    # say so, and the position and organisation come from the attendance list.
    speaker_type = _optional_column(row, "speaker_type")
    role = _optional_column(row, 'chair_role') or (chair_role(row['party']) if row['source'] == 'openaustralia' else None)
    if role:
        speaker_type = 'chair'
        party = None
        title_bits = [b for b in (role, row['topic'], date) if b]
    is_witness = bool(_optional_column(row, 'witness_name')) or speaker_type == 'witness'
    if is_witness:
        speaker_type = 'witness'
        party = None
    witness_position = _optional_column(row, "witness_position")
    witness_organisation = _optional_column(row, "witness_organisation")
    body = {
        "slug": f"speech-{row['speech_id']}",
        "title": (" — ".join(title_bits) or f"Speech {row['speech_id']}")[:2000],
        "texts": _texts(clean_body),
        "origin": {
            "source_id": "opax-parli",
            "collaborators": [speaker] if speaker and not role else [],
            **({"created": f"{date}T00:00:00Z"} if len(date) == 10 else {}),
        },
        "usermetadata": {
            "classifications": _classifications([
                ("kind", "speech"),
                ("source", row["source"]),
                ("state", row["state"] or "federal"),
                ("party", party),
                ("chamber", row["chamber"]),
                ("decade", decade),
                ("speaker_type", speaker_type),
                ("chair_role", role),
            ])
        },
        "extra": {
            "metadata": {
                "speech_id": row["speech_id"],
                "person_id": None if is_witness or role else row["person_id"],
                **({'chair_person_id': row['person_id']} if role else {}),
                "speaker_raw": row["speaker_name"],
                "electorate": None if is_witness else row["electorate"],
                "word_count": row["word_count"],
                "date": date,
                **{k: _optional_column(row, k) for k in ('gid', 'oa_office_id', 'citation_anchor', 'talktype',
                                                      'source_url', 'source_attribution', 'source_party', 'party_basis')
                   if _optional_column(row, k) is not None},
                **({"witness_position": witness_position} if witness_position else {}),
                **({"witness_organisation": witness_organisation} if witness_organisation else {}),
                **({'enrichment_budget': {'run_id': _optional_column(row, 'enrichment_run_id'),
                                         'max_usd': float(_optional_column(row, 'enrichment_max_usd'))}}
                   if _optional_column(row, 'enrichment_run_id') else {}),
            }
        },
    }
    stage = growth.stage_for(body)
    return growth.tag(body, stage) if stage else body


def map_legal(row: sqlite3.Row) -> dict:
    date = row["date"] or ""
    return {
        "slug": f"legal-{row['doc_id']}",
        "title": (row["title"] or row["citation"] or f"Legal document {row['doc_id']}")[:2000],
        "texts": _texts(row["text"] or ""),
        "origin": {
            "source_id": "open-australian-legal-corpus",
            **({"url": row["url"]} if row["url"] else {}),
            **({"created": f"{date[:10]}T00:00:00Z"} if len(date) >= 10 else {}),
        },
        "usermetadata": {
            "classifications": _classifications([
                ("kind", "legal"),
                ("doc_type", row["doc_type"]),
                ("jurisdiction", row["jurisdiction"]),
            ])
        },
        "extra": {
            "metadata": {
                "doc_id": row["doc_id"],
                "citation": row["citation"],
                "date": date,
            }
        },
    }


TABLES: dict[str, dict[str, Any]] = {
    "speeches": {
        "pk": "speech_id",
        "select": "SELECT * FROM speeches WHERE speech_id > ? AND text IS NOT NULL "
                  f"AND LENGTH(text) >= {MIN_SPEECH_CHARS} AND date >= {{since!r}} "
                  f"{JUNK_PREDICATES} {DEDUPE_PREDICATES} "
                  "ORDER BY speech_id LIMIT ?",
        "map": map_speech,
    },
    "legal_documents": {
        "pk": "doc_id",
        "select": "SELECT * FROM legal_documents WHERE doc_id > ? AND text IS NOT NULL "
                  "ORDER BY doc_id LIMIT ?",
        "map": map_legal,
    },

}


# ---------------------------------------------------------------------------
# Checkpoint state
# ---------------------------------------------------------------------------


def load_state() -> dict:
    if STATE_PATH.exists():
        return json.loads(STATE_PATH.read_text())
    return {"tables": {}}


def save_state(state: dict) -> None:
    STATE_PATH.parent.mkdir(parents=True, exist_ok=True)
    tmp = STATE_PATH.with_suffix(".tmp")
    tmp.write_text(json.dumps(state, indent=1))
    tmp.replace(STATE_PATH)


# ---------------------------------------------------------------------------
# Sync loop
# ---------------------------------------------------------------------------


def _push_one(kb: KbClient, body: dict, guard=None, deadline=None) -> tuple[str, Optional[str]]:
    """Returns (slug, error). A 409 slug conflict counts as already-done."""
    stage = growth.stage_for(body)
    if stage and not growth.enabled(stage):
        return body['slug'], growth.HOLD + f'{stage} disabled'
    try:
        if stage:
            if deadline is not None and time.monotonic() >= deadline:
                return body['slug'], growth.HOLD + 'normal-sync backfill time budget spent; resumes next night'
            growth.tag(body, stage)
            if guard is None:
                guard = growth.Guard()
                guard.check(kb, stage + '-sync')
            guard.ensure_running()
            with guard.request_scope():
                kb.create_resource(body)
        else:
            kb.create_resource(body)
        return body["slug"], None
    except growth.Stopped as exc:
        return body['slug'], growth.HOLD + str(exc)
    except AragError as e:
        if e.status == 409:
            return body["slug"], None
        if stage:
            # Also covers injected clients which raise without _request.
            try:
                # A real request has already retried and stopped on a persistent
                # network failure (arag._request); an injected client's single
                # network error holds the item until tomorrow instead.
                guard.response(e.status, e.detail, final=e.status != 0)
            except growth.Stopped as exc:
                return body['slug'], growth.HOLD + str(exc)
            return body['slug'], growth.HOLD + f'Progress HTTP {e.status}; retry next night'
        return body["slug"], f"{e.status}: {e.detail[:200]}"

def _batches(db: sqlite3.Connection, spec: dict, after: int, remaining: int,
             since: str, batch_size: int = 200) -> Iterator[list[sqlite3.Row]]:
    select = spec["select"].format(since=since)
    if spec['pk'] == 'speech_id':
        select = select.replace('ORDER BY speech_id LIMIT ?', nsw_publication.exclude_sql(db) + ' ORDER BY speech_id LIMIT ?')
    while remaining > 0:
        rows = db.execute(select, (after, min(batch_size, remaining))).fetchall()
        if not rows:
            return
        yield rows
        after = rows[-1][0] if spec["pk"] == "rowid" else rows[-1][spec["pk"]]
        remaining -= len(rows)


BUDGET_ENVS = ('OPAX_SENATE_BACKFILL_BUDGET_SECONDS', 'OPAX_BACKFILL_NSW_BUDGET_S')


class BackfillPublication:
    """Counters bracket normal sync too, including queued/retried old IDs.

    Acquisition order keeps a chamber-day contiguous across batches. Check at
    the next day's boundary after ten days, and at the end even for short runs.
    """
    def __init__(self, kb):
        self.kb, self.guard = kb, growth.Guard()
        self.stages, self.day, self.days = set(), None, 0
        self.deadline = None

    def before(self, stage, day, batch=1):
        if not stage or not growth.enabled(stage):
            return
        self.guard.ensure_running()
        if self.deadline is None:
            # One budget for the whole sync run, shared by Senate and NSW: the
            # clock starts at the first backfill publication of either stage
            # and the tighter of the two configured budgets applies.
            try:
                budgets = [float(os.environ.get(env, '1200')) for env in BUDGET_ENVS]
            except ValueError:
                budgets = [0.0]
            if not all(0 < seconds <= 1200 for seconds in budgets):
                raise growth.Stopped('invalid backfill publication budget; must be 1..1200 seconds')
            seconds = min(budgets)
            # Never past the nightly backfill cutoff (nightly.sh section 1z).
            not_after = os.environ.get('OPAX_BACKFILL_NOT_AFTER')
            if not_after is not None:
                try:
                    seconds = min(seconds, int(not_after) - time.time())
                except ValueError:
                    seconds = 0
                if seconds <= 0:
                    raise growth.Stopped('past the nightly backfill cutoff; resumes next night')
            self.deadline = time.monotonic() + seconds
        if time.monotonic() >= self.deadline:
            raise growth.Stopped('normal-sync backfill time budget spent; resumes next night')
        key = (stage, day)
        if stage not in self.stages or (key != self.day and self.days >= growth.CHECK_DAYS):
            self.guard.check(self.kb, stage + '-sync')
            self.stages.add(stage)
            self.days = 0
        if key != self.day:
            self.days += 1
            self.day = key
        # Stop before, not after, a batch that could cross the 5.5 GB ceiling.
        self.guard.before_batch(batch)

    def finish(self):
        if self.stages:
            try:
                self.guard.check(self.kb, 'normal-sync-end')
            except growth.Stopped as exc:
                print(growth.HOLD + str(exc), file=sys.stderr)


def _push_pool(kb, bodies, tstate, guard=None, deadline=None):
    with ThreadPoolExecutor(max_workers=WORKERS) as pool:
        futures = [pool.submit(_push_one, kb, body, guard, deadline) for body in bodies]
        for fut in as_completed(futures):
            slug, err = fut.result()
            if err:
                tstate['failed'][slug] = err
                print(f'  HOLD {slug}: {err}' if err.startswith(growth.HOLD) else f'  FAIL {slug}: {err}',
                      file=sys.stderr)
            else:
                tstate['pushed'] += 1
                tstate['failed'].pop(slug, None)


def _push_batch(kb, bodies, tstate, publication=None):
    publication = publication or BackfillPublication(kb)
    def cohort(body):
        stage = growth.stage_for(body)
        meta = body.get('extra', {}).get('metadata', {})
        labels = body.get('usermetadata', {}).get('classifications', [])
        chamber = next((c['label'] for c in labels if c['labelset'] == 'chamber'), '')
        return (stage, (chamber, meta.get('date'))) if stage else (None, None)
    for (stage, day), group in groupby(bodies, cohort):
        group = list(group)
        try:
            publication.before(stage, day, len(group))
        except growth.Stopped as exc:
            for body in group:
                tstate['failed'][body['slug']] = growth.HOLD + str(exc)
            continue
        pushed = tstate['pushed']
        _push_pool(kb, group, tstate, publication.guard, publication.deadline)
        if stage:
            publication.guard.published(tstate['pushed'] - pushed)


def sync_nsw_backfill(kb, db, state, limit, dry_run, since, publication=None):
    """Drain repair-owned IDs independently of normal sync's high-water mark.

    The single switch and shared stop apply to retries and checkpointed rows.
    The normal read-only DB stays read-only; ack/failure receipts use sync's JSON.
    """
    if not nsw_publication.managed(db) or not nsw_publication.approved() or limit <= 0:
        return 0
    try:
        day_cap = int(os.environ.get('OPAX_BACKFILL_NSW_CAP', '4'))
        if not 0 <= day_cap <= 4:
            raise ValueError('NSW publication cap must be 0..4')
    except ValueError:
        print(growth.HOLD + 'invalid NSW publication day cap; maximum four', file=sys.stderr)
        return 0
    if day_cap == 0:
        return 0
    pub = nsw_publication.ledger(state)
    done = set(map(int, pub['published'])) | set(map(int, pub['excluded']))
    db.execute('CREATE TEMP TABLE IF NOT EXISTS nsw_publication_done (speech_id INTEGER PRIMARY KEY)')
    db.execute('DELETE FROM temp.nsw_publication_done')
    db.executemany('INSERT INTO temp.nsw_publication_done VALUES (?)', [(sid,) for sid in done])
    predicate = (f' AND speech_id IN ({nsw_publication.ready_ids_sql(db)}) '
                 'AND speech_id NOT IN (SELECT speech_id FROM temp.nsw_publication_done) ')
    select = TABLES['speeches']['select'].format(since=since).replace('ORDER BY speech_id LIMIT ?', predicate + ' ORDER BY speech_id LIMIT ?')
    # Apply exactly normal sync's eligibility rules. Excluded short/procedural
    # or duplicate texts are distinct from an acknowledged publication.
    eligible = {r[0] for r in db.execute(select.replace('SELECT *', 'SELECT speech_id', 1), (0, 10**12))}
    controlled = {r[0] for r in db.execute('SELECT speech_id FROM speeches WHERE length(text)>=200 AND speech_id IN ('
                                        + nsw_publication.ready_ids_sql(db) + ')')}
    if not dry_run:
        pub['excluded'] = sorted(set(pub['excluded']) | (controlled - eligible - done))
    # Recovery from a publication outage must respect the same four-day ceiling
    # as acquisition. Leave later days pending, distinct from normal exclusions.
    days = db.execute('SELECT chamber,date FROM (' + select +
                      ') GROUP BY chamber,date ORDER BY MIN(speech_id) LIMIT ?',
                      (0, 10**12, day_cap)).fetchall()
    db.execute('CREATE TEMP TABLE IF NOT EXISTS nsw_publication_days (chamber TEXT,date TEXT,PRIMARY KEY(chamber,date))')
    db.execute('DELETE FROM temp.nsw_publication_days')
    db.executemany('INSERT INTO temp.nsw_publication_days VALUES (?,?)', [(r[0],r[1]) for r in days])
    select = select.replace('ORDER BY speech_id LIMIT ?',
                            ' AND (chamber,date) IN (SELECT chamber,date FROM temp.nsw_publication_days) ORDER BY speech_id LIMIT ?')
    after = attempted = 0
    own_publication = publication is None
    try:
        if own_publication:
            publication = BackfillPublication(kb) if not dry_run and eligible else None
    except OSError:
        print(growth.HOLD + 'shared state directory unavailable; NSW publication deferred', file=sys.stderr)
        return 0
    while attempted < limit:
        rows = db.execute(select, (after, min(200, limit-attempted))).fetchall()
        if not rows:
            break
        if dry_run:
            print(f'[NSW backfill] {len(rows)} approved candidates; dry run, no publication')
            return len(rows)
        bodies = []
        for row in rows:
            body = map_speech(row)
            body['extra']['metadata']['nsw_backfill'] = True
            growth.tag(body, 'nsw')
            bodies.append(body)
        outcome = {'failed': {}, 'pushed': 0}
        _push_batch(kb, bodies, outcome, publication)
        for row, body in zip(rows, bodies):
            sid, slug = row['speech_id'], body['slug']
            if slug in outcome['failed']:
                pub['failed'][str(sid)] = outcome['failed'][slug]
            else:
                pub['published'].append(sid)
                pub['failed'].pop(str(sid), None)
                state.get('tables', {}).get('speeches', {}).get('failed', {}).pop(slug, None)
        pub['published'] = sorted(set(pub['published']))
        save_state(state)
        after = rows[-1]['speech_id']
        attempted += len(rows)
        if (growth.state_dir() / 'backfill.STOP').exists() or (
                publication.deadline and time.monotonic() >= publication.deadline):
            break
    if publication and own_publication:
        publication.finish()
    if not dry_run:
        save_state(state)
    return attempted


def sync_table(kb: KbClient, db: sqlite3.Connection, table: str, spec: dict,
               state: dict, limit: int, dry_run: bool, since: str, publication=None) -> None:
    tstate = state["tables"].setdefault(table, {"after": 0, "pushed": 0, "failed": {}})
    after = tstate["after"]
    own_publication = publication is None
    if own_publication and not dry_run:
        publication = BackfillPublication(kb)
    print(f"[{table}] resuming after {spec['pk']}={after}, "
          f"{tstate['pushed']:,} already pushed, {len(tstate['failed'])} failed")

    examined = 0
    # The normal checkpoint may pass held Senate IDs while ordinary speeches
    # continue. Keep those IDs in the existing retry outbox, and release only
    # spending holds through this same worker pool when explicitly enabled.
    # NSW-owned IDs never go through this loop: they are republished only by
    # sync_nsw_backfill, which tags them and charges the shared guard.
    if table == 'speeches' and not dry_run:
        held = []
        for slug, error in list(tstate['failed'].items()):
            if not (error == senate_policy.SPEND_HOLD or error.startswith(growth.HOLD)):
                continue
            sid = int(slug.removeprefix('speech-'))
            if nsw_publication.owned(db, sid):
                nsw_publication.ledger(state)['failed'].setdefault(str(sid), error)
                continue
            held.append(slug)
        held = held[:limit]
        for offset in range(0, len(held), 200):
            bodies = []
            for slug in held[offset:offset + 200]:
                row = db.execute('SELECT * FROM speeches WHERE speech_id=?',
                                 (int(slug.removeprefix('speech-')),)).fetchone()
                if row is None:
                    tstate['failed'].pop(slug, None)
                else:
                    bodies.append(spec['map'](row))
            _push_batch(kb, bodies, tstate, publication)
            save_state(state)
        limit -= len(held)

    for rows in _batches(db, spec, after, limit, since):
        examined += len(rows)
        bodies = [spec["map"](r) for r in rows]
        if dry_run:
            # Never advance or persist the checkpoint on a dry run.
            for b in bodies:
                size = sum(len(f["body"]) for f in b["texts"].values())
                print(f"  DRY {b['slug']:20s} {size:>9,} chars  {b['title'][:70]!r}")
            return

        _push_batch(kb, bodies, tstate, publication)

        tstate["after"] = rows[-1][0] if spec["pk"] == "rowid" else rows[-1][spec["pk"]]
        save_state(state)
        done = tstate["pushed"]
        if done and done % 1000 < len(rows):
            print(f"[{table}] {done:,} pushed (checkpoint {spec['pk']}={tstate['after']})")

    if table == 'speeches':
        # Same publication object, so Senate and NSW share one time budget.
        sync_nsw_backfill(kb, db, state, max(0, limit-examined), dry_run, since, publication)
    if dry_run:
        return
    if publication and own_publication:
        publication.finish()
    save_state(state)
    print(f"[{table}] done: {tstate['pushed']:,} pushed, {len(tstate['failed'])} failed")


def retry_failed(kb: KbClient, db: sqlite3.Connection, state: dict, publication=None) -> None:
    own_publication = publication is None
    publication = publication or BackfillPublication(kb)
    for table, spec in TABLES.items():
        tstate = state["tables"].get(table)
        if not tstate or not tstate["failed"]:
            continue
        slugs = list(tstate["failed"])
        print(f"[{table}] retrying {len(slugs)} failed")
        for slug in slugs:
            pk_val = int(slug.rsplit("-", 1)[1])
            if spec["pk"] == "rowid":
                row = db.execute(
                    f"SELECT rowid, * FROM {table} WHERE rowid = ?", (pk_val,)
                ).fetchone()
            else:
                row = db.execute(
                    f"SELECT * FROM {table} WHERE {spec['pk']} = ?", (pk_val,)
                ).fetchone()
            if row is None:
                tstate["failed"].pop(slug)
                continue
            if table == 'speeches' and nsw_publication.owned(db, pk_val):
                nsw_publication.ledger(state)['failed'].setdefault(str(pk_val), tstate['failed'][slug])
                continue
            body = spec['map'](row)
            stage = growth.stage_for(body)
            meta = body.get('extra', {}).get('metadata', {})
            chamber = next((c['label'] for c in body.get('usermetadata', {}).get('classifications', [])
                            if c['labelset'] == 'chamber'), '')
            try:
                publication.before(stage, (chamber, meta.get('date')))
                _, err = _push_one(kb, body, publication.guard, publication.deadline)
                if stage and err is None:
                    publication.guard.published(1)
            except growth.Stopped as exc:
                err = growth.HOLD + str(exc)
            if err is None:
                tstate["pushed"] += 1
                tstate["failed"].pop(slug)
            else:
                tstate["failed"][slug] = err
        save_state(state)
    # One publication object, so retries and NSW drain share one time budget.
    sync_nsw_backfill(kb, db, state, SAFETY_LIMIT, False, DEFAULT_SINCE, publication)
    if own_publication:
        publication.finish()


# ---------------------------------------------------------------------------
# Existing speech text repair (partial PATCH; never recreates a resource)
# ---------------------------------------------------------------------------


_REPAIR_PRIORITY_SQL = (
    "text_clean_rules LIKE '%matching_speaker_banner%'",
    "text_clean_rules NOT LIKE '%matching_speaker_banner%' AND ("
    "text_clean_rules LIKE '%control_character%' OR "
    "text_clean_rules LIKE '%leading_timestamp%' OR "
    "text_clean_rules LIKE '%duplicate_topic_header%' OR "
    "text_clean_rules LIKE '%interjection_markup%')",
    "text_clean_rules NOT LIKE '%matching_speaker_banner%' AND "
    "text_clean_rules NOT LIKE '%control_character%' AND "
    "text_clean_rules NOT LIKE '%leading_timestamp%' AND "
    "text_clean_rules NOT LIKE '%duplicate_topic_header%' AND "
    "text_clean_rules NOT LIKE '%interjection_markup%'",
)


def _load_json_state(path: Path, default: dict) -> dict:
    if path.exists():
        return json.loads(path.read_text())
    return default


def _save_json_state(path: Path, state: dict) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_suffix(path.suffix + ".tmp")
    tmp.write_text(json.dumps(state, ensure_ascii=False, indent=2, sort_keys=True))
    tmp.replace(path)


def _one_text_field(kb: KbClient, slug: str) -> str:
    field = kb.get_text_field_by_slug(slug, "body")
    return ((field or {}).get("value") or {}).get("body") or ""


def _patch_speech_text(
    kb: KbClient,
    row: sqlite3.Row,
    *,
    capture_sample: bool,
) -> dict[str, Any]:
    slug = f"speech-{row['speech_id']}"
    before = None
    if capture_sample:
        try:
            before = _one_text_field(kb, slug)
        except AragError as exc:
            if exc.status == 404:
                return {"slug": slug, "status": "missing"}
            return {"slug": slug, "status": "failed", "error": f"{exc.status}: {exc.detail[:200]}"}
    try:
        # PATCH contains text fields only. Labels, origin, extra metadata,
        # summaries and every other resource field are deliberately omitted.
        kb.patch_resource_by_slug(slug, {"texts": _texts(row["text_clean"])})
        after = _one_text_field(kb, slug) if capture_sample else None
        return {
            "slug": slug,
            "status": "patched",
            **(
                {
                    "sample": {
                        "speech_id": row["speech_id"],
                        "source": row["source"],
                        "rules": row["text_clean_rules"],
                        "database_before": row["text"][:200],
                        "database_after": row["text_clean"][:200],
                        "kb_before": (before or "")[:200],
                        "kb_after": (after or "")[:200],
                    }
                }
                if capture_sample
                else {}
            ),
        }
    except AragError as exc:
        if exc.status == 404:
            return {"slug": slug, "status": "missing"}
        return {"slug": slug, "status": "failed", "error": f"{exc.status}: {exc.detail[:200]}"}


def repair_speech_texts(
    kb: KbClient,
    db: sqlite3.Connection,
    *,
    state_path: Path,
    limit: int,
    batch_size: int,
    since: str,
    dry_run: bool,
) -> dict[str, Any]:
    columns = {row[1] for row in db.execute("PRAGMA table_info(speeches)")}
    required = {"text_clean", "text_clean_rules"}
    if not required <= columns:
        raise SystemExit(
            "text_clean/text_clean_rules are missing; run "
            "python3 -m parli.ingest.speech_repair --apply first"
        )

    state = _load_json_state(
        state_path,
        {
            "version": 1,
            "priority": 0,
            "after": 0,
            "patched": 0,
            "missing": 0,
            "failed": {},
            "samples": [],
            "complete": False,
        },
    )
    run = {"patched": 0, "missing": 0, "failed": 0, "unchanged": 0, "examined": 0}
    dry_candidates: list[dict[str, Any]] = []

    # A resumed run retries transient failures before advancing to new rows.
    if not dry_run and state["failed"]:
        for slug in list(state["failed"]):
            if run["patched"] >= limit:
                break
            speech_id = int(slug.rsplit("-", 1)[1])
            row = db.execute("SELECT * FROM speeches WHERE speech_id=?", (speech_id,)).fetchone()
            if row is None or row["text_clean"] is None:
                state["failed"].pop(slug, None)
                continue
            if nsw_publication.owned(db, speech_id):
                continue
            result = _patch_speech_text(kb, row, capture_sample=False)
            status = result["status"]
            run[status] = run.get(status, 0) + 1
            if status == "patched":
                state["patched"] += 1
                state["failed"].pop(slug, None)
            elif status == "missing":
                state["missing"] += 1
                state["failed"].pop(slug, None)
            else:
                state["failed"][slug] = result["error"]
        _save_json_state(state_path, state)

    while state["priority"] < len(_REPAIR_PRIORITY_SQL) and run["patched"] < limit:
        condition = _REPAIR_PRIORITY_SQL[state["priority"]]
        sql = (
            "SELECT * FROM speeches WHERE speech_id > ? AND text_clean IS NOT NULL "
            f"AND ({condition}) AND date >= {since!r} AND LENGTH(text) >= {MIN_SPEECH_CHARS} "
            f"{JUNK_PREDICATES} {DEDUPE_PREDICATES} "
            f"{nsw_publication.exclude_sql(db)} ORDER BY speech_id LIMIT ?"
        )
        rows = db.execute(sql, (state["after"], batch_size)).fetchall()
        if not rows:
            state["priority"] += 1
            state["after"] = 0
            if not dry_run:
                _save_json_state(state_path, state)
            continue

        all_candidates: list[sqlite3.Row] = []
        for row in rows:
            run["examined"] += 1
            old = legacy_clean_speech_text(row["text"], row["source"] or "", row["topic"])
            if old == row["text_clean"]:
                run["unchanged"] += 1
            else:
                all_candidates.append(row)
        remaining = max(0, limit - run["patched"])
        candidates = all_candidates[:remaining]
        truncated = len(all_candidates) > len(candidates)

        if dry_run:
            for row in candidates:
                dry_candidates.append(
                    {
                        "speech_id": row["speech_id"],
                        "source": row["source"],
                        "rules": row["text_clean_rules"],
                        "before": legacy_clean_speech_text(
                            row["text"], row["source"] or "", row["topic"]
                        )[:200],
                        "after": row["text_clean"][:200],
                    }
                )
                if len(dry_candidates) >= min(limit, SPEECH_REPAIR_SAMPLE_SIZE):
                    return {"mode": "dry-run", "run": run, "candidates": dry_candidates}
            state["after"] = (
                candidates[-1]["speech_id"] if truncated and candidates
                else rows[-1]["speech_id"]
            )
            continue

        sample_slots = max(0, SPEECH_REPAIR_SAMPLE_SIZE - len(state["samples"]))
        with ThreadPoolExecutor(max_workers=min(WORKERS, batch_size)) as pool:
            futures = {
                pool.submit(
                    _patch_speech_text,
                    kb,
                    row,
                    capture_sample=index < sample_slots,
                ): row
                for index, row in enumerate(candidates)
            }
            for future in as_completed(futures):
                result = future.result()
                status = result["status"]
                run[status] = run.get(status, 0) + 1
                slug = result["slug"]
                if status == "patched":
                    state["patched"] += 1
                    state["failed"].pop(slug, None)
                    if result.get("sample") and len(state["samples"]) < SPEECH_REPAIR_SAMPLE_SIZE:
                        state["samples"].append(result["sample"])
                elif status == "missing":
                    state["missing"] += 1
                    state["failed"].pop(slug, None)
                else:
                    state["failed"][slug] = result["error"]

        state["after"] = (
            candidates[-1]["speech_id"] if truncated and candidates
            else rows[-1]["speech_id"]
        )
        _save_json_state(state_path, state)
        print(
            f"[speech-text-repair] run patched={run['patched']:,}/{limit:,}; "
            f"missing={run['missing']:,}; failed={run['failed']:,}; "
            f"priority={state['priority']}; after={state['after']}",
            file=sys.stderr,
        )

    state["complete"] = state["priority"] >= len(_REPAIR_PRIORITY_SQL)
    if not dry_run:
        _save_json_state(state_path, state)
    return {
        "mode": "apply",
        "run": run,
        "checkpoint": str(state_path),
        "state": state,
    }


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__,
                                     formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--tables", default="speeches",
                        help="comma-separated: speeches,legal_documents (news is excluded)")
    parser.add_argument("--limit", type=int, default=SAFETY_LIMIT,
                        help=f"max rows per table this run (default {SAFETY_LIMIT})")
    parser.add_argument("--full", action="store_true",
                        help="lift the safety cap and sync everything remaining")
    parser.add_argument("--dry-run", action="store_true",
                        help="map and print, push nothing")
    parser.add_argument("--retry-failed", action="store_true",
                        help="re-attempt previously failed resources, then exit")
    parser.add_argument("--since", default=DEFAULT_SINCE,
                        help=f"speech date cutoff (default {DEFAULT_SINCE}: the 1993 "
                             "election — no data predating any current federal MP)")
    parser.add_argument("--db", default=str(DB_PATH))
    parser.add_argument("--repair-speech-text", action="store_true",
                        help="PATCH derived speech text into existing resources only")
    parser.add_argument("--repair-limit", type=int, default=MAX_SPEECH_REPAIRS_PER_RUN,
                        help=f"maximum resource PATCHes this run (hard cap {MAX_SPEECH_REPAIRS_PER_RUN})")
    parser.add_argument("--repair-batch-size", type=int, default=100)
    parser.add_argument("--repair-state", default=str(SPEECH_REPAIR_STATE_PATH))
    args = parser.parse_args()

    if args.repair_limit < 1 or args.repair_limit > MAX_SPEECH_REPAIRS_PER_RUN:
        parser.error(f"--repair-limit must be 1..{MAX_SPEECH_REPAIRS_PER_RUN}")

    unknown = {name.strip() for name in args.tables.split(",")} - set(TABLES)
    if unknown:
        parser.error(f"Unsupported corpus tables: {sorted(unknown)}; news is excluded")

    load_dotenv()
    cfg = AragConfig.from_env()
    if not args.dry_run and not cfg.kb_configured:
        sys.exit("ARAG_KB_ID / ARAG_KB_TOKEN not set — run scripts/arag_provision.py create")

    limit = 10**12 if args.full else args.limit
    if not args.full and args.limit > SAFETY_LIMIT:
        sys.exit(f"--limit above {SAFETY_LIMIT} needs --full (cost guard: a full corpus "
                 f"push processes ~13.6 GB of text — see MIGRATION-ARAG.md §Costs)")

    db = sqlite3.connect(f"file:{args.db}?mode=ro", uri=True)
    db.row_factory = sqlite3.Row
    if "speeches" in args.tables:
        # a normal push only needs exclusions for rows past the checkpoint; the repair pass walks old rows
        new_only = not args.repair_speech_text and not args.retry_failed
        checkpoint = load_state()["tables"].get("speeches", {}).get("after", 0) if new_only else None
        prepare_dedupe(db, args.since, checkpoint)
    kb = None if args.dry_run else KbClient(cfg)

    if args.repair_speech_text:
        result = repair_speech_texts(
            kb,
            db,
            state_path=Path(args.repair_state).expanduser(),
            limit=args.repair_limit,
            batch_size=args.repair_batch_size,
            since=args.since,
            dry_run=args.dry_run,
        )
        print(json.dumps(result, ensure_ascii=False, indent=2, sort_keys=True))
        return

    state = load_state()

    # One publication per run: Senate and NSW backfill share a single time
    # budget and one growth guard across every table and the NSW drain.
    publication = None if args.dry_run else BackfillPublication(kb)

    if args.retry_failed:
        retry_failed(kb, db, state, publication)
        publication.finish()
        return

    t0 = time.time()
    for table in args.tables.split(","):
        table = table.strip()
        if table not in TABLES:
            sys.exit(f"Unknown table {table!r} (choose from {', '.join(TABLES)})")
        sync_table(kb, db, table, TABLES[table], state, limit, args.dry_run, args.since, publication)
    if publication:
        publication.finish()
    print(f"Elapsed {time.time() - t0:.0f}s. State: {STATE_PATH}")


if __name__ == "__main__":
    main()
