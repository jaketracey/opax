"""Local, text-layer-only QAO PDF staging. No DB, KB, OCR or model clients.

Receipts contain source text and hashes; temporary PDFs live only in staging/.
A complete catalogue is required even when an individual report body is held.
"""
from __future__ import annotations
import argparse
import copy
from datetime import datetime, timezone
import hashlib
import json
from pathlib import Path
import re
import shutil
import sys
import time
import requests
try:
    from bs4 import BeautifulSoup
except ImportError:  # validators import this module without parsing HTML; parsing needs bs4
    BeautifulSoup = None

from parli.ingest.qao_reports import (ROOT, INDEX, ID, LICENCE, MAX_REQUESTS, Client, Held, atomic_json,
                                      local_path, parse_index, public_body, source_url, text)
SCHEMA = 1


def remaining_request_limit(snapshot, html_run):
    used = html_run.get('requests')
    if (type(used) is not int or not 0 <= used <= MAX_REQUESTS
            or html_run.get('staged') != snapshot['count'] or html_run.get('listed') != snapshot['listed']):
        raise Held('HTML request receipt does not reconcile with the body input')
    return MAX_REQUESTS - used


def strict_guard(rows, listed, previous=()):
    ids = {r['id'] for r in rows}
    if not rows or len(ids) != len(rows) or len(rows) != listed or any(not ID.fullmatch(i) for i in ids):
        raise Held('Empty, duplicate or incomplete body catalogue')
    if not {r['id'] for r in previous}.issubset(ids):
        raise Held('Body catalogue would lose an accepted report')


def seed_catalogue(directory):
    directory = local_path(directory)
    m = json.loads((directory / 'manifest.json').read_text())
    rows = [r for c in m['chunks'] for r in json.loads((directory / Path(c['path']).name).read_text())['records']]
    strict_guard(rows, m['listed'])
    return {'schema': 1, 'complete': True, 'count': len(rows), 'listed': m['listed'],
            'generated_at': m['generated_at'], 'policy': {'copyright_notice': m['attribution']['copyright_notice']}, 'reports': rows}


def verify_catalogue(snapshot, client):
    url, found, visited = INDEX, {}, set()
    while url:
        if url in visited: raise Held('Index paging loop')
        visited.add(url)
        rows, url, _ = parse_index(client.get(url), url)
        for row in rows:
            if row['id'] in found: raise Held('Duplicate listed report')
            found[row['id']] = row
    strict_guard(list(found.values()), snapshot['listed'], snapshot['reports'])
    keys = ('id', 'title', 'number', 'year', 'tabled_date', 'canonical_url')
    if any(any(row[k] != found[row['id']][k] for k in keys) for row in snapshot['reports']):
        raise Held('Index changed; refresh phase 1 before body acquisition')
    return len(visited)


def pdf_pages(data):
    import pymupdf  # Optional acquisition dependency; never needed by Node gates.
    with pymupdf.open(stream=data, filetype='pdf') as doc:
        if doc.is_encrypted: raise Held('Encrypted source PDF')
        pages = []
        for i, p in enumerate(doc):
            blocks = [{'text': b[4], 'bbox': list(b[:4])} for b in p.get_text('blocks', sort=True) if b[6] == 0]
            spans = [s for b in p.get_text('dict', flags=pymupdf.TEXTFLAGS_DICT & ~pymupdf.TEXT_PRESERVE_IMAGES)['blocks']
                     if 'lines' in b for line in b['lines'] for s in line['spans']]
            redaction = any(a.type[0] == 12 for a in (p.annots() or []))
            for drawing in p.get_drawings():
                fill = drawing.get('fill')
                if fill and max(fill) < .12 and drawing.get('fill_opacity', 1) > .95:
                    rect = drawing['rect']
                    if any(s['color'] < 0x202020 and rect.contains(pymupdf.Rect(s['bbox'])) for s in spans): redaction = True
            image_body = any(pymupdf.Rect(info['bbox']).get_area() > p.rect.get_area() * .35 for info in p.get_image_info())
            body_chars = sum(len(re.sub(r'[^A-Za-z0-9]', '', b['text'])) for b in blocks if b['bbox'][1] > 100 and b['bbox'][3] < p.rect.height - 75)
            pages.append({'page': i + 1, 'text': '' if redaction else p.get_text(sort=True),
                          'blocks': [] if redaction else blocks, 'redaction_hold': redaction,
                          'no_text_layer': image_body and body_chars < 25,
                          'height': p.rect.height, 'width': p.rect.width})
        return pages


