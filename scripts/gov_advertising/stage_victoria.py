"""Build the Victorian part of the shared register from retained HTML, offline.

Originals stay private. Tables, inventory, receipts and hashes are review inputs;
this command cannot copy an asset into portal/public or acquire a source.
"""
from collections import Counter
import json
from pathlib import Path
import re
from urllib.parse import urlsplit

from bs4 import BeautifulSoup
from scripts.gov_advertising.stage import ROOT, sha
from scripts.gov_advertising.victoria import CC, INDEX, TERMS, matrices, observations, projection
from scripts.vic_gifts.acquire import robots_allowed, robots_rules
from scripts.gov_advertising.acquire import UA
from scripts.gov_advertising.privacy import POLICY_PATH, review_text


def year_of(text):
    # Attachment URLs include upload dates (for example /2024-04/). A report
    # year must be two consecutive years, never the upload directory's month.
    for start,end in re.findall(r'(20\d{2})[-–](20\d{2}|\d{2})', text):
        if int(end[-2:]) == (int(start)+1)%100:
            return start+'-'+end[-2:]
    return None


def kind_of(url, title):
    value = (url + ' ' + title).lower()
    if 'historical-data' in value: return 'historical tables'
    if 'plan-' in value or 'advertising plan' in value: return 'annual plan'
    if 'campaign-activity' in value or 'campaign-advertising-2012' in value: return 'campaign summary'
    if urlsplit(url).path.count('/') > 1 and '/sites/' not in url: return 'report section'
    return 'annual report'


