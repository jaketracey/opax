"""Federal Hansard and divisions from the public OpenAustralia XML archive.

Default operation stages JSONL, unified divisions/votes and a read-only audit.
--load-divisions is used only by the reviewed nightly on its refresh database.
An empty XML file is a no-sitting observation, never a delete instruction.
"""
from __future__ import annotations

import argparse
from collections import Counter, defaultdict
from dataclasses import asdict
from datetime import date, datetime, timezone
import json
import os
from pathlib import Path
import re
import sqlite3
import xml.etree.ElementTree as ET

from scripts.roster_identity import agrees, federal_members, member, verify
from .honest_http import HonestHTTP, Refused, Unavailable
from . import http as source_http
from .cache_batch import CacheBatch
from .speaker_names import normalize_speaker
from .tvfy_bill_links import official_ref
from .tvfy_refresh import PARTY_CANONICAL
from .votes_state import Division, Vote, EXT_DDL, DIVISION_COLUMNS, VOTE_COLUMNS, bill_ref, person_key

BASE = 'https://data.openaustralia.org.au'
FOLDERS = {'representatives': 'representatives_debates', 'senate': 'senate_debates'}
DEFAULT_STAGE = Path('/home/jake/opax-staging/oa-feed')


def read_only(path):
    return sqlite3.connect(Path(path).expanduser().resolve().as_uri() + '?mode=ro', uri=True)


def atomic(path, body):
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_suffix(path.suffix + '.tmp')
    tmp.write_text(body, encoding='utf-8')
    tmp.replace(path)


class People:
    """Office -> OA person -> guarded identity; never join on a surname."""
    def __init__(self, people, offices, db):
        self.by_office = {}
        self.names = {}
        self.members = federal_members(db)
        for p in ET.fromstring(people):
            pid = p.attrib['id'].rsplit('/', 1)[-1]
            self.names[pid] = p.attrib.get('latestname', '')
            for office in p.findall('office'):
                self.by_office[office.attrib['id']] = pid
        self.offices = defaultdict(list)
        self.person_offices = defaultdict(list)
        for xml in offices:
            for office in ET.fromstring(xml):
                self.offices[office.attrib['id']].append(dict(office.attrib))
                pid = self.by_office.get(office.attrib['id'])
                if pid:
                    self.person_offices[pid].append(dict(office.attrib))
        self.resolved = {}

    def resolve(self, office, printed, house, day):
        key = (office, printed, house, day)
        if key in self.resolved:
            return self.resolved[key]
        pid = self.by_office.get(office)
        candidates = [o for o in self.offices.get(office, []) if o.get('house') == house
                      and o.get('fromdate', '0000') <= day <= o.get('todate', '9999')]
        # Historic transcripts sometimes retain a person's preceding office ID
        # after a party/seat change. people.xml explicitly ties both offices to
        # the same person; use their unique dated membership, never a name join.
        if pid and not candidates:
            candidates = [o for o in self.person_offices[pid] if o.get('house') == house
                          and o.get('fromdate', '0000') <= day <= o.get('todate', '9999')]
        if not pid or not candidates:
            raise ValueError(f'office identity/term unavailable: {office} on {day}')
        o = candidates[0]
        # Date-only office boundaries can overlap on a party-switch day.
        # Every candidate is explicitly the same person. Keep that identity,
        # but do not guess their affiliation/electorate within the day.
        parties = {c.get('party', '') for c in candidates}
        electorates = {c.get('division', '') for c in candidates}
        display = ' '.join([o.get('firstname', ''), o.get('lastname', '')]).strip()
        # Use the established identity guard with this office's dated service.
        known = self.members.get(pid)
        names = [display, self.names.get(pid, '')] + (known['names'] if known else [])
        authority = member(pid, names, house, int(o['fromdate'][:4]), int(o['todate'][:4]))
        row = {'name': printed or display, 'states': ['federal'], 'chambers': [house],
               'first': int(day[:4]), 'last': int(day[:4])}
        found, _ = verify(row, Counter({pid: 1}), {pid: authority}, {}, int(day[:4]))
        if found != pid:
            raise ValueError(f'identity guard rejected office {office} on {day}')
        owner = next((n for n in (known['names'] if known else []) if agrees(display, n)), display)
        result = {'person_id': pid, 'speaker': display, 'person_name': normalize_speaker(owner),
                  'party': next(iter(parties)) if len(parties) == 1 else '',
                  'electorate': next(iter(electorates)) if len(electorates) == 1 else '',
                  'oa_office_id': office}
        self.resolved[key] = result
        return result