def full_report_pdf(html):
    main = BeautifulSoup(html, 'html.parser').find('main')
    if not main: raise Held('Report page structure missing')
    anchor = next((a for a in main.select('a[href]') if re.fullmatch(r'(?:download (?:full )?)?report pdf', text(a), re.I)), None)
    if anchor is None: raise Held('Full report PDF link is not explicit')
    return source_url(anchor['href'])


def text_hash(pages):
    return hashlib.sha256(json.dumps(pages, ensure_ascii=False, sort_keys=True, separators=(',', ':')).encode()).hexdigest()


def download(snapshot, checkpoint, client):
    started = time.monotonic()
    checkpoint = local_path(checkpoint)
    checkpoint.mkdir(parents=True, exist_ok=True)
    # The HTML and body steps run in separate processes in the weekly group.
    # Leave a full request interval before this process's first robots fetch.
    client.sleep(client.spacing)
    policy = client.policies()
    pages = verify_catalogue(snapshot, client)
    pdf_dir = local_path(ROOT / 'staging/pdfs'); pdf_dir.mkdir(parents=True, exist_ok=True)
    for i, row in enumerate(snapshot['reports'], 1):
        receipt = checkpoint / (row['id'] + '.json')
        if receipt.exists():
            saved = json.loads(receipt.read_text())
            if saved['pdf_url'] == row.get('pdf_url') and saved.get('schema') == SCHEMA:
                if saved.get('text_sha256') and saved['text_sha256'] != text_hash(saved['pages']): raise Held('Saved PDF text hash mismatch')
                if saved.get('download_hold') == 'no_pdf': continue
                if saved['page_count'] > 2 and not re.search(r'Report on a page', saved['pages'][0]['text'], re.I): continue
                full = full_report_pdf(client.get(row['canonical_url']))
                if full == row.get('pdf_url'): raise Held('Full report PDF remains a short product')
                row['pdf_url'] = full
        if not row.get('pdf_url'):
            atomic_json(receipt, {'schema': SCHEMA, 'id': row['id'], 'pdf_url': None, 'sha256': None,
                                 'page_count': 0, 'pages': [], 'download_hold': 'no_pdf'})
            continue
        data = client.get(row['pdf_url'], binary=True)
        digest = hashlib.sha256(data).hexdigest()
        pdf_path = pdf_dir / (row['id'] + '.pdf'); pdf_path.write_bytes(data)
        extracted = pdf_pages(data)
        if len(extracted) <= 2 or re.search(r'Report on a page', extracted[0]['text'], re.I):
            full = full_report_pdf(client.get(row['canonical_url']))
            if full == row['pdf_url']: raise Held('Full report PDF remains a short product')
            row['pdf_url'] = full
            data = client.get(full, binary=True)
            digest = hashlib.sha256(data).hexdigest(); pdf_path.write_bytes(data)
            extracted = pdf_pages(data)
        atomic_json(receipt, {'schema': SCHEMA, 'id': row['id'], 'pdf_url': row['pdf_url'],
                             'sha256': digest, 'page_count': len(extracted), 'pages': extracted, 'text_sha256': text_hash(extracted)})
        if i % 10 == 0: print(json.dumps({'pdfs_staged': i, 'requests': client.requests}), flush=True)
    summary = {'reports': len(snapshot['reports']), 'requests': client.requests,
               'prior_html_requests': getattr(client, 'prior_html_requests', 0),
               'total_requests': client.requests + getattr(client, 'prior_html_requests', 0),
               'seconds': round(time.monotonic() - started, 2), 'listing_pages': pages, 'policy': policy}
    atomic_json(checkpoint / 'download-run.json', summary)
    return summary



