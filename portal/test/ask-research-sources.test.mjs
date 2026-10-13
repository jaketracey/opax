// The research's records in the Ask sources block (public/app.js): one panel
// with the citations, nothing listed twice, nothing linked off-site unsafely;
// and the trail rows take their round from the live step events.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { JSDOM } from 'jsdom';

const app = readFileSync(new URL('../public/app.js', import.meta.url), 'utf8');
const slice = (from, to) => {
  const start = app.indexOf(from), end = app.indexOf(to, start);
  assert.ok(start >= 0 && end > start, `${from} is in app.js`);
  return app.slice(start, end);
};
const dom = new JSDOM('<div id="box"></div>', { url: 'https://opax.com.au/ask' });
const context = {
  document: dom.window.document, location: dom.window.location, URL,
  safeUrl: (u) => (typeof u === 'string' && /^https?:\/\//i.test(u) ? u : null),
  fmtDate: (d) => `on ${d}`,
};
vm.createContext(context);
vm.runInContext(`${slice('function searchResultHref', 'function searchResultUrl')}
${slice('function researchOf', '// The same menagerie')}
${slice('const RESEARCH_KINDS', 'function sourceItem(')}
this.api = { researchOf, researchSourceExtras, renderResearchSources };`, context);
const { researchOf, researchSourceExtras, renderResearchSources } = context.api;

const cited = [
  { resource: 'a', slug: 'speech-1', kind: 'speech', title: 'Gambling Harm Reduction Bill 2023' },
  { resource: 'fact-1', slug: '', kind: 'speech', title: 'Andrew Wilkie: 60 speeches', href: '/search?q=gambling&speaker=Andrew%20Wilkie', url: '/search?q=gambling&speaker=Andrew%20Wilkie' },
];

test('records already in the block are left out by address; the rest are kept once', () => {
  const extras = researchSourceExtras({ sources: [
    { title: 'Gambling Harm Reduction Bill 2023', url: 'https://opax.com.au/doc/speech-1/', kind: 'speech', date: '2023-02-15' },
    { title: 'A count', url: '/search?q=gambling&speaker=Andrew%20Wilkie', kind: 'record' },
    { title: 'Third reading', url: '/divisions/house-2023-11-29-3', kind: 'division', date: '2023-11-29' },
    { title: 'Third reading, again', url: '/divisions/house-2023-11-29-3', kind: 'division' },
    { title: '', url: '/doc/untitled', kind: 'speech' },
    { title: 'No address', kind: 'speech' },
  ] }, cited);
  assert.deepEqual(Array.from(extras, (r) => r.url), ['/divisions/house-2023-11-29-3']);
  assert.equal(researchSourceExtras(undefined, cited).length, 0);
});

test('the rows: a linked title, then its kind and date; unsafe addresses are not links', () => {
  const box = dom.window.document.getElementById('box');
  renderResearchSources(box, researchSourceExtras({ sources: [
    { title: 'Third reading', url: '/divisions/house-2023-11-29-3', kind: 'division', date: '2023-11-29' },
    { title: 'Committee hansard', url: 'javascript:alert(1)', kind: 'press_release' },
    { title: 'Elsewhere', url: 'http://example.org/x', kind: 'committee' },
  ] }, cited));
  assert.equal(box.hidden, false);
  assert.equal(box.querySelector('.ask-research-sources-head').textContent, 'Also used in the research');
  assert.equal(box.querySelector('ol').getAttribute('aria-label'), 'Also used in the research');
  const rows = [...box.querySelectorAll('.ask-research-source')].map((li) => [li.firstChild.tagName, li.firstChild.getAttribute('href'), li.textContent]);
  assert.deepEqual(rows, [
    ['A', 'https://opax.com.au/divisions/house-2023-11-29-3', 'Third readingDivision · on 2023-11-29'],
    ['SPAN', null, 'Committee hansardPress release'],
    ['SPAN', null, 'ElsewhereCommittee hearing'],
  ]);
  renderResearchSources(box, [], {});
  assert.equal(box.hidden, true);
  assert.equal(box.children.length, 0);
});

test('trail rows take their round from the live steps when they carry none', () => {
  const research = { mode: 'loop', rounds: 2, trail: [{ id: 1, label: 'A' }, { id: 2, label: 'B', round: 3 }, { id: 4, label: 'C' }], sources: [] };
  const kept = researchOf({ research }, [{ id: 1, round: 1 }, { id: 2, round: 2 }, { id: 3, round: 2 }]);
  assert.deepEqual(Array.from(kept.trail, (t) => t.round), [1, 3, undefined]);
  assert.equal(researchOf({ research }, []), research);
  assert.equal(researchOf({ research: { trail: [] } }), undefined);
  assert.equal(researchOf({}), undefined);
});
