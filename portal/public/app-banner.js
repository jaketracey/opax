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
})();
