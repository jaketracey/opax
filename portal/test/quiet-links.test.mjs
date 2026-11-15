// Five small reading fixes (15 Nov 2026), each checked where it lives:
// 1. a question asked from lower on the Ask page comes into view at once
//    (the browser proof is test/ask-scroll-browser.mjs; this holds the wiring);
// 2. links in an interests register table are the site's ink link, not the
//    plum accent that read as a visited colour; money tables keep their green;
// 3. no Senate caption line over a member's First speech card;
// 4. the "Ask about" questions are one-line pills and the block has one rule;
// 5. a search result's title is underlined on hover and keyboard focus only.
// jsdom has no layout, so the CSS checks read the cascade: the real
// stylesheets, the page's own markup, getComputedStyle. jsdom does not expand
// a shorthand that holds a var(), nor report text-decoration-line, so those
// few are read from the rule's own text.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { JSDOM } from 'jsdom';

// OPAX_PUBLIC_DIR points at another copy of public/ (a revert check).
const publicDir = process.env.OPAX_PUBLIC_DIR ? new URL(`file://${process.env.OPAX_PUBLIC_DIR.replace(/\/?$/, '/')}`) : new URL('../public/', import.meta.url);
const read = (name) => readFileSync(new URL(name, publicDir), 'utf8');
const { askBlockHTML, questionsHTML, questionLabel } = await import(new URL('growth-modules.js', publicDir).href);
const style = read('style.css');
const app = read('app.js');
const sheets = (...names) => names.map((name) => `<style>${read(name).replace(/@import[^;]+;/g, '')}</style>`).join('');
const styleOf = (dom, selector) => dom.window.getComputedStyle(dom.window.document.querySelector(selector));

test('a question asked from lower on the Ask page is brought into view by one shared helper', () => {
  const index = read('index.html');
  assert.match(index, /<h2 id="ask-question" class="visually-hidden" tabindex="-1" hidden><\/h2>\s*<div id="ask-status"/, 'the question heading sits above the waiting state and the answer');
  const body = (name) => { const at = app.indexOf(`function ${name}(`); assert.ok(at > 0, name); return app.slice(at, app.indexOf('\n}', at)); };
  const helper = body('bringAskIntoView');
  // "auto", as revealAskResult uses: an older Safari can reject "instant" and throw before focus moves.
  assert.match(helper, /prefers-reduced-motion: no-preference\)"\)\.matches \? "smooth" : "auto"/, 'smooth unless the reader asked for less motion');
  assert.doesNotMatch(helper, /"instant"/);
  assert.match(helper, /heading\.focus\(\{ preventScroll: true \}\)/, 'focus goes to the question heading');
  assert.match(body('runAsk'), /setAskQuestion\(question\)/, 'every ask names the heading');
  // The callers: a suggestion (under an answer or under the box), the builder,
  // and a link on the Ask page that asks again (the money next step).
  assert.match(body('askSuggestion'), /replaceRoute\(askHash\(q\)\);[\s\S]*runAsk\(q\);\s*bringAskIntoView\(\);/, 'a suggestion keeps its address handling and then comes into view');
  assert.match(body('initAskBuilder'), /runAsk\(q\);\s*bringAskIntoView\(\);/);
  assert.match(app, /if \(askedInPlace\) bringAskIntoView\(\);\s*else if \(manageFocus\) window\.scrollTo\(0, 0\);/);
  assert.equal(app.split('bringAskIntoView()').length - 1, 4, 'one helper, three callers');
});

