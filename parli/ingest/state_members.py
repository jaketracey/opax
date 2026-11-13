"""Dated state member observations, exact electorate joins and retained source evidence.

Acquisition is opt-in. A refused jurisdiction stays paused in the evidence manifest.
No member list implies a service start date or attributes any speeches to a person.
"""
from __future__ import annotations

import copy
import hashlib
import io
import json
import logging
import re
import time
import unicodedata
from collections import defaultdict
from datetime import date, datetime, timezone
from pathlib import Path
from urllib.parse import urljoin, urlparse
from zoneinfo import ZoneInfo

import requests
from bs4 import BeautifulSoup

from parli.electorates import canonical_json, stable_id, validate
from parli.ingest.electorates import party as party_label
from parli.ingest.state_rosters import canonical_party

LOG = logging.getLogger(__name__)
STATES = frozenset({'act', 'nsw', 'nt', 'qld', 'sa', 'tas', 'wa'})
LOWER_HOUSES = {'act': 'act_la', 'nsw': 'nsw_la', 'nt': 'nt_la', 'qld': 'qld_la',
                'sa': 'sa_ha', 'tas': 'tas_ha', 'wa': 'wa_la'}
USER_AGENT = 'opax-improve-audit'


def normalise_electorate(value: str | None) -> str:
    """Exact word equality after typography, case and the whole token Mt are normalised.

    Never remove words such as North, Region or District, or guess a renamed seat.
    Apostrophes disappear; hyphens become spaces, including Unicode dash forms.
    """
    value = unicodedata.normalize('NFKC', value or '').casefold()
    value = re.sub("['’‘ʼ]", '', value)
    value = re.sub(r'[^\w]+', ' ', value)
    return re.sub(r'\bmt\b', 'mount', value).strip()


def name_key(value: str) -> str:
    return normalise_electorate(value)


def fetch_page(evidence: Path, state: str, url: str, label: str) -> Path | None:
    """One GET per second or slower, redirects included, no retries after refusal.

    Raw responses (including refusals) and digests stay outside the repository.
    Call only for a list or a resource that its official page links or embeds.
    """
    if state not in STATES or not re.fullmatch(r'[a-z0-9-]+', label):
        raise ValueError('Invalid jurisdiction or evidence label')
    evidence.mkdir(parents=True, exist_ok=True)
    manifest = evidence / 'acquisition.json'
    rows = json.loads(manifest.read_text()) if manifest.exists() else []
    if any(r['state'] == state and r.get('refused') for r in rows):
        raise ValueError(f'Site paused after refusal: {state}')
    for row in rows:
        if row['url'] == url and row.get('status') == 200:
            path = evidence / row['path']
            if hashlib.sha256(path.read_bytes()).hexdigest() != row['sha256']:
                raise ValueError('Cached source digest changed')
            return path
    for _ in range(6):
        host = urlparse(url).hostname or ''
        domain = f'parliament.{state}.gov.au'
        if urlparse(url).scheme != 'https' or not (host == domain or host.endswith('.' + domain)):
            raise ValueError('Unapproved source host')
        time.sleep(1.1)  # Also applies to the first request and every redirect.
        try:
            response = requests.get(url, headers={'User-Agent': USER_AGENT}, timeout=40, allow_redirects=False)
            raw = response.content
            digest = hashlib.sha256(raw).hexdigest()
            filename = f'{state}-{label}-{digest[:12]}.raw'
            (evidence / filename).write_bytes(raw)
            challenge = any(token in raw.lower() for token in (
                b'cf-chl-', b'just a moment...', b'verify you are human', b'request rejected',
                b'access denied', b'captcha challenge', b'incapsula incident id'))
            row = dict(state=state, url=url, status=response.status_code,
                       fetched_at=datetime.now(timezone.utc).isoformat(), path=filename,
                       sha256=digest, content_type=response.headers.get('Content-Type'),
                       location=response.headers.get('Location'),
                       refused=(response.status_code >= 400 and response.status_code != 404) or challenge)
        except requests.RequestException as error:
            row = dict(state=state, url=url, status=None, fetched_at=datetime.now(timezone.utc).isoformat(),
                       error=str(error), refused=True)
        rows.append(row)
        manifest.write_text(json.dumps(rows, indent=2) + '\n')
        if row['refused']:
            LOG.warning('REFUSED %s: %s', state, url)
            return None
        if row['status'] in (301, 302, 303, 307, 308):
            url = urljoin(url, row['location'])
            continue
        return evidence / row['path']
    raise ValueError('Redirect limit exceeded')


