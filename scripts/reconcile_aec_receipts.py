#!/usr/bin/env python3
"""Independent offline CSV/Decimal audit. Imports no receipt pipeline code.

Policy is repeated deliberately in this verifier; the two production consumers
share aec_receipt_selection. DB inputs supply only existing identity mappings,
industry classifications and review exclusions, never the measured amounts.
"""
import argparse
from collections import Counter, defaultdict
import csv
from decimal import Decimal
import hashlib
import html
import io
import json
from pathlib import Path
import re
import sqlite3
import unicodedata
import zipfile


def decoded_name(name):
    for _ in range(2):
        name = re.sub(r"&(?:#\d{1,7}|#[xX][0-9a-fA-F]{1,6}|[A-Za-z][A-Za-z0-9]{1,31});", lambda m: html.unescape(m[0]), name)
    if any(c in name for c in "ÂÃâ"):
        try:
            name = name.encode('cp1252').decode('utf-8')
        except (UnicodeError, ValueError):
            pass
    return name


def normal_name(name):
    name = decoded_name(name)
    name = unicodedata.normalize('NFKD', name).encode('ascii', 'ignore').decode().lower()
    name = name.replace('&', ' and ').replace('+', ' and ')
    return re.sub(r'[^a-z0-9]+', ' ', re.sub(r"['’`´]", '', name)).strip()


def bracketless_name(name):
    name = decoded_name(name)
    if annotation_name(name):
        return ''
    stripped = re.sub(r'\([^()\[\]]*\)|\[[^()\[\]]*\]', ' ', name)
    return normal_name(name if re.search(r'[()\[\]]', stripped) else stripped)


def annotation_name(name):
    return any(re.search(r'\b(?:see|notes?|pages?|annotations?)\b', a or b, re.I)
               for a, b in re.findall(r'\(([^()\[\]]*)\)|\[([^()\[\]]*)\]', decoded_name(name)))


def state_brackets(name):
    parts = [normal_name(a or b) for a, b in re.findall(r'\(([^()\[\]]*)\)|\[([^()\[\]]*)\]', decoded_name(name))]
    return tuple(p for p in parts if re.search(
        r'\b(?:nsw|qld|vic|wa|sa|tas|act|nt|q|new south wales|queensland|victoria|'
        r'western australia|south australia|tasmania|australian capital territory|northern territory)\b', p))


def year_key(value):
    return re.sub(r'^(\d{4})-(?:19|20)(\d{2})$', r'\1-\2', value or '')


def money(value):
    return Decimal(str(value or 0))


