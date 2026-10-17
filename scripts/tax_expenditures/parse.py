"""Treasury TEIS published cells. No item/category/year aggregation exists here."""
from __future__ import annotations

import math
import re
import xml.etree.ElementTree as ET
from zipfile import ZipFile

CC = 'https://creativecommons.org/licenses/by/4.0/'
TERMS = 'https://treasury.gov.au/copyright-disclaimer'
STATEMENT = 'https://treasury.gov.au/publication/p2025-721342'
SHEET = 'Revenue forgone estimates'
NS = {'w': 'http://schemas.openxmlformats.org/wordprocessingml/2006/main'}
CATEGORIES = dict(zip('ABCDEFGH', ['Personal income tax', 'Business income tax', 'Superannuation tax',
    'Fringe benefits tax', 'Capital gains tax', 'Indirect taxes excluding GST', 'Natural resource taxes', 'Goods and services tax']))
MARKERS = {'-': 'nil', '..': 'non-zero rounded to zero', '*': 'unquantifiable',
           'nfp': 'not for publication', 'N/A': 'not available', 'na': 'not available'}
TOTALS = {'C2+C3': {'title': 'Concessional taxation of superannuation contributions (C2 and C3 combined)', 'table': 'Table 2.2', 'pdf_page': 17},
          'C1+C4': {'title': 'Concessional taxation of superannuation earnings (C1 and C4 combined)', 'table': 'Table 2.4', 'pdf_page': 20}}


def value(raw):
    if type(raw) in (int, float) and math.isfinite(raw):
        return raw, 'quantified'
    if isinstance(raw, str) and raw in MARKERS:
        return None, MARKERS[raw]
    raise ValueError('Unknown published estimate code: ' + repr(raw))


def permitted(document):
    rights, receipt = document.get('licence', {}), document.get('receipt', {})
    return (document.get('status') == 'cleared' and not document.get('exceptions')
        and rights.get('status') == 'open' and rights.get('url') == CC and rights.get('document_reviewed') is True
        and receipt.get('status') == 200 and not receipt.get('challenge') and not receipt.get('held')
        and bool(re.fullmatch(r'[a-f0-9]{64}', receipt.get('sha256', ''))))


def key(row):
    return tuple(row[k] for k in ('statement', 'item_id', 'estimate_basis', 'measure_year'))


def text(element):
    return '' if element is None else ''.join(t.text or '' for t in element.findall('.//w:t', NS))


def tables(path):
    with ZipFile(path) as archive:
        xml = ET.fromstring(archive.read('word/document.xml'))
    nodes = xml.findall('.//w:tbl', NS)
    return xml, nodes, [[[''.join(text(p) for p in cell.findall('w:p', NS)) for cell in row.findall('w:tc', NS)]
                        for row in table.findall('w:tr', NS)] for table in nodes]


