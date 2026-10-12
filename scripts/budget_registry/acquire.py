"""Inventory official Budget/Treasury links and check document rights before extraction.

Run serially; cache receipts, robots and rights pages. No KB, D1 or live writes.
Dependencies for the acquisition command: requests, beautifulsoup4, PyMuPDF.
"""
from __future__ import annotations
import argparse
from collections import Counter
from datetime import datetime, timezone
import hashlib
import json
import os
from pathlib import Path
import re
import signal
import sys
from urllib.parse import urljoin, urlsplit

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT))
from parli.ingest.honest_http import HonestHTTP, Refused, Unavailable
from parli.ingest.http import SourceRefused, USER_AGENT
from scripts.budget_registry.parse import document_licence, parse_aggregates, parse_docx_measures
PARSE_HASH=hashlib.sha256((ROOT/'scripts/budget_registry/parse.py').read_bytes()).hexdigest()[:12]


def sha(body): return hashlib.sha256(body).hexdigest()
def now(): return datetime.now(timezone.utc).isoformat()
def dump(path, value):
    path.parent.mkdir(parents=True, exist_ok=True)
    def receipt_policy(value):
        if isinstance(value,list):return [receipt_policy(v) for v in value]
        if isinstance(value,dict):
            result={k:receipt_policy(v) for k,v in value.items() if k!='user_agent'}
            if 'user_agent' in value:result.update(user_agent_policy='parli/ingest/user-agent.json',user_agent_sha256=sha(value['user_agent'].encode()))
            return result
        return value
    path.write_text(json.dumps(receipt_policy(value), ensure_ascii=False, indent=2) + '\n')


class ReceiptHTTP(HonestHTTP):
    def __init__(self, cache):
        super().__init__()
        self.cache = cache
        self.paused_hosts = set()
        cache.mkdir(parents=True, exist_ok=True)
        os.environ.setdefault('OPAX_SOURCE_STATUS_FILE',str(cache/'source-access.json'))

    def get(self,url,**kwargs):
        previous=signal.getsignal(signal.SIGALRM)
        timer=signal.getitimer(signal.ITIMER_REAL)
        def deadline(*_): raise Refused('Response deadline (30 seconds); host held, no further requests this run',url)
        signal.signal(signal.SIGALRM,deadline); signal.setitimer(signal.ITIMER_REAL,30)
        try:return super().get(url,**kwargs)
        except (Refused,Unavailable,SourceRefused) as exc:
            self.paused_hosts.add(urlsplit(url).netloc)
            path=self.cache/(sha(url.encode())+'.json')
            reason=getattr(exc,'reason',str(exc))
            if not path.exists():dump(path,{'url':url,'status':'held','reason':reason,'snapshot':now(),'user_agent':USER_AGENT})
            raise Refused(reason,url) from None
        finally:
            signal.setitimer(signal.ITIMER_REAL,*timer);signal.signal(signal.SIGALRM,previous)

    def _request(self, url, **kwargs):
        # Capture robots too, including on a cached document's first host access.
        if urlsplit(url).netloc in self.paused_hosts: raise Refused('Source held after an earlier refusal; no further requests', url)
        key = sha(url.encode())
        body_path, receipt_path = self.cache / key, self.cache / (key + '.json')
        if receipt_path.exists():
            receipt = json.loads(receipt_path.read_text())
            if receipt.get('status') == 200 and body_path.exists():
                return body_path.read_bytes()
            if receipt.get('status') == 404:
                return None
            raise Refused(receipt.get('reason', 'previous source refusal'), url)
        try:
            body = super()._request(url, **kwargs)
        except (Refused, Unavailable, SourceRefused) as exc:
            self.paused_hosts.add(urlsplit(url).netloc)
            dump(receipt_path, {'url': url, 'status': 'held', 'reason': str(exc), 'snapshot': now(), 'user_agent': USER_AGENT})
            raise Refused(str(exc), url) from None
        receipt = {'url': url, 'status': 200 if body is not None else 404, 'snapshot': now(),
                   'sha256': sha(body) if body is not None else None, 'user_agent': USER_AGENT}
        if body is not None: body_path.write_bytes(body)
        dump(receipt_path, receipt)
        return body

    def receipt(self, url):
        path = self.cache / (sha(url.encode()) + '.json')
        return json.loads(path.read_text()) if path.exists() else {'url': url, 'status': 'held', 'reason': 'not fetched'}


