import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { cleanEvent } from '../analytics/privacy.mjs';

const app = readFileSync(new URL('../public/app.js', import.meta.url), 'utf8');
const helpers = app.slice(app.indexOf('const CITATION_PASSAGE_MAX_LENGTH'), app.indexOf('// Citation ranges come from'));
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
for (const claim of [
  'The health programme costs $1.5 billion annually.',
  'The payment was $1,234.56 on 10.10.2026.',
  'Mr. Speaker asked Dr. Minister about St. Road and record No. 3.',
  'A. B. MP discussed investment of $1.5 billion.',
  'The programme funds services, e.g. health care, i.e. access to treatment.',
  'The Cth. record says Example Organisation Pty. Ltd. received a grant.',
]) test(`support and excerpt retain sentence punctuation: ${claim}`, () => {
  const { api } = harness();
  const answer = `😀 An earlier claim. **${claim}** A later claim.`;
  const end = Array.from(answer.slice(0, answer.indexOf(' A later'))).length;
  assert.equal(api.citationSupportSentence(answer, [end - 1, end]), claim);
  const passage = api.citationPassage(`A preceding sentence. ${claim} A final sentence.`, claim);
  assert.equal(passage.match, claim);
  assert.equal(passage.before, 'A preceding sentence. ');
  assert.equal(passage.after, ' A final sentence.');
  assert.equal(new URL(api.citationReadHref(source, passage.match)).searchParams.get('passage'), claim);
});
for (const suffix of ['Pty Ltd.', 'Co.', 'Inc.', 'No.']) test(`terminal ${suffix} does not merge the next cited claim`, () => {
  const { api } = harness();
  const previous = `The record label was Example ${suffix}`;
  const claim = 'The minister voted against the bill.';
  const answer = previous + ' ' + claim;
  const start = Array.from(previous + ' ').length, end = Array.from(answer).length;
  assert.equal(api.citationSupportSentence(answer, [start, end]), claim);
  const passage = api.citationPassage(answer, claim);
  assert.equal(passage.match, claim);
  assert.equal(passage.before, previous + ' ');
  assert.equal(new URL(api.citationReadHref(source, passage.match)).searchParams.get('passage'), claim);
  assert.equal(api.citationSupportSentence(answer, [0, start - 1]), previous);
});
for (const claim of ['Example Co. received a grant.', 'Example Inc. discussed housing.', 'The record No. 3 listed divisions.', 'Example Pty. Ltd. received a grant.']) test(`internal abbreviation remains in its sentence: ${claim}`, () => {
  const { api } = harness();
  const answer = 'A preceding claim. ' + claim + ' Another claim.';
  const end = Array.from(answer.slice(0, answer.indexOf(' Another'))).length;
  assert.equal(api.citationSupportSentence(answer, [end - 1, end]), claim);
  assert.equal(api.citationPassage(answer, claim).match, claim);
});

function documentHarness(passage, text = []) {
  const notes = [];
  const root = { children: [], parentElement: { before(note) { notes.push(note); } } };
  const textNode = content => ({ tag: 'text', textContent: content, replaceWith(...items) {
    root.children.splice(root.children.indexOf(this), 1, ...items);
  } });
  root.children = text.map(textNode);
  const document = {
    createTreeWalker() { const nodes = root.children.filter(n => n.tag === 'text'); let at = -1;
      return { nextNode() { return ++at < nodes.length; }, get currentNode() { return nodes[at]; } };
    },
    createElement: tag => ({ tag, setAttribute() {}, scrollIntoView() { this.scrolled = true; }, remove() { notes.splice(notes.indexOf(this), 1); } }),
    createTextNode: textNode,
  };
  const code = app.slice(app.indexOf('const CITATION_PASSAGE_MAX_LENGTH'), app.indexOf('function trimCitationSentence(')) +
    app.slice(app.indexOf('function highlightDocCitation()'), app.indexOf('function renderDocText('));
  const highlight = runInNewContext(code + ';highlightDocCitation', {
    document, NodeFilter: { SHOW_TEXT: 4 }, URLSearchParams,
    location: { search: passage === null ? '' : '?passage=' + encodeURIComponent(passage) },
    $: id => id === 'doc-text' ? root : notes.find(n => n.id === id),
  });
  return { root, notes, highlight };
}
test('long reading anchors end at a word boundary and highlight the verbatim document within the shared limit', () => {
  const { api } = harness();
  const passage = 'Housing investment ' + 'community infrastructure '.repeat(160) + 'annually.';
  const url = new URL(api.citationReadHref(source, passage));
  const anchor = url.searchParams.get('passage');
  assert.ok(anchor.length <= 2400);
  assert.ok(anchor.length > 2300);
  assert.equal(passage.slice(0, anchor.length), anchor);
  assert.equal(passage[anchor.length], ' ');
  assert.equal(decodeURIComponent(url.hash), '#:~:text=' + anchor);
  const h = documentHarness(anchor, ['A preceding paragraph.\n\n', passage.replaceAll(' ', '\n '), '\n\nA final paragraph.']);
  h.highlight();
  const marks = h.root.children.filter(n => n.tag === 'mark');
  assert.equal(marks.map(n => n.textContent).join('').replace(/\s+/g, ' '), anchor);
  assert.equal(marks[0].scrolled, true);
  assert.equal(h.notes.length, 0);
  assert.equal(h.root.children.map(n => n.textContent).join(''), 'A preceding paragraph.\n\n' + passage.replaceAll(' ', '\n ') + '\n\nA final paragraph.');
});
test('unmatched or invalid passage anchors explain the fallback and preserve the full speech', () => {
  for (const passage of ['An absent passage.', 'x'.repeat(2401), '   ']) {
    const h = documentHarness(passage, ['The complete original speech.']);
    h.highlight(); h.highlight();
    assert.equal(h.notes.length, 1);
    assert.equal(h.notes[0].textContent, "Couldn't find the exact passage; showing the full speech.");
    assert.equal(h.root.children.map(n => n.textContent).join(''), 'The complete original speech.');
  }
  const h = documentHarness(null, ['The complete original speech.']);
  h.highlight(); assert.equal(h.notes.length, 0);
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