def rights_review(row, document):
    if document.get('privacy_withheld'):
        review = copy.deepcopy(document['rights_review'])
        if review['sha256'] != document['sha256'] or review['page_count'] != document['page_count']:
            raise Held('Withheld text rights receipt mismatch')
        review.update(status='held', reasons=sorted(set(review['reasons'] + ['individual_donor_text_hold'])))
        if review['document_licence'].startswith('Uncleared document notice'):
            review['reasons'] = sorted(set(review['reasons'] + ['document_grant_not_verified']))
        review.setdefault('copyright_notice', next((line.strip() for n in review['notices'] for line in n.get('text','').splitlines()
                          if '©' in line and re.search(r'State of Queensland|Queensland Audit Office', line) and len(line.split()) <= 25), None))
        return review
    pages = document['pages']
    reasons, notices = [], []
    if row['licence']['body_skipped']: reasons.append('phase1_rights_hold')
    if document.get('download_hold'): reasons.append(document['download_hold'])
    no_text = [p['page'] for p in pages if p.get('no_text_layer') or len(re.sub(r'[^A-Za-z0-9]', '', p['text'])) < 25]
    if no_text: reasons.append('no_text_layer')
    if any(p.get('redaction_hold') for p in pages): reasons.append('published_redaction_hold')
    cue = re.compile(r'copyright|©|creative commons|otherwise noted|all rights reserved|licen[sc]e|photograph|image credit|photo credit|cover image|reproduced|reproduction|permission|reuse terms|courtesy|supplied by|provided by|\b(?:source|credit):|\bphoto\s*:', re.I)
    for page in pages:
        for block in page['blocks']:
            value = block['text'].strip()
            if cue.search(value): notices.append({'page': page['page'], 'text': value})
    # Exact notice decisions are applied below after complete text review.
    exceptions = []
    for notice in notices:
        value = re.sub(r'\s+', ' ', notice['text'])
        if re.search(r'all rights reserved|(?:reproduced|used) with permission|courtesy|image credit|photo credit|stock image|photograph.*(?:supplied|provided|credit)|Auswildlife|reproduction.{0,100}prohibited|prior written permission', value, re.I):
            exceptions.append(notice)
        elif re.search(r'©|copyright', value, re.I) and not re.search(r'State of Queensland|Queensland Audit Office|copyright@qao|copyright notice|copyright licence|Copyright Act', value, re.I):
            exceptions.append(notice)
        elif re.search(r'Creative Commons|CC BY', value, re.I) and not re.search(r'Attribution 4\.0|CC BY 4\.0|creativecommons.org/licenses/by/4.0', value, re.I):
            exceptions.append(notice)
        elif re.search(r'otherwise noted|with the exception|except for|\b(?:source|credit):|\bphoto\s*:', value, re.I) and not re.search(r'Source:\s*(?:QAO|Queensland Audit Office)\b', value, re.I):
            exceptions.append(notice)
        elif re.search(r'licen[sc]e|permission|reproduced|provided by|supplied by', value, re.I) and not re.search(r'CC BY 4\.0|Attribution 4\.0|licenses/by/4\.0|copyright@qao|licence terms|licence contact', value, re.I):
            exceptions.append(notice)
    if exceptions: reasons.append('uncleared_rights_exception')
    if any(re.search(r'CC BY-NC-ND|Attribution[- ]Non[- ]Commercial|licenses/by-nc-nd|reproduction.{0,100}prohibited|prior written permission', re.sub(r'\s+', ' ', n['text']), re.I) for n in notices):
        reasons.append('pdf_restrictive_licence')
    if pages and (document['page_count'] <= 2 or re.search(r'Report on a page', pages[0]['text'], re.I)):
        reasons.append('not_full_report_pdf')
    if not any(re.search(r'©|copyright', n['text'], re.I) for n in notices):
        reasons.append('imprint_not_verified')
    notice_text = ' '.join(n['text'] for n in notices)
    imprint_owner_pages = {n['page'] for n in notices if n['page'] <= 4
                           and re.search(r'©|copyright', n['text'], re.I)
                           and re.search(r'State of Queensland|Queensland Audit Office', n['text'], re.I)}
    imprint_grant = ' '.join(n['text'] for n in notices if n['page'] in imprint_owner_pages)
    owner_notice = next((line.strip() for notice in notices for line in notice['text'].splitlines()
                         if '©' in line and re.search(r'State of Queensland|Queensland Audit Office', line) and len(line.split()) <= 25), None)
    document_licence = ('CC BY-NC-ND 4.0' if re.search(r'CC BY-NC-ND|Attribution[- ]Non[- ]Commercial', notice_text, re.I)
                        else 'Prior written permission required' if re.search(r'prior written permission|prohibited', notice_text, re.I)
                        else 'CC BY 4.0' if re.search(r'Attribution 4\.0|CC BY 4\.0|licenses/by/4.0', imprint_grant, re.I)
                        else 'Uncleared document notice; no document grant accepted')
    if document_licence.startswith('Uncleared document notice'): reasons.append('document_grant_not_verified')
    return {'checked': True, 'status': 'held' if reasons else 'ready', 'reasons': sorted(set(reasons)),
            'sha256': document['sha256'], 'page_count': document['page_count'], 'pdf_url': document['pdf_url'],
            'licence_url': ('https://creativecommons.org/licenses/by-nc-nd/4.0/' if document_licence == 'CC BY-NC-ND 4.0'
                            else LICENCE if document_licence == 'CC BY 4.0' else None),
            'document_licence': document_licence, 'imprint_pages': [p['page'] for p in pages[:4]],
            'copyright_notice': owner_notice,
            'notices': notices, 'exceptions': exceptions, 'no_text_pages': no_text}


