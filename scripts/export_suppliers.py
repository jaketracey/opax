#!/usr/bin/env python3
"""Export every Commonwealth supplier and latest contract to static JSON shards.

python3 scripts/export_suppliers.py --ssh desktop --output portal/public
Source DB is read-only; the export never rebuilds registers or alters source rows.
"""
import argparse
from collections import defaultdict
from contextlib import closing
from datetime import date, datetime, timezone
from decimal import Decimal
import hashlib
import json
import math
from pathlib import Path
import re
import sqlite3
import subprocess
import sys
import time
from urllib.parse import quote

DB_PATH = "/home/jake/.cache/autoresearch/parli.db"
CAVEATS = [
    "Commonwealth AusTender records only; state contracts are outside this profile's totals.",
    "One row per contract at its latest recorded notice value. Amendments are not added together. Values are awards, not verified expenditure.",
    "This is the publication window collected so far, not a complete lifetime procurement history. Start dates can predate the publication window or be scheduled in the future.",
    "Older AusTender records supplement contract numbers missing from the current notice corpus. Current records always take precedence; supplemental values may have later amendments outside the collected data.",
    "Years describe recorded contract start dates. Missing or invalid dates remain in undated totals.",
    "An identity link to the funding record does not show that a contract funded a donation, or establish influence or misconduct.",
    "Source links open the official AusTender register; search the displayed contract notice number to locate its record.",
]


def norm_name(value):
    return " ".join(str(value or "").strip().casefold().split())


def public_id(canonical_id):
    return "s-" + hashlib.sha256(canonical_id.encode()).hexdigest()[:20]


def money(value):
    return float(Decimal(str(value or 0)).quantize(Decimal("0.01")))


def valid_start_year(value):
    try:
        parsed = date.fromisoformat(str(value))
        # 1900 is a known spreadsheet/default-date artefact in the source.
        return parsed.year if 1901 <= parsed.year <= 2099 else None
    except ValueError:
        return None


def contract_base(identifier):
    return re.sub(r'-A\d+$', '', str(identifier or '').strip(), flags=re.I)


def contract_rows(db):
    """Current notices win each lineage; supplement only missing legacy bases."""
    current = [dict(r) | {'source_table': 'ext_contracts_current'} for r in db.execute(
        'SELECT * FROM ext_contracts_current ORDER BY base_cn')]
    current_bases = {contract_base(r['base_cn']) for r in current}
    have_legacy = db.execute("SELECT 1 FROM sqlite_master WHERE type='table' AND name='contracts'").fetchone()
    if not have_legacy:
        return current
    legacy = {}
    for row in db.execute('SELECT * FROM contracts ORDER BY contract_id'):
        r = dict(row)
        identifier = r['contract_id']
        base = contract_base(identifier)
        if not base or base in current_bases:
            continue
        amendment = re.search(r'-A(\d+)$', identifier, re.I)
        rank = int(amendment[1]) if amendment else 0
        previous = legacy.get(base)
        if previous is None or rank > previous[0]:
            legacy[base] = (rank, {
                'base_cn': base, 'cn_id': identifier, 'notices': 1,
                'supplier_name': r.get('supplier_name'), 'supplier_abn': None,
                'agency': r.get('agency'), 'amount': r.get('amount'),
                'start_date': r.get('start_date'), 'end_date': r.get('end_date'),
                'title': r.get('title'), 'description': r.get('description'),
                'procurement_method': r.get('procurement_method'),
                'published': None, 'source_table': 'contracts',
            })
    return current + [legacy[key][1] for key in sorted(legacy)]