def audit(db, archive, graph, comparison, legacy=None):
    aliases = dict(db.execute('SELECT alias_raw,entity_id FROM ext_donor_aliases'))
    exact = defaultdict(set)
    for name, eid in aliases.items():
        exact[normal_name(name)].add(eid)
    exact = {k: next(iter(v)) for k, v in exact.items() if k and len(v) == 1}

    def entity(name):
        return aliases.get(name) or exact.get(normal_name(name))

    kinds = dict(db.execute('SELECT entity_id,kind FROM ext_donor_entities'))
    recipients, flagged, industries = defaultdict(set), set(), defaultdict(Counter)
    for donor, recipient, party, amount, fy, tag, flag in db.execute(
        "SELECT donor_name,recipient,recipient_canonical,amount,financial_year,industry,donation_type "
        "FROM donations WHERE source IN ('aec_annual','aec_election','aec_referendum')"):
        if party:
            recipients[recipient].add(party)
        if flag == 'flagged_review':
            flagged.add((donor, recipient, money(amount), year_key(fy)))
        if tag and tag not in ('other', 'unidentified'):
            industries[entity(donor) or donor][tag] += money(amount)
    recipients = {name: next(iter(parties)) for name, parties in recipients.items() if len(parties) == 1}
    tags = {eid: 'unions' if kinds.get(eid) == 'union' else max(values, key=values.get) for eid, values in industries.items()}
    node_for_name, node_for_entity, normalised, bracketless = (defaultdict(set) for _ in range(4))
    states_for_name = defaultdict(lambda: defaultdict(set))
    nodes = {n['id']: n for n in graph['nodes']}
    for node in nodes.values():
        if node['kind'] == 'donor':
            for name in [node['label'], *node.get('aliases', [])]:
                node_for_name[name].add(node['id'])
                if entity(name):
                    node_for_entity[entity(name)].add(node['id'])
                if normal_name(name):
                    normalised[normal_name(name)].add(node['id'])
                if bracketless_name(name):
                    bracketless[bracketless_name(name)].add(node['id'])
                    states_for_name[bracketless_name(name)][node['id']].add(state_brackets(name))
    edges = {(e['source'], e['target']): e for e in graph['edges'] if nodes[e['source']]['kind'] == 'donor' and nodes[e['target']]['kind'] == 'party'}
    # Separate from production regex constants, to detect selection drift.
    government = re.compile(r'electoral comm?iss?ions?|election funding|electoral funding|electoral office|tax(ation)?\s+(office|authority)|\bato\b|\baec\b|\becq\b|department of|australian agency|commonwealth of australia|electoral comm\b', re.I)
    internal = re.compile(r'\blabor\b|\bliberal\b|\bliberals\b|\bgreens\b|\bnationals\b|\bone nation\b|\bunited australia\b|\bkatter\b|\bfamily first\b|\bcentre alliance\b|\bcountry liberal\b|\blnp\b|\balp\b|\bcormack foundation\b|\bjohn curtin house\b|\bfree enterprise foundation\b|\bnational party\b|\bdemocrats\b', re.I)
    measured = defaultdict(Counter)
    cells = defaultdict(lambda: defaultdict(lambda: defaultdict(lambda: [Decimal(0), 0])))
    exported_rows = 0
    with zipfile.ZipFile(archive) as z:
        raw = z.read('Detailed Receipts.csv')
        text = raw.decode('utf-8-sig')
        for row in csv.DictReader(io.StringIO(text)):
            if row['Return Type'].strip() != 'Political Party Return':
                continue
            donor, recipient = row['Received From'].strip(), row['Recipient Name'].strip()
            amount = Decimal(re.sub(r'[$,\s]', '', row['Value']) or '0')
            period = year_key(row['Financial Year'].strip())
            eid = entity(donor)
            if not donor or recipient not in recipients or amount <= 0:
                continue
            if annotation_name(donor) or (donor, recipient, amount, period) in flagged:
                continue
            if kinds.get(eid) in ('government', 'party_unit') or government.search(donor) or internal.search(donor):
                continue
            party = recipients[recipient]
            typ = re.sub(r'[^a-z0-9]+', '_', row['Receipt Type'].strip().lower()).strip('_') or 'unknown'
            for measure in ([] if typ == 'public_funding' else ['all_types', *(['donation_only'] if typ == 'donation_received' else [])]):
                measured[('uncapped', tags.get(eid or donor), measure)][party] += amount
            source = None
            for tier, candidates in enumerate((node_for_entity.get(eid), node_for_name.get(donor),
                                               normalised.get(normal_name(donor)), bracketless.get(bracketless_name(donor)))):
                if candidates:
                    if len(candidates) == 1:
                        source = next(iter(candidates))
                        states = state_brackets(donor)
                        if tier == 3 and states and not any(not other or states == other
                                for other in states_for_name[bracketless_name(donor)][source]):
                            source = None
                    break
            key = (source, 'party:' + party)
            if key not in edges:
                continue
            cell = cells[key][period][typ]
            cell[0] += amount; cell[1] += 1
            exported_rows += 1
            for measure in ([] if typ == 'public_funding' else ['all_types', *(['donation_only'] if typ == 'donation_received' else [])]):
                measured[('map', nodes[source].get('industry'), measure)][party] += amount
    for key, edge in edges.items():
        by_type = Counter()
        by_year = {}
        for period, types in cells[key].items():
            by_year[period] = {typ: [amount, count] for typ, (amount, count) in types.items()}
            for typ, (amount, _) in types.items():
                by_type[typ] += amount
        assert dict(by_type) == {k: money(v) for k, v in edge['by_type'].items()}, key
        actual_years = {fy: {typ: [money(cell[0]), cell[1]] for typ, cell in types.items()} for fy, types in edge['by_type_year'].items()}
        assert by_year == actual_years, key
    assert exported_rows == graph['meta']['receipt_types']['counts']['exported_rows']
    result = {}
    for industry in ('gambling', 'finance'):
        result[industry] = {}
        for scope, field in [('uncapped', 'industries_full_party_receipts'), ('map', 'industries_visible_graph_receipts')]:
            result[industry][scope] = {}
            for measure in ('donation_only', 'all_types'):
                values = measured[(scope, industry, measure)]
                total = sum(values.values(), Decimal(0))
                ranked = sorted(values.items(), key=lambda r: (-r[1], r[0]))[:5]
                reported = comparison[field][industry][measure]
                assert total == money(reported['aud']), (industry, scope, measure)
                assert ranked == [(r['recipient'], money(r['aud'])) for r in reported['top5']], (industry, scope, measure, 'ranking')
                result[industry][scope][measure] = {'aud': str(total), 'top5': [{'recipient': name, 'aud': str(amount)} for name, amount in ranked]}
    if legacy:
        original = json.loads(legacy.read_bytes())
        current = json.loads(json.dumps(graph))
        for value in (original, current):
            value['meta'].pop('receipt_types', None)
            for item in value['nodes'] + value['edges']:
                item.pop('by_type', None); item.pop('by_type_year', None)
        assert original == current, 'Legacy graph fields changed'
    return {'method': 'Independent stdlib CSV/ZIP/Decimal calculation; no production receipt modules imported',
            'archive_sha256': hashlib.sha256(archive.read_bytes()).hexdigest(), 'receipt_edges_checked': len(edges),
            'detailed_receipts_csv_sha256': hashlib.sha256(raw).hexdigest(),
            'exported_rows': exported_rows, 'legacy_fields_unchanged': bool(legacy), 'industries': result}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--db', required=True, type=Path)
    parser.add_argument('--archive', default=Path('~/.cache/autoresearch/donations/AllAnnualData.zip').expanduser(), type=Path)
    parser.add_argument('--graph', default=Path('portal/public/graph/money.json'), type=Path)
    parser.add_argument('--comparison', default=Path('docs/reports/2026-11-12-aec-receipt-types.json'), type=Path)
    parser.add_argument('--legacy-graph', type=Path)
    parser.add_argument('--out', required=True, type=Path)
    args = parser.parse_args()
    db = sqlite3.connect(f'file:{args.db}?mode=ro', uri=True)
    result = audit(db, args.archive, json.loads(args.graph.read_text()), json.loads(args.comparison.read_text()), args.legacy_graph)
    args.out.write_text(json.dumps(result, indent=2) + '\n')
    print(f"Reconciled {result['receipt_edges_checked']} receipt edges, {result['exported_rows']} rows; gambling/finance totals and rankings match")


if __name__ == '__main__':
    main()
