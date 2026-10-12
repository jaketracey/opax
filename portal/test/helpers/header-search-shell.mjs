import { readFileSync, existsSync } from 'node:fs';
import { Script, SourceTextModule } from 'node:vm';
import { parentPort, workerData } from 'node:worker_threads';
import { build } from 'esbuild';
import { JSDOM } from 'jsdom';

const publicRoot = new URL('../../public/', import.meta.url);
const origin = 'https://opax.test';

// Use the real Worker to decide which scripts each server-rendered family keeps.
// This adapter supplies the HTMLRewriter operations used by its page renderer.
class HTMLRewriter {
  handlers = [];
  on(selector, handler) { this.handlers.push([selector, handler]); return this; }
  transform(response) {
    const handlers = this.handlers;
    return new Response(new ReadableStream({ async start(controller) {
      const dom = new JSDOM(await response.text());
      for (const [selector, handler] of handlers) {
        for (const node of dom.window.document.querySelectorAll(selector)) {
          handler.element({
            getAttribute: name => node.getAttribute(name),
            setAttribute: (name, value) => node.setAttribute(name, value),
            setInnerContent(value, options) { if (options?.html) node.innerHTML = value; else node.textContent = value; },
            append: value => node.insertAdjacentHTML('beforeend', value),
            remove: () => node.remove(),
          });
        }
      }
      controller.enqueue(new TextEncoder().encode(dom.serialize()));
      controller.close();
      dom.window.close();
    } }), response);
  }
}

async function shell(path) {
  const compiled = await build({
    entryPoints: [new URL('../../src/index.ts', import.meta.url).pathname],
    bundle: true, platform: 'browser', format: 'esm', write: false, external: ['node:*'],
    plugins: [{ name: 'omit-images', setup(builder) {
      builder.onResolve({ filter: /^\.\/og-render$/ }, () => ({ path: 'images', namespace: 'header-search-test' }));
      builder.onLoad({ filter: /.*/, namespace: 'header-search-test' }, () => ({ contents: 'export const renderOgPng=()=>{}; export const renderOgJpeg=()=>{}; export const renderStoryJpeg=()=>{};' }));
    } }],
  });
  globalThis.HTMLRewriter = HTMLRewriter;
  const { default: worker } = await import('data:text/javascript;base64,' + Buffer.from(compiled.outputFiles[0].text).toString('base64'));
  const env = { COMMUNITY_ORIGIN: origin, VIC_ELECTION_HUB_ENABLED: 'true', ASSETS: { async fetch(request) {
    const pathname = new URL(request.url).pathname;
    const file = new URL(pathname === '/' ? 'index.html' : pathname === '/home' ? 'home.html' : pathname.slice(1), publicRoot);
    return existsSync(file) ? new Response(readFileSync(file), { headers: { 'content-type': pathname.endsWith('.json') ? 'application/json' : 'text/html' } }) : new Response('Missing', { status: 404 });
  } } };
  const response = await worker.fetch(new Request(origin + path), env, { waitUntil() {} });
  if (response.status !== 200) throw Error('Shell returned ' + response.status);
  return response.text();
}

async function run() {
  const dom = new JSDOM(await shell(workerData.path), { url: origin + workerData.path, runScripts: 'outside-only', pretendToBeVisual: true });
  const { window } = dom;
  const context = dom.getInternalVMContext();
  // No network. Keep unrelated hydration pending; the actual script bodies,
  // module imports, DOM operations and event listeners all execute.
  window.fetch = () => new Promise(() => {});
  window.document.fonts = { ready: new Promise(() => {}) };
  window.matchMedia = () => ({ matches: false, addEventListener() {}, removeEventListener() {} });
  window.ResizeObserver = window.IntersectionObserver = class { observe() {} unobserve() {} disconnect() {} };
  window.scrollTo = () => {};
  window.HTMLDialogElement.prototype.showModal = function () { this.open = true; };
  window.HTMLDialogElement.prototype.close = function () { this.open = false; };
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
  async function evaluateModule(url) {
    const module = moduleFor(url);
    if (module.status === 'unlinked') await module.link((specifier, importer) => moduleFor(resolve(specifier, importer.identifier)));
    if (module.status === 'linked') await module.evaluate();
    return module;
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
    if (workerData.probe === 'menus') {
      window.document.dispatchEvent(new window.Event('DOMContentLoaded'));
      // The band's menus on this page: does each control actually open something?
      const doc = window.document;
      const drawer = doc.getElementById('nav-drawer');
      doc.getElementById('nav-open').click();
      const drawerOpen = { open: drawer.open, expanded: doc.getElementById('nav-open').getAttribute('aria-expanded') };
      const trigger = doc.querySelector('#primary-nav .has-menu button[aria-controls]');
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

try { parentPort.postMessage({ result: await run() }); }
catch (error) { parentPort.postMessage({ error: error.stack }); }
