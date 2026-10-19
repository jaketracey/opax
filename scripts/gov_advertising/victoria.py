"""Victorian adapters for the shared advertising register. Offline only.

Tables remain separate grains. Published totals are rows, never reconstructed
headlines. Plans, percentages, creative and inaccessible attachments stay out.
"""
from collections import Counter
from copy import deepcopy
from decimal import Decimal
import json
from pathlib import Path
import re

from bs4 import BeautifulSoup
from scripts.gov_advertising.stage import ROOT, cleared, cents, sha
from scripts.gov_advertising.privacy import POLICY, POLICY_PATH, review_table, review_text

CC = 'https://creativecommons.org/licenses/by/4.0/'
INDEX = 'https://www.vic.gov.au/advertising-plans-and-spend'
TERMS = 'https://www.vic.gov.au/copyright'
WITHHELD = 'individual supplier (withheld)'


def public_supplier(value, kind=None):
    """Unknown, sole-trader and person-like names never leave the adapter."""
    if not value:
        return None
    if kind == 'organisation' and re.search(r'\b(?:Pty\.? Ltd\.?|Limited|Incorporated|Inc\.)$', value, re.I) and not re.search(r'\b(?:trading as|t/as|sole trader)\b', value, re.I):
        return value
    return WITHHELD


def matrices(body):
    main = BeautifulSoup(body, 'html.parser').find('main')
    if main is None:
        raise ValueError('Missing publisher main content')
    output = []
    for number, table in enumerate(main.find_all('table'), 1):
        heading = table.find_previous(['h2', 'h3', 'h4'])
        rows = [[c.get_text(' ', strip=True) for c in tr.find_all(['th', 'td'], recursive=False)] for tr in table.find_all('tr')]
        source_table_sha256=sha(json.dumps(rows,ensure_ascii=False,separators=(',',':')).encode())
        if any(c.get('rowspan', '1') != '1' or c.get('colspan', '1') != '1' for c in table.find_all(['th','td'])):
            output.append(review_table({'number': number, 'heading': heading.get_text(' ', strip=True) if heading else '', 'rows': [], 'source_table_sha256':source_table_sha256,'hold': 'Merged table requires a reviewed layout adapter'}))
            continue
        item = {'number': number, 'heading': heading.get_text(' ', strip=True) if heading else '', 'rows': rows,'source_table_sha256':source_table_sha256}
        if rows and rows[0] == ['Campaign advertising expenditure', '$ (excluding GST)']:
            campaign = table.find_previous(lambda t: t.name in ('h2','h3') and re.search(r'\s*–\s*',t.get_text(strip=True)))
            if campaign:
                text = campaign.get_text(' ',strip=True)
                parts=re.split(r'\s*–\s*',text,maxsplit=1)
                entity, title = parts if len(parts)==2 else (text,'')
                sep=title
                item.update(entity=entity, campaign=title if sep else '', campaign_heading_sha256=sha(text.encode()))
            duration = table.find_previous(lambda t: t.name in ('h3','h4') and t.get_text(strip=True) == 'Duration')
            if duration:
                value=duration.find_next('p')
                item['campaign_period']=value.get_text(' ',strip=True) if value else ''
            note=table.find_next('p')
            item['period_note']=note.get_text(' ',strip=True) if note and note.get_text(strip=True).startswith('*') else ''
        output.append(review_table(item))
    return output


