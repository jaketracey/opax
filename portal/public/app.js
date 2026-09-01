/* OPAX portal — vanilla JS, no build step.
   The hash is the single source of truth for navigation; route() renders it. */

"use strict";

const $ = (id) => document.getElementById(id);

// --- shared state -----------------------------------------------------------

let corpusManifest = null; // /corpus.json
let liveStats = null; // /api/stats
let suggestions = []; // /suggestions.json
let reportsIndex = null;
let lastSearch = { query: "", filters: {}, results: [] };
let lastAsk = { question: "", sources: [] };
let currentDocSlug = null;
let currentDoc = null;

const PANELS = ["ask", "search", "money", "reports", "doc", "about", "methods"];

// --- helpers ----------------------------------------------------------------

function esc(s) {
  // Attribute-safe escaping: & < > " ' — this output lands in attribute values too.
  return String(s ?? "").replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
}

/** Only http(s) URLs from the corpus may render as links. */
function safeUrl(u) {
  return typeof u === "string" && /^https?:\/\//i.test(u) ? u : null;
}

/** Local calendar date as YYYY-MM-DD (never UTC — citations carry access dates). */
function localISODate() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
function fmtDate(iso) {
  if (!iso || !/^\d{4}-\d{2}-\d{2}/.test(iso)) return iso || "";
  const [y, m, d] = iso.slice(0, 10).split("-").map(Number);
  return `${d} ${MONTHS[m - 1]} ${y}`;
}

function fmtMoney(n) {
  if (n >= 1e9) return `$${(n / 1e9).toFixed(2)}B`;
  if (n >= 1e6) return `$${(n / 1e6).toFixed(1)}M`;
  if (n >= 1e3) return `$${Math.round(n / 1e3)}K`;
  return `$${n}`;
}

// Party identity: dot + short text label, always redundant with text (never color alone).
const PARTY_MAP = {
  "labor": ["alp", "ALP"], "liberal": ["lib", "LIB"], "nationals": ["nat", "NAT"],
  "lnp": ["nat", "LNP"], "country liberal party": ["nat", "CLP"],
  "greens": ["grn", "GRN"], "one nation": ["onp", "ONP"], "independent": ["ind", "IND"],
  "centre alliance": ["oth", "CA"], "katter's australian party": ["oth", "KAP"],
  "united australia party": ["oth", "UAP"], "australian democrats": ["oth", "AD"],
  "family first": ["oth", "FF"], "dlp": ["oth", "DLP"], "jln": ["oth", "JLN"],
};
function partyChipHTML(party) {
  if (!party) return "";
  const hit = PARTY_MAP[String(party).toLowerCase()];
  const cls = hit ? hit[0] : "oth";
  const label = hit ? hit[1] : String(party).slice(0, 12);
  return `<span class="party party-${cls}"><i aria-hidden="true"></i>${esc(label)}</span>`;
}

const STATE_NAMES = { federal: "Federal", nsw: "NSW", vic: "VIC", sa: "SA", qld: "QLD" };

function metaHTML(item) {
  const bits = [];
  if (item.party) bits.push(partyChipHTML(item.party));
  if (item.speaker) bits.push(esc(item.speaker));
  if (item.state) bits.push(esc(STATE_NAMES[item.state] || item.state));
  if (item.date) bits.push(esc(fmtDate(item.date)));
  return bits.join(" · ");
}

async function api(path, options) {
  const res = await fetch(path, options);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
  return data;
}

function setStatus(el, message, isError = false) {
  el.textContent = message || "";
  el.classList.toggle("error", isError);
}

function download(filename, mime, text) {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([text], { type: mime }));
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}

async function copyText(text, btn, doneLabel) {
  try {
    await navigator.clipboard.writeText(text);
    if (btn) {
      const old = btn.textContent;
      btn.textContent = doneLabel || "Copied";
      setTimeout(() => (btn.textContent = old), 1600);
    }
  } catch {
    window.prompt("Copy this link:", text);
  }
}

function corpusVersion() {
  return corpusManifest?.version || "unversioned";
}

// --- citation / export formats ---------------------------------------------

function splitName(full) {
  const parts = String(full || "").trim().split(/\s+/);
  if (parts.length < 2) return { family: full || "", given: "" };
  return { family: parts[parts.length - 1], given: parts.slice(0, -1).join(" ") };
}

// Canonical origin for citation permalinks and copied links. Deliberate for
// BibTeX/RIS (footnotes must survive a staging deploy), single-sourced here.
const SITE_ORIGIN = "https://opax.com.au";

function siteUrl(hash) {
  return `${SITE_ORIGIN}/${hash}`;
}

function askHash(q, kind) {
  const scope = kind && kind !== "speech" ? `&kind=${encodeURIComponent(kind)}` : "";
  return `#/ask?q=${encodeURIComponent(q)}${scope}`;
}

function askKind() {
  return $("ask-wide")?.checked ? "all" : "speech";
}

function opaxUrl(slug) {
  return siteUrl(`#/doc/${slug}`);
}

