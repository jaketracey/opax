"""Offline inventory and local source-record staging; never writes public assets."""
from datetime import datetime
import hashlib
from html import unescape
import json
import re

from scripts.sa_budget.inventory import resources
from scripts.qld_budget.acquire import robots_allowed
from .acquire import STAGE, CACHE, BASE, DATASETS, SELECTED, UA, host_stopped
from .parse import csv_awards, AWARD_FIELDS

CC = 'https://creativecommons.org/licenses/by/4.0/'
INPUTS = ['inventory.json', 'receipts.json', 'series.jsonl', 'reconciliation.json', 'acquisition-audit.json', 'hub.json']
PROVENANCE = ('resource_id','dataset','dataset_url','source_url','snapshot','sha256','licence','licence_url')
ROW_FIELDS = AWARD_FIELDS + PROVENANCE


def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def saved(receipt):
    if not receipt or not receipt['body_retained']:
        raise ValueError('No retained successful original')
    path = CACHE / receipt['sha256']
    if digest(path) != receipt['sha256']:
        raise ValueError('Retained snapshot hash differs')
    return path.read_bytes()


def explicit(html):
    # Require the resource/dataset's own rights marker, not the website footer.
    return bool(re.search(r'(?:name="DCTERMS.License" content="https?://creativecommons.org/licenses/by/4.0/?"|href="https?://creativecommons.org/licenses/by/4.0/?" rel="dc:rights")', html))


def notes(html):
    return [unescape(re.sub('<[^>]+>', '', text)).strip() for text in re.findall(r'<div class="prose notes"[^>]*>(.*?)</div>', html, re.S)]


def build():
    ledger = json.loads((STAGE/'receipts.json').read_text())
    by_url = {r['url']:r for r in ledger}
    robots = saved(ledger[0]).decode()
    assert ledger[0]['kind'] == 'robots'
    terms = saved(by_url[BASE+'/copyright']).decode()
    assert 'Organisation name, Jurisdiction, title of dataset' in re.sub('<[^>]+>', '', terms)
    gaps = []
    for index, r in enumerate(ledger):
        assert r['method']=='GET' and r['user_agent']==UA and not r['automatic_redirects'] and not r['proxy']
        assert not any(host_stopped(p) for p in ledger[:index]), 'Request after stop'
        assert r['kind']=='robots' or robots_allowed(robots, r['url'])
        if index:
            gap=(datetime.fromisoformat(r['requested_at'])-datetime.fromisoformat(ledger[index-1]['snapshot'])).total_seconds()
            assert gap>=5.1, 'Acquisition overlap or delay violation'
            gaps.append(gap)
        if r['body_retained']:
            saved(r)
    items, docs, rows, reconciliations = [], [], [], []
    for slug in (DATASETS[0], DATASETS[2]):
        dataset_url = BASE+'/data/dataset/'+slug
        dataset_receipt = by_url[dataset_url]
        dataset_html = saved(dataset_receipt).decode()
        assert explicit(dataset_html), 'Dataset licence missing'
        is_grants = slug == DATASETS[0]
        dataset_title = 'Grants SA funded projects 2016-2017' if is_grants else 'Premier’s Community Initiatives Fund'
        publisher = 'Department of Human Services' if is_grants else 'Department of the Premier and Cabinet'
        for entry in resources(dataset_html):
            item = dict(entry, dataset=slug, dataset_url=dataset_url, dataset_title=dataset_title, publisher=publisher)
            item.pop('table_number'); item.pop('published_number')
            item['selected'] = entry['id'] in SELECTED
            if not item['selected']:
                item.update(status='excluded',reason='Outside successful-award scope; no resource page, file or records acquired')
                items.append(item)
                continue
            year_match = re.search(r'(20\d{2})-(20)?(\d{2})$', entry['title'])
            assert year_match
            year = year_match[1]+'-'+year_match[3]
            page_receipt = by_url[entry['resource_url']]
            page = saved(page_receipt).decode()
            links = {unescape(x) for x in re.findall(r'<a[^>]*class="[^"]*resource-url-analytics[^"]*"[^>]*href="([^"]+)"', page)}
            assert len(links)==1
            download_url = links.pop()
            download = by_url[download_url]
            assert explicit(page), 'Resource licence missing'
            item.update(year=year, programme='Grants SA' if is_grants else dataset_title, download_url=download_url,
                dataset_receipt=dataset_receipt, resource_receipt=page_receipt, download_receipt=download,
                notes=notes(page), dataset_notes=notes(dataset_html),
                attribution=f'{publisher}, Government of South Australia, {dataset_title}, Sourced on {download["snapshot"][:10]}, {dataset_url}',
                licence=dict(name='CC BY 4.0',url=CC,dataset_explicit=True,resource_explicit=True,file_notices_reviewed=False,exceptions=[]),
                snapshot=download['snapshot'],sha256=download['sha256'])
            if download['status']!=200 or not download['body_retained']:
                item.update(status='held',hold=f'Original successful-award file returned HTTP {download["status"]}; no file contents or award rows available')
            elif is_grants:
                native = csv_awards(saved(download), year)
                item['licence']['file_notices_reviewed']=True
                item.update(status='reviewed-staged',encoding='Windows-1252',file_notes='Five CSV columns; no separate notice, note or published total row',row_count=len(native))
                for row in native:
                    row.update(resource_id=item['id'],dataset=slug,dataset_url=dataset_url,source_url=item['resource_url'],snapshot=item['snapshot'],sha256=item['sha256'],licence='CC BY 4.0',licence_url=CC)
                    rows.append(row)
                reconciliations.append(dict(resource_id=item['id'],status='pass',source_award_rows=len(native),staged_award_rows=len(native),
                    source_row_checks=len(native),source_year=year,year_basis='Publisher resource title; CSV has no year column',
                    published_total=None,amount_total_check='not applicable: publisher supplies no total; no aggregate computed'))
            else:
                item.update(status='held',hold='Successful XLS sheet boundaries and file notices need separate review before staging')
            items.append(item)
            docs.append(item)
    hub=dict(schema=1,generated_at=ledger[-1]['snapshot'],documents=docs,rows=rows)
    inventory=dict(schema=1,generated_at=hub['generated_at'],resources=items,source_record_text='Committed authorised source-record text in series.jsonl and hub.json; raw originals remain private',
        counts=dict(resources=len(items),selected=len(docs),excluded=len(items)-len(docs),staged_awards=len(rows),held_files=sum(d['status']=='held' for d in docs)))
    audit=dict(requests=len(ledger),responses={str(s):sum(r['status']==s for r in ledger) for s in set(r['status'] for r in ledger)},
        minimum_completion_gap_seconds=min(gaps),overlaps=0,redirects_followed=0,host_stopped=any(host_stopped(r) for r in ledger),
        user_agent=UA,automatic_redirects=False,process_lock=True)
    return inventory,hub,dict(checks=reconciliations,computed_totals=0),audit


