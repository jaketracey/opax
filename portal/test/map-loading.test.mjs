// Lane D of the web polish critique (13 Nov 2026): the money map on a phone and
// pages that settle. What a browser is needed for (the fitted graph's box, label
// rectangles, the H1's travel between frames) is measured by the capture script;
// these pin the markup, rules and server output each of those results rests on.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { JSDOM } from 'jsdom';
import { mapFallbackHTML, mapSourceHTML } from '../public/home-data.js';
import { loadWorker, offline } from './worker-harness.mjs';

const read = (path) => readFileSync(new URL(path, import.meta.url), 'utf8');
const style = read('../public/style.css');
const homeCss = read('../public/home.css');
const homeHtml = read('../public/home.html');
const mapHtml = read('../public/map.html');
const indexHtml = read('../public/index.html');
const app = read('../public/app.js');
const graphIndex = read('../graph/index.ts');
const engine = read('../graph/map3d-engine.ts');

// ---- 7. The map on a phone -------------------------------------------------

test('a phone-width map host fits the scene to the card: the zoom stack costs the bottom band and opposite insets match', () => {
  assert.match(graphIndex, /export const NARROW_HOST = 540/);
  assert.match(graphIndex, /cover\(zoom, narrow \? 'bottom' : 'right'\)/);
  assert.match(graphIndex, /if \(narrow\) \{\s*insets\.top = insets\.bottom = Math\.max\(insets\.top, insets\.bottom\)\s*insets\.left = insets\.right = Math\.max\(insets\.left, insets\.right\)/);
  // A closed key sheet (laid out, visibility:hidden) no longer pushes the scene down the /money card.
  assert.match(graphIndex, /if \(narrow && !shown\(element\)\) return/);
});

test('party names give way by size instead of overprinting, and labels are measured again once the web fonts load', () => {
  assert.match(engine, /kept\.sort\(\(a, b\) => b\.visual\.r - a\.visual\.r\)/);
  assert.match(engine, /for \(const d of direct\) \{\s*if \(d\.dropped\) continue/);
  assert.match(engine, /for \(const c of callouts\) if \(!c\.dropped\) this\.drawCallout\(c\)/);
  assert.match(engine, /fonts\?\.addEventListener\?\.\('loadingdone', this\.onFontsLoaded\)/);
  assert.match(engine, /fonts\?\.removeEventListener\?\.\('loadingdone', this\.onFontsLoaded\)/);
});

test('the homepage card on a phone is the fitted still: no zoom stack, and the link says where it goes', () => {
  const phone = homeCss.slice(homeCss.indexOf('@media (max-width: 600px)'));
  assert.match(phone.slice(0, phone.indexOf('\n}\n')), /\.hp-money-map \.mm-zoom \{ display: none; \}/);
  assert.match(homeHtml, /<a id="hp-full-map" href="\/money">Open the money map<\/a>/);
});

test('/map: the phone scrub sits under the measured legend row; /money keeps its 60 px default', () => {
  assert.match(graphIndex, /top: calc\(var\(--space-heading\) \+ var\(--mm-legend-h, 44px\)\);/);
  assert.match(graphIndex, /container\.style\.setProperty\('--mm-legend-h', `\$\{row \+ 4\}px`\)/);
  assert.match(graphIndex, /new ResizeObserver\(\(\) => reserveScrubRoom\(\)\)/);
});

test('/map loads the site faces and opens its totals in the site source line', () => {
  for (const face of ['public-sans-normal-latin', 'merriweather-normal-latin']) {
    assert.match(mapHtml, new RegExp(`@font-face \\{ font-family: '[^']+'; [^}]*src: url\\(/fonts/${face}\\.woff2\\)`));
    assert.ok(existsSync(new URL(`../public/fonts/${face}.woff2`, import.meta.url)), face);
  }
  assert.match(mapHtml, /<link rel="stylesheet" href="\/ui-source\.css\?v=[0-9a-f]{10}">/);
  assert.match(mapHtml, /<script src="\/ui-source\.js\?v=[0-9a-f]{10}" defer><\/script>/);
  const doc = new JSDOM(mapHtml).window.document;
  const pop = doc.querySelector('.map-facts > details.ui-pop.ui-source');
  assert.ok(pop, 'the disclosure is the ui-pop source line');
  assert.equal(pop.querySelector('summary .ui-source-name').textContent, 'Map totals and sources');
  assert.ok(pop.querySelector('.ui-sheet > #crawl-facts'), 'the server facts sit in its sheet');
  assert.equal(doc.querySelectorAll('details').length, 1);
});

// ---- 8. Pages that settle --------------------------------------------------

const graph = {
  meta: { coverage: 'financial years 1998-99 to 2025-26' },
  nodes: [{ id: 'd1', kind: 'donor' }, { id: 'd2', kind: 'donor' }, { id: 'd3', kind: 'donor' }, { id: 'p1', kind: 'party' }, { id: 'p2', kind: 'party' }, { id: 'g', kind: 'grantor' }],
  edges: [{ source: 'd1', target: 'p1', total: 1_200_000 }, { source: 'd2', target: 'p2', total: 300_000 }, { source: 'd2', target: 'p1', total: 50_000 },
    { source: 'g', target: 'd1', total: 9e9, grant: true }, { source: 'd3', target: 'p1', total: 7e9, flow: 'contracts' }],
};

test('the home map fallback is one short line and a link, counting donor-to-party receipts only', () => {
  const html = mapFallbackHTML(graph);
  const doc = new JSDOM(html).window.document;
  const [line, link] = doc.querySelectorAll('#prerender-money.hp-map-fallback > p');
  assert.equal(line.textContent, '$1.6m from 2 donors to 2 parties in federal returns, 1998–99 to 2025–26.');
  assert.ok(line.textContent.length <= 110, 'three lines at most in a 350 px card');
  assert.equal(link.querySelector('a').getAttribute('href'), '/money');
  assert.equal(link.textContent, 'Open the money map');
  assert.match(mapFallbackHTML(null), /Disclosed funding between donors and parties[^<]*<\/p><p><a href="\/money">Open the money map/);
});

test('the home fallback is not clipped: it fills the card as a centred field, and the old long answer is gone', () => {
  assert.match(homeCss, /\.hp-map-fallback \{[^}]*height: 100%;[^}]*background: var\(--paper-sunken\);/);
  const card = new JSDOM(homeHtml).window.document.getElementById('hp-money-map');
  assert.equal(card.children.length, 1);
  assert.ok(card.querySelector('.hp-map-fallback a[href="/money"]'));
  assert.doesNotMatch(card.innerHTML, /<h2>|<ul>/);
});

test('the home map source line uses sourceLineHTML markup: the state runs on inside the line text', () => {
  const baked = new JSDOM(homeHtml).window.document.querySelector('#hp-map-source summary');
  assert.ok(baked.querySelector('.ui-source-text > .ui-source-state'), 'state inside .ui-source-text');
  assert.equal(baked.querySelector(':scope > .ui-source-state'), null);
  // The same shape the script writes once it has the map file.
  const live = new JSDOM(mapSourceHTML({ generated: '2026-11-11', coverage: 'financial years 1998-99 to 2025-26' })).window.document.querySelector('summary');
  assert.deepEqual([...baked.children].map((e) => e.className.baseVal ?? e.className), [...live.children].map((e) => e.className.baseVal ?? e.className));
});

/** The boot rules from style.css (the block boot-frame.test.mjs reads) applied to a page. */
function boot(path, prerender, width = 390) {
  const start = style.indexOf('.spa-ready #prerender, .spa-booting #prerender');
  const end = style.indexOf('#prerender { padding-bottom');
  const css = '[hidden] { display: none !important; }\n' + style.slice(start, end)
    // JSDOM evaluates no media queries: keep the rules for this width.
    .replace(/@media \(min-width: 701px\) \{([^\n]*)\}\n/g, width >= 701 ? '$1\n' : '')
    .replace(/@media \(width < 700px\) \{([\s\S]*?)\n\}\n/g, width < 700 ? '$1\n' : '')
    .replace(/@media \(max-width: 860px\) \{([^\n]*)\}\n/g, width <= 860 ? '$1\n' : '');
  const dom = new JSDOM(`<!doctype html><html><head><style>${css}</style></head><body><nav id="crumbs" hidden><ol></ol></nav>
    <main id="main" data-server-rendered>${prerender}<div class="wrap"><section id="hero-intro"><h1>Ask</h1></section></div></main></body></html>`,
  { url: `https://opax.com.au${path}`, runScripts: 'outside-only' });
  dom.window.setTimeout = () => 0;
  dom.window.eval(read('../public/spa-entry.js'));
  return dom.window;
}

const personHead = '<section id="prerender" class="wrap subject-person"><div class="subject-head"><img class="subject-portrait" src="/photos/1.webp" alt="" width="112" height="112"><h1>Someone</h1><p class="subject-tag">Labor</p></div><p>Summary.</p><h2>More</h2></section>';

test('a person boots in the header shape: the head shows, the summary and the rest wait; a phone drops the padding the routed page drops', () => {
  const win = boot('/subject/person/someone', personHead);
  const doc = win.document;
  const shown = (el) => win.getComputedStyle(el).display !== 'none';
  assert.equal(shown(doc.querySelector('#prerender > .subject-head')), true);
  assert.deepEqual([...doc.querySelectorAll('#prerender > :not(.subject-head)')].map(shown), [false, false]);
  assert.equal(win.getComputedStyle(doc.getElementById('main')).paddingTop, '0px');
  assert.equal(win.getComputedStyle(doc.querySelector('.subject-portrait')).marginTop, '0px');
  // Wider screens keep the boot padding and lay the head out as the app's grid.
  const wide = boot('/subject/person/someone', personHead, 1440);
  assert.notEqual(wide.getComputedStyle(wide.document.getElementById('main')).paddingTop, '0px');
  assert.equal(wide.getComputedStyle(wide.document.querySelector('#prerender > .subject-head')).display, 'grid');
});

test('/money boots with the map card place saying what is loading, and the card keeps that line until the first frame', () => {
  assert.match(style, /#prerender\[data-boot-field\]::after \{\s*content: attr\(data-boot-field\); display: grid; place-items: center;[^}]*background: var\(--paper-sunken\); font: var\(--type-fine\);/);
  assert.match(indexHtml, /<div id="money-map-root" class="money-map-root ui-plate"><p class="map-drawing" role="status">Drawing the map<\/p><\/div>/);
  assert.match(app, /const MAP_DRAWING_HTML = `<p class="map-drawing" role="status">Drawing the map<\/p>`;/);
  assert.match(app, /moneyMapHandle = handle;\s*settleMapDrawing\(root\);/);
  assert.doesNotMatch(app, /Loading the map…/);
  assert.match(style, /\.map-drawing \{[^}]*position: absolute; inset: 0;[^}]*background: var\(--paper-sunken\); font: var\(--type-fine\);/);
});

test('content replacing a skeleton fades in over the standard duration, and not at all under reduced motion', () => {
  const at = style.indexOf('animation: settle-in');
  assert.ok(at > 0);
  const block = style.lastIndexOf('@media', at);
  assert.equal(style.slice(block, style.indexOf('{', block)).trim(), '@media (prefers-reduced-motion: no-preference)');
  assert.match(style.slice(block, at + 80), /:not\(\.answer-skeleton, \.subject-skel, :has\(\.answer-skeleton\)\) \{\s*animation: settle-in var\(--duration-standard\) var\(--ease-standard\) both;/);
  assert.match(style, /--duration-standard: 200ms;/);
  // The drawing field's fade-out is gated the same way; app.js removes it at once under reduced motion.
  assert.match(style, /@media \(prefers-reduced-motion: no-preference\) \{\s*\.map-drawing \{ transition: opacity var\(--duration-standard\)/);
  assert.match(app, /prefers-reduced-motion: reduce\)"\)\.matches\) return field\.remove\(\)/);
});

// ---- The Worker's output -----------------------------------------------------

test('the Worker writes the person head, the /money boot field, the home fallback and the /map sheet', async () => {
  const restore = offline();
  try {
    const h = await loadWorker(new URL('../src/index.ts', import.meta.url).pathname, new URL('../public/', import.meta.url).pathname);
    const person = await (await h.fetch('/subject/person/anthony-albanese')).text();
    const doc = new JSDOM(person).window.document;
    const head = doc.querySelector('#prerender.subject-person > .subject-head:first-child');
    assert.ok(head, 'the prerender opens with the header');
    assert.ok(head.querySelector(':scope > .subject-portrait[width="112"]'));
    assert.equal(head.querySelector(':scope > h1').textContent, 'Anthony Albanese');
    assert.ok(head.querySelector('.subject-tag .ui-party i'), 'party dot');
    assert.match(head.querySelector('.subject-tag').textContent, /Member for Grayndler/);
    assert.match(doc.querySelector('#prerender > .subject-head + p').textContent, /^Anthony Albanese\./, 'the summary follows the head');
    assert.equal(doc.querySelectorAll('#prerender h1').length, 1);

    const money = await (await h.fetch('/money')).text();
    assert.match(money, /<section id="prerender" data-boot-field="Drawing the map"/);

    const home = await (await h.fetch('/')).text();
    const card = new JSDOM(home).window.document.getElementById('hp-money-map');
    assert.match(card.querySelector('.hp-map-fallback > p').textContent, /^\$[\d.]+(?:bn|m) from [\d,]+ donors to \d+ parties in federal returns/);
    assert.doesNotMatch(card.innerHTML, /<h2>/);

    const map = await (await h.fetch('/map')).text();
    assert.match(map, /<div class="ui-sheet"><div id="crawl-facts"><section id="prerender"/);
  } finally { restore(); }
});