function bibtexFor(s) {
  const { family, given } = splitName(s.speaker);
  const year = (s.date || "").slice(0, 4);
  const month = Number((s.date || "").slice(5, 7)) || "";
  const fields = [
    s.speaker ? `  author = {${family}, ${given}}` : null,
    `  title = {${(s.title || s.slug).replace(/[{}]/g, "")}}`,
    year ? `  year = {${year}}` : null,
    month ? `  month = {${month}}` : null,
    `  howpublished = {Parliamentary record, via OPAX corpus v${corpusVersion()}}`,
    `  url = {${opaxUrl(s.slug)}}`,
    `  urldate = {${localISODate()}}`,
    (s.sourceUrl ?? s.url) ? `  note = {Official record: ${s.sourceUrl ?? s.url}}` : null,
  ].filter(Boolean);
  return `@misc{opax-${s.slug},\n${fields.join(",\n")}\n}`;
}

function risFor(s) {
  const { family, given } = splitName(s.speaker);
  const lines = ["TY  - GOVDOC"];
  if (s.speaker) lines.push(`AU  - ${family}, ${given}`);
  lines.push(`TI  - ${s.title || s.slug}`);
  if (s.date) lines.push(`PY  - ${s.date.slice(0, 4)}`, `DA  - ${s.date.slice(0, 10).replace(/-/g, "/")}`);
  lines.push(`UR  - ${opaxUrl(s.slug)}`);
  const official = s.sourceUrl ?? s.url;
  lines.push(`N1  - Via OPAX corpus v${corpusVersion()}${official ? `; official record: ${official}` : ""}`);
  lines.push("ER  - ");
  return lines.join("\n");
}

