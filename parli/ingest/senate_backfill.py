"""Capped Senate catch-up, called after daily refresh under its owner lock.

New speech IDs are the existing arag_sync outbox. They are published by the
following normal refresh, using its checkpoint, mapper and enrichment limits.
This stage only reads KB counters. Standalone rehearsals require a scratch DB.
"""
import argparse
from contextlib import redirect_stdout
from datetime import datetime, timezone
import fcntl
import hashlib
import json
import math
import os
from pathlib import Path
import sqlite3
import time
import uuid

from scripts import vote_parties as parties
from . import federal_backfill as backfill, openaustralia_xml as xml
from . import http as source_http
from . import senate_backfill_policy as policy
from . import backfill_guard as growth
from .honest_http import BudgetSpent, HonestHTTP, Refused
from .speeches import load_modern_jsonl
from .speaker_roles import chair_role

MANIFEST = Path(__file__).resolve().parents[2] / 'data/manifests/senate-backfill-2014-2019.json'
START, END = '2014-01-01', '2019-06-30'
DEFAULT_DAYS = 10
DEFAULT_BUDGET = 1200
# Cached normal sync: 76,905 speech acknowledgements / 8,606 seconds at ten
# workers, rounded down. Includes the time spent on 318 news acknowledgements.
# docs/reports/2026-11-14-senate-sync-evidence.json retains the source receipts.
PUBLISH_DOCS_PER_SECOND = 8.9
PUBLISH_RATE_SOURCE = 'cached-normal-sync-2026-09-02'
# Rounded above the entire 112.83-second scratch sync preparation measurement.
SYNC_PREPARATION_SECONDS = 120


class DatedPeople:
    """Dated OA identity plus the same reviewed party periods as vote exports."""
    def __init__(self, people, evidence):
        self.people, self.evidence = people, evidence
        self.resolver = parties.Resolver(evidence)
        self.identity_seconds = 0

    def resolve(self, office, printed, house, day):
        began = time.monotonic()
        try:
            return self._resolve(office, printed, house, day)
        finally:
            self.identity_seconds += time.monotonic() - began

    def _resolve(self, office, printed, house, day):
        person = self.people.resolve(office, printed, house, day).copy()
        source = person['party']
        if chair_role(source):
            person.update(source_party=source, party_basis='oa-chair-role')
            return person
        member = {'person_id': person['person_id'], 'name': person['speaker'], 'party': source}
        chamber = ('federal', house)
        rule, hits = self.resolver.match(chamber, day, member['name'], member['person_id'], set())
        party, basis = source, 'oa-office-term'
        if self.evidence.held(chamber, member, day) or chamber in self.evidence.frozen:
            party, basis = '', 'reviewed-hold-or-unavailable-evidence'
        elif hits is None and rule.startswith('ambiguous'):
            party, basis = '', rule
        elif hits is not None:
            dated, reason, _ = self.resolver.party_on(hits, day, same=parties.same_party)
            if dated:
                party, basis = dated, reason
            elif reason == 'conflicting' or self.evidence.undated_change(chamber, member):
                party, basis = '', reason
        if party:
            party = parties.dated_name(self.evidence.renames, party, day) or party
        person.update(party=party, source_party=source, party_basis=basis)
        return person


def configuration(max_days, budget):
    if max_days < 1:
        raise ValueError('Senate max-days must be positive')
    if not math.isfinite(budget) or not 0 < budget <= 1200:
        raise ValueError('Senate budget-seconds must be positive and at most 1200')


def guard_client():
    from parli.arag import AragConfig, KbClient, load_dotenv
    load_dotenv()
    return KbClient(AragConfig.from_env())


def run(db_path, stage, *, max_days=DEFAULT_DAYS, budget=DEFAULT_BUDGET,
        manifest=MANIFEST, cache=None, offline=False):
    configuration(max_days, budget)
    began = time.monotonic()
    deadline = began + budget
    guard = growth.Guard()
    guard.ensure_running()
    kb = guard_client()
    guard.check(kb, 'senate')
    stage = Path(stage)
    stage.mkdir(parents=True, exist_ok=True)
    # Daily/nightly already hold their own locks. This additional lock prevents
    # two invocations of this stage sharing its receipts and run ownership.
    with (stage / 'stage.lock').open('a') as lock:
        fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        if (stage / 'refused.json').exists():
            raise source_http.SourceRefused(xml.BASE, 'Senate backfill remains paused after a source refusal; review its retained receipt before resuming')
        return _run(db_path, stage, max_days, budget, manifest, cache, offline,
                    guard, kb, began, deadline)


