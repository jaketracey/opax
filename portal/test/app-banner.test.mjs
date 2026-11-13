import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import { JSDOM } from 'jsdom';
import { APP_BANNER_HTML, withAppBanner } from '../src/app-banner.ts';
import { HTMLRewriter, workerFetch } from './helpers/worker-fetch.mjs';

const read = file => readFileSync(new URL(file, import.meta.url), 'utf8');
const script = read('../public/app-banner.js');
const css = read('../public/app-banner.css');
const key = 'opax-app-banner-dismissed';

function boot({ stored, blocked = false, ua = 'Mozilla/5.0 (iPhone) Safari/605.1.15', path = '/' } = {}) {
  const dom = new JSDOM(`<!doctype html><html><head><style>${css}</style></head><body></body></html>`, {
    url: `https://opax.com.au${path}`, runScripts: 'outside-only',
  });
  const { window } = dom;
  Object.defineProperty(window.navigator, 'userAgent', { value: ua });
  if (stored !== undefined) window.localStorage.setItem(key, stored);
  if (blocked) Object.defineProperty(window, 'localStorage', { get() { throw new Error('Storage denied'); } });
  // Like the blocking head script, run before any banner markup exists.
  window.eval(script);
  const hiddenBeforeBody = window.document.documentElement.classList.contains('opax-app-banner-hidden');
  window.document.body.insertAdjacentHTML('afterbegin', APP_BANNER_HTML);
  const banner = window.document.getElementById('opax-app-banner');
  return { dom, window, banner, hiddenBeforeBody,
    visible: () => window.getComputedStyle(banner).display !== 'none',
    dismiss: () => banner.querySelector('button').click() };
}

test('the real Worker injects one banner above static and Worker-rendered page content', async () => {
  for (const path of ['/qz-test.html', '/about', '/']) {
    const response = await workerFetch(path);
    assert.equal(response.status, 200, path);
    const dom = new JSDOM(await response.text());
    const doc = dom.window.document;
    assert.equal(doc.querySelectorAll('#opax-app-banner').length, 1, path);
    assert.equal(doc.body.firstElementChild.id, 'opax-app-banner', path);
    assert.equal(doc.querySelector('#opax-app-banner a').href, 'https://apps.apple.com/au/app/opax/id6818756305');
    const entry = doc.querySelector('head script[src^="/app-banner.js?v="]');
    assert.ok(entry, path);
    assert.equal(entry.hasAttribute('defer') || entry.hasAttribute('async') || entry.hasAttribute('type'), false);
    assert.ok(doc.querySelector('head link[href^="/app-banner.css?v="]'));
    const csp = response.headers.get('content-security-policy');
    assert.match(csp, /script-src 'self'/);
    assert.doesNotMatch(csp.match(/script-src[^;]*/)[0], /'unsafe-inline'/);
    dom.window.close();
  }
});

