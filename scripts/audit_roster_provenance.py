#!/usr/bin/env python3
"""Offline follow-up to the 14 November roster sweep. No network access.

Checks each previously unmatched interval against individual speech/vote dates.
Raw member corrections require a complete single-seat career, agreeing source
endpoints normalised to recorded service events, an exact person id and an
agreeing full name. Reads the source database only;
corrections can be applied to a separate scratch copy.
"""
from __future__ import annotations

import argparse
from collections import Counter, defaultdict
import csv
from datetime import datetime, timezone
import hashlib
import io
import json
from pathlib import Path
import sqlite3
import sys
import time

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
from scripts.audit_roster_periods import inventory, name_key, read  # noqa: E402
from parli.electorates import stable_id  # noqa: E402
from scripts.oa_people_ids import rows as oa_people_rows  # noqa: E402


def service_evidence(root=ROOT):
    """Read byte-pinned, offline sources, including careers before the corpus window."""
    evidence = read(root, 'scripts/roster_provenance_sources.json')
    bodies = {}
    for name, receipt in evidence['files'].items():
        body = (Path(root) / receipt['path']).read_bytes()
        if hashlib.sha256(body).hexdigest() != receipt['sha256']:
            raise ValueError(f'Unreviewed service source: {name}')
        bodies[name] = body.decode('utf-8-sig')
    text = bodies['representatives.csv']
    careers, by_term = defaultdict(list), {}
    for row in csv.DictReader(io.StringIO(text[text.index('member count,'):])):
        if not str(row.get('member count') or '').isdigit() or not row.get('name'):
            continue
        def day(value):
            return datetime.strptime(value.strip(), '%d.%m.%Y').date().isoformat() if value else None
        term = dict(source_key=row['member count'], name=row['name'], seat=row['Division'],
                    state=row['State/Territory'], start=day(row['Date of election']),
                    end=day(row['Date ceased to be a Member']),
                    start_reason=row['Type of election'] or 'election', end_reason=row['reason'])
        careers[name_key(row['name'])].append(term)
        by_term[stable_id('term', 'oa:' + row['member count'])] = term
    oa_ids = {str(10000 + int(count)): dict(phid=phid, names=names)
              for count, phid, names in oa_people_rows(bodies['people.csv'])}
    return dict(evidence, careers=careers, by_term=by_term, oa_ids=oa_ids)


def handbook_person(person, evidence):
    """Follow the explicit OA id -> PHID crosswalk; otherwise exact full names only.

    This is a source-to-source identity join, never a corpus speaker matcher.
    Do not manufacture aliases by dropping middle names or matching surnames.
    """
    names = {name_key(n) for n in [person['name'], *person.get('aliases', [])]}
    crosswalk = evidence['oa_ids'].get(str(person['legacy_person_id']))
    individuals = evidence['handbook']['individuals']
    if crosswalk:
        if not names & {name_key(n) for n in crosswalk['names']}:
            return None
        hits = [r for r in individuals if r['PHID'] == crosswalk['phid']]
    else:
        def full_names(row):
            legal = ' '.join(row.get(k) or '' for k in ('GivenName', 'MiddleNames', 'FamilyName'))
            preferred = str(row.get('PreferredName') or '').strip('() ')
            return {name_key(legal), name_key(preferred + ' ' + row['FamilyName'])} if preferred else {name_key(legal)}
        hits = [r for r in individuals if names & full_names(r)]
    return hits[0] if len(hits) == 1 else None


