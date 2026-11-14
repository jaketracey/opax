#!/usr/bin/env python3
"""Offline follow-up to the 14 November roster sweep. No network access.

Checks each previously unmatched interval against individual speech/vote dates.
Raw member corrections require one day-precision, sourced catalogue term, an
exact person id, and an agreeing full name. Reads the source database only;
corrections can be applied to a separate scratch copy.
"""
from __future__ import annotations

import argparse
from collections import Counter, defaultdict
from datetime import datetime, timezone
import hashlib
import json
from pathlib import Path
import sqlite3
import sys
import time

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
from scripts.audit_roster_periods import inventory, name_key, read  # noqa: E402


def wait_for_load():
    while float(Path('/proc/loadavg').read_text().split()[1]) > 40:
        print('Paused: five-minute load exceeds 40', file=sys.stderr, flush=True)
        time.sleep(10)


class StrictMatcher:
    """Use a matching id first, with the existing exact reviewed name safeguards.

    An id alone never establishes identity. It can disambiguate an exact name
    shared by catalogue and roster actors. Otherwise the original unique-name,
    same-house and conflicting-numeric-id rules apply. No inferred nicknames,
    dropped middle names, surname-only joins or fuzzy matches are added.
    """

    def __init__(self, identities):
        self.names = defaultdict(set)
        self.cache = {}
        for person in identities:
            for name in person['names']:
                self.names[(person['chamber'], name)].add(person['actor'])

    def match(self, row):
        key = (row['chamber'], row.get('speaker_name'), row.get('speaker_name_clean'), row.get('person_id'))
        if key in self.cache:
            return self.cache[key]
        house, printed, clean, pid = key
        candidates = self.names.get((house, name_key(printed)), set())
        if not candidates:
            candidates = self.names.get((house, name_key(clean)), set())
        pid = str(pid or '').removeprefix('tvfy_')
        actor = 'pid:' + pid
        if actor in candidates:
            result = (actor, 'exact-id-and-reviewed-name')
        elif len(candidates) == 1:
            actor, = candidates
            weak = len(name_key(printed).split()) < 2
            # A bare surname always needs an agreeing reviewed id.
            if weak and (not actor.startswith('pid:') or pid != actor[4:]):
                result = (None, 'unverified-surname')
            elif actor.startswith('pid:') and pid.isdigit() and pid != actor[4:]:
                result = (None, 'conflicting-numeric-id')
            else:
                result = (actor, 'unique-reviewed-name')
        else:
            result = (None, 'ambiguous-name' if candidates else 'no-reviewed-name')
        self.cache[key] = result
        return result


def within(date, period):
    # Inventory service/party endpoints retain the sweep's inclusive comparison.
    return (not period.get('start') or period['start'] <= date) and (not period.get('end') or date <= period['end'])


def interval_matches(db, periods, identities, speech_groups=None):
    matcher = StrictMatcher(identities)
    by_actor = defaultdict(list)
    for period in periods:
        by_actor[(period['actor'], period['chamber'])].append(period)
    matches, seen, scanned = {}, Counter(), Counter()
    queries = {
        'speeches': """SELECT chamber, speaker_name, speaker_name_clean, person_id, date,
            speech_id AS record_id, source FROM speeches
            WHERE date >= ? AND length(date)=10 AND source != 'wragge_xml'
            AND coalesce(speaker_type,'') NOT IN ('chair','unknown','witness')""",
        'ext_votes': """SELECT house AS chamber, person_raw AS speaker_name,
            person_name AS speaker_name_clean, person_id, date, division_id AS record_id, source
            FROM ext_votes WHERE date >= ? AND length(date)=10 AND lower(vote) IN ('aye','no','paired')""",
        'votes': """SELECT d.house AS chamber, m.full_name AS speaker_name,
            NULL AS speaker_name_clean, v.person_id, d.date, d.division_id AS record_id,
            'legacy_votes' AS source FROM votes v JOIN divisions d USING(division_id)
            LEFT JOIN members m ON m.person_id=v.person_id
            WHERE d.date >= ? AND length(d.date)=10 AND lower(v.vote) IN ('aye','no','paired')""",
    }
    since = read(ROOT, 'portal/public/parliamentarians.json')['meta']['since']
    for kind, sql in queries.items():
        wait_for_load()
        params = [since]
        if kind == 'speeches' and speech_groups is not None:
            # The sweep aggregate inventories every eligible print/id group in
            # this exact snapshot. Use its ids as an index prefilter, then check
            # every individual date and name again. Never use its group minimum
            # as an interval match. NULL ids stay eligible for the name pass.
            ids = {r['person_id'] for r in speech_groups
                   if (matcher.match(r)[0], r['chamber']) in by_actor}
            nonnull = sorted(p for p in ids if p is not None)
            predicates = ['person_id IN (' + ','.join('?' for _ in nonnull) + ')'] if nonnull else []
            if None in ids:
                predicates.append('person_id IS NULL')
            sql += ' AND (' + (' OR '.join(predicates) if predicates else '0') + ')'
            params.extend(nonnull)
        for row in db.execute(sql, params):
            row = dict(row)
            scanned[kind] += 1
            if scanned[kind] % 100000 == 0:
                wait_for_load()
            actor, basis = matcher.match(row)
            target = by_actor.get((actor, row['chamber']))
            if not target:
                continue
            seen[(actor, row['chamber'])] += 1
            for period in target:
                if not within(row['date'], period):
                    continue
                receipt = dict(row, actor=actor, kind=kind, match_basis=basis)
                old = matches.get(period['key'])
                if old is None or (receipt['date'], kind, str(receipt['record_id'])) < (old['date'], old['kind'], str(old['record_id'])):
                    matches[period['key']] = receipt
        print(f'{kind}: {scanned[kind]} participation records checked', file=sys.stderr, flush=True)
    result = []
    for period in periods:
        receipt = matches.get(period['key'])
        status = 'matched' if receipt else ('no-in-interval-record' if seen[(period['actor'], period['chamber'])] else 'no-strict-identity-match')
        result.append(dict(period, status=status, corpus_bound=receipt))
    return result, dict(scanned)


