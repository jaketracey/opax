import { readFileSync } from 'node:fs';
import { Script, SourceTextModule } from 'node:vm';
import { parentPort, workerData } from 'node:worker_threads';
import { JSDOM, VirtualConsole } from 'jsdom';

const publicRoot = new URL('../../public/', import.meta.url);
const origin = 'https://opax.test';
const path = `/subject/${workerData.kind}`;
const errors = [];
const failure = /The directory could not be loaded\. Try again shortly\.|records could not be loaded|role="alert"/;
const describe = value => value?.stack || String(value);
process.on('unhandledRejection', error => errors.push(`unhandled rejection: ${describe(error)}`));

// Read built snapshots locally. Boot and supplier table APIs use deterministic
// fixtures.
// No request is passed to the network or a running Worker.
const read = pathname => readFileSync(new URL('.' + pathname, publicRoot), 'utf8');
const json = pathname => JSON.parse(read(pathname));
const partyCounts = new Map();
for (const person of json('/parliamentarians.json').people) {
  if (person.party) partyCounts.set(person.party, (partyCounts.get(person.party) || 0) + (person.speeches || 0));
}
const apiFixtures = {
  '/api/display-policy': { SA_HANSARD_FULL_TEXT: 'false' },
  '/api/stats': { resources: 1, paragraphs: 1, kinds: {}, speeches_by_state: {} },
  '/api/person-slugs': {},
  '/api/parties': { parties: [...partyCounts].map(([label, count]) => ({ label, count })) },
  '/api/table/suppliers': {rows:[{id:'s-00000000000000000001',name:'Fixture supplier Pty Ltd',
    jurisdiction:'federal',total:100,count:2,agency_count:1,abn:null}],total:1,page:1,pageSize:50,
    facets:{total:{min:100,max:100},jurisdiction:[{value:'federal',count:1}]}},
};

