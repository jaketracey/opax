// The loading animals (public/wombat.js + public/loader.css): one component and
// one stylesheet behind every loader on the site; the caller keeps the status
// role and aria-live; reduced motion stands the animal still; and nothing in
// the loader can change the size of the box the page reserved for it.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { JSDOM } from 'jsdom';
import { EMU, staleLoaderCss } from '../../scripts/build_loader_gait.mjs';

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const css = read('public/loader.css');
const module = read('public/wombat.js');
const ANIMALS = ['wombat', 'echidna', 'platypus', 'emu'];

/** Import a fresh copy of wombat.js against a jsdom page. The module waits for
 *  its stylesheet's load event, which jsdom never fetches: fire it by hand. */
async function loadLoader({ smooth = true } = {}) {
  const dom = new JSDOM('<!doctype html><html><head></head><body><div id="slot" role="status" aria-live="polite"></div></body></html>');
  const saved = { document: globalThis.document, CSS: globalThis.CSS };
  globalThis.document = dom.window.document;
  globalThis.CSS = smooth ? { registerProperty() {} } : undefined;
  const pending = import(`../public/wombat.js?case=${Math.random()}`);
  const fire = setInterval(() => dom.window.document.getElementById('wombat-styles')?.dispatchEvent(new dom.window.Event('load')), 5);
  try {
    const mod = await pending;
    return { mod, dom, restore: () => Object.assign(globalThis, saved) };
  } finally {
    clearInterval(fire);
  }
}

/** The element skeleton under a node: tag.class for each element, depth-first. */
const skeleton = (node) => [...node.querySelectorAll('*')]
  .filter((el) => !el.closest('svg') || el.matches('svg'))
  .map((el) => `${el.tagName.toLowerCase()}.${[...el.classList].filter((c) => !c.startsWith('wb-a-') && c !== 'wb-quad').join('.')}`);

test('the gait region of loader.css matches its generator', () => {
  assert.equal(staleLoaderCss(), null, 'run `node scripts/build_loader_gait.mjs` and commit the result');
});

test('the emu is drawn on the joints its gait turns about', () => {
  const point = (name) => module.match(new RegExp(`const ${name} = \\[([\\d.]+), ([\\d.]+)\\];`)).slice(1).map(Number);
  assert.deepEqual(point('HIP'), EMU.hip);
  assert.deepEqual(point('KNEE'), EMU.knee);
  assert.deepEqual(point('HEEL'), EMU.heel);
});

