#!/usr/bin/env python3
"""Build the reviewed party evidence offline from read-only roster/Handbook caches.

The Wikidata cache contains wbgetentities JSON, fetched with opax-improve-audit
at no more than one request per second. This builder never fetches or writes a DB.
Only public parliamentary identities with exact full names and overlapping
same-house service are retained. Review and accept proposals separately.
"""
import argparse
from datetime import date, timedelta
import hashlib
import json
from pathlib import Path
import sqlite3
import sys

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
from parli.ingest.state_rosters import POSITIONS, canonical_party  # noqa: E402
from parli.ingest.speech_hygiene import clean_party  # noqa: E402
from scripts.roster_fold import name_key  # noqa: E402
from scripts.roster_identity import weak  # noqa: E402


def label(raw):
    value = canonical_party(raw)
    return clean_party(value) or value if value else None


def time_value(snak, *, end=False):
    v = snak.get('datavalue', {}).get('value', {})
    # A year-precision membership start supplies only its latest possible day.
    # Ends use the earliest possible day, so an imprecise end never extends it.
    if v.get('precision') == 9:
        return v['time'][1:5] + ('-01-01' if end else '-12-31')
    if v.get('precision', 0) < 11:
        return None
    return v['time'][1:11]


def service_details(source, entity):
    """Close a held term only from the same P39 position and exact start date."""
    district = source['district']
    if source['chamber'].endswith('_lc') and (district or '').startswith('Legislative Council district of '):
        district = None
    result = dict(electorate=district, end=source['term_end'])
    if result['end']:
        return result
    hits = []
    for claim in entity.get('claims', {}).get('P39', []):
        position = claim['mainsnak'].get('datavalue', {}).get('value', {}).get('id')
        if claim.get('rank') == 'deprecated' or position != POSITIONS.get((source['state'], source['chamber'])):
            continue
        q = claim.get('qualifiers', {})
        if any(v.get('datavalue', {}).get('value', {}).get('precision') != 11 for v in q.get('P580', [])):
            continue
        starts = [time_value(v) for v in q.get('P580', [])]
        ends = [time_value(v, end=True) for v in q.get('P582', [])]
        if starts == [source['term_start']] and len(ends) == 1 and ends[0] and ends[0] >= source['term_start']:
            hits.append((ends[0], claim['id']))
    if len({end for end, _ in hits}) == 1:
        result.update(end=hits[0][0], service_statement=hits[0][1])
    return result


def membership_period(service, qualifiers, party, fetched):
    starts = [time_value(v) for v in qualifiers.get('P580', [])]
    ends = [time_value(v, end=True) for v in qualifiers.get('P582', [])]
    if len(starts) != 1 or not starts[0] or (ends and (len(ends) != 1 or not ends[0])):
        return None
    start = max(service['start'], starts[0])
    boundaries = [service['end']] if service['end'] else []
    if ends:
        boundaries.append(str(date.fromisoformat(ends[0]) - timedelta(days=1)))
    end = min(boundaries) if boundaries else None
    if start <= (end or fetched):
        return dict(party=party, start=start, end=end, through=fetched)
    return None