def public_rights_review(review):
    """Public evidence records decisions, page references and notice hashes.

    Full notice text remains local for rights review; held PDF text stays out
    of public assets, including its imprint and third-party paragraphs.
    """
    result = {k: v for k, v in review.items() if k not in ('notices', 'exceptions')}
    for key in ('notices', 'exceptions'):
        result[key] = [{'page': n['page'], 'sha256': hashlib.sha256(n['text'].encode()).hexdigest()
                        if 'text' in n else n.get('text_sha256', n.get('sha256')), **({'privacy_withheld': True} if n.get('privacy_withheld') else {})}
                       for n in review[key]]
    return result


def body_units(row, pages, response_start=None):
    units, heading = [], row['title']
    for page in pages:
        if response_start is not None and page['page'] >= response_start: break
        if page['page'] <= 2: continue  # cover and imprint are evidence, not KB paragraphs
        if any(re.match(r'(?:Appendix\b|Appendices\b|[A-Z]\.\s+)', re.sub(r'\s+', ' ', b['text']).strip(), re.I)
               for b in page['blocks'] if b['bbox'][1] < 120): break
        for block in page['blocks']:
            value = block['text'].strip()
            x0, y0, x1, y1 = block['bbox']
            if y0 < 40 or y1 > page['height'] - 35 or not value: continue
            if len(value) < 100 and re.match(r'^(?:\d+(?:\.\d+)*\.?\s|Report summary|Audit conclusions|Summary|Recommendations)\b', value):
                heading = value
                continue
            # Preserve source line breaks, bullets, and published redactions.
            for paragraph in re.split(r'\n\s*\n', value):
                if len(re.sub(r'\s+', '', paragraph)) < 40: continue
                units.append({'report_id': row['id'], 'page': page['page'], 'section_heading': heading,
                              'text': paragraph, 'qao_url': row['canonical_url'], 'licence': LICENCE})
    return units


def kb_document(row, unit, ordinal):
    if row['pdf']['status'] != 'ready' or row['licence']['body_skipped']:
        raise Held('Held body cannot become a KB resource')
    if unit['report_id'] != row['id'] or not 1 <= unit['page'] <= row['pdf']['page_count']:
        raise Held('KB unit lacks a valid source page')
    metadata = {k: unit[k] for k in ('report_id', 'page', 'section_heading', 'qao_url', 'licence')}
    metadata.update(document_sha256=row['pdf']['sha256'],
                    source_text_sha256=hashlib.sha256(unit['text'].encode()).hexdigest(),
                    pdf_url=row['pdf_url'], page_count=row['pdf']['page_count'])
    slug = f"{row['id']}-p{unit['page']}-{ordinal}"
    # Same resource envelope as bill_texts.build_resource; source text only.
    return {'slug': slug, 'title': f"{row['title']} · PDF p.{unit['page']}",
            'texts': {'body': {'body': unit['text'], 'format': 'PLAIN'}},
            'origin': {'source_id': 'opax-qao-audit', 'url': row['canonical_url'], 'created': row['tabled_date'] + 'T00:00:00Z'},
            'usermetadata': {'classifications': [{'labelset': 'kind', 'label': 'audit_report'},
                                                {'labelset': 'source', 'label': 'queensland_audit_office'},
                                                {'labelset': 'state', 'label': 'qld'}]},
            'extra': {'metadata': metadata}}