def source_observation(record: dict, label: str) -> dict:
    """Keep the response instant and the Australian calendar date of observation."""
    as_of = datetime.fromisoformat(record['fetched_at']).astimezone(ZoneInfo('Australia/Sydney')).date().isoformat()
    return dict(jurisdiction=record['state'], as_of=as_of, basis='official_current_list',
                sources=[dict(source_id=stable_id('source', record['url'] + ':' + record['sha256']),
                              label=label, url=record['url'], fetched_at=record['fetched_at'],
                              sha256=record['sha256'])])


def parse_act(raw: bytes) -> list[dict]:
    """Read only the member, electorate and affiliation cells, never contact details."""
    from parli.ingest.act_hansard import _plain
    soup = BeautifulSoup(raw, 'html.parser')
    members = []
    for row in soup.select('tr'):
        cells = row.find_all('td', recursive=False)
        link = cells[0].select_one('a[href*="/members/current/"]') if cells else None
        if not link or len(cells) < 3:
            continue
        # The bold surname ends before postnominals and office-holder titles.
        surname = link.select_one('strong, b')
        if surname:
            parts = []
            for node in link.contents:
                if node is surname:
                    parts.append(str(node)); break
                parts.append(str(node))
            name = _plain(''.join(parts))
        else:
            name = link.get_text(' ', strip=True)
        affiliation = re.sub(r'^[^A-Za-z]+', '', _plain(str(cells[2]))).strip()
        members.append(dict(name=name, electorate=_plain(str(cells[1])), party=affiliation,
                            source_key=link['href'], url=link['href']))
    linked = {a['href'] for a in soup.select('a[href*="/members/current/"]')}
    if not members or linked != {m['source_key'] for m in members}:
        raise ValueError('ACT member list incomplete or layout changed')
    return members


def parse_sa(raw: bytes, *, statewide: str | None = None) -> list[dict]:
    data = json.loads(raw)
    members = []
    for row in data['memberContacts']:
        name = f"{row.get('preferredName') or row['firstName']} {row['lastName']}"
        legal = ' '.join(filter(None, [row['firstName'], row.get('otherName'), row['lastName']]))
        url = f"https://www.parliament.sa.gov.au/Search/Member?type=member&id={row['pmId']}"
        members.append(dict(name=name, aliases=[legal] if legal != name else [],
                            party=row['politicalPartyName'], electorate=statewide or row['electorateName'],
                            source_key=url, url=url))
    if not members:
        raise ValueError('SA member list is empty')
    return members


def parse_tas(raw: bytes, directory: bytes, chamber: str) -> list[dict]:
    """The directory proves the spreadsheet has every member; surnames must be unique.

    The mail merge can repeat a minister's address. Blank-electorate rows are
    ignored; duplicate member rows with different facts fail validation later.
    """
    import openpyxl
    soup = BeautifulSoup(directory, 'html.parser')
    prefix = '/house-of-assembly/currentmembers/' if chamber == 'tas_ha' else '/legislative-council/members/'
    links = {a['href']: re.sub(r'^The Honourable\s+', '', a.get_text(' ', strip=True))
             for a in soup.select('main a[href]') if prefix in a['href']}
    workbook = openpyxl.load_workbook(io.BytesIO(raw), read_only=True, data_only=True)
    try:
        rows = list(workbook.active.values)
    finally:
        workbook.close()
    headers = [str(v or '').strip().lower() for v in rows[0]]
    members, used = [], set()
    for values in rows[1:]:
        row = dict(zip(headers, values))
        if not all(str(row.get(k) or '').strip() for k in ('first', 'last', 'electorate')):
            continue
        surname = re.sub(r'\s+M(?:P|LC)$', '', str(row['last']).strip())
        name = f"{str(row['first']).strip()} {surname}"
        matches = [url for url, display in links.items() if name_key(display).endswith(' ' + name_key(surname))]
        if len(matches) != 1:
            raise ValueError(f'Tasmanian directory identity unresolved: {name}')
        url = matches[0]
        electorate = re.sub(r'^Member for\s+', '', str(row['electorate']).strip())
        members.append(dict(name=name, aliases=[links[url]] if links[url] != name else [],
                            party=str(row['party']).strip(), electorate=electorate, source_key=url, url=url))
        used.add(url)
    if not members or used != set(links):
        raise ValueError('Tasmanian spreadsheet and directory disagree')
    return members


