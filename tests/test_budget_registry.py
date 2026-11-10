import copy
from io import BytesIO
import json
from pathlib import Path
import zipfile

import pytest
from scripts.budget_registry.parse import document_licence, parse_page, parse_historical_actuals, parse_aggregates, parse_docx_measures, CC3, CC4
from scripts.budget_registry.stage import projection

FIX = Path(__file__).parent / 'fixtures/budget'


def document(name, year, kind='bp1'):
    f = json.loads((FIX / (name + '.json')).read_text())
    return { 'id': 'fixture', 'title': 'Budget Paper 1' if kind=='bp1' else kind.upper(), 'year': year,
             'release': year, 'kind': kind, 'url': f['url'], 'receipt': f['receipt'],
             'status': 'cleared', 'licence': document_licence('Creative Commons Attribution 4.0 International licence') }, f


def test_current_aggregate_columns_exclude_total_and_preserve_actuals():
    d,f=document('bp1-2026','2026-27')
    rows=parse_page(f['pages'][0]['text'],d,f['pages'][0]['page'])
    values={(r['fiscal_year'],r['metric']):r for r in rows}
    assert values[('2026-27','receipts')]['value']==798.1
    assert values[('2026-27','payments')]['value']==829.6
    assert values[('2026-27','underlying_cash_balance')]['value']==-31.5
    assert values[('2026-27','net_debt')]['value']==616.6
    assert values[('2024-25','receipts')]['status']=='actual'
    assert values[('2025-26','receipts')]['status']=='estimate'
    assert values[('2027-28','receipts')]['status']=='estimate'
    assert len(rows)==24
    assert all(r['sha256']==f['receipt']['sha256'] and r['pdf_page']==91 for r in rows)


def test_older_paper_embedded_units_and_future_fund_footnote():
    d,f=document('bp1-2015','2015-16')
    rows=parse_page(f['pages'][0]['text'],d,f['pages'][0]['page'])
    values={(r['fiscal_year'],r['metric']):r for r in rows}
    assert values[('2015-16','receipts')]['value']==398.0
    assert values[('2015-16','payments')]['value']==429.8
    assert values[('2015-16','underlying_cash_balance')]['value']==-35.1
    assert values[('2015-16','underlying_cash_balance')]['unit']=='AUD billion'
    # UCB can exclude Future Fund earnings: never derive it as receipts-payments.
    assert -35.1 != pytest.approx(398.0-429.8)


def test_myefo_budget_comparisons_are_distinct_vintages():
    d,f=document('myefo-2015','2015-16','myefo')
    rows=[r for page in f['pages'] for r in parse_page(page['text'],d,page['page'])]
    selected=[r for r in rows if r['metric']=='receipts' and r['fiscal_year']=='2015-16']
    assert [(r['vintage'],r['value']) for r in selected]==[('Budget comparison',398.0),('MYEFO',394.9)]
    assert all(r['status']=='estimate' for r in selected)


def test_fbo_nominal_actuals_are_separate_from_real_per_capita_tables():
    d,f=document('fbo-2025','2025-26','fbo')
    rows=parse_historical_actuals(f['pages'][0]['text'],d,f['pages'][0]['page'])
    assert len(rows)==33
    assert {r['metric']:r['value'] for r in rows if r['fiscal_year']=='2025-26'}=={'receipts':764358.0,'payments':786612.0,'underlying_cash_balance':-22254.0}
    assert all(r['unit']=='AUD million' and r['status']=='actual' for r in rows)
    assert parse_historical_actuals(f['pages'][0]['text'].replace('Table B.1:','Table B.11:'),d,1)==[]


def test_unknown_units_or_unmatched_columns_never_become_figures():
    d,f=document('bp1-2026','2026-27')
    assert parse_page(f['pages'][0]['text'].replace('$b','units'),d,91)==[]
    changed=f['pages'][0]['text'].replace('798.1','798.1 999.0 999.0')
    assert not any(r['metric']=='receipts' for r in parse_page(changed,d,91))


