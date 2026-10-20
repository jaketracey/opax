"""Offline staged projection audit. Never grants review or writes public data."""
import argparse
import hashlib
import json
from pathlib import Path

from .acquire import ROOT, CACHE, UA, host_stopped
from .stage import CC, FUNCTION, SELECTED
from .stage import reconcile
from .parse import budget_cells, function_cells
from openpyxl import load_workbook

CELL_FIELDS = ('sheet','cell','measure','measure_as_published','section_as_published','fiscal_year','estimate_or_actual','status_as_published','value','units','source_marker','basis','unit_status','raw_value','number_format','display_divisor','decimals','consolidation')
ROW_FIELDS = CELL_FIELDS + ('resource_id','dataset','dataset_url','source_url','workbook','table_number','vintage','snapshot','sha256','licence','licence_url','published','consolidation','raw_value','number_format','display_divisor','decimals')


def projection(hub):
    """Whitelist source cells; reconciliation and held values cannot cross."""
    documents = []
    rows = []
    for doc in hub['documents']:
        if doc['status'] != 'reviewed-staged' or doc.get('hold') or doc['id'] == FUNCTION:
            continue
        rights = doc['licence']
        if not (rights['dataset_explicit'] and rights['resource_explicit'] and rights['file_notices_reviewed'] and rights['url'] == CC and not rights['exceptions']):
            continue
        selected = [r for r in hub['rows'] if r['resource_id'] == doc['id'] and r['published'] is True and r['unit_status']=='verified'
                    and r['sha256']==doc['sha256'] and r['snapshot']==doc['snapshot'] and r['source_url']==doc['resource_url']
                    and r['licence_url']==CC and not r.get('computed') and not r.get('derivation')]
        public_doc = {k:doc[k] for k in ('id','title','table_number','resource_url','dataset_url','vintage','snapshot','sha256','licence','workbook','notes','warnings','attribution','fiscal_years')}
        public_doc.update(status='cleared', source_cells={r['sheet']+'!'+r['cell']:{k:r[k] for k in CELL_FIELDS} for r in selected})
        documents.append(public_doc)
        rows.extend({k:r[k] for k in ROW_FIELDS} for r in selected)
    holds=[{k:d[k] for k in ('id','title','resource_url','dataset_url','vintage','snapshot','sha256','hold','warnings','attribution','fiscal_years')}
           for d in hub['documents'] if d.get('hold')]
    return dict(schema=1, generated_at=hub['generated_at'], vintage=hub['vintage'], source=hub['source'], documents=documents, rows=rows, holds=holds)


def checked_projection(stage):
    hub=json.loads((stage/'hub.json').read_text())
    inventory=json.loads((stage/'inventory.json').read_text())
    series=[json.loads(line) for line in (stage/'series.jsonl').read_text().splitlines()]
    receipts=json.loads((stage/'receipts.json').read_text())
    assert len([r for r in inventory['resources'] if r['dataset']=='budget-2015-16-data'])==117
    assert len({r['id'] for r in inventory['resources']})==119
    assert {d['table_number'] for d in hub['documents'] if d['id']!=FUNCTION}==set(SELECTED)
    assert len([r for r in receipts if r['kind']=='download'])==5
    assert receipts[0]['kind']=='robots'
    assert len({r['requested_url_sha256'] for r in receipts})==len(receipts)
    for i,r in enumerate(receipts):
        assert r['user_agent']==UA and r['method']=='GET' and not r['proxy'] and not r['automatic_redirects']
        assert not any(host_stopped(p) for p in receipts[:i]), 'Request after refusal'
        if r['body_retained']:
            assert hashlib.sha256((CACHE/r['sha256']).read_bytes()).hexdigest()==r['sha256']
    assert len({(r['resource_id'],r['sheet'],r['cell']) for r in series})==len(series)
    assert hub['rows']==[r for r in series if r['status']=='reviewed-staged']
    assert hub['documents']==[r for r in inventory['resources'] if r['selected'] and r.get('sha256')]
    books={}
    for doc in hub['documents']:
        with (CACHE/doc['sha256']).open('rb') as file:
            book=load_workbook(file,data_only=True)
        table=doc['table_number'] or 'function'
        books[table]=book
        native=[r for sheet in book for r in (function_cells(sheet) if doc['id']==FUNCTION else budget_cells(sheet,table))]
        for r in native:
            r['consolidation']='General government sector as published; workbook does not separately describe consolidation adjustments'
        staged=[r for r in series if r['resource_id']==doc['id']]
        if [{k:r[k] for k in CELL_FIELDS} for r in native] != [{k:r[k] for k in CELL_FIELDS} for r in staged]:
            raise ValueError('source-cell projection differs from retained workbook: '+doc['id'])
    reconciliation=json.loads((stage/'reconciliation.json').read_text())
    if reconciliation['checks']!=json.loads(json.dumps(reconcile(books))):
        raise ValueError('Reconciliation differs from retained source controls')
    budget_checks=[c for c in reconciliation['checks'] if not c['check'].startswith('Function')]
    assert budget_checks and all(c['passed'] for c in budget_checks)
    output=projection(hub)
    assert len(output['documents'])==4 and len(output['rows'])==447
    assert not any('internal_component_sum' in str(r) for r in output['rows'])
    assert not any(r['resource_id']==FUNCTION for r in output['rows'])
    # Serving assets must not be created by staging. Review/promoter is a
    # separate explicit action, with a new fixed review digest.
    return output, dict(inventory_resources=119, budget_resources=117, acquired_workbooks=5,
                        staged_cells=len(series), candidate_cells=len(output['rows']), held_cells=sum(r['status']=='held' for r in series),
                        budget_checks=len(budget_checks), budget_checks_passed=len(budget_checks),
                        function_diagnostics=len(reconciliation['checks'])-len(budget_checks),
                        function_failed=sum(not c['passed'] for c in reconciliation['checks']),
                        public_computed_totals=0)


if __name__=='__main__':
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--dry-run',action='store_true',required=True)
    parser.parse_args()
    _,counts=checked_projection(ROOT/'data/staged/sa-budget')
    review=json.loads((ROOT/'data/staged/sa-budget/review.json').read_text())
    print(json.dumps(dict(mode='dry-run',writes=0,review=review['status'],acquisition='one documented sequencing deviation',**counts)))
