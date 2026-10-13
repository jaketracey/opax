// ⋯, the page-actions menu (public/page-actions-menu.js, public/page-actions.css):
// one popover for every ⋯ on the site. It opens and closes from its button, an
// outside click and Escape; focus comes back to the button; the aria states
// follow it; the arrows, Home, End and Tab work as a menu's do; one is open at a
// time; it stays inside a 390px viewport; and opening it changes nothing in the
// document flow (the bug: on a phone the old details sheet opened in place and
// pushed the page down).
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { JSDOM } from 'jsdom';
import { pageMenuHTML, initPageMenus } from '../public/page-actions-menu.js';

const read = (name) => readFileSync(new URL(`../public/${name}`, import.meta.url), 'utf8');
const css = read('page-actions.css');

function page({ width = 390, height = 800 } = {}) {
  const bill = pageMenuHTML([
    { href: '/ask?q=bill', label: 'Search the record for this bill' },
    { href: 'https://www.aph.gov.au/', label: 'Official bill home' },
    { action: 'copy', label: 'Copy link', detail: 'To this page' },
  ], 'More for this bill', { id: 'bill-more' });
  const other = pageMenuHTML([{ href: '/bills', label: 'All bills' }], 'More about this section', { id: 'other-more' });
  const dom = new JSDOM(`<!doctype html><html><head><style>${css}</style></head><body>
    <main>
      <div class="subject-head bill-head"><h1>A bill</h1><div class="page-actions bill-actions">${bill}</div></div>
      <p id="below">The content under the head.</p>
      <details class="ui-pop ui-source" id="source"><summary>Updated today</summary><div class="ui-sheet">Notes</div></details>
      <div class="report-essay-head">${other}</div>
      <button type="button" id="outside">Elsewhere</button>
    </main></body></html>`, { pretendToBeVisual: true });
  const { window: win } = dom;
  const doc = win.document;
  Object.defineProperty(win, 'innerWidth', { value: width, configurable: true });
  Object.defineProperty(win, 'innerHeight', { value: height, configurable: true });
  const api = initPageMenus(doc, win);
  const menu = doc.getElementById('bill-more');
  const button = menu.querySelector('.page-menu-button');
  const list = menu.querySelector('.page-menu-list');
  const items = [...list.querySelectorAll('.page-menu-item')];
  const key = (target, k, init = {}) => {
    const e = new win.KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true, ...init });
    target.dispatchEvent(e);
    return e;
  };
  return { dom, win, doc, api, menu, button, list, items, key, other: doc.getElementById('other-more') };
}

test('⋯ opens and closes from its button, and the aria states follow', () => {
  const { button, list, menu, items, doc } = page();
  assert.equal(button.getAttribute('aria-haspopup'), 'menu');
  assert.equal(button.getAttribute('aria-controls'), list.id);
  assert.equal(list.getAttribute('role'), 'menu');
  assert.ok(items.every((el) => el.getAttribute('role') === 'menuitem' && el.getAttribute('tabindex') === '-1'));
  assert.ok([...list.children].every((li) => li.getAttribute('role') === 'none'));
  assert.equal(button.getAttribute('aria-expanded'), 'false');
  assert.equal(list.hidden, true);

  button.click();
  assert.equal(button.getAttribute('aria-expanded'), 'true');
  assert.equal(list.hidden, false);
  assert.ok(menu.classList.contains('is-open'));
  assert.equal(doc.activeElement, items[0], 'opening focuses the first item');

  button.click();
  assert.equal(button.getAttribute('aria-expanded'), 'false');
  assert.equal(list.hidden, true);
  assert.equal(doc.activeElement, button, 'closing from the button keeps focus on it');
});

test('⋯ closes on a click outside, not on a click inside; a link closes it as it goes', () => {
  const { button, list, items, doc } = page();
  button.click();
  list.click(); // the list's own padding
  assert.equal(list.hidden, false);
  items[2].click(); // a button item keeps it open for its own feedback
  assert.equal(list.hidden, false);
  doc.getElementById('outside').click();
  assert.equal(list.hidden, true);
  assert.equal(button.getAttribute('aria-expanded'), 'false');

  button.click();
  items[0].addEventListener('click', (e) => e.preventDefault(), { once: true }); // no navigation in jsdom
  items[0].click();
  assert.equal(list.hidden, true);
  assert.equal(doc.activeElement, button, 'focus does not fall to the body');
});