test('every loader on the site mounts the one shared component', () => {
  // The callers: the Ask, search and page loaders, the money explainer, the
  // conversation and then-vs-now (stamped imports), and the money map's flow
  // explainer (graph/explain.ts, a bare path from its bundle).
  const stamped = new Set();
  for (const file of ['public/app.js', 'public/thenvsnow.js']) {
    const text = read(file);
    const urls = [...text.matchAll(/import\(\s*["'](\/wombat\.js[^"']*)["']\s*\)/g)].map((m) => m[1]);
    assert.ok(urls.length, `${file} imports the loader`);
    urls.forEach((url) => stamped.add(url));
    assert.match(text, /\.mountWombat\(/, `${file} mounts it`);
  }
  assert.equal(stamped.size, 1, `one loader URL across the callers: ${[...stamped].join(', ')}`);
  assert.match(read('graph/explain.ts'), /importRuntime\('\/wombat\.js'\)/);
  // Nobody else draws a loader of their own, and the module links the one sheet.
  const own = readdirSync(new URL('../public/', import.meta.url))
    .filter((name) => /\.(js|css|html)$/.test(name) && !['wombat.js', 'loader.css', 'wb-test.html', 'st-test.html'].includes(name))
    .filter((name) => /wb-(stage|trundle|svg)\b/.test(read(`public/${name}`)) && !/^spa-shell|^explain/.test(name));
  assert.deepEqual(own, []);
  assert.match(module, /const STYLESHEET = "\/loader\.css\?v=[\w.-]+";/);
  assert.doesNotMatch(module, /createElement\("style"\)/, 'no styles injected from the module');
});

test('every animal mounts the same markup, and the caller keeps role and aria-live', async () => {
  const { mod, dom, restore } = await loadLoader();
  try {
    const slot = dom.window.document.getElementById('slot');
    const shapes = new Set();
    for (const animal of ANIMALS) {
      const handle = mod.mountWombat(slot, { label: 'Checking the record.', animal });
      const wrap = slot.lastElementChild;
      assert.equal(wrap.className, 'wb-wrap');
      shapes.add(JSON.stringify(skeleton(wrap)));
      const svg = wrap.querySelector('svg');
      assert.equal(svg.getAttribute('aria-hidden'), 'true');
      assert.equal(svg.getAttribute('focusable'), 'false');
      // A size of its own, so even an unstyled frame cannot reflow the slot.
      assert.equal(svg.getAttribute('width'), '65');
      assert.equal(svg.getAttribute('height'), '42');
      assert.equal(wrap.querySelectorAll('[role], [aria-live], [aria-busy], [aria-label]').length, 0, 'the loader adds no live region of its own');
      // One short sentence: plain text, with painted dots that are hidden from assistive tech.
      assert.equal(wrap.querySelector('.wb-label-text').textContent, 'Checking the record');
      assert.equal(wrap.querySelector('.wb-dots').getAttribute('aria-hidden'), 'true');
      handle.setLabel('Still digging (12s). Long questions can take a minute.');
      assert.equal(wrap.querySelector('.wb-label-text').textContent, 'Still digging (12s). Long questions can take a minute.');
      assert.equal(wrap.querySelector('.wb-dots').hidden, true);
      handle.destroy();
      assert.equal(slot.children.length, 0);
    }
    assert.equal(shapes.size, 1, 'one markup skeleton for every animal');
    assert.equal(slot.getAttribute('role'), 'status');
    assert.equal(slot.getAttribute('aria-live'), 'polite');
    // The sheet is linked once, however many loaders mount.
    mod.mountWombat(slot, { label: 'One.' });
    mod.mountWombat(slot, { label: 'Two.' });
    assert.equal(dom.window.document.querySelectorAll('#wombat-styles').length, 1);
    assert.equal(dom.window.document.querySelectorAll('style').length, 0);
    // Each emu's ground shadow gets its own gradient id.
    mod.mountWombat(slot, { label: '', animal: 'emu' });
    mod.mountWombat(slot, { label: '', animal: 'emu' });
    const ids = [...slot.querySelectorAll('radialGradient')].map((g) => g.id);
    assert.equal(new Set(ids).size, ids.length);
  } finally {
    restore();
  }
});

test('a browser without registered properties gets the still pose', async () => {
  const { mod, dom, restore } = await loadLoader({ smooth: false });
  try {
    mod.mountWombat(dom.window.document.getElementById('slot'), { animal: 'emu' });
    assert.ok(dom.window.document.querySelector('.wb-wrap').classList.contains('wb-still'));
  } finally {
    restore();
  }
});

// --- the stylesheet ------------------------------------------------------------

const strip = (text) => text.replace(/\/\*[\s\S]*?\*\//g, '');
/** The body of the first block that opens with `head`, braces balanced. */
function block(text, head) {
  const start = text.indexOf(head);
  assert.ok(start >= 0, `${head} is in loader.css`);
  let depth = 0;
  for (let i = text.indexOf('{', start); i < text.length; i++) {
    if (text[i] === '{') depth++;
    if (text[i] === '}' && --depth === 0) return text.slice(text.indexOf('{', start) + 1, i);
  }
  throw new Error(`unbalanced ${head}`);
}
/** [selector, declarations] for the plain rules in a stretch of CSS (no at-rules). */
const rules = (text) => [...text.matchAll(/([^{}@]+)\{([^{}]*)\}/g)].map(([, sel, body]) => [sel.trim(), body]);
const keyframes = (text) => new Map([...text.matchAll(/@keyframes ([\w-]+) \{/g)].map(([, name]) => [name, block(text, `@keyframes ${name} {`)]));

test('reduced motion stops the walk: the animal stands, at most breathing', () => {
  const plain = strip(css);
  const reduced = block(plain, '@media (prefers-reduced-motion: reduce)');
  const outside = plain.replace(/@media[^{]*\{(?:[^{}]*\{[^{}]*\})*[^{}]*\}/g, '').replace(/@keyframes[^{]*\{(?:[^{}]*\{[^{}]*\})*[^{}]*\}/g, '');
  // Every rule that animates anything is overridden under reduced motion by a
  // rule on the same element that is at least as specific (it comes later).
  const specificity = (selector) => [
    (selector.match(/#[\w-]+/g) ?? []).length,
    (selector.match(/\.[\w-]+|\[[^\]]*\]|:(?!:)[\w-]+(?:\([^)]*\))?/g) ?? []).length,
    (selector.replace(/\([^)]*\)/g, '').match(/(?:^|[\s>+~])[a-z][\w-]*/gi) ?? []).length,
  ];
  const atLeast = (a, b) => (a[0] !== b[0] ? a[0] > b[0] : a[1] !== b[1] ? a[1] > b[1] : a[2] >= b[2]);
  const subject = (selector) => selector.trim().split(/\s+/).pop().replace(/:[\w-]+(?:\([^)]*\))?/g, '');
  const stoppers = rules(reduced).flatMap(([selector, body]) => selector.split(',').map((one) => [one.trim(), body]));
  let checked = 0;
  for (const [selector, body] of rules(outside)) {
    if (!/(^|;)\s*animation(-name)?\s*:/.test(body) || /animation\s*:\s*none/.test(body)) continue;
    for (const one of selector.split(',').map((x) => x.trim())) {
      const stop = stoppers.find(([s]) => subject(s) === subject(one) && atLeast(specificity(s), specificity(one)));
      assert.ok(stop, `${one} animates and nothing under reduced motion outranks it`);
      assert.match(stop[1], /animation\s*:\s*(none|wb-breathe\b)/, `${one} under reduced motion`);
      checked++;
    }
  }
  assert.ok(checked >= 8, `checked ${checked} animated rules`);
  const trundle = stoppers.find(([s]) => s === '.wb-trundle');
  assert.match(trundle[1], /animation\s*:\s*none/, 'no walking across the stage');
  // The only motion left is a fade.
  const breathe = keyframes(plain).get('wb-breathe');
  assert.deepEqual([...new Set([...breathe.matchAll(/([\w-]+)\s*:/g)].map((m) => m[1]))], ['opacity']);
  // Standing means the drawn pose: every joint's swing starts at zero.
  for (const [, name, initial] of plain.matchAll(/@property (--wb-[\w-]+) \{[^}]*initial-value: ([^;]+);/g))
    assert.equal(initial.trim(), '0', `${name} rests at 0`);
});

test('the loader keeps the box it was given: no motion touches layout', () => {
  const plain = strip(css);
  const allowed = /^(transform|opacity|animation-timing-function|--wb-[\w-]+)$/;
  for (const [name, body] of keyframes(plain)) {
    const props = new Set([...body.matchAll(/([\w-]+)\s*:/g)].map((m) => m[1]));
    for (const prop of props) assert.match(prop, allowed, `@keyframes ${name} animates ${prop}`);
  }
  // The reserved box: the stage, the walker inside it and the label under it.
  const rule = (selector) => rules(plain.replace(/@[^{]*\{(?:[^{}]*\{[^{}]*\})*[^{}]*\}/g, '')).find(([s]) => s === selector)?.[1] ?? '';
  assert.match(rule('.wb-stage'), /width: 320px;[\s\S]*height: 48px;/);
  assert.match(rule('.wb-trundle'), /width: 65px; height: 42px;/);
  assert.match(rule('.wb-label'), /margin: var\(--space-line\) 0 0;[\s\S]*font: var\(--type-metadata\);/);
  // Nothing transitions, and the walker moves by transform alone.
  assert.doesNotMatch(plain, /transition\s*:/);
  assert.match(block(plain, '@keyframes wb-trundle {'), /^\s*0%\s+\{ transform: translateX\(/);
});

test('the loader is drawn in the design tokens', () => {
  const plain = strip(css);
  assert.doesNotMatch(plain + module, /#[0-9a-fA-F]{3,8}\b(?![\w-])/, 'no raw hex colours');
  for (const token of ['--bronze-ink', '--bronze', '--paper', '--line-control', '--ink-soft', '--type-metadata', '--ambient-loop', '--space-group', '--space-line', '--border-hairline'])
    assert.ok(plain.includes(`var(${token})`), `uses ${token}`);
});
