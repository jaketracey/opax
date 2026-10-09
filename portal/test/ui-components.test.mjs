// The web's shared components (docs/design/DESIGN-REVIEW-2026-10.md §5.2, pass 2C):
// the five labels and the source line as app.js writes them, the rules that draw
// them (pills for what you press, 4px for what you read, sentence case, focus,
// touch targets, forced colours, reduced motion), the end of the floating Ask
// pill, and the SourceLine sheet's keyboard and dismiss behaviour.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';

const read = (name) => readFileSync(new URL(`../public/${name}`, import.meta.url), 'utf8');
const app = read('app.js');
const style = read('style.css');
const controls = read('ui-controls.css');
const sourceCss = read('ui-source.css');

/** A top-level function's source, by brace matching from its declaration. */
function fn(name) {
  const start = app.indexOf(`\nfunction ${name}(`);
  assert.ok(start >= 0, `app.js declares ${name}`);
  // Past the parameter list first: a destructured default has braces of its own.
  let parens = 0, body = start + app.slice(start).indexOf('(');
  for (; body < app.length; body++) {
    if (app[body] === '(') parens++;
    else if (app[body] === ')' && --parens === 0) break;
  }
  let depth = 0;
  for (let i = app.indexOf('{', body); i < app.length; i++) {
    if (app[i] === '{') depth++;
    else if (app[i] === '}' && --depth === 0) return app.slice(start, i + 1);
  }
  throw new Error(`unbalanced ${name}`);
}
const constant = (name) => app.slice(app.indexOf(`const ${name} =`), app.indexOf('\n};', app.indexOf(`const ${name} =`)) + 3);

const labels = app.slice(app.indexOf('// labels:begin'), app.indexOf('// labels:end'));
const helpers = runInNewContext(`
  const MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
  ${constant('PARTY_MAP')}
  ${fn('esc')} ${fn('hasEntityId')} ${fn('entityHrefAttr')} ${fn('safeUrl')} ${fn('fmtDate')} ${fn('partyClass')} ${fn('partyDotHTML')}
  ${labels}
  ({ partyChipHTML, partyDotHTML, statusLabelHTML, tagHTML, machineLabelHTML, sourceLineHTML, fineprintSourceHTML });
`, { URL });

const text = (html) => html.replace(/<span class="visually-hidden">.*?<\/span>/g, '').replace(/<[^>]+>/g, '').trim();

// --- the five labels -----------------------------------------------------------