test('Escape closes ⋯, returns focus to its button, and is heard before the page', () => {
  const { button, list, items, key, doc, win } = page();
  let pageHeard = false;
  // The header search listens on the document, capturing; the dock, bubbling.
  doc.addEventListener('keydown', () => { pageHeard = true; }, true);
  win.addEventListener('keydown', () => { pageHeard = true; });
  button.click();
  items[1].focus();
  const e = key(items[1], 'Escape');
  assert.equal(list.hidden, true);
  assert.equal(doc.activeElement, button);
  assert.equal(button.getAttribute('aria-expanded'), 'false');
  assert.ok(e.defaultPrevented);
  assert.equal(pageHeard, false, 'the header search and the docked assistant do not also close');
  // Escape on a closed button is left to the page.
  const later = key(button, 'Escape');
  assert.ok(!later.defaultPrevented);
});

test('⋯ keyboard: arrows wrap, Home and End go to the ends, arrows on the closed button open it at an end', () => {
  const { button, list, items, key, doc } = page();
  const down = key(button, 'ArrowDown');
  assert.ok(down.defaultPrevented);
  assert.equal(list.hidden, false);
  assert.equal(doc.activeElement, items[0]);
  key(items[0], 'ArrowDown');
  assert.equal(doc.activeElement, items[1]);
  key(items[1], 'End');
  assert.equal(doc.activeElement, items[2]);
  key(items[2], 'ArrowDown');
  assert.equal(doc.activeElement, items[0], 'wraps at the end');
  key(items[0], 'ArrowUp');
  assert.equal(doc.activeElement, items[2], 'and at the start');
  key(items[2], 'Home');
  assert.equal(doc.activeElement, items[0]);

  key(items[0], 'Escape');
  key(button, 'ArrowUp');
  assert.equal(list.hidden, false);
  assert.equal(doc.activeElement, items[2], 'ArrowUp opens it at the last item');
  key(items[2], 'Escape');

  // Home on a closed button is the page's.
  const home = key(button, 'Home');
  assert.ok(list.hidden && !home.defaultPrevented);
  // A disabled item is skipped.
  button.click();
  const exporting = list.querySelector('button.page-menu-item');
  exporting.disabled = true;
  key(items[0], 'End');
  assert.equal(doc.activeElement, items[1]);
});

test('Tab closes ⋯ and moves on from its button', () => {
  const { button, list, items, key, doc } = page();
  button.click();
  const e = key(items[0], 'Tab');
  assert.equal(list.hidden, true);
  assert.equal(button.getAttribute('aria-expanded'), 'false');
  assert.equal(doc.activeElement, button, 'the browser’s Tab continues from the button');
  assert.ok(!e.defaultPrevented, 'Tab is not swallowed');
  button.click();
  key(items[1], 'Tab', { shiftKey: true });
  assert.equal(list.hidden, true);
});

test('focus leaving ⋯ closes it; focus moving inside does not', () => {
  const { button, list, items, doc, win } = page();
  button.click();
  items[0].dispatchEvent(new win.FocusEvent('focusout', { bubbles: true, relatedTarget: items[1] }));
  assert.equal(list.hidden, false);
  items[0].dispatchEvent(new win.FocusEvent('focusout', { bubbles: true, relatedTarget: null }));
  assert.equal(list.hidden, false, 'a click on the list text sends focus nowhere');
  items[0].dispatchEvent(new win.FocusEvent('focusout', { bubbles: true, relatedTarget: doc.getElementById('outside') }));
  assert.equal(list.hidden, true);
});

test('one ⋯ open at a time, and opening one closes an open source sheet', () => {
  const { button, list, other, doc, api } = page();
  const source = doc.getElementById('source');
  source.open = true;
  button.click();
  assert.equal(source.open, false);
  other.querySelector('.page-menu-button').click();
  assert.equal(list.hidden, true);
  assert.equal(button.getAttribute('aria-expanded'), 'false');
  assert.equal(other.querySelector('.page-menu-list').hidden, false);
  api.closeAll();
  assert.equal(other.querySelector('.page-menu-list').hidden, true);
  assert.equal(initPageMenus(doc, doc.defaultView), api, 'installed once per document');
});

