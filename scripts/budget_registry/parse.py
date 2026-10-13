"""Conservative fiscal and measure parsers: preserve vintages, units, source markers and rights."""
from __future__ import annotations
import hashlib
from io import BytesIO
import re
import zipfile
from xml.etree import ElementTree as ET

CC4 = 'https://creativecommons.org/licenses/by/4.0/'
CC3 = 'https://creativecommons.org/licenses/by/3.0/au/'
EXCEPTIONS = ['Commonwealth Coat of Arms', 'third-party content', 'where otherwise stated']
METRICS = {'receipts': 'Receipts', 'payments': 'Payments', 'underlying_cash_balance': 'Underlying cash balance', 'net_debt': 'Net debt'}
W = '{http://schemas.openxmlformats.org/wordprocessingml/2006/main}'
YEAR = r'20\d{2}[-–‑]\d{2}'
NUMBER = r'-?\d[\d,]*(?:\.\d+)?'


def document_licence(text):
    text = re.sub(r'\s+', ' ', text)
    exceptions = ['Commonwealth Coat of Arms', 'where otherwise stated']
    for pattern, label in [('third.party', 'third-party content'), ('Treasury logo', 'Treasury logo'), ('photographs', 'photographs'), ('images', 'images'), ('signatures', 'signatures')]:
        if re.search(pattern, text, re.I): exceptions.append(label)
    # A restrictive document notice always outranks a general site grant.
    if re.search(r'CC BY-NC|Attribution.NonCommercial|NoDerivatives|prior written permission|all rights reserved', text, re.I):
        return {'status': 'blocked', 'name': 'Restricted document terms', 'url': None, 'exceptions': exceptions}
    if re.search(r'Creative Commons.*?(?:Attribution|\bBY\b).*?4\.0', text, re.I) or 'creativecommons.org/licenses/by/4.0' in text:
        return {'status': 'open', 'name': 'CC BY 4.0', 'url': CC4, 'exceptions': exceptions}
    if re.search(r'Creative Commons.*?(?:Attribution|\bBY\b).*?3\.0.*?Australia', text, re.I) or 'creativecommons.org/licenses/by/3.0/au' in text:
        return {'status': 'open', 'name': 'CC BY 3.0 AU', 'url': CC3, 'exceptions': exceptions}
    return {'status': 'unverified', 'name': 'Document reuse grant unverified', 'url': None, 'exceptions': []}


def permitted(document):
    return document.get('status') == 'cleared' and document.get('licence', {}).get('status') == 'open' and document['licence'].get('url') in (CC3, CC4)


def provenance(document, table_id, page=None):
    return {'document_id': document['id'], 'source_url': document['url'], 'paper': document['title'],
            'release': document['release'], 'release_year': document['year'], 'table_id': table_id,
            'pdf_page': page, 'snapshot': document['receipt']['snapshot'], 'sha256': document['receipt']['sha256'],
            'publication_order': int(document['year'][:4]) + (1.75 if document['kind']=='fbo' else .95 if document['kind']=='myefo' else .85 if 'october' in document['release'] or document['year']=='2020-21' else .25 if 'march' in document['release'] else .5),
            'licence': document['licence']['name'], 'licence_url': document['licence']['url']}