test('PartyLabel: a dot and the party name in sentence case, the full name spoken', () => {
  const { partyChipHTML } = helpers;
  const labor = partyChipHTML('Labor');
  assert.match(labor, /^<span class="ui-party party party-alp"/);
  assert.match(labor, /<i aria-hidden="true"><\/i>/);
  assert.equal(text(labor), 'Labor');
  assert.match(labor, /visually-hidden">Australian Labor Party</);
  assert.equal(text(partyChipHTML('greens')), 'Greens');
  const lnp = partyChipHTML('LNP');
  assert.match(lnp, /<span aria-hidden="true">LNP<\/span><span class="visually-hidden">Liberal National Party<\/span>/);
  assert.match(lnp, /title="Liberal National Party"/);
  assert.equal(text(partyChipHTML('LNP', { full: true })), 'Liberal National Party');
  assert.doesNotMatch(partyChipHTML('LNP', { full: true }), /visually-hidden/);
});

test('PartyLabel: no fake party for a missing one, no clipped names for an unmapped one', () => {
  const { partyChipHTML, partyDotHTML } = helpers;
  for (const none of ['', null, undefined, 'Not recorded', 'unknown', 'N/A', '—']) assert.equal(partyChipHTML(none), '', String(none));
  const long = partyChipHTML('Shooters, Fishers and Farmers');
  assert.match(long, /party-oth/);
  assert.equal(text(long), 'Shooters, Fishers and Farmers');
  assert.match(partyChipHTML('<b>x</b>'), /&lt;b&gt;x&lt;\/b&gt;/);
  // The dot alone still says whose it is.
  assert.match(partyDotHTML('Liberal'), /role="img" aria-label="Liberal Party" title="Liberal Party"/);
  assert.equal(partyDotHTML('Nobody in particular'), '');
});

test('StatusLabel and Tag: a toned word and a topic, escaped, nothing when empty', () => {
  const { statusLabelHTML, tagHTML } = helpers;
  assert.equal(statusLabelHTML('Passed', 'done'), '<span class="ui-status" data-tone="done">Passed</span>');
  assert.equal(statusLabelHTML('Lapsed'), '<span class="ui-status" data-tone="ended">Lapsed</span>');
  assert.equal(statusLabelHTML(''), '');
  assert.equal(tagHTML('Housing', '/subject/topic/housing'), '<a class="ui-tag" href="/subject/topic/housing">Housing</a>');
  assert.equal(tagHTML('A & B'), '<span class="ui-tag">A &amp; B</span>');
});

test('MachineLabel: one phrase; the pill opens its note, the inline form has no sheet', () => {
  const { machineLabelHTML } = helpers;
  const pill = machineLabelHTML({ note: 'Written by a model from the EM; <not> the record.' });
  assert.match(pill, /^<details class="ui-pop ui-machine"><summary><span class="ui-machine-glyph" aria-hidden="true">✦<\/span>Machine-written<\/summary>/);
  assert.match(pill, /<div class="ui-sheet"><p>Written by a model from the EM; &lt;not&gt; the record\.<\/p><\/div><\/details>$/);
  assert.match(machineLabelHTML(), /It is not part of the record/);
  const inline = machineLabelHTML({ inline: true, className: 'topic-arc-tag' });
  assert.equal(inline, '<span class="ui-machine-inline topic-arc-tag"><span class="ui-machine-glyph" aria-hidden="true">✦</span>Machine-written</span>');
  // Every machine-written label app.js draws comes from the helper, in its one phrase.
  assert.doesNotMatch(app, />Machine (?:brief|summary)</);
  assert.doesNotMatch(app, /"Machine brief"|"Machine summary"/);
  assert.doesNotMatch(app, /class="(?:doc-brief-tag|topic-arc-tag|party-brief-label)">Machine/);
});

test('SourceLine: the line, its state and its sheet in order; only safe links', () => {
  const { sourceLineHTML } = helpers;
  const html = sourceLineHTML({
    updated: '2026-10-04', source: 'AEC annual returns', state: 'partial',
    originals: [{ href: 'https://transparency.aec.gov.au/' }, { href: '/methods', label: 'How totals are counted' },
      { href: 'javascript:alert(1)' }, { href: '//evil.example' }],
    asAt: 'Financial years 1998-99 to 2025-26.', notes: ['Totals are a <b>floor</b>.', ''], licence: 'Licence: CC BY 4.0.',
  });
  assert.match(html, /^<details class="ui-pop ui-source" data-state="partial"><summary><svg class="ui-source-glyph"/);
  assert.equal(text(html.slice(0, html.indexOf('</summary>'))), 'Updated 4 Oct 2026 · AEC annual returns· partial');
  assert.match(html, /<span class="ui-source-name">AEC annual returns<\/span>/);
  const sheet = html.slice(html.indexOf('<div class="ui-sheet">'));
  assert.match(sheet, /<li><a href="https:\/\/transparency\.aec\.gov\.au\/" rel="noopener" target="_blank">View original ↗︎<\/a><\/li>/);
  assert.match(sheet, /<li><a href="\/methods">How totals are counted<\/a><\/li>/);
  assert.doesNotMatch(sheet, /javascript:|evil\.example/);
  const order = ['ui-sheet-originals', 'ui-sheet-asat', 'ui-sheet-notes', 'ui-sheet-licence'].map((c) => sheet.indexOf(c));
  assert.deepEqual([...order].sort((a, b) => a - b), order, 'originals, as-at, notes, licence');
  assert.match(sheet, /<div class="ui-sheet-notes"><p>Totals are a <b>floor<\/b>\.<\/p><\/div>/);
  assert.match(html, /<\/div><\/details>$/);
});

test('SourceLine: a bare line still names itself; the fine-print adapter keeps the note', () => {
  const { sourceLineHTML, fineprintSourceHTML } = helpers;
  const bare = sourceLineHTML();
  assert.match(bare, /<span class="ui-source-name">Sources and notes<\/span>/);
  assert.doesNotMatch(bare, /data-state/);
  assert.match(bare, /No further notes for this source/);
  assert.equal(text(sourceLineHTML({ source: 'Hansard' }).split('</summary>')[0]), 'Hansard');
  const adapted = fineprintSourceHTML('Entries as declared, <a href="/x">not verified</a>.', { source: 'Register of interests', updated: '2026-09-02', notes: ['Second note.'] });
  assert.match(adapted, /Updated 2 Sep 2026 · <span class="ui-source-name">Register of interests<\/span>/);
  assert.match(adapted, /<div class="ui-sheet-notes"><p>Entries as declared, <a href="\/x">not verified<\/a>\.<\/p><p>Second note\.<\/p><\/div>/);
});

// --- the rules that draw them ----------------------------------------------------

/** A selector list's members: commas inside :is() and :not() do not split it. */
function selectors(list) {
  const out = [];
  let depth = 0, from = 0;
  for (let i = 0; i < list.length; i++) {
    if (list[i] === '(') depth++;
    else if (list[i] === ')') depth--;
    else if (list[i] === ',' && depth === 0) { out.push(list.slice(from, i).trim()); from = i + 1; }
  }
  return [...out, list.slice(from).trim()];
}
/** Every declaration block whose selector list has a member naming `selector`, joined. */
function rulesFor(css, selector) {
  // A whole class: .party is not .party-mentions.
  const named = new RegExp(`${selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?![\\w-])`);
  const out = [];
  for (const m of css.replace(/\/\*[\s\S]*?\*\//g, '').matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    if (selectors(m[1]).some((s) => named.test(s))) out.push(m[2]);
  }
  return out.join(';');
}

test('D1: things you press are pills, things you read are 4px', () => {
  assert.match(controls, /--ui-radius-press:\s*var\(--radius-pill\)/);
  assert.match(controls, /--ui-radius:\s*var\(--radius-sm\)/);
  for (const sel of [':is(button, a).ui-button {', ':is(button, a).ui-filter-chip {', '.ui-segmented {']) {
    const block = controls.slice(controls.indexOf(sel), controls.indexOf('}', controls.indexOf(sel)));
    assert.match(block, /border-radius:\s*var\(--ui-radius-press\)/, sel);
  }
  assert.match(rulesFor(controls, ':is(button, a, label).ui-chip'), /border-radius:\s*var\(--ui-radius-press\)/);
  for (const sel of ['.ui-tag', '.ui-status']) assert.match(rulesFor(controls, sel), /border-radius:\s*var\(--ui-radius\)/, sel);
  assert.match(rulesFor(controls, ':is(input, select, textarea).ui-input'), /border-radius:\s*var\(--ui-radius\)/);
  assert.match(rulesFor(sourceCss, '.ui-machine > summary'), /border-radius:\s*var\(--radius-pill\)/);
  assert.match(rulesFor(sourceCss, '.ui-sheet'), /border-radius:\s*var\(--radius-md\)/);
  // Secondary is the navy wash with no outline; the transparent border is forced colours' edge.
  const button = controls.slice(controls.indexOf(':is(button, a).ui-button {'), controls.indexOf('}', controls.indexOf(':is(button, a).ui-button {')));
  assert.match(button, /background:\s*var\(--ui-wash\)/);
  assert.match(button, /border:\s*var\(--border-hairline\) solid transparent/);
});

test('every retired label class draws as one of the five kinds', () => {
  const kinds = {
    '.ui-tag': ['.topic-chip', '.tie-tag'],
    '.ui-status': ['.doc-brief-tag', '.tie-tag-holder', '.dir-mark', '.el-elected', '.stat-live'],
    '.ui-party': ['.party'],
    ':is(button, a, label).ui-chip': [':is(button, a).chip:not(.ui-button)'],
  };
  const clean = controls.replace(/\/\*[\s\S]*?\*\//g, '');
  for (const [kind, aliases] of Object.entries(kinds)) {
    const rule = [...clean.matchAll(/([^{}]+)\{/g)].map((m) => selectors(m[1].trim())).find((list) => list.includes(kind));
    assert.ok(rule, `${kind} has a rule`);
    for (const alias of aliases) assert.ok(rule.includes(alias), `${alias} draws as ${kind}`);
  }
  // Their old looks are gone from style.css: no capsule, no uppercase of their own.
  for (const cls of ['.topic-chip', '.doc-brief-tag', '.tie-tag', '.dir-mark', '.el-elected', '.stat-live', '.party', '.chip:not(.ui-button)']) {
    const own = rulesFor(style, cls);
    assert.doesNotMatch(own, /border-radius:\s*999px|text-transform|letter-spacing|background:\s*var\(--paper-sunken\)/, cls);
  }
});

test('D6: no uppercase labels and no letter-spaced labels in the shared styles', () => {
  const body = style.slice(style.indexOf('/* tokens:end */'));
  for (const [name, css] of [['style.css', body], ['ui-controls.css', controls], ['ui-source.css', sourceCss]]) {
    assert.doesNotMatch(css, /text-transform:\s*uppercase/i, name);
  }
  for (const sel of ['.kicker', '.ui-tag', '.ui-status', '.ui-party', '.news-source', '.ms-type', '.ency-votes-label', '.dock-title']) {
    assert.doesNotMatch(rulesFor(style + controls, sel), /letter-spacing:\s*0?\.\d/, sel);
  }
  assert.match(rulesFor(style, '.kicker'), /font:\s*var\(--type-label\)/);
  assert.match(rulesFor(style, '.fineprint'), /font:\s*var\(--type-fine\)/);
});

// The money map's chrome keeps four: graph/ is the source of a committed bundle
// that deploy does not rebuild, so they go with pass 4G's restyle of graph/*.ts.
// A file may go down, never up; everything else stays at zero.
const UPPERCASE_LEFT = { 'graph/index.ts': 4 };
test('uppercase labels only go down', async () => {
  const { readdirSync, statSync } = await import('node:fs');
  const root = new URL('../', import.meta.url);
  const skip = /^public\/(chunks|money-map\.js|explain\.js|voice\.js|grants-map\.(js|css)|analytics\.js|events\.js|ga\.js)/;
  const counts = {};
  const walk = (dir) => {
    for (const name of readdirSync(new URL(dir, root))) {
      const path = `${dir}/${name}`;
      if (name === 'node_modules' || name.startsWith('.') || skip.test(path)) continue;
      if (statSync(new URL(path, root)).isDirectory()) walk(path);
      else if (/\.(css|js|mjs|html|ts)$/.test(name)) {
        const n = readFileSync(new URL(path, root), 'utf8').match(/text-transform:\s*uppercase|textTransform:\s*['"]uppercase/gi)?.length ?? 0;
        if (n) counts[path] = n;
      }
    }
  };
  for (const dir of ['public', 'graph', 'grants-map', 'voice', 'analytics']) walk(dir);
  const over = Object.entries(counts).filter(([file, n]) => n > (UPPERCASE_LEFT[file] ?? 0));
  assert.deepEqual(over, []);
});

test('focus, touch targets, reduced motion and forced colours cover every control', () => {
  const focus = controls.slice(controls.indexOf('/* ---- Focus'), controls.indexOf('/* ---- Touch'));
  for (const sel of ['.ui-button', '.ui-chip', '.chip', '.ui-filter-chip', 'a.ui-tag', 'a.topic-chip']) assert.ok(focus.includes(sel), `${sel} has the focus ring`);
  assert.match(focus, /outline:\s*var\(--border-focus\) solid var\(--bronze-ink\)/);
  assert.match(sourceCss, /\.ui-pop > summary:focus-visible \{ outline: var\(--border-focus\) solid var\(--bronze-ink\)/);
  const touch = controls.slice(controls.indexOf('@media (max-width: 1000px), (pointer: coarse)'));
  for (const sel of ['.ui-filter-chip', '.ui-chip', '.chip:not(.ui-button)', '.ui-tag', '.topic-chip']) assert.ok(touch.slice(0, touch.indexOf('}\n}')).includes(sel), `${sel} grows to 44px`);
  assert.match(touch, /min-height:\s*var\(--size-target\)/);
  // Summaries that draw smaller than 44px reach it with their hit area.
  assert.match(sourceCss, /\.ui-source > summary::after \{ content: ""; position: absolute; inset: -6px 0; \}/); // 32 + 12
  assert.match(sourceCss, /\.ui-machine > summary::after \{ content: ""; position: absolute; inset: -10px 0; \}/); // 24 inside the hairline + 20
  assert.match(controls, /@media \(prefers-reduced-motion: reduce\)[\s\S]*transition: none/);
  assert.match(sourceCss, /@media \(prefers-reduced-motion: no-preference\) \{\s*\.ui-pop\[open\] > \.ui-sheet \{ animation/);
  const forced = controls.slice(controls.indexOf('@media (forced-colors: active)'));
  assert.match(forced, /\[aria-pressed="true"\][\s\S]*outline: 2px solid Highlight/);
  assert.match(forced, /:is\(\.ui-party, \.party\) > i \{ background: CanvasText; \}/);
  assert.match(sourceCss, /@media \(forced-colors: active\) \{\s*\.ui-sheet \{ border-color: CanvasText; \}/);
  for (const [name, css] of [['ui-controls.css', controls], ['ui-source.css', sourceCss]]) {
    assert.doesNotMatch(css.replace(/url\("data:[^"]*"\)/g, ''), /#[0-9a-f]{3,8}\b/i, `${name} uses tokens only`);
  }
});

// --- no floating Ask pill ----------------------------------------------------------

test('the Ask launcher is a header icon, never a pill floating over the page', () => {
  const launcherRules = [...style.matchAll(/([^{}]*\.chat-launcher[^{}]*)\{([^{}]*)\}/g)];
  assert.ok(launcherRules.length > 0);
  for (const [, sel, body] of launcherRules) assert.doesNotMatch(body, /position:\s*fixed|box-shadow:\s*0/, sel.trim());
  assert.match(style, /\n\.chat-launcher \{ display: none; \}/);
  const band = style.slice(style.indexOf('@media (min-width: 360px) and (max-width: 800px) {\n  .site-header .chat-launcher'));
  assert.match(band, /^@media \(min-width: 360px\) and \(max-width: 800px\) \{\n  \.site-header \.chat-launcher:not\(\[hidden\]\) \{\s*display: flex/);
  assert.doesNotMatch(style + app, /assistant-ready/);
  assert.match(app, /\$\("header-search-open"\)\.before\(\$\("chat-launcher"\)\);/);
  assert.doesNotMatch(app, /home\.after\(launcher\)/);
  // The dock no longer leaves room above a pill.
  assert.match(style, /html\[data-chat="docked"\] #panel-chat \{\n  position: fixed; z-index: 70;\n  right: max\(20px, env\(safe-area-inset-right, 0px\)\);\n  bottom: max\(18px, env\(safe-area-inset-bottom, 0px\)\);/);
  // Closing the dock gives focus back to what opened it when the header shows no launcher.
  const close = fn('closeDock');
  assert.match(close, /dockOpener\?\.isConnected/);
});

test('the shell loads the source line, stamped', () => {
  const index = read('index.html');
  assert.match(index, /<link rel="stylesheet" href="\/ui-source\.css\?v=[0-9a-f]{10}">/);
  assert.match(index, /<script src="\/ui-source\.js\?v=[0-9a-f]{10}" defer><\/script>\n<script src="\/app\.js/);
  assert.ok(index.indexOf('/ui-controls.css') < index.indexOf('/ui-source.css'));
});

// --- the sheet's behaviour: Escape, light dismiss, one open, focus out ------------

class Node {
  constructor(doc, tag, classes = []) {
    Object.assign(this, { doc, tagName: tag.toUpperCase(), children: [], parent: null, dataset: {}, open: false, floating: true });
    this.classes = new Set(classes);
    this.classList = { contains: (c) => this.classes.has(c) };
    this.rect = { left: 40, right: 240, width: 200 };
  }
  append(...kids) { for (const k of kids) { k.parent = this; this.children.push(k); } return this; }
  contains(n) { for (let x = n; x; x = x.parent) if (x === this) return true; return false; }
  matches(sel) {
    const m = /^(\w+)((?:\.[\w-]+)*)(\[open\])?$/.exec(sel);
    return !!m && this.tagName === m[1].toUpperCase() && m[2].split('.').filter(Boolean).every((c) => this.classes.has(c)) && (!m[3] || this.open);
  }
  closest(sel) { for (let x = this; x; x = x.parent) if (x.matches(sel)) return x; return null; }
  focus() { this.doc.activeElement = this; }
  getBoundingClientRect() { return this.rect; }
}

function page({ width = 1280 } = {}) {
  const listeners = [];
  const doc = {
    activeElement: null, pops: [],
    addEventListener: (type, handler, capture = false) => listeners.push({ type, handler, capture }),
    querySelectorAll: (sel) => (sel === 'details.ui-pop[open]' ? doc.pops.filter((p) => p.open) : []),
  };
  const make = (classes = ['ui-pop', 'ui-source']) => {
    const pop = new Node(doc, 'details', classes);
    const summary = new Node(doc, 'summary');
    const sheet = new Node(doc, 'div', ['ui-sheet']);
    const link = new Node(doc, 'a');
    sheet.append(link);
    pop.append(summary, sheet);
    doc.pops.push(pop);
    return { pop, summary, sheet, link };
  };
  const win = {
    innerWidth: width,
    getComputedStyle: (el) => ({ position: el.parent?.floating ? 'absolute' : 'static' }),
  };
  const context = { document: doc, window: win };
  runInNewContext(read('ui-source.js'), context);
  const on = (type) => listeners.find((l) => l.type === type);
  const event = (props) => ({ defaultPrevented: false, stopped: false, preventDefault() { this.defaultPrevented = true; }, stopPropagation() { this.stopped = true; }, ...props });
  return { doc, make, on, event, api: win.opaxSourceLines, outside: new Node(doc, 'button') };
}

test('SourceLine: Escape closes the open sheet, returns focus to its line, and is heard first', () => {
  const { make, on, event, doc } = page();
  const { pop, summary, link } = make();
  pop.open = true;
  link.focus();
  const keydown = on('keydown');
  assert.equal(keydown.capture, true, 'heard before the dock’s own Escape handler');
  const e = event({ key: 'Escape', target: link });
  keydown.handler(e);
  assert.equal(pop.open, false);
  assert.equal(doc.activeElement, summary);
  assert.ok(e.defaultPrevented && e.stopped);
  // From the line itself too.
  pop.open = true;
  keydown.handler(event({ key: 'Escape', target: summary }));
  assert.equal(pop.open, false);
});

test('SourceLine: Escape elsewhere, or on a closed line, is left to the page', () => {
  const { make, on, event, outside } = page();
  const { summary } = make();
  for (const target of [outside, summary]) {
    const e = event({ key: 'Escape', target });
    on('keydown').handler(e);
    assert.ok(!e.defaultPrevented && !e.stopped);
  }
  const { pop } = make();
  pop.open = true;
  const enter = event({ key: 'Enter', target: pop.children[0] });
  on('keydown').handler(enter);
  assert.equal(pop.open, true, 'Enter and Space stay the browser’s own toggle');
});

test('SourceLine: a press outside closes it; a press inside does not', () => {
  const { make, on, event, outside } = page();
  const { pop, link } = make();
  pop.open = true;
  on('click').handler(event({ target: link }));
  assert.equal(pop.open, true);
  on('click').handler(event({ target: outside }));
  assert.equal(pop.open, false);
  assert.equal(on('click').capture, true);
});

test('SourceLine: one sheet open at a time; a line inside another sheet keeps its parent', () => {
  const { make, on, event } = page();
  const a = make();
  const b = make(['ui-pop', 'ui-machine']);
  a.pop.open = true;
  b.pop.open = true;
  on('toggle').handler(event({ target: b.pop }));
  assert.equal(a.pop.open, false);
  assert.equal(b.pop.open, true);
  assert.equal(on('toggle').capture, true, 'toggle does not bubble');
  const nested = make();
  b.sheet.append(nested.pop);
  nested.pop.open = true;
  on('toggle').handler(event({ target: nested.pop }));
  assert.equal(b.pop.open, true);
  // A closing toggle changes nothing.
  a.pop.open = false;
  on('toggle').handler(event({ target: a.pop }));
  assert.equal(b.pop.open, true);
});

test('SourceLine: tabbing past a floating sheet closes it; a click on its text or an inline sheet does not', () => {
  const { make, on, event, outside } = page();
  const { pop, link, summary } = make();
  pop.open = true;
  on('focusout').handler(event({ target: link, relatedTarget: summary }));
  assert.equal(pop.open, true, 'focus moved within');
  on('focusout').handler(event({ target: link, relatedTarget: null }));
  assert.equal(pop.open, true, 'a click on the sheet text sends focus nowhere');
  on('focusout').handler(event({ target: link, relatedTarget: outside }));
  assert.equal(pop.open, false);
  pop.open = true;
  pop.floating = false; // a phone: the sheet opens in place
  on('focusout').handler(event({ target: link, relatedTarget: outside }));
  assert.equal(pop.open, true);
});

test('SourceLine: a floating sheet that would cross the right edge aligns to its line’s end', () => {
  const { make, on, event } = page({ width: 400 });
  const { pop, sheet } = make();
  sheet.rect = { width: 300 };
  pop.rect = { left: 200, right: 360, width: 160 };
  pop.open = true;
  on('toggle').handler(event({ target: pop }));
  assert.equal(pop.dataset.align, 'end');
  pop.rect = { left: 20, right: 180, width: 160 };
  on('toggle').handler(event({ target: pop }));
  assert.equal(pop.dataset.align, undefined);
  pop.floating = false;
  pop.rect = { left: 200, right: 360, width: 160 };
  on('toggle').handler(event({ target: pop }));
  assert.equal(pop.dataset.align, undefined, 'an inline sheet needs no alignment');
});
