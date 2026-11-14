import { createRequire } from 'node:module';
import { writeFileSync, mkdirSync, readFileSync } from 'node:fs';
import { homedir, loadavg } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

// Local release audit: node scripts/audit_web_vitals.mjs before [page,page].
// Playwright comes from the shared phone QA installation, not portal dependencies.
const base = process.env.OPAX_PERF_BASE || 'http://127.0.0.1:8944';
const origin = new URL(base);
if (origin.protocol !== 'http:' || !['127.0.0.1', 'localhost', '[::1]'].includes(origin.hostname) || origin.origin !== base) {
  throw new Error('OPAX_PERF_BASE must be a local HTTP origin; production audits are forbidden');
}
const output = pathToFileURL(resolve(process.env.OPAX_PERF_OUTPUT || 'staging/web-vitals') + '/');
const require = createRequire(join(process.env.OPAX_PERF_NODE_ROOT || join(homedir(), 'opax-work/qa/phone-390'), 'package.json'));
const { chromium } = require('playwright');
const phase = process.argv[2] || 'before';
if (!/^[a-z][a-z0-9-]*$/.test(phase)) throw new Error('Phase must be a filename-safe label');
const pages = [
  ['home', '/'], ['money', '/money'], ['map', '/map'],
  ['person', '/subject/person/anthony-albanese'], ['bill', '/bill/au-federal-r7534'],
  ['division', '/doc/division-federal-representatives-8941'],
  ['donor', '/subject/donor/Mineralogy%20PTY%20LTD'], ['Labor', '/subject/party/australian-labor-party'],
  ['electorate', '/subject/electorate/grayndler'], ['search', '/ask?view=search&q=housing&kind=bill'],
  ['budget', '/budget'], ['connections', '/connections'], ['year', '/year/2025'], ['ask', '/ask'],
];
const only = process.argv[3]?.split(',');
if (only?.some(name => !pages.some(([page]) => page === name))) throw new Error('Unknown audit page');
async function capacity() {
  for (;;) {
    const load = process.platform === 'linux' ? readFileSync('/proc/loadavg', 'utf8').trim() : loadavg().join(' ');
    if (Number(load.split(' ')[1]) <= 40) return load;
    console.log(JSON.stringify({ waitingForLoad5: load }));
    await new Promise(resolve => setTimeout(resolve, 30000));
  }
}
mkdirSync(output, { recursive: true });
const resultFile = new URL(`${phase}${only ? '-' + only.join('-') : ''}.json`, output);
const rows = process.env.OPAX_PERF_RESUME === '1' ? JSON.parse(readFileSync(resultFile, 'utf8')) : [];
if (rows.some(row => !row.endLoad)) throw new Error('Cannot resume results from an older audit protocol');
await capacity();
const browser = await chromium.launch({ headless: true, args: ['--no-sandbox', '--disable-dev-shm-usage'] });
writeFileSync(new URL('audit.pid', output), String(process.pid));
try {
  for (const [name, path] of pages) {
    if (only && !only.includes(name)) continue;
    for (const device of ['phone', 'desktop']) for (let run = 1; run <= (device === 'phone' ? 3 : 1); run++) {
      if (rows.some(row => row.name === name && row.device === device && row.run === run)) continue;
      const load = await capacity();
      console.log(JSON.stringify({ starting: name, device, run, load }));
      const context = await browser.newContext({ viewport: device === 'phone' ? { width: 390, height: 844 } : { width: 1440, height: 900 },
        isMobile: device === 'phone', deviceScaleFactor: 1, hasTouch: device === 'phone', serviceWorkers: 'block' });
      const page = await context.newPage();
      const blocked = [], errors = [], failures = [], requests = new Map();
      await context.route('**/*', route => {
        const u = new URL(route.request().url());
        if (u.origin !== base || /^\/(ingest|og\/|api\/(ask|voice|chat|research|followups|search-summary|journey-story|money-overview))/.test(u.pathname) || route.request().method() !== 'GET') {
          blocked.push(u.origin === base ? u.pathname : u.hostname);
          return route.abort();
        }
        return route.continue();
      });
      page.on('pageerror', error => errors.push(error.message));
      page.on('response', response => { if (response.status() >= 400) failures.push({ url: response.url().replace(base, ''), status: response.status() }); });
      const cdp = await context.newCDPSession(page);
      const active = new Set();
      let requestSerial = 0;
      await cdp.send('Network.enable');
      await cdp.send('Network.setCacheDisabled', { cacheDisabled: true });
      if (device === 'phone') {
        // Lighthouse mobile preset, applied as DevTools throttling (not simulated scoring).
        await cdp.send('Network.emulateNetworkConditions', { offline: false, latency: 562.5,
          downloadThroughput: 1474.56 * 1024 / 8, uploadThroughput: 675 * 1024 / 8 });
        await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
      }
      cdp.on('Network.responseReceived', ({ requestId, response, type }) => requests.set(requestId, { url: response.url.replace(base, ''), type, status: response.status, bytes: 0 }));
      cdp.on('Network.requestWillBeSent', ({requestId}) => { active.add(requestId); requestSerial++; });
      cdp.on('Network.loadingFailed', ({requestId}) => active.delete(requestId));
      cdp.on('Network.loadingFinished', ({ requestId, encodedDataLength }) => { active.delete(requestId); const r = requests.get(requestId); if (r) r.bytes = encodedDataLength; });
      await page.addInitScript(() => {
        const selector = node => node ? `${node.tagName?.toLowerCase()}${node.id ? '#' + node.id : ''}${node.className && typeof node.className === 'string' ? '.' + node.className.trim().split(/\s+/).slice(0, 3).join('.') : ''}` : null;
        window.audit = { lcp: [], shifts: [], tasks: [] };
        new PerformanceObserver(list => { for (const e of list.getEntries()) window.audit.lcp.push({ time: e.startTime, size: e.size, url: e.url, node: selector(e.element) }); }).observe({ type: 'largest-contentful-paint', buffered: true });
        new PerformanceObserver(list => { for (const e of list.getEntries()) if (!e.hadRecentInput) window.audit.shifts.push({ time: e.startTime, value: e.value, nodes: e.sources.map(s => selector(s.node)) }); }).observe({ type: 'layout-shift', buffered: true });
        new PerformanceObserver(list => { for (const e of list.getEntries()) window.audit.tasks.push({ time: e.startTime, duration: e.duration }); }).observe({ type: 'longtask', buffered: true });
      });
      const started = Date.now();
      let timeout = false;
      const response = await page.goto(base + path, { waitUntil: 'domcontentloaded', timeout: 120000 });
      const deadline = Date.now() + 120000;
      try {
        // A network-idle event alone can precede a later async render stage.
        // Require the active panel's loaders to clear, then a stable quiet window.
        await page.waitForFunction(() => {
          if (!document.querySelector('script[src^="/app.js"]')) return true;
          if (!document.documentElement.classList.contains('spa-routed')) return false;
          const visible = el => el.getClientRects().length && getComputedStyle(el).visibility !== 'hidden';
          for (const id of ['subject-loader','bill-loader']) {
            const el = document.getElementById(id);
            if (el && visible(el.parentElement)) return false;
          }
          return ![...document.querySelectorAll('#main .answer-skeleton, #main .subject-skel, #main .map-drawing, #main [aria-busy="true"], #main .dt-loading-row')].some(visible);
        }, null, {timeout:120000});
        for (;;) {
          await page.waitForLoadState('networkidle', {timeout:Math.max(1,deadline-Date.now())});
          const serial = requestSerial;
          await page.waitForTimeout(2500);
          // Flush pending browser work before deciding that no later stage started.
          await page.evaluate(() => performance.now());
          if (!active.size && serial === requestSerial) break;
          if (Date.now() >= deadline) throw new Error('Page did not settle');
        }
      } catch { timeout = true; }
      const metrics = await page.evaluate(() => {
        const { lcp, shifts, tasks } = window.audit;
        let cls = 0, session = 0, start = 0, previous = 0;
        for (const shift of shifts) {
          if (shift.time - previous > 1000 || shift.time - start > 5000) { start = shift.time; session = 0; }
          session += shift.value; previous = shift.time; cls = Math.max(cls, session);
        }
        const fcp = performance.getEntriesByName('first-contentful-paint')[0]?.startTime || 0;
        return { lcp: lcp.at(-1)?.time || 0, cls, tbt: tasks.filter(t => t.time >= fcp).reduce((s, t) => s + Math.max(0, t.duration - 50), 0), fcp,
          lcpEvents: lcp, shifts, tasks, duration: performance.now(), title: document.title,
          routed: document.documentElement.classList.contains('spa-routed'), h1: [...document.querySelectorAll('h1')].filter(n => n.getClientRects().length).map(n => n.textContent.trim()),
          navigation: performance.getEntriesByType('navigation')[0]?.toJSON(),
          resources: performance.getEntriesByType('resource').map(r => ({ url: r.name.replace(location.origin, ''), bytes: r.encodedBodySize, decoded: r.decodedBodySize, start: r.startTime, duration: r.duration })),
          images: [...document.images].filter(i => i.getClientRects().length).map(i => ({ src: i.getAttribute('src'), width: i.getAttribute('width'), height: i.getAttribute('height') })),
          resultCount: document.querySelectorAll('#search-results > li').length };
      });
      const resources = [...requests.values()].filter(r => r.url.startsWith('/') && !r.url.startsWith('/cdn-cgi/'));
      const row = { name, path, device, run, load, endLoad: process.platform === 'linux' ? readFileSync('/proc/loadavg','utf8').trim() : loadavg().join(' '), status: response.status(), timeout, elapsed: Date.now() - started, ...metrics,
        jsBytes: resources.filter(r => r.type === 'Script').reduce((s, r) => s + r.bytes, 0), cssBytes: resources.filter(r => r.type === 'Stylesheet').reduce((s, r) => s + r.bytes, 0),
        requests: resources.length, network: resources, blocked, errors, failures };
      rows.push(row);
      writeFileSync(resultFile, JSON.stringify(rows, null, 2));
      console.log(JSON.stringify({ name, device, run, status: row.status, lcp: Math.round(row.lcp), cls: +row.cls.toFixed(3), tbt: row.tbt, fcp: Math.round(row.fcp), jsBytes: row.jsBytes, cssBytes: row.cssBytes, requests: row.requests, timeout, h1: row.h1, failures: failures.length, errors: errors.length }));
      await context.close();
    }
  }
} finally { await browser.close(); }
