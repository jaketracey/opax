"""Official HTML layouts, using small synthetic agency/campaign amounts only."""
import copy
import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

from scripts.gov_advertising.victoria import matrices, observations, projection, public_supplier, WITHHELD, checked_projection
from scripts.gov_advertising.stage import sha, ROOT
from scripts.gov_advertising.acquire import fetch
from scripts.promote_hub_data import promote, ASSETS, DEFAULT_HUBS
from scripts.gov_advertising.stage_victoria import year_of
from scripts.gov_advertising.privacy import review_text


def document():
    from test_gov_advertising import fixture
    d=fixture();d.update(id='synthetic-vic',jurisdiction='VIC',url='https://www.vic.gov.au/victorian-government-advertising-report-2024-25/example',financial_year='2024-25')
    d['licence'].update(policy_url='https://www.vic.gov.au/copyright',attribution='© Copyright State Government of Victoria')
    return d


def table(html):
    t=matrices(html.encode())[0]
    t.update(document_id='synthetic-vic',basis="Advertising expenditure is reported as 'Net' (excluding GST)",scope='Campaign media advertising',status='reviewed')
    t['sha256']=sha(json.dumps(t['rows'],ensure_ascii=False,separators=(',',':')).encode())
    return t


HISTORICAL='''<main><h2>Total advertising expenditure</h2><table><tr><th>Year</th><th>Campaign advertising ($m)</th><th>Functional advertising ($m)</th><th>Recruitment advertising ($m)</th><th>Annual total ($m)</th></tr><tr><td>2024-25</td><td>$1.2</td><td>$0.3</td><td>$0.1</td><td>$1.6</td></tr></table></main>'''
RANKED='''<main><h2>Top advertisers by campaign expenditure</h2><table><tr><th>Rank</th><th>Advertiser</th><th>Example campaigns</th><th>Advertising expenditure (ex. GST)</th></tr><tr><td>1</td><td>Department of Example Services</td><td>Example information; Example awareness</td><td>$1,234</td></tr></table></main>'''


def private_description_fixture():
    source=(ROOT/'tests/fixtures/gov-advertising/advertiser-private.html').read_text()
    t=table(source);d=document()
    hub=projection({'generated_at':'2026-10-18T00:00:00Z','documents':[d]},[t])
    return {'tables':[t],'hub':hub}


