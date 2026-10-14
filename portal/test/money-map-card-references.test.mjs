// The money map's entity card keeps the plain name and its sums; the return
// references behind them sit in the Sources dropdown, never in the card body.
// The WebGL engine is swapped for a no-op stub so the real card code runs in jsdom.
import test from 'node:test';
import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {JSDOM} from 'jsdom';

const engineStub = `
export const webglAvailable = () => true
export const easeInOut = (t) => t
const answers = { viewOwned: false, focusOwned: false, reducedMotion: true, viewAngles: { theta: 0, phi: 1 } }
export class KnowledgeMapEngine {
  constructor() {
    return new Proxy(this, { get: (target, key) => key in target ? target[key] : key in answers ? answers[key] : () => null })
  }
}`;
const bundled = await build({
  entryPoints: [new URL('../graph/index.ts', import.meta.url).pathname], bundle: true, platform: 'neutral', format: 'esm', write: false,
  mainFields: ['module', 'main'], logLevel: 'silent',
  plugins: [{ name: 'engine-stub', setup(b) {
    b.onResolve({ filter: /map3d-engine(\.ts)?$/ }, () => ({ path: 'engine-stub', namespace: 'stub' }));
    b.onLoad({ filter: /.*/, namespace: 'stub' }, () => ({ contents: engineStub, loader: 'js' }));
  } }],
});
const map = await import('data:text/javascript;base64,' + Buffer.from(bundled.outputFiles[0].text).toString('base64'));

// Invented fixture names; a donor with more references than the dropdown lists in full.
const returns = Array.from({ length: 13 }, (_, i) => ({ return_type: 'AEC annual return', year: `${2010 + i}-${String(11 + i).slice(-2)}`, return_id: `RETURN-FIXTURE-${i}`, url: 'https://example.test/returns' }));
const figures = { total: 500, count: 5, firstYear: 2010, lastYear: 2022, byYear: { 2010: [500, 5] } };
const graph = {
  meta: { sourceShort: 'AEC annual returns', coverage: 'Invented fixture', minYear: 2010, maxYear: 2022 },
  nodes: [
    { id: 'donor:fixture-holdings', label: 'Fixture Holdings Pty Ltd', source_name: 'Fixture Holdings Pty Ltd', kind: 'donor', industry: 'mining', group: 'mining', ...figures,
      match: { confidence: 0.9, method: 'rule', href: null }, returnReferences: returns },
    { id: 'party:Labor', label: 'Labor', kind: 'party', industry: 'parties', group: 'parties', ...figures },
  ],
  edges: [{ source: 'donor:fixture-holdings', target: 'party:Labor', ...figures }],
};
const REFERENCE = /RETURN-FIXTURE|AEC annual return|return reference/;

async function mount() {
  const dom = new JSDOM('<div id="map" style="width:390px;height:600px"></div>', { url: 'https://opax.test/money', pretendToBeVisual: true });
  const { window } = dom;
  const globals = { window, document: window.document, HTMLElement: window.HTMLElement, HTMLButtonElement: window.HTMLButtonElement,
    HTMLAnchorElement: window.HTMLAnchorElement, CustomEvent: window.CustomEvent, Event: window.Event, getComputedStyle: window.getComputedStyle,
    location: window.location, history: window.history, localStorage: window.localStorage, navigator: window.navigator,
    matchMedia: () => ({ matches: false, addEventListener() {}, removeEventListener() {} }),
    ResizeObserver: class { observe() {} unobserve() {} disconnect() {} },
    IntersectionObserver: class { observe() {} unobserve() {} disconnect() {} },
    requestAnimationFrame: (fn) => setTimeout(fn, 0), cancelAnimationFrame: clearTimeout };
  window.matchMedia = globals.matchMedia;
  // node --test runs each file in its own process, and the map keeps timers
  // queued after destroy(), so the jsdom globals stay for the file's lifetime.
  for (const [key, value] of Object.entries(globals)) Object.defineProperty(globalThis, key, { value, configurable: true, writable: true });
  const handle = await map.mountMoneyMap(window.document.querySelector('#map'), structuredClone(graph), { chrome: 'full' });
  return { window, handle };
}

test('the entity card shows no return references for a donor or a party; Sources carries them', async () => {
  const { window, handle } = await mount();
  try {
    const card = () => window.document.querySelector('.mm-card');
    handle.select('donor:fixture-holdings');
    const donorCard = card();
    assert.ok(donorCard.textContent.includes('Fixture Holdings Pty Ltd'), 'the donor card renders');
    assert.ok(donorCard.querySelector('.mm-card-title a') === null, 'the name stays plain text');
    assert.equal(donorCard.querySelector('.donor-return-reference'), null);
    const slot = donorCard.querySelector('.mm-evidence');
    assert.ok(slot?.hidden, 'the Sources dropdown starts closed');
    const body = donorCard.cloneNode(true);
    body.querySelector('.mm-evidence').remove();
    assert.doesNotMatch(body.innerHTML, REFERENCE, 'no return reference outside the Sources dropdown');
    assert.match(body.textContent, /Where it went/);
    assert.match(body.textContent, /Search/); assert.match(body.textContent, /Explain/); assert.match(body.textContent, /Sources/);

    const refs = [...slot.querySelectorAll('.mm-return-refs li')].map((li) => li.textContent);
    assert.equal(refs.length, 10);
    assert.equal(refs[0], 'AEC annual return · 2010-11 · RETURN-FIXTURE-0');
    assert.match(slot.querySelector('.mm-return-refs').textContent, /3 more return references in the data export/);
    const sources = [...donorCard.querySelectorAll('button.mm-action')].find((b) => b.textContent.includes('Sources'));
    assert.equal(sources.getAttribute('aria-controls'), slot.id);

    handle.select('party:Labor');
    const partyCard = card();
    assert.match(partyCard.textContent, /Top donors shown on the map/);
    assert.match(partyCard.textContent, /Fixture Holdings Pty Ltd/);
    assert.doesNotMatch(partyCard.innerHTML, REFERENCE, 'party rows carry the plain donor name');
  } finally { handle.destroy(); }
});