function csvCell(v) {
  let s = String(v ?? "");
  // Neutralise spreadsheet formula injection from corpus-derived text.
  if (/^[=+\-@]/.test(s)) s = `'${s}`;
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function exportHeader(context) {
  const now = new Date().toISOString();
  return [
    `# OPAX export — ${now}`,
    `# corpus version: ${corpusVersion()}`,
    ...context,
    `# Searches are reproducible given query, filters and corpus version.`,
    `# Generated answers are not reproducible; cite documents, not answer text.`,
  ].join("\n");
}

function sourcesCSV(rows, context) {
  const head = "slug,kind,title,speaker,party,state,date,score,snippet,opax_url,source_url";
  const body = rows.map((r) =>
    [r.slug, r.kind || (r.slug || "").split("-")[0], r.title, r.speaker, r.party, r.state, r.date,
      r.score ?? "", (r.snippet || "").slice(0, 300), opaxUrl(r.slug), r.url || ""].map(csvCell).join(",")
  );
  return `${exportHeader(context)}\n${head}\n${body.join("\n")}\n`;
}

function offerExport(rows, context, baseName) {
  if (!rows.length) return;
  const choice = (window.prompt(
    "Export format — type csv, bibtex or ris:", "csv") || "").trim().toLowerCase();
  if (choice === "csv") {
    download(`${baseName}.csv`, "text/csv;charset=utf-8", sourcesCSV(rows, context));
  } else if (choice === "bibtex" || choice === "bib") {
    const txt = `% ${exportHeader(context).replace(/\n/g, "\n% ")}\n\n` +
      rows.map(bibtexFor).join("\n\n") + "\n";
    download(`${baseName}.bib`, "application/x-bibtex;charset=utf-8", txt);
  } else if (choice === "ris") {
    const txt = rows.map(risFor).join("\n") + "\n";
    download(`${baseName}.ris`, "application/x-research-info-systems;charset=utf-8", txt);
  }
}

// --- panels & routing -------------------------------------------------------

function showPanel(name) {
  for (const t of document.querySelectorAll(".tab")) {
    const active = t.dataset.panel === name;
    t.classList.toggle("active", active);
    if (active) t.setAttribute("aria-current", "true");
    else t.removeAttribute("aria-current");
  }
  for (const p of PANELS) $(`panel-${p}`).hidden = p !== name;
  document.querySelector("main").classList.toggle("compact", name !== "ask");
}

const TITLES = {
  ask: "OPAX — ask what Australian politicians actually said",
  search: "Search the record — OPAX",
  money: "Money map — OPAX",
  reports: "Standing reports — OPAX",
  doc: "From the record — OPAX",
  about: "About — OPAX",
  methods: "Methods — OPAX",
};

// --- money map (lazy-loaded 3D bundle) --------------------------------------

let moneyMapHandle = null;
let moneyMapLoading = false;

async function mountMoney() {
  if (moneyMapHandle || moneyMapLoading) return;
  moneyMapLoading = true;
  const root = $("money-map-root");
  root.textContent = "Loading the map…";
  try {
    const { mountMoneyMap } = await import("/money-map.js");
    root.textContent = "";
    moneyMapHandle = await mountMoneyMap(root, "/graph/money.json", {
      askUrl: (industry) =>
        askHash(`What has parliament said about ${industry.replace(/_/g, " ")}?`),
    });
  } catch (err) {
    root.textContent = "";
    const p = document.createElement("p");
    p.className = "status error";
    p.textContent = `The map could not load (${err.message || err}). `;
    const a = document.createElement("a");
    a.href = "/map";
    a.textContent = "Try the full-screen map";
    p.appendChild(a);
    root.appendChild(p);
  } finally {
    moneyMapLoading = false;
  }
}

let firstRoute = true;

function rawFragment() {
  // location.hash is percent-DECODED in Firefox; parse from href so encoded
  // & / = / % inside queries survive reload and back/forward everywhere.
  return location.href.split("#")[1] || "";
}

function parseHash() {
  const h = rawFragment().replace(/^\/?/, "");
  const [pathPart, queryPart] = h.split("?");
  const segs = pathPart.split("/").filter(Boolean);
  const params = new URLSearchParams(queryPart || "");
  return { segs, params };
}

function route() {
  const frag = rawFragment();
  if (frag && !frag.startsWith("/")) return; // plain #fragment — native anchor, not a route
  const { segs, params } = parseHash();
  const view = segs[0] || "ask";
  const manageFocus = !firstRoute;
  firstRoute = false;

  if (view === "doc" && segs[1]) {
    showPanel("doc");
    document.title = TITLES.doc;
    openDocPage(segs[1], manageFocus);
  } else if (view === "search") {
    showPanel("search");
    document.title = TITLES.search;
    applySearchParams(params);
  } else if (view === "reports") {
    showPanel("reports");
    document.title = TITLES.reports;
    if (segs[1]) openReport(segs[1], segs[3] ? Number(segs[3]) : null, manageFocus);
    else loadReportsList(manageFocus);
  } else if (view === "money") {
    showPanel("money");
    document.title = TITLES.money;
    mountMoney();
  } else if (view === "about") {
    showPanel("about");
    document.title = TITLES.about;
  } else if (view === "methods") {
    showPanel("methods");
    document.title = TITLES.methods;
  } else {
    showPanel("ask");
    document.title = TITLES.ask;
    const q = params.get("q");
    if (view === "ask" && q && q !== lastAsk.question) {
      $("ask-input").value = q;
      if ($("ask-wide")) $("ask-wide").checked = params.get("kind") === "all";
      runAsk(q);
    }
  }
  // A view change can hide the element that held focus (e.g. the doc page's
  // Back button); catch the drop so keyboard users keep a place in the page.
  if (manageFocus && document.activeElement === document.body) {
    document.querySelector("main").focus();
  }
}

document.querySelector('a[href="#main"]')?.addEventListener("click", (e) => {
  e.preventDefault();
  document.querySelector("main").focus();
});

for (const tab of document.querySelectorAll(".tab")) {
  tab.addEventListener("click", () => {
    location.hash = tab.dataset.panel === "ask" ? "#/" : `#/${tab.dataset.panel}`;
  });
}
window.addEventListener("hashchange", route);

// --- ask --------------------------------------------------------------------

let askAbort = null;
let askTimer = null;

// NOTE: answers may contain [n] markers, but the platform does not document
// how they map onto retrieval results — wiring them to our renumbered cited
// list risked visibly attributing a claim to the wrong speech. Until the
// mapping is verified against the platform, markers render as plain text and
// the sources list stands on its own.

function sourceItem(s, num) {
  const li = document.createElement("li");
  li.className = "record-rule";
  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = "link source-title";
  btn.textContent = s.title || s.slug;
  btn.addEventListener("click", () => { location.hash = `#/doc/${s.slug}`; });
  if (num) {
    const numEl = document.createElement("span");
    numEl.className = "source-num";
    numEl.textContent = `${num}.`;
    li.appendChild(numEl);
  }
  li.appendChild(btn);
  const meta = metaHTML(s);
  if (meta) {
    const span = document.createElement("span");
    span.className = "source-meta";
    span.innerHTML = meta;
    li.appendChild(span);
  }
  return li;
}

async function runAsk(question) {
  if (askAbort) askAbort.abort();
  const myAbort = new AbortController();
  askAbort = myAbort;
  const btn = $("ask-submit");
  btn.disabled = true;
  $("ask-result").hidden = true;
  const started = Date.now();
  setStatus($("ask-status"), "Checking the record — this can take up to a minute.");
  clearInterval(askTimer);
  askTimer = setInterval(() => {
    const s = Math.round((Date.now() - started) / 1000);
    if (s >= 10) $("ask-status").textContent =
      `Checking the record — ${s}s. This can take up to a minute.`;
  }, 5000);
  try {
    const data = await api("/api/ask", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ question, kind: askKind() }),
      signal: myAbort.signal,
    });
    if (askAbort !== myAbort) return; // superseded by a newer question
    const sources = data.sources || [];
    // The Worker flags cited sources (it owns the platform's citation-key
    // format); fall back to the raw citations map for older responses.
    const fallbackIds = new Set(
      Object.keys(data.citations || {}).map((k) => k.split("/")[0]),
    );
    const isCited = (s) => s.cited ?? fallbackIds.has(s.resource);
    const cited = sources.filter(isCited);
    const retrieved = sources.filter((s) => !isCited(s));
    // Never fake the split: with no citation data, everything is "retrieved for this answer".
    const citedList = cited.length ? cited : sources;
    const alsoList = cited.length ? retrieved : [];
    lastAsk = { question, sources };

    setStatus($("ask-status"), `Answer ready — ${sources.length} sources.`);
    $("ask-result").hidden = false;
    $("ask-answer").textContent = data.answer || "(no answer)";
    $("ask-stamp").textContent =
      `Generated ${fmtDate(localISODate())} · corpus v${corpusVersion()}`;
    $("ask-cited-list").replaceChildren(...citedList.map((s, i) => sourceItem(s, i + 1)));
    $("ask-retrieved").hidden = !alsoList.length;
    $("ask-retrieved-list").replaceChildren(...alsoList.map((s) => sourceItem(s, null)));
    $("ask-sources").hidden = !sources.length;
    $("ask-answer").focus();
  } catch (err) {
    if (askAbort !== myAbort) return; // a newer request owns the UI now
    if (err.name === "AbortError") setStatus($("ask-status"), "Cancelled.");
    else setStatus($("ask-status"),
      `${err.message || err} — the record is still there; try again.`, true);
  } finally {
    if (askAbort === myAbort) {
      clearInterval(askTimer);
      btn.disabled = false;
    }
  }
}

