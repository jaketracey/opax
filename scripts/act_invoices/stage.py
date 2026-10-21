"""Offline, hold-safe staging. Originals and supplier-bearing rows stay out of Git."""
from datetime import datetime
import hashlib
import json
from .acquire import STAGE, CACHE, META, PAGE, CC, ID, UA, robots_allowed, host_stopped, save
from .parse import records, schema

INPUTS = ['inventory.json','schema.json','receipts.json','series.jsonl','reconciliation.json','acquisition-audit.json','hub.json']


def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def build(stage=STAGE, cache=CACHE):
    if (stage/'hold.json').exists():
        raise ValueError('Acquisition held; partial data cannot be staged or promoted')
    ledger = json.loads((stage/'receipts.json').read_text())
    if not ledger or ledger[0]['kind'] != 'robots' or any(r.get('hold') or host_stopped(r) or not r.get('body_retained') for r in ledger):
        raise ValueError('Incomplete or held acquisition')
    def saved(r):
        p=cache/r['sha256']
        if digest(p)!=r['sha256']:
            raise ValueError('Retained source hash changed')
        return p.read_bytes()
    robots=saved(ledger[0]).decode()
    gaps=[]
    for i,r in enumerate(ledger):
        if r['user_agent']!=UA or r['automatic_redirects'] or r['proxy']:
            raise ValueError('Acquisition identity/transport changed')
        if i:
            if not robots_allowed(robots,r['url']):
                raise ValueError('Exact URL disallowed by retained robots')
            gap=(datetime.fromisoformat(r['requested_at'])-datetime.fromisoformat(ledger[i-1]['snapshot'])).total_seconds()
            if gap<max(5.1,r['minimum_delay_seconds']):
                raise ValueError('Acquisition completion spacing violation')
            gaps.append(gap)
        saved(r)
    metadata=next(r for r in ledger if r['kind']=='metadata')
    data=next(r for r in ledger if r['kind']=='data')
    m=json.loads(saved(metadata)); payload=json.loads(saved(data)); view=payload['meta']['view']
    for v in (m,view):
        if v['id']!=ID or v.get('attribution')!='ACT Government' or v.get('license',{}).get('termsLink') not in (CC,'http://creativecommons.org/licenses/by/4.0/legalcode','https://creativecommons.org/licenses/by/4.0/legalcode'):
            raise ValueError('Dataset-specific licence/attribution changed')
    if schema(m)!=schema(view) or m['rowsUpdatedAt']!=view['rowsUpdatedAt']:
        raise ValueError('Schema or source version changed during acquisition')
    rows,report=records(payload,data)
    if not rows or not report['unique_source_coordinates'] or not report['unique_socrata_ids']:
        raise ValueError('Invalid source grain')
    text=''.join(json.dumps(r,ensure_ascii=False,separators=(',',':'))+'\n' for r in rows)
    info=dict(schema=1,dataset_id=ID,title=m['name'],publisher='ACT Government',attribution=m['attribution'],
              attribution_link=m.get('attributionLink'),source_url=PAGE,download_url=data['url'],
              generated_at=data['snapshot'],snapshot=data['snapshot'],snapshot_sha256=data['sha256'],
              licence='CC BY 4.0',licence_url=CC,licence_grant=m['license'],
              description=m['description'],metadata_sha256=metadata['sha256'],rows=len(rows),
              payment_date_min=report['payment_date_min'],payment_date_max=report['payment_date_max'],
              catalogued_period=m['metadata']['custom_fields']['Data Set Coverage']['Temporal Coverage'],
              source_updated_at=datetime.fromtimestamp(m['rowsUpdatedAt'],tz=datetime.fromisoformat(data['snapshot']).tzinfo).isoformat(),
              no_unique_invoice_id=True,published_totals=False,search_keys=['publish_description','reporting_entity'],
              filters=['reporting_entity','financial_year','month','amount'],surface='D1 table API',nightly=False)
    inventory=dict(**info,raw_bytes=data['bytes'],staged_bytes=len(text.encode()),
                   staged_sha256=hashlib.sha256(text.encode()).hexdigest(),by_year=report['by_year'],by_month=report['by_month'],
                   storage='Supplier-bearing originals and series.jsonl stay local and ignored by Git; receipts and schema are committed',
                   status='staged; review and promotion pending')
    audit=dict(requests=len(ledger),minimum_completion_gap_seconds=min(gaps),overlaps=0,process_lock=True,
               redirects_followed=0,refusals=0,robots_checked_exact_urls=True,user_agent=UA)
    return inventory,schema(m),rows,report,audit,info,text


def main():
    inventory,columns,rows,report,audit,info,text=build()
    for name,value in [('inventory',inventory),('schema',columns),('reconciliation',report),('acquisition-audit',audit),('hub',info)]:
        save(STAGE/(name+'.json'),value)
    (STAGE/'series.jsonl').write_text(text)
    review=STAGE/'review.json'
    if review.exists() and json.loads(review.read_text()).get('status')!='pending':
        raise ValueError('Do not overwrite an approved review')
    save(review,dict(status='pending',reviewed_commit=None,inputs={n:digest(STAGE/n) for n in INPUTS},
                     reason='Independent review and explicit D1 snapshot promotion pending; nightly off'))
    print(json.dumps({k:inventory[k] for k in ('rows','raw_bytes','staged_bytes','by_year','snapshot_sha256')}))


if __name__=='__main__':main()
