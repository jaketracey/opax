"""Local candidate browser proof. Start preview.mjs explicitly; no external URLs."""
import json
from pathlib import Path
from playwright.sync_api import sync_playwright

ROOT=Path(__file__).resolve().parents[2]
OUT=ROOT/'portal/private/sa-grants'
ORIGIN='http://[::1]:8978/'


def main():
    with sync_playwright() as p:
        browser=p.chromium.launch(channel='chrome',headless=True)
        for width in (390,1440):
            page=browser.new_page(viewport={'width':width,'height':1000},device_scale_factor=1)
            page.route('**/*',lambda route:route.continue_() if route.request.url.startswith(ORIGIN) else route.abort())
            errors=[]
            page.on('pageerror',lambda e:errors.append(str(e)))
            response=page.goto(ORIGIN+'register/sa-grants',wait_until='networkidle')
            assert response.status==200
            assert 'Page not found' not in page.locator('main').inner_text()
            table=page.locator('[data-sa-grants-table]').first
            def metrics():
                return table.evaluate('''el=>({pageWidth:document.documentElement.scrollWidth,viewport:innerWidth,cells:[...el.querySelectorAll('tbody tr:first-child td')].filter(c=>getComputedStyle(c).display!=='none').map(c=>({label:c.dataset.label,left:c.getBoundingClientRect().left,right:c.getBoundingClientRect().right,whiteSpace:getComputedStyle(c).whiteSpace}))})''')
            result=metrics()
            assert result['pageWidth']==width
            visible={c['label']:c for c in result['cells']}
            assert all(key in visible for key in ('Recipient','Year','Amount'))
            assert visible['Year']['whiteSpace']=='nowrap'
            page.locator('.sa-grants-content>section').first.screenshot(path=str(OUT/f'{width}-section.png'))
            if width==390:
                assert visible['Amount']['right']<=390
                table.locator('.dt-scroll').screenshot(path=str(OUT/'390-table-crop.png'))
                table.locator('[data-sort-select]').select_option('amount:desc')
                page.wait_for_timeout(150)
                after=metrics()
                assert {c['label'] for c in after['cells']}=={'Recipient','Year','Amount'}
                assert next(c for c in after['cells'] if c['label']=='Amount')['right']<=390
            assert not errors
            (OUT/f'{width}-metrics.json').write_text(json.dumps(dict(status=response.status,errors=errors,**result),indent=2)+'\n')
            print(json.dumps(dict(width=width,status=response.status,page_width=result['pageWidth'],year_nowrap=True,amount_visible=True,errors=errors)))
            page.close()
        page=browser.new_page(viewport={'width':390,'height':844},java_script_enabled=False)
        page.route('**/*',lambda route:route.continue_() if route.request.url.startswith(ORIGIN) else route.abort())
        assert page.goto(ORIGIN+'register/sa-grants').status==200
        assert page.locator('tbody [data-label="Year"]').first.is_visible()
        assert page.locator('tbody [data-label="Amount"]').first.is_visible()
        browser.close()
        print('No-JavaScript phone rendering passed')


if __name__=='__main__':main()