$("ask-form").addEventListener("submit", (e) => {
  e.preventDefault();
  const q = $("ask-input").value.trim();
  if (!q) return;
  history.replaceState(null, "", askHash(q, askKind()));
  runAsk(q);
});

$("ask-copylink").addEventListener("click", (e) => {
  const q = lastAsk.question || $("ask-input").value.trim();
  if (!q) return;
  copyText(siteUrl(askHash(q, askKind())), e.target,
    "Copied — opening it re-asks the question; wording may vary");
});

$("ask-export").addEventListener("click", () => {
  offerExport(lastAsk.sources,
    [`# question: ${lastAsk.question}`, `# note: sources retrieved for a generated answer`],
    "opax-ask-sources");
});

function renderChips() {
  const row = $("ask-chips");
  if (!suggestions.length) return;
  const picks = [...suggestions].sort(() => Math.random() - 0.5).slice(0, 3);
  row.hidden = false;
  for (const q of picks) {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "chip";
    b.textContent = q;
    b.addEventListener("click", () => {
      $("ask-input").value = q;
      history.replaceState(null, "", askHash(q));
      runAsk(q);
    });
    row.appendChild(b);
  }
}

// --- corpus meter -----------------------------------------------------------

function renderCorpusMeter() {
  if (!liveStats || !corpusManifest) return;
  const indexed = liveStats.resources ?? 0;
  // NOTE: /api/stats counts every KB resource. corpus.json's expected_resources
  // covers speeches+news only — it MUST be raised when the legal push is
  // approved, or this meter will hide while speeches are still incomplete.
  const expected = corpusManifest.expected_resources || 0;
  if (!expected) return;
  const meter = $("corpus-meter");
  if (indexed >= expected * 0.98) { meter.hidden = true; return; }
  meter.hidden = false;
  $("corpus-meter-text").textContent =
    `${indexed.toLocaleString()} of ${expected.toLocaleString()} collected documents indexed — more added daily. Answers may be incomplete while indexing runs.`;
  const pct = Math.min(Math.max(Math.round((indexed / expected) * 100), 1), 100);
  const bar = $("corpus-meter-bar");
  bar.setAttribute("aria-valuenow", String(pct));
  bar.querySelector("i").style.width = `${pct}%`;
}

// --- search / workbench -----------------------------------------------------

function currentFilters() {
  return {
    speaker: $("f-speaker").value.trim(),
    party: $("f-party").value,
    state: $("f-state").value,
    from: $("f-from").value.trim(),
    to: $("f-to").value.trim(),
    kind: $("search-kind").value,
    mode: $("search-mode").value,
  };
}

function searchHash(q, f) {
  const p = new URLSearchParams();
  if (q) p.set("q", q);
  for (const k of ["speaker", "party", "state", "from", "to"]) if (f[k]) p.set(k, f[k]);
  if (f.kind && f.kind !== "speech") p.set("kind", f.kind);
  if (f.mode && f.mode !== "hybrid") p.set("mode", f.mode);
  return `#/search?${p.toString()}`;
}

let searchApplied = ""; // guards re-running the same URL state

function applySearchParams(params) {
  const key = params.toString();
  if (key === searchApplied) return;
  searchApplied = key;
  if (params.has("q") || params.has("speaker")) {
    $("search-input").value = params.get("q") || "";
    $("f-speaker").value = params.get("speaker") || "";
    $("f-party").value = params.get("party") || "";
    $("f-state").value = params.get("state") || "";
    $("f-from").value = params.get("from") || "";
    $("f-to").value = params.get("to") || "";
    $("search-kind").value = params.get("kind") || "speech";
    $("search-mode").value = params.get("mode") || "hybrid";
    runSearch();
  }
}

function activeFilterSummary(f) {
  const bits = [];
  if (f.speaker) bits.push(`speaker ${f.speaker}`);
  if (f.party) bits.push(f.party);
  if (f.state) bits.push(STATE_NAMES[f.state] || f.state);
  if (f.from || f.to) bits.push(`${f.from || "…"}–${f.to || "…"}`);
  return bits.join(", ");
}

function renderResults(results) {
  const sort = $("search-sort").value;
  const rows = [...results];
  if (sort === "newest") rows.sort((a, b) => String(b.date || "").localeCompare(String(a.date || "")));
  $("search-results").replaceChildren(
    ...rows.map((r) => {
      const li = document.createElement("li");
      const pct = Math.round((r.score || 0) * 100);
      li.innerHTML = `
        <div>
          <button type="button" class="link result-title">${esc(r.title)}</button><span
            class="scorebar" aria-hidden="true"><i style="width:${pct}%"></i></span><span
            class="visually-hidden">Relevance ${pct}%.</span>
        </div>
        <span class="result-meta">${metaHTML(r)}</span>
        <p class="snippet">${esc(r.snippet)}</p>`;
      li.querySelector("button").addEventListener("click", () => {
        location.hash = `#/doc/${r.slug}`;
      });
      return li;
    }),
  );
}

