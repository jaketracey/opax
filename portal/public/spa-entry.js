// A module that will not load is nearly always a release that replaced the
// files this page was built against ("Importing a module script failed" in
// Safari). The page is loaded again, once: the build that failed is kept for
// the tab (sessionStorage), so a module that still fails after the reload, or
// with no network, leaves the page as it is and never loops.
(() => {
  const STALE = /Importing a module script failed|Failed to fetch dynamically imported module|error loading dynamically imported module/i;
  const KEY = 'opax-module-reload';
  // The build is the app script's content stamp, written by the release.
  const build = () => document.querySelector('script[src^="/app.js"]')?.getAttribute('src') || 'unstamped';
  const reloadOnce = (message) => {
    if (!STALE.test(String(message ?? '')) || navigator.onLine === false) return;
    try {
      const id = build();
      if (sessionStorage.getItem(KEY) === id) return;
      sessionStorage.setItem(KEY, id);
    } catch { return; } // nowhere to keep the guard, so no reload
    location.reload();
  };
  window.addEventListener('unhandledrejection', (e) => reloadOnce(e.reason?.message ?? e.reason));
  window.addEventListener('error', (e) => reloadOnce(e.message));
})();
// Run before first paint. The no-JS answer remains visible when scripts are disabled.
if (location.pathname !== '/' && location.pathname !== '/index.html') {
  document.documentElement.classList.add('spa-booting');
  // The frame route() will draw (showPanel in app.js): every panel but Ask is
  // compact, and Search keeps the hero. Drawing it before the app boots keeps
  // the hero and the breadcrumb strip from moving the page when it does.
  const search = /^\/ask(?:\/|$)/.test(location.pathname) && new URLSearchParams(location.search).get('view') === 'search';
  if (search || !/^\/ask(?:\/|$)/.test(location.pathname)) document.documentElement.classList.add('spa-boot-compact');
  if (search) document.documentElement.classList.add('spa-boot-search');
  // The Ask box is drawn when the app routes, seconds after the hero on a slow
  // phone or a throttled laptop. A reader who starts typing on the hero used to
  // lose every key, and an Enter asked nothing. Keys typed on the page itself
  // (no control focused) are kept until app.js takes them into the box
  // (takeEarlyAsk); an Enter among them asks once the box is there.
  if (/^\/ask\/?$/.test(location.pathname) && !search && !new URLSearchParams(location.search).has('q')) {
    const early = { text: '', enter: false };
    const keep = (e) => {
      const root = document.documentElement;
      if (root.classList.contains('spa-routed') || e.defaultPrevented || e.isComposing || e.ctrlKey || e.metaKey || e.altKey) return;
      if (e.target !== document.body && e.target !== root) return; // a focused control owns its keys
      if (e.key === 'Enter') {
        if (early.text.trim()) { early.enter = true; e.preventDefault(); }
      } else if (e.key === 'Backspace') {
        early.text = early.text.slice(0, -1);
        e.preventDefault();
      } else if (e.key.length === 1 && !early.enter) {
        early.text += e.key;
        e.preventDefault(); // a space would scroll the page; '/' would open Firefox's find bar
      }
    };
    document.addEventListener('keydown', keep, true);
    window.OpaxEarlyAsk = () => {
      document.removeEventListener('keydown', keep, true);
      window.OpaxEarlyAsk = null;
      return early;
    };
  }
  setTimeout(() => {
    if (!document.documentElement.classList.contains('spa-ready')) {
      // The app never routed: give the reader the whole server answer.
      document.documentElement.classList.remove('spa-booting', 'spa-boot-compact', 'spa-boot-search');
      document.documentElement.classList.add('spa-failed');
    }
  }, 10000);
}
