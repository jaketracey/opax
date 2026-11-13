import { cleanEvent, safePath, automationReason, whenMeasurable } from './privacy.mjs';
import { askPageType } from '../public/growth-modules.js';
/* --- OPAX events -------------------------------------------------------------
   The site is a single page app on real paths, so Tag Manager sees one page
   view unless we tell it otherwise. Every producer passes through the same
   allowlist before delivery to Tag Manager and PostHog.

   Every value is a category or a count. Nothing here carries a reader's
   question text, a search phrase or any free text they typed: the events say
   what kind of thing happened, not what was asked. */
(function () {
  // Do Not Track, or a clearly automated browser: nothing is measured or forwarded.
  const optedOut = () => navigator.doNotTrack === '1' || window.doNotTrack === '1' || !!automationReason(navigator, window, document);
  // One privacy boundary for every producer, including async application outcomes.
  // Buffer early events so the GTM-delivered GA adapter can replay the first view.
  window.opaxAnalyticsPending = [];
  // PostHog (analytics.js) runs after the app's own scripts, so it replays from
  // its own log: GA's adapter empties opaxAnalyticsPending when it arrives.
  window.opaxAnalyticsLog = [];
  // Until the visit is known to be measurable (a page hidden at load with no
  // viewport yet), events wait here and are replayed once it comes on screen.
  let held = [];
  addEventListener('opax:analytics', ({ detail }) => {
    if (!held) return measure(detail);
    held.push(detail);
    if (held.length > 100) held.shift();
  });
  whenMeasurable(navigator, window, document, () => {
    const early = held;
    held = null;
    for (const detail of early) measure(detail);
  });
  function measure(detail) {
    if (optedOut()) return;
    const properties = cleanEvent(detail?.event, detail?.event === "opax_ask_started"
      ? {...detail.properties, page_type: detail.properties?.page_type || askPageType(location.href)}
      : detail?.properties);
    if (!properties) return;
    if (!detail.event.startsWith('table_')) {
      properties.page_path ??= safePath(location.href);
      properties.page_section = sectionOf(properties.page_path);
    }
    const measured = { event: detail.event, properties };
    (window.dataLayer = window.dataLayer || []).push({ event: detail.event, opax: { ...properties, _clear: true } });
    for (const buffer of [window.opaxAnalyticsPending, window.opaxAnalyticsLog]) if (buffer) {
      buffer.push(measured);
      if (buffer.length > 100) buffer.shift();
    }
    dispatchEvent(new CustomEvent('opax:measured', { detail: measured }));
  }
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

  // Primary/keyboard and middle-button openings have disjoint event paths.
  const moduleOpening = (e) => {
    if (e.type === "auxclick" ? e.button !== 1 : e.button > 0) return;
    const t = e.target instanceof Element ? e.target : null;
    const module = t?.closest("a[href]")?.closest("[data-module]");
    if (module) push("opax_module_click", {module: module.dataset.module, page_type: module.dataset.pageType, position: Number(module.dataset.modulePosition)});
  };
  addEventListener("auxclick", moduleOpening, true);
  // The things a reader clicks that say what the site is for.
  addEventListener("click", (e) => {
    moduleOpening(e);
    const t = e.target instanceof Element ? e.target : null;
    if (!t) return;
    if (t.closest("#search-chips .chip")) return push("opax_chip", { chip_kind: "search" });
    // Ask's sample questions are links (.ask-sample). One that asks in place
    // reports itself through app.js trackOutcome; only a modified click, which
    // opens the question in a new tab and skips that, is counted here.
    const sample = t.closest(".ask-sample");
    if (sample) return (e.metaKey || e.ctrlKey || e.shiftKey) ? push("opax_chip", { chip_kind: "ask" }) : undefined;
    const game = t.closest("[id^='explore-'][id$='-btn']");
    if (game) return push("opax_game_open", { game: game.id.replace(/^explore-|-btn$/g, "") });
    const a = t.closest("a");
    if (!a) return;
    const href = a.getAttribute("href") || "";
    // Press kit images (/press): that one was taken, not which.
    if (a.closest("[data-press-asset]")) return push("opax_press", { action: "asset_download" });
    if (a.classList.contains("ui-button") && /download|\.json|\.csv/i.test(href + a.textContent)) {
      return push("opax_download", { format: /\.csv(?:[?#]|$)/i.test(href) ? "csv" : /\.json(?:[?#]|$)/i.test(href) ? "json" : "other" });
    }
    let url;
    try { url = new URL(href, location.href); } catch { return; }
    if (/^https?:$/.test(url.protocol) && !['opax.com.au', 'www.opax.com.au', location.hostname].includes(url.hostname)) {
      return push("opax_outbound", { host: url.hostname, partner: a.dataset.analyticsPartner, placement: a.closest('footer') ? 'footer' : 'content' });
    }
    if (url.pathname.startsWith('/community')) return push('opax_community_open', { placement: a.closest('footer') ? 'footer' : 'navigation' });
    if (a.closest('[data-money-navigation]')) return push('opax_money_view', { view: url.pathname === '/money' ? 'connections' : url.pathname === '/money/contracts' ? 'contracts' : url.pathname.endsWith('/grants') ? 'grants' : 'receipts' });
    if (/^\/?#?\/doc\//.test(href)) return push("opax_source_open", { from_section: sectionOf(here()), placement: sourcePlacement(a) });
  }, true);
  // Where a source link sat: in an answer's text, in its sources list, or in
  // the voice panel's sources. Elsewhere (search results, lists) is "other".
  const sourcePlacement = (a) =>
    a.closest(".opax-voice-sources") ? "talk_sources"
      : a.closest(".chat-sources") ? "sources_pane"
      : a.closest(".answer, .opax-voice-transcript") ? "inline"
      : "other";
  // A copy from the press kit's boilerplate (/press). Only where the selection
  // starts is looked at, never its text; the event says that it happened.
  const elementOf = (n) => (n?.nodeType === 1 ? n : n?.parentElement) || null;
  addEventListener("copy", (e) => {
    let start = null;
    try { start = elementOf(document.getSelection?.()?.anchorNode); } catch { /* no selection API */ }
    if ((start || elementOf(e.target))?.closest?.("[data-press-copy]")) push("opax_press", { action: "boilerplate_copy" });
  }, true);
})();
