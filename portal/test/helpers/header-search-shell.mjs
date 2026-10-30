import { readFileSync } from 'node:fs';
import { Script, SourceTextModule } from 'node:vm';
import { parentPort, workerData } from 'node:worker_threads';
import { JSDOM } from 'jsdom';
import { workerFetch, origin } from './worker-fetch.mjs';

const publicRoot = new URL('../../public/', import.meta.url);

// The page as the real Worker serves it (its scripts decided per page family).
async function shell(path) {
  const response = await workerFetch(path, workerData.env || {});
  if (response.status !== 200) throw Error('Shell returned ' + response.status);
  return response.text();
}

async function run() {
  const dom = new JSDOM(await shell(workerData.path), { url: origin + workerData.path, runScripts: 'outside-only', pretendToBeVisual: true });
  const { window } = dom;
  const context = dom.getInternalVMContext();
  // No network. Keep unrelated hydration pending; the actual script bodies,
  // module imports, DOM operations and event listeners all execute.
  const requests = [];
  window.fetch = (url, init) => { requests.push(`${init?.method || 'GET'} ${url}`); if (workerData.probe === 'suggestions' && String(url).startsWith('/api/suggest?')) return Promise.resolve({ ok: true, json: async () => ({ results: [
    { kind: 'supplier', title: 'Example supplier', href: '/subject/supplier/example' },
    { kind: 'instrument', title: 'Example instrument', href: '/instrument/example' },
    { kind: 'speech', title: 'Example speech', slug: 'example-speech' },
  ] }) }); return new Promise(() => {}); };
  window.document.fonts = { ready: new Promise(() => {}) };
  // Media queries match only where a probe asks (e.g. reduced motion).
  window.matchMedia = query => ({ matches: (workerData.media || []).some(m => query.includes(m)), media: query, addEventListener() {}, removeEventListener() {} });
  window.ResizeObserver = window.IntersectionObserver = class { observe() {} unobserve() {} disconnect() {} };
  window.scrollTo = () => {};
  window.HTMLDialogElement.prototype.showModal = function () { this.open = true; };
  window.HTMLDialogElement.prototype.close = function () { if (!this.open) return; this.open = false; this.dispatchEvent(new window.Event('close')); };
  const modules = new Map();
  const resolve = (specifier, importer = origin + '/') => new URL(specifier, importer).href;
  const source = url => readFileSync(new URL(new URL(url).pathname.slice(1), publicRoot), 'utf8');
  function moduleFor(url) {
    if (!modules.has(url)) modules.set(url, new SourceTextModule(source(url), {
      context, identifier: url, initializeImportMeta(meta) { meta.url = url; },
      importModuleDynamically: specifier => evaluateModule(resolve(specifier, url)),
    }));
    return modules.get(url);
  }
  let evaluationQueue = Promise.resolve();
  function evaluateModule(url) {
    // A module that already ran resolves at once, as in the browser: home.js
    // awaits import(navigation.js) during its own top-level evaluation, and
    // queueing that behind home.js would deadlock.
    const evaluated = modules.get(url);
    if (evaluated?.status === 'evaluated') return Promise.resolve(evaluated);
    // Several table entry points import the same core while app.js starts.
    // Complete one module graph before another graph links its shared dependencies.
    const evaluation = evaluationQueue.then(async () => {
      const module = moduleFor(url);
      if (module.status === 'unlinked') await module.link((specifier, importer) => moduleFor(resolve(specifier, importer.identifier)));
      if (module.status === 'linked') await module.evaluate();
      return module;
    });
    evaluationQueue = evaluation.catch(() => {});
    return evaluation;
  }
  function classic(url) {
    new Script(source(url), { filename: url, importModuleDynamically: specifier => evaluateModule(resolve(specifier, url)) }).runInContext(context);
  }
  const bindings = [];
  const originalAdd = window.EventTarget.prototype.addEventListener;
  window.EventTarget.prototype.addEventListener = function (type, listener, options) {
    const target = this || window;
    if (target.id === 'header-search-open' || target === window.document) bindings.push({ target: target.id || 'document', type, capture: options === true || options?.capture === true });
    return originalAdd.call(target, type, listener, options);
  };
  const entryNames = new Set(['navigation.js', 'quick-search.js', 'spa-entry.js', 'spa-shell.js', 'app.js', 'home.js']);
  const scripts = [...window.document.querySelectorAll('script[src]')].filter(node => entryNames.has(new URL(node.src).pathname.slice(1)));
  const deferredModules = [];
  try {
    // Deferred classic scripts run before the module entry points, as in Chrome.
    for (const script of scripts) {
      if (script.type === 'module') deferredModules.push(script.src);
      else classic(script.src);
    }
    for (const url of deferredModules) await evaluateModule(url);
    if (workerData.probe && workerData.probe !== 'menus') {
      window.document.dispatchEvent(new window.Event('DOMContentLoaded'));
      return await probes[workerData.probe](window, requests);
    }
    if (workerData.probe === 'menus') {
      window.document.dispatchEvent(new window.Event('DOMContentLoaded'));
      // The band's menus on this page: does each control actually open something?
      const doc = window.document;
      const drawer = doc.getElementById('nav-drawer');
      doc.getElementById('nav-open').click();
      const drawerOpen = { open: drawer.open, expanded: doc.getElementById('nav-open').getAttribute('aria-expanded') };
      const trigger = doc.querySelector('#primary-nav [data-nav-trigger]');
      trigger.click();
      const panel = doc.getElementById(trigger.getAttribute('aria-controls'));
      const menuOpen = { expanded: trigger.getAttribute('aria-expanded'), hidden: panel.hidden };
      trigger.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
      const menuEscape = { expanded: trigger.getAttribute('aria-expanded'), hidden: panel.hidden };
      const field = doc.getElementById('mast-q');
      field.value = 'housing';
      field.dispatchEvent(new window.Event('input', { bubbles: true }));
      await new Promise(r => setTimeout(r, 200));
      const suggestion = doc.querySelector('#mast-sugg .ms-row')?.textContent || null;
      return { scripts: scripts.map(node => new URL(node.src).pathname), drawerOpen, menuOpen, menuEscape, suggestion };
    }
    const toggle = window.document.getElementById('header-search-open');
    const panel = window.document.getElementById('header-search-panel');
    const field = window.document.getElementById('mast-q');
    const state = () => ({ expanded: toggle.getAttribute('aria-expanded'), hidden: panel.hidden, focus: window.document.activeElement.id });
    const clickBindings = () => bindings.filter(b => b.target === toggle.id && b.type === 'click').length;
    const escapeBindings = () => bindings.filter(b => b.target === 'document' && b.type === 'keydown' && b.capture).length;
    const initialBindings = clickBindings();
    const initialEscapeBindings = escapeBindings();
    const controller = window.OpaxQuickSearch.header;
    if (workerData.repeat) {
      // Repeat both shared scripts and ask for the disclosure again, as a second
      // consumer would. A reload must also reuse the existing controller.
      for (const name of ['navigation.js', 'quick-search.js', 'navigation.js', 'quick-search.js']) classic(resolve('/' + name));
      window.OpaxQuickSearch.disclosure(toggle, panel, field);
      window.OpaxQuickSearch.disclosure(toggle, panel, field);
    }
    toggle.click(); const first = state();
    toggle.click(); const second = state();
    toggle.click();
    field.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
    const escape = state();
    toggle.click();
    const suggestions = window.document.getElementById('mast-sugg');
    suggestions.hidden = false;
    field.setAttribute('aria-expanded', 'true');
    field.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
    const escapeWithSuggestions = state();
    toggle.click();
    window.document.body.dispatchEvent(new window.Event('pointerdown', { bubbles: true }));
    const outside = state();
    toggle.click();
    window.document.querySelector('.site-header a').focus();
    const focusOutside = state();
    return { scripts: scripts.map(node => new URL(node.src).pathname), body: window.document.body.className, initialBindings, finalBindings: clickBindings(), initialEscapeBindings, finalEscapeBindings: escapeBindings(), sameController: controller === window.OpaxQuickSearch.header, first, second, escape, escapeWithSuggestions, outside, focusOutside };
  } finally { dom.window.close(); }
}

