// The GO7867 program view on Money → Grants in headless Chrome (web/reports-off, 19 Oct 2026):
// "Invited projects" and the Centre for Public Integrity note under "What the record says",
// at 1440 and 390 wide, nothing wider than the screen at 390.
//
//   PLAYWRIGHT_CORE=/path/to/playwright-core/index.mjs node test/go7867-browser.mjs [--shots]
//
// The page is this branch's Worker over public/ (worker-harness, offline: model, auth and
// network calls are refused), served on 127.0.0.1:8964. The data is the real mlci.json:
// council and organisation projects from a tabled departmental list, no private people.
// --shots writes portal/private/go7867/{invited,cpi-note}-{1440,390}.png.
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {mkdirSync, readFileSync, existsSync} from 'node:fs';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {offline, loadWorker} from './worker-harness.mjs';

const pub = fileURLToPath(new URL('../public/', import.meta.url));
const port = Number(process.env.GO7867_PORT || 8964);
const base = `http://127.0.0.1:${port}`;
const shots = process.argv.includes('--shots');
const outDir = fileURLToPath(new URL('../private/go7867/', import.meta.url));
if (shots) mkdirSync(outDir, {recursive: true});

offline();
const {fetch: worker} = await loadWorker(fileURLToPath(new URL('../src/index.ts', import.meta.url)), pub);
const types = {'.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.woff': 'font/woff', '.webp': 'image/webp', '.png': 'image/png'};
const server = createServer(async (req, res) => {
  try {
    const path = new URL(req.url, base).pathname, asset = join(pub, path);
    const ext = /\.[a-z0-9]+$/.exec(path)?.[0];
    if (!path.startsWith('/api/') && ext && types[ext] && existsSync(asset)) { res.writeHead(200, {'content-type': types[ext]}); res.end(readFileSync(asset)); return; }
    const response = await worker(req.url, {method: req.method, headers: req.headers});
    res.writeHead(response.status, Object.fromEntries(response.headers)); res.end(Buffer.from(await response.arrayBuffer()));
  } catch { res.writeHead(500); res.end('Local preview unavailable'); }
});
await new Promise(done => server.listen(port, '127.0.0.1', done));

const {chromium} = await import(process.env.PLAYWRIGHT_CORE || 'playwright-core');
const browser = await chromium.launch({channel: 'chrome', headless: true, args: ['--mute-audio']});
const results = [];
try {
  for (const [width, height] of [[1440, 1000], [390, 844]]) {
    const context = await browser.newContext({viewport: {width, height}, deviceScaleFactor: 2, reducedMotion: 'reduce'});
    // Nothing leaves the machine.
    await context.route('**/*', route => new URL(route.request().url()).origin === base ? route.fallback() : route.abort());
    const pg = await context.newPage();
    await pg.goto(`${base}/money/grants?jur=federal&program=GO7867`, {waitUntil: 'domcontentloaded'});
    await pg.waitForSelector('.gr-invited table', {timeout: 30000});
    await pg.waitForSelector('.gr-research .gr-compare li', {timeout: 30000});
    const state = await pg.evaluate(() => {
      const invited = document.querySelector('.gr-invited');
      const note = document.querySelector('.gr-research');
      const box = el => { const r = el.getBoundingClientRect(); return {left: r.left, right: r.right, width: r.width}; };
      // Anything wider than the screen, outside the program view's own sideways-scrolling table regions.
      const wide = [...document.querySelectorAll('.gr-invited *, .gr-summary-note *')]
        .filter(el => el.getBoundingClientRect().right > innerWidth + 0.5 && !el.closest('.gr-scroll'))
        .map(el => el.className || el.tagName);
      const scroller = invited.querySelector('.gr-scroll');
      return {
        kicker: invited.querySelector('.gr-kicker').textContent,
        lede: invited.querySelector('.gr-invited-lede').textContent,
        rows: invited.querySelectorAll('tbody tr').length,
        more: invited.querySelector('.gr-more-rows')?.textContent || null,
        bars: note.querySelectorAll('.gr-compare .gr-bar-cell').length,
        cite: note.querySelector('.gr-audits a')?.href || null,
        invited: box(invited), note: box(note), wide,
        tableScrolls: scroller.scrollWidth > scroller.clientWidth + 1,
        docWidth: document.documentElement.scrollWidth, innerWidth,
      };
    });
    assert.equal(state.kicker, 'Invited projects (227)', `${width}`);
    assert.match(state.lede, /invited to apply, not awarded/, `${width}`);
    assert.equal(state.rows, 24, `${width}`);
    assert.equal(state.more, 'Show all 227 invited projects', `${width}`);
    assert.equal(state.bars, 12, `${width}: six pairs of bars`);
    assert.match(state.cite || '', /publicintegrity\.org\.au/, `${width}`);
    if (width === 390) {
      assert.deepEqual(state.wide, [], '390: nothing in either section runs past the screen');
      assert.ok(state.invited.right <= state.innerWidth + 0.5 && state.note.right <= state.innerWidth + 0.5, '390: both sections sit inside the screen');
      assert.ok(state.docWidth <= state.innerWidth, `390: the page does not scroll sideways (${state.docWidth} > ${state.innerWidth})`);
    }
    if (shots) {
      // The site band, the results line and the programs table's header row are sticky; let
      // every sticky or fixed element scroll away so none sits over a section in the picture.
      // The programs table also scrolls inside a box of its own: open it to full height so the
      // pictures show each section whole, as a reader scrolling the box sees it.
      await pg.evaluate(() => {
        for (const el of document.querySelectorAll('*')) if (/^(sticky|fixed)$/.test(getComputedStyle(el).position)) el.style.setProperty('position', 'static', 'important');
        for (let el = document.querySelector('.gr-invited'); el; el = el.parentElement) {
          const cs = getComputedStyle(el);
          if (/(auto|scroll|hidden)/.test(cs.overflowY) || cs.maxHeight !== 'none') { el.style.setProperty('max-height', 'none', 'important'); el.style.setProperty('overflow', 'visible', 'important'); }
        }
      });
      await pg.locator('.gr-invited').screenshot({path: `${outDir}invited-${width}.png`});
      await pg.locator('.gr-summary-note').screenshot({path: `${outDir}cpi-note-${width}.png`});
    }
    // Show all reveals every row.
    await pg.click('.gr-invited .gr-more-rows');
    assert.equal(await pg.locator('.gr-invited tbody tr').count(), 227, `${width}: Show all`);
    results.push({width, ...state});
    await context.close();
  }
} finally {
  await browser.close();
  await new Promise(done => server.close(done));
}
for (const r of results) console.log(`${r.width}: ${r.kicker}; ${r.rows} rows then Show all; ${r.bars / 2} comparison rows; table scrolls sideways: ${r.tableScrolls}; page width ${r.docWidth}/${r.innerWidth}`);
console.log('go7867-browser: ok');