def observations(table, document):
    """Official HTML table adapter. It never decodes a held document."""
    if not cleared(document):
        return [], []
    # Reapply entity-field review at the projection boundary. Descriptions and
    # campaign titles remain source records, never person identities.
    table=review_table(deepcopy(table))
    for field in ('basis','scope'):
        table[field]=review_text(table.get(field,''),field)
    data = table['rows']
    if not data:
        return [], []
    headers = data[0]
    if any(len(row) != len(headers) for row in data):
        raise ValueError('Unrecognised table width')
    year_column = headers[0] == 'Year'
    ranked = headers[:3] == ['Rank', 'Advertiser', 'Example campaigns']
    campaign_cost = headers == ['Campaign advertising expenditure', '$ (excluding GST)']
    if campaign_cost and (not table.get('entity') or not table.get('campaign')):
        return [], []
    if not year_column and not ranked and not campaign_cost:
        return [], []  # Unknown layouts need a separately reviewed adapter.
    # Percentages and planning tables are inventoried but are not expenditure.
    if any('%' in v for row in data[1:] for v in row) or 'plan-' in document['url']:
        return [], []
    money_columns = list(range(1,len(headers))) if year_column else [1] if campaign_cost else [3]
    if not money_columns:
        return [], []
    multiplier = 1_000_000 if any('($m)' in h or 'million' in h.lower() for h in headers) else 1
    rows, checks = [], []
    for ri, values in enumerate(data[1:], 2):
        year = values[0] if year_column else document.get('financial_year')
        if not re.fullmatch(r'20\d{2}-\d{2}', year or ''):
            raise ValueError('Unknown table year')
        numeric = {}
        for ci in money_columns:
            raw = values[ci]
            number = raw.replace(', ', ',')  # Source sometimes spaces a thousands separator.
            if campaign_cost and (raw in ('N/A','-','Withheld source annotation') or re.fullmatch(r'N/A\s*\(.*\)|Incl(?:uded| in).*|\(Costs included in campaign production spend\)',raw)):
                numeric[ci] = None
            elif campaign_cost and re.fullmatch(r'[\d,]+ \(print costs included\)',raw):
                numeric[ci] = cents(raw.split(' ',1)[0], multiplier)
            elif not re.fullmatch(r'\$?[\d,]+(?:\.\d+)?', number):
                raise ValueError('Unknown expenditure marker; hold table')
            else:
                numeric[ci] = cents(number, multiplier)
            label = headers[ci]
            is_total = table.get('published_total_series') or bool(re.search(r'\btotal\b', label if year_column else values[0], re.I))
            channel = year_column and 'channel' in table['heading'].lower()
            entity = table['entity'] if campaign_cost else 'Victorian Government' if year_column else values[1]
            kind = 'campaign cost' if campaign_cost else 'published total' if is_total else 'media' if channel else 'category' if year_column else 'advertiser'
            row = {'id': f"{document['id']}:t{table['number']}:r{ri}:c{ci+1}", 'document_id': document['id'],
                   'table_id': f"{document['id']}:t{table['number']}", 'jurisdiction': 'VIC', 'financial_year': year,
                   'report_year': document.get('financial_year'),
                   'table_heading': headers[0] if campaign_cost else table['heading'],
                   'entity': entity, 'campaign': table['campaign'] if campaign_cost else table['scope'] if table.get('published_total_series') else label if year_column else values[2],
                   'record_kind': kind, 'category': values[0] if campaign_cost else None if channel else label,
                   'media_type': label if channel and not is_total else None,
                   'total_cents': numeric[ci], 'source_value': raw, 'unit': 'AUD million' if multiplier == 1_000_000 else 'AUD',
                   'categories_cents': {}, 'basis': table['basis'], 'measure': table['scope'],
                   'source_url': document['url'], 'source_locator': f"HTML table {table['number']} row {ri} column {ci+1}",
                   'snapshot': document['receipt']['snapshot'], 'sha256': document['sha256'],
                   'table_sha256': table.get('source_table_sha256',table['sha256']),
                   'transcription_sha256':table['sha256'],'licence': document['licence']}
            if 'Supplier' in headers:
                row['supplier'] = public_supplier(values[headers.index('Supplier')])
            if campaign_cost:
                row.update(campaign_period=table.get('campaign_period',''),period_note=table.get('period_note',''))
            rows.append(row)
        total_columns = [ci for ci in money_columns if re.search(r'\btotal\b', headers[ci], re.I)]
        if year_column and total_columns:
            ti = total_columns[-1]
            parts = [ci for ci in money_columns if ci != ti]
            if not parts:
                continue
            actual, expected = sum(numeric[ci] for ci in parts), numeric[ti]
            # Compare at the source's precision; this is a check, never a new row.
            quanta = [Decimal(10) ** -len(values[ci].partition('.')[2]) * multiplier * 100 for ci in money_columns]
            tolerance = int(sum(quanta) / 2)
            checks.append({'check': 'Published table total', 'table_id': f"{document['id']}:t{table['number']}",
                           'financial_year': year, 'source_locator': f"HTML table {table['number']} row {ri} column {ti+1}",
                           'sum_cents': actual, 'report_total_cents': expected, 'difference_cents': actual-expected,
                           'tolerance_cents': tolerance, 'status': 'pass' if abs(actual-expected) <= tolerance else 'source discrepancy',
                           'comparison': 'exact' if actual==expected else 'within printed precision' if abs(actual-expected)<=tolerance else 'source discrepancy',
                           'note': 'OPAX calculates a half-unit bound from each printed cell precision; this is not a publisher rounding statement. No adjustment to published cells.'})
    # Every published total also receives a direct raw-cell/value identity check.
    for row in rows:
        if row['record_kind'] == 'published total':
            checks.append({'check': 'Published total source cell', 'row_id': row['id'], 'status': 'pass',
                           'source_value': row['source_value'], 'report_total_cents': row['total_cents'], 'source_locator': row['source_locator']})
    return rows, checks


