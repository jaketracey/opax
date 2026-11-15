/* Blocking head script: decide visibility before the banner is parsed. */
(() => {
  'use strict';
  const key = 'opax-app-banner-dismissed';
  const root = document.documentElement;
  let dismissed = false;
  try { dismissed = Boolean(localStorage.getItem(key)); } catch { /* show without storage */ }

  // The page-worded prompt (src/app-banner.ts holds the same table and writes
  // the first page's line into the HTML; this one follows in-page navigation).
  const lines = {
    document: 'Read this record in the app',
    supplier: 'See this supplier in the app',
    grant_recipient: 'See this grant recipient in the app',
    ask: 'Ask the public record in the app',
    vic_district: 'See this district in the app',
    member: 'Follow this member in the app',
    electorate: 'Follow this electorate in the app',
    bill: 'Track this bill in the app',
    donor: 'See this donor in the app',
  };
  const id = '[A-Za-z0-9._~%:-]+';
  const pages = [
    ['document', /^\/doc\/[a-z0-9-]+$/],
    ['supplier', new RegExp(`^/subject/supplier/${id}$`)],
    ['grant_recipient', new RegExp(`^/money/grants/(?:federal|qld)/recipient/(?!person(?::|%3[Aa]))${id}$`)],
    ['ask', /^\/ask$/],
    ['vic_district', /^\/vic-election-2026\/[a-z0-9]+(?:-[a-z0-9]+)*$/],
    ['member', /^\/subject\/person\/[a-z0-9-]+$/],
    ['electorate', /^\/subject\/electorate\/[a-z0-9_-]+$/],
    ['bill', /^\/bill\/[a-z0-9-]+$/],
    ['donor', new RegExp(`^/subject/donor/${id}$`)],
  ];
  const seenKey = 'opax-app-prompt-seen';
  const ua = navigator.userAgent;
  // iPadOS Safari calls itself a Mac; a Mac has no touch points.
  const apple = /iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1);
  // Safari itself (and the Safari sheet other apps open) draws Apple's Smart
  // App Banner from the tag the Worker put ahead of this script. It knows
  // whether the app is installed, so it wins: this banner stays away for the
  // whole visit to the page and the two never show together. Other iPhone and
  // iPad browsers ignore the tag and get the worded line instead.
  const safari = apple && /Version\/[\d.]+.*Safari\//.test(ua) && !/CriOS|FxiOS|EdgiOS|OPiOS|OPT\/|GSA\/|DuckDuckGo|Brave/.test(ua);
  const native = safari && Boolean(document.querySelector('meta[name="apple-itunes-app"]'));
  // Shown once per visitor: a browser that has had the worded line does not get
  // it on a later page load. Within one load it stays as the reader moves.
  let seenBefore = false;
  try { seenBefore = Boolean(localStorage.getItem(seenKey)); } catch { /* show without storage */ }
  let shown = false; // the worded line has been on screen in this page load
  let asked = false; // a question was sent from Ask in this page load

  function page() {
    const hashed = location.hash.startsWith('#/');
    const [rawPath, hashQuery = ''] = hashed ? location.hash.slice(1).split('?') : [location.pathname];
    const path = rawPath.length > 1 ? rawPath.replace(/\/$/, '') : rawPath;
    const type = pages.find(([, pattern]) => pattern.test(path))?.[0] || null;
    const query = new URLSearchParams(hashed ? hashQuery : location.search);
    // Ask with a question in the address is an answer being written; with a
    // view it is the search page. Neither gets the line.
    const busy = type === 'ask' && (asked || query.has('q') || query.has('view'));
    return { path, type, busy };
  }

  function sync() {
    // OPAX-iOS/<version> (<build>) is the app's existing user-agent marker.
    const ineligible = /Android|OPAX-iOS\//i.test(ua);
    const { path, type, busy } = page();
    const reviewPage = /^\/(?:support|privacy|community|signin|sign-in|login|auth)(?:\/|\.html|$)/i.test(path);
    let hidden = dismissed || ineligible || reviewPage || native;
    // On a prompt page an iPhone or iPad gets the worded line or nothing.
    const worded = !hidden && apple && Boolean(type) && !busy && (shown || !seenBefore);
    if (apple && type && !worded) hidden = true;
    root.classList.toggle('opax-app-banner-hidden', hidden);
    root.classList.toggle('opax-app-prompt', worded);
    if (type) fill(type, path);
    if (worded && !shown) {
      shown = true;
      try { localStorage.setItem(seenKey, '1'); } catch { /* shown again next time */ }
      // events.js (deferred) is listening by the time the document is parsed.
      const view = () => measure('opax_app_prompt_view', type);
      if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', view, { once: true });
      else view();
    }
  }
  // Keep the line, its App Store link and the Smart App Banner's argument on
  // the page the reader is on now. Before the body is parsed there is nothing
  // to fill, and the Worker's HTML is already right. The link keeps whatever
  // provider token (pt) the Worker wrote and takes the page type's campaign token.
  function fill(type, path) {
    const banner = document.getElementById('opax-app-banner');
    const get = banner?.querySelector('[data-app-prompt-get]');
    if (get && banner.getAttribute('data-app-prompt') !== type) {
      banner.setAttribute('data-app-prompt', type);
      get.textContent = lines[type];
      const pt = /[?&]pt=(\d+)/.exec(get.getAttribute('href') || '')?.[1];
      get.setAttribute('href', `${get.getAttribute('href').split('?')[0]}?${pt ? `pt=${pt}&` : ''}ct=web_${type}`);
    }
    const meta = document.querySelector('meta[name="apple-itunes-app"]');
    if (meta) meta.setAttribute('content', meta.getAttribute('content').replace(/app-argument=[^,]*/, `app-argument=opax:/${path}`).replace(/ct=web_\w+/, `ct=web_${type}_safari`));
  }
  // The page type and nothing else: no id, slug, name or search words.
  function measure(event, type) {
    try { dispatchEvent(new CustomEvent('opax:analytics', { detail: { event, properties: { page_type: type } } })); } catch { /* optional analytics */ }
  }
  sync();

  document.addEventListener('click', event => {
    if (!(event.target instanceof Element) || !event.target.closest('[data-app-banner-dismiss]')) return;
    dismissed = true;
    sync();
    try { localStorage.setItem(key, '1'); } catch { /* still dismissed for this page */ }
  });
  // The App Store link in the worded line: one tap event, with the page type.
  const tapped = event => {
    if (event.type === 'auxclick' ? event.button !== 1 : event.button > 0) return;
    const link = event.target instanceof Element && event.target.closest('[data-app-prompt-get]');
    const type = link && link.closest('[data-app-prompt]')?.getAttribute('data-app-prompt');
    if (type && Object.hasOwn(lines, type)) measure('opax_app_prompt_tap', type);
  };
  document.addEventListener('click', tapped);
  document.addEventListener('auxclick', tapped);
  // A question sent from Ask: the line leaves before the answer starts and
  // stays away from Ask for the rest of this page load.
  document.addEventListener('submit', event => {
    if (event.target instanceof Element && event.target.id === 'ask-form') { asked = true; sync(); }
  }, true);
  // Skip to content (the Worker writes it first in the body, ahead of this banner):
  // focus the page's title, the H1 showing in the element the link names, else
  // that element itself (the map), else main.
  document.addEventListener('click', event => {
    const link = event.target instanceof Element && event.target.closest('a[data-skip-link]');
    if (!link || event.defaultPrevented) return;
    const named = document.getElementById((link.getAttribute('href') || '').slice(1));
    const main = named || document.querySelector('main');
    const shown = h => h.getClientRects().length > 0;
    const target = [...(main || document).querySelectorAll('h1')].find(shown) || main;
    if (!target) return;
    event.preventDefault();
    if (!target.hasAttribute('tabindex')) target.setAttribute('tabindex', '-1');
    target.focus();
    target.scrollIntoView({ block: 'start' });
  });
  // Legacy hash links and the SPA's history navigation can open policy pages.
  addEventListener('hashchange', sync);
  addEventListener('popstate', sync);
  addEventListener('opax:route', sync);
  // A legacy hash link names its page only here; fill the line once it exists.
  document.addEventListener('DOMContentLoaded', sync);
})();