let searchSeq = 0;

async function runSearch() {
  const q = $("search-input").value.trim();
  const f = currentFilters();
  if (!q && !f.speaker) return;
  const mySeq = ++searchSeq;
  const btn = $("search-form").querySelector('button[type="submit"]');
  btn.disabled = true;
  setStatus($("search-status"), "Searching the record…");
  $("results-bar").hidden = true;
  $("search-results").replaceChildren();
  try {
    const params = new URLSearchParams({ q: q || f.speaker, kind: f.kind, mode: f.mode });
    for (const k of ["speaker", "party", "state", "from", "to"]) if (f[k]) params.set(k, f[k]);
    const data = await api(`/api/search?${params}`);
    if (mySeq !== searchSeq) return; // a newer search owns the results now
    lastSearch = { query: q, filters: f, results: data.results || [] };
    if (!data.count) {
      const hints = [];
      if (f.speaker) hints.push(`No speeches found for “${f.speaker}”. Names appear as in Hansard — “Anthony Albanese”, not “the PM”.`);
      if (f.mode === "keyword") hints.push("Try hybrid mode — it also matches by meaning.");
      const active = activeFilterSummary(f);
      if (active) hints.push(`Filters active: ${active}. Try removing one.`);
      setStatus($("search-status"), hints.join(" ") || "No results from the record.");
    } else {
      setStatus($("search-status"), "");
      const active = activeFilterSummary(f);
      $("results-count").textContent =
        `${data.count} results from the record${active ? ` — ${active}` : ""} (top ${data.count} matches)`;
      $("results-bar").hidden = false;
      renderResults(lastSearch.results);
    }
  } catch (err) {
    if (mySeq !== searchSeq) return;
    setStatus($("search-status"), String(err.message || err), true);
  } finally {
    if (mySeq === searchSeq) btn.disabled = false;
  }
}