def projection(hub):
    docs, rows = [], []
    for d in hub['documents']:
        rights=d['licence']
        if d['status']!='reviewed-staged' or d.get('hold') or not all(rights[k] for k in ('dataset_explicit','resource_explicit','file_notices_reviewed')) or rights['url']!=CC or rights['exceptions']:
            continue
        selected=[{k:r[k] for k in ROW_FIELDS} for r in hub['rows'] if r['resource_id']==d['id'] and not r.get('computed') and not r.get('derivation')]
        doc={k:d[k] for k in ('id','title','programme','year','dataset','dataset_title','publisher','dataset_url','resource_url','snapshot','sha256','licence','attribution','notes')}
        doc.update(status='cleared',source_rows={r['sheet']+'!'+str(r['source_row']):{k:r[k] for k in AWARD_FIELDS} for r in selected})
        docs.append(doc); rows.extend(selected)
    holds=[{k:d[k] for k in ('id','title','programme','year','dataset','dataset_title','publisher','dataset_url','resource_url','snapshot','sha256','licence','attribution','hold')} for d in hub['documents'] if d.get('hold')]
    return dict(schema=1,generated_at=hub['generated_at'],documents=docs,rows=rows,holds=holds)


def main():
    inventory,hub,reconciliation,audit=build()
    for name,data in [('inventory',inventory),('hub',hub),('reconciliation',reconciliation),('acquisition-audit',audit)]:
        (STAGE/(name+'.json')).write_text(json.dumps(data,ensure_ascii=False,indent=2)+'\n')
    (STAGE/'series.jsonl').write_text(''.join(json.dumps(r,ensure_ascii=False)+'\n' for r in hub['rows']))
    review=STAGE/'review.json'
    hashes={name:digest(STAGE/name) for name in INPUTS}
    if not review.exists() or json.loads(review.read_text()).get('status')=='pending':
        review.write_text(json.dumps(dict(status='pending',reviewed_commit=None,inputs=hashes,reason='Independent review and explicit promotion pending; nightly off'),indent=2)+'\n')
    candidate=CACHE.parent/'candidate.json'
    candidate.write_text(json.dumps(projection(hub),ensure_ascii=False,indent=2)+'\n')
    print(json.dumps(inventory['counts']))


if __name__=='__main__':
    main()