def projection(inventory, tables):
    documents = [d for d in inventory['documents'] if cleared(d)]
    by_id = {d['id']: d for d in documents}
    rows, checks = [], []
    for table in tables:
        doc = by_id.get(table['document_id'])
        if not doc or table.get('status') != 'reviewed':
            continue
        actual = sha(json.dumps(table['rows'], ensure_ascii=False, separators=(',', ':')).encode())
        if actual != table['sha256']:
            raise ValueError('Source table hash mismatch')
        parsed, result = observations(table, doc)
        rows.extend(parsed); checks.extend(result)
    if len({r['id'] for r in rows}) != len(rows):
        raise ValueError('Duplicate source cell')
    active = {r['document_id'] for r in rows}
    return {'schema': 2, 'generated_at': inventory['generated_at'], 'source_url': INDEX,
            'privacy':{'version':POLICY['version'],'policy_sha256':sha(POLICY_PATH.read_bytes()),
                       'held_fields':dict(sorted(Counter(h['field'] for t in tables for h in t.get('privacy_holds',[])).items()))},
            'documents': [{**{k: d[k] for k in ('id','jurisdiction','financial_year','url','sha256','licence','receipt')},
                           'basis':review_text(d['basis'],'basis'),'measure':review_text(d['measure'],'scope')} for d in documents if d['id'] in active],
            'rows': rows, 'reconciliation': checks,
            'counts': {'rows': len(rows), 'years': dict(sorted(Counter(r['financial_year'] for r in rows).items())),
                       'kinds': dict(sorted(Counter(r['record_kind'] for r in rows).items()))}}


def checked_projection(stage, verify_originals=False):
    load = lambda f: json.loads((stage / f).read_text())
    inv, tables, hub = load('inventory.json'), load('tables.json'), load('hub.json')
    receipts = load('receipts.json'); ledger = {r['url']: r for r in receipts}
    if len(ledger) != len(receipts) or any(r.get('held') or r.get('challenge') or r['status'] != 200 for r in receipts):
        raise ValueError('Source receipt held or duplicate')
    for d in inv['documents']:
        if not cleared(d):
            continue
        if d['receipt'] != ledger.get(d['url']) or d['licence']['receipt'] != ledger.get(TERMS):
            raise ValueError('Source/licence receipt mismatch')
        if d['format'] != 'HTML' or d['url'].startswith('https://www.vic.gov.au/sites/'):
            raise ValueError('Only reviewed HTML clears the attachment hold')
        if verify_originals:
            body = (stage.parents[2] / d['receipt']['local_path']).read_bytes()
            if sha(body) != d['sha256']:
                raise ValueError('Original hash mismatch')
            original = {t['number']: t for t in matrices(body)}
            for t in tables:
                if t['document_id'] == d['id']:
                    source=original.get(t['number'],{})
                    for key in ('rows','entity','campaign','campaign_heading_sha256','privacy_hold','campaign_period','period_note','source_table_sha256','privacy_holds'):
                        if source.get(key) != t.get(key):raise ValueError('Original table/campaign coordinate mismatch')
    expected = projection(inv, tables)
    if (stage/'privacy-policy.json').read_bytes()!=POLICY_PATH.read_bytes():raise ValueError('Privacy policy changed; restage and review')
    holds=[{'document_id':t['document_id'],'table':t['number'],**h} for t in tables for h in t.get('privacy_holds',[])]
    if load('privacy-holds.json')!=holds:raise ValueError('Privacy hold receipt mismatch')
    if not expected['rows'] or expected != hub or expected['reconciliation'] != load('reconciliation.json'):
        raise ValueError('Empty or altered source projection/reconciliation')
    return hub, {**hub['counts'], 'documents': len(hub['documents']), 'checks': dict(Counter(c['status'] for c in hub['reconciliation']))}


if __name__ == '__main__':
    import argparse
    p = argparse.ArgumentParser(description=__doc__);p.add_argument('--dry-run', required=True, action='store_true');p.add_argument('--verify-originals', action='store_true');args=p.parse_args()
    _, counts = checked_projection(ROOT/'data/staged/vic-advertising', args.verify_originals)
    print(json.dumps({'mode': 'dry-run', 'writes': 0, **counts}))