test('App Review support, privacy and community sign-in pages have no banner or script', async () => {
  for (const path of ['/support', '/privacy', '/community?view=signin', '/community?view=privacy']) {
    const response = await workerFetch(path);
    assert.equal(response.status, 200, path);
    assert.doesNotMatch(await response.text(), /id="opax-app-banner"|src="\/app-banner\.js/);
  }
});

test('a static page ignores the raw asset conditional and returns the updated chrome', async () => {
  const requests = [];
  const response = await workerFetch('/qz-test.html', { ASSETS: { async fetch(request) {
    requests.push(request);
    if (request.headers.has('if-none-match')) return new Response(null, { status: 304 });
    return new Response('<html><head></head><body>Static page</body></html>', { headers: { 'content-type': 'text/html', etag: '"old-asset"' } });
  } } }, { headers: { 'if-none-match': '"old-asset"', 'if-modified-since': 'Mon, 09 Nov 2026 00:00:00 GMT' } });
  assert.equal(response.status, 200);
  assert.ok(requests.length);
  assert.ok(requests.every(request => !request.headers.has('if-none-match') && !request.headers.has('if-modified-since')));
  assert.equal(response.headers.get('etag'), null);
  assert.match(await response.text(), /id="opax-app-banner"/);
});

test('first visits show immediately, dismissal hides now, and later loads are hidden before body parsing', () => {
  const first = boot();
  assert.equal(first.hiddenBeforeBody, false);
  assert.equal(first.visible(), true);
  assert.equal(first.window.document.activeElement, first.window.document.body, 'no focus movement on load');
  first.dismiss();
  assert.equal(first.visible(), false);
  assert.equal(first.window.localStorage.getItem(key), '1');
  const later = boot({ stored: first.window.localStorage.getItem(key) });
  assert.equal(later.hiddenBeforeBody, true);
  assert.equal(later.visible(), false);
  first.dom.window.close(); later.dom.window.close();
});

test('blocked storage shows the banner and still permits immediate page dismissal', () => {
  const page = boot({ blocked: true });
  assert.equal(page.visible(), true);
  assert.doesNotThrow(page.dismiss);
  assert.equal(page.visible(), false);
  page.window.dispatchEvent(new page.window.Event('opax:route'));
  assert.equal(page.visible(), false, 'dismissal survives SPA navigation without storage');
  page.dom.window.close();
});

test('Android and the existing OPAX iOS marker are hidden before the banner is parsed', () => {
  for (const ua of ['Mozilla/5.0 (Linux; Android 16) Chrome/140', 'OPAX-iOS/1.0.0 (1)', 'Mozilla/5.0 OPAX-iOS/1.0.0']) {
    const page = boot({ ua });
    assert.equal(page.hiddenBeforeBody, true, ua);
    assert.equal(page.visible(), false, ua);
    page.dom.window.close();
  }
  for (const ua of ['Mozilla/5.0 (Macintosh) Safari/605.1.15', 'Mozilla/5.0 (Windows NT 10.0) Firefox/144']) {
    const page = boot({ ua });
    assert.equal(page.visible(), true, ua);
    page.dom.window.close();
  }
});

test('policy and sign-in exclusions cover legacy hash links and SPA history changes', () => {
  for (const path of ['/#/privacy', '/#/support', '/#/community?view=signin', '/signin', '/sign-in/', '/login.html', '/auth/callback']) {
    const page = boot({ path });
    assert.equal(page.hiddenBeforeBody, true, path);
    page.dom.window.close();
  }
  const page = boot();
  page.window.history.pushState({}, '', '/support');
  page.window.dispatchEvent(new page.window.Event('opax:route'));
  assert.equal(page.visible(), false);
  page.window.history.pushState({}, '', '/about');
  page.window.dispatchEvent(new page.window.Event('popstate'));
  assert.equal(page.visible(), true);
  page.dom.window.close();
});

test('banner is ordinary content with a named link and a keyboard button, without live announcements', () => {
  const page = boot();
  assert.equal(page.banner.tagName, 'DIV');
  assert.equal(page.banner.querySelector('[role], [aria-live], [autofocus], [tabindex]'), null);
  assert.equal(page.banner.querySelector('a').textContent, 'Get the app');
  assert.match(page.banner.querySelector('a').getAttribute('href'), /^https:\/\/apps\.apple\.com\//);
  const button = page.banner.querySelector('button');
  assert.equal(button.getAttribute('aria-label'), 'Dismiss');
  assert.equal(button.tabIndex, 0);
  assert.match(css, /min-width: var\(--size-target, 44px\)/);
  assert.match(css, /min-height: var\(--size-target, 44px\)/);
  assert.match(css, /:focus-visible\s*\{[^}]*outline:/);
  page.dom.window.close();
});

test('the banner is one 44px line at the default text size and wraps, never clips, with larger text', () => {
  const row = css.match(/\.opax-app-banner-row\s*\{([^}]*)\}/)[1];
  assert.match(row, /min-height: var\(--size-target, 44px\)/);
  assert.doesNotMatch(row, /(^|[^-])height:/, 'no fixed height: at 200% text the row grows (WCAG 1.4.4)');
  const line = css.match(/\.opax-app-banner p\s*\{([^}]*)\}/)[1];
  assert.doesNotMatch(line, /white-space: nowrap|text-overflow|overflow: hidden/, 'the line wraps rather than clipping the link');
  assert.match(css, /\.opax-app-banner a \{ white-space: nowrap;/, 'the link itself stays whole');
  assert.doesNotMatch(css, /\.opax-app-banner\s*\{[^}]*border-bottom/, 'the rule is drawn inside the 44px');
  assert.match(css, /@media \(width < 420px\)\s*\{\s*\.opax-app-banner-ipad\s*\{\s*display: none/);
});

test('shared chrome strips raw asset validators and lengths, preserves Worker version validators, and skips non-pages', async () => {
  globalThis.HTMLRewriter = HTMLRewriter;
  const url = new URL('https://opax.com.au/example.html');
  for (const etag of ['"raw-asset"', 'W/"h-worker-version"']) {
    const response = withAppBanner(new Response('<html><head></head><body>Page</body></html>', {
      headers: { 'content-type': 'text/html', 'content-length': '47', etag, 'last-modified': 'Mon, 09 Nov 2026 00:00:00 GMT' },
    }), url);
    assert.equal(response.headers.get('content-length'), null);
    assert.equal(response.headers.get('last-modified'), null);
    assert.equal(response.headers.get('etag'), etag.startsWith('W/') ? etag : null);
    await response.text();
  }
  for (const [path, type] of [['/api/community/email/unsubscribe', 'text/html'], ['/app-banner.js', 'text/javascript'], ['/example.json', 'application/json']]) {
    const response = new Response('untouched', { headers: { 'content-type': type } });
    assert.equal(withAppBanner(response, new URL(path, url)), response);
  }
  const empty = new Response(null, { status: 304, headers: { 'content-type': 'text/html' } });
  assert.equal(withAppBanner(empty, url), empty);
});

test('banner assets have current content hashes and immutable caching without relaxing CSP', () => {
  const worker = read('../src/app-banner.ts');
  const headers = read('../public/_headers');
  for (const file of ['app-banner.js', 'app-banner.css']) {
    const hash = createHash('sha256').update(read(`../public/${file}`)).digest('hex').slice(0, 10);
    assert.ok(worker.includes(`/${file}?v=${hash}`), file);
    assert.ok(headers.includes(`/${file}\n  ! Cache-Control\n  Cache-Control: public, max-age=31536000, immutable`), file);
  }
  assert.doesNotMatch(headers.match(/script-src[^;]*/)[0], /'unsafe-inline'/);
});

test('every published static HTML page reaches the Worker through its file and clean URL', () => {
  const config = read('../wrangler.jsonc');
  const patterns = JSON.parse(config.match(/"run_worker_first": (\[[^\]]*\])/)[1]);
  const matches = path => patterns.some(pattern => new RegExp('^' + pattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replaceAll('\\*', '.*') + '$').test(path));
  for (const file of readdirSync(new URL('../public/', import.meta.url)).filter(file => file.endsWith('.html') && file !== 'ui-workbench.html')) {
    for (const path of ['/' + file, '/' + file.slice(0, -5), '/' + file.slice(0, -5) + '/']) {
      // /index is redirected by the asset server to /, which runs the Worker.
      if (path === '/index' || path === '/index/') continue;
      assert.ok(matches(path), path);
    }
  }
});