async function run() {
  const virtualConsole = new VirtualConsole();
  virtualConsole.on('error', (...args) => errors.push(`console.error: ${args.map(describe).join(' ')}`));
  virtualConsole.on('jsdomError', error => errors.push(`page error: ${describe(error)}`));
  const dom = new JSDOM(read('/index.html'), {
    url: origin + path, runScripts: 'outside-only', pretendToBeVisual: true, virtualConsole,
  });
  const { window } = dom;
  const context = dom.getInternalVMContext();
  window.addEventListener('error', event => errors.push(`page error: ${describe(event.error || event.message)}`));
  window.addEventListener('unhandledrejection', event => errors.push(`page rejection: ${describe(event.reason)}`));
  window.fetch = async (input, init = {}) => {
    const url = new URL(typeof input === 'string' ? input : input.url, window.location.href);
    const method = init.method || input.method || 'GET';
    try {
      if (url.origin !== origin) throw Error(`Unexpected request: ${method} ${url.origin}${url.pathname}`);
      if(method !== 'GET')throw Error(`Unexpected request: ${method} ${url.origin}${url.pathname}`);
      if (Object.hasOwn(apiFixtures, url.pathname)) return Response.json(apiFixtures[url.pathname]);
      if (url.pathname.startsWith('/api/')) throw Error(`Missing API fixture: ${url.pathname}`);
      // Malformed local data makes the real electorate builder throw, exercising
      // openDirectory's catch and user message without replacing any app code.
      if (workerData.brokenElectorateIndex && url.pathname === json('/electorates/manifest.json').index_url) {
        return Response.json({ electorates: null });
      }
      return new Response(read(url.pathname), { headers: { 'content-type': 'application/json' } });
    } catch (error) {
      errors.push(describe(error));
      throw error;
    }
  };
  // jsdom has no layout engine. Supply the browser layout APIs without altering
  // app logic, data loaders, routing, directory builders or row rendering.
  window.document.fonts = { ready: Promise.resolve() };
  window.structuredClone = structuredClone;
  window.matchMedia = media => ({ matches: media === '(prefers-reduced-motion: reduce)', addEventListener() {}, removeEventListener() {} });
  window.ResizeObserver = window.IntersectionObserver = class { observe() {} unobserve() {} disconnect() {} };
  window.scrollTo = window.HTMLElement.prototype.scrollIntoView = () => {};
  window.HTMLDialogElement.prototype.showModal = function () { this.open = true; };
  window.HTMLDialogElement.prototype.close = function () { this.open = false; };

  let failed = false;
  const observer = new window.MutationObserver(records => {
    failed ||= failure.test(window.document.getElementById('subject-body').innerHTML)
      || records.some(record => [...record.addedNodes].some(node => failure.test(node.outerHTML || node.textContent || '')));
  });
  observer.observe(window.document.getElementById('subject-body'), { childList: true, subtree: true, characterData: true });

  const modules = new Map(), evaluations = new Map(), pending = new Set();
  let linkQueue = Promise.resolve();
  const resolve = (specifier, importer = origin + '/') => {
    const url = new URL(specifier, importer);
    if (url.origin !== origin) throw Error(`External script import: ${url.origin}${url.pathname}`);
    return url.href;
  };
  const source = url => read(new URL(url).pathname);
  function moduleFor(url) {
    if (!modules.has(url)) modules.set(url, new SourceTextModule(source(url), {
      context, identifier: url, initializeImportMeta(meta) { meta.url = url; },
      importModuleDynamically: specifier => evaluateModule(resolve(specifier, url)),
    }));
    return modules.get(url);
  }
  function evaluateModule(url) {
    // Concurrent dynamic imports often share dependencies. Serialize linking,
    // then share evaluation promises, as the browser's module cache does.
    const linked = linkQueue.then(async () => {
      const module = moduleFor(url);
      if (module.status === 'unlinked') await module.link((specifier, importer) => moduleFor(resolve(specifier, importer.identifier)));
      return module;
    });
    linkQueue = linked.catch(() => {});
    const promise = linked.then(async module => {
      if (!evaluations.has(url)) evaluations.set(url, module.evaluate().then(() => module));
      return evaluations.get(url);
    });
    pending.add(promise);
    promise.then(() => pending.delete(promise), () => pending.delete(promise));
    return promise;
  }
  const scripts = [...window.document.querySelectorAll('script')].filter(node => !node.type || ['text/javascript', 'module'].includes(node.type));
  try {
    // Blocking scripts precede deferred scripts; each group keeps shell order.
    // Classic-script import() uses the real local modules above.
    const deferredModules = [];
    const ordered = [...scripts.filter(node => !node.defer), ...scripts.filter(node => node.defer)];
    for (const script of ordered) {
      const url = script.src ? resolve(script.src) : origin + path;
      if (script.type === 'module') deferredModules.push(url);
      else new Script(script.src ? source(url) : script.textContent, {
        filename: url, importModuleDynamically: specifier => evaluateModule(resolve(specifier, url)),
      }).runInContext(context);
    }
    for (const url of deferredModules) await evaluateModule(url);
    const selector = workerData.kind==='supplier' ? '[data-datatable] tbody tr:has(a[href])'
      : workerData.kind==='agency' ? '.supplier-directory-row' : '#dir-list > li';
    const deadline = performance.now() + 10000;
    let body;
    do {
      // Let imports, boot promises, row rendering and rejected promises settle.
      await new Promise(resolve => setTimeout(resolve, 10));
      body = window.document.getElementById('subject-body');
      if (body.querySelector(selector) || failure.test(body.innerHTML) || errors.length) break;
    } while (performance.now() < deadline);
    await Promise.allSettled([...pending]);
    await new Promise(resolve => setTimeout(resolve, 20));
    return {
      rows: body.querySelectorAll(selector).length, failed: failed || failure.test(body.innerHTML),
      honestFailure: body.textContent.includes('The directory could not be loaded. Try again shortly.'),
      visible: !window.document.getElementById('panel-subject').hidden, errors,
      scripts: scripts.filter(node => node.src).map(node => new URL(node.src).pathname),
      imports: [...modules.keys()].map(url => new URL(url).pathname),
    };
  } finally { observer.disconnect(); dom.window.close(); }
}

try { parentPort.postMessage(await run()); }
catch (error) { parentPort.postMessage({ error: describe(error) }); }