def build(db, roster, wikidata_cache, handbook_cache, fetched):
    conn = sqlite3.connect(f'{db.resolve().as_uri()}?mode=ro', uri=True)
    conn.row_factory = sqlite3.Row
    rows = [dict(r) for r in conn.execute('SELECT * FROM ext_state_roster')]
    conn.close()
    entities = {k: v for path in sorted(wikidata_cache.glob('batch-*.json'))
                for k, v in json.loads(path.read_text())['entities'].items()}
    parties = json.loads((wikidata_cache / 'parties.json').read_text())['entities']
    party_names = {k: v['labels']['en']['value'] for k, v in parties.items()}
    people = []
    for row in roster['people']:
        if weak(row['name']) or row.get('party') or row.get('party_now'):
            continue
        for source in rows:
            if (name_key(source['full_name']) != name_key(row['name']) or not source['term_start']
                    or source['chamber'] not in row['chambers'] or row['states'] != [source['state']]
                    or int(source['term_start'][:4]) > row.get('last', 0)
                    or int((source['term_end'] or source['fetched_at'])[:4]) < row.get('first', 9999)):
                continue
            s = dict(name=source['full_name'], identity=source['qid'], jurisdiction=source['state'],
                     chamber=source['chamber'], electorate=source['district'], start=source['term_start'],
                     end=source['term_end'], as_of=source['fetched_at'][:10], source_party=source['party'],
                     source_url='https://www.wikidata.org/wiki/' + source['qid'],
                     basis='Wikidata P39 service with P4100 parliamentary group', periods=[], undated=[])
            s.update(service_details(source, entities.get(source['qid'], {})))
            if s.get('service_statement'):
                s['as_of'] = fetched
            party = label(source['party'])
            if party:
                s['periods'] = [dict(party=party, start=s['start'], end=s['end'], through=s['as_of'])]
            # New fills require an explicitly dated P102 statement. An undated
            # membership, or coalition label, supplies no historic party period.
            if not party and source['qid'] in entities:
                memberships = entities[source['qid']].get('claims', {}).get('P102', [])
                for claim in memberships:
                    if claim.get('rank') == 'deprecated':
                        continue
                    q = claim.get('qualifiers', {})
                    party_qid = claim['mainsnak'].get('datavalue', {}).get('value', {}).get('id')
                    party = label(party_names.get(party_qid))
                    if not party:
                        continue
                    period = membership_period(s, q, party, fetched)
                    if period:
                        s['periods'].append(period)
                        s['as_of'] = fetched
                        s['basis'] = 'Wikidata P39 service intersected with explicitly dated P102 membership'
                        s['membership_statement'] = claim['id']
            people.append(s)
    # The held Handbook data includes exact identities and service as well as
    # party records. Undated party records stay undated recorded affiliations.
    handbook = json.loads((handbook_cache / 'party_records.json').read_text())
    senators = json.loads((ROOT / 'scripts/handbook_party_service.json').read_text())['people']
    for row in roster['people']:
        if row.get('party') or row.get('party_now') or weak(row['name']):
            continue
        matches = [p for p in senators if str(p.get('pid')) == row.get('pid') and name_key(row['name']) in {name_key(n) for n in p['names']}]
        if len(matches) != 1:
            continue
        person = matches[0]
        individuals = [i for i in handbook['individuals'] if str(i['PHID']) == person['phid'] and i['MPorSenator'] == ['Senator']]
        if len(individuals) != 1:
            continue
        ind = individuals[0]
        start, end = ind['ServiceHistory_Start'], ind['ServiceHistory_End']
        periods = [dict(party=p['party'], start=p['start'], end=(str(date.fromisoformat(p['end']) - timedelta(days=1)) if p['end'] else p['through']), through=handbook['fetched'][:10]) for p in person['periods']]
        people.append(dict(name=row['name'], identity='handbook:' + person['phid'], pid=person['pid'], jurisdiction='federal',
                           chamber='senate', electorate=ind['SenateState'], start=start, end=end,
                           as_of=handbook['fetched'][:10], source_url='https://handbookapi.aph.gov.au/api/recordsofservice?$filter=PHID eq ' + "'" + person['phid'] + "' and ROSTypeID eq 11",
                           basis='Parliamentary Handbook parliamentary party and service', periods=periods,
                           undated=person['undated']))
    unique = {json.dumps(p, sort_keys=True): p for p in people}
    paths = [*sorted(wikidata_cache.glob('*.json')), handbook_cache / 'party_records.json']
    return dict(meta=dict(reviewed=fetched, sources=['ext_state_roster (read-only local snapshot)', 'scripts/handbook_party_service.json', 'Parliamentary Handbook cache', 'Wikidata wbgetentities'],
                          input_sha256={p.name: hashlib.sha256(p.read_bytes()).hexdigest() for p in paths},
                          rule='Exact full name, overlapping dated service in the same house. P4100 dates only its own P39 term; undated P102 is held. Open terms are observations through as_of.'),
                people=sorted(unique.values(), key=lambda p: (p['jurisdiction'], p['name'], p['chamber'], p['start'])))


def main():
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument('--db', type=Path, required=True)
    ap.add_argument('--roster', type=Path, required=True)
    ap.add_argument('--wikidata-cache', type=Path, required=True)
    ap.add_argument('--handbook-cache', type=Path, required=True)
    ap.add_argument('--fetched', required=True)
    ap.add_argument('--output', type=Path, required=True)
    a = ap.parse_args()
    doc = build(a.db, json.loads(a.roster.read_text()), a.wikidata_cache, a.handbook_cache, a.fetched)
    a.output.write_text(json.dumps(doc, ensure_ascii=False, indent=2) + '\n')
    print(f"Wrote {len(doc['people'])} public parliamentary service observations")


if __name__ == '__main__':
    main()