def raw_member_corrections(signals, members, root=ROOT):
    """Conservative endpoint corrections, never inferred from attached speeches.

    Multiple seats/terms and non-day endpoints are held. Open catalogue ends
    cannot clear a raw end: that would silently assert current membership.
    """
    manifest = read(root, 'portal/public/electorates/manifest.json')
    bundle = read(root, 'portal/public' + manifest['reference_url'])
    people = {p['person_id']: p for p in bundle['people']}
    seats = {s['electorate_id']: s for s in bundle['electorates']}
    sources = {s['source_id']: s for s in bundle['sources']}
    by_id = defaultdict(list)
    for term in bundle['terms']:
        person = people[term['person_id']]
        if person.get('legacy_person_id'):
            by_id[(str(person['legacy_person_id']), seats[term['electorate_id']]['chamber'])].append((person, term))
    out = []
    for signal in signals:
        member = members[signal['person_id']]
        terms = by_id.get((signal['person_id'], signal['house']), [])
        changes, term_key = {}, None
        reason = 'no-exact-id-catalogue-term'
        if len(terms) > 1:
            reason = 'multiple-catalogue-terms-or-seats'
        elif terms:
            person, term = terms[0]
            term_key = term['representation_id']
            names = {name_key(n) for n in [person['name'], *person.get('aliases', [])]}
            dated_source = [sources[s] for s in term.get('sources', []) if sources[s]['label'] == 'OpenAustralia parliamentary service records']
            if name_key(member['full_name']) not in names or len(name_key(member['full_name']).split()) < 2:
                reason = 'full-name-does-not-agree'
            elif not dated_source:
                reason = 'no-reviewed-dated-service-source'
            else:
                reason = 'sourced-endpoints-already-agree-or-open'
                for field, raw_field in [('start', 'entered_house'), ('end', 'left_house')]:
                    value = term.get(field)
                    events = ('election', 'by_election', 'appointment') if field == 'start' else ('retired', 'defeated', 'resigned', 'died')
                    if (value and term.get(field + '_precision') == 'day'
                            and term.get(field + '_reason') in events and member[raw_field] != value):
                        changes[raw_field] = dict(before=member[raw_field], after=value)
                if changes:
                    reason = 'corrected-from-single-sourced-term'
        after_start = changes.get('entered_house', {}).get('after', signal.get('start'))
        after_end = changes.get('left_house', {}).get('after', signal.get('end'))
        after_reasons = []
        first, last = signal.get('first_record'), signal.get('last_record')
        if first:
            if after_start == first:
                after_reasons.append('start-equals-first-stored-record')
            elif after_start and after_start > first:
                after_reasons.append('start-after-first-stored-record')
        if last:
            if after_end == last:
                after_reasons.append('end-equals-last-stored-record')
            elif after_end and after_end != 'unknown' and after_end < last:
                after_reasons.append('end-before-last-stored-record')
        out.append(dict(signal, disposition=reason, catalogue_term=term_key, corrections=changes,
                        after_reasons=after_reasons,
                        sources=dated_source if terms and len(terms) == 1 and changes else []))
    return out


def apply_raw_corrections(db, rows):
    """Apply the review to a scratch copy, atomically, only at exact old values."""
    corrected = fields = 0
    with db:
        for row in rows:
            changes = row['corrections']
            if not changes:
                continue
            current = db.execute('SELECT entered_house, left_house FROM members WHERE person_id=? AND chamber=?',
                                 (row['person_id'], row['house'])).fetchone()
            if current is None or any(current[('entered_house', 'left_house').index(k)] != v['before']
                                      for k, v in changes.items()):
                raise ValueError(f"Scratch row no longer matches review: {row['person_id']}")
            for field, change in changes.items():
                if field not in ('entered_house', 'left_house'):
                    raise ValueError('Unexpected correction field')
                db.execute(f'UPDATE members SET {field}=? WHERE person_id=?', (change['after'], row['person_id']))
                fields += 1
            corrected += 1
    return dict(corrected_rows=corrected, corrected_fields=fields)