const wait = ms => new Promise(r => setTimeout(r, ms));
const key = (window, target, k, more = {}) => target.dispatchEvent(new window.KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true, ...more }));
const probes = {
  async suggestions(window, requests) {
    const results = [];
    for (const prefix of ['mast', 'drawer']) {
      const input = window.document.getElementById(prefix + '-q');
      input.value = 'example';
      input.dispatchEvent(new window.Event('input', { bubbles: true }));
      await new Promise(resolve => setTimeout(resolve, 180));
      const panel = window.document.getElementById(prefix + '-sugg');
      const rows = [...panel.querySelectorAll('.ms-row')].map(row => row.textContent);
      input.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
      input.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
      results.push({ rows, active: input.getAttribute('aria-activedescendant') });
    }
    return { results, requests: requests.filter(url => url.includes('/api/suggest?')) };
  },
  // The standing reports' links and copy as the page draws them: menus, sheet,
  // footer, the app's panels or the home page's blocks, and the trails.
  async reports(window) {
    const doc = window.document;
    await wait(50);
    return {
      gates: doc.documentElement.dataset.navGates || '',
      links: [...new Set([...doc.querySelectorAll('a[href^="/reports"]')].map(a => a.getAttribute('href')))].sort(),
      reportsOnly: doc.querySelectorAll('[data-reports-only]').length,
      researchOption: Boolean(doc.querySelector('option[value="report"]')),
      published: window.OpaxNavigation.published('reports'),
      trail: window.OpaxNavigation.trail('/reports/climate').map(s => s.label).join(' › '),
      grants: window.OpaxNavigation.trail('/reports/grants-allocation', 'Where community funding goes').map(s => s.label).join(' › '),
    };
  },
  // The sheet: open, Tab held inside, a group folding, Escape closing it and focus going home.
  async sheet(window) {
    const doc = window.document;
    const drawer = doc.getElementById('nav-drawer');
    const toggle = doc.getElementById('nav-open');
    toggle.focus();
    toggle.click();
    const opened = { open: drawer.open, expanded: toggle.getAttribute('aria-expanded'), focus: doc.activeElement === drawer };
    const stops = [...drawer.querySelectorAll('a[href], button:not([disabled]), input:not([disabled])')].filter(el => !el.closest('[hidden]'));
    const first = stops[0], last = stops.at(-1);
    last.focus(); key(window, last, 'Tab');
    const wrapsForward = doc.activeElement === first;
    first.focus(); key(window, first, 'Tab', { shiftKey: true });
    const wrapsBack = doc.activeElement === last;
    drawer.focus(); key(window, drawer, 'Tab', { shiftKey: true });
    const fromDialogBack = doc.activeElement === last;
    const group = drawer.querySelector('.sheet-group-toggle');
    const groupBefore = group.getAttribute('aria-expanded');
    group.click();
    const groupAfter = { expanded: group.getAttribute('aria-expanded'), hidden: doc.getElementById(group.getAttribute('aria-controls')).hidden };
    first.focus(); key(window, first, 'Escape');
    const closingClass = drawer.classList.contains('is-closing');
    const openRightAfterEscape = drawer.open;
    await wait(400);
    return { opened, stopCount: stops.length, wrapsForward, wrapsBack, fromDialogBack, groupBefore, groupAfter, closingClass, openRightAfterEscape,
      closed: { open: drawer.open, expanded: toggle.getAttribute('aria-expanded'), focus: doc.activeElement?.id } };
  },
  // The menu bar's keyboard model.
  async 'panel-keys'(window) {
    const doc = window.document;
    const triggers = [...doc.querySelectorAll('#primary-nav [data-nav-trigger]')];
    const panelOf = t => doc.getElementById(t.getAttribute('aria-controls'));
    const links = t => [...panelOf(t).querySelectorAll('a[href]')].filter(a => !a.closest('li[hidden]'));
    const [a, b] = triggers;
    a.focus(); key(window, a, 'ArrowDown');
    const down = { expanded: a.getAttribute('aria-expanded'), hidden: panelOf(a).hidden, focusFirst: doc.activeElement === links(a)[0] };
    key(window, doc.activeElement, 'ArrowDown');
    const second = doc.activeElement === links(a)[1];
    key(window, doc.activeElement, 'End');
    const end = doc.activeElement === links(a).at(-1);
    key(window, doc.activeElement, 'Home');
    const home = doc.activeElement === links(a)[0];
    key(window, doc.activeElement, 'ArrowUp');
    const upToTrigger = doc.activeElement === a;
    key(window, a, 'ArrowRight');
    const right = { focus: doc.activeElement === b, nextOpen: b.getAttribute('aria-expanded'), previousOpen: a.getAttribute('aria-expanded'), previousHidden: panelOf(a).hidden };
    key(window, b, 'ArrowLeft');
    const left = doc.activeElement === a;
    key(window, a, 'Escape');
    const escape = { expanded: a.getAttribute('aria-expanded'), hidden: panelOf(a).hidden, focus: doc.activeElement === a, anyOpen: triggers.some(t => t.getAttribute('aria-expanded') === 'true') };
    a.click();
    const click = a.getAttribute('aria-expanded');
    a.click();
    const clickAgain = a.getAttribute('aria-expanded');
    return { count: triggers.length, down, second, end, home, upToTrigger, right, left, escape, click, clickAgain };
  },
  // "/" opens the header search, and never while the reader types in a field.
  async slash(window) {
    const doc = window.document;
    window.Element.prototype.getClientRects = function () { return [{}]; }; // jsdom has no layout
    const toggle = doc.getElementById('header-search-open');
    const main = doc.querySelector('main') || doc.body;
    main.insertAdjacentHTML('beforeend', '<input id="probe-input"><textarea id="probe-area"></textarea><div id="probe-edit" contenteditable="true"></div>');
    const typed = {};
    for (const id of ['probe-input', 'probe-area', 'probe-edit', 'mast-q', 'drawer-q']) {
      const el = doc.getElementById(id);
      if (!el) continue;
      key(window, el, '/');
      typed[id] = toggle.getAttribute('aria-expanded');
    }
    key(window, doc.body, '/', { metaKey: true });
    const withMeta = toggle.getAttribute('aria-expanded');
    const opened = key(window, doc.body, '/') === false;
    return { typed, withMeta, opened: { prevented: opened, expanded: toggle.getAttribute('aria-expanded'), focus: doc.activeElement?.id } };
  },
  // Optional sections: what the page draws at load, and what opening the menus asks for.
  async gates(window, requests) {
    const doc = window.document;
    const count = sel => doc.querySelectorAll(sel).length;
    const vic = 'a[href="/vic-election-2026"]';
    const atLoad = { menus: count(`#primary-nav .nav-item-link${vic.slice(1)}`), sheet: count(`#nav-drawer .sheet-link${vic.slice(1)}`), chip: count(`#nav-drawer .sheet-chip${vic.slice(1)}`), footer: count(`#footer-index ${vic}`), slots: count('[data-gate-slot="vic-election"]') };
    const before = requests.length;
    doc.querySelector('#primary-nav [data-nav-trigger="people"]')?.click();
    doc.getElementById('nav-open')?.click();
    return { gatesAttr: doc.documentElement.getAttribute('data-nav-gates'), atLoad, onOpen: requests.slice(before), feature: count('.nav-feature[href="/vic-election-2026"]') };
  },
};

try { parentPort.postMessage({ result: await run() }); }
catch (error) { parentPort.postMessage({ error: error.stack }); }
