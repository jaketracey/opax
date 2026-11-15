import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import { JSDOM } from 'jsdom';
import { APP_BANNER_HTML, APP_PROMPTS, SKIP_LINK_HTML, appBannerHTML, appPromptFor, smartBannerMeta, withAppBanner } from '../src/app-banner.ts';
import { cleanEvent } from '../analytics/privacy.mjs';
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
    // Skip to content is the first tab stop, ahead of the banner; the page's own copy gives way to it.
    assert.equal(doc.body.firstElementChild.matches('a.opax-skip-link[data-skip-link]'), true, path);
    assert.equal(doc.body.firstElementChild.textContent, 'Skip to content', path);
    assert.equal(doc.body.firstElementChild.nextElementSibling.id, 'opax-app-banner', path);
    assert.equal(doc.querySelectorAll('a[data-skip], a[data-skip-link]').length, 1, path);
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
  assert.equal(page.banner.getAttribute('role'), 'region');
  assert.equal(page.banner.getAttribute('aria-label'), 'OPAX app');
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

test('Skip to content moves focus to the title showing in main, ahead of the banner', () => {
  const dom = new JSDOM(`<!doctype html><html><body>${SKIP_LINK_HTML}${APP_BANNER_HTML}<header><a href="/">Home</a></header><main id="main"><section hidden><h1>Hidden panel</h1></section><h1 id="t">The page</h1></main></body></html>`, { url: 'https://opax.com.au/', runScripts: 'outside-only' });
  const { window } = dom;
  // jsdom lays nothing out: a shown element is one that is not inside [hidden].
  window.Element.prototype.getClientRects = function () { return this.closest('[hidden]') ? [] : [{}]; };
  window.HTMLElement.prototype.scrollIntoView = () => {};
  window.eval(script);
  const link = window.document.querySelector('a[data-skip-link]');
  const event = new window.MouseEvent('click', { bubbles: true, cancelable: true });
  link.dispatchEvent(event);
  assert.equal(event.defaultPrevented, true);
  assert.equal(window.document.activeElement.id, 't');
  assert.equal(window.document.getElementById('t').getAttribute('tabindex'), '-1');
  dom.window.close();
});

test('every page has exactly one skip link, first, pointing at an element the page has', async () => {
  for (const [path, target] of [['/', 'hp-main'], ['/press', 'press-main'], ['/map', 'map'], ['/subject/person/anthony-albanese', 'main'], ['/privacy', 'main']]) {
    const response = await workerFetch(path);
    assert.equal(response.status, 200, path);
    const doc = new JSDOM(await response.text()).window.document;
    const links = [...doc.querySelectorAll('a')].filter(a => /^Skip to content$/.test(a.textContent.trim()));
    assert.equal(links.length, 1, path);
    assert.equal(links[0].getAttribute('href'), `#${target}`, path);
    assert.ok(doc.getElementById(target), `${path}: #${target} exists, so the link works without scripts`);
    // The first tab stop: before the banner where there is one (privacy has none, for App Review).
    assert.equal(doc.body.querySelector('a[href], button, input, select, textarea, summary'), links[0], path);
  }
});

// --- The page-worded app prompt -------------------------------------------------

const CHROME_IPHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 19_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/142.0 Mobile/15E148 Safari/604.1';
const SAFARI_IPHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 19_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/19.1 Mobile/15E148 Safari/604.1';
const SAFARI_MAC = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/19.1 Safari/605.1.15';
const seenKey = 'opax-app-prompt-seen';
const PAGES = {
  document: '/doc/hansard-2024-02-07-house-a1b2',
  supplier: '/subject/supplier/abn-12345678901',
  grant_recipient: '/money/grants/federal/recipient/abn%3A12345678901',
  ask: '/ask',
  vic_district: '/vic-election-2026/albert-park',
  member: '/subject/person/anthony-albanese',
  electorate: '/subject/electorate/grayndler',
  bill: '/bill/au-federal-r7001',
  donor: '/subject/donor/example-holdings',
};