def build_export(db, graph):
    started = time.monotonic()
    db.row_factory = sqlite3.Row
    db.execute("PRAGMA query_only=ON")
    db.execute("BEGIN")
    suppliers = {r['supplier_id']: dict(r) for r in db.execute('SELECT * FROM ext_contract_suppliers')}
    if not suppliers:
        raise ValueError('Supplier register is empty; wait for its rebuild to complete before exporting.')
    key_columns = {r[1] for r in db.execute('PRAGMA table_info(ext_contract_supplier_keys)')}
    key_sql = 'SELECT key_type,key_value,supplier_id FROM ext_contract_supplier_keys'
    if 'source' in key_columns:
        key_sql += " WHERE source = 'austender'"
    keys = {(r['key_type'], r['key_value']): r['supplier_id'] for r in db.execute(key_sql)}
    name_candidates = defaultdict(set)
    for (kind, value), sid in keys.items():
        if kind == 'name':
            name_candidates[norm_name(value)].add(sid)
    for sid, supplier in suppliers.items():
        name_candidates[norm_name(supplier['canonical_name'])].add(sid)
    donors = {r['entity_id']: dict(r) for r in db.execute('SELECT entity_id,canonical_name,abn FROM ext_donor_entities')}
    nodes = [n for n in graph.get('nodes', []) if n.get('kind') == 'donor']
    by_rid, by_label = defaultdict(list), defaultdict(list)
    for node in nodes:
        rid = (node.get('contracts') or {}).get('rid')
        if rid:
            by_rid[rid].append(node)
        by_label[norm_name(node.get('label'))].append(node)
    profiles = {}
    unresolved = 0
    nonfinite = 0
    published_values = []
    original_notices = 0
    source_counts = defaultdict(int)
    for row in contract_rows(db):
        r = dict(row)
        amount = float(r['amount'] or 0)
        if not math.isfinite(amount):
            nonfinite += 1
            continue
        raw_name = (r.get('supplier_name') or '').strip()
        abn = re.sub(r'\D', '', r.get('supplier_abn') or '')
        abn = abn if len(abn) == 11 else ''
        sid = keys.get(('abn', abn)) if abn else None
        if sid and suppliers.get(sid, {}).get('abn') != abn:
            sid = None
        # A raw-name key must never merge two conflicting source ABNs.
        if not sid:
            candidate = keys.get(('name', raw_name))
            if not abn and r['source_table'] == 'contracts':
                candidates = name_candidates.get(norm_name(raw_name), set())
                # Even a direct raw-name key is insufficient when the same
                # name belongs to multiple current legal identities.
                candidate = next(iter(candidates)) if len(candidates) == 1 else None
            info = suppliers.get(candidate, {})
            if candidate and (not abn or info.get('abn') == abn):
                sid = candidate
        info = suppliers.get(sid, {})
        if not info:
            unresolved += 1
            sid = 'abn:' + abn if abn else ('raw-name:' + norm_name(raw_name) if raw_name else 'undisclosed:federal')
        pid = public_id(sid)
        if pid not in profiles:
            source_abn = info.get('abn') or abn or None
            name = info.get('canonical_name') or raw_name or 'Undisclosed supplier'
            p = {
                'id': pid, 'canonical_id': sid, 'name': name, 'abn': source_abn,
                'identity': {'method': info.get('abn_method') or ('source_abn' if abn else 'exact_name'),
                             'legal_name': info.get('abr_name'), 'status': info.get('abr_status'),
                             'type': info.get('abr_etype'), 'kind': info.get('kind'),
                             'abn_url': 'https://abr.business.gov.au/ABN/View?abn=' + source_abn if source_abn else None},
                'total': Decimal(0), 'count': 0, 'aliases': set(), 'agencies': {}, 'years': {},
                'undated': {'total': Decimal(0), 'count': 0}, 'contracts': [], 'donor_links': [],
                'caveats': CAVEATS.copy(),
            }
            linked = by_rid.get(sid, [])
            method = 'published_graph_supplier_id'
            confidence = None
            donor = donors.get(info.get('donor_entity_id'))
            if linked and donor and source_abn and donor.get('abn') and source_abn != donor['abn']:
                linked = []
            if not linked and donor and info.get('donor_method') in {'abn', 'name_exact'}:
                matches = by_label.get(norm_name(donor['canonical_name']), [])
                if len(matches) == 1:
                    # ABN disagreement prevents even an existing exact-name link.
                    if not (source_abn and donor.get('abn') and source_abn != donor['abn']):
                        linked = matches
                        method = info['donor_method']
                        confidence = info.get('donor_confidence')
            for node in linked:
                p['donor_links'].append({'id': node['id'], 'name': node['label'],
                    'url': '/subject/donor/' + quote(node['label'], safe=''), 'method': method,
                    'confidence': confidence})
            profiles[pid] = p
        p = profiles[pid]
        source_counts[r['source_table']] += 1
        if raw_name:
            p['aliases'].add(raw_name)
        value = Decimal(str(amount))
        p['total'] += value
        p['count'] += 1
        agency = r.get('agency') or 'Unspecified agency'
        a = p['agencies'].setdefault(agency, {'name': agency, 'total': Decimal(0), 'count': 0})
        a['total'] += value
        a['count'] += 1
        year = valid_start_year(r.get('start_date'))
        y = p['years'].setdefault(year, {'year': year, 'total': Decimal(0), 'count': 0}) if year else p['undated']
        y['total'] += value
        y['count'] += 1
        description = r.get('description') or ''
        p['contracts'].append({
            'id': r.get('cn_id') or r['base_cn'], 'base_id': r['base_cn'],
            'title': r.get('title') or description[:200] or 'Contract notice',
            'description': description[:2000], 'description_truncated': len(description) > 2000,
            'agency': agency, 'amount': money(amount), 'start_date': r.get('start_date'),
            'end_date': r.get('end_date'), 'published': r.get('published'),
            'procurement_method': r.get('procurement_method'), 'notices': r.get('notices') or 1,
            'reported_supplier': raw_name, 'url': 'https://www.tenders.gov.au/',
            'link_scope': 'source_register', 'source_table': r['source_table'],
        })
        original_notices += r.get('notices') or 1
        if r.get('published'):
            published_values.append(r['published'])
    directory = []
    shards = defaultdict(lambda: {'profiles': {}})
    for p in profiles.values():
        p['total'] = money(p['total'])
        p['aliases'] = sorted(p['aliases'], key=lambda n: (norm_name(n), n))
        p['agencies'] = sorted(p['agencies'].values(), key=lambda a: (-a['total'], a['name']))
        p['years'] = sorted(p['years'].values(), key=lambda y: y['year'])
        for group in [*p['agencies'], *p['years'], p['undated']]:
            group['total'] = money(group['total'])
        p['contracts'].sort(key=lambda c: (-c['amount'], c['id']))
        p['first_year'] = p['years'][0]['year'] if p['years'] else None
        p['last_year'] = p['years'][-1]['year'] if p['years'] else None
        path = '/suppliers/' + p['id'][2:4] + '.json'
        directory.append({k: p[k] for k in ('id', 'canonical_id', 'name', 'abn', 'total', 'count', 'aliases', 'first_year', 'last_year')}
                         | {'agency_count': len(p['agencies']), 'profile_path': path,
                            'money_node_ids': [link['id'] for link in p['donor_links']],
                            'lookup_names': sorted({link['name'] for link in p['donor_links']})})
        shards[path]['profiles'][p['id']] = p
    directory.sort(key=lambda p: (-p['total'], p['name'], p['id']))
    meta = {
        'generated_at': datetime.now(timezone.utc).isoformat(), 'scope': 'Commonwealth',
        'supplier_count': len(directory), 'contract_count': sum(p['count'] for p in directory),
        'notice_count': original_notices, 'total': money(sum(Decimal(str(p['total'])) for p in directory)),
        'current_contract_count': source_counts['ext_contracts_current'],
        'supplemental_legacy_contract_count': source_counts['contracts'],
        'published_from': min(published_values, default=None), 'published_to': max(published_values, default=None),
        'source': 'AusTender, Department of Finance. Latest contract notice per amendment lineage.',
        'source_url': 'https://www.tenders.gov.au/', 'licence': 'CC BY 3.0 AU',
        'year_basis': 'Calendar year of recorded contract start date',
        'unresolved_contract_rows': unresolved, 'excluded_nonfinite_amount_rows': nonfinite,
        'suppliers_linked_to_funding': sum(bool(p['money_node_ids']) for p in directory),
        'graph_snapshot': graph.get('meta', {}).get('generated'), 'caveats': CAVEATS,
        'export_seconds': round(time.monotonic() - started, 3),
    }
    db.rollback()
    return {'index': {'meta': meta, 'suppliers': directory}, 'shards': dict(shards)}


