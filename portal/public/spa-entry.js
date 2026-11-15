// A module that will not load is nearly always a release that replaced the
// files this page was built against ("Importing a module script failed" in
// Safari). The page is loaded again, once a build: the builds that failed are
// kept for the tab (sessionStorage), so a module that still fails after the
// reload, or with no network, leaves the page as it is and never loops. An
// answer that is arriving is never cut off, and a question being typed in the
// Ask box is put back after the reload.
(() => {
  // Chrome's and Firefox's wording is also what a module that is gone for good
  // (a 404) or stopped by a content blocker gives. Those reload too, and the
  // cap below holds for them the same: once for the build, for the tab.
  const STALE = /Importing a module script failed|Failed to fetch dynamically imported module|error loading dynamically imported module/i;
  const KEY = 'opax-module-reload';
  const DRAFT = 'opax-module-reload-ask';
  // The build is the app script's content stamp, written by the release.
  const build = () => document.querySelector('script[src^="/app.js"]')?.getAttribute('src') || 'unstamped';
  // An answer is arriving: app.js holds these two buttons this way from the
  // question to the end of its answer (runAsk and sendChat).
  const answering = () => !!document.querySelector('#ask-submit[aria-busy="true"], #chat-send:disabled');
  const reloadOnce = (message) => {
    if (!STALE.test(String(message ?? '')) || navigator.onLine === false) return;
    try {
      // A reload would cut the answer off. The page is left alone and the one
      // reload is not spent: a module that fails after the answer still has it.
      if (answering()) return;
      const id = build();
      // Every build this tab has reloaded for, one a line: a release still
      // rolling out can serve the old page and the new one in turn, and each
      // is reloaded for once, not once each time it comes back.
      const tried = () => (sessionStorage.getItem(KEY) || '').split('\n').filter(Boolean);
      const before = tried();
      if (before.includes(id)) return;
      sessionStorage.setItem(KEY, [...before, id].join('\n'));
      // A store that takes the write and does not keep it is no guard.
      if (!tried().includes(id)) return;
      // A question being typed in the Ask box would go with the page. It is
      // kept for this tab only, in the same store, and put back after the load.
      const draft = String(document.querySelector('#ask-input')?.value ?? '').slice(0, 4000);
      if (draft.trim()) sessionStorage.setItem(DRAFT, draft);
      else sessionStorage.removeItem(DRAFT);
    } catch { return; } // nowhere to keep the guard, so no reload
    location.reload();
  };
  window.addEventListener('unhandledrejection', (e) => reloadOnce(e.reason?.message ?? e.reason));
  window.addEventListener('error', (e) => reloadOnce(e.message));

  // The question kept before a reload. It leaves the store as it is read, so
  // it is put back once and never turns up on a later load.
  let draft = '';
  try {
    draft = sessionStorage.getItem(DRAFT) || '';
    if (draft) sessionStorage.removeItem(DRAFT);
  } catch { draft = ''; }
  if (draft.trim()) {
    // app.js fills the box as it routes (a question in the address, or
    // nothing), so the draft goes in after the first route.
    const restore = () => {
      window.removeEventListener('opax:route', restore);
      const field = document.querySelector('#ask-input');
      if (!field) return;
      const now = String(field.value ?? '').trim();
      const asked = (new URLSearchParams(location.search).get('q') || '').trim();
      // Anything else in the box was typed since the load, and stays.
      if (now && now !== asked) return;
      if (now === draft.trim()) return;
      field.value = draft;
      field.dispatchEvent(new Event('input', { bubbles: true })); // the box fits itself to its text
    };
    window.addEventListener('opax:route', restore);
  }
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