def soup(body):
    from bs4 import BeautifulSoup
    return BeautifulSoup(body or b'', 'html.parser')


def pdf_rights(body):
    import pymupdf
    with pymupdf.open(stream=body, filetype='pdf') as doc:
        for i in range(min(8, len(doc))):
            text = doc[i].get_text(sort=True)
            if re.search(r'Creative\s+Commons|copyright|permission', text, re.I):
                result = document_licence(text)
                if result['status'] != 'unverified': return {**result, 'page': i + 1, 'evidence': text}
        return {**document_licence(''), 'page': None, 'evidence': ''}


def catalogue(client):
    archive = 'https://archive.budget.gov.au/'
    body = client.get(archive)
    release_links = [(a.get_text(' ', strip=True), urljoin(archive, a['href']))
                     for a in soup(body).select('a[href]')
                     if re.match(r'Budget 20(?:1[5-9]|2[0-5])', a.get_text())]
    releases, documents, portfolios = [], [], []
    seen = set()
    for label, url in release_links + [('Budget 2026–27', 'https://budget.gov.au/')]:
        fiscal_year = re.search(r'20\d{2}[–-]\d{2}', label)[0].replace('–', '-')
        release = fiscal_year + ('-october' if 'October' in label else '-march' if 'March' in label else '')
        releases.append({'id': release, 'year': fiscal_year, 'label': label, 'url': url})
        pages = [url] if 'archive.' in url else [f'https://budget.gov.au/content/bp{n}/' for n in range(1, 5)] + ['https://budget.gov.au/content/pbs/']
        for page_url in pages:
            try: page_body = client.get(page_url)
            except Refused as exc:
                portfolios.append({'release': release, 'url': page_url, 'status': 'held', 'reason': str(exc)}); continue
            page = soup(page_body)
            # PBS section ends at the following top-level heading on archive pages.
            in_pbs = page_url.endswith('/pbs/')
            for node in page.find_all(['h2', 'h3', 'a']):
                if node.name in ('h2', 'h3'):
                    title = node.get_text(' ', strip=True)
                    if node.name == 'h2': in_pbs = 'Portfolio Budget Statements' in title
                    continue
                href = urljoin(page_url, node.get('href', ''))
                if not node.get('href') or href in seen: continue
                text = node.get_text(' ', strip=True)
                parent = node.find_parent('tr')
                row_title = parent.find(['td', 'th']).get_text(' ', strip=True) if parent else text
                path = urlsplit(href).path
                extension = path.rsplit('.', 1)[-1].lower()
                match = re.search(r'/bp([1-4])/', path, re.I)
                kind = 'bp' + match[1] if match else 'myefo' if '/myefo/' in path.lower() else 'fbo' if '/fbo/' in path.lower() else None
                if kind and extension in ('pdf', 'docx', 'xlsx', 'csv', 'zip', 'xls'):
                    if parent is None: continue
                    if kind in ('myefo', 'fbo') and any(d['url'] == href for d in documents): continue
                    seen.add(href)
                    title = f'Budget Paper {kind[-1]}' if kind.startswith('bp') else 'MYEFO' if kind == 'myefo' else 'Final Budget Outcome'
                    full = extension == 'pdf' and (bool(re.match(r'Budget Paper|Mid-Year Economic|Final Budget Outcome', row_title, re.I)) or (page_url.startswith('https://budget.gov.au/') and '2026' in path))
                    documents.append({'id': sha(href.encode())[:16], 'release': release + ('-fbo' if kind=='fbo' else ''), 'year': fiscal_year,
                                      'kind': kind, 'title': title + ': ' + row_title, 'url': href, 'format': extension.upper(),
                                      'index_url': page_url, 'index_receipt': client.receipt(page_url), 'consolidated': full})
                elif in_pbs and text and href.startswith(('http://', 'https://')) and not any(t in href for t in ['#', 'budget.gov.au/content/', 'budget.gov.au/20', 'facebook', 'twitter', 'mailto']):
                    portfolios.append({'release': release, 'year': fiscal_year, 'title': text, 'url': href,
                                       'format': 'HTML index', 'index_url': page_url, 'index_receipt': client.receipt(page_url),
                                       'licence': {'status': 'unverified', 'name': 'External publisher terms require document review'}})
            for heading in page.find_all('h2'):
                if heading.get_text(' ', strip=True)!='Portfolio Budget Statements': continue
                listing=heading.find_next('ul')
                if listing:
                    for item in listing.select('li'):
                        if item.find('a'): continue
                        title=' '.join(item.find_all(string=True, recursive=False)).strip()
                        if title: portfolios.append({'release':release,'year':fiscal_year,'title':title,'url':None,'format':'not linked','status':'unavailable','reason':'Archive lists the portfolio but removed its document link','index_url':page_url,'index_receipt':client.receipt(page_url),'licence':{'status':'unverified','name':'No document available for rights review'}})
            print('indexed', release, page_url, flush=True)
    # Treasury's PBS series: stop before the additional-estimates section.
    treasury_index = 'https://treasury.gov.au/treasury-portfolio-budget-papers'
    page = soup(client.get(treasury_index))
    section = ''
    for node in page.find_all(['h2', 'a']):
        if node.name == 'h2': section = node.get_text(' ', strip=True); continue
        text = node.get_text(' ', strip=True)
        if section != 'Portfolio Budget Statements' or not re.match(r'20(?:1[5-9]|2[0-6])[–-]\d{2}', text): continue
        year = re.search(r'20\d{2}[–-]\d{2}', text)[0].replace('–', '-')
        release = year + ('-october' if 'October' in text else '-march' if year == '2022-23' else '')
        url = urljoin(treasury_index, node.get('href', ''))
        try: body = client.get(url)
        except Refused as exc:
            portfolios.append({'release': release, 'year': year, 'title': 'Treasury PBS', 'url': url, 'status': 'held', 'reason': str(exc)}); continue
        for a in soup(body).select('a[href]'):
            href = urljoin(url, a['href']); ext = urlsplit(href).path.rsplit('.', 1)[-1].lower()
            if ext not in ('pdf', 'docx', 'doc', 'xlsx', 'xls') or href in seen: continue
            seen.add(href)
            tr = a.find_parent('tr')
            title = tr.find(['td', 'th']).get_text(' ', strip=True) if tr else a.get_text(' ', strip=True)
            documents.append({'id': sha(href.encode())[:16], 'release': release, 'year': year, 'kind': 'pbs',
                              'title': 'Treasury PBS: ' + title, 'url': href, 'format': ext.upper(),
                              'index_url': url, 'index_receipt': client.receipt(url), 'consolidated': False})
        print('indexed Treasury PBS', release, flush=True)
    discover_portfolio_documents(client, portfolios, documents, seen)
    normalize_document_years(documents)
    # One whole-paper PDF per release/kind; section names can repeat the paper title.
    full_seen = set()
    for d in documents:
        if d['consolidated']:
            group = (d['release'], d['kind'])
            if group in full_seen: d['consolidated'] = False
            full_seen.add(group)
    # Cover-image links can precede a labelled table link to the same whole PDF.
    for group in {(d['release'],d['kind']) for d in documents if d['kind'] in ('bp1','bp2','bp3','bp4','myefo','fbo')}:
        candidates=[d for d in documents if (d['release'],d['kind'])==group and d['format']=='PDF']
        if candidates and not any(d['consolidated'] for d in candidates): candidates[0]['consolidated']=True
    return releases, documents, portfolios