def wikidata_observations(rows: list[dict]) -> list[dict]:
    """Collapse SPARQL bindings, keeping only dated open terms at the held fetch date.

    Open terms are observations on that date, never evidence of later service.
    Conflicting parties remain unknown, rather than choosing a party binding.
    """
    groups = defaultdict(list)
    for row in rows:
        if row['state'] not in STATES:
            continue
        on = row['fetched_at'][:10]
        if not row.get('term_start') or row['term_start'] > on or (row.get('term_end') and row['term_end'] <= on):
            continue
        groups[(row['state'], row['chamber'], on)].append(row)
    out = []
    for (state, chamber, on), terms in sorted(groups.items()):
        people = defaultdict(list)
        for row in terms:
            people[(row['qid'], row.get('district'))].append(row)
        members, sources = [], {}
        for (qid, district), bindings in sorted(people.items(), key=lambda item: str(item[0])):
            url = 'https://www.wikidata.org/wiki/' + qid
            sid = stable_id('source', f'held-state-roster:{on}:{qid}')
            sources[sid] = dict(source_id=sid, label=f'OPAX held Wikidata state roster: {qid}', url=url,
                                fetched_at=bindings[0]['fetched_at'],
                                sha256=hashlib.sha256(canonical_json(bindings).encode()).hexdigest(),
                                checksum_scope='OPAX ext_state_roster bindings, not the live Wikidata page')
            parties = {r['party'] for r in bindings if r.get('party')}
            members.append(dict(name=bindings[0]['full_name'], electorate=district,
                                party=next(iter(parties)) if len(parties) == 1 else None,
                                source_key=qid, sources=[sid]))
        out.append(dict(jurisdiction=state, chamber=chamber, as_of=on, basis='held_wikidata_terms',
                        members=members, sources=list(sources.values())))
    return out


