import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { cleanEvent } from '../analytics/privacy.mjs';

const app = readFileSync(new URL('../public/app.js', import.meta.url), 'utf8');
const helpers = app.slice(app.indexOf('function trimCitationSentence('), app.indexOf('// Citation ranges come from'));
function harness(phone = false) {
  const events = [], keys = {};
  let document;
  const element = tag => {
    const classes = new Set();
    return {
      tag, children: [], attributes: {}, dataset: {}, style: {}, inert: false,
      classList: { add: (...items) => items.forEach(i => classes.add(i)), remove: (...items) => items.forEach(i => classes.delete(i)), contains: i => classes.has(i) },
      append(...items) { for (const item of items) { this.children.push(item); if (typeof item !== 'string') item.parentElement = this; } },
      appendChild(item) { this.append(item); },
      setAttribute(key, value) { this.attributes[key] = value; },
      addEventListener(event, fn) { this.listeners ||= {}; this.listeners[event] = fn; },
      focus() { document.activeElement = this; },
      remove() { this.parentElement.children = this.parentElement.children.filter(c => c !== this); this.parentElement = null; },
      querySelectorAll() { return this.children.filter(c => ['button', 'a'].includes(c.tag)); },
      get isConnected() { return !!this.parentElement; },
    };
  };
  document = { createElement: element, addEventListener: (key, fn) => { keys[key] = fn; }, body: element('body') };
  const scope = element('section'), container = element('article'), button = element('button'), outside = element('nav');
  document.body.append(outside, scope); scope.append(container); container.append(button);
  container.closest = () => scope;
  container.getBoundingClientRect = () => ({ top: 180 });
  const api = runInNewContext(helpers + ';({trimCitationSentence,citationSupportSentence,citationPassage,citationReadHref,openAskCitation,closeAskCitation})', {
    document, window: { addEventListener() {}, innerHeight: 1000 }, matchMedia: () => ({ matches: phone }), URL,
    location: { origin: 'http://opax.test' },
    displayTitle: s => s.title, searchResultHref: s => s.href || `/doc/${s.slug}`,
    CHAMBER_NAMES: { representatives: 'House of Representatives' },
    metaHTML: s => `${s.speaker} · ${s.party} · ${s.date}`, esc: value => String(value),
    trackOutcome: (event, properties) => events.push({ event, properties }),
  });
  return { api, document, scope, container, button, outside, events, keys };
}
const source = { title: 'Housing debate', resource: 'r1', slug: 'speech-1', kind: 'speech', speaker: 'Example MP', party: 'Independent', chamber: 'House of Representatives', date: '2026-02-11', snippet: 'The debate continued. Housing supply needs investment in social housing. The next item followed.' };
const sentence = 'The speaker called for investment in social housing.';

test('supports sentence follows the citation range, preserves Unicode, and trims on a word boundary', () => {
  const { api } = harness();
  const answer = '😀 An earlier claim. **Housing supply needs investment.** Another claim.';
  const end = Array.from(answer.slice(0, answer.indexOf(' Another'))).length;
  assert.equal(api.citationSupportSentence(answer, [end - 2, end]), 'Housing supply needs investment.');
  assert.equal(api.citationSupportSentence(answer, [0, 19]), '😀 An earlier claim.');
  assert.equal(api.trimCitationSentence('one two three four five', 16), 'one two three…');
});
test('the matching original sentence is highlighted within the excerpt and deep linked', () => {
  const { api } = harness();
  const match = api.citationPassage(source.snippet, sentence);
  assert.equal(match.match, 'Housing supply needs investment in social housing.');
  assert.equal(match.before, 'The debate continued. ');
  assert.equal(match.after, ' The next item followed.');
  const url = new URL(api.citationReadHref(source, match.match));
  assert.equal(url.pathname, '/doc/speech-1');
  assert.equal(url.searchParams.get('passage'), match.match);
  assert.equal(decodeURIComponent(url.hash), '#:~:text=' + match.match);
});
for (const phone of [false, true]) test(`${phone ? 'phone sheet' : 'desktop panel'} keeps supports, excerpt, primary reading action and back focus`, () => {
  const h = harness(phone);
  h.api.openAskCitation(h.container, source, 4, h.button, sentence);
  const panel = h.scope.children.at(-1);
  assert.equal(h.document.activeElement, panel);
  assert.equal(panel.attributes.role, phone ? 'dialog' : 'region');
  assert.equal(panel.attributes['aria-labelledby'], 'ask-citation-title');
  assert.equal(panel.attributes['aria-describedby'], 'ask-citation-supports');
  const [close, title, supports, meta, excerpt, read, back] = panel.children;
  assert.equal(title.textContent, 'Source 4: Housing debate');
  assert.equal(supports.textContent, `Supports: “${sentence}”`);
  assert.match(meta.innerHTML, /Example MP.*Independent.*2026-02-11.*House of Representatives/);
  assert.equal(excerpt.children[1].tag, 'mark');
  assert.match(excerpt.children[1].textContent, /social housing/);
  assert.equal(read.textContent, 'Read the full speech');
  assert.equal(read.dataset.variant, 'primary');
  assert.equal(back.textContent, 'Back to answer');
  assert.equal(h.button.attributes['aria-expanded'], 'true');
  assert.equal(h.outside.inert, phone);
  assert.deepEqual(JSON.parse(JSON.stringify(h.events)), [{ event: 'opax_ask_citation_open', properties: { position: 4, source_kind: 'speech' } }]);
  back.listeners.click();
  assert.equal(h.document.activeElement, h.button);
  assert.equal(h.button.attributes['aria-expanded'], 'false');
  assert.equal(h.outside.inert, false);
  assert.equal(panel.parentElement, null);
});
test('Escape closes the source and returns to its citation; record reads send only a kind', () => {
  const h = harness();
  h.api.openAskCitation(h.container, { ...source, kind: 'division' }, 2, h.button, sentence);
  assert.equal(h.scope.children.at(-1).children[5].textContent, 'Open record');
  let prevented = false;
  h.keys.keydown({ key: 'Escape', preventDefault() { prevented = true; } });
  assert.equal(prevented, true); assert.equal(h.document.activeElement, h.button);
  h.api.openAskCitation(h.container, source, 1, h.button, sentence);
  h.scope.children.at(-1).children[5].listeners.click();
  assert.deepEqual(JSON.parse(JSON.stringify(h.events.at(-1))), { event: 'opax_ask_citation_read', properties: { source_kind: 'speech' } });
});
test('citation analytics discard question text, claims and source titles', () => {
  const properties = { position: 4, source_kind: 'speech', question: 'a reader question', answer: sentence, source_title: source.title };
  assert.deepEqual(cleanEvent('opax_ask_citation_open', properties), { position: 4, source_kind: 'speech' });
  assert.deepEqual(cleanEvent('opax_ask_citation_read', properties), { source_kind: 'speech' });
});
