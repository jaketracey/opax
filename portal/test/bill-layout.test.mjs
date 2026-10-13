// The bill page's head and sections take the page's content column (13 Oct
// hotfix): a 68ch .bill-head and 68ch .bill-section drew the head and How it
// moved as the left half of a desktop column, beside the full-width Ask block
// and bill text. jsdom has no layout, so this checks the cascade instead: a
// block with no max-width, no width and no side margins fills its column. The
// rules are read from style.css itself, with every @media block applied at
// once, so no breakpoint can bring a box back.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { JSDOM } from 'jsdom';

const css = readFileSync(new URL('../public/style.css', import.meta.url), 'utf8');
const app = readFileSync(new URL('../public/app.js', import.meta.url), 'utf8');

// Every rule, with the ones inside @media and @supports lifted to the top.
function flatSheet() {
  const { document } = new JSDOM(`<!doctype html><style>${css}</style>`).window;
  const out = [];
  const MEDIA = 4, SUPPORTS = 12;
  const walk = (rules) => { for (const r of rules) [MEDIA, SUPPORTS].includes(r.type) ? walk(r.cssRules) : out.push(r.cssText); };
  walk(document.styleSheets[0].cssRules);
  assert.ok(out.length > 2000, `style.css read whole (${out.length} rules)`);
  return out.join('\n');
}

// The page as openBill() draws it: the head, the Ask block, In short, the bill
// text slot, then How it moved and the record's sections.
const page = (sheet) => new JSDOM(`<!doctype html><html><head><style>${sheet}</style></head><body>
  <main id="main" class="compact"><div class="wrap"><section id="panel-bill" class="panel"><div id="bill-body">
    <div class="subject-head bill-head">
      <p class="bill-status"><span class="ui-status">Passed</span></p>
      <h1 id="bill-title" class="bill-title" tabindex="-1">An Example Amendment Bill 2026</h1>
      <p class="bill-short">Known as the Example Bill</p>
      <p class="subject-tag bill-tag">Introduced 2 Jul 2026 in the House of Representatives · Finance</p>
      <p class="bill-related">Builds on <a href="/bill/x">an earlier bill</a></p>
      <div class="page-actions bill-actions"></div>
    </div>
    <section class="growth-ask"></section>
    <section class="bill-section bill-summary" data-accent="bills">
      <div class="bill-section-head"><h3 class="subject-section-title">In short</h3></div>
      <div class="bill-sentences"><p>One sentence.</p></div>
      <ul class="bill-changes"><li>One change.</li></ul>
      <p class="bill-affected">Everyone.</p>
    </section>
    <div id="bill-text-slot"></div>
    <section class="bill-section" data-accent="bills">
      <h3 class="subject-section-title">How it moved</h3>
      <svg class="bill-ruler" width="100%" height="52"></svg>
      <details class="bill-stages"><summary>All 4 stages</summary>
        <ol class="bill-dates" role="list"><li class="bill-date"></li></ol></details>
    </section>
    <section class="bill-section" data-accent="votes"></section>
    <section class="bill-section"><ul class="subject-list bill-speeches" role="list"><li></li></ul></section>
  </div></section></div></main></body></html>`).window;

test('the selectors here are the ones openBill() and the section renderers draw', () => {
  for (const markup of ['<div class="subject-head bill-head">', '<h1 id="bill-title" class="bill-title"',
    '<section class="bill-section bill-summary" data-accent="bills"', '<div class="bill-sentences">',
    '<section class="bill-section" data-accent="bills">', '<svg class="bill-ruler"', '<ol class="bill-dates"',
    '<section class="bill-section" data-accent="votes"', '<ul class="subject-list bill-speeches"']) {
    assert.ok(app.includes(markup), `app.js still draws ${markup}`);
  }
});

test('the bill head, How it moved and every bill section fill the content column at every width', () => {
  const window = page(flatSheet());
  const { document } = window;
  const fills = (selector) => {
    for (const el of document.querySelectorAll(selector)) {
      const s = window.getComputedStyle(el);
      assert.ok(['block', 'grid', 'flex'].includes(s.display), `${selector} is block-level (${s.display})`);
      assert.equal(s.maxWidth, 'none', `${selector} has no max-width`);
      assert.ok(['auto', '100%'].includes(s.width), `${selector} width is ${s.width}`);
      for (const side of ['marginLeft', 'marginRight']) assert.ok(['0', '0px'].includes(s[side]), `${selector} ${side} is ${s[side]}`);
    }
  };
  assert.equal(document.querySelectorAll('#bill-body .bill-section').length, 4);
  for (const selector of ['.bill-head', '.growth-ask', '#bill-body .bill-section', '.bill-ruler', '.bill-dates']) fills(selector);
  // The stage rows draw the section's rules, so they reach its edge too.
  fills('.bill-date');
});

test('the reading measure sits on the words, from the design token', () => {
  const window = page(css);
  const { document } = window;
  assert.equal(window.getComputedStyle(document.documentElement).getPropertyValue('--size-readable').trim(), '68ch');
  // jsdom reports the declared value, so this names the token rather than a width.
  for (const selector of ['.bill-title', '.bill-short', '.bill-related', '.bill-sentences', '.bill-changes', '.bill-affected']) {
    assert.equal(window.getComputedStyle(document.querySelector(selector)).maxWidth, 'var(--size-readable)', `${selector} keeps the readable measure`);
  }
});

test('rows that draw a rule on the party and instrument pages span their column too', () => {
  const window = new JSDOM(`<!doctype html><html><head><style>${flatSheet()}</style></head><body>
    <div class="subject-party"><div id="subject-sections"><section><ul class="subject-list party-bill-list"><li class="party-bill"></li></ul></section></div></div>
    <section class="wrap instrument-content"><details class="instrument-disclosure"><summary>Version</summary><p>Notes.</p></details></section>
  </body></html>`).window;
  for (const selector of ['.subject-party #subject-sections .subject-list', '.instrument-disclosure']) {
    assert.equal(window.getComputedStyle(window.document.querySelector(selector)).maxWidth, 'none', `${selector} has no max-width`);
  }
});