def explicit_recommendations(text):
    return sorted({int(number) for m in re.finditer(r'\brecommendations?\s+(\d+(?:\s*(?:,|and|&)\s*\d+)*)\b', text, re.I)
                   for number in re.findall(r'\d+', m.group(1))})


def response_body_name(value):
    # A public designation must lead the name. A person's name followed by a
    # department or job title cannot become an attributed body field.
    return public_body(value) and bool(re.match(r'^(?:Department\b|Queensland\b|Legal Aid Queensland\b|TAFE Queensland\b|Office of\b|'
        r'University of\b|The University of\b|Public (?:Service|Trustee)\b|Non-State Schools\b|Energy Queensland\b|'
        r'Seqwater\b|Sunwater\b|CS Energy\b|Stanwell\b|Ergon\b|Energex\b)', value)
        or re.fullmatch(r'[A-Za-z –-]+(?:Regional Council|City Council|Shire Council|University|Hospital and Health Service)', value))


def extract_responses(row, pages):
    responses, start, active, holds = [], None, None, []
    for page in pages:
        headings = [re.sub(r'\s+', ' ', b['text']).strip() for b in page['blocks'] if b['bbox'][1] < 120]
        if start is None:
            if page['page'] > 3 and any(re.fullmatch(r'(?:[A-Z]\. )?(?:Entity responses|Responses from agencies|Comments)', h, re.I) for h in headings):
                start = page['page']
            else: continue
        if any(re.match(r'[A-Z]\. ', h) and not re.search(r'responses|comments', h, re.I) for h in headings): break
        body = None
        for block in page['blocks']:
            value = re.sub(r'\s+', ' ', block['text']).strip()
            m = re.fullmatch(r'Response from (?:the )?(.+)', value, re.I)
            if not m and len(block['text'].strip().splitlines()) > 1: continue
            candidate = m.group(1) if m else value
            # Drop only a source-published official role preceding the body.
            candidate = re.sub(r'^(?:Director-General|Chief Executive(?: Officer)?|Commissioner|Vice-Chancellor),?\s+(?:of )?(?:the )?', '', candidate)
            if (m or block['bbox'][1] < 180) and response_body_name(candidate):
                body = candidate
                break
        if body and (active is None or active['body'] != body or any(re.match(r'Response from ', h, re.I) for h in headings)):
            if active: responses.append(active)
            active = {'id': f"{row['id']}-response-{len(responses)+1}", 'body': body,
                      'text': page['text'].strip(), 'page_start': page['page'], 'page_end': page['page'],
                      'recommendation_numbers': []}
        elif active:
            active['text'] += '\n\n' + page['text'].strip()
            active['page_end'] = page['page']
        elif page['page'] != start:
            holds.append({'kind': 'unattributed_response_page', 'page': page['page']})
    if active: responses.append(active)
    for response in responses: response['recommendation_numbers'] = explicit_recommendations(response['text'])
    return responses, start, holds


def extract_recommendations(row, pages):
    records, active, addressee, source_intro, started, holds = [], None, None, '', False, []
    def finish():
        nonlocal active
        if active:
            active['text'] = active['text'].strip()
            if active['text']: records.append(active)
            active = None
    for page in pages:
        blocks = page['blocks']
        is_section = any(re.fullmatch(r'(?:\d+\.\s*)?Recommendations', re.sub(r'\s+', ' ', b['text']).strip(), re.I)
                         for b in blocks if b['bbox'][1] < 120)
        if not started:
            if page['page'] <= 3 or not is_section: continue
            started = True
        elif any(b['bbox'][1] < 120 and re.match(r'(?:\d+|[A-Z])\.\s+[^\n]+', b['text'].strip())
                 and not re.search(r'Recommendations', b['text'], re.I) for b in blocks):
            break
        for block in blocks:
            value = block['text'].strip()
            x0, y0, x1, y1 = block['bbox']
            if y0 < 120 or y1 > page['height'] - 45 or x0 > page['width'] * .70 or not value: continue
            if 'Entity responses' in value:
                finish()
                continue
            intro = re.search(r'We recommend (?:that|the)\s+(.+?):', value, re.I)
            if intro:
                finish()
                candidate = intro.group(1).strip()
                addressee = candidate if response_body_name(candidate) else None
                source_intro = value[:intro.end()] if addressee is None else ''
                value = value[intro.end():].lstrip()
            elif re.fullmatch(r'We recommend that:?|We recommend:?|Recommendations?', value, re.I):
                finish(); addressee = None; continue
            if not value: continue
            matches = list(re.finditer(r'(?m)^\s*(\d+)\.\s+', value))
            if matches:
                for i, match in enumerate(matches):
                    finish()
                    text = value[match.end():matches[i+1].start() if i+1 < len(matches) else len(value)]
                    if source_intro: text = source_intro + '\n' + text
                    active = {'number': int(match.group(1)), 'text': text, 'html': '', 'addressed_to': addressee,
                              'source_text': "QAO's text", 'page': page['page'], 'provenance': f"pdf p.{page['page']}"}
            elif active:
                active['text'] += '\n' + value
        if is_section and not records and active is None:
            holds.append({'kind': 'recommendations_unparsed', 'page': page['page']})
    finish()
    numbers = [r['number'] for r in records]
    if numbers and numbers != list(range(1, max(numbers) + 1)):
        return [], [{'kind': 'recommendation_numbering_unparsed', 'numbers': numbers}]
    return records, holds