@pytest.mark.parametrize('terms,status,name',[
    ('Creative Commons BY Attribution 3.0 Australia licence','open','CC BY 3.0 AU'),
    ('Creative Commons Attribution 4.0 International licence','open','CC BY 4.0'),
    ('Creative Commons Attribution 4.0, except this document requires prior written permission','blocked','Restricted document terms'),
    ('Creative Commons Attribution-NonCommercial-NoDerivatives 4.0','blocked','Restricted document terms'),
    ('Copyright Commonwealth of Australia','unverified','Document reuse grant unverified'),
])
def test_document_terms_gate(terms,status,name):
    rights=document_licence(terms)
    assert (rights['status'],rights['name'])==(status,name)


def test_blocked_pdf_is_never_parsed_or_projected_even_if_rows_are_preexisting():
    d,f=document('bp1-2026','2026-27');rows=parse_page(f['pages'][0]['text'],d,91)
    base={'generated_at':'2026-10-13','scope':'fixture','documents':[d],'releases':[], 'aggregates':rows,'measures':[], 'held':[], 'portfolio_indexes':[], 'unreleased':[]}
    assert len(projection(base)['aggregates'])==24
    d['licence']=document_licence('Prior written permission required')
    assert parse_aggregates(b'invalid PDF body must never be opened',d)==[]
    assert projection(base)['documents']==[]
    assert projection(base)['aggregates']==[]
    d['licence']=document_licence('Creative Commons Attribution 4.0')
    rows[0]['sha256']='0'*64
    assert len(projection(base)['aggregates'])==23


def test_measures_keep_suppressed_and_rounded_cells_without_guessing_numbers():
    d,_=document('bp1-2026','2026-27')
    cells=lambda row:'<w:tr>'+''.join('<w:tc><w:p><w:r><w:t>'+v+'</w:t></w:r></w:p></w:tc>' for v in row)+'</w:tr>'
    xml='<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:t>Receipt measures</w:t></w:r></w:p><w:tbl>'+cells(['Measure','2025-26','2026-27'])+cells(['','$m','$m'])+cells(['Example programme','nfp','..'])+cells(['Other measure','-','*'])+'</w:tbl></w:body></w:document>'
    bio=BytesIO()
    with zipfile.ZipFile(bio,'w') as z:z.writestr('word/document.xml',xml)
    rows=parse_docx_measures(bio.getvalue(),d)
    assert rows[0]['cells']==['Example programme','nfp','..']
    assert rows[1]['cells']==['Other measure','-','*']
    assert all(r['table_id']=='DOCX table 1' and r['sha256']==d['receipt']['sha256'] for r in rows)
    d['status']='held'
    assert parse_docx_measures(b'not a zip',d)==[]


def test_truncated_year_heading_is_rejected_and_singular_caption_is_parsed():
    d,f=document('bp1-2023','2023-24')
    assert parse_page(f['pages'][0]['text'],d,15)==[]
    rows=parse_page(f['pages'][1]['text'],d,90)
    assert {r['metric']:r['value'] for r in rows if r['fiscal_year']=='2023-24'}=={'underlying_cash_balance':-13.9,'receipts':668.1,'payments':682.1,'net_debt':574.9}


def test_myefo_metric_subrows_do_not_confuse_percentages_with_budget_comparisons():
    d,f=document('myefo-2021','2021-22','myefo')
    rows=parse_page(f['pages'][0]['text'],d,54)
    assert len(rows)==32
    assert {(r['metric'],r['vintage']):r['value'] for r in rows if r['fiscal_year']=='2021-22'}=={
        ('underlying_cash_balance','MYEFO'):-99.2,('underlying_cash_balance','Budget comparison'):-106.6,
        ('receipts','MYEFO'):532.1,('receipts','Budget comparison'):482.1,
        ('payments','MYEFO'):631.4,('payments','Budget comparison'):588.7,
        ('net_debt','MYEFO'):673.4,('net_debt','Budget comparison'):729.0}