test('opening ⋯ changes nothing in the document flow: the list is out of flow and only it and the button change', () => {
  const { button, list, menu, doc, win } = page();
  // Everything but the menu itself, attribute for attribute.
  const flow = () => {
    const clone = doc.body.cloneNode(true);
    clone.querySelector('#bill-more').replaceWith('⋯');
    return clone.outerHTML;
  };
  const before = flow();
  const style = (el) => { const s = win.getComputedStyle(el); return [s.display, s.position, s.width, s.height, s.margin]; };
  const wrapperBefore = style(menu);
  const buttonBefore = style(button);
  button.click();
  assert.equal(flow(), before);
  assert.deepEqual(style(menu), wrapperBefore, 'the wrapper keeps its box');
  assert.deepEqual(style(button), buttonBefore);
  assert.equal(win.getComputedStyle(list).position, 'absolute');
  assert.equal(win.getComputedStyle(menu).position, 'relative');

  // No rule for the open state, at any width, puts the list back in flow or
  // changes the size of anything around it.
  assert.doesNotMatch(css, /\.page-menu-list[^{]*\{[^}]*position:\s*(static|relative)/);
  for (const [, selector, body] of css.matchAll(/([^{}]*(?:is-open|aria-expanded|:not\(\[hidden\]\))[^{}]*)\{([^}]*)\}/g)) {
    for (const decl of body.split(';').map((d) => d.trim()).filter(Boolean)) {
      assert.match(decl, /^(background|animation)\b/, `${selector.trim()} only repaints: ${decl}`);
    }
  }
  const site = read('style.css');
  assert.doesNotMatch(site, /\.page-menu[^{]*\{[^}]*(flex-basis|position:\s*static)/);
  assert.doesNotMatch(site, /ui-more\[open\]|#search-more\[open\]/, 'the in-place sheet rules are gone');
});

test('⋯ stays inside a 390px viewport: it aligns to the button’s end, shifts in, or opens upward', () => {
  const { menu, button, list } = page({ width: 390, height: 800 });
  // A layout stand-in: where the list sits for the button, its alignment and shift.
  let btn = { left: 330, right: 374, top: 100, bottom: 144, width: 44, height: 44 };
  let size = { width: 256, height: 180 };
  button.getBoundingClientRect = () => btn;
  list.getBoundingClientRect = () => {
    const shift = parseFloat(list.style.getPropertyValue('--page-menu-shift')) || 0;
    const left = (menu.dataset.align === 'end' ? btn.right - size.width : btn.left) + shift;
    const top = menu.dataset.side === 'top' ? btn.top - 6 - size.height : btn.bottom + 6;
    return { left, right: left + size.width, top, bottom: top + size.height, ...size };
  };
  const inside = () => {
    const r = list.getBoundingClientRect();
    return r.left >= 8 && r.right <= 382 && r.top >= 8 && r.bottom <= 792;
  };

  button.click(); // a person page's ⋯, at the right edge
  assert.equal(menu.dataset.align, 'end');
  assert.ok(inside());
  button.click();

  btn = { ...btn, left: 16, right: 60 }; // a bill page's ⋯, at the left
  button.click();
  assert.equal(menu.dataset.align, undefined);
  assert.ok(inside());
  button.click();

  btn = { ...btn, left: 120, right: 164 }; // a wide menu from the middle: shifted in
  size = { width: 374, height: 180 };
  button.click();
  assert.ok(inside(), JSON.stringify(list.getBoundingClientRect()));
  assert.ok(list.style.getPropertyValue('--page-menu-shift'));
  button.click();

  btn = { ...btn, top: 700, bottom: 744 }; // near the bottom of the screen: upward
  size = { width: 256, height: 180 };
  button.click();
  assert.equal(menu.dataset.side, 'top');
  assert.ok(inside());
  button.click();
  btn = { ...btn, top: 100, bottom: 144 };
  button.click();
  assert.equal(menu.dataset.side, undefined, 'placement is worked out afresh on each open');
});

test('motion is restrained and stops under prefers-reduced-motion', () => {
  const motion = css.match(/@media \(prefers-reduced-motion: no-preference\) \{([\s\S]*?)\n\}/)?.[1] || '';
  assert.match(motion, /\.page-menu-list:not\(\[hidden\]\) \{ animation: page-menu-in var\(--duration-quick\)/);
  assert.doesNotMatch(css.replace(motion, ''), /animation:/, 'the only animation sits behind no-preference');
  assert.match(css, /@media \(prefers-reduced-motion: reduce\) \{\s*\.page-menu-button \{ transition: none; \}/);
});

test('every ⋯ on the site is this menu: the static toolbars, the renderers and the stamps', () => {
  const index = read('index.html');
  const dom = new JSDOM(index);
  const doc = dom.window.document;
  for (const id of ['search-more', 'money-more']) {
    const menu = doc.getElementById(id);
    assert.ok(menu?.classList.contains('page-menu'), id);
    const button = menu.querySelector(':scope > .page-menu-button');
    const list = menu.querySelector(':scope > .page-menu-list');
    assert.equal(button.getAttribute('aria-haspopup'), 'menu');
    assert.equal(button.getAttribute('aria-expanded'), 'false');
    assert.equal(button.getAttribute('aria-controls'), list.id);
    assert.equal(list.getAttribute('role'), 'menu');
    assert.ok(list.hidden);
    assert.ok([...list.querySelectorAll('.page-menu-item')].every((el) => el.getAttribute('role') === 'menuitem'));
  }
  // The wiring the pages kept: the search exports, the copy link, the full map.
  assert.ok(doc.querySelector('#search-more #search-copylink'));
  assert.equal(doc.querySelectorAll('#search-more [data-format]').length, 3);
  assert.ok(doc.querySelector('#money-more [data-full-map]'));
  assert.equal(doc.querySelector('details.ui-more'), null);
  assert.match(index, /<link rel="stylesheet" href="\/page-actions\.css\?v=[0-9a-f]{10}">/);

  const app = read('app.js');
  assert.match(app, /window\.opaxPageMenus\?\.close\(\$\("search-more"\)\)/);
  assert.doesNotMatch(app, /\$\("search-more"\)\.open/);
  assert.equal((app.match(/<div class="page-actions[ "]/g) || []).length, 5, 'the five page-action rows in app.js');
  // app.js draws ⋯ with the module's markup and gives every ⋯ its behaviour at boot,
  // before the first render; electorates.js draws it with the same markup.
  assert.match(app, /const pageMenusReady = import\('\/page-actions-menu\.js\?v=[0-9a-f]{10}'\)\.then/);
  assert.match(app, /module\.initPageMenus\(document, window\); mountPendingPageMenus\(\)/);
  assert.match(app, /data-pending-page-menu=/);
  assert.doesNotMatch(app, /Promise\.allSettled\(\[[^\]]*\bpageMenusReady\b[^\]]*\]\)\.finally/);
  assert.match(read('electorates.js'), /^import \{ pageMenuHTML as moreMenuHTML \} from '\.\/page-actions-menu\.js\?v=[0-9a-f]{10}';$/m);
  assert.match(read('electorates.js'), /<div class="page-actions">\$\{moreMenuHTML\(/);
});

test('⋯ stays out of the analytics bundle: importing it does nothing, and labels.js does not reach it', async () => {
  const source = read('page-actions-menu.js');
  // No statement at the top level but imports, declarations and exports.
  for (const line of source.split('\n')) {
    if (!line || /^[\s/*]/.test(line) || line.startsWith('}')) continue;
    assert.match(line, /^(export |const |let |function |import )/, `a top-level statement runs on import: ${line}`);
  }
  // Importing it into a document adds no listeners and no globals.
  const dom = new JSDOM('<!doctype html><body></body>', { runScripts: 'outside-only' });
  let added = 0;
  for (const target of [dom.window, dom.window.document]) {
    const add = target.addEventListener.bind(target);
    target.addEventListener = (...args) => { added += 1; return add(...args); };
  }
  dom.window.eval(source.replace(/^export /gm, ''));
  assert.equal(added, 0);
  assert.equal(dom.window.opaxPageMenus, undefined);
  // events.js bundles growth-modules.js, which imports labels.js: ⋯ is in neither.
  for (const name of ['labels.js', 'growth-modules.js']) {
    assert.doesNotMatch(read(name), /(?:from\s*|import\(\s*)['"][^'"]*page-actions-menu|moreMenuHTML|class="page-menu/, name);
  }
  const events = read('events.js');
  assert.doesNotMatch(events, /page-menu|opaxPageMenus|aria-haspopup/, 'the built analytics bundle carries no menu code');
});
