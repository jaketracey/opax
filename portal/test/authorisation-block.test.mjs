import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { JSDOM } from 'jsdom';
import { authorisationHTML } from '../public/authorisation.js';
import { profileHTML } from '../public/electorates.js';
import { VIC_ELECTION_AUTHORISATION_LINE, VIC_ELECTION_CORRECTIONS_EMAIL, VIC_ELECTION_CORRECTIONS_RESPONSE, vicElectionFooterHTML } from '../public/vic-election.js';

// The electoral authorisation is plain fine print on the page ground (19 Oct):
// one partial, a <div>, never a <footer> that nav.css paints as the navy site footer.
const pub = new URL('../public/', import.meta.url);
const LINE = 'Authorised by A. Placeholder, Example Pty Ltd, 1 Sample Street, Melbourne VIC 3000.';
const block = (html) => html.match(/<div class="authorisation">[\s\S]*?<\/div>/)?.[0];

test('the partial draws the exact line, a working mailto link and the response time', () => {
  const html = authorisationHTML({ line: LINE, email: 'corrections@example.test', response: 'We aim to respond soon.' });
  assert.equal(html, '<div class="authorisation"><p class="authorisation-line">' + LINE + '</p>'
    + '<p class="authorisation-corrections"><a href="mailto:corrections@example.test">Report a correction: corrections@example.test</a><span>We aim to respond soon.</span></p></div>');
  assert.equal(authorisationHTML({ line: '<b>x</b>' }), '<div class="authorisation"><p class="authorisation-line">&lt;b&gt;x&lt;/b&gt;</p></div>');
  assert.match(authorisationHTML({ href: '/corrections' }), /<a href="\/corrections">Report a correction<\/a>/);
  assert.equal(authorisationHTML({ correction: true }), '<div class="authorisation"><p class="authorisation-corrections">Report a correction</p></div>');
  assert.equal(authorisationHTML({}), '');
});

test('Victorian electorate pages carry the approved lines in the shared block, client-rendered', () => {
  const footer = vicElectionFooterHTML();
  assert.equal(footer, authorisationHTML({ line: VIC_ELECTION_AUTHORISATION_LINE, email: VIC_ELECTION_CORRECTIONS_EMAIL, response: VIC_ELECTION_CORRECTIONS_RESPONSE }));
  assert.ok(footer.includes(`<p class="authorisation-line">${VIC_ELECTION_AUTHORISATION_LINE}</p>`), 'exact wording');
  assert.ok(footer.includes(`href="mailto:${VIC_ELECTION_CORRECTIONS_EMAIL}"`));
  const manifest = JSON.parse(readFileSync(new URL('electorates/manifest.json', pub)));
  const index = JSON.parse(readFileSync(new URL(manifest.index_url.slice(1), pub)));
  const detail = (e) => JSON.parse(readFileSync(new URL(e.detail_url.slice(1), pub)));
  const vic = index.electorates.filter((e) => e.jurisdiction === 'vic');
  assert.ok(vic.length >= 96);
  for (const seat of vic) {
    const html = profileHTML(detail(seat));
    assert.equal(block(html), footer, seat.url);
    assert.doesNotMatch(html, /<footer\b/, `${seat.url}: no footer element inside the page`);
  }
  const federal = index.electorates.find((e) => e.jurisdiction === 'federal');
  assert.doesNotMatch(profileHTML(detail(federal)), /class="authorisation"/);
});

// Every rule in every public stylesheet that reaches the block, its lines or its
// link, applied in a DOM that holds the real markup inside <main>.
const sheets = readdirSync(pub).filter((f) => f.endsWith('.css'));
const dom = new JSDOM(`<!doctype html><html><head>${sheets.map((f) => `<style data-file="${f}">${readFileSync(new URL(f, pub), 'utf8')}</style>`).join('')}</head>`
  + `<body><main id="main"><section id="prerender" class="wrap hub-page">${vicElectionFooterHTML()}</section></main></body></html>`);
const doc = dom.window.document;
function* rules(list, file) {
  for (const rule of list) {
    if (rule.selectorText) yield { rule, file };
    if (rule.cssRules) yield* rules(rule.cssRules, file);
  }
}
const matching = (el) => [...doc.styleSheets].flatMap((s) => [...rules(s.cssRules, s.ownerNode.dataset.file)])
  .filter(({ rule }) => { try { return el.matches(rule.selectorText); } catch { return false; } });

test('no stylesheet gives the block a fill, a dark ground or a masthead rule', () => {
  const root = doc.querySelector('.authorisation');
  assert.ok(root);
  assert.equal(root.closest('footer'), null);
  const touched = [root, ...root.querySelectorAll('*')];
  for (const el of touched) for (const { rule, file } of matching(el)) {
    const where = `${file}: ${rule.selectorText}`;
    for (const prop of ['background', 'background-color', 'background-image']) assert.equal(rule.style.getPropertyValue(prop), '', where);
    assert.doesNotMatch(rule.style.cssText, /--navy|--on-navy|--border-masthead|var\(--bronze\)/, where);
  }
});

test('the authorisation text is muted ink that passes AA for small text on the page ground', () => {
  const tokens = readFileSync(new URL('style.css', pub), 'utf8');
  const hex = (name) => tokens.match(new RegExp(`--${name}:\\s*(#[0-9a-f]{6})`, 'i'))[1];
  const lum = (h) => {
    const [r, g, b] = [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16) / 255).map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  };
  const ratio = (a, b) => (Math.max(lum(a), lum(b)) + 0.05) / (Math.min(lum(a), lum(b)) + 0.05);
  const line = doc.querySelector('.authorisation-line');
  const colours = [line, doc.querySelector('.authorisation')].flatMap((el) => matching(el)).map(({ rule }) => rule.style.getPropertyValue('color')).filter(Boolean);
  assert.ok(colours.includes('var(--ink-soft)'), colours.join());
  for (const colour of colours) {
    const token = /^var\(--([a-z-]+)\)$/.exec(colour)?.[1];
    assert.ok(token, `a token, not a raw colour: ${colour}`);
    assert.ok(ratio(hex(token), hex('paper')) >= 4.5, `${token} on paper`);
  }
});