def _run(db_path, stage, max_days, budget, manifest, cache, offline, guard, kb, began, deadline):
    available = backfill.source_days(manifest, ['senate'], START, END)
    total = len(available['senate'])
    archive = backfill.Archive(stage, cache, offline)
    archive.http = HonestHTTP(deadline=deadline, user_agent='opax-improve-audit', allowed_origin=xml.BASE)
    local_deadline = deadline
    report = {'max_days': max_days, 'budget_seconds': budget, 'days': [],
              'missing_days_before': None, 'occupied_days_held': None,
              'kb_writes': 0, 'd1_writes': 0, 'publish_allowance_seconds': 0,
              'publish_docs_per_second': PUBLISH_DOCS_PER_SECOND,
              'publish_rate_source': PUBLISH_RATE_SOURCE,
              'sync_preparation_allowance_seconds': 0,
              'stop': 'complete', 'manifest_sha256': hashlib.sha256(Path(manifest).read_bytes()).hexdigest()}
    try:
        with xml.read_only(db_path) as db:
            db.set_progress_handler(lambda: time.monotonic() >= local_deadline, 1000)
            missing, occupied, total = backfill.discover_days(db, available, START, END, 1000, ['senate'])
        report.update(missing_days_before=total, occupied_days_held=len(occupied),
                      discovery_seconds=time.monotonic() - began)
        with sqlite3.connect(db_path, timeout=1) as db:
            db.set_progress_handler(lambda: time.monotonic() >= local_deadline, 1000)
            backfill.ownership_schema(db)
            # Retain immutable insertion ownership. The sync maps both repairs
            # to the separate shared US$30 Worker admission budget.
            run_id = policy.RUN_ID
            db.execute('INSERT OR IGNORE INTO oa_backfill_runs VALUES (?,?,?,?)', (run_id, START, END, 40))
            if tuple(db.execute('SELECT start,end,cap_usd FROM oa_backfill_runs WHERE run_id=?',
                                (run_id,)).fetchone()) != (START, END, 40):
                raise ValueError('Senate insertion ownership belongs to another configuration')
            db.commit()
            attempted = {r[0] for r in db.execute(
                'SELECT date FROM oa_backfill_days WHERE run_id=? AND receipt IS NOT NULL', (run_id,))}
            candidates = [i for i in missing if i['date'] not in attempted]
            report['zero_row_days_held'] = len(missing) - len(candidates)
            if not candidates and missing:
                report['stop'] = 'identity-holds'
            if candidates:
                report['sync_preparation_allowance_seconds'] = SYNC_PREPARATION_SECONDS
                local_deadline = deadline - SYNC_PREPARATION_SECONDS
                archive.http.deadline = local_deadline
                if time.monotonic() + 60 >= local_deadline:
                    raise BudgetSpent('no time for membership setup and a complete day')
                setup = time.monotonic()
                # Reuse retained membership files when present. Dates and names
                # still have to pass the office and reconciliation guards.
                raw_people = []
                for name in ('people.xml', 'representatives.xml', 'senators.xml'):
                    cached = next((p for p in [stage / name, Path(cache) / name if cache else stage / name]
                                   if p.is_file()), None)
                    if cached:
                        raw_people.append(cached.read_bytes())
                    elif offline:
                        raise ValueError(f'membership cache missing: {name}')
                    else:
                        body = archive.http.get(f'{xml.BASE}/members/{name}')
                        archive.gets += 1
                        if not body:
                            raise ValueError(f'membership unavailable: {name}')
                        (stage / name).write_bytes(body)
                        raw_people.append(body)
                people = DatedPeople(xml.People(raw_people[0], raw_people[1:], db), parties.load_evidence(db=db))
                report['setup_seconds'] = time.monotonic() - setup
            for item in candidates:
                guard.ensure_running()
                if len(report['days']) >= max_days:
                    report['stop'] = 'day-cap'
                    break
                # Keep a minute for day commit and receipts. Publication is
                # charged to this budget although the normal sync does it later.
                if time.monotonic() + 60 >= local_deadline:
                    report['stop'] = 'time-budget'
                    break
                day = item['date']
                day_start = time.monotonic()
                raw = archive.get(f'raw/senate_debates/{day}.xml')
                fetched = time.monotonic()
                identity_before = people.identity_seconds
                records, _, _, issues = xml.parse_day(raw, 'senate', day, people, {})
                parsed = time.monotonic()
                identity_seconds = people.identity_seconds - identity_before
                unknown = [r for r in records if r.get('person_id') is None]
                issues.extend({'kind': 'speech-identity', 'gid': r.get('gid'), 'reason': 'unresolved-speaker'}
                              for r in unknown)
                records = [r for r in records if r.get('person_id') is not None]
                turns = len(records) + sum(i['kind'] == 'speech-identity' for i in issues)
                # Reserve even excluded/procedural long turns, to overestimate.
                publish = sum(len(r['text']) >= 200 for r in records) / PUBLISH_DOCS_PER_SECOND
                if parsed + publish + 60 >= local_deadline:
                    report['stop'] = 'time-budget'
                    break
                local_deadline -= publish
                archive.http.deadline = local_deadline
                for record in records:
                    record.update(source_attribution=backfill.ATTRIBUTION,
                                  enrichment_run_id=run_id, enrichment_max_usd=40)
                directory = stage / 'modern' / uuid.uuid4().hex
                directory.mkdir(parents=True)
                xml.atomic(directory / f'{day}_senate.jsonl',
                           ''.join(json.dumps(r, ensure_ascii=False) + '\n' for r in records))
                parsed_receipt = {**item, 'xml_turns': turns, 'resolved_turns': len(records),
                                  'sha256': hashlib.sha256(raw).hexdigest()}
                db.execute('INSERT OR REPLACE INTO oa_backfill_days (run_id,chamber,date,parsed,issues) '
                           'VALUES (?,?,?,?,?)', (run_id, 'senate', day, json.dumps(parsed_receipt), json.dumps(issues)))
                db.commit()
                loader = []
                with (stage / 'loader.log').open('a') as log, redirect_stdout(log):
                    load_modern_jsonl(db, set(), since=START, until=END, modern_dir=directory,
                                      missing_days_only=True, backfill_run=run_id, report=loader)
                loaded = time.monotonic()
                receipt = loader[0]
                identity_held = len(receipt.get('unmatched', []))
                report['days'].append({**parsed_receipt, 'added': receipt['added'],
                    'office_resolved_turns': len(records), 'parser_identity_held': turns - len(records),
                    'loader_holds': receipt.get('unmatched', []),
                    'identity_held': turns - len(records) + identity_held,
                    'resolved_turns': len(records) - identity_held,
                    'fetch_seconds': fetched - day_start, 'parse_identity_seconds': parsed - fetched,
                    'identity_seconds': identity_seconds, 'parse_seconds': parsed - fetched - identity_seconds,
                    'insert_queue_seconds': loaded - parsed, 'elapsed_seconds': loaded - day_start,
                    'publish_allowance_seconds': publish})
                report['publish_allowance_seconds'] += publish
                print(f"Senate backfill {day}: +{receipt['added']} rows; {len(report['days'])}/{max_days} days", flush=True)
                if len(report['days']) % growth.CHECK_DAYS == 0:
                    guard.check(kb, 'senate')
            report['days_left'] = total - sum(d['added'] > 0 for d in report['days'])
        if report['days'] and len(report['days']) % growth.CHECK_DAYS:
            guard.check(kb, 'senate')
    except BudgetSpent:
        report['stop'] = 'time-budget'
    except sqlite3.OperationalError as exc:
        if time.monotonic() < local_deadline or 'interrupted' not in str(exc):
            raise
        report['stop'] = 'time-budget'
    except (Refused, source_http.SourceRefused) as exc:
        report['stop'] = 'source-refused'
        xml.atomic(stage / 'refused.json', json.dumps({'source': xml.BASE,
            'reason': getattr(exc, 'reason', str(exc)), 'checked_at': datetime.now(timezone.utc).isoformat()}) + '\n')
        raise
    except growth.Stopped as exc:
        report.update(stop='growth-guard', error=str(exc))
        raise
    except Exception as exc:
        report.update(stop='error', error=str(exc))
        raise
    finally:
        report.setdefault('days_left', total - sum(d['added'] > 0 for d in report['days'])
                          if report['missing_days_before'] is not None else None)
        report['added'] = sum(d['added'] for d in report['days'])
        report['elapsed_seconds'] = time.monotonic() - began
        report['source_gets'] = archive.gets
        report['source_cache_hits'] = archive.hits
        report['finished'] = datetime.now(timezone.utc).isoformat()
        xml.atomic(stage / 'report.json', json.dumps(report, indent=2) + '\n')
        guard.progress('senate', remaining=report['days_left'], cap=max_days,
                       stop=report['stop'], done=len(report['days']),
                       acquisition_days_remaining=report['days_left'])
        print(f"Senate backfill: {len(report['days'])} days done, {report['days_left']} missing days left; "
              f"+{report['added']} rows; stop={report['stop']}; {report['elapsed_seconds']:.2f}s; "
              f"normal-sync publication allowance {report['publish_allowance_seconds']:.1f}s "
              f"plus preparation {report['sync_preparation_allowance_seconds']}s", flush=True)
    return report


def main():
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument('--db', required=True)
    ap.add_argument('--stage', required=True)
    ap.add_argument('--manifest', default=MANIFEST, type=Path)
    ap.add_argument('--cache-dir')
    ap.add_argument('--offline', action='store_true')
    ap.add_argument('--max-days', type=int, default=int(os.environ.get('OPAX_SENATE_BACKFILL_DAYS', DEFAULT_DAYS)))
    ap.add_argument('--budget-seconds', type=float, default=float(os.environ.get('OPAX_SENATE_BACKFILL_BUDGET_SECONDS', DEFAULT_BUDGET)))
    args = ap.parse_args()
    if not policy.enabled():
        print('Senate backfill disabled (OPAX_SENATE_BACKFILL=0)')
        return
    try:
        run(args.db, args.stage, max_days=args.max_days, budget=args.budget_seconds,
            manifest=args.manifest, cache=args.cache_dir, offline=args.offline)
    except Refused as exc:
        raise source_http.SourceRefused(exc.url or xml.BASE, str(exc)) from None


if __name__ == '__main__':
    main()
