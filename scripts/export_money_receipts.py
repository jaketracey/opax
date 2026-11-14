"""Uncapped recipient receipts for factual calculations, built beside the drawing graph.

No source fetch or ingestion: use the existing ReceiptSelection and canonical industry
method from report_aec_receipt_types. Keep typed all-receipt cells for explicitly
labelled receipt questions; only donation_received contributes to donation rankings.
"""
from collections import Counter, defaultdict
from copy import deepcopy
import json
import hashlib
from pathlib import Path

from scripts.aec_receipt_selection import load_selection
from scripts.aec_receipt_types import add_receipt, receipt_cells, receipt_fields
from scripts.export_money_graph import associated_fields, load_associated_register, norm_key, year_of
from scripts.receipt_donor_match import ReceiptDonorMatcher


def merge_receipt_cells(target, source):
    for kind, amount in source['by_type'].items():
        target['by_type'][kind] += amount
    for period, types in source['by_type_year'].items():
        for kind, (amount, count) in types.items():
            target['by_type_year'][period][kind][0] += amount
            target['by_type_year'][period][kind][1] += count


def export_receipts(db, graph, *, recover_brackets=True):
    if not graph.get('meta', {}).get('receipt_types', {}).get('available'):
        raise ValueError('Complete cached AEC receipt backfill required for uncapped money facts')
    selection = load_selection(db)
    entities = {r[0]: {"name": r[1], "kind": r[2]} for r in db.execute(
        "SELECT entity_id,canonical_name,kind FROM ext_donor_entities")} if db.execute(
        "SELECT 1 FROM sqlite_master WHERE name='ext_donor_entities'").fetchone() else {}
    industries = defaultdict(Counter)
    for donor, amount, industry in db.execute(
        "SELECT donor_name,amount,industry FROM donations "
        "WHERE source IN ('aec_annual','aec_election','aec_referendum')"):
        if industry and industry not in ("other", "unidentified"):
            industries[selection.entity(donor) or donor][industry] += amount or 0
    tags = {eid: "unions" if selection.entity_kinds.get(eid) == "union" else max(tags, key=tags.get)
            for eid, tags in industries.items()}
    register = load_associated_register(db, selection.aliases, selection.exact)
    # Retain published IDs, names, disclosure links and party-return aggregates.
    nodes = {n['id']: deepcopy(n) for n in graph['nodes'] if n['kind'] in ('party', 'donor')}
    entity_nodes, name_nodes = {}, {}
    for node in nodes.values():
        if node['kind'] != 'donor':
            continue
        for name in [node['label'], *node.get('aliases', [])]:
            name_nodes[name] = node['id']
            eid = selection.entity(name)
            if eid:
                entity_nodes[eid] = node['id']
    cells, node_cells, names = defaultdict(receipt_cells), defaultdict(receipt_cells), defaultdict(set)
    excluded = Counter()
    donor_parties = defaultdict(lambda: defaultdict(lambda: {'total': 0}))
    for donor, recipient, amount, period, kind, recipient_kind in db.execute(
        "SELECT donor_name,recipient,amount,financial_year,receipt_type,recipient_kind "
        "FROM aec_receipt_records WHERE record_side='recipient'"):
        reason = selection.exclusion(donor, recipient, amount, period, recipient_kind, receipt_type=kind)
        if reason:
            excluded[reason] += 1
            continue
        eid = selection.entity(donor)
        identity = eid or donor
        source = entity_nodes.get(eid) if eid else name_nodes.get(donor)
        if not source:
            label = entities.get(eid, {}).get('name') or donor
            source = 'donor:' + norm_key(label)
            if source in nodes:
                source += '~' + (str(eid) if eid else donor)
            nodes[source] = {"id": source, "label": label, "kind": "donor", "aliases": []}
            if eid:
                entity_nodes[eid] = source
            else:
                name_nodes[donor] = source
        names[source].add(donor)
        nodes[source]['industry'] = tags.get(identity, 'other')
        target = 'party:' + selection.recipient_party[recipient]
        if target not in nodes:
            nodes[target] = {"id": target, "label": selection.recipient_party[recipient], "kind": "party"}
        donor_parties[source][selection.recipient_party[recipient]]['total'] += amount
        add_receipt(cells[source, target], kind, period, amount)
        add_receipt(node_cells[source], kind, period, amount)
        add_receipt(node_cells[target], kind, period, amount)
    # Identity recovery runs over the full selection, before any factual totals
    # are published. The drawing matcher retains its existing lookup behaviour.
    for source, spellings in names.items():
        nodes[source]['aliases'] = sorted(set(nodes[source].get('aliases', [])) | (spellings - {nodes[source]['label']}))
    matcher = ReceiptDonorMatcher(nodes.values(), selection)
    active = {source for source in node_cells if nodes[source]['kind'] == 'donor'}
    folds, decisions = matcher.bracket_folds(active) if recover_brackets else ({}, [])
    for source, target in folds.items():
        merge_receipt_cells(node_cells[target], node_cells.pop(source))
        names[target].update([nodes[source]['label'], *nodes[source].get('aliases', []), *names.pop(source, set())])
        for party, values in donor_parties.pop(source, {}).items():
            donor_parties[target][party]['total'] += values['total']
        del nodes[source]
    for (source, target), values in list(cells.items()):
        if source in folds:
            merge_receipt_cells(cells[folds[source], target], values)
            del cells[source, target]
    def fields(cells):
        typed = receipt_fields(cells)
        years = defaultdict(lambda: [0, 0])
        for period, types in typed['by_type_year'].items():
            year = year_of(period)
            if year:
                for amount, count in types.values():
                    years[str(year)][0] += amount
                    years[str(year)][1] += count
        return {**typed, 'total': round(sum(typed['by_type'].values()), 2),
                'count': sum(c[1] for t in typed['by_type_year'].values() for c in t.values()),
                'byYear': {y: [round(c[0], 2), c[1]] for y, c in sorted(years.items())},
                'firstYear': min(map(int, years)) if years else None,
                'lastYear': max(map(int, years)) if years else None}
    for node in nodes.values():
        if node['kind'] == 'donor':
            # Drawing clusters can disagree with the audit's canonical industry.
            node.pop('group', None)
        selected = fields(node_cells[node['id']])
        if node['kind'] == 'party':
            # Party receipt questions retain their separate whole-return contract.
            node.update(selected if 'total' not in node else {k: v for k, v in selected.items() if k.startswith('by_type')})
        else:
            # A declaration-only node retains its raw record for the labelled declaration answer.
            if selected['count']:
                node.update(selected)
            elif not node.get('by_type', {}).get('public_funding'):
                node.update({k: v for k, v in selected.items() if k.startswith('by_type')})
            node['aliases'] = sorted(set(node.get('aliases', [])) | (names[node['id']] - {node['label']}))
            eid = selection.entity(node['label'])
            node.update(associated_fields({'eid': eid, 'names': [node['label'], *node['aliases']], 'parties': donor_parties[node['id']]}, register))
    edges = [{'source': s, 'target': t, **fields(c)} for (s, t), c in sorted(cells.items())]
    # Declaration-only flows remain available as declarations, never receipt totals.
    edges.extend({**deepcopy(e), 'source': folds.get(e['source'], e['source'])} for e in graph['edges'] if not e.get('grant') and not e.get('flow')
                 and not any(e.get('by_type', {}).get(k, 0) for k in e.get('by_type', {}) if k != 'public_funding')
                 and (folds.get(e['source'], e['source']), e['target']) not in cells)
    scope = ('Uncapped recipient-side itemised party receipts selected by '
             'aec_receipt_selection.ReceiptSelection; public funding, government/internal '
             'payers, reviewed outliers and nonpositive rows excluded. Donor declarations '
             'are never added. Donations count Donation Received only; no loans are inferred.')
    meta = {k: deepcopy(v) for k, v in graph['meta'].items() if k.startswith('party_return')}
    meta.update({'generated': graph['meta'].get('generated'), 'jurisdiction': 'federal',
                 'uncapped': True, 'source': 'AEC recipient returns', 'methodology': scope,
                 'coverage': graph['meta'].get('coverage'),
                 'receipt_types': {**graph['meta']['receipt_types'], 'scope': scope,
                                   'counts': {'excluded': dict(excluded), 'exported_rows': sum(e['count'] for e in edges if (e['source'], e['target']) in cells)}}})
    private_key = lambda value: hashlib.sha256(value.encode()).hexdigest()
    statuses = Counter(row['status'] for row in decisions)
    meta['bracket_aliases'] = {
        'method': 'ReceiptDonorMatcher.brackets',
        'rule': 'Bracket-bearing canonical source labels fold into one plain base of the same individual/organisation kind. Base ambiguity is never broken by kind, state, year, amount or map membership.',
        'counts': {'bracket_form_entities': len(decisions),
                   'bracket_split_entities': sum(bool(row['candidates']) for row in decisions),
                   **{status: statuses[status] for status in ('folded', 'ambiguous', 'kind_mismatch', 'state_mismatch', 'no_base')}},
        'decisions': [{**{key: value for key, value in row.items() if key not in ('source', 'target', 'candidates')},
                       'source_sha256': private_key(row['source']),
                       'candidate_sha256': [private_key(value) for value in row['candidates']],
                       **({'target_sha256': private_key(row['target'])} if 'target' in row else {})}
                      for row in decisions],
    }
    out = {'meta': meta, 'nodes': sorted(nodes.values(), key=lambda n: n['id']), 'edges': edges}
    # Small public donation-only industry/party summary; independent of map membership.
    sums = defaultdict(lambda: defaultdict(float))
    for edge in edges:
        industry = nodes[edge['source']].get('industry', 'other')
        sums[industry][nodes[edge['target']]['label']] += edge.get('by_type', {}).get('donation_received', 0)
    summary = {'meta': {'schema': 1, 'generated': meta['generated'], 'uncapped': True,
                        'measure': 'donation_received', 'selection': scope},
               'industries': {ind: {party: round(amount, 2) for party, amount in sorted(parties.items()) if amount}
                              for ind, parties in sorted(sums.items())}}
    return out, summary


def write_receipts(db, graph, receipts_path, totals_path):
    receipts, totals = export_receipts(db, graph)
    for path, data in ((receipts_path, receipts), (totals_path, totals)):
        Path(path).write_text(json.dumps(data, ensure_ascii=False, separators=(',', ':')) + '\n')