def write_export(result, output):
    output = Path(output)
    output.mkdir(parents=True, exist_ok=True)
    for relative, data in result['shards'].items():
        target = output / relative.lstrip('/')
        target.parent.mkdir(parents=True, exist_ok=True)
        temporary = target.with_suffix('.json.tmp')
        temporary.write_text(json.dumps(data, ensure_ascii=False, allow_nan=False, separators=(',', ':')) + '\n')
        temporary.replace(target)
    target = output / 'suppliers.json'
    temporary = target.with_suffix('.json.tmp')
    temporary.write_text(json.dumps(result['index'], ensure_ascii=False, allow_nan=False, separators=(',', ':')) + '\n')
    temporary.replace(target)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--ssh')
    parser.add_argument('--db', default=DB_PATH)
    parser.add_argument('--money', type=Path, default=Path('portal/public/graph/money.json'))
    parser.add_argument('--output', type=Path, default=Path('portal/public'))
    parser.add_argument('--stdout', action='store_true')
    args = parser.parse_args()
    graph = globals().get('BUNDLED_GRAPH') or json.loads(args.money.read_text())
    if args.ssh:
        script = Path(__file__).read_text()
        payload = f"import sys\nsys.argv=['export_suppliers.py','--db',{args.db!r},'--stdout']\nexec({script!r},{{'__name__':'__main__','BUNDLED_GRAPH':{graph!r}}})\n"
        remote = subprocess.run(['ssh', args.ssh, 'python3', '-'], input=payload, text=True,
                                capture_output=True, check=True)
        result = json.loads(remote.stdout)
    else:
        with closing(sqlite3.connect('file:' + quote(str(Path(args.db).expanduser()), safe='/') + '?mode=ro', uri=True)) as db:
            result = build_export(db, graph)
    if args.stdout:
        print(json.dumps(result, ensure_ascii=False, allow_nan=False, separators=(',', ':')))
    else:
        write_export(result, args.output)
        print(json.dumps(result['index']['meta'], indent=2))


if __name__ == '__main__':
    main()
