/* Blocking head script: decide visibility before the banner is parsed. */
(() => {
  'use strict';
  const key = 'opax-app-banner-dismissed';
  const root = document.documentElement;
  let dismissed = false;
  try { dismissed = Boolean(localStorage.getItem(key)); } catch { /* show without storage */ }

  function sync() {
    // OPAX-iOS/<version> (<build>) is the app's existing user-agent marker.
    const ineligible = /Android|OPAX-iOS\//i.test(navigator.userAgent);
    const path = location.hash.startsWith('#/') ? location.hash.slice(1).split('?')[0] : location.pathname;
    const reviewPage = /^\/(?:support|privacy|community|signin|sign-in|login|auth)(?:\/|\.html|$)/i.test(path);
    root.classList.toggle('opax-app-banner-hidden', dismissed || ineligible || reviewPage);
  }
  sync();

  document.addEventListener('click', event => {
    if (!(event.target instanceof Element) || !event.target.closest('[data-app-banner-dismiss]')) return;
    dismissed = true;
    sync();
    try { localStorage.setItem(key, '1'); } catch { /* still dismissed for this page */ }
  });
  // Legacy hash links and the SPA's history navigation can open policy pages.
  addEventListener('hashchange', sync);
  addEventListener('popstate', sync);
  addEventListener('opax:route', sync);
})();