def division_ids(db, cache=None):
    ids = {}
    for did, house, day, number in db.execute(
            "SELECT division_id,house,date,number FROM divisions WHERE COALESCE(state,'federal')='federal'"):
        if number is not None:
            ids[(house, day, int(number))] = f'federal-{house}-{did}'
    for key, house, day, number in db.execute("SELECT id,house,date,number FROM ext_divisions WHERE jurisdiction='federal'"):
        if number is not None:
            ids[(house, day, int(number))] = key
    # The cached list audit is an identity crosswalk, not a source of votes.
    if cache:
        for path in sorted(Path(cache).expanduser().glob('*.json')):
            house = path.name.split('_', 1)[0]
            if house not in FOLDERS:
                continue
            for d in json.loads(path.read_text()):
                if d.get('number') is not None:
                    ids.setdefault((house, d['date'], int(d['number'])), f"federal-{house}-{d['id']}")
    return ids


def plain(node):
    # Equivalent to the existing HTML parser's get_text(strip=True), with
    # XML entities already decoded and inline element tails preserved.
    return ''.join(t.strip() for t in node.itertext())


def parse_day(raw, house, day, people, ids):
    date.fromisoformat(day)
    if not raw:
        return [], [], [], []
    root = ET.fromstring(raw)
    if root.tag != 'debates':
        raise ValueError('expected OpenAustralia debates XML')
    speeches, divisions, votes, issues = [], [], [], []
    major = minor = question = ''
    bills = []
    children = list(root)
    for index, node in enumerate(children):
        if node.tag == 'major-heading':
            major, minor, question, bills = plain(node), '', '', []
        elif node.tag == 'minor-heading':
            minor, question, bills = plain(node), '', []
        elif node.tag == 'bills':
            bills = [{'id': b.get('id'), 'official_id': official_ref(b.get('id')), 'title': plain(b), 'url': b.get('url')}
                     for b in node.findall('bill')]
        elif node.tag == 'speech':
            paragraphs = [plain(p) for p in list(node)]
            text = '\n\n'.join(p for p in paragraphs if p)
            for p in node.iter('p'):
                if p.get('pwmotiontext') or re.search(r'\b(?:The question is|Question put|That this|That the)\b', plain(p)):
                    question = plain(p)
            identity = {'person_id': None, 'speaker': node.get('speakername', ''), 'party': '', 'electorate': ''}
            if node.get('speakerid') and node.get('speakerid') != 'unknown':
                try:
                    identity = people.resolve(node.get('speakerid'), node.get('speakername'), house, day)
                except ValueError as exc:
                    issues.append({'kind': 'speech-identity', 'gid': node.get('id'), 'reason': str(exc)})
                    continue
            speeches.append({k: identity[k] for k in ('person_id', 'speaker', 'party', 'electorate')} |
                            {'date': day, 'chamber': house, 'topic': major or minor,
                             'text': text, 'gid': node.get('id'), 'oa_office_id': node.get('speakerid'),
                             'source_url': node.get('url')})
        elif node.tag == 'division':
            if node.get('divdate') != day:
                raise ValueError('division date differs from chamber-day')
            number = int(node.attrib['divnumber'])
            did = ids.get((house, day, number), f'federal-{house}-oa-{day}-{number}')
            counts = node.find('divisioncount')
            if counts is None:
                raise ValueError('division count unavailable')
            ayes, noes = int(counts.attrib['ayes']), int(counts.attrib['noes'])
            local_bills = [{'id': b.get('id'), 'official_id': official_ref(b.get('id')), 'title': plain(b), 'url': b.get('url')}
                           for b in node.findall('./bills/bill')] or bills
            listed, seen = Counter(), set()
            dvotes = []
            for group in node.findall('memberlist'):
                for voter in group.findall('member'):
                    side = voter.get('vote') or group.get('vote')
                    side = 'paired' if side in ('pair', 'paired', 'pairaye', 'pairno') else side
                    if side not in ('aye', 'no', 'paired', 'absent', 'abstention'):
                        raise ValueError(f'unknown vote {side}')
                    listed[side] += 1
                    try:
                        identity = people.resolve(voter.get('id'), plain(voter), house, day)
                        pid = identity['person_id']
                        if pid in seen:
                            raise ValueError(f'duplicate person {pid}')
                        seen.add(pid)
                        dvotes.append(Vote(did, identity['person_name'], plain(voter), f'tvfy_{pid}', side,
                                           PARTY_CANONICAL.get(identity['party'].casefold())))
                    except ValueError as exc:
                        issues.append({'kind': 'vote-identity', 'division': did, 'reason': str(exc)})
            if (listed['aye'], listed['no']) != (ayes, noes):
                issues.append({'kind': 'vote-count', 'division': did, 'printed': [ayes, noes],
                               'listed': [listed['aye'], listed['no']]})
            result = 'affirmative' if ayes > noes else 'negative'
            # Some divisions (e.g. leave) require a special majority. The
            # recorded resolution following the division takes precedence.
            for following in children[index + 1:index + 3]:
                if following.tag != 'speech':
                    break
                text = plain(following).lower()
                if not re.match(r'^(?:the )?(?:question|motion|amendment|bill|clause)\b', text):
                    continue
                if 'negatived' in text or 'resolved in the negative' in text:
                    result = 'negative'; break
                if 'agreed to' in text or 'resolved in the affirmative' in text:
                    result = 'affirmative'; break
            divisions.append(Division(did, 'federal', house, day, number,
                                      ' - '.join(t for t in (major, minor) if t), question or None,
                                      bill_ref(minor, major), ayes, noes, result, 'openaustralia_xml',
                                      f'{BASE}/scrapedxml/{FOLDERS[house]}/{day}.xml',
                                      {'oa_gid': node.get('id'), 'parlinfo_url': node.get('url'), 'bills': local_bills,
                                       'counts': dict(counts.attrib), 'listed': dict(listed)}))
            votes.extend(dvotes)
    return speeches, divisions, votes, issues