def stage(snapshot, checkpoint, out, kb_out):
    checkpoint, out, kb_out = map(local_path, (checkpoint, out, kb_out))
    previous = json.loads(out.read_text()) if out.exists() else {}
    if snapshot.get('complete') is not True or snapshot.get('count') != len(snapshot['reports']):
        raise Held('Unreconciled body input snapshot')
    strict_guard(snapshot['reports'], snapshot['listed'], previous.get('reports', []))
    rows, mismatches, kb, compared = [], [], [], 0
    for source in snapshot['reports']:
        row = copy.deepcopy(source)
        doc = json.loads((checkpoint / (row['id'] + '.json')).read_text())
        if doc['id'] != row['id'] or doc['pdf_url'] != row['pdf_url']: raise Held('Document receipt identity mismatch')
        if doc['page_count'] != len(doc['pages']) or [p['page'] for p in doc['pages']] != list(range(1,doc['page_count']+1)):
            raise Held('Incomplete page sequence')
        if doc.get('text_sha256') and doc['text_sha256'] != text_hash(doc['pages']): raise Held('Saved PDF text hash mismatch')
        before = next((r for r in previous.get('reports',[]) if r['id'] == row['id']), None)
        if before and before['pdf']['sha256'] == doc['sha256'] and doc['page_count'] < before['pdf']['page_count']:
            raise Held('Accepted PDF page count would shrink')
        row['pdf'] = rights_review(row, doc)
        row['responses'], row['body_units'], row['extraction_holds'] = [], [], []
        for rec in row['recommendations']: rec['provenance'] = 'html'
        # The HTML page and PDF are separate grants. The page's two original
        # exceptions still hold its text; PDF terms hold PDF-derived units only.
        if row['licence']['body_skipped']:
            row['recommendations'], row['entities'] = [], []
        if row['pdf']['status'] == 'ready':
            row['responses'], response_start, response_holds = extract_responses(row, doc['pages'])
            pdf_recs, rec_holds = extract_recommendations(row, doc['pages'])
            row['extraction_holds'] = response_holds + rec_holds
            if not row['recommendations']: row['recommendations'] = pdf_recs
            else:
                html = {r['number']: re.sub(r'\s+', ' ', r['text']).strip() for r in row['recommendations']}
                pdf = {r['number']: re.sub(r'\s+', ' ', r['text']).strip() for r in pdf_recs}
                compared += bool(pdf)
                if pdf and html != pdf:
                    mismatches.append({'id': row['id'], 'html_numbers': list(html), 'pdf_numbers': list(pdf),
                                       'different_numbers': sorted(n for n in set(html) | set(pdf) if html.get(n) != pdf.get(n))})
            row['body_units'] = body_units(row, doc['pages'], response_start)
            kb.extend(kb_document(row, unit, i) for i, unit in enumerate(row['body_units'], 1))
        rows.append(row)
    result = {**snapshot, 'phase': 2, 'reports': rows, 'recommendation_mismatches': mismatches,
              'recommendation_compared_reports': compared}
    comparable = lambda s: {k: v for k, v in s.items() if k != 'generated_at'}
    if previous and comparable(previous) == comparable(result): result = previous
    else: result['generated_at'] = datetime.now(timezone.utc).isoformat()
    atomic_json(out, result)
    kb_out.parent.mkdir(parents=True, exist_ok=True)
    payload = ''.join(json.dumps(r, ensure_ascii=False, separators=(',', ':')) + '\n' for r in kb).encode()
    tmp = kb_out.with_suffix('.tmp'); tmp.write_bytes(payload); tmp.replace(kb_out)
    counts = {'reports': len(rows), 'listed': snapshot['listed'], 'bodies': sum(r['pdf']['status'] == 'ready' for r in rows),
              'html_recommendations': sum(r.get('provenance','html') == 'html' for row in rows for r in row['recommendations']),
              'held': [{'id': r['id'], 'reasons': r['pdf']['reasons']} for r in rows if r['pdf']['status'] == 'held'],
              'pdf_recommendations': sum(r.get('provenance','html') != 'html' for row in rows for r in row['recommendations']),
              'responses': sum(len(r['responses']) for r in rows), 'kb_units': len(kb), 'kb_bytes': len(payload),
              'kb_sha256': hashlib.sha256(payload).hexdigest(), 'mismatches': len(mismatches), 'compared_reports': compared}
    atomic_json(kb_out.with_name('counts.json'), counts)
    return result, counts


