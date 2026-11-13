// WCAG 2.2 AA structure checks over the pages added since October, as the
// Worker serves them (before the app boots): language, one main landmark, a
// skip link to a real target, one h1, no skipped heading levels, a name on
// every link and button, a label on every field, alt on every image, and ARIA
// references that resolve. Offline: any network call fails the run.
// Needs the built hubs and Victorian election data (`npm run build:hubs`,
// `npm run build:vic-election`), as estimates-browse and vic-election do.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { JSDOM } from 'jsdom';
import { workerFetch } from './helpers/worker-fetch.mjs';

const outbound = [];
globalThis.fetch = async input => { outbound.push(String(input?.url ?? input)); throw new Error('network disabled'); };

const PAGES = [
  '/press', '/money/explain', '/connections', '/map',
  '/vic-election-2026', '/vic-election-2026/lowan',
  '/sitting', '/sitting/2026-10-26',
  '/estimates', '/estimates/2026-10',
  '/audit', '/audit/qao-2026-27-1',
  '/subject/party/libertarian-party', '/subject/donor/Clubs%20NSW',
  '/budget', '/register/vic-gifts', '/register/state-bills', '/register/gov-advertising',
  '/register/tax-expenditures', '/register/government-finance', '/video/senate',
];
// The app shell's chat panel is restored into main by spa-shell.js before its
// (hidden) launcher can be shown, so server HTML may name it without holding it.
const RESTORED_BY_SHELL = new Set(['panel-chat']);

async function page(path) {
  const response = await workerFetch(path);
  assert.equal(response.status, 200, path);
  return new JSDOM(await response.text()).window.document;
}
const accessibleName = el => (el.getAttribute('aria-label') || '').trim()
  || (el.getAttribute('aria-labelledby') || '').split(/\s+/).map(id => el.ownerDocument.getElementById(id)?.textContent || '').join(' ').trim()
  || el.textContent.trim() || [...el.querySelectorAll('img[alt]')].map(img => img.alt).join(' ').trim()
  || (el.getAttribute('title') || '').trim();
const labelled = field => (field.getAttribute('aria-label') || '').trim()
  || (field.getAttribute('aria-labelledby') || '').split(/\s+/).map(id => field.ownerDocument.getElementById(id)?.textContent || '').join(' ').trim()
  || (field.id && field.ownerDocument.querySelector(`label[for="${field.id}"]`)?.textContent.trim())
  || field.closest('label')?.textContent.trim() || (field.getAttribute('title') || '').trim();

for (const path of PAGES) test(`${path}: landmarks, headings, names, labels and references`, async () => {
  const doc = await page(path);
  assert.match(doc.documentElement.lang, /^en\b/, 'lang');
  assert.equal(doc.querySelectorAll('main, [role="main"]').length, 1, 'one main landmark');
  const skip = doc.querySelector('a[data-skip-link], a[data-skip]');
  assert.ok(skip, 'skip link');
  assert.ok(doc.getElementById(skip.getAttribute('href').slice(1)), 'skip link target exists');
  const h1s = [...doc.querySelectorAll('h1')].filter(h => !h.closest('[hidden]'));
  assert.equal(h1s.length, 1, `one h1, found: ${h1s.map(h => h.textContent.trim()).join(' | ')}`);
  let previous = 0;
  for (const h of doc.querySelectorAll('h1, h2, h3, h4, h5, h6')) {
    if (h.closest('[hidden], footer')) continue;
    const level = Number(h.tagName[1]);
    assert.ok(!previous || level <= previous + 1, `heading h${previous} → h${level}: ${h.textContent.trim().slice(0, 60)}`);
    previous = level;
  }
  for (const el of doc.querySelectorAll('a[href], button, summary'))
    assert.ok(accessibleName(el), `named control: ${el.outerHTML.slice(0, 120)}`);
  for (const field of doc.querySelectorAll('input:not([type="hidden"]), select, textarea'))
    assert.ok(labelled(field), `labelled field: ${field.outerHTML.slice(0, 120)}`);
  for (const img of doc.querySelectorAll('img')) assert.ok(img.hasAttribute('alt'), `alt: ${img.outerHTML.slice(0, 120)}`);
  for (const attr of ['aria-labelledby', 'aria-describedby', 'aria-controls', 'for'])
    for (const el of doc.querySelectorAll(`[${attr}]`))
      for (const id of el.getAttribute(attr).split(/\s+/).filter(Boolean))
        assert.ok(doc.getElementById(id) || RESTORED_BY_SHELL.has(id), `${attr}="${id}" resolves`);
  assert.deepEqual(outbound, [], 'no network');
});

test('/map: the drawer and the map are the main landmark, and the drawer\'s headings sit under the page h1', async () => {
  const doc = await page('/map');
  const main = doc.querySelector('main');
  assert.ok(main?.querySelector('#map') && main.querySelector('#crawl-facts'), 'map and its text totals inside main');
  assert.equal(doc.body.getAttribute('data-skip-target'), 'map');
  const drawer = [...doc.querySelectorAll('#crawl-facts :is(h1, h2, h3, h4, h5, h6)')].map(h => h.tagName);
  assert.ok(drawer.length > 1);
  assert.equal(drawer[0], 'H2', 'the drawer title is an h2 under the page\'s "Money map" h1');
  assert.ok(drawer.slice(1).every(tag => tag === 'H3'), drawer.join(','));
});

// Contrast from the token values (tokens.css), WCAG 2.x relative luminance.
const tokens = Object.fromEntries([...readFileSync(new URL('../public/tokens.css', import.meta.url), 'utf8').matchAll(/--([a-z0-9-]+):\s*(#[0-9A-Fa-f]{6})\b/g)].map(m => [m[1], m[2]]));
const luminance = hex => { const [r, g, b] = [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16) / 255).map(v => v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
const contrast = (a, b) => { const [x, y] = [luminance(a), luminance(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };

test('money map legend: dimmed and switched-off chips keep AA text contrast at rest and on hover', () => {
  for (const file of ['../graph/index.ts', '../public/money-map.js']) {
    const css = readFileSync(new URL(file, import.meta.url), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
    for (const selector of [".mm-chip[data-dimmed]", ".mm-chip.mm-grants-toggle[aria-pressed='false']"]) {
      const rules = [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)].filter(([, sel]) => sel.split(',').some(s => s.trim() === selector)).map(m => m[2]);
      assert.ok(rules.length, `${file}: ${selector}`);
      for (const body of rules) assert.doesNotMatch(body, /opacity/, `${file}: ${selector} fades its words`);
      const colour = rules.map(body => /(?:^|;|\s)color:\s*var\(--([a-z-]+)\)/.exec(body)?.[1]).find(Boolean);
      assert.ok(colour && tokens[colour], `${file}: ${selector} sets a token colour`);
      for (const ground of ['paper', 'paper-raised', 'navy-wash'])
        assert.ok(contrast(tokens[colour], tokens[ground]) >= 4.5, `${selector} --${colour} on --${ground}: ${contrast(tokens[colour], tokens[ground]).toFixed(2)}`);
    }
  }
});