def test_pefo_columns_keep_their_actual_release_label():
    d,f=document('myefo-2016','2016-17','myefo')
    rows=[r for page in f['pages'] for r in parse_page(page['text'],d,page['page'])]
    assert [(r['vintage'],r['value']) for r in rows if r['metric']=='receipts' and r['fiscal_year']=='2016-17']==[('PEFO comparison',411.3),('MYEFO',407.4)]
    assert all(r['status']=='projection' for r in rows if r['fiscal_year']=='2018-19')


def test_myefo_medium_term_gdp_only_column_never_becomes_dollars():
    d,f=document('myefo-2025','2025-26','myefo')
    rows=parse_page(f['pages'][0]['text'],d,59)
    assert len(rows)==48
    assert not any(r['fiscal_year']=='2035-36' for r in rows)
    assert {(r['metric'],r['vintage']):r['value'] for r in rows if r['fiscal_year']=='2025-26'}[('receipts','MYEFO')]==749.8
    assert all(r['status']=='estimate' for r in rows)


def test_source_refusal_retains_receipt_and_never_reaches_document_ingest(tmp_path,monkeypatch):
    from parli.ingest.http import SourceRefused
    from parli.ingest.honest_http import Refused,HonestHTTP
    from scripts.budget_registry.acquire import ReceiptHTTP
    monkeypatch.setenv('OPAX_SOURCE_STATUS_FILE',str(tmp_path/'access.json'))
    def refuse(*_args,**_kwargs):raise SourceRefused('https://example.test/record','challenge/WAF page')
    monkeypatch.setattr(HonestHTTP,'get',refuse)
    client=ReceiptHTTP(tmp_path)
    with pytest.raises(Refused,match='challenge/WAF page'):client.get('https://example.test/record')
    receipt=client.receipt('https://example.test/record')
    assert receipt['status']=='held' and receipt['reason']=='challenge/WAF page'
    assert 'example.test' in client.paused_hosts
    with pytest.raises(Refused,match='earlier refusal'):client._request('https://example.test/next')


def test_word_nonbreaking_hyphens_are_part_of_the_financial_year_header():
    from scripts.budget_registry.parse import word_text,W
    from xml.etree import ElementTree as ET
    p=ET.fromstring('<w:p xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:r><w:t>2025</w:t><w:noBreakHyphen/><w:t>26</w:t></w:r></w:p>')
    assert word_text(p)=='2025‑26'


@pytest.mark.parametrize('allowed', [True, False])
def test_receipt_records_actual_identity_robots_order_and_request_spacing(tmp_path, monkeypatch, allowed):
    import io
    import hashlib
    from parli.ingest import honest_http, http
    from scripts.budget_registry.acquire import ReceiptHTTP
    clock = [100.0]
    monkeypatch.setattr(honest_http.time, 'monotonic', lambda: clock[0])
    monkeypatch.setattr(honest_http.time, 'sleep', lambda seconds: clock.__setitem__(0, clock[0] + seconds))
    calls = []
    class Response(io.BytesIO):
        headers = {'Content-Type': 'text/plain'}
        def getcode(self): return 200
        def geturl(self): return self.url
    class Opener:
        def open(self, request, **_):
            calls.append(request.full_url)
            rules = f'User-agent: *\nCrawl-delay: 2\n{"Allow: /" if allowed else "Disallow: /"}\n'.encode()
            response = Response(rules if request.full_url.endswith('/robots.txt') else b'original fixture')
            response.url = request.full_url
            return response
    monkeypatch.setattr(http, 'build_opener', lambda *_: Opener())
    client = ReceiptHTTP(tmp_path)
    url = 'https://example.test/paper'
    if not allowed:
        with pytest.raises(honest_http.Refused, match='robots.txt disallows'): client.get(url)
        assert calls == ['https://example.test/robots.txt']
        assert client.receipt(url)['robots']['decision'] == 'disallowed'
        return
    assert client.get(url) == b'original fixture'
    robots, receipt = client.receipt(calls[0]), client.receipt(url)
    request = receipt['requests'][0]
    assert request['user_agent_policy'] == 'parli/ingest/user-agent.json'
    assert request['user_agent_sha256'] == hashlib.sha256(http.USER_AGENT.encode()).hexdigest()
    assert request['robots']['decision'] == 'allowed'
    assert request['robots']['sha256'] == robots['sha256']
    assert request['robots']['snapshot'] == robots['snapshot']
    assert request['previous_started_at'] == robots['requests'][0]['started_at']
    assert request['interval_seconds'] == request['minimum_interval_seconds'] == 2
    assert client.get(url) == b'original fixture'
    assert calls == ['https://example.test/robots.txt', url]