def endpoint_review(term, primary, evidence):
    """Normalise events, not elapsed days. Unexplained disagreement holds the row."""
    convention = evidence['house_convention']
    reviews = {}
    scoped = primary and primary['MPorSenator'] == ['Member']
    for field, raw_field in [('start', 'entered_house'), ('end', 'left_house')]:
        events = ('election', 'by_election', 'appointment') if field == 'start' else ('retired', 'defeated', 'resigned', 'died')
        value = term.get(field)
        if not value or term.get(field + '_precision') != 'day' or term.get(field + '_reason') not in events:
            continue
        current = primary and str(primary.get('InCurrentParliament')).lower() == 'true'
        other = primary.get('ServiceHistory_' + field.title()) if primary and not (field == 'end' and current) else None
        a, b, rule = value, other, 'agreed'
        event = term[field + '_reason']
        if field == 'start' and event == 'by_election':
            for pair in convention['by_elections']:
                if primary and primary['PHID'] == pair['phid'] and value == pair['source_date'] and other == pair['poll']:
                    a, rule = pair['poll'], 'normalised-polling-start'
        elif field == 'end' and event in ('retired', 'defeated'):
            for pair in convention['general_elections']:
                if a in (pair['poll'], pair['dissolution']):
                    a = pair['dissolution' if event == 'retired' else 'poll']
                if b in (pair['poll'], pair['dissolution']):
                    b = pair['dissolution' if event == 'retired' else 'poll']
            if a != value or b != other:
                rule = 'normalised-retirement-dissolution' if event == 'retired' else 'normalised-defeat-polling'
        if other is None:
            decision, accepted = 'held-no-scoped-primary-endpoint', None
        elif not scoped:
            decision = 'held-no-scoped-primary-endpoint'
            accepted = a if a == b else None  # Candidate value only; the row remains held.
        elif a != b:
            decision, accepted = 'held-unresolved-source-conflict', None
        else:
            decision, accepted = rule, a
        reviews[raw_field] = dict(source_a=value, source_b=other,
                                 phid=primary['PHID'] if primary else None,
                                 source_b_house_scoped=bool(scoped),
                                 event=event, convention_value=accepted, decision=decision)
    return reviews


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

    The published catalogue is corpus-windowed, so a single catalogue term is
    insufficient. Check the unfiltered source career and Handbook parliament
    history too. Multiple seats/terms and whole rows with unresolved source
    conflicts are held. Open ends cannot silently assert current membership.
    """
    manifest = read(root, 'portal/public/electorates/manifest.json')
    bundle = read(root, 'portal/public' + manifest['reference_url'])
    people = {p['person_id']: p for p in bundle['people']}
    seats = {s['electorate_id']: s for s in bundle['electorates']}
    sources = {s['source_id']: s for s in bundle['sources']}
    evidence = service_evidence(root)
    by_id = defaultdict(list)
    for term in bundle['terms']:
        person = people[term['person_id']]
        if person.get('legacy_person_id'):
            by_id[(str(person['legacy_person_id']), seats[term['electorate_id']]['chamber'])].append((person, term))
    out = []
    for signal in signals:
        member = members[signal['person_id']]
        terms = by_id.get((signal['person_id'], signal['house']), [])
        changes, term_key, dated_source = {}, None, []
        career, primary, reviews = [], None, {}
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
                anchor = evidence['by_term'].get(term_key)
                # Keep the source row key as well as its exact reviewed name.
                # A same-name collision is a hold, never a merged career.
                career = [r for n in names for r in evidence['careers'].get(n, [])]
                career = sorted(career, key=lambda r: (r['start'] or '', r['source_key']))
                primary = handbook_person(person, evidence)
                reviews = endpoint_review(term, primary, evidence)
                parliaments = sorted(set(primary.get('RepresentedParliaments', []))) if primary else []
                gaps = any(b > a + 1 for a, b in zip(parliaments, parliaments[1:]))
                source_hash = evidence['files']['representatives.csv']['sha256']
                if not anchor or anchor not in career or any(s['sha256'] != source_hash for s in dated_source):
                    reason = 'held-unverified-complete-career-source'
                elif any(anchor[k] != term.get(k) for k in ('start', 'end', 'start_reason', 'end_reason')):
                    reason = 'held-catalogue-source-disagreement'
                elif len(career) != 1 or gaps:
                    reason = 'held-multiple-complete-career-rows'
                elif any(r['decision'].startswith('held-') for r in reviews.values()):
                    reason = 'held-unresolved-service-source'
                else:
                    reason = 'sourced-endpoints-already-agree-or-open'
                    for raw_field, review in reviews.items():
                        value = review['convention_value']
                        if member[raw_field] != value:
                            changes[raw_field] = dict(before=member[raw_field], after=value)
                    if changes:
                        reason = 'corrected-from-complete-sourced-career'
                if reason.startswith('held-'):
                    # Holding a row also withdraws any otherwise agreeing start
                    # or end. A conflict cannot leave a partial accepted career.
                    for review in reviews.values():
                        review['endpoint_decision'] = review['decision']
                        review['decision'] = reason
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
        row = dict(signal, disposition=reason, catalogue_term=term_key, corrections=changes,
                   after_reasons=after_reasons, sources=dated_source)
        if reviews or career:
            row.update(complete_source_career=career, endpoint_review=reviews,
                       handbook_career={k: primary[k] for k in ('PHID', 'MPorSenator', 'InCurrentParliament',
                           'ServiceHistory_Start', 'ServiceHistory_End', 'RepresentedParliaments')} if primary else None,
                       service_convention=evidence['house_convention']['name'])
        out.append(row)
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


def raw_summary(raw):
    buckets = Counter(tuple(p['reasons']) for p in raw)
    conflicts, additional = [], []
    for row in raw:
        for field, review in row.get('endpoint_review', {}).items():
            a, b = review['source_a'], review['source_b']
            original = row['start' if field == 'entered_house' else 'end']
            if b is None or a == b or a == original:
                continue
            if field == 'entered_house' and not review['source_b_house_scoped']:
                continue  # The original 60 compared starts only for House-only summaries.
            item = dict(person_id=row['person_id'], name=row['name'], field=field,
                        source_a=dict(value=a, label='OpenAustralia parliamentary service records',
                                      term=row['catalogue_term'], sha256=row['sources'][0]['sha256']),
                        source_b=dict(value=b, label='Parliamentary Handbook cached individual', phid=review['phid']),
                        event=review['event'], convention_value=review['convention_value'],
                        decision=review['decision'])
            # Retain the independent review's exact numeric-id, House-only
            # conflict cohort. Other full-name source conflicts are listed too.
            (conflicts if row['person_id'].isdigit() else additional).append(item)
    return dict(raw_reason_counts=dict(Counter(r for p in raw for r in p['reasons'])),
                raw_after_reason_counts=dict(Counter(r for p in raw for r in p['after_reasons'])),
                raw_after_flagged_rows=sum(bool(p['after_reasons']) for p in raw),
                raw_buckets=[dict(reasons=list(k), rows=n, corrected=sum(bool(p['corrections']) for p in raw if tuple(p['reasons']) == k)) for k, n in sorted(buckets.items())],
                raw_dispositions=dict(Counter(p['disposition'] for p in raw)),
                raw_corrected_rows=sum(bool(p['corrections']) for p in raw),
                raw_corrected_fields=sum(len(p['corrections']) for p in raw),
                primary_endpoint_conflict_counts=dict(Counter(p['decision'] for p in conflicts)),
                primary_endpoint_conflicts=conflicts, additional_endpoint_conflicts=additional)


def dump(report):
    """Keep individual review records on individual lines."""
    compact = {'intervals', 'raw_members', 'primary_endpoint_conflicts', 'additional_endpoint_conflicts'}
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
    report = dict(reviewed='2026-11-14', database=str(args.db),
                  database_mtime=database_mtime,
                  database_size=args.db.stat().st_size,
                  speech_group_prefilter=str(args.speech_groups) if args.speech_groups else None,
                  speech_group_sha256=hashlib.sha256(args.speech_groups.read_bytes()).hexdigest() if args.speech_groups else None,
                  note='Read-only snapshot. Corpus bounds are evidence of participation, not service endpoints. Raw corrections are a review overlay from complete pinned service careers and cached primary endpoints, normalised to recorded service events; source database and published files are unchanged. Multiple-term and unresolved source-conflict rows are held in full. First/last stored records in raw member rows are unverified id coverage and can include namesakes. The initial unmatched cohort is retained in roster_period_exceptions.json; this file records its current disposition.',
                  service_source_evidence='scripts/roster_provenance_sources.json',
                  interval_counts=counts, scanned_records=scanned, intervals=outcomes,
                  **raw_summary(raw), raw_members=raw,
                  fraser_anning_holds=read(ROOT, 'scripts/roster_accept.json')['vote_party_periods']['holds'])
    db.close()
    if datetime.fromtimestamp(args.db.stat().st_mtime, timezone.utc).isoformat() != database_mtime:
        raise RuntimeError('Source snapshot changed during the audit; review a stable copy')
    args.out.write_text(dump(report))
    print(json.dumps({k: report[k] for k in ('interval_counts', 'raw_buckets', 'raw_dispositions')}, indent=2))


if __name__ == '__main__':
    main()
