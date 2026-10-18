"""Default-deny review of *all* report-derived text, shared with the Worker.

Never guess whether a capitalised word is a person. An unknown narrative value
is held in full. Only exact reviewed labels/organisations and structured values
survive. Original text remains solely in the ignored acquisition cache.
"""
import json
import re
from pathlib import Path

from scripts.gov_advertising.stage import ROOT, sha

POLICY_PATH = ROOT / 'portal/src/gov-advertising-privacy.json'
POLICY = json.loads(POLICY_PATH.read_text())
SAFE = set(POLICY['labels']) | set(POLICY['organisations'])
HELD = {
    'advertiser_description': 'Advertiser description withheld pending review',
    'campaign_title': 'Campaign cost categories (title withheld)',
    'organisation': 'Organisation withheld pending review',
    'period_note': 'Source note withheld pending review',
    'campaign_period': 'Source period withheld pending review',
    'amount_annotation': 'Withheld source annotation',
    'basis': 'GST basis withheld pending review',
    'supplier': 'individual supplier (withheld)',
}
MONTHS = set('january february march april may june july august september october november december jan feb mar apr jun jul aug sep sept oct nov dec ongoing to and'.split())


def structured(value, role):
    if role == 'amount_annotation':
        return bool(re.fullmatch(r'\$?[\d, ]+(?:\.\d+)?|\d+(?:\.\d+)?%|N/A|-',value))
    if role == 'campaign_period':
        words = re.findall(r'[^\W\d_]+', value.lower())
        return bool(re.search(r'\d',value) and all(w in MONTHS for w in words)
                    and re.fullmatch(r'[\w\s\d.,/*()–—-]+',value))
    return False


def review_text(value, role, holds=None, locator=''):
    """Return a reviewed value or a safe hold label, with a hash-only receipt."""
    allowed=(value in POLICY['organisations'] or value==HELD['organisation']) if role=='organisation' else value in SAFE
    if not value or allowed or structured(value,role):
        return value
    if holds is not None:
        holds.append({'field':role,'source_locator':locator,'sha256':sha(value.encode()),'status':'held',
                      'reason':'Unreviewed report narrative may identify a private person'})
    if role == 'amount_annotation':
        # Publish an explicitly printed number/code, never the following prose.
        # The omitted original is represented by the source-cell hash above.
        numeric=re.match(r'^(\$?\d[\d, ]*(?:\.\d+)?)(?=\s*\()',value)
        if numeric:return numeric[1].rstrip()
        if value.startswith('N/A'):return 'N/A'
    return HELD.get(role,'Reported expenditure table')


def review_table(item):
    """Sanitise before any source table or description is written to staging."""
    holds=item.setdefault('privacy_holds',[])
    item['heading']=review_text(item.get('heading',''),'table_heading',holds,'table heading')
    rows=item['rows']
    if not rows:return item
    ranked=rows[0][:3]==['Rank','Advertiser','Example campaigns']
    campaign_cost=rows[0]==['Campaign advertising expenditure','$ (excluding GST)']
    for ri,row in enumerate(rows,1):
        for ci,value in enumerate(row,1):
            role='category'
            if ri>1:
                if ranked:role='supplier' if rows[0][ci-1]=='Supplier' else 'organisation' if ci==2 else 'advertiser_description' if ci==3 else 'amount_annotation'
                elif campaign_cost:role='category' if ci==1 else 'amount_annotation'
                else:role='amount_annotation' if ci>1 else 'campaign_period'
            row[ci-1]=review_text(value,role,holds,f'HTML table {item["number"]} row {ri} column {ci}')
    for field,role in [('entity','organisation'),('campaign','campaign_title'),('campaign_period','campaign_period'),('period_note','period_note')]:
        if field in item:item[field]=review_text(item[field],role,holds,field)
    return item