def test_receipt_refresh_preserves_hash_join_and_requires_empty_cache(tmp_path):
    from scripts.budget_registry.refresh_receipts import refresh, refresh_provenance
    old = {'url': 'https://example.test/paper', 'status': 200, 'snapshot': 'old', 'sha256': 'a' * 64}
    fresh = {**old, 'snapshot': 'new', 'user_agent_policy': 'parli/ingest/user-agent.json'}
    row = {'source_url': old['url'], 'sha256': old['sha256'], 'snapshot': 'old'}
    updated = refresh_provenance({'receipt': old, 'rows': [row, {**row, 'sha256': 'b' * 64}]}, {old['url']: fresh})
    assert updated['receipt'] == fresh
    assert updated['rows'][0]['snapshot'] == 'new'
    assert updated['rows'][1]['snapshot'] == 'old'
    cache = tmp_path / 'cache'
    cache.mkdir()
    (cache / 'previous').write_text('cached bytes')
    with pytest.raises(ValueError, match='fresh empty cache'): refresh(tmp_path, cache)


def test_receipt_refresh_holds_newly_restricted_document_before_staged_writes(tmp_path, monkeypatch):
    from scripts.budget_registry import refresh_receipts as repair
    stage = tmp_path / 'stage'
    stage.mkdir()
    old = {'url': 'https://example.test/paper.pdf', 'status': 200, 'snapshot': 'old', 'sha256': 'a' * 64}
    (stage / 'receipts.json').write_text(json.dumps([old]))
    (stage / 'inventory.json').write_text(json.dumps({'documents': [{'url': old['url'], 'licence': {'url': 'https://creativecommons.org/licenses/by/4.0/'}}]}))
    before = {p.name: p.read_bytes() for p in stage.iterdir()}
    class Client:
        def __init__(self, cache): self.robots = {}
        def get(self, url): return b'newly restricted original'
        def receipt(self, url): return {**old, 'snapshot': 'new'}
    monkeypatch.setattr(repair, 'ReceiptHTTP', Client)
    monkeypatch.setattr(repair, 'pdf_rights', lambda _: {'status': 'blocked'})
    with pytest.raises(ValueError, match='rights changed; hold'): repair.refresh(stage, tmp_path / 'fresh-cache')
    assert {p.name: p.read_bytes() for p in stage.iterdir()} == before


def test_archive_link_mismatch_cannot_move_a_paper_into_the_wrong_year():
    from scripts.budget_registry.acquire import normalize_document_years
    documents=[{'year':'2019-20','release':'2019-20','kind':'bp1','title':'Publisher index label','url':'https://archive.budget.gov.au/2018-19/bp1/bp1.pdf'},
               {'year':'2015-16','release':'2015-16','kind':'pbs','title':'Treasury PBS','url':'https://treasury.gov.au/sites/default/files/2019-03/PBS.pdf'}]
    normalize_document_years(documents)
    assert documents[0]['year']=='2018-19' and documents[0]['release']=='2018-19'
    assert documents[0]['index_year']=='2019-20' and documents[0]['index_title']=='Publisher index label'
    assert documents[1]['year']=='2015-16' # Treasury migration/upload month is not a fiscal year.


def test_october_budgets_have_the_just_completed_year_as_actual():
    for name,year in [('bp1-2020-21','2020-21'),('bp1-2022-23-october','2022-23')]:
        d,f=document(name,year)
        if 'october' in name:d['release']='2022-23-october'
        rows=parse_page(f['pages'][0]['text'],d,f['pages'][0]['page'])
        preceding=f'{int(year[:4])-1}-{year[2:4]}'
        assert len([r for r in rows if r['fiscal_year']==preceding and r['status']=='actual'])>=3
        assert all(r['status']=='estimate' for r in rows if r['fiscal_year']==year)