def join_state_members(bundle: dict, observations: list[dict], *, catalog: list[dict] = ()) -> tuple[dict, list[dict]]:
    """Join by jurisdiction, house and exact normalised name, with no fuzzy seat joins.

    Official lists take precedence over open Wikidata terms, even if older.
    Within each source class newer observations win. Ambiguities and over-capacity
    or multiple-seat claims are logged and omitted, never silently selected.
    """
    out = copy.deepcopy(bundle)
    # This import is a reproducible current snapshot. Rebuild its observations
    # so a newer stale Wikidata term cannot shadow an older official list.
    state_seats = {e['electorate_id'] for e in out['electorates'] if e['jurisdiction'] in STATES}
    out['rosters'] = [r for r in out['rosters'] if r['electorate_id'] not in state_seats
                      or r.get('basis') not in ('held_wikidata_terms', 'official_current_list')]
    issues = []
    seats = defaultdict(list)
    people = {p['person_id']: p for p in out['people']}
    sources = {s['source_id']: s for s in out['sources']}
    for seat in out['electorates']:
        if seat['jurisdiction'] in STATES and seat['status'] == 'current':
            seats[(seat['jurisdiction'], seat['chamber'], normalise_electorate(seat['name']))].append(seat)
    names = defaultdict(set)
    for person in people.values():
        if person.get('jurisdiction') in STATES:
            for name in [person['name'], *person.get('aliases', [])]:
                names[(person['jurisdiction'], name_key(name))].add(person['person_id'])
    # The portal's reviewed full-name fields and aliases can address a surname profile.
    for person in catalog:
        for state in set(person.get('states', [])) & STATES:
            targets = names.get((state, name_key(person['name'])), set())
            if len(targets) == 1:
                for name in [person['name'], person.get('full') or '', *person.get('aliases', [])]:
                    if name:
                        names[(state, name_key(name))].update(targets)

    def issue(reason, observation, member=None, **extra):
        row = dict(reason=reason, jurisdiction=observation['jurisdiction'], chamber=observation['chamber'],
                   as_of=observation['as_of'], basis=observation['basis'], **extra)
        if member:
            row.update(source_key=member['source_key'], name=member['name'], electorate=member.get('electorate'))
        issues.append(row)
        LOG.warning('State roster join: %s', canonical_json(row))

    latest = {}
    for observation in sorted(observations, key=lambda o: (o['basis'] == 'official_current_list', o['as_of'])):
        state, chamber, on = observation['jurisdiction'], observation['chamber'], observation['as_of']
        if state not in STATES or not chamber.startswith(state + '_'):
            raise ValueError('State observation outside authorised scope')
        date.fromisoformat(on)
        grouped, claims = defaultdict(dict), defaultdict(set)
        for member in observation['members']:
            matches = seats.get((state, chamber, normalise_electorate(member.get('electorate'))), [])
            if len(matches) != 1:
                issue('no electorate match' if not matches else 'ambiguous electorate', observation, member)
                continue
            seat = matches[0]
            key = member['source_key']
            claims[key].add(seat['electorate_id'])
            prior = grouped[seat['electorate_id']].get(key)
            if prior and prior != member:
                raise ValueError('Conflicting duplicate source member')
            grouped[seat['electorate_id']][key] = member
        for eid, members_by_key in grouped.items():
            seat = next(e for e in out['electorates'] if e['electorate_id'] == eid)
            if len(members_by_key) > seat['capacity']:
                issue('roster exceeds capacity', observation, electorate=seat['name'], electorate_id=eid)
                continue
            if any(len(claims[key]) != 1 for key in members_by_key):
                issue('member on multiple seats', observation, electorate=seat['name'], electorate_id=eid)
                continue
            # Do not replace a newer recorded observation with older imported evidence.
            previous = [r for r in out['rosters'] if r['electorate_id'] == eid]
            if previous and max(r['as_of'] for r in previous) > on:
                continue
            latest[eid] = (observation, seat, list(members_by_key.values()))
    # Resolve people only for the selected roster, never superseded open terms.
    for eid, (observation, seat, selected_members) in latest.items():
        state, on = observation['jurisdiction'], observation['as_of']
        sources.update({s['source_id']: s for s in observation['sources']})
        members = []
        for member in selected_members:
            keys = [member['name'], *member.get('aliases', [])]
            matches = set().union(*(names.get((state, name_key(n)), set()) for n in keys))
            if len(matches) > 1:
                issue('ambiguous person identity; retained separate source identity', observation, member)
            pid = next(iter(matches)) if len(matches) == 1 else stable_id('person', f"state-roster:{state}:{member['source_key']}")
            member_sources = member.get('sources') or [s['source_id'] for s in observation['sources']]
            if pid not in people:
                people[pid] = dict(person_id=pid, name=member['name'], aliases=sorted(set(member.get('aliases', []))),
                                   jurisdiction=state, sources=sorted(set(member_sources)))
            else:
                person = people[pid]
                person['aliases'] = sorted(set([*person.get('aliases', []), *member.get('aliases', []), person['name']]) - {member['name']})
                person['name'] = member['name']
                person['sources'] = sorted(set(person['sources']) | set(member_sources))
            for name in keys:
                names[(state, name_key(name))].add(pid)
            supplied_party = member.get('party')
            members.append(dict(person_id=pid, party=supplied_party,
                                party_canonical=canonical_party(party_label(supplied_party)) if supplied_party else None,
                                sources=member_sources,
                                source_url=next(s['url'] for s in observation['sources'] if s['source_id'] == member_sources[0]),
                                basis=f'Current as at {on}', source_key=member['source_key']))
        if len({m['person_id'] for m in members}) != len(members):
            raise ValueError('Two source rows resolve to one person in a seat')
        roster = dict(roster_id=stable_id('roster', f'state-members:{on}:{eid}:{observation["basis"]}'),
                      electorate_id=eid, as_of=on, capacity=seat['capacity'],
                      observation_only=True,
                      complete=len(members) == seat['capacity'], priority=20 if observation['basis'] == 'official_current_list' else 5,
                      members=sorted(members, key=lambda m: m['person_id']),
                      sources=sorted({s for m in members for s in m['sources']}), basis=observation['basis'])
        out['rosters'].append(roster)
    current = {}
    for eid in {r['electorate_id'] for r in out['rosters']}:
        seat = next(e for e in out['electorates'] if e['electorate_id'] == eid)
        if seat['jurisdiction'] not in STATES:
            continue
        roster = max((r for r in out['rosters'] if r['electorate_id'] == eid), key=lambda r: (r['as_of'], r.get('priority', 0)))
        for member in roster['members']:
            key = member['person_id']
            if key in current and current[key] != eid:
                raise ValueError('Member on two current seats')
            current[key] = eid
    out['people'] = list(people.values())
    out['sources'] = list(sources.values())
    refresh_state_coverage(out)
    validate(out)
    return out, issues


def refresh_state_coverage(bundle: dict) -> None:
    """Update state coverage without changing federal or Victorian metadata."""
    jurisdictions = bundle.setdefault('coverage', {}).setdefault('jurisdictions', {})
    for state in STATES:
        seats = [e for e in bundle['electorates'] if e['jurisdiction'] == state]
        rosters = [max((r for r in bundle['rosters'] if r['electorate_id'] == e['electorate_id']),
                       key=lambda r: (r['as_of'], r.get('priority', 0)), default=None) for e in seats]
        rosters = [r for r in rosters if r]
        jurisdictions.setdefault(state, {}).update(
            roster_constituencies=len(rosters), roster_members=sum(len(r['members']) for r in rosters),
            roster_dates=sorted({r['as_of'] for r in rosters}))
    notes = [n for n in bundle['coverage'].get('notes', [])
             if not n.startswith('Senate and state Council results/history')]
    bundle['coverage']['notes'] = list(dict.fromkeys([*notes,
        'State current members are dated observations, not service start dates. Held lists retain their original dates.',
        'State roster acquisition refusals and reviewed missing seats: data/state-members/exceptions.json.',
        'Senate and state Council results/history are not yet indexed. WA Council roster data is not yet verified.',
    ]))