def build(root=ROOT):
    stage, cache = root/'data/staged/vic-advertising', root/'portal/private/vic-advertising/source'
    load = lambda p: json.loads(p.read_text())
    receipts = load(stage/'receipts.json'); ledger = {r['url']: r for r in receipts}
    if any(r['status'] != 200 or r.get('held') or r.get('challenge') for r in receipts):
        raise ValueError('Source access held; no staging')
    policy = ledger[TERMS]
    policy_body = (root/policy['local_path']).read_bytes()
    if sha(policy_body) != policy['sha256']:
        raise ValueError('Copyright snapshot hash mismatch')
    text = BeautifulSoup(policy_body, 'html.parser').find('main').get_text(' ', strip=True)
    for evidence in ('All material provided on this website', 'Creative Commons Attribution 4.0', '© Copyright State Government of Victoria', 'third parties', 'Coat of Arms'):
        if evidence not in text: raise ValueError('Website grant changed; hold for rights review')
    rules = robots_rules((cache/'robots.txt').read_text(), UA)
    documents, tables = [], []
    discovery = load(stage/'discovery.json')
    for url, title in discovery.items():
        title=review_text(title,'publication_title')
        r = ledger.get(url); ext = Path(urlsplit(url).path).suffix
        d = {'id': 'vic-'+sha(url.encode())[:16], 'jurisdiction': 'VIC', 'url': url,
             'title': title, 'financial_year': year_of(title) or year_of(url), 'kind': kind_of(url,title),
             'format': ext.lstrip('.').upper() if ext else 'HTML', 'status': 'held',
             'basis': 'Not stated on this source table', 'measure': title,
             'licence': {'status': 'unverified', 'policy_url': TERMS, 'policy_name': 'CC BY 4.0 website grant; file exceptions not cleared'},
             'robots_allowed': robots_allowed(url, rules)}
        if ext:
            d['hold_reason'] = 'Attachment extension family excluded by robots; no alternate URL/case request. File-level rights and tables unverified.'
            if r:
                d['receipt'] = r
                d['hold_reason'] = 'One exact index-linked uppercase DOCX plan acquired before the document-family hold; quarantined from ingestion and all exports.'
            documents.append(d);continue
        if not r:
            d['hold_reason'] = 'Not acquired';documents.append(d);continue
        body = (root/r['local_path']).read_bytes()
        if sha(body) != r['sha256']:raise ValueError('Original HTML hash mismatch')
        main = BeautifulSoup(body, 'html.parser').find('main')
        if main is None:raise ValueError('Missing source main')
        main_text = main.get_text(' ',strip=True)
        if re.search(r'all rights reserved|prior written permission|CC BY-NC|no commercial reuse', main_text, re.I):
            d['hold_reason'] = 'Specific restriction requires rights review';documents.append(d);continue
        # Review scope: original publisher's numerical tables, advertiser names
        # and example-campaign descriptions only; no creative, images or logos.
        d.update(status='reviewed', sha256=r['sha256'], receipt=r,
                 licence={'status':'open','name':'CC BY 4.0','url':CC,'policy_url':TERMS,'reviewed':True,
                          'scope_sha256':r['sha256'],'exceptions_reviewed':True,'receipt':policy,
                          'terms':'Website grant applies to the publisher-authored numerical HTML tables and advertiser/campaign descriptions. Images, branding, Victorian Coat of Arms, government logo and third-party content excluded.',
                          'attribution':'© Copyright State Government of Victoria',
                          'changes':'Expenditure tables transcribed and formatted; source figures and labels retained.'})
        extracted = matrices(body)
        for t in extracted:
            t.update(document_id=d['id'], status='held', scope=title,
                     basis='Not stated on this source table')
            if not t['heading']:t['heading']=title
            if 'historical-data-' in url:
                t['basis'] = "Advertising expenditure is reported as 'Net' (excluding GST)"
                if t['number'] in (2,3):t['scope'] = 'Totals include all advertising expenditure (campaign, functional and recruitment)'
                else:t['scope'] = t['heading']
            headers = t['rows'][0] if t['rows'] else []
            if headers == ['Year','Millions']:
                t.update(published_total_series=True,scope='Total Victorian Government advertising expenditure by year (source chart data table)')
            if any('GST' in h for h in headers):
                t['basis'] = next(h for h in headers if 'GST' in h)
            if headers[:3] == ['Rank','Advertiser','Example campaigns']:
                t['scope'] = 'Consolidated campaign advertising expenditure via MAMS; examples are not separately costed'
                if t['basis']=='Not stated on this source table':
                    footnote=next((p.get_text(' ',strip=True) for p in main.find_all('p') if 'Media expenditure figures reported above exclude GST' in p.get_text(' ',strip=True)),None)
                    if footnote:t['basis']=footnote
            t['basis']=review_text(t['basis'],'basis',t['privacy_holds'],'GST basis')
            t['scope']=review_text(t['scope'],'scope',t['privacy_holds'],'expenditure scope')
            campaign_cost=headers == ['Campaign advertising expenditure','$ (excluding GST)']
            t['family'] = ('campaign costs' if campaign_cost else 'advertiser campaign summaries' if headers[:3]==['Rank','Advertiser','Example campaigns']
                           else 'annual total time series' if headers==['Year','Millions'] else 'historical percentage table' if any('%' in v for row in t['rows'][1:] for v in row)
                           else 'historical campaign/non-campaign expenditure')
            if campaign_cost:
                t['scope']='Campaign advertising expenditure (source reporting period retained; no category sum)'
            supported = headers and (headers[0] == 'Year' or headers[:3] == ['Rank','Advertiser','Example campaigns'] or campaign_cost)
            percentages = any('%' in v for row in t['rows'][1:] for v in row)
            if supported and not percentages and d['kind'] != 'annual plan' and not t.get('privacy_hold'):
                t['status'] = 'reviewed'
                if campaign_cost and (not t.get('entity') or not t.get('campaign')):
                    t.update(status='held',hold_reason='Campaign heading layout requires review')
            else:
                t['hold_reason'] = t.get('hold') or ('Campaign title held for private-name review' if t.get('privacy_hold') else 'Plan, not expenditure' if d['kind']=='annual plan' else 'Percentage/non-expenditure or unsupported table layout')
            t['sha256'] = sha(json.dumps(t['rows'],ensure_ascii=False,separators=(',',':')).encode())
            if t['status']=='reviewed':
                try:
                    observations(t,d)
                except ValueError as error:
                    t.update(status='held',hold_reason=str(error))
            tables.append(t)
        d['tables'] = [{'number':t['number'],'heading':t['heading'],'family':t['family'],'status':t['status'], 'hold_reason':t.get('hold_reason')} for t in extracted]
        documents.append(d)
    inventory = {'schema':1,'generated_at':receipts[-1]['completed_at'],'source_url':INDEX,
                 'licence_url':TERMS,'documents':documents,
                 'limits':['Inventory bounded to the current advertising index and its linked advertising pages. No completeness claim beyond that published index.',
                           'No attachment content is ingested. Chart images and percentage/plan tables are outside the expenditure projection.',
                           'Example campaigns share an advertiser total; no separate campaign cost is inferred.']}
    inventory['counts']={'documents':len(documents),'formats':dict(Counter(d['format'] for d in documents)),
                         'held':sum(d['status']=='held' for d in documents),'tables':len(tables),
                         'table_families':dict(Counter(t['family'] for t in tables))}
    hub = projection(inventory,tables)
    privacy_holds=[{'document_id':t['document_id'],'table':t['number'],**h} for t in tables for h in t.get('privacy_holds',[])]
    inventory['counts']['privacy_holds']=dict(sorted(Counter(h['field'] for h in privacy_holds).items()))
    for name,value in [('inventory',inventory),('tables',tables),('hub',hub),('reconciliation',hub['reconciliation'])]:
        (stage/(name+'.json')).write_text(json.dumps(value,ensure_ascii=False,indent=2)+'\n')
    (stage/'privacy-policy.json').write_bytes(POLICY_PATH.read_bytes())
    (stage/'privacy-holds.json').write_text(json.dumps(privacy_holds,indent=2)+'\n')
    print(json.dumps({**inventory['counts'],**hub['counts'],'checks':dict(Counter(c['status'] for c in hub['reconciliation']))}))
    return hub


if __name__=='__main__':build()
