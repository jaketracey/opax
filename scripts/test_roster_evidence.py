"""Roster periods must cite their own member, including any shared evidence fallback."""
from collections import defaultdict
import json
from pathlib import Path
import re
from urllib.parse import parse_qs, urlsplit

import pytest

ROOT = Path(__file__).resolve().parents[1]
# Reviewed SA Parliament member ids and agreeing secondary Wikidata person ids.
SA_MEMBERS = {
    'Cory Bernardi': ('7377', 'Q4354299', '2026-03-21'),
    'Hilton Gumbys': ('7380', 'Q138755015', '2026-03-21'),
    'Rebecca Hewett': ('7376', 'Q54553273', '2026-03-21'),
    'Carlos Quaremba': ('7379', 'Q138755063', '2026-03-21'),
    'Melanie Selwood': ('7378', 'Q138755057', '2026-03-21'),
    'Mira El Dannawi': ('7122', 'Q124048767', '2023-10-17'),
}


def evidence_urls(value):
    if isinstance(value, dict):
        for key, item in value.items():
            if key in ('url', 'source_url') and isinstance(item, str):
                yield item
            else:
                yield from evidence_urls(item)
    elif isinstance(value, list):
        for item in value:
            yield from evidence_urls(item)


def single_person_record(url):
    """Canonical identity so query strings or wiki/entity spellings cannot hide reuse."""
    parsed = urlsplit(url)
    host = (parsed.hostname or '').removeprefix('www.')
    if host == 'wikidata.org':
        match = re.fullmatch(r'/(?:wiki|entity)/(Q\d+)/?', parsed.path)
        if match:
            return 'wikidata', match[1]
    if host == 'parliament.sa.gov.au' and parsed.path.lower() == '/search/member':
        member_id = parse_qs(parsed.query).get('id')
        if member_id:
            return 'sa-parliament', member_id[0]
    return None


def test_no_roster_period_shares_a_single_person_evidence_record_across_members():
    accept = json.loads((ROOT / 'scripts/roster_accept.json').read_text())
    roster = json.loads((ROOT / 'portal/public/parliamentarians.json').read_text())
    owners = defaultdict(set)
    entries = [(name, group) for name, groups in accept['records'].items() for group in groups]
    entries += list(accept['new'].items())
    for name, entry in entries:
        # A group can have its own URL and still inherit someone else's shared evidence URL.
        source = accept['evidence'][entry['evidence']]
        if source.get('person'):
            assert source['person'] == name
        for url in evidence_urls([entry, source]):
            if record := single_person_record(url):
                owners[record].add(name)
    for person in roster['people']:
        for url in evidence_urls(person):
            if record := single_person_record(url):
                owners[record].add(person['name'])
    assert {record: sorted(names) for record, names in owners.items() if len(names) > 1} == {}


@pytest.mark.parametrize('name', SA_MEMBERS)
def test_sa_council_primary_and_secondary_records_name_the_reviewed_person(name):
    accept = json.loads((ROOT / 'scripts/roster_accept.json').read_text())
    member_id, wikidata_id, held_start = SA_MEMBERS[name]
    entry = (next(g for g in accept['records'][name] if g.get('term_start'))
             if name in accept['records'] else accept['new'][name])
    source = accept['evidence'][entry['evidence']]
    assert source['person'] == name
    for url in (source['url'], entry['url'], entry['term_start']['url']):
        assert single_person_record(url) == ('sa-parliament', member_id)
    assert entry['term_start']['start'] == held_start
    secondary, = source['secondary_sources']
    assert single_person_record(secondary['url']) == ('wikidata', wikidata_id)
    assert secondary['start'] == held_start