/** The page as the Worker sends it for this path, then the head script, as a browser runs them. */
async function land({ path = PAGES.member, ua = CHROME_IPHONE, touch = 0, stored = {}, extra = '' } = {}) {
  const pathname = path.split(/[?#]/)[0];
  const dom = new JSDOM(`<!doctype html><html><head>${smartBannerMeta(pathname)}<style>${css}</style></head><body>${extra}</body></html>`, {
    url: `https://opax.com.au${path}`, runScripts: 'outside-only',
  });
  const { window } = dom;
  Object.defineProperty(window.navigator, 'userAgent', { value: ua });
  Object.defineProperty(window.navigator, 'maxTouchPoints', { value: touch });
  for (const [k, v] of Object.entries(stored)) window.localStorage.setItem(k, v);
  const events = [];
  window.addEventListener('opax:analytics', ({ detail }) => events.push({ event: detail.event, properties: { ...detail.properties } }));
  window.eval(script);
  window.document.body.insertAdjacentHTML('afterbegin', appBannerHTML(pathname));
  const banner = window.document.getElementById('opax-app-banner');
  // The view waits for the parsed document, when events.js (deferred) is listening.
  if (window.document.readyState !== 'complete') await new Promise(done => window.addEventListener('load', done, { once: true }));
  const shows = sel => window.getComputedStyle(banner).display !== 'none' && window.getComputedStyle(banner.querySelector(sel)).display !== 'none';
  return { dom, window, banner, events,
    worded: () => shows('.opax-app-banner-prompt'), general: () => shows('.opax-app-banner-general'),
    go(to) { window.history.pushState({}, '', to); window.dispatchEvent(new window.Event('opax:route')); } };
}

test('each landing page type is recognised by its path alone, and everything else keeps the general line', async () => {
  for (const [type, path] of Object.entries(PAGES)) {
    assert.deepEqual(appPromptFor(path), { type, open: `opax:/${path}` }, path);
    assert.equal(appPromptFor(path + '/')?.type, type, 'a trailing slash is the same page');
  }
  assert.deepEqual(Object.keys(APP_PROMPTS), Object.keys(PAGES));
  for (const path of ['/', '/about', '/ask/some words', '/bills', '/subject/person', '/subject/party/labor', '/money/grants',
    // Screens the app does not have: another state's recipients, and a person's.
    '/money/grants/nsw/recipient/abn-1', '/money/grants/federal/recipient/person:jo-citizen', '/money/grants/federal/recipient/person%3Ajo-citizen',
    // Nothing that could leave the attribute or split the Smart App Banner's list.
    '/subject/donor/a"b', '/subject/donor/a,b', '/subject/supplier/a b', '/subject/donor/<x>']) {
    assert.equal(appPromptFor(path), null, path);
    assert.equal(smartBannerMeta(path), '', path);
  }
});

test('every line is plain, non-partisan copy about the record, with no Android or Play wording', async () => {
  for (const line of Object.values(APP_PROMPTS)) {
    assert.match(line, /^[A-Z][a-z' ]+ in the app$/, line);
    assert.doesNotMatch(line, /—|Android|Play/);
  }
  for (const text of [script, css, read('../src/app-banner.ts')]) assert.doesNotMatch(text, /Google Play|play\.google|Android app/i);
});

test('the Worker writes the worded line, both links and Apple\'s Smart App Banner on a member page, and none of it on other pages', async () => {
  const response = await workerFetch(PAGES.member);
  assert.equal(response.status, 200);
  const doc = new JSDOM(await response.text()).window.document;
  const meta = doc.querySelectorAll('head meta[name="apple-itunes-app"]');
  assert.equal(meta.length, 1);
  assert.equal(meta[0].content, 'app-id=6818756305, app-argument=opax://subject/person/anthony-albanese, affiliate-data=ct=web_member_safari');
  // Ahead of the script, which looks for it before the body is parsed.
  assert.ok(meta[0].compareDocumentPosition(doc.querySelector('head script[src^="/app-banner.js"]')) & 4);
  const banner = doc.getElementById('opax-app-banner');
  assert.equal(banner.dataset.appPrompt, 'member');
  const get = banner.querySelector('a[data-app-prompt-get]');
  assert.equal(get.textContent, 'Follow this member in the app');
  assert.equal(get.href, 'https://apps.apple.com/au/app/opax/id6818756305?ct=web_member');
  assert.equal(banner.querySelector('a[data-app-prompt-open]').getAttribute('href'), 'opax://subject/person/anthony-albanese');
  assert.equal(banner.querySelector('.opax-app-banner-general a').href, 'https://apps.apple.com/au/app/opax/id6818756305');

  for (const path of ['/about', '/', '/privacy']) {
    const html = await (await workerFetch(path)).text();
    assert.doesNotMatch(html, /apple-itunes-app|data-app-prompt="/, path);
  }
});

test('an iPhone browser without Apple\'s banner gets the worded line once, in the banner\'s own space', async () => {
  const page = await land();
  assert.equal(page.worded(), true);
  assert.equal(page.general(), false);
  // One line or the other is in the flow from the first paint: nothing is inserted later.
  assert.equal(page.banner.querySelectorAll('p').length, 2);
  assert.equal(page.window.document.activeElement, page.window.document.body, 'no focus movement');
  assert.deepEqual(page.events, [{ event: 'opax_app_prompt_view', properties: { page_type: 'member' } }]);
  assert.equal(page.window.localStorage.getItem(seenKey), '1');

  // Shown once per visitor: the next page load has neither line on a prompt page.
  const again = await land({ stored: { [seenKey]: '1' }, path: PAGES.bill });
  assert.equal(again.worded(), false);
  assert.equal(again.general(), false);
  assert.deepEqual(again.events, []);
  // Elsewhere the general line is as it was.
  again.go('/about');
  assert.equal(again.general(), true);
  page.dom.window.close(); again.dom.window.close();
});

test('Safari on iPhone and iPad shows Apple\'s banner and never ours with it', async () => {
  for (const [ua, touch] of [[SAFARI_IPHONE, 5], [SAFARI_MAC, 5]]) {
    const page = await land({ ua, touch });
    assert.equal(page.worded(), false, ua);
    assert.equal(page.general(), false, ua);
    assert.deepEqual(page.events, [], ua);
    assert.equal(page.window.localStorage.getItem(seenKey), null, 'Apple\'s banner does not use up the one showing');
    // Still away after moving within the site: Apple's banner stays for the page load.
    page.go('/about');
    assert.equal(page.general(), false, ua);
    page.dom.window.close();
  }
  // No Smart App Banner tag on the page (home, about): Safari keeps the general line.
  const home = await land({ ua: SAFARI_IPHONE, touch: 5, path: '/about' });
  assert.equal(home.general(), true);
  // Arriving at a prompt page from there, with no Apple banner on screen, shows ours.
  home.go(PAGES.member);
  assert.equal(home.worded(), true);
  home.dom.window.close();
});

test('desktop keeps the one quiet general line, with no prompt and no events; Android gets nothing', async () => {
  const mac = await land({ ua: SAFARI_MAC, touch: 0 });
  assert.equal(mac.general(), true);
  assert.equal(mac.worded(), false);
  mac.banner.querySelector('.opax-app-banner-general a').dispatchEvent(new mac.window.MouseEvent('click', { bubbles: true, cancelable: true }));
  assert.deepEqual(mac.events, []);
  const android = await land({ ua: 'Mozilla/5.0 (Linux; Android 16) Chrome/142 Mobile Safari/537.36' });
  assert.equal(android.worded() || android.general(), false);
  assert.deepEqual(android.events, []);
  mac.dom.window.close(); android.dom.window.close();
});

test('a tap on the App Store link sends one event with the page type; Open this page and Dismiss send none', async () => {
  const page = await land({ path: PAGES.document });
  const click = el => { const e = new page.window.MouseEvent('click', { bubbles: true, cancelable: true }); el.addEventListener('click', ev => ev.preventDefault(), { once: true }); el.dispatchEvent(e); };
  click(page.banner.querySelector('[data-app-prompt-get]'));
  click(page.banner.querySelector('[data-app-prompt-open]'));
  assert.deepEqual(page.events.map(e => [e.event, e.properties]), [
    ['opax_app_prompt_view', { page_type: 'document' }], ['opax_app_prompt_tap', { page_type: 'document' }]]);
  click(page.banner.querySelector('[data-app-banner-dismiss]'));
  assert.equal(page.worded() || page.general(), false);
  assert.equal(page.window.localStorage.getItem(key), '1');
  assert.equal(page.events.length, 2);
  const later = await land({ stored: { [key]: '1' } });
  assert.equal(later.worded() || later.general(), false);
  page.dom.window.close(); later.dom.window.close();
});

test('the two events pass the allowlist with the page type and nothing else', async () => {
  for (const event of ['opax_app_prompt_view', 'opax_app_prompt_tap']) {
    for (const type of Object.keys(APP_PROMPTS)) {
      assert.deepEqual(cleanEvent(event, { page_type: type, slug: 'anthony-albanese', name: 'A Member', q: 'words', id: 7 }), { page_type: type });
    }
    for (const value of ['anthony-albanese', '/subject/person/anthony-albanese', 'person', '', undefined]) assert.deepEqual(cleanEvent(event, { page_type: value }), {});
  }
});

test('in-page navigation rewords the line and repoints both links, as the Worker would have written them', async () => {
  const page = await land();
  for (const [type, path] of Object.entries(PAGES)) {
    page.go(path);
    const fresh = new JSDOM(appBannerHTML(path)).window.document;
    assert.equal(page.worded(), true, path);
    assert.equal(page.banner.dataset.appPrompt, type);
    for (const sel of ['[data-app-prompt-get]', '[data-app-prompt-open]']) {
      assert.equal(page.banner.querySelector(sel).getAttribute('href'), fresh.querySelector(sel).getAttribute('href'), path);
      assert.equal(page.banner.querySelector(sel).textContent, fresh.querySelector(sel).textContent, path);
    }
    assert.equal(page.window.document.querySelector('meta[name="apple-itunes-app"]').content, new JSDOM(smartBannerMeta(path)).window.document.querySelector('meta').content, path);
  }
  assert.equal(page.events.length, 1, 'one view for the page load, however far the reader goes');
  page.go('/about');
  assert.equal(page.general(), true);
  assert.equal(page.worded(), false);
  page.dom.window.close();
});

test('Ask never has the line while an answer is being written', async () => {
  const idle = await land({ path: '/ask', extra: '<form id="ask-form"><input id="ask-input"></form>' });
  assert.equal(idle.worded(), true);
  // Sending a question takes the line away before the answer starts, and it stays away on Ask.
  idle.window.document.getElementById('ask-form').dispatchEvent(new idle.window.Event('submit', { bubbles: true, cancelable: true }));
  assert.equal(idle.worded() || idle.general(), false);
  idle.go('/ask?q=who+voted');
  assert.equal(idle.worded() || idle.general(), false);
  idle.go('/ask');
  assert.equal(idle.worded() || idle.general(), false);
  // Arriving with a question in the address (a shared answer, a search result): never shown.
  for (const path of ['/ask?q=who+voted+for+the+bill', '/#/ask?q=who', '/ask?view=search']) {
    const asked = await land({ path });
    assert.equal(asked.worded() || asked.general(), false, path);
    assert.deepEqual(asked.events, [], path);
    assert.equal(asked.window.localStorage.getItem(seenKey), null, path);
    asked.dom.window.close();
  }
  idle.dom.window.close();
});

test('the worded line is a real link and button, reachable by keyboard, with a focus ring and room to wrap', async () => {
  const page = await land();
  const [get, open] = page.banner.querySelectorAll('.opax-app-banner-prompt a');
  assert.equal(get.tagName, 'A');
  assert.equal(get.textContent, 'Follow this member in the app', 'the link says what it does without the text around it');
  assert.equal(open.textContent, 'Open this page');
  assert.equal(page.banner.querySelector('[tabindex], [aria-live], [role="alert"], [autofocus]'), null);
  assert.equal(page.banner.querySelector('button').tabIndex, 0);
  assert.match(css, /\.opax-app-banner-prompt > a \{ white-space: normal; \}/);
  // The line not showing is display: none, so its links are out of the tab order.
  assert.equal(page.window.getComputedStyle(page.banner.querySelector('.opax-app-banner-general')).display, 'none');
  page.dom.window.close();
});
