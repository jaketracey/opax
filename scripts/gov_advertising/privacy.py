"""Keep authorised record text; review only entity/facet fields.

Jake's 19 Oct 2026 decision permits names inside source descriptions and titles.
It does not permit person entities, links, facets or cross-record identity joins.
Licence/robots holds and individual supplier withholding are unchanged.
"""
import json

from scripts.gov_advertising.stage import ROOT, sha

POLICY_PATH = ROOT / 'portal/src/gov-advertising-privacy.json'
POLICY = json.loads(POLICY_PATH.read_text())
SAFE = set(POLICY['labels']) | set(POLICY['organisations'])
RECORD_TEXT = set(POLICY['record_text_roles'])
HELD = {
    'organisation': 'Organisation withheld pending review',
    'supplier': 'individual supplier (withheld)',
}
def review_text(value, role, holds=None, locator=''):
    """Preserve record text verbatim; hold unreviewed entity/facet values."""
    allowed=(value in POLICY['organisations'] or value==HELD['organisation']) if role=='organisation' else value in SAFE
    if not value or role in RECORD_TEXT or allowed:
        return value
    if holds is not None:
        holds.append({'field':role,'source_locator':locator,'sha256':sha(value.encode()),'status':'held',
                      'reason':'Entity or facet value is not a reviewed organisation/category'})
    return HELD.get(role,'Reported expenditure table')


def review_table(item):
    """Review entity fields without removing names from authorised record text."""
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