def parse_page(text, document, page):
    """Parse labelled fiscal rows only; reject unmatched columns and unknown units.

    MYEFO often prints Budget/MYEFO pairs and separate estimates/projections
    blocks. Each block resets its year header. Totals are never a fiscal year.
    """
    if not permitted(document): return []
    text = text.replace('−', '-').replace('\u00a0', ' ')
    lines = text.splitlines()
    table, years, unit, rows = None, [], None, []
    header_has_total = False
    pending_metric = None
    dollar_gdp = False
    comparison_columns = False
    comparison_label = 'Budget comparison'
    medium_gdp = False
    has_projection = False
    projection_block = False
    medium_header = False
    source_basis = ''
    captions = []
    for line in lines:
        m = re.search(r'Table\s+(\d+(?:\.\d+)?[a-z]?):\s*(.*)', line, re.I)
        if m:
            caption = m[2].strip()
            relevant = bool(re.search(r'budget aggregates?|net debt|general government sector.*(?:debt|balance sheet)|budget outcome', caption, re.I))
            table = 'Table ' + m[1] + ': ' + caption if relevant else None
            years, unit = [], None
            pending_metric=None;dollar_gdp=False;comparison_columns=False;has_projection=False;projection_block=False;medium_header=False;source_basis=''
            if table: captions.append(table)
            continue
        if not table: continue
        if re.fullmatch(r'\s*(?:(?:Actuals?|Estimates?|Projections?|Forecasts?)\s*){1,3}',line,re.I):
            source_basis=line.strip()
            has_projection=bool(re.search(r'Projection',line,re.I))
            projection_block=has_projection and not re.search(r'Estimate',line,re.I)
        if ('Budget' in line or 'PEFO' in line) and 'MYEFO' in line:
            comparison_columns=True
            comparison_label='PEFO comparison' if 'PEFO' in line else 'Budget comparison'
        found = re.findall(YEAR, line)
        if found:
            if re.search(r'20\d{2}[-–]\d(?!\d)', line):
                years=[]
                continue
            # Footnotes/narrative years do not constitute a column header.
            remainder = re.sub(r'Total\s*\([^)]*\)|Total|Actual|Estimates?|Projections?|Budget|MYEFO|Outcome|\$[mb]', '', re.sub(YEAR, '', line), flags=re.I)
            if len(found) >= 2 and not re.search(r'[A-Za-z]{4}', remainder):
                years = [y.replace('–', '-').replace('‑', '-') for y in re.findall(YEAR, line.split('Total')[0])]
                header_has_total = 'Total' in line
                medium_header=header_has_total and bool(re.findall(YEAR,line.split('Total',1)[1]))
                unit = None
                continue
        if re.search(r'\$\s*b\b', line):
            unit = 'AUD billion'
            dollars=len(re.findall(r'\$\s*b\b',line))
            percent=bool(re.search(r'%(?:\s+of)?\s+GDP',line))
            medium_gdp=percent and dollars<len(years)
            if percent and dollars:years=years[:dollars-int(header_has_total)]
            dollar_gdp=percent and dollars==len(years)
            # Medium-term columns can be GDP percentages only, after a dollar Total.
            if re.search(r'%\s*of\s*GDP', line):
                dollars = len(re.findall(r'\$\s*b\b', line))
                years = years[:dollars - int(header_has_total)]
        elif re.search(r'\$\s*m\b', line): unit = 'AUD million'
        variant=re.match(r'\s*(MYEFO|Budget|PEFO)\s+(.*)$',line)
        if variant and pending_metric and years and dollar_gdp:
            values=re.findall(NUMBER,variant[2])
            if len(values)==2*len(years) or (medium_gdp and len(values)==2*len(years)+1):
                for i,year in enumerate(years):
                    status='projection' if projection_block else 'estimate'
                    rows.append({'fiscal_year':year,'metric':pending_metric,'value':float(values[2*i].replace(',','')),'unit':unit,'status':status,'source_basis':source_basis,'vintage':'MYEFO' if variant[1]=='MYEFO' else 'PEFO comparison' if variant[1]=='PEFO' else 'Budget comparison',**provenance(document,table,page)})
            continue
        if line.strip() and re.match(r'\s*[A-Za-z]',line) and not any(re.match(r'\s*'+re.escape(label)+r'(?:\s*\([^)]*\))*\s*$',line,re.I) for label in METRICS.values()): pending_metric=None
        for key, label in METRICS.items():
            m = re.match(r'\s*' + re.escape(label) + r'(?:\s*\([^)]*\))*\s*(.*)$', line, re.I)
            if not m or not years: continue
            tail = m[1]
            pending_metric = key if not re.search(NUMBER,tail) else None
            if re.search(r'\$\s*b\b', tail): unit = 'AUD billion'
            elif re.search(r'\$\s*m\b', tail): unit = 'AUD million'
            tail = re.sub(r'\([^)]*\)', '', tail)
            numbers = re.findall(NUMBER, tail)
            if unit is None or not numbers: continue
            # Trailing Total column is deliberately excluded.
            if len(numbers) in (len(years), len(years) + 1): pairs = False
            elif len(numbers) == 2 * len(years):
                if dollar_gdp: numbers=numbers[::2]; pairs=False
                elif comparison_columns:pairs=True
                else:continue
            else: continue
            for i, year in enumerate(years):
                year_start, release_start = int(year[:4]), int(document['year'][:4])
                actual_before = release_start if document['kind']=='myefo' or 'october' in document['release'] or document['year']=='2020-21' else release_start-1
                status = 'actual' if year_start < actual_before else 'projection' if projection_block or (has_projection and not medium_header and not medium_gdp and year_start>release_start) else 'estimate'
                values = [(comparison_label, numbers[2*i]), ('MYEFO', numbers[2*i+1])] if pairs else [(document['kind'].upper(), numbers[i])]
                for vintage, value in values:
                    rows.append({'fiscal_year': year, 'metric': key, 'value': float(value.replace(',', '')), 'unit': unit,
                                 'status': status, 'source_basis':source_basis,'vintage': vintage, **provenance(document, table, page)})
    return rows