def review_checkpoint(snapshot, checkpoint):
    checkpoint = local_path(checkpoint)
    for row in snapshot['reports']:
        path = checkpoint / (row['id'] + '.json')
        document = json.loads(path.read_text())
        if document['id'] != row['id'] or document['pdf_url'] != row['pdf_url']: raise Held('Rights receipt identity mismatch')
        if document.get('text_sha256') and document['text_sha256'] != text_hash(document['pages']): raise Held('Saved PDF text hash mismatch')
        document['rights_review'] = rights_review(row, document)
        atomic_json(path, document)
    # The donor-withholding tool was retired with the publication policy in
    # c3a0c09b2. Document-level rights, source hashes and existing receipt holds
    # remain authoritative; stage() admits PDF text only for ready documents.


def main():
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument('--snapshot', default=str(ROOT / 'scripts/state/qao/snapshot.json'))
    p.add_argument('--checkpoint', default=str(ROOT / 'scripts/state/qao/pdf-text'))
    p.add_argument('--download-only', action='store_true')
    p.add_argument('--quiet-hours', action='store_true')
    p.add_argument('--with-html-run', action='store_true', help='Share the 800-request allowance with the immediately preceding HTML run')
    args = p.parse_args()
    client = Client(quiet=args.quiet_hours)
    try:
        path = local_path(args.snapshot)
        snapshot = json.loads(path.read_text()) if path.exists() else seed_catalogue(ROOT / 'portal/public/audit')
        if snapshot.get('complete') is not True or snapshot.get('count') != len(snapshot['reports']):
            raise Held('Unreconciled body input snapshot')
        strict_guard(snapshot['reports'], snapshot['listed'])
        if args.with_html_run:
            html_run = json.loads(path.with_name('last-run.json').read_text())
            client.request_limit = remaining_request_limit(snapshot, html_run)
            client.prior_html_requests = html_run['requests']
        if not path.exists(): atomic_json(path, snapshot)
        print(json.dumps(download(snapshot, args.checkpoint, client)), flush=True)
        atomic_json(path, snapshot)
        if not args.download_only:
            review_checkpoint(snapshot, args.checkpoint)
            _, counts = stage(snapshot, args.checkpoint, ROOT / 'scripts/state/qao/bodies.json', ROOT / 'staging/kb/qao-bodies.jsonl')
            retained = local_path(ROOT / 'scripts/state/qao/kb'); retained.mkdir(parents=True, exist_ok=True)
            for name in ('qao-bodies.jsonl', 'counts.json'):
                shutil.copyfile(ROOT / 'staging/kb' / name, retained / name)
            for path in local_path(ROOT / 'staging/pdfs').glob('qao-*.pdf'): path.unlink()
            print(json.dumps(counts), flush=True)
        return 0
    except (Held, OSError, ValueError, requests.RequestException) as error:
        print(f'QAO BODIES HELD: {error}; requests {client.requests}', file=sys.stderr)
        return 3

if __name__ == '__main__': sys.exit(main())
