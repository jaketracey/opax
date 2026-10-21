"""Local actual Worker/D1 candidate only; browser requests cannot leave loopback."""
import json
from pathlib import Path
from playwright.sync_api import sync_playwright
ROOT=Path(__file__).resolve().parents[2]
OUT=ROOT/'portal/private/act-invoices'
ORIGIN='http://[::1]:8982/'
PATH='register/act-invoices?t.pageSize=10'


def main():
    with sync_playwright() as p:
        browser=p.chromium.launch(channel='chrome',headless=True)
        for width in (390,1440):
            page=browser.new_page(viewport={'width':width,'height':1000},device_scale_factor=1)
            page.route('**/*',lambda route:route.continue_() if route.request.url.startswith(ORIGIN) else route.abort())
            errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
            response=page.goto(ORIGIN+PATH,wait_until='networkidle')
            assert response.status==200
            table=page.locator('[data-act-invoices-table]').first
            def metrics():
                return table.evaluate('''el=>({pageWidth:document.documentElement.scrollWidth,viewport:innerWidth,cells:[...el.querySelectorAll('tbody tr:first-child td')].filter(c=>getComputedStyle(c).display!=='none').map(c=>({label:c.dataset.label,left:c.getBoundingClientRect().left,right:c.getBoundingClientRect().right,whiteSpace:getComputedStyle(c).whiteSpace}))})''')
            result=metrics();assert result['pageWidth']==width
            visible={c['label']:c for c in result['cells']}
            assert all(k in visible for k in ('Supplier','Date','Amount'))
            assert visible['Date']['whiteSpace']=='nowrap'
            assert not page.locator('[data-label="Supplier"] a').count()
            assert page.locator('table caption').filter(has_text='Published invoice records').count()==1
            assert page.get_by_text('22 Oct 2026 (Melbourne)',exact=True).count()==1
            assert page.get_by_text('July 2015 to September 2026',exact=False).count()>=1
            assert '.00' not in page.locator('[data-label="Amount"]').all_text_contents()[2]
            if width==1440:
                assert 'Suburban Land Agency' in page.locator('[data-label="Reporting entity"]').all_text_contents()[4]
            page.locator('.act-invoices-content>section').first.screenshot(path=str(OUT/f'{width}-section.png'))
            if width==390:
                assert visible['Amount']['right']<=390
                table.locator('.dt-scroll').screenshot(path=str(OUT/'390-table-crop.png'))
                table.locator('[data-sort-select]').select_option('amount:desc')
                page.wait_for_timeout(500)
                after=metrics();assert {c['label'] for c in after['cells']}=={'Supplier','Date','Amount'}
                assert next(c for c in after['cells'] if c['label']=='Amount')['right']<=390
            assert not errors,errors
            (OUT/f'{width}-metrics.json').write_text(json.dumps(dict(status=response.status,errors=errors,**result),indent=2)+'\n')
            print(json.dumps(dict(width=width,status=response.status,page_width=result['pageWidth'],date_nowrap=True,amount_visible=True,errors=errors)))
            page.close()
        page=browser.new_page(viewport={'width':390,'height':844},java_script_enabled=False)
        page.route('**/*',lambda route:route.continue_() if route.request.url.startswith(ORIGIN) else route.abort())
        assert page.goto(ORIGIN+PATH).status==200
        assert page.locator('tbody [data-label="Date"]').first.is_visible()
        assert page.locator('tbody [data-label="Amount"]').first.is_visible()
        page.close()
        page=browser.new_page(viewport={'width':390,'height':844})
        page.route('**/*',lambda route:route.continue_() if route.request.url.startswith(ORIGIN) else route.abort())
        assert page.goto(ORIGIN+'register/act-invoices?t.f.supplier_abn=%5B%2200000000000%22%5D',wait_until='networkidle').status==200
        assert 'supplier_abn' not in page.url
        assert '00000000000' not in page.locator('.dt-chips').inner_text()
        browser.close()
        print('No-JavaScript phone and unsupported identity URL checks passed')


if __name__=='__main__':main()
