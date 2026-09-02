/* Google Tag Manager loader.
   Kept in its own file rather than inline in index.html so the page's content
   security policy needs no 'unsafe-inline' for scripts: the only allowance is
   the googletagmanager.com origin. Container GTM-PNDM87LW. */
(function (w, d, s, l, i) {
  w[l] = w[l] || [];
  w[l].push({ "gtm.start": new Date().getTime(), event: "gtm.js" });
  const f = d.getElementsByTagName(s)[0];
  const j = d.createElement(s);
  const dl = l !== "dataLayer" ? "&l=" + l : "";
  j.async = true;
  j.src = "https://www.googletagmanager.com/gtm.js?id=" + i + dl;
  f.parentNode.insertBefore(j, f);
})(window, document, "script", "dataLayer", "GTM-PNDM87LW");

/* --- OPAX events -------------------------------------------------------------
   The site is a single page app on real paths, so Tag Manager sees one page
   view unless we tell it otherwise. These push to the dataLayer; configure the
   tags in the Tag Manager UI against these event names.

   Every value is a category or a count. Nothing here carries a reader's
   question text, a search phrase or any free text they typed: the events say
   what kind of thing happened, not what was asked. */
(function () {
  const dl = () => (window.dataLayer = window.dataLayer || []);
  const push = (event, params) => { try { dl().push({ event, ...params }); } catch { /* never break the page */ } };

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
    const p = here();
    if (p === last) return;
    last = p;
    push("opax_view", { page_path: p, page_section: sectionOf(p), page_title: document.title });
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
      return push("opax_download", { file: href.split("/").pop() || "" });
    }
    if (/^https?:/i.test(href) && !href.includes("opax.com.au")) {
      return push("opax_outbound", { host: (href.match(/^https?:\/\/([^/]+)/) || [])[1] || "" });
    }
    if (/^\/?#?\/doc\//.test(href)) return push("opax_source_open", { from_section: sectionOf(here()) });
  }, true);
})();