def dump(report):
    """Keep individual review records on individual lines."""
    compact = {'intervals', 'raw_members'}
    parts = []
    for key, value in report.items():
        if key in compact:
            body = '[\n' + ',\n'.join('    ' + json.dumps(p, ensure_ascii=False) for p in value) + '\n  ]'
        else:
            body = json.dumps(value, ensure_ascii=False, indent=2).replace('\n', '\n  ')
        parts.append('  ' + json.dumps(key) + ': ' + body)
    return '{\n' + ',\n'.join(parts) + '\n}\n'


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--db', type=Path, required=True)
    parser.add_argument('--out', type=Path, required=True)
    parser.add_argument('--apply-to-copy', type=Path, help='apply an existing --out review to a pre-existing scratch database copy')
    parser.add_argument('--speech-groups', type=Path, help='optional complete sweep aggregate from this exact snapshot, to prefilter speech ids')
    args = parser.parse_args()
    wait_for_load()
    if args.apply_to_copy:
        if not args.apply_to_copy.is_file() or args.apply_to_copy.samefile(args.db):
            parser.error('--apply-to-copy must be an existing separate scratch copy')
        review = json.loads(args.out.read_text())
        with sqlite3.connect(args.apply_to_copy) as scratch:
            print(json.dumps(apply_raw_corrections(scratch, review['raw_members'])))
        return
    database_mtime = datetime.fromtimestamp(args.db.stat().st_mtime, timezone.utc).isoformat()
    db = sqlite3.connect(args.db.resolve().as_uri() + '?mode=ro', uri=True)
    db.row_factory = sqlite3.Row
    db.execute('PRAGMA query_only=ON')
    db.execute('BEGIN')
    data = inventory()
    # The six expected SA coverage gaps are a separate owed item in the sweep.
    periods = [p for p in read(ROOT, 'scripts/roster_period_exceptions.json')['unmatched_periods']
               if p['chamber'] != 'sa_lc']
    speech_groups = None
    if args.speech_groups:
        raw = json.loads(args.speech_groups.read_text())
        if raw['database_mtime'] != database_mtime or raw['database'] != str(args.db.resolve()) or 'Published-roster corpus window starts 1993-03-13' not in raw['note']:
            parser.error('Speech groups must be the complete published-window sweep aggregate from this exact snapshot')
        speech_groups = raw['groups']['speeches']
    outcomes, scanned = interval_matches(db, periods, data['identities'], speech_groups)
    findings = read(ROOT, 'docs/reports/2026-11-14-roster-period-cache-findings.json')
    members = {r['person_id']: dict(r) for r in db.execute('SELECT * FROM members')}
    raw = raw_member_corrections(findings['raw_member_signals'], members)
    counts = {}
    for house in sorted({p['chamber'] for p in outcomes}):
        rows = [p for p in outcomes if p['chamber'] == house]
        counts[house] = dict(before=len(rows), matched=sum(p['status'] == 'matched' for p in rows),
                             unmatched=sum(p['status'] != 'matched' for p in rows))
    buckets = Counter(tuple(p['reasons']) for p in raw)
    report = dict(reviewed='2026-11-14', database=str(args.db),
                  database_mtime=database_mtime,
                  database_size=args.db.stat().st_size,
                  speech_group_prefilter=str(args.speech_groups) if args.speech_groups else None,
                  speech_group_sha256=hashlib.sha256(args.speech_groups.read_bytes()).hexdigest() if args.speech_groups else None,
                  note='Read-only snapshot. Corpus bounds are evidence of participation, not service endpoints. Raw corrections are a review overlay from the pinned catalogue; source database and published files are unchanged. First/last stored records in raw member rows are unverified id coverage and can include namesakes. The initial unmatched cohort is retained in roster_period_exceptions.json; this file records its current disposition.',
                  interval_counts=counts, scanned_records=scanned, intervals=outcomes,
                  raw_reason_counts=dict(Counter(r for p in raw for r in p['reasons'])),
                  raw_after_reason_counts=dict(Counter(r for p in raw for r in p['after_reasons'])),
                  raw_after_flagged_rows=sum(bool(p['after_reasons']) for p in raw),
                  raw_buckets=[dict(reasons=list(k), rows=n, corrected=sum(bool(p['corrections']) for p in raw if tuple(p['reasons']) == k)) for k, n in sorted(buckets.items())],
                  raw_dispositions=dict(Counter(p['disposition'] for p in raw)), raw_members=raw,
                  fraser_anning_holds=read(ROOT, 'scripts/roster_accept.json')['vote_party_periods']['holds'])
    db.close()
    if datetime.fromtimestamp(args.db.stat().st_mtime, timezone.utc).isoformat() != database_mtime:
        raise RuntimeError('Source snapshot changed during the audit; review a stable copy')
    args.out.write_text(dump(report))
    print(json.dumps({k: report[k] for k in ('interval_counts', 'raw_buckets', 'raw_dispositions')}, indent=2))


if __name__ == '__main__':
    main()