test('an interests register table has ink links; a money table keeps its green, visited or not', () => {
  const dom = new JSDOM(`<!doctype html><html><head>${sheets('style.css', 'datatable.css', 'register-tables.css', 'grants-table.css', 'vic-gifts.css')}</head><body>
    <section id="subject-vic-gifts" class="vic-gifts-content"><div data-register-table="vic-gifts-table" class="dt-root"><table class="dt"><tbody><tr><td data-primary><a id="vic-gift" href="https://example.org/gifts">An office holder</a></td></tr></tbody></table></div><p class="vic-gifts-receipt"><a id="vic-receipt" href="https://example.org/source">Source</a></p></section>
    <section id="subject-interests"><div data-register-table="interests-table" class="dt-root"><table class="dt"><tbody><tr><td data-primary><a id="interest" href="https://example.org/register">An entry</a></td></tr></tbody></table></div></section>
    <div data-register-table="ssr-interests-table" class="dt-root"><table class="dt"><tbody><tr><td><a id="ssr" href="https://example.org/register">An entry</a></td></tr></tbody></table></div>
    <section id="person-party-money"><div data-register-table="party-money-table" class="dt-root"><table class="dt"><tbody><tr><td><a id="party-money" href="/m">A source</a></td></tr></tbody></table></div></section>
    <div data-grants-table class="dt-root"><table class="dt"><tbody><tr><td><a id="grant" href="/g">A grant</a></td></tr></tbody></table></div>
    <div class="dt-root"><table class="dt"><tbody><tr><td><a id="plain" href="/p">A row</a></td></tr></tbody></table></div>
    <p><a id="prose" href="/x">A link in prose</a></p>
  </body></html>`);
  const { document } = dom.window;
  // jsdom hands a var() back as written, so a custom property is followed by
  // hand: the element's own chain of declarations, nearest ancestor first.
  const custom = (el, name) => { for (let n = el; n && n.nodeType === 1; n = n.parentElement) { const v = dom.window.getComputedStyle(n).getPropertyValue(name).trim(); if (v) return v; } return ''; };
  const resolve = (el, value) => {
    let out = value;
    for (let i = 0; i < 6 && /^var\(/.test(out); i++) {
      const [, name, fallback] = /^var\((--[\w-]+)(?:,\s*(.+))?\)$/.exec(out);
      out = custom(el, name) || fallback || name;
      if (out === name) return name;
    }
    return out;
  };
  const linkColour = (id) => { const el = document.getElementById(id); return resolve(el, dom.window.getComputedStyle(el).color); };
  const ruleColour = (id) => { const el = document.getElementById(id); return resolve(el, dom.window.getComputedStyle(el).textDecorationColor); };
  const token = (name) => resolve(document.documentElement, `var(${name})`);
  const INK = token('--ink'), GREEN = token('--money-ink'), PLUM = token('--interests-ink');
  assert.ok(INK && GREEN && PLUM && new Set([INK, GREEN, PLUM]).size === 3, 'three different tokens');
  assert.equal(linkColour('prose'), INK, 'the site link colour is ink');
  // The interests registers: ink on the bronze rule, the site's ordinary link.
  // The Victorian gifts register borrows the same plum accent (vic-gifts.css).
  for (const id of ['interest', 'ssr', 'vic-gift']) {
    assert.equal(linkColour(id), INK, `#${id}: an interests register link is ink, not the plum accent`);
    assert.equal(ruleColour(id), token('--bronze-rule'), `#${id}: on the site's underline colour`);
    assert.equal(dom.window.getComputedStyle(document.getElementById(id)).textDecoration, 'underline', `#${id}: still underlined`);
  }
  assert.equal(custom(document.getElementById('vic-gift'), '--money-ink'), 'var(--interests-ink)', 'the gifts register keeps its plum accent for bars, filters and focus');
  assert.equal(linkColour('vic-receipt'), INK, 'its source links outside the table are the site link, as before');
  // Money tables keep their green.
  for (const id of ['party-money', 'grant', 'plain']) assert.equal(linkColour(id), GREEN, `#${id}: a money table link keeps the money green`);
  // Visited or not: no stylesheet names :visited at all, so a visited link is
  // drawn as an unvisited one and keeps its hover (a .dt a:visited rule would
  // outrank a:hover). The interests scope only sets the shared rule's variables.
  const datatable = read('datatable.css'), registers = read('register-tables.css');
  assert.match(datatable, /\n\.dt a \{ color: var\(--dt-link, var\(--money-ink\)\);/);
  for (const name of ['style.css', 'ui-controls.css', 'datatable.css', 'register-tables.css', 'grants-table.css', 'vote-tables.css']) assert.doesNotMatch(read(name), /:visited/, `${name}: no visited rule`);
  assert.match(registers, /#subject-interests \[data-register-table\],\s*\[data-register-table="ssr-interests-table"\] \{\s*--dt-link: var\(--ink\);\s*--dt-link-rule: var\(--bronze-rule\);/);
  // Focus keeps the section accent's ring, as before.
  assert.match(datatable, /\.dt-root :is\(button, summary, input, select, a\):focus-visible \{ outline: var\(--border-focus\) solid var\(--money-ink\)/);
});

test('a member page draws no Senate caption over the First speech card', () => {
  const at = app.indexOf('async function renderPersonFirstSpeech(');
  const fn = app.slice(at, app.indexOf('\n}', at));
  assert.match(fn, /<h2 class="subject-section-title">First speech<\/h2>\s*<div class="video-cards">/, 'the card follows the heading');
  assert.doesNotMatch(fn, /person-caveat|Video published by/);
  assert.match(fn, /All first speeches/);
  assert.match(fn, /dateLabel: "Published", source: "AuSenate YouTube channel"/, 'the attribution line stays');
  const seo = readFileSync(new URL('../src/seo-content.ts', import.meta.url), 'utf8');
  assert.doesNotMatch(seo, /Video published by the Senate Public Information Office/);
});

test('the Ask-about questions are one-line pills in a wrapping list, and the block keeps one rule', () => {
  const long = 'How did each party vote on the Treasury Laws Amendment (A Very Long Title That Keeps Going For Some Considerable Distance) Bill 2026?';
  const block = askBlockHTML({ name: 'Ada Quill', pageType: 'person', questions: ['What interests has Ada Quill declared?', long] });
  const dom = new JSDOM(`<!doctype html><html><head>${sheets('style.css')}</head><body>${block}</body></html>`);
  const { document } = dom.window;
  // Still a list of links to Ask, with the whole question on each.
  const links = [...document.querySelectorAll('ul.growth-questions[role="list"] > li > a')];
  assert.equal(links.length, 2);
  assert.equal(links[1].getAttribute('title'), long, 'the full question is the title');
  assert.equal(links[1].textContent, questionLabel(long), 'the label keeps the 100-character cut');
  assert.ok(links[1].textContent.length <= 101);
  assert.equal(new URL(links[1].getAttribute('href'), 'https://opax.com.au').searchParams.get('q'), long, 'Ask receives the whole question');
  assert.equal(links[1].getAttribute('rel'), 'nofollow');
  assert.match(questionsHTML(['A "quoted" question?'], 'bill'), /title="A &quot;quoted&quot; question\?"/, 'the title is escaped');

  const list = styleOf(dom, '.growth-questions');
  assert.equal(list.display, 'flex');
  assert.equal(list.flexWrap, 'wrap');
  assert.equal(list.gap, 'var(--space-tight)');
  const pill = styleOf(dom, '.growth-questions a');
  assert.equal(pill.borderRadius, 'var(--radius-pill)', 'fully rounded');
  assert.equal(pill.whiteSpace, 'nowrap');
  assert.equal(pill.overflow, 'hidden');
  assert.equal(pill.textOverflow, 'ellipsis');
  // The cap is on the list item and the pill fills it: capped on the pill alone,
  // the item kept the full text's width and left a blank before the next pill.
  assert.match(styleOf(dom, '.growth-questions li').maxWidth, /^min\(100%, \d+(rem|px)\)$/, 'a capped width, so a long bill title cannot make one giant pill');
  assert.equal(pill.maxWidth, '100%', 'the pill is as wide as its item, no wider');
  assert.equal(pill.textDecoration, 'none', 'no underline');
  assert.equal(pill.color, 'var(--ink)');
  assert.equal(pill.background, 'var(--paper-raised)');
  assert.match(style, /\n\.growth-questions a \{[^}]*border: var\(--border-hairline\) solid var\(--divider-default\);/, 'a hairline border');
  assert.match(style, /\n\.growth-questions a:hover \{ background: var\(--paper-sunken\);/, 'a hover state');
  assert.match(style, /:is\(\.growth-ask, \.growth-records, \.growth-donor\) :is\(a, button, input, textarea, summary\):focus-visible \{ outline: var\(--border-focus\) solid var\(--bronze-ink\)/, 'a visible focus ring');
  assert.match(style, /@media \(max-width: 1000px\), \(pointer: coarse\) \{\s*\.growth-questions a \{ min-height: var\(--size-target\);/, '44px tall on touch');

  // One rule: the top divider stays, the bottom border is gone.
  const section = /\n\.growth-ask \{([^}]*)\}/.exec(style)[1];
  assert.match(section, /border-top: var\(--border-hairline\) solid var\(--divider-default\);/);
  assert.doesNotMatch(section, /border-block|border-bottom|border:/, 'no bottom border');
  assert.doesNotMatch(style, /\.growth-ask \{[^}]*border-(?:block|bottom)[^}]*solid/);
});

test('a search result title is underlined on hover and keyboard focus only', () => {
  const dom = new JSDOM(`<!doctype html><html><head>${sheets('style.css')}</head><body><section id="panel-search"><ul id="search-results" class="ui-list"><li>
    <div class="ui-row-meta"><a id="kind" href="/ask?view=search&kind=speech">Speech</a> · 27 May 2026</div>
    <h3 class="ui-row-title search-result-heading"><a id="title" class="result-title" href="/doc/x">A committee hearing</a></h3>
    <div class="result-byline"><a id="speaker" href="/subject/person/x">A Speaker</a></div>
  </li></ul></section></body></html>`);
  const line = (id) => styleOf(dom, `#${id}`).textDecoration;
  assert.match(style, /\n#panel-search \.search-result-heading a\.result-title \{ text-decoration-line: none; \}/, 'no underline at rest');
  assert.equal(styleOf(dom, '#title').color, styleOf(dom, '.search-result-heading').color, 'the title keeps its colour');
  assert.equal(dom.window.document.querySelector('#title').tagName, 'A', 'and is still a link');
  // The kind link and the speaker's name are other rules and keep their underline.
  assert.equal(line('kind'), 'underline');
  assert.equal(line('speaker'), 'underline');
  assert.match(style, /\n#panel-search \.search-result-heading a\.result-title:is\(:hover, :focus-visible\) \{ text-decoration-line: underline; \}/);
});