def normalize_document_years(documents):
    for d in documents:
        if urlsplit(d['url']).hostname!='archive.budget.gov.au':continue
        folder=re.search(r'/((20\d{2})-(\d{2})(?:-october)?)/',urlsplit(d['url']).path)
        if not folder or int(folder[3])!=(int(folder[2])+1)%100:continue
        year=folder[1][:7]
        if year!=d['year']:
            d['index_year']=d['year'];d['index_title']=d['title']
            d['source_note']='Publisher index links to an older document; year follows the authoritative document folder, not the misleading index row'
            d['year']=year
        suffix='-october' if folder[1].endswith('october') else '-march' if year=='2022-23' else ''
        d['release']=year+'-fbo' if d['kind']=='fbo' else year+suffix
        if d.get('index_year'):
            d['title']=(f'Budget Paper {d["kind"][-1]}' if d['kind'].startswith('bp') else 'Final Budget Outcome' if d['kind']=='fbo' else 'MYEFO')+': '+year


def discover_portfolio_documents(client, portfolios, documents, seen):
    for index in portfolios:
        url=index.get('url')
        if not url or 'treasury.gov.au/' in url: continue
        year=index['year']; target=year.replace('-', '')
        try: body=client.get(url)
        except Refused as exc:
            index['status']='held'; index['reason']=str(exc); index['receipt']=client.receipt(url); continue
        index['receipt']=client.receipt(url)
        if not body:
            index['status']='unavailable'; index['reason']='Publisher index returned 404'; continue
        page=soup(body)
        links=[(url,'Publisher-linked PBS')] if body.startswith(b'%PDF') else [(urljoin(url,a['href']),a.get_text(' ',strip=True),a) for a in page.select('a[href]')]
        found=0
        for candidate in links:
            href,title=candidate[:2]; ext=urlsplit(href).path.rsplit('.',1)[-1].lower()
            if ext not in ('pdf','docx','doc','xlsx','xls') or href in seen: continue
            surrounding=''
            if len(candidate)>2:
                a=candidate[2]; heading=a.find_previous(['h2','h3','h4']); surrounding=(heading.get_text(' ',strip=True) if heading else '')
                tr=a.find_parent('tr')
                if tr: surrounding+=' '+tr.get_text(' ',strip=True)
            context=href+' '+title+' '+surrounding
            normal=re.sub(r'[^0-9]','',context)
            relevant=target in normal or year[:4]+str(int(year[:4])+1) in normal
            if not relevant and target not in re.sub(r'[^0-9]','',url): continue
            if not re.search(r'pbs|portfolio|budget', context, re.I): continue
            seen.add(href); found+=1
            documents.append({'id':sha(href.encode())[:16],'release':index['release'],'year':year,'kind':'pbs-external','title':index['title']+': '+title,'url':href,'format':ext.upper(),'index_url':url,'index_receipt':index['receipt'],'consolidated':False})
        index['discovered_documents']=found
        index['status']='indexed' if found else 'discovery-needed'
        if not found:index['reason']='No dated PBS file discovered in the available first-level index'
        print('indexed external PBS',index['release'],url,found,flush=True)