def parse_aggregates(body, document):
    if not permitted(document): return []
    import pymupdf
    rows = []
    with pymupdf.open(stream=body, filetype='pdf') as pdf:
        for i, page in enumerate(pdf):
            plain=page.get_text()
            if document['kind']=='fbo':
                if not re.search(r'Table B\.(?:1|4):',plain):continue
            elif 'Table' not in plain or not any(label in plain for label in METRICS.values()):continue
            text = page.get_text(sort=True)
            rows.extend(parse_historical_actuals(text, document, i + 1) if document['kind']=='fbo' else parse_page(text, document, i + 1))
    # Prefer the detailed general-government aggregate table over overview repeats.
    unique = {}
    for row in rows:
        key = (row['fiscal_year'], row['metric'], row['vintage'])
        prior = unique.get(key)
        if prior is None or 'general government' in row['table_id'].lower(): unique[key] = row
    return list(unique.values())


def docx_text(body):
    with zipfile.ZipFile(BytesIO(body)) as z:
        root = ET.fromstring(z.read('word/document.xml'))
    return ' '.join(t.text or '' for t in root.iter(W + 't'))



def word_text(node):
    parts=[]
    for item in node.iter():
        if item.tag==W+'t':parts.append(item.text or '')
        elif item.tag==W+'noBreakHyphen':parts.append('‑')
        elif item.tag in (W+'br',W+'tab'):parts.append(' ')
    return ''.join(parts).strip()


def parse_docx_measures(body, document):
    if not permitted(document): return []
    with zipfile.ZipFile(BytesIO(body)) as z:
        root = ET.fromstring(z.read('word/document.xml'))
    result, heading, index = [], '', 0
    for node in root.find(W + 'body'):
        if node.tag == W + 'p':
            text = word_text(node)
            if text.strip(): heading = text.strip()
        elif node.tag == W + 'tbl':
            index += 1
            rows = [[' '.join(word_text(p) for p in cell.findall('.//'+W+'p')).strip() for cell in row.findall(W + 'tc')] for row in node.findall(W + 'tr')]
            header = ' '.join(' '.join(row) for row in rows[:5])
            if len(re.findall(YEAR, header)) < 2 or '$m' not in header: continue
            # Keep source cells rather than guessing merged columns or suppressions.
            for n, cells in enumerate(rows, 1):
                if not any(re.fullmatch(r'(?:' + NUMBER + r'|nfp|\.\.|-|\*)', c, re.I) for c in (cell.replace('‑','-') for cell in cells)): continue
                result.append({'row_number': n, 'cells': cells, 'headers': rows[:5], 'caption': heading,
                               'unit': 'AUD million', 'interpretation': 'Source table cells; nfp, .., * and nil markers preserved',
                               **provenance(document, f'DOCX table {index}')})
    return result


def parse_historical_actuals(text, document, page):
    """FBO historical nominal-dollar tables, never real/per-capita or changes."""
    if not permitted(document): return []
    m = re.search(r'Table B\.(1|4):\s*Australian Government general government sector (.*?)(?=\n\s*\n)', text, re.S)
    if not m or '$m' not in text or re.search(r'real per capita', m[0], re.I): return []
    number = m[1]
    caption = re.sub(r'\s+', ' ', m[0]).strip()
    result = []
    for line in text.splitlines():
        row = re.match(r'\s*(' + YEAR + r')\s+(.*)$', line)
        if not row or not 2015 <= int(row[1][:4]) <= 2026: continue
        values = re.findall(NUMBER, row[2].replace('−', '-'))
        if len(values) != (8 if number == '1' else 4): continue
        fields = [('receipts', 0), ('payments', 2), ('underlying_cash_balance', 6)] if number == '1' else [('net_debt', 0)]
        for metric, index in fields:
            result.append({'fiscal_year': row[1].replace('–', '-').replace('‑', '-'), 'metric': metric, 'value': float(values[index].replace(',', '')), 'unit': 'AUD million', 'status': 'actual', 'vintage': 'FBO', **provenance(document, caption, page)})
    return result