$("search-form").addEventListener("submit", (e) => {
  e.preventDefault();
  const q = $("search-input").value.trim();
  const f = currentFilters();
  if (!q && !f.speaker) return;
  searchApplied = searchHash(q, f).replace(/^#\/search\?/, "");
  history.replaceState(null, "", searchHash(q, f));
  runSearch();
});

$("search-sort").addEventListener("change", () => renderResults(lastSearch.results));

$("guided-go").addEventListener("click", () => {
  const speaker = $("guided-speaker").value.trim();
  const topic = $("guided-topic").value.trim();
  if (!speaker && !topic) return;
  $("f-speaker").value = speaker;
  $("search-input").value = topic;
  $("search-form").requestSubmit();
});

$("search-copylink").addEventListener("click", (e) => {
  copyText(siteUrl(searchHash(lastSearch.query, lastSearch.filters)), e.target);
});

$("search-export").addEventListener("click", () => {
  const f = lastSearch.filters;
  offerExport(lastSearch.results, [
    `# query: ${lastSearch.query}`,
    `# filters: ${activeFilterSummary(f) || "none"} · corpus: ${f.kind || "speech"} · mode: ${f.mode || "hybrid"}`,
    `# results are the top matches only (top_k cap)`,
  ], "opax-search");
});

// --- document page ----------------------------------------------------------

function citePanelHTML(doc) {
  const d = doc.metadata?.date || "";
  const year = d.slice(0, 4);
  const { family, given } = splitName(doc.speaker);
  const state = doc.labels?.state;
  const chamberBit = state && state !== "federal"
    ? `Parliament of ${STATE_NAMES[state] || state}` : "Commonwealth, Parliamentary Debates";
  const url = opaxUrl(doc.slug);
  const aglc = `${chamberBit}, ${fmtDate(d)}${doc.speaker ? ` (${doc.speaker})` : ""} <${url}>.`;
  const apa = `${family}${given ? `, ${given[0]}.` : ""} (${year || "n.d."}). ${doc.title}. Parliamentary record, Australia. OPAX. ${url}`;
  const src = { slug: doc.slug, title: doc.title, speaker: doc.speaker, date: d, sourceUrl: doc.url };
  return `
    <h3>AGLC-style</h3><pre>${esc(aglc)}</pre>
    <p class="fineprint">For AGLC-compliant page references, use the official record via the source link — OPAX never invents Hansard page numbers.</p>
    <h3>APA 7</h3><pre>${esc(apa)}</pre>
    <h3>BibTeX</h3><pre>${esc(bibtexFor(src))}</pre>
    <h3>RIS</h3><pre>${esc(risFor(src))}</pre>`;
}

async function openDocPage(slug, manageFocus) {
  if (currentDocSlug === slug && currentDoc) return;
  currentDocSlug = slug;
  currentDoc = null;
  $("doc-title").textContent = "Loading…";
  $("doc-meta").textContent = "";
  $("doc-text").textContent = "";
  $("doc-caveat").hidden = true;
  $("doc-cite-panel").hidden = true;
  $("doc-actions").hidden = true;
  setStatus($("doc-status"), "Fetching the document…");
  try {
    const doc = await api(`/api/resource/${encodeURIComponent(slug)}`);
    if (currentDocSlug !== slug) return; // user navigated away while fetching
    currentDoc = doc;
    setStatus($("doc-status"), "");
    $("doc-title").textContent = doc.title;
    const metaBits = [metaHTML({
      party: doc.labels?.party, speaker: doc.speaker,
      state: doc.labels?.state, date: doc.metadata?.date,
    })];
    const origin = safeUrl(doc.url);
    if (origin) metaBits.push(`<a href="${esc(origin)}" rel="noopener" target="_blank">View original ↗</a>`);
    $("doc-meta").innerHTML = metaBits.filter(Boolean).join(" · ");
    $("doc-text").textContent = doc.text || "(no text)";
    $("doc-actions").hidden = false;
    $("doc-cite-panel").innerHTML = citePanelHTML(doc);
    if (doc.labels?.source === "openaustralia") {
      $("doc-caveat").hidden = false;
      $("doc-caveat").textContent =
        "This text is reproduced from a third-party Hansard transcription and may contain concatenation artefacts (“toSenator”); verify wording against the official record before quoting.";
    }
    if (manageFocus) $("doc-title").focus();
  } catch (err) {
    if (currentDocSlug !== slug) return;
    setStatus($("doc-status"),
      err.message === "not found"
        ? "No document with this identifier — it may not be indexed yet."
        : String(err.message || err), true);
    $("doc-title").textContent = "Document unavailable";
  }
}

$("doc-back").addEventListener("click", () => {
  if (history.length > 1) history.back();
  else location.hash = "#/";
});
$("doc-cite").addEventListener("click", () => {
  const panel = $("doc-cite-panel");
  panel.hidden = !panel.hidden;
});
$("doc-copylink").addEventListener("click", (e) => {
  if (currentDocSlug) copyText(opaxUrl(currentDocSlug), e.target);
});
$("doc-similar").addEventListener("click", () => {
  if (!currentDoc) return;
  const topic = (currentDoc.title || "").split("—")[1]?.trim() || currentDoc.title;
  location.hash = searchHash(topic, {});
});
$("doc-more").addEventListener("click", () => {
  if (!currentDoc?.speaker) return;
  location.hash = searchHash("", { speaker: currentDoc.speaker });
});

// --- reports ----------------------------------------------------------------

async function loadReportsList(manageFocus) {
  const list = $("reports-list");
  currentReportSlug = null;
  $("report-view").hidden = true;
  list.hidden = false;
  if (!reportsIndex) {
    try {
      reportsIndex = (await api("/reports/index.json")).reports || [];
    } catch {
      setStatus($("reports-status"),
        "No reports published yet — they are generated from the corpus and will appear here.");
      return;
    }
  }
  setStatus($("reports-status"), "");
  list.replaceChildren(
    ...reportsIndex.map((r) => {
      const card = document.createElement("button");
      card.className = "report-card";
      card.innerHTML = `<span class="card-kicker">Standing report</span>
        <span class="card-title">${esc(r.title)}</span>
        <span class="card-blurb">${esc(r.blurb)}</span>
        <span class="card-meta">Updated ${esc(fmtDate(r.updated || ""))}</span>`;
      card.addEventListener("click", () => { location.hash = `#/reports/${r.slug}`; });
      return card;
    }),
  );
  if (manageFocus) list.querySelector(".report-card")?.focus();
}

// Charts: single-hue bronze marks (CSS-owned); sr-only data table carries the values.
function columnChart(pairs, { fmt = String, heading, note }) {
  const W = 640, H = 150, pad = 4, base = H - 18;
  const max = Math.max(...pairs.map(([, v]) => v), 1);
  const bw = Math.max((W - pad * 2) / pairs.length - 2, 2);
  const peakIdx = pairs.findIndex(([, v]) => v === max);
  let bars = "";
  pairs.forEach(([k, v], i) => {
    const h = v > 0 ? Math.max((v / max) * (base - 24), 1) : 0;
    const x = pad + i * ((W - pad * 2) / pairs.length);
    const y = base - h;
    const r = Math.min(2, bw / 2, h);
    if (h > 0) {
      bars += `<path class="chart-bar" d="M${x},${base} V${y + r} Q${x},${y} ${x + r},${y} H${x + bw - r} Q${x + bw},${y} ${x + bw},${y + r} V${base} Z"><title>${esc(String(k))}: ${esc(fmt(v))}</title></path>`;
    }
    if (i === peakIdx) {
      bars += `<text x="${Math.min(Math.max(x + bw / 2, 24), W - 24)}" y="${y - 5}" class="chart-peak" text-anchor="middle">${esc(fmt(v))}</text>`;
    }
  });
  const first = pairs[0]?.[0] ?? "", last = pairs[pairs.length - 1]?.[0] ?? "";
  const srTable = `<table class="visually-hidden"><caption>${esc(heading)}</caption>
    <thead><tr><th scope="col">Year</th><th scope="col">Value</th></tr></thead>
    <tbody>${pairs.map(([k, v]) => `<tr><td>${esc(String(k))}</td><td>${esc(fmt(v))}</td></tr>`).join("")}</tbody></table>`;
  return `<figure class="chart">
    <figcaption>${esc(heading)}</figcaption>
    <svg viewBox="0 0 ${W} ${H}" aria-hidden="true">
      <line x1="${pad}" y1="${base}" x2="${W - pad}" y2="${base}" class="chart-axis"/>
      ${bars}
      <text x="${pad}" y="${H - 4}" class="chart-tick">${esc(String(first))}</text>
      <text x="${W - pad}" y="${H - 4}" class="chart-tick" text-anchor="end">${esc(String(last))}</text>
    </svg>
    ${srTable}
    ${note ? `<p class="chart-note">${esc(note)}</p>` : ""}
  </figure>`;
}

function barList(rows, { fmt = String, heading }) {
  const max = Math.max(...rows.map(([, v]) => v), 1);
  const items = rows.map(([name, v]) => `
    <div class="barrow">
      <span class="barrow-name" title="${esc(name)}">${esc(name)}</span>
      <span class="barrow-track" aria-hidden="true"><i style="width:${Math.max((v / max) * 100, 1)}%"></i></span>
      <span class="barrow-value">${esc(fmt(v))}</span>
    </div>`).join("");
  return `<figure class="chart"><figcaption>${esc(heading)}</figcaption>${items}</figure>`;
}

const fmtIndustries = (list) => list.map((i) => i.replace(/_/g, " ")).join(", ");

const AEC_NOTE =
  "AEC disclosure data: donations under the disclosure threshold are not reported " +
  "and cannot appear here — totals are a floor, not a ceiling.";

function tile(value, label) {
  return `<div class="tile"><b>${esc(value)}</b><span>${esc(label)}</span></div>`;
}

/**
 * Normalise a series key to a calendar year. The two report series speak
 * different vocabularies: timeline uses "1998", donations use AEC financial
 * years ("1998-99", plotted at their END year) plus event labels
 * ("2004 Federal Election" → 2004). Returns null for keys with no year.
 */
function yearOf(key) {
  const s = String(key);
  const m = /^(\d{4})/.exec(s);
  if (!m) return null;
  const y = Number(m[1]);
  return /^\d{4}-\d{2}\b/.test(s) ? y + 1 : y;
}

/** Re-key a [label,value] series onto calendar years, summing collisions. */
function toYearSeries(series) {
  const m = new Map();
  for (const [k, v] of series) {
    const y = yearOf(k);
    if (y === null) continue;
    m.set(y, (m.get(y) ?? 0) + v);
  }
  return m;
}

function renderStats(container, stats) {
  if (!stats) { container.innerHTML = ""; return; }
  const don = stats.donations;
  const industries = fmtIndustries(don?.industries || []);
  let htmlOut = `<div class="tiles">
    ${tile((stats.speech_count ?? 0).toLocaleString(), "speeches on the record")}
    ${tile((stats.unique_speakers ?? 0).toLocaleString(), "parliamentarians spoke")}
    ${don ? tile(fmtMoney(don.total ?? 0), `donations — ${industries}`) : ""}
  </div>`;
  const speechYears = toYearSeries(stats.timeline ?? []);
  const donYears = toYearSeries(don?.by_year ?? []);
  const paired = speechYears.size > 1 && donYears.size > 1;
  // Money & Words: when both series exist, plot them on one shared year axis.
  const domain = paired
    ? (() => {
        const all = [...new Set([...speechYears.keys(), ...donYears.keys()])].sort();
        const out = [];
        for (let y = all[0]; y <= all[all.length - 1]; y++) out.push(y);
        return out;
      })()
    : null;
  const seriesFor = (m) => (domain ?? [...m.keys()].sort()).map((y) => [y, m.get(y) ?? 0]);
  if (speechYears.size > 1) {
    htmlOut += columnChart(seriesFor(speechYears),
      { heading: "Speeches per year", fmt: (v) => v.toLocaleString() });
  }
  if (donYears.size > 1) {
    htmlOut += columnChart(seriesFor(donYears), {
      heading: `Donations per financial year, plotted at end year (${industries})`,
      fmt: fmtMoney,
      note: (paired
        ? "Shown together for comparison. OPAX does not claim one series causes the other. "
        : "") + AEC_NOTE,
    });
  }
  if (don?.top_donors?.length) htmlOut += barList(don.top_donors, { heading: "Largest donors", fmt: fmtMoney });
  if (stats.top_speakers?.length) htmlOut += barList(stats.top_speakers, { heading: "Most speeches on this topic", fmt: (v) => v.toLocaleString() });
  container.innerHTML = htmlOut;
}

let currentReportSlug = null;

async function openReport(slug, sectionNum, manageFocus) {
  // Already rendered (e.g. Back from a cited document): just reveal it —
  // the DOM is intact under `hidden`, so scroll position and charts survive.
  if (currentReportSlug === slug) {
    $("reports-list").hidden = true;
    $("report-view").hidden = false;
    if (sectionNum) $(`report-s-${sectionNum}`)?.scrollIntoView();
    else if (manageFocus) $("report-title").focus();
    return;
  }
  let report;
  try {
    report = await api(`/reports/${encodeURIComponent(slug)}.json`);
  } catch {
    setStatus($("reports-status"), "That report could not be loaded — it may not exist yet.", true);
    loadReportsList(false);
    return;
  }
  // Stale-resolution guard: only render if the hash still points at this report.
  if (!location.hash.startsWith(`#/reports/${slug}`)) return;
  currentReportSlug = slug;
  setStatus($("reports-status"), "");
  $("reports-list").hidden = true;
  const view = $("report-view");
  view.hidden = false;
  $("report-title").textContent = report.title;
  $("report-blurb").textContent = report.blurb;
  $("report-meta").textContent =
    `Generated ${fmtDate(report.generated_at || "")} · every claim cited to the record · corpus v${corpusVersion()}`;
  renderStats($("report-stats"), report.stats);
  $("report-download").innerHTML =
    `Download the data behind this report: <a href="/reports/${esc(slug)}.json">${esc(slug)}.json</a>`;

  const sectionsEl = $("report-sections");
  if (!report.sections?.length) {
    sectionsEl.innerHTML =
      `<p class="status">The cited analysis for this investigation is generated from the full
      speech corpus, which is currently indexing — it will appear here automatically.</p>`;
  } else {
    sectionsEl.replaceChildren(
      ...report.sections.map((s, i) => {
        const sec = document.createElement("section");
        sec.className = "report-section";
        sec.id = `report-s-${i + 1}`;
        const h = document.createElement("h3");
        h.textContent = s.question;
        const body = document.createElement("div");
        body.className = "answer record-rule";
        body.textContent = s.answer;
        sec.append(h, body);
        if (s.sources?.length) {
          const label = document.createElement("p");
          label.className = "kicker";
          label.textContent = "Sources";
          const ol = document.createElement("ol");
          ol.className = "source-list";
          ol.replaceChildren(...s.sources.map((src, j) => sourceItem(src, j + 1)));
          sec.append(label, ol);
        }
        const tools = document.createElement("p");
        tools.className = "section-tools action-row";
        const linkBtn = document.createElement("button");
        linkBtn.type = "button";
        linkBtn.className = "link";
        linkBtn.textContent = "Copy link to this section";
        linkBtn.addEventListener("click", (e) =>
          copyText(siteUrl(`#/reports/${slug}/s/${i + 1}`), e.target));
        const askBtn = document.createElement("button");
        askBtn.type = "button";
        askBtn.className = "link";
        askBtn.textContent = "Ask the record about this";
        askBtn.addEventListener("click", () => {
          location.hash = askHash(s.question);
        });
        tools.append(linkBtn, askBtn);
        sec.append(tools);
        return sec;
      }),
    );
  }
  if (sectionNum) {
    const target = $(`report-s-${sectionNum}`);
    if (target) {
      target.scrollIntoView();
      const h = target.querySelector("h3");
      if (h) { h.setAttribute("tabindex", "-1"); h.focus(); }
    }
  } else if (manageFocus) {
    $("report-title").focus();
  }
}

$("report-back").addEventListener("click", () => { location.hash = "#/reports"; });

// --- boot -------------------------------------------------------------------

fetch("/corpus.json").then((r) => r.json()).then((m) => {
  corpusManifest = m;
  renderCorpusMeter();
  // Hero colophon: the site's most prominent figures come from the manifest,
  // so a re-sync updates them in one place.
  const donations = (m.sources || []).find((s) => s.name.startsWith("AEC donations"));
  $("stat-colophon").innerHTML = [
    `<span><b>${(m.collected_speeches ?? 0).toLocaleString()}</b> speeches collected</span>`,
    `<span><b>5</b> parliaments</span>`,
    donations ? `<span><b>${donations.docs.toLocaleString()}</b> donations classified</span>` : "",
    donations ? `<span><b>${esc(donations.coverage)}</b> coverage</span>` : "",
  ].join("");
  // About: corpus table + Methods: known defects, from the manifest.
  const tbody = $("about-sources");
  if (tbody && m.sources) {
    tbody.innerHTML = m.sources.map((s) =>
      `<tr><td>${esc(s.name)}</td><td>${s.docs.toLocaleString()}</td><td>${esc(s.coverage)}</td></tr>`).join("");
  }
  const defects = $("methods-defects");
  if (defects && m.known_defects) {
    defects.innerHTML = m.known_defects.map((d) => `<li>${esc(d)}</li>`).join("");
  }
}).catch(() => {
  // Manifest unavailable: keep the page honest with order-of-magnitude copy.
  $("stat-colophon").innerHTML =
    "<span><b>Half a million</b> speeches collected</span><span><b>5</b> parliaments</span>";
});

fetch("/suggestions.json").then((r) => r.json()).then((s) => {
  suggestions = s.questions || [];
  renderChips();
}).catch(() => {});

api("/api/stats")
  .then((s) => {
    liveStats = s;
    $("stats").textContent =
      `${(s.resources ?? 0).toLocaleString()} documents · ` +
      `${(s.paragraphs ?? 0).toLocaleString()} passages indexed · growing daily`;
    renderCorpusMeter();
  })
  .catch(() => {
    $("stats").textContent = "corpus loading…";
  });

// Legacy entry contract: /?ask=<question> (used by standalone map pages).
{
  const legacyAsk = new URLSearchParams(location.search).get("ask");
  if (legacyAsk) {
    history.replaceState(null, "", `/${askHash(legacyAsk)}`);
  }
}

route();
