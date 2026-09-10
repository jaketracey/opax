import { cleanEvent, safePath } from './privacy.mjs';
/* --- OPAX events -------------------------------------------------------------
   The site is a single page app on real paths, so Tag Manager sees one page
   view unless we tell it otherwise. Every producer passes through the same
   allowlist before delivery to Tag Manager and PostHog.

   Every value is a category or a count. Nothing here carries a reader's
   question text, a search phrase or any free text they typed: the events say
   what kind of thing happened, not what was asked. */
(function () {
  const optedOut = () => navigator.doNotTrack === '1' || window.doNotTrack === '1';
  // One privacy boundary for every producer, including async application outcomes.
  // Buffer early events so the GTM-delivered GA adapter can replay the first view.
  window.opaxAnalyticsPending = [];
  addEventListener('opax:analytics', ({ detail }) => {
    if (optedOut()) return;
    const properties = cleanEvent(detail?.event, detail?.properties);
    if (!properties) return;
    properties.page_path ??= safePath(location.href);
    properties.page_section = sectionOf(properties.page_path);
    const measured = { event: detail.event, properties };
    (window.dataLayer = window.dataLayer || []).push({ event: detail.event, opax: { ...properties, _clear: true } });
    if (window.opaxAnalyticsPending) {
      window.opaxAnalyticsPending.push(measured);
      if (window.opaxAnalyticsPending.length > 100) window.opaxAnalyticsPending.shift();
    }
    dispatchEvent(new CustomEvent('opax:measured', { detail: measured }));
  });
  const push = (event, params) => {
    try { dispatchEvent(new CustomEvent("opax:analytics", { detail: { event, properties: params } })); } catch { /* optional analytics */ }
  };

  // Route views. Routes are real paths (the form the sitemap and the canonical
  // links use); a route-shaped hash is still honoured for links from before
  // that change, which app.js normalises away a moment later.
  const here = () => {
    const h = (location.href.split("#")[1] || "");
    return h.startsWith("/") ? h : location.pathname + location.search;
  };
  const sectionOf = (p) => {
    const seg = p.split("?")[0].split("/").filter(Boolean);
    if (!seg.length) return "home";
    if (seg[0] === "subject") return `subject:${seg[1] || "index"}`;
    if (seg[0] === "reports") return seg[1] ? "report" : "reports";
    return seg[0];
  };
  let last = null;
  const view = () => {
    const p = here().split("?")[0];
    if (p === last) return;
    last = p;
    push("opax_view", { page_path: p.split("?")[0], page_section: sectionOf(p) });
  };
  // In-app navigation is a pushState, which fires no event of its own: app.js
  // announces each render on "opax:route". popstate covers back and forward,
  // hashchange the older links still arriving as "#/…".
  addEventListener("opax:route", view);
  addEventListener("popstate", view);
  addEventListener("hashchange", view);
  addEventListener("DOMContentLoaded", view);
  view();

  // Asks and searches: the kind of question, never its text.
  addEventListener("submit", (e) => {
    const f = e.target;
    if (!f || !f.id) return;
    if (f.id === "ask-form") {
      const q = document.getElementById("ask-input");
      push("opax_ask", { question_length: (q?.value || "").trim().length, from_section: sectionOf(here()) });
    } else if (f.id === "search-form") {
      const q = document.getElementById("search-input");
      const kind = document.getElementById("search-kind");
      const mode = document.getElementById("search-mode");
      push("opax_search", {
        query_length: (q?.value || "").trim().length,
        search_kind: kind?.value || "speech",
        search_mode: mode?.value || "hybrid",
      });
    }
  }, true);

  // The things a reader clicks that say what the site is for.
  addEventListener("click", (e) => {
    const t = e.target instanceof Element ? e.target : null;
    if (!t) return;
    const chip = t.closest("#search-chips .chip, #chip-row .chip");
    if (chip) return push("opax_chip", { chip_kind: chip.closest("#search-chips") ? "search" : "ask" });
    const game = t.closest("[id^='explore-'][id$='-btn']");
    if (game) return push("opax_game_open", { game: game.id.replace(/^explore-|-btn$/g, "") });
    const a = t.closest("a");
    if (!a) return;
    const href = a.getAttribute("href") || "";
    if (a.classList.contains("action-btn") && /download|\.json|\.csv/i.test(href + a.textContent)) {
      return push("opax_download", { format: /\.csv(?:[?#]|$)/i.test(href) ? "csv" : /\.json(?:[?#]|$)/i.test(href) ? "json" : "other" });
    }
    let url;
    try { url = new URL(href, location.href); } catch { return; }
    if (/^https?:$/.test(url.protocol) && !['opax.com.au', 'www.opax.com.au', location.hostname].includes(url.hostname)) {
      return push("opax_outbound", { host: url.hostname, partner: a.dataset.analyticsPartner, placement: a.closest('footer') ? 'footer' : 'content' });
    }
    if (url.pathname.startsWith('/community')) return push('opax_community_open', { placement: a.closest('footer') ? 'footer' : 'navigation' });
    if (a.closest('[data-money-navigation]')) return push('opax_money_view', { view: url.pathname === '/money' ? 'connections' : url.pathname === '/discover' ? 'contracts' : url.pathname.endsWith('/grants') ? 'grants' : 'receipts' });
    if (/^\/?#?\/doc\//.test(href)) return push("opax_source_open", { from_section: sectionOf(here()) });
  }, true);
})();