def audit(db, divisions, votes, issues, days):
    existing = {r[0] for r in db.execute("SELECT id FROM ext_divisions WHERE jurisdiction='federal'")}
    recorded = {(r[0], r[1], r[2]) for r in db.execute(
        "SELECT division_id,person_id,vote FROM ext_votes WHERE jurisdiction='federal'")}
    blocked = {i.get('division') for i in issues if i.get('division')}
    quarantined = [d for d in divisions if d.id not in existing and d.id in blocked]
    recovered = [d for d in divisions if d.id not in existing and d.id not in blocked]
    new_votes = [v for v in votes if v.division_id not in blocked
                 and (v.division_id, v.person_id, v.vote) not in recorded]
    return {'source': BASE, 'dry_run': True, 'parsed_divisions': len(divisions), 'parsed_votes': len(votes),
            'existing_ext_federal_divisions': len(existing), 'recovered_divisions': len(recovered),
            'recovered_by_year': dict(sorted(Counter(d.date[:4] for d in recovered).items())),
            'quarantined_recovered_divisions': [d.id for d in quarantined],
            'parsed_by_year': dict(sorted(Counter(d.date[:4] for d in divisions).items())),
            'additional_member_votes': len(new_votes), 'issues': issues, 'days': days}


def apply_divisions(db, divisions, votes):
    """Add/enrich complete chamber-days. Never remove old divisions or votes."""
    db.executescript(EXT_DDL)
    by_id = {d.id: d for d in divisions}
    now = datetime.now(timezone.utc).strftime('%Y-%m-%dT%H:%M:%SZ')
    for d in divisions:
        db.execute('INSERT OR IGNORE INTO ext_divisions (' + ','.join(DIVISION_COLUMNS) + ') VALUES (' +
                   ','.join('?' for _ in DIVISION_COLUMNS) + ')',
                   tuple(getattr(d, k) for k in DIVISION_COLUMNS[:-2]) + (json.dumps(d.extra), now))
        # Bill IDs remain available even for an existing TVFY division.
        if d.extra.get('oa_gid'):
            db.execute('CREATE TABLE IF NOT EXISTS oa_division_provenance '
                       '(division_id TEXT PRIMARY KEY, gid TEXT, evidence TEXT)')
            db.execute('INSERT OR REPLACE INTO oa_division_provenance VALUES (?,?,?)',
                       (d.id, d.extra['oa_gid'], json.dumps(d.extra)))
    for v in votes:
        d = by_id[v.division_id]
        prior = db.execute('SELECT vote FROM ext_votes WHERE division_id=? AND person_id=?',
                           (v.division_id, v.person_id)).fetchall()
        if prior and any(r[0] != v.vote for r in prior):
            raise ValueError(f'vote conflicts with stored evidence: {v.division_id} {v.person_id}')
        if not prior:
            db.execute('INSERT INTO ext_votes (' + ','.join(VOTE_COLUMNS) + ') VALUES (' +
                       ','.join('?' for _ in VOTE_COLUMNS) + ')',
                       (d.id, d.jurisdiction, d.house, d.date, d.source, v.person_name,
                        person_key(v.person_name), v.person_raw, v.person_id, v.vote, v.party))