def document_metadata(path):
    xml, nodes, grids = tables(path)
    ordinals = {id(node): i+1 for i, node in enumerate(nodes)}
    items, current = {}, None
    for element in xml.find('w:body', NS):
        content = text(element)
        match = re.match(r'^([A-H]\d+)([^\d].+)', content)
        if element.tag.endswith('}p') and match:
            current = match[1]
            items[current] = {'item_id': current, 'title': match[2].strip(), 'category': CATEGORIES[current[0]],
                             'benchmark': 'Appendix A.2: ' + ('Income tax benchmark' if current[0] in 'ABCDE' else 'Indirect tax benchmarks'),
                             'record_kind': 'item', 'paragraphs': []}
        elif current and element.tag.endswith('}p') and content:
            items[current]['paragraphs'].append(content)
        elif current and element.tag.endswith('}tbl'):
            grid = grids[ordinals[id(element)]-1]
            if len(grid) >= 4 and grid[2][0].startswith('Tax expenditure type:'):
                items[current].update(document_table=ordinals[id(element)], tax_expenditure_type=grid[2][1],
                                      reliability=grid[3][1], values=grid[1], years=grid[0])
    for item in items.values():
        # The benchmark reference is authoritative; an explicitly labelled source
        # sentence provides item-specific context without ingesting narrative bodies.
        if len(item.get('values', [])) == 1 and re.fullmatch(r'Included in [A-H]\d+', item['values'][0]):
            item['included_in'] = item['values'][0].removeprefix('Included in ')
        paragraphs = item.pop('paragraphs')
        candidates = [p for p in paragraphs if 'benchmark' in p.lower()]
        if candidates:
            sentence = re.split(r'(?<=[.!?])\s+', candidates[0])[0]
            item['benchmark'] += ' — ' + sentence
    combined = {}
    for identity, spec in TOTALS.items():
        for i, (node, grid) in enumerate(zip(nodes, grids)):
            if spec['table']+' Combined estimate of aggregate revenue forgone' not in text(node):
                continue
            # A surrounding one-cell layout contains the caption and one native table.
            nested = node.find('.//w:tbl', NS)
            if nested is None:
                continue
            table_index = ordinals[id(nested)]
            source = grids[table_index-1]
            combined[identity] = {**spec, 'item_id': identity, 'category': CATEGORIES['C'], 'record_kind': 'published combined estimate',
                'benchmark': 'Income tax benchmark — ' + ('Contributions made from after-tax income.' if identity=='C2+C3' else 'Superannuation earnings taxed at marginal rates.'),
                'document_table': table_index, 'years': source[0], 'values': source[1], 'reliability': 'See constituent items',
                'tax_expenditure_type': 'Published combined estimate'}
            break
    return items, combined


def parse_sheet(grid, document, items):
    if not permitted(document):
        return []
    if grid[0][:2] != ['Code', 'Title'] or any(not re.fullmatch(r'20\d{2}-\d{2}', str(y)) for y in grid[0][2:]):
        raise ValueError('Unrecognised Treasury revenue-forgone layout')
    rows = []
    for row_index, cells in enumerate(grid[1:], 2):
        code, title, *estimates = cells
        if code not in items or len(estimates) != len(grid[0])-2:
            raise ValueError('Missing item metadata or incomplete source row')
        for column, (year, raw) in enumerate(zip(grid[0][2:], estimates), 3):
            estimate, status = value(raw)
            if items[code].get('included_in'):
                status = 'included in ' + items[code]['included_in'] + '; workbook nil'
            rows.append({**{k:v for k,v in items[code].items() if k not in ('years','values','title','cells','title_as_statement')},
                'title': title, 'statement': document['statement'], 'measure_year': year, 'value': estimate,
                'source_value': raw, 'estimate_status': status, 'estimate_basis': 'revenue forgone', 'unit': 'AUD million',
                'published': True, 'source_file': document['id'], 'sheet': SHEET, 'cell': chr(64+column)+str(row_index),
                'source_url': document['url'], 'snapshot': document['receipt']['snapshot'], 'sha256': document['receipt']['sha256'],
                'licence': 'CC BY 4.0', 'licence_url': CC})
    return rows


def parse_combined(document, combined):
    if not permitted(document):
        return []
    rows = []
    for item in combined.values():
        for column, (year, raw) in enumerate(zip(item['years'], item['values']), 1):
            estimate, status = value(int(re.sub(r'[\s,]', '', raw)))
            rows.append({**{k:v for k,v in item.items() if k not in ('years','values','cells')}, 'statement':document['statement'],
                'measure_year':year, 'value':estimate, 'source_value':raw, 'estimate_status':status,
                'estimate_basis':'revenue forgone', 'unit':'AUD million', 'published':True, 'source_file':document['id'],
                'sheet':item['table'], 'cell':f'R2C{column}', 'source_url':document['url'],
                'snapshot':document['receipt']['snapshot'], 'sha256':document['receipt']['sha256'], 'licence':'CC BY 4.0', 'licence_url':CC})
    return rows