# MYEFO 2020-21 p41 and MYEFO 2015-16 p11 as PyMuPDF prints them (sorted text): the sentences under each table
# start with a metric's name (contracts-grants-003).
MYEFO_2020_P41 = '''Table 3.2: Australian Government general government sector budget aggregates
(continued)
                                                                 Estimates
                                                2022-23                    2023-24
                                            Budget     MYEFO      Budget     MYEFO
                                              $b           $b          $b           $b

Receipts                                        482.6          487.1        526.4          526.3
Per cent of GDP                                    23.0           23.1          23.9           23.8
Payments(a)                                    570.5          571.4        593.3          592.2

Compared to the 2020-21 Budget, payments are expected to decrease by $6.5 billion to
$670.9 billion (33.4 per cent of GDP) in 2020-21, and then decrease to $592.2 billion
(26.8 per cent of GDP) in 2023-24.

Receipts are expected to increase to $473.1 billion (23.6 per cent of GDP) in 2020-21,
increasing to $526.3 billion (23.8 per cent of GDP) in 2023-24.
'''
MYEFO_2015_P11 = '''Table 1.1: Budget aggregates
                                                                          Projections
                                                     2017-18                 2018-19
                                                  Budget   MYEFO      Budget   MYEFO
 Underlying cash balance($b)(a)                          -14.4        -23.0           -6.9        -14.2
 Per cent of GDP                                               -0.8          -1.3           -0.4          -0.7
(a) Excludes expected net Future Fund earnings.

Net debt is projected to peak at 18.5 per cent of GDP in 2017-18 and then decline over
the medium term.
'''


def test_sentences_that_start_with_a_metric_name_are_never_table_rows():
    d, _ = document('myefo-2021', '2020-21', 'myefo')
    rows = parse_page(MYEFO_2020_P41, d, 41)
    receipts = {(r['fiscal_year'], r['vintage']): r['value'] for r in rows if r['metric'] == 'receipts'}
    assert receipts == {('2022-23', 'Budget comparison'): 482.6, ('2022-23', 'MYEFO'): 487.1,
                        ('2023-24', 'Budget comparison'): 526.4, ('2023-24', 'MYEFO'): 526.3}
    d, _ = document('myefo-2015', '2015-16', 'myefo')
    rows = parse_page(MYEFO_2015_P11, d, 11)
    assert {r['metric'] for r in rows} == {'underlying_cash_balance'}


def test_prose_tail_rejects_words_years_and_percentages_but_keeps_cells():
    from scripts.budget_registry.parse import prose_tail
    assert not prose_tail('   482.6   487.1   526.4   526.3')
    assert not prose_tail('(a)   -35.1   -37.4')
    assert prose_tail('are expected to increase to $473.1 billion')
    assert prose_tail('18.5 2017-18')
    assert prose_tail('18.5 per cent')


def test_promotion_rejects_a_value_three_times_off_its_cross_vintage_median():
    from scripts.promote_hub_data import budget_outliers
    def row(value, unit='AUD billion', release='2016-17', metric='net_debt'):
        return {'metric': metric, 'fiscal_year': '2017-18', 'value': value, 'unit': unit, 'vintage': 'MYEFO',
                'release': release, 'table_id': 'Table 1.1', 'pdf_page': 11}
    rows = [row(336404, 'AUD million', '2015-16'), row(341.0), row(342.0, release='2017-18'), row(350.1, release='2018-19')]
    assert budget_outliers(rows) == []
    rows[0] = row(18.5, release='2015-16')
    assert budget_outliers(rows) == ['net_debt 2017-18 MYEFO 2015-16 = 18.5 AUD billion (Table 1.1, p11) against a median of 341.5 AUD billion']
    # the cash balance crosses zero, so it is never judged by ratio
    assert budget_outliers([row(v, metric='underlying_cash_balance') for v in (-0.5, -9.0, 4.2)]) == []