def fetch(args, db):
    with CacheBatch(args.stage, args.modern_dir) as batch:
        result = _fetch(args, db, batch)
        if result[2]['issues'] and (args.modern_dir or getattr(args, 'load_divisions', False)):
            raise ValueError(f"XML evidence has {len(result[2]['issues'])} issues; cache retained")
        batch.publish()
        return result


def _fetch(args, db, batch):
    http = HonestHTTP()
    stage = Path(args.stage).expanduser()
    if args.offline:
        metadata = [(stage / f).read_bytes() for f in ('people.xml', 'representatives.xml', 'senators.xml')]
    else:
        metadata = []
        for f in ('people.xml', 'representatives.xml', 'senators.xml'):
            raw = http.get(f'{BASE}/members/{f}')
            if not raw:
                raise Unavailable('member mapping unavailable')
            ET.fromstring(raw)
            batch.write(stage / f, raw)
            metadata.append(raw)
    people = People(metadata[0], metadata[1:], db)
    ids = division_ids(db, args.tvfy_list_cache)
    divisions, votes, issues, days = [], [], [], []
    for house, folder in FOLDERS.items():
        if args.offline:
            files = sorted((stage / 'raw' / folder).glob('*.xml'))
            dates = [p.stem for p in files]
        else:
            index = http.get(f'{BASE}/scrapedxml/{folder}/')
            if not index or b'Index of' not in index:
                raise Unavailable('XML directory index unavailable')
            dates = sorted(set(re.findall(r'href="(\d{4}-\d{2}-\d{2})\.xml"', index.decode())))
        for day in dates:
            if not args.start <= day <= args.end:
                continue
            path = stage / 'raw' / folder / (day + '.xml')
            if args.offline:
                raw = path.read_bytes()
            else:
                raw = http.get(f'{BASE}/scrapedxml/{folder}/{day}.xml')
                if raw is None:
                    raise Unavailable('listed XML disappeared')
                batch.write(path, raw)
            s, d, v, bad = parse_day(raw, house, day, people, ids)
            days.append({'date': day, 'house': house, 'status': 'sitting' if raw else 'no_sitting',
                         'speeches': len(s), 'divisions': len(d)})
            if raw and args.modern_dir and not bad:
                batch.write(Path(args.modern_dir).expanduser() / f'{day}_{house}.jsonl',
                       ''.join(json.dumps(r, ensure_ascii=False) + '\n' for r in s))
            divisions.extend(d); votes.extend(v); issues.extend(bad)
    for did, count in Counter(d.id for d in divisions).items():
        if count > 1:
            issues.append({'kind': 'division-identity', 'division': did, 'occurrences': count})
    report = audit(db, divisions, votes, issues, days)
    batch.write(stage / 'divisions.json', json.dumps({'divisions': [asdict(d) for d in divisions],
                                               'votes': [asdict(v) for v in votes]}, ensure_ascii=False))
    batch.write(stage / 'dry-run.json', json.dumps(report, indent=2))
    return divisions, votes, report


def main():
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument('--db', default=os.environ.get('OPAX_DB', '~/.cache/autoresearch/parli.db'))
    ap.add_argument('--start', default='2006-02-07')
    ap.add_argument('--end', default=date.today().isoformat())
    ap.add_argument('--stage', default=str(DEFAULT_STAGE))
    ap.add_argument('--modern-dir')
    ap.add_argument('--offline', action='store_true')
    ap.add_argument('--tvfy-list-cache', default='~/.cache/autoresearch/tvfy/list')
    ap.add_argument('--load-divisions', action='store_true')
    args = ap.parse_args()
    try:
        with read_only(args.db) as db:
            divisions, votes, report = fetch(args, db)
        if report['issues'] and (args.load_divisions or args.modern_dir):
            raise ValueError(f"XML evidence has {len(report['issues'])} issues; see staging dry-run.json")
        if args.load_divisions:
            with sqlite3.connect(str(Path(args.db).expanduser())) as db:
                apply_divisions(db, divisions, votes)
        print(json.dumps({k: v for k, v in report.items() if k not in ('issues', 'days')}))
    except Refused as exc:
        raise source_http.SourceRefused(exc.url or BASE, str(exc)) from None
    except (Unavailable, ValueError, ET.ParseError) as exc:
        raise SystemExit(str(exc)) from None


if __name__ == '__main__':
    main()