class VictorianAdvertisingTests(unittest.TestCase):
    def test_report_year_never_comes_from_an_attachment_upload_month(self):
        self.assertEqual(year_of('/sites/default/files/2018-12/Advertising-Report-2011-2012.pdf'),'2011-12')
        self.assertEqual(year_of('/sites/default/files/2024-04/Advertising-Report-2022-23.DOCX'),'2022-23')
        self.assertIsNone(year_of('Uploaded 2024-04'))

    def test_official_campaign_cost_layout_keeps_markers_periods_and_spaced_amount(self):
        html='<main><h2>Example Services Agency – Example awareness</h2><h3>Duration</h3><p>January – December 2018*</p><table><tr><td>Campaign advertising expenditure</td><td>$ (excluding GST)</td></tr><tr><td>Media advertising buy</td><td>1, 234</td></tr><tr><td>Print and collateral</td><td>N/A</td></tr></table><p>* Source covers the calendar year.</p></main>'
        t=table(html);rows,checks=observations(t,document())
        self.assertEqual(rows[0]['entity'],'Example Services Agency')
        self.assertEqual(rows[0]['campaign'],'Campaign cost categories (title withheld)')
        self.assertEqual(rows[0]['campaign_period'],'January – December 2018*')
        self.assertEqual(rows[0]['period_note'],'Source note withheld pending review')
        self.assertEqual(rows[0]['total_cents'],123400);self.assertEqual(rows[0]['source_value'],'1, 234')
        self.assertIsNone(rows[1]['total_cents']);self.assertEqual(rows[1]['source_value'],'N/A')
        self.assertEqual(checks,[])

    def test_official_historical_layout_totals_units_coordinates_and_gst(self):
        rows,checks=observations(table(HISTORICAL),document())
        self.assertEqual(len(rows),4)
        self.assertEqual(rows[-1]['record_kind'],'published total')
        self.assertEqual(rows[-1]['total_cents'],160000000)
        self.assertEqual(rows[0]['unit'],'AUD million')
        self.assertEqual(rows[0]['basis'],"Advertising expenditure is reported as 'Net' (excluding GST)")
        self.assertEqual(rows[-1]['source_locator'],'HTML table 1 row 2 column 5')
        self.assertTrue(all(c['status']=='pass' for c in checks))
        self.assertEqual(checks[0]['difference_cents'],0)

    def test_advertiser_examples_share_one_amount_no_invented_total_or_campaign_costs(self):
        t=table(RANKED);t['basis']='Advertising expenditure (ex. GST)'
        rows,checks=observations(t,document())
        self.assertEqual(len(rows),1);self.assertEqual(checks,[])
        self.assertEqual(rows[0]['entity'],'Department of Example Services')
        self.assertEqual(rows[0]['campaign'],'Advertiser description withheld pending review')
        self.assertEqual(rows[0]['total_cents'],123400)
        self.assertEqual(rows[0]['basis'],'Advertising expenditure (ex. GST)')

    def test_invented_person_in_advertiser_description_never_enters_any_projection(self):
        f=private_description_fixture()
        for output in (f['tables'],f['hub'],f['hub']['rows'],f['hub']['documents']):
            self.assertNotIn('Avery Fenwick',json.dumps(output))
        self.assertEqual(f['hub']['rows'][0]['total_cents'],123400)
        self.assertEqual(f['hub']['privacy']['held_fields']['advertiser_description'],1)
        self.assertTrue(any(h['field']=='advertiser_description' and len(h['sha256'])==64 for h in f['tables'][0]['privacy_holds']))

    def test_every_report_text_role_is_default_denied_not_just_campaign_titles(self):
        roles=('advertiser_description','campaign_title','period_note','campaign_period','basis','scope','table_heading','organisation','category','summary','publication_title')
        for role in roles:
            holds=[];value=review_text('Avery Fenwick',role,holds,'synthetic field')
            self.assertNotIn('Avery Fenwick',value)
            self.assertEqual(holds[0]['status'],'held')
            self.assertNotIn('Avery Fenwick',json.dumps(holds))

    def test_projection_rechecks_caller_supplied_text_instead_of_trusting_review_flag(self):
        t=table(RANKED);t['rows'][1][2]='Avery Fenwick'
        t['sha256']=sha(json.dumps(t['rows'],ensure_ascii=False,separators=(',',':')).encode())
        h=projection({'generated_at':'2026-10-18','documents':[document()]},[t])
        self.assertNotIn('Avery Fenwick',json.dumps(h))

    def test_published_discrepancy_is_recorded_without_changing_figures(self):
        rows,checks=observations(table(HISTORICAL.replace('$1.6','$2.6')),document())
        self.assertEqual(rows[-1]['total_cents'],260000000)
        self.assertEqual(checks[0]['status'],'source discrepancy')
        self.assertEqual(checks[0]['difference_cents'],-100000000)

    def test_unknown_markers_and_merged_layouts_not_guessed(self):
        with self.assertRaisesRegex(ValueError,'marker'):
            observations(table(HISTORICAL.replace('$1.2','nfp')),document())
        t=matrices(HISTORICAL.replace('<th>Year','<th colspan="2">Year').encode())[0]
        self.assertEqual(t['rows'],[]);self.assertIn('Merged',t['hold'])

    def test_document_licence_gate_precedes_table_access_and_held_file_never_exports(self):
        d=document();d['licence']['status']='held'
        self.assertEqual(observations({},d),([],[]))
        h=projection({'generated_at':'2026-10-19','documents':[d]},[{'document_id':d['id'],'status':'reviewed','private_field':'HELD FILE SENTINEL'}])
        self.assertEqual(h['rows'],[]);self.assertEqual(h['documents'],[])
        self.assertNotIn('HELD FILE SENTINEL',json.dumps(h))

    def test_private_and_sole_trader_suppliers_withheld_by_default(self):
        for kind in (None,'individual','sole trader','organisation'):
            self.assertEqual(public_supplier('PRIVATE SUPPLIER SENTINEL',kind),WITHHELD)
        self.assertEqual(public_supplier('Example Services Pty Ltd','organisation'),'Example Services Pty Ltd')
        rows,_=observations(table(RANKED.replace('</tr><tr>', '<th>Supplier</th></tr><tr>').replace('</td></tr>', '</td><td>PRIVATE SUPPLIER SENTINEL</td></tr>')),document())
        self.assertNotIn('PRIVATE SUPPLIER SENTINEL',json.dumps(rows))
        self.assertEqual(rows[0]['supplier'],WITHHELD)

    def test_review_gate_leaves_existing_asset_and_votes_untouched(self):
        import shutil
        with tempfile.TemporaryDirectory(prefix='opax-vic-promotion-') as folder:
            root=Path(folder);shutil.copytree(ROOT/'data/staged/vic-advertising',root/'data/staged/vic-advertising')
            target=root/'portal/public'/ASSETS['vic-advertising'];target.parent.mkdir(parents=True);target.write_text('LAST APPROVED SNAPSHOT')
            (root/'portal/public/votes.json').write_text('{"_meta":{"schema":1}}')
            before=(root/'portal/public/votes.json').read_bytes()
            review=root/'data/staged/vic-advertising/review.json';review.write_text('{"status":"pending"}')
            self.assertEqual(promote(['vic-advertising'],root),1)
            self.assertEqual(target.read_text(),'LAST APPROVED SNAPSHOT')
            self.assertEqual((root/'portal/public/votes.json').read_bytes(),before)
            self.assertNotIn('vic-advertising',DEFAULT_HUBS)

    def test_document_paths_blocked_without_a_network_request(self):
        with tempfile.TemporaryDirectory(prefix='opax-vic-robots-') as folder:
            root=Path(folder);cache=root/'portal/private/vic-advertising/source';cache.mkdir(parents=True)
            (cache/'robots.txt').write_text('User-agent: *\nDisallow: /sites/default/files/*.doc\n')
            stage=root/'data/staged/vic-advertising';stage.mkdir(parents=True)
            url='https://www.vic.gov.au/sites/default/files/2026-01/example.DOCX'
            (stage/'discovery.json').write_text(json.dumps({url:'Example plan'}))
            with patch('urllib.request.build_opener',side_effect=AssertionError('Network called')):
                with self.assertRaisesRegex(ValueError,'extension family'):
                    fetch(url,'example.docx',root)

    def test_victorian_refusal_receipt_persists_stop_without_retaining_body(self):
        from io import BytesIO
        from unittest.mock import MagicMock
        from urllib.error import HTTPError
        with tempfile.TemporaryDirectory(prefix='opax-vic-refusal-') as folder:
            root=Path(folder);url='https://www.vic.gov.au/robots.txt'
            body=b'<html><title>Access denied</title><script src="/cdn-cgi/challenge-platform/test"></script></html>'
            opener=MagicMock();opener.open.side_effect=HTTPError(url,403,'Forbidden',{},BytesIO(body))
            with patch('urllib.request.build_opener',return_value=opener):
                with self.assertRaisesRegex(ValueError,'STOP'):fetch(url,'robots.txt',root)
            receipt=json.loads((root/'data/staged/vic-advertising/receipts.json').read_text())[0]
            self.assertEqual(receipt['status'],403);self.assertEqual(receipt['sha256'],sha(body))
            self.assertFalse(receipt['body_retained'])
            self.assertEqual(list((root/'portal/private/vic-advertising/source').iterdir()),[])
            with patch('urllib.request.build_opener',side_effect=AssertionError('Refused source retried')):
                with self.assertRaisesRegex(ValueError,'source held'):fetch(url,'robots.txt',root)


if __name__=='__main__':unittest.main()