def acquire(cache, out):
    client = ReceiptHTTP(cache)
    releases, documents, portfolios = catalogue(client)
    aggregates, measures, held = [], [], []
    # Consolidated papers supply the document-level grant for their indexed sections.
    grants = {}
    ordered = sorted(documents, key=lambda d: (not d['consolidated'], 'prelim' not in d['url'].lower(), d['format'] != 'PDF', d['release'], d['kind']))
    for d in ordered:
        group = (d['release'], d['kind'])
        needs = d['consolidated'] or (d['kind'] in ('pbs', 'pbs-external') and d['format'] in ('PDF', 'DOCX')) or (d['kind'] in ('bp1', 'bp2', 'myefo') and d['format'] in ('DOCX', 'CSV', 'XLSX'))
        if needs:
            try: body = client.get(d['url'])
            except Refused as exc: body = None
            d['receipt'] = client.receipt(d['url'])
            if body and d['format'] == 'PDF' and body.startswith(b'%PDF'):
                d['licence'] = pdf_rights(body)
                if d['kind']=='pbs' and d['licence']['status']=='unverified' and group in grants:
                    d['licence'] = {**grants[group], 'basis': 'Section of Treasury PBS with the same publisher index; terms in PBS preliminaries'}
                if d['consolidated'] or (d['kind']=='pbs' and any(t in d['url'].lower() for t in ('prelim','combined','tsy_pbs','/pbs-','/pbs.pdf','portfolio-budget-statements')) and d['licence']['status']=='open'): grants[group] = {**d['licence'], 'document_url': d['url'], 'document_sha256': sha(body)}
            elif body and d['format'] == 'DOCX':
                from scripts.budget_registry.parse import docx_text
                rights_text=docx_text(body)
                d['licence'] = document_licence(rights_text)
                if d['licence']['status']=='blocked':
                    notice=re.search(r'CC BY-NC|Attribution.NonCommercial|NoDerivatives|prior written permission|all rights reserved',rights_text,re.I)
                    if notice:d['licence']['evidence']=rights_text[max(0,notice.start()-400):notice.end()+400]
                    d['licence']['document_url']=d['url']; d['licence']['document_sha256']=sha(body)
                if d['licence']['status'] == 'unverified' and group in grants:
                    d['licence'] = {**grants.get(group, document_licence('')), 'basis': 'Indexed section of the licensed paper; no separate grant in section'}
            else:
                d['licence'] = {**grants.get(group, document_licence('')), 'basis': 'Indexed data supplement of paper'} if body else document_licence('')
        else:
            body = None
            d['receipt'] = {'url': d['url'], 'status': 'not fetched', 'reason': 'Inventory link only; no content ingest'}
            d['licence'] = {**grants.get(group, document_licence('')), 'basis': 'Indexed section of paper; content not acquired'}
        d['status'] = 'cleared' if d['licence']['status'] == 'open' else 'held'
        if needs and not body: d['status'] = 'held'; d['hold_reason'] = d['receipt'].get('reason', 'Document unavailable')
        if d['status'] == 'held': held.append({'id': d['id'], 'url': d['url'], 'reason': d.get('hold_reason', d['licence']['name']), 'receipt': d['receipt']})
        if body and d['status'] == 'cleared':
            if d['consolidated'] and d['kind'] in ('bp1', 'myefo', 'fbo'):
                parsed_path=client.cache/(sha(body)+'.fiscal-'+PARSE_HASH+'.json')
                if parsed_path.exists(): parsed=json.loads(parsed_path.read_text())
                else:
                    parsed=parse_aggregates(body,d); dump(parsed_path,parsed)
                aggregates.extend(parsed)
            if d['format']=='DOCX' and (d['kind']=='bp2' or (d['kind']=='myefo' and re.search(r'app[_-]?a|appendix[_-]?a', d['url'], re.I))):
                measures.extend(parse_docx_measures(body, d))
        print('rights', d['release'], d['kind'], d['format'], d['status'], d['licence']['name'], flush=True)
    receipts = [r for p in sorted(cache.glob('*.json')) if not p.name.endswith('.links.json') and isinstance(r:=json.loads(p.read_text()),dict) and 'url' in r]
    aggregates=[r for r in aggregates if int(r['fiscal_year'][:4])>=2015]
    staged = {'schema': 1, 'generated_at': now(), 'scope': 'Federal Budget Papers 1–4 and MYEFO, 2015–16 to 2026–27; Final Budget Outcomes for reported actuals; Treasury PBS documents and Budget-linked portfolio indexes',
              'releases': releases, 'documents': documents, 'portfolio_indexes': portfolios,
              'unreleased': [{'year': y, 'kind':'myefo','reason':'No standalone MYEFO linked in the publisher archive; October Budget retained separately' if y=='2022-23' else 'Not linked on the publisher at this snapshot'} for y in sorted({r['year'] for r in releases}) if not any(d['year']==y and d['kind']=='myefo' for d in documents)],
              'aggregates': aggregates, 'measures': measures, 'held': held,
              'counts': {'documents': len(documents), 'formats': dict(Counter(d['format'] for d in documents)),
                         'consolidated_papers': sum(d['consolidated'] for d in documents), 'portfolio_indexes': len(portfolios),
                         'licences': dict(Counter(d['licence']['name'] for d in documents)),
                         'held_documents': len(held), 'aggregate_rows': len(aggregates), 'measure_rows': len(measures)}}
    dump(out / 'inventory.json', {k: v for k, v in staged.items() if k not in ('aggregates', 'measures')})
    dump(out / 'aggregates.json', aggregates); dump(out / 'measures.json', measures); dump(out / 'receipts.json', receipts)
    from scripts.budget_registry.stage import projection
    dump(out / 'hub.json', projection(staged))
    print(json.dumps(staged['counts'], indent=2))


if __name__ == '__main__':
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument('--cache', type=Path, default=ROOT / '.cache/budget')
    ap.add_argument('--out', type=Path, default=ROOT / 'data/staged/budget')
    args = ap.parse_args()
    if not args.out.resolve().is_relative_to((ROOT/'data/staged').resolve()): ap.error('Acquisition output must stay under this worktree’s data/staged directory')
    acquire(args.cache, args.out)
