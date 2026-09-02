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

const PANELS = ["ask", "chat", "search", "money", "reports", "explore", "doc", "subject", "about", "methods", "stats"];

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
  "lnp": ["lnp", "LNP"], "country liberal party": ["nat", "CLP"],
  "greens": ["grn", "GRN"], "one nation": ["onp", "ONP"], "independent": ["ind", "IND"],
  "centre alliance": ["oth", "CA"], "katter's australian party": ["oth", "KAP"],
  "united australia party": ["oth", "UAP"], "australian democrats": ["oth", "AD"],
  "family first": ["oth", "FF"], "dlp": ["oth", "DLP"], "jln": ["oth", "JLN"],
};
function partyClass(party) {
  const hit = PARTY_MAP[String(party || "").toLowerCase()];
  return hit ? hit[0] : null;
}

function partyDotHTML(party) {
  const cls = partyClass(party);
  if (!cls) return "";
  return `<span class="party party-${cls} party-dot-only"><i aria-hidden="true"></i></span>`;
}

function partyChipHTML(party) {
  if (!party) return "";
  const hit = PARTY_MAP[String(party).toLowerCase()];
  const cls = hit ? hit[0] : "oth";
  const label = hit ? hit[1] : String(party).slice(0, 12);
  return `<span class="party party-${cls}"><i aria-hidden="true"></i>${esc(label)}</span>`;
}

const STATE_NAMES = { federal: "Federal", nsw: "NSW", vic: "VIC", sa: "SA", qld: "QLD" };
// The 21-topic enrichment taxonomy (scripts/arag_enrich.py TOPICS is
// canonical): slug → display name. Slugs are the ARAG label values.
const TOPICS = {
  "gambling": "Gambling",
  "financial-services": "Financial services",
  "mining-energy": "Mining & energy",
  "climate-environment": "Climate & environment",
  "property-construction": "Property & construction",
  "housing": "Housing",
  "health": "Health",
  "media-communications": "Media & communications",
  "hospitality-alcohol": "Hospitality & alcohol",
  "defence-security": "Defence & security",
  "agriculture": "Agriculture",
  "unions-workplace": "Unions & workplace",
  "immigration": "Immigration",
  "indigenous-affairs": "Indigenous affairs",
  "tax-budget": "Tax & budget",
  "education": "Education",
  "welfare-social": "Welfare & social services",
  "integrity-democracy": "Integrity & democracy",
  "infrastructure-transport": "Infrastructure & transport",
  "justice-law": "Justice & law",
  "foreign-affairs": "Foreign affairs",
};
// Both topic selects (ask and search popovers) are filled from the one list;
// the markup carries only the "any" default.
for (const sel of [$("a-topic"), $("f-topic")]) {
  if (!sel) continue;
  for (const [slug, name] of Object.entries(TOPICS)) {
    const opt = document.createElement("option");
    opt.value = slug;
    opt.textContent = name;
    sel.append(opt);
  }
}
// Reports and topic labels describe the same debates in two vocabularies;
// where they align, the pages cross-link (report slug ↔ enrichment topic slug).
const REPORT_TOPIC = {
  climate: "climate-environment", gambling: "gambling", housing: "housing",
  immigration: "immigration", indigenous: "indigenous-affairs", media: "media-communications",
};
const TOPIC_REPORT = Object.fromEntries(
  Object.entries(REPORT_TOPIC).map(([report, topic]) => [topic, report]));
const CHAMBER_NAMES = {
  representatives: "House of Representatives", senate: "Senate",
  assembly: "Legislative Assembly", council: "Legislative Council",
};

function metaHTML(item, { linkSpeaker = false, linkParty = false, portrait = false } = {}) {
  const bits = [];
  // The portrait slot sits outside the dot-separated run, so a speaker with
  // no photo leaves no stray separator. Filled by decorateMetaPortraits.
  const slot = portrait && item.speaker
    ? `<span class="meta-portrait" data-speaker="${esc(item.speaker)}"></span>` : "";
  if (item.party) {
    bits.push(linkParty
      ? `<a class="meta-party" href="${esc(subjectHash("party", item.party))}">${partyChipHTML(item.party)}</a>`
      : partyChipHTML(item.party));
  }
  if (item.speaker) {
    bits.push(linkSpeaker
      ? `<a href="${esc(subjectHash("person", item.speaker))}">${esc(item.speaker)}</a>`
      : esc(item.speaker));
  }
  if (item.state) bits.push(esc(STATE_NAMES[item.state] || item.state));
  if (item.date) bits.push(esc(fmtDate(item.date)));
  return slot + bits.join(" · ");
}

/** Swap .meta-portrait slots for the speaker's headshot once the map is in. */
function decorateMetaPortraits(root) {
  loadPhotoMap().then(() => {
    for (const slot of root.querySelectorAll(".meta-portrait[data-speaker]")) {
      const url = photoUrlFor(slot.dataset.speaker);
      if (url) slot.innerHTML = `<img src="${esc(url)}" alt="" width="24" height="24" loading="lazy">`;
      else slot.remove();
    }
  });
}

/** Escaped snippet with the search terms marked. Quoted phrases win; else words of 3+ chars. */
function highlightHTML(text, query) {
  const phrases = [...String(query || "").matchAll(/"([^"]{2,})"/g)].map((m) => m[1].trim());
  const terms = (phrases.length ? phrases : String(query || "").split(/[^\p{L}\p{N}']+/u).filter((w) => w.length >= 3))
    .map((t) => t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  if (!terms.length) return esc(text);
  const re = new RegExp(`(${terms.join("|")})`, "giu");
  return String(text).split(re).map((part, i) => (i % 2 ? `<mark class="hit">${esc(part)}</mark>` : esc(part))).join("");
}

async function api(path, options) {
  const res = await fetch(path, options);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
  return data;
}

/* --- streamed asks -----------------------------------------------------------
   POST /api/ask?stream=1 answers as Server-Sent Events (docs/STREAMING.md):
     event: status  {phase, words}                the model is still reading
     event: delta   {text}                        answer text to append
     event: retry   {reason}                      attempt one is withdrawn
     event: done    {answer, citations, sources}  the synchronous payload
     event: error   {error}
   askRecord() reads that stream and resolves with the done payload, so the
   code that runs after an answer is the same whichever path produced it. */

/**
 * Read one streamed ask. Resolves with the `done` payload. A thrown error
 * carries `shown: true` once answer text has reached the handlers, so the
 * caller knows a synchronous fallback would be replacing visible words.
 */
async function readAskStream(body, signal, on) {
  const res = await fetch("/api/ask?stream=1", {
    method: "POST",
    headers: { "content-type": "application/json", accept: "text/event-stream" },
    body,
    signal,
  });
  if (!(res.headers.get("content-type") || "").includes("text/event-stream")) {
    // Not a stream (an error, or something between us answered whole): the
    // body is the synchronous payload.
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
    return data;
  }
  let shown = false;
  let final = null;
  const fail = (message) => Object.assign(new Error(message), { shown });
  const dispatch = (block) => {
    let event = "message";
    const data = [];
    for (const line of block.split("\n")) {
      if (line.startsWith("event:")) event = line.slice(6).trim();
      else if (line.startsWith("data:")) data.push(line.slice(5).replace(/^ /, ""));
    }
    if (!data.length) return;
    let payload;
    try { payload = JSON.parse(data.join("\n")); } catch { return; }
    if (event === "delta") {
      if (typeof payload.text === "string" && payload.text) {
        shown = true;
        on.delta?.(payload.text);
      }
    } else if (event === "retry") {
      shown = false;
      on.retry?.(payload);
    } else if (event === "status") {
      on.status?.(payload);
    } else if (event === "done") {
      final = payload;
    } else if (event === "error") {
      throw fail(payload.error || "The answer stream failed.");
    }
  };
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      let at;
      while ((at = buffer.indexOf("\n\n")) >= 0) {
        const block = buffer.slice(0, at);
        buffer = buffer.slice(at + 2);
        if (block.trim()) dispatch(block);
      }
    }
    buffer += decoder.decode();
    if (buffer.trim()) dispatch(buffer);
  } catch (err) {
    if (err.name !== "AbortError" && err.shown === undefined) err.shown = shown;
    throw err;
  }
  if (!final) throw fail("The answer stream ended early.");
  return final;
}

/**
 * Ask the record. Streams when it can (the handlers fire as text lands) and
 * resolves with the final {answer, citations, sources}. If the stream fails
 * before any text has been shown, the synchronous call answers instead, with
 * its one silent retry on a blank answer (a reasoning burn). The streamed
 * path retries inside the Worker, so its payload is taken as it comes.
 */
async function askRecord(body, signal, on = {}) {
  try {
    return await readAskStream(body, signal, on);
  } catch (err) {
    if (err.name === "AbortError" || err.shown) throw err;
  }
  const once = () => api("/api/ask", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body,
    signal,
  });
  let data = await once();
  if (!(data.answer || "").trim()) data = await once();
  return data;
}

/**
 * The tail of a half-arrived answer can mislead the parser: an unclosed **
 * shows as literal asterisks, and a lone marker on the last line ("#", "*",
 * "|") is a heading, bullet or table row still on its way. Show the bold
 * text plain until its partner arrives and hold the marker-only line back.
 */
function streamSafeText(text) {
  let t = text;
  if ((t.match(/\*\*/g) || []).length % 2) {
    const at = t.lastIndexOf("**");
    t = t.slice(0, at) + t.slice(at + 2);
  }
  return t.replace(/\n[ \t]*[#*\-+>|]{1,3}[ \t]*$/, "");
}

/**
 * Progressive rendering for a streamed answer. Fragments accumulate and the
 * whole text re-parses through renderAnswer at most every 120ms, so headings,
 * lists and tables take shape as they land. Blocks that were not there at
 * the previous paint fade in (.stream-in; the stylesheet drops the motion
 * under prefers-reduced-motion). `alive` says whether this render still owns
 * the container: a superseded question must never paint late.
 */
function streamRenderer(container, alive) {
  let text = "";
  let timer = 0;
  let painted = 0; // when the last paint happened
  let blocks = 0;  // top-level blocks at the last paint
  const paint = () => {
    timer = 0;
    if (alive && !alive()) return;
    renderAnswer(container, streamSafeText(text));
    const kids = container.children;
    for (let i = blocks; i < kids.length; i++) kids[i].classList.add("stream-in");
    blocks = kids.length;
    painted = Date.now();
  };
  const stop = () => { if (timer) { clearTimeout(timer); timer = 0; } };
  return {
    push(fragment) {
      text += fragment;
      if (!timer) timer = setTimeout(paint, Math.max(0, 120 - (Date.now() - painted)));
    },
    reset() { stop(); text = ""; blocks = 0; container.replaceChildren(); },
    stop,
  };
}

function setStatus(el, message, isError = false) {
  el.textContent = message || "";
  el.classList.toggle("error", isError);
  el.classList.remove("visually-hidden");
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

function askFilters() {
  const val = (id) => $(id)?.value?.trim() || "";
  let from = val("a-from"), to = val("a-to");
  if (Number(from) > Number(to)) [from, to] = [to, from]; // sliders may cross
  // The full range means "no year filter".
  if (from === "1993" && to === "2026") { from = ""; to = ""; }
  return {
    speaker: val("a-speaker"), party: val("a-party"), state: val("a-state"),
    topic: val("a-topic"),
    from, to,
  };
}

{
  const btn = $("ask-options-btn");
  const pop = $("ask-options-pop");
  const yearsLabel = () => {
    let a = Number($("a-from").value), b = Number($("a-to").value);
    if (a > b) [a, b] = [b, a];
    $("a-years-label").textContent = `${a}–${b}`;
  };
  btn?.addEventListener("click", () => {
    pop.hidden = !pop.hidden;
    btn.setAttribute("aria-expanded", String(!pop.hidden));
  });
  document.addEventListener("pointerdown", (e) => {
    if (!pop || pop.hidden) return;
    if (!pop.contains(e.target) && !btn.contains(e.target)) {
      pop.hidden = true;
      btn.setAttribute("aria-expanded", "false");
    }
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && pop && !pop.hidden) {
      pop.hidden = true;
      btn.setAttribute("aria-expanded", "false");
      btn.focus();
    }
  });
  $("a-from")?.addEventListener("input", yearsLabel);
  $("a-to")?.addEventListener("input", yearsLabel);
}

function askFilterSummary(f) {
  const bits = [];
  if (f.speaker) bits.push(f.speaker);
  if (f.party) bits.push(f.party);
  if (f.state) bits.push(STATE_NAMES[f.state] || f.state);
  if (f.topic) bits.push(TOPICS[f.topic] || f.topic);
  if (f.from || f.to) bits.push(`${f.from || "…"}–${f.to || "…"}`);
  return bits.join(" · ");
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
    `# OPAX export: ${now}`,
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
    "Export format (type csv, bibtex or ris):", "csv") || "").trim().toLowerCase();
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
  // Methods lives under the About menu, so its trigger stays lit there; the
  // drawer has an exact Methods link of its own.
  const headerName = name === "methods" ? "about" : name;
  for (const t of document.querySelectorAll("#primary-nav [data-panel], #nav-drawer [data-panel]")) {
    const active = t.dataset.panel === (t.closest("#nav-drawer") ? name : headerName);
    t.classList.toggle("active", active);
    if (t.tagName !== "A") continue; // aria-current marks pages, not disclosure buttons
    if (active) t.setAttribute("aria-current", "page");
    else t.removeAttribute("aria-current");
  }
  for (const p of PANELS) $(`panel-${p}`).hidden = p !== name;
  document.querySelector("main").classList.toggle("compact", name !== "ask");
  const statsLink = document.querySelector(".masthead-link");
  if (statsLink) {
    if (name === "stats") statsLink.setAttribute("aria-current", "true");
    else statsLink.removeAttribute("aria-current");
  }
}

const TITLES = {
  ask: "OPAX: ask what Australian politicians actually said",
  chat: "Keep asking · OPAX",
  search: "Search the record · OPAX",
  money: "Money map · OPAX",
  reports: "Reports · OPAX",
  doc: "From the record · OPAX",
  subject: "OPAX encyclopedia",
  explore: "Explore · OPAX",
  about: "About · OPAX",
  methods: "Methods · OPAX",
  stats: "Corpus stats · OPAX",
};

// --- money map (lazy-loaded 3D bundle) --------------------------------------
// One export per jurisdiction, all in the same node/edge shape, loaded one at
// a time: AEC returns of federally registered parties already include their
// state branches' receipts, so a Queensland gift to the LNP can sit in both
// the federal and the Queensland file. Jurisdiction is a filter, never a sum.
// Western Australia is in parli.db but WAEC asserts Crown copyright with no
// open licence, so it is not shipped (docs/DATA-MONEY.md).

const STATE_NOT_SUMMED =
  "State and federal returns are not summed: AEC returns already include state branch receipts.";

const MONEY_JURISDICTIONS = {
  federal: { label: "Federal", file: "/graph/money.json" },
  qld: { label: "Queensland", file: "/graph/money.qld.json" },
  vic: { label: "Victoria", file: "/graph/money.vic.json" },
};

const moneyFiles = {}; // jurisdiction -> promise of the parsed export (federal shares loadMoneyData)
function loadMoneyFile(jur) {
  const cfg = MONEY_JURISDICTIONS[jur];
  if (!cfg) return Promise.resolve(null);
  if (jur === "federal") return loadMoneyData();
  moneyFiles[jur] ??= fetch(cfg.file)
    .then((r) => (r.ok ? r.json() : null)).catch(() => null);
  return moneyFiles[jur];
}

function moneyHash(jur, industry) {
  const p = new URLSearchParams();
  if (jur && jur !== "federal") p.set("jur", jur);
  if (industry) p.set("industry", industry);
  const q = p.toString();
  return q ? `#/money?${q}` : "#/money";
}

function renderMoneySwitch(jur) {
  const box = $("money-jur");
  if (!box) return;
  box.innerHTML = Object.entries(MONEY_JURISDICTIONS).map(([k, c]) =>
    `<button type="button" data-jur="${esc(k)}" aria-pressed="${k === jur ? "true" : "false"}">${esc(c.label)}</button>`).join("");
  for (const btn of box.querySelectorAll("button")) {
    btn.addEventListener("click", () => { location.hash = moneyHash(btn.dataset.jur); });
  }
}

/** The panel fineprint, from the loaded file's meta block where it has one. */
function moneyFineprintHTML(jur, meta) {
  const cfg = MONEY_JURISDICTIONS[jur];
  const parts = [];
  if (meta?.jurisdiction) {
    parts.push(`Source: ${meta.commission} (${meta.sourceShort}), ${meta.coverage}; licence: ${meta.licence}.`);
    parts.push(meta.threshold, "Totals are a floor, not a ceiling.");
    parts.push("Gifts to candidates and committees, public funding and internal party transfers are excluded.");
    parts.push(meta.not_summed || STATE_NOT_SUMMED);
  } else {
    parts.push("Source: Australian Electoral Commission annual and election returns, financial years 1998-99 to 2025-26.");
    parts.push(AEC_NOTE, "Public electoral funding and internal party transfers are excluded.", STATE_NOT_SUMMED);
  }
  const full = jur === "federal" ? "/map" : `/map?jur=${encodeURIComponent(jur)}`;
  return `${parts.filter(Boolean).map((s) => esc(s)).join(" ")}
      <a href="${esc(cfg.file)}">Download the data</a> · <a href="${esc(full)}">Full-screen map</a>`;
}

let moneyMapHandle = null;
let moneyMapJur = null;     // jurisdiction the mounted map shows
let moneyMapLoading = null; // jurisdiction of the mount in flight
let moneyMapIsolate = null; // industry cluster the route asked to isolate (#/money?industry=)

async function mountMoney(jurParam, industry) {
  const jur = MONEY_JURISDICTIONS[jurParam] ? jurParam : "federal";
  renderMoneySwitch(jur);
  const isolate = industry || null;
  if (moneyMapHandle && moneyMapJur === jur) {
    // A legend choice made on the page is left alone; only the route's own
    // parameter coming or going moves the map.
    if (isolate !== moneyMapIsolate) moneyMapHandle.isolate?.(isolate);
    moneyMapIsolate = isolate;
    return;
  }
  moneyMapIsolate = isolate;
  if (moneyMapLoading === jur) return;
  moneyMapLoading = jur;
  if (moneyMapHandle) { moneyMapHandle.destroy(); moneyMapHandle = null; moneyMapJur = null; }
  const root = $("money-map-root");
  root.innerHTML = `<p class="status" style="margin:0;padding:1rem 1.25rem">Loading the map…</p>`;
  const cfg = MONEY_JURISDICTIONS[jur];
  try {
    const [{ mountMoneyMap }, data] = await Promise.all([import("/money-map.js"), loadMoneyFile(jur)]);
    if (moneyMapLoading !== jur) return; // switched again while loading
    const fine = $("money-fineprint");
    if (fine) fine.innerHTML = moneyFineprintHTML(jur, data?.meta);
    root.textContent = "";
    const handle = await mountMoneyMap(root, cfg.file, {
      askUrl: (industry) =>
        askHash(`What has parliament said about ${industry.replace(/_/g, " ")}?`),
    });
    if (moneyMapLoading !== jur) { handle.destroy(); return; }
    moneyMapHandle = handle;
    moneyMapJur = jur;
    if (moneyMapIsolate) handle.isolate?.(moneyMapIsolate);
  } catch (err) {
    if (moneyMapLoading !== jur) return;
    root.textContent = "";
    const p = document.createElement("p");
    p.className = "status error";
    p.style.cssText = "margin:0;padding:1rem 1.25rem";
    p.textContent = `The map could not load (${err.message || err}). `;
    const a = document.createElement("a");
    a.href = jur === "federal" ? "/map" : `/map?jur=${encodeURIComponent(jur)}`;
    a.textContent = "Try the full-screen map";
    p.appendChild(a);
    root.appendChild(p);
  } finally {
    if (moneyMapLoading === jur) moneyMapLoading = null;
  }
}

let firstRoute = true;
let routeCount = 0; // in-app navigations — Back inside the app is only safe past the first

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
  routeCount++;

  if (view !== "subject") { destroySubjectMap(); currentSubjectKey = null; }
  if (view === "subject" && segs[1] === "topic") {
    showPanel("subject");
    document.title = TITLES.subject;
    if (segs[2]) openTopicPage(decodeURIComponent(segs[2]), manageFocus);
    else openTopicsIndex(manageFocus);
  } else if (view === "subject" && segs[1] && segs[2]) {
    showPanel("subject");
    document.title = TITLES.subject;
    openSubject(segs[1], decodeURIComponent(segs[2]), manageFocus);
  } else if (view === "doc" && segs[1]) {
    showPanel("doc");
    document.title = TITLES.doc;
    openDocPage(segs[1], manageFocus);
  } else if (view === "chat") {
    showPanel("chat");
    document.title = TITLES.chat;
    initChat(manageFocus);
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
    mountMoney(params.get("jur"), params.get("industry"));
  } else if (view === "explore") {
    showPanel("explore");
    document.title = TITLES.explore;
  } else if (view === "about") {
    showPanel("about");
    document.title = TITLES.about;
  } else if (view === "methods") {
    showPanel("methods");
    document.title = TITLES.methods;
  } else if (view === "stats") {
    showPanel("stats");
    document.title = TITLES.stats;
  } else {
    showPanel("ask");
    document.title = TITLES.ask;
    const q = params.get("q");
    if (view === "ask" && q && q !== lastAsk.question) {
      $("ask-input").value = q;
      if ($("ask-wide")) $("ask-wide").checked = params.get("kind") === "all";
      runAsk(q);
    } else if (!q && $("ask-result").hidden) {
      renderFrontPage();
    }
  }
  // A view change can hide the element that held focus (e.g. the doc page's
  // Back button); catch the drop so keyboard users keep a place in the page.
  if (manageFocus && document.activeElement === document.body) {
    document.querySelector("main").focus();
  }
  // Fresh view, fresh top of page (section deep-links re-scroll themselves).
  if (manageFocus) window.scrollTo(0, 0);
}

function resetAsk() {
  if (askAbort) { askAbort.abort(); askAbort = null; }
  clearInterval(askTimer);
  // The abandoned ask's finally no longer sees itself as current, so the
  // button is restored here.
  const askBtn = $("ask-form").querySelector('button[type="submit"]');
  if (askBtn) { askBtn.disabled = false; askBtn.classList.remove("btn-loading"); askBtn.textContent = "Ask the record"; }
  hideWombat();
  $("ask-input").value = "";
  setStatus($("ask-status"), "");
  $("ask-result").hidden = true;
  $("ask-money").hidden = true;
  $("quote-rail").hidden = true;
  lastAsk = { question: "", sources: [] };
  renderChips();
}

// Tapping the mark, or the name over the nav, always means "take me home, fresh".
const goHomeFresh = () => {
  resetAsk();
  if (location.hash && location.hash !== "#/") location.hash = "#/";
  else { showPanel("ask"); renderFrontPage(); }
  window.scrollTo(0, 0);
};
for (const el of document.querySelectorAll(".logo, .masthead-name a")) el.addEventListener("click", goHomeFresh);

document.querySelector('a[href="#main"]')?.addEventListener("click", (e) => {
  e.preventDefault();
  document.querySelector("main").focus();
});

// --- masthead quick search ---------------------------------------------------
// One input over everything with a page: speakers, topics, donors and
// parties, reports — plus a plain search of the record as the first row.
{
  const input = $("mast-q");
  const panel = $("mast-sugg");
  let items = [];
  let active = -1;
  let seq = 0;
  let debounce = null;
  const close = () => {
    panel.hidden = true;
    input.setAttribute("aria-expanded", "false");
    active = -1;
  };
  const go = (href) => {
    close();
    input.value = "";
    input.blur();
    location.hash = href.startsWith("#") ? href.slice(1) : href;
  };
  const render = () => {
    panel.replaceChildren(...items.map((it, i) => {
      const b = document.createElement("button");
      b.type = "button";
      b.className = "ms-row" + (i === active ? " ms-active" : "");
      b.setAttribute("role", "option");
      b.id = `ms-opt-${i}`;
      b.setAttribute("aria-selected", String(i === active));
      const t = document.createElement("span");
      t.textContent = it.label;
      const k = document.createElement("span");
      k.className = "ms-type";
      k.textContent = it.type;
      b.append(t, k);
      // pointerdown beats the input's blur; click would arrive too late.
      b.addEventListener("pointerdown", (e) => { e.preventDefault(); go(it.href); });
      return b;
    }));
    panel.hidden = !items.length;
    input.setAttribute("aria-expanded", String(items.length > 0));
    input.setAttribute("aria-activedescendant", active >= 0 ? `ms-opt-${active}` : "");
  };
  const suggest = async () => {
    const q = input.value.trim();
    const my = ++seq;
    if (q.length < 2) { items = []; render(); return; }
    const ql = q.toLowerCase();
    const out = [{ label: `Search the record for “${q}”`, type: "Search", href: searchHash(q, {}) }];
    try {
      await Promise.all([loadSpeakersDir(), loadMoneyData(), loadReportsIndex()]);
      if (my !== seq) return;
      const dir = await loadSpeakersDir();
      for (const name of (dir?.names || []).filter((n) => n.toLowerCase().includes(ql)).slice(0, 4)) {
        out.push({ label: name, type: "Speaker", href: subjectHash("person", name) });
      }
      for (const [slug, disp] of Object.entries(TOPICS).filter(([, d]) => d.toLowerCase().includes(ql)).slice(0, 3)) {
        out.push({ label: disp, type: "Topic", href: `#/subject/topic/${slug}` });
      }
      for (const n of (moneyData?.nodes || []).filter((n) => n.label.toLowerCase().includes(ql)).slice(0, 3)) {
        out.push({
          label: n.label,
          type: n.kind === "party" ? "Party" : "Donor",
          href: subjectHash(n.kind === "party" ? "party" : "donor", n.label),
        });
      }
      for (const r of (reportsIndex || []).filter((r) => (r.title || "").toLowerCase().includes(ql)).slice(0, 2)) {
        out.push({ label: `${r.title} report`, type: "Report", href: `#/reports/${r.slug}` });
      }
    } catch { /* the plain-search row stands alone */ }
    if (my !== seq) return;
    items = out.slice(0, 10);
    active = -1;
    render();
  };
  input?.addEventListener("input", () => {
    clearTimeout(debounce);
    debounce = setTimeout(suggest, 120);
  });
  input?.addEventListener("keydown", (e) => {
    if (e.key === "ArrowDown" && items.length) {
      e.preventDefault(); active = (active + 1) % items.length; render();
    } else if (e.key === "ArrowUp" && items.length) {
      e.preventDefault(); active = (active - 1 + items.length) % items.length; render();
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (active >= 0 && items[active]) go(items[active].href);
      else if (input.value.trim()) go(searchHash(input.value.trim(), {}));
    } else if (e.key === "Escape" && !panel.hidden) {
      e.stopPropagation(); close();
    }
  });
  input?.addEventListener("focus", () => { if (items.length) { panel.hidden = false; input.setAttribute("aria-expanded", "true"); } });
  document.addEventListener("pointerdown", (e) => {
    if (!panel.hidden && !panel.contains(e.target) && e.target !== input) close();
  });
}

// --- the masthead constellation ---------------------------------------------
// Every now and then two (sometimes three) of the seven federation stars
// acknowledge each other: a hairline thread breathes in and fades away.
// Decorative only; still under reduced motion.
(() => {
  const svg = document.querySelector(".logo-mark");
  if (!svg || matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  let stars = null; // measured lazily: getBBox needs a rendered SVG
  const NS = "http://www.w3.org/2000/svg";
  const thread = (a, b, delay) => {
    const line = document.createElementNS(NS, "line");
    line.setAttribute("x1", a.x); line.setAttribute("y1", a.y);
    line.setAttribute("x2", b.x); line.setAttribute("y2", b.y);
    line.setAttribute("class", "logo-thread");
    svg.insertBefore(line, svg.firstChild); // beneath the land and stars
    line.animate(
      [{ opacity: 0 }, { opacity: 0.4, offset: 0.4 }, { opacity: 0 }],
      { duration: 3600, delay, easing: "ease-in-out" },
    ).onfinish = () => line.remove();
  };
  const glint = () => {
    stars ??= [...svg.querySelectorAll(".logo-star")].map((p) => {
      const b = p.getBBox();
      return { x: b.x + b.width / 2, y: b.y + b.height / 2 };
    });
    // Two or, one time in three, three distinct stars in a short chain.
    const picks = [...stars].sort(() => Math.random() - 0.5)
      .slice(0, Math.random() < 1 / 3 ? 3 : 2);
    for (let i = 0; i + 1 < picks.length; i++) thread(picks[i], picks[i + 1], i * 450);
    schedule();
  };
  const schedule = () => setTimeout(glint, 8000 + Math.random() * 14000);
  schedule();
})();

window.addEventListener("hashchange", route);

// --- masthead nav: megamenus + mobile drawer --------------------------------
// Disclosure pattern (button + panel), not role=menu: Enter/Space toggles,
// Esc closes and returns focus, Tab walks the panel links in DOM order
// (each panel sits right after its button). Hover opens on fine pointers
// with a 150ms close delay so diagonal travel to the panel doesn't shut it.

const navMenus = [...document.querySelectorAll("#primary-nav .has-menu")].map((item) => ({
  item,
  btn: item.querySelector("button[aria-controls]"),
  panel: item.querySelector(".megamenu"),
}));
let openNavMenu = null;
let navMenuTimer = 0;
const hoverFine = window.matchMedia("(hover: hover) and (pointer: fine)");

// Report pictograms, keyed by slug: hairline line art on a 24-unit grid, the
// same stroke and bronze as the house icons. The static menu markup in
// index.html carries the same drawings; keep the two in step. Unknown slugs
// get no glyph. First Nations is the continent (Country) with an open ring at
// its heart: no sacred or ceremonial symbols, no dot-painting imitation.
const REPORT_GLYPHS = {
  climate: '<circle cx="12" cy="10" r="1.3"/><path d="M12 8.4C9.9 6.6 10.2 3.4 12 2 13.8 3.4 14.1 6.6 12 8.4Z"/><path d="M12 8.4C9.9 6.6 10.2 3.4 12 2 13.8 3.4 14.1 6.6 12 8.4Z" transform="rotate(120 12 10)"/><path d="M12 8.4C9.9 6.6 10.2 3.4 12 2 13.8 3.4 14.1 6.6 12 8.4Z" transform="rotate(240 12 10)"/><path d="M12 11.3V21M8.5 21h7"/>',
  gambling: '<path d="M11 9V4.6a1.6 1.6 0 0 1 1.6-1.6h6.8A1.6 1.6 0 0 1 21 4.6v6.8a1.6 1.6 0 0 1-1.6 1.6H15"/><circle cx="13.9" cy="5.9" r=".7"/><circle cx="18.1" cy="10.1" r=".7"/><rect x="3" y="9" width="12" height="12" rx="1.6"/><circle cx="6.2" cy="12.2" r=".7"/><circle cx="9" cy="15" r=".7"/><circle cx="11.8" cy="17.8" r=".7"/>',
  housing: '<path d="M3 11.2L12 3.2l9 8"/><path d="M5.2 9.3V21h13.6V9.3"/><path d="M10.94 14.87A1.9 1.9 0 1 1 13.06 14.87L13.5 18.5H10.5Z"/>',
  immigration: '<rect x="5" y="2.5" width="14" height="19" rx="1.6"/><circle cx="12" cy="9.8" r="3.4"/><path d="M8.6 9.8h6.8"/><path d="M12 6.4c-2 1.9-2 4.9 0 6.8 2-1.9 2-4.9 0-6.8z"/><path d="M8.5 16.4h7M8.5 18.9h4"/>',
  indigenous: '<path d="M16.3 3L17.9 5.6L19.6 8L21.3 10L21.4 11.8L20.3 14.6L19.7 16.4L18.1 17.4L15.4 16.8L14 15.3L10.8 13.2L7.4 14.3L4.7 15.1L3.4 14.5L3.4 12.6L2.6 10.3L3 8L4.7 7.1L6.8 6L8.2 4.4L10.2 4.5L10.8 3.3L12.4 3.1L13.3 4.6L14.6 5.5L15.7 4.6Z"/><path d="M17.3 18.6L18.9 18.7L18.4 20.4L17.6 19.7Z"/><circle cx="12.2" cy="9.8" r="1.7"/>',
  media: '<path d="M17 8.5h4v9a2 2 0 0 1-4 0V4.5H3v13a2 2 0 0 0 2 2h14"/><path d="M6 7.5h4.6v3.6H6z"/><path d="M6 13.7h8M6 16.2h5.5"/>',
};

function reportGlyph(slug, cls) {
  const d = REPORT_GLYPHS[slug];
  if (!d) return "";
  return `<svg class="${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d}</svg>`;
}

function reportsMenuHTML(list) {
  return list.map((r) => `
    <a class="mm-link" href="#/reports/${esc(r.slug)}">${reportGlyph(r.slug, "mm-glyph")}
      <span class="mm-title">${esc(r.title)}</span>
      <span class="mm-blurb">${esc(r.blurb)}</span>
    </a>`).join("");
}

let reportsMenuFilled = false;
function fillReportsMenu() {
  // The static links in the markup are the fallback; the live index replaces
  // them once, lazily, the first time the menu opens.
  if (reportsMenuFilled) return;
  reportsMenuFilled = true;
  loadReportsIndex().then(() => {
    if (reportsIndex?.length) $("menu-reports-list").innerHTML = reportsMenuHTML(reportsIndex);
  });
}

/** The panel drops from the navy band, aligned to its trigger but kept inside the band. */
function placeNavMenu(m) {
  const header = document.querySelector("header");
  const hr = header.getBoundingClientRect();
  const br = m.btn.getBoundingClientRect();
  const left = Math.max(12, Math.min(br.left - hr.left, hr.width - m.panel.offsetWidth - 12));
  m.panel.style.left = `${Math.round(left)}px`;
}

function setNavMenu(m, open) {
  clearTimeout(navMenuTimer);
  if (open) {
    if (openNavMenu && openNavMenu !== m) setNavMenu(openNavMenu, false);
    if (m.panel.id === "menu-reports") fillReportsMenu();
    m.panel.hidden = false;
    placeNavMenu(m);
    m.btn.setAttribute("aria-expanded", "true");
    openNavMenu = m;
  } else {
    m.panel.hidden = true;
    m.btn.setAttribute("aria-expanded", "false");
    m.byHover = false;
    if (openNavMenu === m) openNavMenu = null;
  }
}

for (const m of navMenus) {
  m.btn.addEventListener("click", () => {
    // A click right after a hover-open reads as "yes, this menu" — closing
    // it would punish the most natural gesture. It confirms instead.
    if (openNavMenu === m && m.byHover) { m.byHover = false; return; }
    setNavMenu(m, openNavMenu !== m);
  });
  m.item.addEventListener("mouseenter", () => {
    if (!hoverFine.matches) return;
    clearTimeout(navMenuTimer);
    if (openNavMenu !== m) { setNavMenu(m, true); m.byHover = true; }
  });
  // Following a panel link closes the panel even when the hash is already
  // the destination (no hashchange fires then).
  m.panel.addEventListener("click", (e) => {
    if (e.target.closest("a")) setNavMenu(m, false);
  });
  m.item.addEventListener("mouseleave", () => {
    if (!hoverFine.matches) return;
    clearTimeout(navMenuTimer);
    navMenuTimer = setTimeout(() => { if (openNavMenu === m) setNavMenu(m, false); }, 150);
  });
  m.item.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && openNavMenu === m) {
      e.stopPropagation();
      setNavMenu(m, false);
      m.btn.focus();
    }
  });
  // Tabbing out of the item (past the panel's last link) closes it quietly.
  m.item.addEventListener("focusout", (e) => {
    if (openNavMenu === m && !m.item.contains(e.relatedTarget)) setNavMenu(m, false);
  });
}
document.addEventListener("pointerdown", (e) => {
  if (openNavMenu && !openNavMenu.item.contains(e.target)) setNavMenu(openNavMenu, false);
});
window.addEventListener("hashchange", () => { if (openNavMenu) setNavMenu(openNavMenu, false); });
window.addEventListener("resize", () => { if (openNavMenu) placeNavMenu(openNavMenu); });

// The drawer is a modal <dialog>: native focus trap, Esc-close, and focus
// restored to the hamburger when it closes.
{
  const drawer = $("nav-drawer");
  const toggle = $("nav-open");
  toggle.addEventListener("click", () => {
    drawer.showModal();
    toggle.setAttribute("aria-expanded", "true");
  });
  drawer.addEventListener("close", () => toggle.setAttribute("aria-expanded", "false"));
  $("drawer-close").addEventListener("click", () => drawer.close());
  drawer.addEventListener("click", (e) => {
    // A link tap navigates (the hash does the routing) and dismisses the drawer.
    if (e.target.closest("a")) { drawer.close(); return; }
    const r = drawer.getBoundingClientRect(); // outside the panel = backdrop
    const inside = e.clientX >= r.left && e.clientX <= r.right &&
                   e.clientY >= r.top && e.clientY <= r.bottom;
    if (!inside) drawer.close();
  });
  // Growing past the mobile breakpoint with the drawer open would strand a
  // modal over a page that now shows the full nav.
  window.matchMedia("(min-width: 861px)").addEventListener("change", (e) => {
    if (e.matches && drawer.open) drawer.close();
  });
}

// Time machine / record quiz entries (megamenu + drawer): the link lands on
// Explore via its href; the game dialog then opens on top of it.
document.addEventListener("click", (e) => {
  const game = e.target.closest("[data-game]");
  if (game) openGame(game.dataset.game);
});

// --- ask --------------------------------------------------------------------

let askAbort = null;
let askTimer = null;

/* --- answer markdown, ported from corpuskit ---------------------------------
   parseDocBlocks + normaliseAnswerBullets come from corpuskit's tested
   lib/resource-view.ts and lib/answer-text.ts (the parser its document reader
   and AI answers share); renderAnswer below replaces the React shell
   (AnswerMarkdown.tsx) with plain DOM building. Injection-safe: model text
   only ever reaches textContent — no innerHTML on this path. */

/**
 * The model is asked for markdown but sometimes runs a whole bulleted section
 * onto one line — `**Tiers** * The SESSF uses ... * Tier 3 ...`. A lone ` * `
 * after a sentence-ish boundary is never legitimate prose here, so it moves
 * onto its own line and parses as the bullet it was meant to be. Emphasis
 * (`*word*`) and arithmetic (`0.2 * 3`) never match.
 */
function normaliseAnswerBullets(text) {
  return text.replace(/([.:;!?\]"”)*]) \* (?=\S)/g, "$1\n* ");
}

function tableCells(line) {
  return line.replace(/^\s*\|/, "").replace(/\|\s*$/, "").split("|").map((c) => c.trim());
}

function isTableSeparator(line) {
  return /^\s*\|?[\s:|-]*-[\s:|-]*\|?\s*$/.test(line) && line.includes("-");
}

/** Collapse the soft line wraps inside a single paragraph into spaces. */
function unwrapText(text) {
  return text.replace(/\s*\n\s*/g, " ").trim();
}

/** Width of a line's leading whitespace, counting a tab as two spaces. */
function indentWidth(line) {
  const leading = /^[ \t]*/.exec(line)?.[0] ?? "";
  return leading.replace(/\t/g, "  ").length;
}

/**
 * Parse a body (markdown, or flattened extracted text) into renderable
 * blocks: headings, block quotes, fenced code, ordered/unordered lists with
 * one level of nesting and soft-wrap continuations, pipe tables; everything
 * else is a paragraph. Blank-line separation is used when present; otherwise
 * each source line becomes its own block.
 */
function parseDocBlocks(body) {
  const source = String(body ?? "").replace(/\r\n?/g, "\n");
  if (source.trim().length === 0) return [];
  const hasBlankLines = /\n[ \t]*\n/.test(source);
  const lines = source.split("\n");
  const blocks = [];

  let i = 0;
  let paragraph = [];
  const flushParagraph = () => {
    if (paragraph.length === 0) return;
    blocks.push({ kind: "paragraph", text: unwrapText(paragraph.join("\n")) });
    paragraph = [];
  };

  while (i < lines.length) {
    const line = lines[i] ?? "";
    const trimmed = line.trim();

    if (trimmed.length === 0) {
      flushParagraph();
      i += 1;
      continue;
    }

    if (/^```/.test(trimmed)) {
      flushParagraph();
      const buf = [];
      i += 1;
      while (i < lines.length && !/^```/.test((lines[i] ?? "").trim())) {
        buf.push(lines[i] ?? "");
        i += 1;
      }
      i += 1; // closing fence
      blocks.push({ kind: "code", text: buf.join("\n") });
      continue;
    }

    const heading = /^(#{1,6})\s+(.*)$/.exec(trimmed);
    if (heading) {
      flushParagraph();
      blocks.push({ kind: "heading", level: heading[1].length, text: heading[2].trim() });
      i += 1;
      continue;
    }

    // Table: a pipe row followed by a separator row.
    if (trimmed.includes("|") && i + 1 < lines.length && isTableSeparator(lines[i + 1] ?? "")) {
      flushParagraph();
      const headers = tableCells(trimmed);
      const rows = [];
      i += 2;
      while (i < lines.length && (lines[i] ?? "").includes("|") && (lines[i] ?? "").trim()) {
        rows.push(tableCells(lines[i] ?? ""));
        i += 1;
      }
      blocks.push({ kind: "table", headers, rows });
      continue;
    }

    if (/^>\s?/.test(trimmed)) {
      flushParagraph();
      const buf = [];
      while (i < lines.length && /^>\s?/.test((lines[i] ?? "").trim())) {
        buf.push((lines[i] ?? "").trim().replace(/^>\s?/, ""));
        i += 1;
      }
      blocks.push({ kind: "quote", text: unwrapText(buf.join("\n")) });
      continue;
    }

    // List: bullet/number lines with soft-wrap continuations, blank-line
    // "loose" gaps, and one level of nesting (a bullet indented two-plus
    // spaces past the first item nests under the item above it).
    const bullet = /^([-*+]|\d+[.)])\s+/.exec(trimmed);
    if (bullet) {
      flushParagraph();
      const ordered = /^\d/.test(bullet[1]);
      const baseIndent = indentWidth(line);
      const items = [];
      let lastWasChild = false;
      while (i < lines.length) {
        const raw = lines[i] ?? "";
        const t = raw.trim();
        const m = /^([-*+]|\d+[.)])\s+(.*)$/.exec(t);
        if (m) {
          const parent = items[items.length - 1];
          if (parent && indentWidth(raw) >= baseIndent + 2) {
            parent.children.push(m[2].trim());
            lastWasChild = true;
          } else {
            items.push({ text: m[2].trim(), children: [] });
            lastWasChild = false;
          }
          i += 1;
          continue;
        }
        if (t.length === 0) {
          // Continue across a blank line only when the list resumes after it.
          let j = i + 1;
          while (j < lines.length && (lines[j] ?? "").trim().length === 0) j += 1;
          if (j < lines.length && /^([-*+]|\d+[.)])\s+/.test((lines[j] ?? "").trim())) {
            i = j;
            continue;
          }
          break;
        }
        // An indented, non-bullet line continues the most recent entry's text.
        const target = items[items.length - 1];
        if (/^\s/.test(raw) && target) {
          if (lastWasChild && target.children.length > 0) {
            target.children[target.children.length - 1] += ` ${t}`;
          } else {
            target.text += ` ${t}`;
          }
          i += 1;
          continue;
        }
        break;
      }
      blocks.push({ kind: "list", ordered, items });
      continue;
    }

    if (hasBlankLines) {
      paragraph.push(line);
      i += 1;
    } else {
      blocks.push({ kind: "paragraph", text: trimmed });
      i += 1;
    }
  }
  flushParagraph();
  return blocks;
}

/** Inline treatment: **bold** only — text nodes and <strong>, nothing else. */
function appendInline(el, text) {
  // Bold splits first so a ** pair is never read as two italics markers.
  const parts = String(text).split(/\*\*(.+?)\*\*/);
  parts.forEach((part, j) => {
    if (!part) return;
    if (j % 2 === 1) {
      const b = document.createElement("strong");
      appendEmphasis(b, part);
      el.appendChild(b);
    } else {
      appendEmphasis(el, part);
    }
  });
}

// Italics (*text* or _text_ standing on word boundaries) and `code` inside a
// run of text. Everything else stays a text node; model text never reaches
// innerHTML.
function appendEmphasis(el, text) {
  const re = /(^|[\s(\["“'])(?:\*(\S(?:[^*\n]*?\S)?)\*|_(\S(?:[^_\n]*?\S)?)_)(?=$|[\s.,;:!?)\]"”'])|`([^`\n]+?)`/g;
  let last = 0;
  let m;
  while ((m = re.exec(text))) {
    const isCode = m[4] !== undefined;
    const start = m.index + (isCode ? 0 : m[1].length);
    if (start > last) el.appendChild(document.createTextNode(text.slice(last, start)));
    const node = document.createElement(isCode ? "code" : "em");
    node.textContent = isCode ? m[4] : (m[2] ?? m[3]);
    el.appendChild(node);
    last = m.index + m[0].length;
  }
  if (last < text.length) el.appendChild(document.createTextNode(text.slice(last)));
}

function renderAnswer(container, text) {
  container.replaceChildren();
  for (const block of parseDocBlocks(normaliseAnswerBullets(String(text)))) {
    if (block.kind === "heading") {
      // An answer sits below the page's own headings: model headings render
      // at one visual level (h3, h4 beneath) to keep the outline sensible.
      const h = document.createElement(block.level <= 3 ? "h3" : "h4");
      appendInline(h, block.text);
      container.appendChild(h);
    } else if (block.kind === "list") {
      const list = document.createElement(block.ordered ? "ol" : "ul");
      for (const item of block.items) {
        const li = document.createElement("li");
        appendInline(li, item.text);
        if (item.children.length) {
          const sub = document.createElement("ul");
          for (const child of item.children) {
            const cli = document.createElement("li");
            appendInline(cli, child);
            sub.appendChild(cli);
          }
          li.appendChild(sub);
        }
        list.appendChild(li);
      }
      container.appendChild(list);
    } else if (block.kind === "quote") {
      const q = document.createElement("blockquote");
      appendInline(q, block.text);
      container.appendChild(q);
    } else if (block.kind === "code") {
      const pre = document.createElement("pre");
      const code = document.createElement("code");
      code.textContent = block.text;
      pre.appendChild(code);
      container.appendChild(pre);
    } else if (block.kind === "table") {
      const scroll = document.createElement("div");
      scroll.className = "table-scroll";
      const table = document.createElement("table");
      table.className = "about-table";
      const thead = document.createElement("thead");
      const headRow = document.createElement("tr");
      for (const header of block.headers) {
        const th = document.createElement("th");
        appendInline(th, header);
        headRow.appendChild(th);
      }
      thead.appendChild(headRow);
      const tbody = document.createElement("tbody");
      for (const row of block.rows) {
        const tr = document.createElement("tr");
        for (const cell of row) {
          const td = document.createElement("td");
          appendInline(td, cell);
          tr.appendChild(td);
        }
        tbody.appendChild(tr);
      }
      table.append(thead, tbody);
      scroll.appendChild(table);
      container.appendChild(scroll);
    } else {
      const p = document.createElement("p");
      appendInline(p, block.text);
      container.appendChild(p);
    }
  }
}

// NOTE: answers may contain [n] markers, but the platform does not document
// how they map onto retrieval results — wiring them to our renumbered cited
// list risked visibly attributing a claim to the wrong speech. Until the
// mapping is verified against the platform, markers render as plain text and
// the sources list stands on its own.

function sourceItem(s, num) {
  const li = document.createElement("li");
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
  // Speaker portrait, and the speaker and party open their own pages.
  const meta = metaHTML(s, { linkSpeaker: true, linkParty: true, portrait: true });
  if (meta) {
    const span = document.createElement("span");
    span.className = "source-meta";
    span.innerHTML = meta;
    li.appendChild(span);
    decorateMetaPortraits(li);
  }
  return li;
}

// --- scroll quote rail ------------------------------------------------------
// As the reader scrolls the answer, the passage behind it fades up on the
// right: reading progress maps onto the CITED sources in list order. The [n]
// markers stay unwired (see the note above) — progress mapping paces the
// record alongside the answer without ever attributing a claim to a marker.

const quoteRail = { sources: [], idx: -1, raf: 0 };

function quoteCardHTML(s, i, n) {
  const full = (s.snippet || "").trim().replace(/\s+/g, " ");
  const meta = [
    s.speaker ? `<span class="quote-speaker">${esc(s.speaker)}</span>` : "",
    s.party ? partyChipHTML(s.party) : "",
    s.date ? esc(fmtDate(s.date)) : "",
  ].filter(Boolean).join(" · ");
  // Quote marks only around a real passage; with no snippet the title stands in.
  const body = full
    ? `“${esc(full.slice(0, 260))}${full.length > 260 ? "…" : ""}”`
    : esc(s.title || s.slug);
  return `<span class="kicker">From the record · ${i + 1} of ${n}</span>` +
    `<blockquote>${body}</blockquote>` +
    (meta ? `<span class="quote-meta"><span class="quote-portrait"></span><span>${meta}</span></span>` : "");
}

function setQuoteRail(sources) {
  quoteRail.sources = sources || [];
  quoteRail.idx = -1;
  updateQuoteRail();
}

function updateQuoteRail() {
  const rail = $("quote-rail");
  const n = quoteRail.sources.length;
  const rect = $("ask-answer").getBoundingClientRect();
  // Room to the answer's right for the card (measured, so browser zoom and
  // odd widths are handled truthfully rather than by a breakpoint guess).
  const space = innerWidth - rect.right;
  // The sources list runs full width beneath the answer; the card yields
  // before that block climbs into its zone rather than sitting on top of it.
  const sourcesEl = $("ask-sources");
  const sourcesTop = sourcesEl.hidden ? Infinity : sourcesEl.getBoundingClientRect().top;
  const clearOfSources = sourcesTop > innerHeight * 0.3 + (rail.offsetHeight || 280) + 12;
  // The card is fixed at 30vh: it may only appear once the answer's top has
  // actually scrolled up to that zone — otherwise it floats over the ask form
  // on short answers before any scrolling happens.
  const visible = space >= 348 && n > 0 && !$("ask-result").hidden && rect.height > 1 &&
    rect.top < innerHeight * 0.3 + 8 && rect.bottom > innerHeight * 0.28 && clearOfSources;
  rail.hidden = !visible;
  if (!visible) { quoteRail.idx = -1; return; }
  rail.style.left = `${Math.round(rect.right + Math.min(48, space - 316))}px`;
  // The reading line: whichever slice of the answer crosses it decides the quote.
  const progress = Math.min(1, Math.max(0, (innerHeight * 0.38 - rect.top) / rect.height));
  const idx = Math.min(n - 1, Math.floor(progress * n));
  if (idx === quoteRail.idx) return;
  quoteRail.idx = idx;
  const s = quoteRail.sources[idx];
  const card = $("quote-card");
  // Let the old quote fade out before the new one rises in; a swap mid-fade
  // (fast scrolling) simply restarts the timer with the newest quote.
  clearTimeout(quoteRail.swap);
  card.classList.remove("shown");
  const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
  quoteRail.swap = setTimeout(() => {
    card.innerHTML = quoteCardHTML(s, idx, n);
    card.onclick = (e) => { e.preventDefault(); location.hash = `#/doc/${s.slug}`; };
    void card.offsetWidth; // restart the fade-up from the bottom
    card.classList.add("shown");
    loadPhotoMap().then(() => {
      const url = photoUrlFor(s.speaker);
      const slot = card.querySelector(".quote-portrait");
      if (url && slot && quoteRail.idx === idx) {
        slot.innerHTML = `<img src="${esc(url)}" alt="" width="28" height="28">`;
      }
    });
  }, reduced ? 0 : 260);
}

addEventListener("scroll", () => {
  if (quoteRail.raf) return;
  quoteRail.raf = requestAnimationFrame(() => { quoteRail.raf = 0; updateQuoteRail(); });
}, { passive: true });
addEventListener("resize", () => updateQuoteRail());
addEventListener("hashchange", () => updateQuoteRail());


// --- money answers ----------------------------------------------------------
// "Who gives money to gambling?" deserves figures, not only quotes. The AEC
// donations export already ships to every client (/graph/money.json), so a
// money-intent question renders the structured answer INSTANTLY, while the
// model composes the words alongside.

let moneyData = null;
let moneyDataPromise = null;
function loadMoneyData() {
  moneyDataPromise ??= fetch("/graph/money.json")
    .then((r) => r.json()).then((d) => (moneyData = d)).catch(() => null);
  return moneyDataPromise;
}

const MONEY_INTENT = /donat|donor|who (gives|takes|funds|pays)|money|funds?\b|funding|financ(es|ed|ing)|bankroll/i;
const INDUSTRY_ALIASES = {
  gambling: ["gambling", "pokies", "poker machine", "casino", "wagering", "betting", "bookmaker"],
  finance: ["bank", "finance", "financial", "insurance", "superannuation"],
  mining: ["mining", "miner", "resources sector"],
  fossil_fuels: ["coal", " gas", "oil ", "fossil", "petroleum", "energy compan"],
  property: ["property", "real estate", "developer", "construction"],
  unions: ["union"],
  media: ["media", "newspaper", "television", "broadcast"],
  tech: ["tech ", "technology", "platforms"],
  telecom: ["telco", "telecom"],
  pharmacy: ["pharmac", "chemist"],
  health: ["private health", "health insur", "hospital operator"],
  alcohol: ["alcohol", "liquor", "brewer", "wine industry"],
  hospitality: ["hotel", "clubs", "pub ", "hospitality"],
  defence: ["defence industry", "weapons", "arms "],
  agriculture: ["agricultur", "farm lobby"],
  retail: ["retail", "supermarket"],
  lobbying: ["lobby"],
};

function detectMoneyIndustry(q) {
  const s = ` ${q.toLowerCase()} `;
  if (!MONEY_INTENT.test(s)) return null;
  for (const [ind, aliases] of Object.entries(INDUSTRY_ALIASES)) {
    if (aliases.some((a) => s.includes(a))) return ind;
  }
  return null;
}

function industryLabel(ind) {
  return ind.replace(/_/g, " ");
}

function renderMoneyPanel(ind) {
  const box = $("ask-money");
  if (!moneyData) { box.hidden = true; return; }
  const donors = moneyData.nodes.filter(
    (n) => n.kind === "donor" && (n.industry === ind || n.group === ind));
  if (!donors.length) { box.hidden = true; return; }
  const donorIds = new Set(donors.map((n) => n.id));
  const total = donors.reduce((a, n) => a + (n.total || 0), 0);
  const years = [
    Math.min(...donors.map((n) => n.firstYear || 9999)),
    Math.max(...donors.map((n) => n.lastYear || 0)),
  ];
  const byParty = new Map();
  for (const e of moneyData.edges) {
    if (!donorIds.has(e.source)) continue;
    const party = String(e.target).replace(/^party:/, "");
    byParty.set(party, (byParty.get(party) || 0) + (e.total || 0));
  }
  const partyRows = [...byParty.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6);
  const donorRows = donors.sort((a, b) => (b.total || 0) - (a.total || 0)).slice(0, 8)
    .map((n) => [n.label, n.total || 0]);
  box.hidden = false;
  box.innerHTML = `
    <p class="kicker">The money: ${esc(industryLabel(ind))} (AEC disclosures)</p>
    <div class="tiles">
      ${tile(fmtMoney(total), `disclosed by ${industryLabel(ind)} donors`)}
      ${tile(String(donors.length), "major donors disclosed")}
      ${tile(`${years[0]}–${years[1]}`, "years covered")}
    </div>
    ${barList(donorRows, { fmt: fmtMoney, heading: "Largest donors", linkTo: (nm) => subjectHash("donor", nm) })}
    ${barList(partyRows, { fmt: fmtMoney, heading: "Where it went", linkTo: (nm) => subjectHash("party", nm), partyDots: true })}
    <p class="fineprint">${esc(AEC_NOTE)}
      <a href="#/money">Explore on the money map</a> ·
      <a href="/graph/money.json">Download the data</a></p>`;
  // Blocks rise in sequence (kicker, each figure, each chart, the note); fresh
  // nodes on every render, so a second question replays it. Motion is CSS-side.
  box.querySelectorAll(":scope > :not(.tiles), :scope > .tiles > .tile").forEach((el, i) => {
    el.classList.add("rise-in");
    el.style.setProperty("--i", i);
  });
}

/** "What did John Howard say about pokies?" → filter retrieval to the speaker. */
function parseSpeakerIntent(q) {
  const m = /^what (?:did|has|have|does) ([A-Za-z'\u2019 .-]{4,40}?) (?:say|said|says)(?: about| on)? /i.exec(q.trim());
  if (!m) return null;
  const who = m[1].trim();
  if (/\b(parliament|house|senate|mps?|senators?|government|labor|liberal|greens|nationals|coalition|minister|ministers|politicians?|members|people|courts?|they)\b/i.test(who)) return null;
  const words = who.split(/\s+/);
  // A lone word ("howard") passes so resolveSpeaker can try it as a surname
  // at submit time; it is dropped there unless it resolves to a real speaker.
  if (words.length > 4) return null;
  return who;
}

// --- speaker name resolution -------------------------------------------------
// The ARAG speaker filter matches origin collaborators exactly ("John Howard"),
// so casual inputs ("howard", "John howard", "McDONALD") resolve against
// speakers.json — [name, speech_count] rows exported from the corpus with the
// same normalization that produced the collaborator values (5+ speeches each).
// Bare-surname entries ("Hume") are real collaborator values from surname-only
// Hansard prints and compete as candidates like any full name.

const SPEAKER_NICKNAMES = { albo: "Anthony Albanese", scomo: "Scott Morrison" };

function speakerKey(s) {
  return String(s || "").replace(/’/g, "'").replace(/\s+/g, " ").trim().toLowerCase();
}

let speakersDirPromise = null;
function loadSpeakersDir() {
  speakersDirPromise ??= fetch("/speakers.json")
    .then((r) => r.json())
    .then((rows) => {
      const exact = new Map(), bySurname = new Map();
      for (const [name, count] of rows) {
        const key = speakerKey(name);
        exact.set(key, name);
        const sur = key.split(" ").pop();
        if (!bySurname.has(sur)) bySurname.set(sur, []);
        bySurname.get(sur).push([name, count]);
      }
      for (const list of bySurname.values()) list.sort((a, b) => b[1] - a[1]);
      return { exact, bySurname, names: rows.map(([n]) => n) };
    })
    .catch(() => null);
  return speakersDirPromise;
}

/** Casual name → canonical Hansard name, or null to leave the input as typed.
 * Full names casefix by exact match only; a lone surname resolves when one
 * person holds it, or when the biggest holder has 5x the speeches of the
 * next — never a guess between comparable namesakes. */
async function resolveSpeaker(input) {
  const key = speakerKey(input);
  if (!key) return null;
  const dir = await loadSpeakersDir();
  if (!dir) return null;
  const nick = SPEAKER_NICKNAMES[key];
  if (nick && dir.exact.has(speakerKey(nick))) return nick;
  if (key.includes(" ")) return dir.exact.get(key) || null;
  const holders = dir.bySurname.get(key) || [];
  if (holders.length === 1) return holders[0][0];
  if (holders.length > 1 && holders[0][1] >= 5 * holders[1][1]) return holders[0][0];
  return null;
}

// Every speaker input shares one <datalist> typeahead over the directory,
// populated lazily the first time any of them takes focus.
let speakersDatalistStarted = false;
function ensureSpeakersDatalist() {
  if (speakersDatalistStarted) return;
  speakersDatalistStarted = true;
  loadSpeakersDir().then((dir) => {
    if (!dir?.names || $("speakers-list")) return;
    const dl = document.createElement("datalist");
    dl.id = "speakers-list";
    for (const name of dir.names) {
      const o = document.createElement("option");
      o.value = name;
      dl.appendChild(o);
    }
    document.body.appendChild(dl);
  });
}
for (const id of ["a-speaker", "f-speaker"]) {
  $(id)?.addEventListener("focus", ensureSpeakersDatalist, { once: true });
}


// --- subject entries (the encyclopedia) -------------------------------------
// Every donor, party and parliamentarian gets an entry page: an infobox of
// quick facts, honest fun-facts computed from the disclosed data, and a mini
// 3D money map seeded at the subject — click any bubble to jump to ITS page.

let subjectMapHandle = null;
let currentSubjectKey = null;

function destroySubjectMap() {
  if (subjectMapHandle) {
    try { subjectMapHandle.destroy(); } catch { /* already gone */ }
    subjectMapHandle = null;
  }
}


// House icon idiom: stroked, never filled, rounded caps, 20-unit grid.
const ICONS = {
  ask: '<path d="M3 4.5h14v9H9.5L6 16.5v-3H3z"/><path d="M8.2 8.6c0-1 .8-1.7 1.8-1.7s1.8.7 1.8 1.6c0 1.2-1.8 1.3-1.8 2.4"/><path d="M10 12.9h.01"/>',
  search: '<circle cx="9" cy="9" r="5.2"/><path d="M13 13l4 4"/>',
  download: '<path d="M10 3v9"/><path d="M6.5 8.5L10 12l3.5-3.5"/><path d="M3.5 15.5h13"/>',
  speeches: '<path d="M4 3.5h12v13H4z"/><path d="M7 7h6M7 10h6M7 13h4"/>',
  external: '<path d="M8 4H4v12h12v-4"/><path d="M11 3.5h5.5V9"/><path d="M16.5 3.5L9.5 10.5"/>',
  map: '<circle cx="6" cy="7" r="2.2"/><circle cx="14" cy="5.5" r="1.7"/><circle cx="12" cy="13.5" r="2.6"/><path d="M7.9 8.1l2.4 3.3M13.3 7.1l-.7 4"/>',
  cite: '<path d="M7.6 6.3c-1.7.6-2.8 2-2.8 3.9 0 1.2.8 2 1.9 2s1.9-.8 1.9-1.9c0-1-.7-1.8-1.7-1.9"/><path d="M15 6.3c-1.7.6-2.8 2-2.8 3.9 0 1.2.8 2 1.9 2s1.9-.8 1.9-1.9c0-1-.7-1.8-1.7-1.9"/>',
  link: '<path d="M8.3 11.7l3.4-3.4"/><path d="M9.2 13.6l-1.7 1.7a2.85 2.85 0 0 1-4-4l2.5-2.5a2.85 2.85 0 0 1 4 0"/><path d="M10.8 6.4l1.7-1.7a2.85 2.85 0 0 1 4 4L14 11.2a2.85 2.85 0 0 1-4 0"/>',
  entry: '<path d="M5 3.5h10v13H5z"/><path d="M8 7.5h4M8 10.5h4"/>',
  prev: '<path d="M12 4.5L6.5 10l5.5 5.5"/>',
  next: '<path d="M8 4.5L13.5 10 8 15.5"/>',
};

function iconSvg(name) {
  return `<svg class="btn-icon" viewBox="0 0 20 20" fill="none" stroke="currentColor"
    stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[name] || ""}</svg>`;
}

/** An infobox/action button: icon + label; primary = navy fill. */
function actionBtn(icon, href, label, { external = false, primary = false } = {}) {
  const ext = external ? ` rel="noopener" target="_blank"` : "";
  return `<a class="action-btn${primary ? " action-primary" : ""}" href="${esc(href)}"${ext}>` +
    `${iconSvg(icon)}<span>${esc(label)}${external ? " ↗" : ""}</span></a>`;
}


// --- portraits & monograms ---------------------------------------------------
// 200 self-hosted MP portraits (WebP, sourced from official APH/OpenAustralia
// photos by the ingest pipeline) keyed by normalised full name. Donors get
// industry-coloured monogram tiles — most are private companies with no clean,
// legally safe logo source.

let photoMap = null;
let photoMapPromise = null;
function loadPhotoMap() {
  photoMapPromise ??= fetch("/photos/people.json")
    .then((r) => r.json()).then((d) => (photoMap = d)).catch(() => null);
  return photoMapPromise;
}

function photoUrlFor(name) {
  const pid = photoMap?.[String(name || "").trim().toLowerCase()];
  return pid ? `/photos/${pid}.webp` : null;
}

// Voting records for the same 200 people, exported from the division tables
// by scripts/export_votes.py and served static; keyed by the portrait id.
// Fetched only by the front-page encyclopedia slider.
let votesData = null;
let votesPromise = null;
function loadVotes() {
  votesPromise ??= fetch("/votes.json")
    .then((r) => (r.ok ? r.json() : null)).then((d) => (votesData = d)).catch(() => null);
  return votesPromise;
}

function votesFor(name) {
  const pid = photoMap?.[String(name || "").trim().toLowerCase()];
  return (pid && votesData?.[pid]) || null;
}

/** Off-site lookup for a person, company or party: a web search in a new tab. */
function webSearchUrl(name) {
  return `https://www.google.com/search?q=${encodeURIComponent(`${name} Australia`)}`;
}

function subjectHash(kind, label) {
  return `#/subject/${kind}/${encodeURIComponent(label)}`;
}

// Declared interests on person pages: the registers of members' interests
// (House 48th, QLD 58th, a Senate sample) exported by scripts/export_interests.py
// as /interests/index.json plus one file per person. Facts with a link to the
// page of the source PDF, never the statement re-rendered (aph.gov.au is
// CC BY-NC-ND). Federal people are keyed by the portrait id; QLD and unmatched
// members by a name slug the index resolves. The slot is placed synchronously
// so the section keeps its position however long the fetches take.
async function renderPersonInterests(name, personId, sections) {
  const key = currentSubjectKey;
  const slot = document.createElement("div");
  slot.id = "subject-interests";
  sections.appendChild(slot);
  const getJSON = (url) => fetch(url).then((r) => (r.ok ? r.json() : null)).catch(() => null);
  renderPersonInterests.index ??= getJSON("/interests/index.json");
  const [index] = await Promise.all([renderPersonInterests.index, loadPhotoMap()]);
  if (currentSubjectKey !== key) return;
  const lname = String(name || "").trim().toLowerCase();
  const pid = personId || photoMap?.[lname] || null;
  const id = pid && index?.people?.[pid] ? pid : index?._by_name?.[lname];
  if (!id || !/^[\w-]+$/.test(id)) { slot.remove(); return; }
  const data = await getJSON(`/interests/${encodeURIComponent(id)}.json`);
  if (currentSubjectKey !== key) return;
  if (!data?.total || !data.buckets) { slot.remove(); return; }

  const LABELS = {
    shareholdings: "Shareholdings", real_estate: "Real estate", trusts: "Trusts",
    directorships: "Directorships", gifts: "Gifts", travel: "Sponsored travel and hospitality",
    memberships: "Memberships and offices", liabilities: "Liabilities",
    other: "Other (savings, income, assets, partnerships)",
  };
  const HOLDER = { self: "Self", spouse: "Spouse", children: "Dependent" };
  const REGISTER = {
    house: "Register of Members' Interests", senate: "Register of Senators' Interests",
    qld_la: "Queensland Register of Members' Interests",
  };
  const ordinal = (n) => `${n}${["th", "st", "nd", "rd"][(n % 100 > 10 && n % 100 < 14) ? 0 : (n % 10 < 4 ? n % 10 : 0)]}`;
  const num = (n) => (Number(n) || 0).toLocaleString();
  const base = safeUrl(data.source_url);
  const buckets = Object.keys(LABELS).filter((b) => data.buckets[b]?.count > 0);
  const hasHolders = buckets.some((b) => (data.buckets[b].items || []).some((it) => HOLDER[it.holder]));

  const itemHTML = (it) => {
    const src = safeUrl(it.url) || base;
    const meta = [
      it.kind === "addition" ? `added ${esc(fmtDate(it.date) || "later")}` : "",
      it.kind === "deletion" ? `deleted ${esc(fmtDate(it.date) || "later")}` : "",
      it.ocr ? "machine-read from a scan" : "",
      src ? `<a href="${esc(it.page ? `${src}#page=${Number(it.page) || 1}` : src)}" rel="noopener" target="_blank">${it.page ? `page ${esc(String(Number(it.page)))}` : "source"} ↗</a>` : "",
    ].filter(Boolean).join(" · ");
    return `<li class="interests-item${it.kind === "deletion" ? " interests-deleted" : ""}">
      ${hasHolders ? `<span class="interests-holder">${esc(HOLDER[it.holder] || "")}</span>` : ""}
      <span class="interests-desc">${esc(it.description || "")}</span>
      ${meta ? `<span class="result-meta">${meta}</span>` : ""}</li>`;
  };
  const rows = buckets.map((b) => {
    const { count, items = [] } = data.buckets[b];
    return `<li><details class="chat-sources interests-bucket">
      <summary>${esc(LABELS[b])}<span class="interests-count">${num(count)}</span></summary>
      <ol class="source-list interests-items${hasHolders ? " interests-holders" : ""}">${items.map(itemHTML).join("")}</ol>
      ${count > items.length ? `<p class="fineprint">Showing ${num(items.length)} of ${num(count)} entries; the full list is in the register.</p>` : ""}
    </details></li>`;
  }).join("");

  const added = Number(data.alterations?.added) || 0;
  const deleted = Number(data.alterations?.deleted) || 0;
  const since = data.statement_date ? `since the statement of ${esc(fmtDate(data.statement_date))}` : "since the statement";
  const alterations = added || deleted
    ? `+${num(added)} addition${added === 1 ? "" : "s"}, -${num(deleted)} deletion${deleted === 1 ? "" : "s"} ${since}`
    : `no alterations notified ${since}`;
  const register = `${REGISTER[data.chamber] || "Register of interests"}${data.parliament ? `, ${ordinal(Number(data.parliament))} Parliament` : ""}${data.as_at ? `, as at ${esc(fmtDate(data.as_at))}` : ""}`;
  slot.innerHTML = `
    <p class="kicker">Declared interests</p>
    <p class="interests-summary"><b>${num(data.total)}</b> ${data.total === 1 ? "entry" : "entries"} across ${num(buckets.length)} ${buckets.length === 1 ? "category" : "categories"} · ${alterations}</p>
    <ul class="subject-list interests-list" role="list">${rows}</ul>
    <p class="fineprint">${esc(register)}; entries as declared, not verified by OPAX. One entry is one cell of the form, so a list typed in one cell counts once.${base ? ` <a href="${esc(base)}" rel="noopener" target="_blank">Open the register entry ↗</a>` : ""}</p>
    ${data.ocr_rows > 0 ? `<p class="fineprint">${num(data.ocr_rows)} ${data.ocr_rows === 1 ? "entry comes" : "entries come"} from scanned pages and may contain recognition errors.</p>` : ""}
    ${data.unread_pages > 0 ? `<p class="fineprint">${num(data.unread_pages)} ${data.unread_pages === 1 ? "page" : "pages"} of the source could not be read by machine; the register itself is complete.</p>` : ""}`;
  $("subject-infobox")?.querySelector("dl")?.insertAdjacentHTML("beforeend",
    `<dt>Declared interests</dt><dd>${num(data.total)} ${data.total === 1 ? "entry" : "entries"}</dd>`);
}

function normName(x) {
  return String(x || "").toLowerCase().replace(/[^a-z0-9]+/g, " ")
    .replace(/\b(pty|ltd|limited|the|inc|co|holdings)\b/g, "").replace(/\s+/g, " ").trim();
}

function findMoneyNode(kind, name) {
  if (!moneyData) return null;
  const nn = normName(name);
  let best = null;
  for (const n of moneyData.nodes) {
    if (kind && n.kind !== kind) continue;
    const c = normName(n.label);
    if (c === nn) return n;
    if (!best && nn && (c.startsWith(nn) || nn.startsWith(c))) best = n;
  }
  return best;
}

function subjectSkeleton(kindLabel, name, tagHTML) {
  return `
    <p class="kicker">${esc(kindLabel)}</p>
    <div class="subject-head">
      <h2 id="subject-title" tabindex="-1">${esc(name)}</h2>
      <p class="subject-tag">${tagHTML}</p>
    </div>
    <div class="subject-grid">
      <div class="subject-main" id="subject-main">
        <div class="subject-map" id="subject-map" hidden></div>
        <p class="fineprint" id="subject-map-hint" hidden>Drag to spin · click any bubble to jump to it ·
          <a href="#/money">open the full map</a></p>
        <div id="subject-sections"></div>
      </div>
      <aside class="infobox" id="subject-infobox"></aside>
    </div>`;
}

function infoboxHTML(rows, funfact, actions) {
  return `<p class="kicker" style="margin-top:0">Quick facts</p>
    <dl>${rows.filter(Boolean).map(([k, v]) => `<dt>${esc(k)}</dt><dd>${v}</dd>`).join("")}</dl>
    ${funfact ? `<div class="funfact">${funfact}</div>` : ""}
    <div class="actions">${actions.join("")}</div>`;
}

async function mountSubjectMap(nodeId) {
  const key = currentSubjectKey;
  const el = $("subject-map");
  if (!el) return;
  el.hidden = false;
  $("subject-map-hint").hidden = false;
  try {
    const { mountMoneyMap } = await import("/money-map.js");
    if (currentSubjectKey !== key) return; // navigated away while loading
    destroySubjectMap();
    const handle = await mountMoneyMap(el, "/graph/money.json", {
      focus: nodeId,
      chrome: "mini",
      askUrl: (industry) => askHash(`What has parliament said about ${industry.replace(/_/g, " ")}?`),
      onSelect: (node) => {
        if (!node || node.id === nodeId) return;
        location.hash = subjectHash(node.kind === "party" ? "party" : "donor", node.label);
      },
    });
    if (currentSubjectKey !== key) { handle.destroy?.(); return; } // navigated away while mounting
    subjectMapHandle = handle;
    subjectMapHandle.select?.(nodeId);
  } catch {
    el.innerHTML = `<p class="status" style="padding:1rem">The map could not load here. <a href="/map">Open the full map</a>.</p>`;
  }
}


/** "In the news" on subject pages: live headlines mentioning the subject,
 *  matched on significant name tokens, plus outlet searches for the rest. */
async function subjectNews(name, container) {
  const key = currentSubjectKey;
  const tokens = String(name).split(/\s+/)
    .filter((w) => w.length >= 4 && !/^(party|australia|australian|limited|pty|ltd|holdings|the)$/i.test(w));
  let items = [];
  try {
    const data = await api("/api/news");
    items = (data.items || []).filter((i) =>
      tokens.some((t) => new RegExp(`\\b${t.replace(/[.*+?^${}()|[\\]\\\\]/g, "\\\\$&")}`, "i").test(i.title)));
  } catch { /* outlet links still render */ }
  if (currentSubjectKey !== key) return;
  const q = encodeURIComponent(name);
  const srcName = { ABC: "ABC News", Guardian: "The Guardian" };
  const list = items.slice(0, 4).map((i) => `
    <li><a class="news-headline" href="${esc(safeUrl(i.url) || "#")}" rel="noopener" target="_blank">${esc(i.title)} ↗</a>
      <span class="news-meta"><span class="news-source">${esc(srcName[i.source] || i.source || "")}</span>${i.published ? ` · ${esc(relTime(i.published))}` : ""}</span></li>`).join("");
  container.insertAdjacentHTML("beforeend", `
    <p class="kicker">In the news</p>
    ${list ? `<ol class="news-list" role="list">${list}</ol>` : `<p class="status" style="margin-top:0.2rem">Nothing in today's politics headlines mentions them.</p>`}
    <p class="fineprint">Search the outlets:
      <a href="https://www.abc.net.au/news/search?query=${q}" rel="noopener" target="_blank">ABC News ↗</a> ·
      <a href="https://www.theguardian.com/australia-news?query=${q}#search" rel="noopener" target="_blank">The Guardian ↗</a></p>`);
}

async function subjectMentions(name, container, heading) {
  try {
    const data = await api(`/api/search?${new URLSearchParams({ q: `"${name}"`, top_k: "6" })}`);
    if (!data.results?.length) return;
    const items = data.results.slice(0, 5).map((r) => `
      <li><a href="#/doc/${esc(r.slug)}" class="source-title">${esc(r.title)}</a>
        <span class="result-meta">${metaHTML(r)}</span>
        <p class="snippet">${esc((r.snippet || "").slice(0, 220))}</p></li>`).join("");
    container.insertAdjacentHTML("beforeend",
      `<p class="kicker">${esc(heading)}</p><ul class="subject-list" role="list">${items}</ul>
       <p class="fineprint"><a href="${esc(searchHash(`"${name}"`, {}))}">All mentions in the record</a></p>`);
  } catch { /* mentions are a bonus, not a dependency */ }
}

function weeklyFunFact(node) {
  const years = Math.max((node.lastYear || 0) - (node.firstYear || 0) + 1, 1);
  const perWeek = node.total / (years * 52);
  if (!isFinite(perWeek) || perWeek < 1) return "";
  return `That works out to about <b>${fmtMoney(Math.round(perWeek))}</b> every single week for
    ${years} year${years > 1 ? "s" : ""}, all from published AEC disclosures.`;
}

/**
 * "Also disclosed to state commissions" on a donor page: one hairline row per
 * state file the donor appears in (exact match after normalising case and
 * company suffixes), linking to that jurisdiction's map. A placeholder keeps
 * the section's place under the money flows while the files load. State and
 * federal figures sit side by side and are never added together.
 */
async function renderDonorStateMoney(name, sections) {
  const key = currentSubjectKey;
  const slot = document.createElement("div");
  slot.className = "state-money";
  sections.appendChild(slot);
  const jurs = Object.keys(MONEY_JURISDICTIONS).filter((j) => j !== "federal");
  const files = await Promise.all(jurs.map((j) => loadMoneyFile(j)));
  if (currentSubjectKey !== key) return;
  const nn = normName(name);
  const hits = [];
  jurs.forEach((jur, i) => {
    const data = files[i];
    if (!data?.nodes || !nn) return;
    const node = data.nodes.find((n) => n.kind === "donor" && normName(n.label) === nn);
    if (!node) return;
    const parties = (data.edges || []).filter((e) => e.source === node.id)
      .sort((a, b) => (b.total || 0) - (a.total || 0))
      .map((e) => String(e.target).replace(/^party:/, ""));
    hits.push({ jur, node, meta: data.meta || {}, parties });
  });
  if (!hits.length) { slot.remove(); return; }
  const items = hits.map(({ jur, node, meta, parties }) => {
    const years = node.firstYear === node.lastYear ? String(node.firstYear) : `${node.firstYear}–${node.lastYear}`;
    const detail = [
      `${fmtMoney(node.total || 0)} across ${(node.count || 0).toLocaleString()} disclosed gifts`,
      years,
      meta.sourceShort || "",
      parties.length ? `to ${parties.join(", ")}` : "",
    ].filter(Boolean).join(" · ");
    return `<li><a class="source-title" href="${esc(moneyHash(jur))}">${esc(meta.jurisdictionLabel || MONEY_JURISDICTIONS[jur].label)}</a>
      <span class="result-meta">${esc(detail)}</span></li>`;
  }).join("");
  const commissions = [...new Set(hits.map((h) => h.meta.commission).filter(Boolean))];
  slot.innerHTML = `
    <p class="kicker">Also disclosed to state commissions</p>
    <ul class="subject-list" role="list">${items}</ul>
    <p class="fineprint">Source: ${esc(commissions.join("; "))}. Gifts under each state's disclosure
      threshold are not reported, so these totals are a floor, not a ceiling. ${esc(STATE_NOT_SUMMED)}</p>`;
}

// --- parliamentary expenses (IPEA) ------------------------------------------
// Per-person totals, category split, per-year series and the five largest
// lines, exported by scripts/export_expenses.py from the IPEA quarterly
// reports and served static. Keyed by person_id, with a name index for the
// people who have no portrait entry; fetched only when a person page opens.
let expensesData = null;
let expensesPromise = null;
function loadExpenses() {
  expensesPromise ??= fetch("/expenses.json")
    .then((r) => (r.ok ? r.json() : null)).then((d) => (expensesData = d)).catch(() => null);
  return expensesPromise;
}

const IPEA_NOTE =
  "Independent Parliamentary Expenses Authority quarterly reports, CC BY 4.0. Figures are as " +
  "published; IPEA corrects prior quarters, so treat totals as indicative.";

/** "Parliamentary expenses" on a person page plus the infobox quick fact.
 *  Silent when the person has no IPEA entry (state MPs, pre-2017 members). */
async function renderPersonExpenses(name, personId, sections) {
  const key = currentSubjectKey;
  await Promise.all([loadExpenses(), loadPhotoMap()]);
  if (currentSubjectKey !== key || !expensesData?.people) return;
  const nameKey = String(name || "").trim().toLowerCase();
  const pid = personId || photoMap?.[nameKey] || expensesData.names?.[nameKey];
  const e = pid && expensesData.people[pid];
  if (!e) return;
  const fmtDollars = (n) => `$${Math.round(n).toLocaleString()}`;
  const span = e.from === e.to ? `in ${e.from}` : `${e.from} to ${e.to}`;
  const lines = Number(e.lines || 0);
  const items = (e.top || []).map((t) => `
    <li class="barrow" style="grid-template-columns:auto minmax(0,1fr) auto">
      <span class="barrow-value">${esc(fmtDate(t.date))}</span>
      <span class="barrow-name" title="${esc(t.description ? `${t.category}: ${t.description}` : t.category)}">${esc(t.category)}${t.description ? ` · ${esc(t.description)}` : ""}</span>
      <b class="barrow-value">${esc(fmtDollars(t.amount))}</b>
    </li>`).join("");
  const src = safeUrl(expensesData.meta?.source_url);
  sections.insertAdjacentHTML("beforeend", `
    <p class="kicker">Parliamentary expenses</p>
    <p style="margin:0.2rem 0 0.6rem"><b>${esc(fmtMoney(e.total))}</b> claimed, ${esc(span)},
      across ${lines.toLocaleString()} published line${lines === 1 ? "" : "s"}.</p>
    ${e.by_category?.length ? barList(e.by_category, { fmt: fmtMoney, heading: "By category" }) : ""}
    ${e.by_year?.length > 1 ? columnChart(e.by_year, {
      fmt: fmtMoney, heading: "Claimed per year",
      note: "Summed by reporting quarter. IPEA data starts in April 2017 and runs to the latest published quarter, so the first and last years can be partial.",
    }) : ""}
    ${items ? `<figure class="chart"><figcaption>Five largest line items</figcaption>
      <ul class="subject-list" role="list" style="margin:0">${items}</ul></figure>` : ""}
    <p class="fineprint">${esc(IPEA_NOTE)}${src ? ` <a href="${esc(src)}" rel="noopener" target="_blank">Latest quarter on data.gov.au ↗</a>` : ""}</p>`);
  $("subject-infobox")?.querySelector("dl")?.insertAdjacentHTML("beforeend",
    `<dt>Claimed expenses</dt><dd><b>${esc(fmtMoney(e.total))}</b></dd>`);
}

// --- access: the money <-> access join ---------------------------------------
// scripts/export_access.py joins the money map's 250 donors to the NSW and QLD
// ministerial diary disclosures and the six lobbyist registers, and summarises
// each minister's disclosed diary. One static file, fetched by the first donor
// or minister page that needs it.

let accessData = null;
let accessPromise = null;
const ACCESS_JUR = { federal: "Federal", nsw: "NSW", qld: "QLD", vic: "VIC", sa: "SA", wa: "WA" };

/** Donor page "Access": the ministers who met them and the lobbyists registered
 *  to act for them. A placeholder keeps the section's place while access.json
 *  loads; a donor that matches nothing gets no section at all. */
async function renderDonorAccess(label, container) {
  const key = currentSubjectKey;
  container.insertAdjacentHTML("beforeend", `<div id="subject-access"></div>`);
  accessPromise ??= fetch("/access.json").then((r) => (r.ok ? r.json() : null)).then((d) => (accessData = d)).catch(() => null);
  const acc = await accessPromise;
  if (currentSubjectKey !== key) return;
  const slot = $("subject-access");
  if (!slot) return;
  const d = acc?.donors?.[label];
  if (!d) { slot.remove(); return; }
  const jur = (j) => ACCESS_JUR[j] || String(j || "").toUpperCase();
  const meta = (safeText) => `<span style="color:var(--ink-faint);font-size:0.8125rem"> · ${safeText}</span>`;
  const meetings = d.meetings || [];
  const firms = d.lobbyists || [];
  const total = d.meetings_total || 0;
  const kicker = meetings.length && firms.length ? "Who they met and who lobbies for them"
    : meetings.length ? "Who they met" : "Who lobbies for them";
  let html = `<p class="kicker">${esc(kicker)}</p>`;
  if (meetings.length) {
    html += `<ul class="subject-list" role="list">${meetings.map((m) => `
      <li>${m.page
        ? `<a class="source-title" href="${esc(subjectHash("person", m.page))}">${esc(m.minister)}</a>`
        : `<span class="source-title">${esc(m.minister)}</span>`}${meta(esc(jur(m.jurisdiction)) + (m.date ? ` · ${esc(fmtDate(m.date))}` : ""))}
        ${m.purpose ? `<p class="snippet" style="margin-top:0.15rem">${esc(m.purpose)}</p>` : ""}</li>`).join("")}</ul>
      <p class="fineprint" style="margin-top:0.5rem"><b>${total.toLocaleString()}</b> disclosed meeting${total === 1 ? "" : "s"}${total > meetings.length ? `, newest ${meetings.length} shown` : ""}.</p>`;
  }
  if (firms.length) {
    html += `<p class="kicker" style="margin-top:1.1rem">Registered lobbying client of</p>
      <ul class="subject-list" role="list">${firms.map((f) => `
      <li><span class="source-title">${esc(f.firm)}</span>${meta(esc(f.jurisdiction) + (f.registered ? ` · from ${esc(fmtDate(f.registered))}` : "") + (f.ceased ? " · ceased" : ""))}</li>`).join("")}</ul>
      ${(d.lobbyists_total || 0) > firms.length ? `<p class="fineprint" style="margin-top:0.5rem">${d.lobbyists_total} registered firms, ${firms.length} shown.</p>` : ""}`;
  }
  html += `<p class="fineprint">From NSW and QLD ministerial diary disclosures and the six lobbyist registers;
    name matching is exact after normalisation, so a company using several trading names may be under-counted.</p>`;
  slot.innerHTML = html;
}

/** Person page "Ministerial diary" for NSW and QLD ministers in access.json.
 *  Bare-surname keys (QLD Hansard speakers) and alias hits only count when the
 *  page's chamber matches the diary's jurisdiction, so a namesake in another
 *  parliament never inherits a minister's meetings. */
async function renderPersonDiary(name, container, chambers) {
  const key = currentSubjectKey;
  container.insertAdjacentHTML("beforeend", `<div id="subject-diary"></div>`);
  accessPromise ??= fetch("/access.json").then((r) => (r.ok ? r.json() : null)).then((d) => (accessData = d)).catch(() => null);
  const acc = await accessPromise;
  if (currentSubjectKey !== key) return;
  const slot = $("subject-diary");
  if (!slot) return;
  const nn = normName(name);
  const mkey = acc?.ministers?.[nn] ? nn : acc?.aliases?.[nn];
  const m = mkey ? acc.ministers[mkey] : null;
  const states = (chambers || []).map((c) => String(c).toLowerCase());
  if (!m || ((m.surname_key || mkey !== nn) && !states.includes(m.jurisdiction))) { slot.remove(); return; }
  await loadMoneyData();
  if (currentSubjectKey !== key) return;
  const linkTo = (org) => {
    const node = findMoneyNode("donor", org);
    return node && normName(node.label) === normName(org) ? subjectHash("donor", node.label) : searchHash(`"${org}"`, {});
  };
  const recent = (m.recent || []).map((r) => `
    <li><span class="source-title">${esc(r.org)}</span><span style="color:var(--ink-faint);font-size:0.8125rem"> · ${esc(fmtDate(r.date))}</span>
      ${r.purpose ? `<p class="snippet" style="margin-top:0.15rem">${esc(r.purpose)}</p>` : ""}</li>`).join("");
  const scheme = m.jurisdiction === "qld"
    ? `From the Queensland Government's monthly ministerial diary disclosures, published for ${esc(m.name)}.`
    : "From the NSW Cabinet Office's quarterly ministers' diary disclosures. NSW diaries are published by office, so meetings are attributed to the minister holding that office on the date.";
  slot.innerHTML = `
    <p class="kicker">Ministerial diary</p>
    <div class="tiles">
      ${tile((m.meetings_total || 0).toLocaleString(), "disclosed meetings")}
      ${tile((m.external_total || 0).toLocaleString(), "with people and organisations outside government")}
    </div>
    ${m.by_org?.length ? barList(m.by_org, { heading: "Most-met organisations", linkTo }) : ""}
    ${recent ? `<p class="kicker" style="margin-top:1.1rem">Recent meetings</p><ul class="subject-list" role="list">${recent}</ul>` : ""}
    <p class="fineprint">${scheme} Staff, cabinet, departmental and other government meetings are counted
      but left out of the lists. Organisation names link to a donor's entry where the name matches an AEC donor
      exactly, otherwise to the record.${m.latest_pdf ? ` <a href="${esc(safeUrl(m.latest_pdf) || "#")}" rel="noopener" target="_blank">Latest diary (PDF) ↗</a>` : ""}</p>`;
}

// --- voting record on person pages -------------------------------------------
// Reads the static votes.json (scripts/export_votes.py): federal divisions via
// TheyVoteForYou keyed by TVFY person id, state divisions from the Hansard
// sample keyed "{jurisdiction}:{slug}", plus a `_names` index so a page with no
// portrait id still finds its records. Lazy: fetched on first use, never at boot.

/** "Voting record" section: counts, the bill questions backed and opposed (up to
 *  six each, newest first, tagged by jurisdiction), and the provenance fineprint.
 *  A placeholder holds the section's place while votes.json loads. */
async function renderPersonVotes(name, personId, sections) {
  const key = currentSubjectKey;
  sections.insertAdjacentHTML("beforeend", `<div id="subject-votes"></div>`);
  await Promise.all([loadPhotoMap(), loadVotes()]);
  if (currentSubjectKey !== key) return;
  const slot = $("subject-votes");
  if (!slot) return;
  const lname = String(name || "").trim().toLowerCase();
  const keys = [...new Set([personId, photoMap?.[lname], ...(votesData?._names?.[lname] || [])].filter(Boolean))];
  const recs = keys.map((k) => votesData?.[k]).filter((r) => r && typeof r === "object");
  if (!recs.length) { slot.remove(); return; }
  const sum = (field) => recs.reduce((a, r) => a + (Number(r[field]) || 0), 0);
  const years = recs.flatMap((r) => (Array.isArray(r.years) ? r.years : [])).map(Number).filter(Number.isFinite);
  const jurs = [...new Set(recs.map((r) => r.jurisdiction).filter(Boolean))];
  const jurName = (j) => STATE_NAMES[j] || String(j || "").toUpperCase();
  const jurChip = (j) => `<span class="party party-oth" style="--pc:var(--bronze)"><i aria-hidden="true"></i>${esc(jurName(j))}</span>`;
  const side = (field) => recs
    .flatMap((r) => (Array.isArray(r[field]) ? r[field] : []).map((d) => ({ ...d, jur: d.jur || r.jurisdiction })))
    .sort((a, b) => String(b.date || "").localeCompare(String(a.date || ""))).slice(0, 6);
  const billRow = (d) => `
        <li><a class="source-title" href="${esc(searchHash(`"${d.name}"`, {}))}">${esc(d.name)}</a>
          <span class="result-meta">${[d.stage ? esc(d.stage) : "", esc(String(d.date || "").slice(0, 4)), jurChip(d.jur)].filter(Boolean).join(" · ")}</span></li>`;
  const col = (label, rows) => rows.length ? `
    <div>
      <p class="kicker votes-col-kicker">${esc(label)}</p>
      <ul class="subject-list" role="list">${rows.map(billRow).join("")}</ul>
    </div>` : "";
  const forRows = side("for");
  const againstRows = side("against");
  const total = sum("divisions_total");
  const ayes = sum("ayes");
  const noes = sum("noes");
  const ayePct = ayes + noes ? Math.round((ayes / (ayes + noes)) * 100) : 0;
  const span = years.length ? `${esc(String(Math.min(...years)))} to ${esc(String(Math.max(...years)))}` : "";
  const where = jurs.length ? `${esc(jurs.map(jurName).join(" and "))} parliament${jurs.length > 1 ? "s" : ""}` : "";
  const federal = recs.some((r) => r.jurisdiction === "federal");
  const tvfy = federal
    ? actionBtn("external", `https://theyvoteforyou.org.au/search?query=${encodeURIComponent(name)}`, "Full record on They Vote For You", { external: true })
    : "";
  slot.innerHTML = `
    <p class="kicker">Voting record</p>
    <div class="tiles tiles-compact votes-tiles">
      <div class="tile"><b>${esc(total.toLocaleString())}</b><span>recorded division${total === 1 ? "" : "s"}</span></div>
      <div class="tile"><b>${esc(ayes.toLocaleString())}</b><span>ayes</span></div>
      <div class="tile"><b>${esc(noes.toLocaleString())}</b><span>noes</span></div>
    </div>
    ${ayes + noes ? `<div class="votes-split" role="img" aria-label="${esc(ayePct)} percent ayes, ${esc(100 - ayePct)} percent noes"><i style="width:${ayePct}%"></i></div>
    <p class="fineprint votes-lede">${esc(ayePct)}% ayes${where ? ` in the ${where}` : ""}${span ? `, ${span}` : ""}. Only formal divisions are counted; most questions are decided on the voices and leave no per-member record.</p>` : ""}
    ${forRows.length || againstRows.length
      ? `<div class="votes-cols">${col("Voted for", forRows)}${col("Voted against", againstRows)}</div>`
      : `<p class="status" style="margin-top:0.6rem">None of their recorded divisions was a vote on a bill itself.</p>`}
    <details class="chat-sources votes-method">
      <summary>How votes are counted</summary>
      <p class="fineprint">"Voted for" and "Voted against" list divisions on the bill itself: a second or third reading, or agreeing
        to the bill. Amendments, gag motions and other procedural votes are left out because an aye there says nothing about
        the bill. A bill missing here was not necessarily unvoted on. Sources: They Vote For You (federal divisions,
        OpenAustralia Foundation, ODbL) and the NSW, Victorian and Queensland Hansard for state divisions. Each bill name
        searches the record for what was said about it.</p>
    </details>
    ${tvfy ? `<p class="action-row">${tvfy}</p>` : ""}`;
}

async function openSubject(kind, name, manageFocus) {
  const key = `${kind}:${name}`;
  if (currentSubjectKey === key) { if (manageFocus) $("subject-title")?.focus(); return; }
  currentSubjectKey = key;
  destroySubjectMap();
  const body = $("subject-body");
  body.innerHTML = subjectSkeleton(
    kind === "person" ? "Parliamentarian" : kind === "party" ? "Political party" : "Donor",
    name, `<span class="status" style="margin:0">Opening the entry…</span>`);
  if (manageFocus) $("subject-title")?.focus();

  if (kind === "donor" || kind === "party") {
    await loadMoneyData();
    if (currentSubjectKey !== key) return;
    const node = findMoneyNode(kind, name);
    const sections = $("subject-sections");
    const box = $("subject-infobox");
    if (!node) {
      body.querySelector(".subject-tag").innerHTML =
        `<span>Not among the top 250 disclosed donors in the money data. The record may still mention them.</span>`;
      box.innerHTML = infoboxHTML(
        [["Type", kind === "party" ? "Political party" : "Organisation"]], "",
        [actionBtn("search", searchHash(`"${name}"`, {}), "Search the record for them", { primary: true }),
         actionBtn("map", "#/money", "Open the money map"),
         actionBtn("external", webSearchUrl(name), "Search the web", { external: true })]);
      if (kind === "donor") renderDonorStateMoney(name, sections);
      subjectMentions(name, sections, "In parliament");
      return;
    }
    const donors = moneyData.nodes.filter((n) => n.kind === node.kind);
    const rank = donors.sort((a, b) => (b.total || 0) - (a.total || 0)).findIndex((n) => n.id === node.id) + 1;
    const isParty = node.kind === "party";
    const flows = moneyData.edges.filter((e) => (isParty ? e.target : e.source) === node.id);
    const counter = new Map();
    for (const e of flows) {
      const other = String(isParty ? e.source : e.target).replace(/^(donor|party):/, "");
      const label = (moneyData.nodes.find((n) => n.id === (isParty ? e.source : e.target)) || {}).label || other;
      counter.set(label, (counter.get(label) || 0) + (e.total || 0));
    }
    const flowRows = [...counter.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10);
    body.querySelector(".subject-tag").innerHTML = [
      isParty ? partyChipHTML(node.label) : `<span class="party party-oth"><i aria-hidden="true"></i>${esc(industryLabel(node.industry || ""))}</span>`,
      `<span class="subject-active"><svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true"><circle cx="10" cy="10" r="7"/><path d="M10 6v4l2.8 1.8"/></svg>Active ${node.firstYear}–${node.lastYear}</span>`,
    ].join(" · ");
    box.innerHTML = infoboxHTML([
      ["Type", isParty ? "Political party" : "Organisation / donor"],
      !isParty && ["Industry", esc(industryLabel(node.industry || ""))],
      [isParty ? "Received (disclosed)" : "Given (disclosed)", `<b>${fmtMoney(node.total || 0)}</b>`],
      ["Donations counted", (node.count || 0).toLocaleString()],
      ["Active years", `${node.firstYear}–${node.lastYear}`],
      ["Rank", `#${rank} of ${donors.length} ${isParty ? "parties" : "disclosed donors"}`],
    ], weeklyFunFact(node), [
      actionBtn("ask",
        askHash(isParty
          ? `What has parliament said about the ${node.label}?`
          : ["individual", "other", ""].includes(String(node.industry || "").toLowerCase())
            ? `What has parliament said about ${node.label}?`
            : `What has parliament said about ${industryLabel(node.industry)}?`),
        `Ask what parliament said about ${isParty ? "them" : (["individual", "other", ""].includes(String(node.industry || "").toLowerCase()) ? "this donor" : "this industry")}`, { primary: true }),
      actionBtn("search", searchHash(`"${node.label}"`, {}), "Search mentions in the record"),
      actionBtn("download", "/graph/money.json", "Download the data"),
      actionBtn("external", webSearchUrl(node.label), "Search the web", { external: true }),
    ]);
    sections.insertAdjacentHTML("beforeend", barList(flowRows, {
      fmt: fmtMoney,
      heading: isParty ? "Where it came from" : "Where the money went",
      linkTo: (nm) => subjectHash(isParty ? "donor" : "party", nm),
      partyDots: !isParty, // donor page rows are parties; party page rows are donors
    }));
    sections.insertAdjacentHTML("beforeend",
      `<p class="fineprint">${esc(AEC_NOTE)}</p>`);
    if (!isParty) renderDonorStateMoney(node.label, sections);
    renderDonorAccess(node.label, sections);
    await subjectMentions(node.label, sections, "In parliament");
    subjectNews(node.label, sections);
    mountSubjectMap(node.id);
    return;
  }

  // person
  const sections = $("subject-sections");
  const box = $("subject-infobox");
  loadPhotoMap().then(() => {
    if (currentSubjectKey !== key) return;
    const url = photoUrlFor(name);
    if (url) $("subject-title")?.insertAdjacentHTML("beforebegin",
      `<img class="subject-portrait" src="${esc(url)}" alt="Official portrait of ${esc(name)}" width="112" height="112">`);
  });
  let speeches = [];
  try {
    const data = await api(`/api/search?${new URLSearchParams({ q: name, speaker: name, top_k: "20" })}`);
    speeches = data.results || [];
  } catch { /* fall through to the empty state */ }
  if (currentSubjectKey !== key) return;
  const partyCount = new Map();
  for (const r of speeches) if (r.party) partyCount.set(r.party, (partyCount.get(r.party) || 0) + 1);
  const party = [...partyCount.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] || null;
  const dates = speeches.map((r) => r.date).filter(Boolean).sort();
  const chambers = [...new Set(speeches.map((r) => STATE_NAMES[r.state] || r.state).filter(Boolean))];
  body.querySelector(".subject-tag").innerHTML = [
    party ? partyChipHTML(party) : "",
    chambers.length ? `<span>${esc(chambers.join(" · "))} parliament</span>` : "",
  ].filter(Boolean).join(" · ") || "<span>From the parliamentary record</span>";
  const q = encodeURIComponent(name);
  box.innerHTML = infoboxHTML([
    ["Type", "Parliamentarian"],
    party && ["Party", partyChipHTML(party)],
    chambers.length && ["Parliament", esc(chambers.join(", "))],
    dates.length && ["Indexed speeches span", `${esc(fmtDate(dates[0]))} – ${esc(fmtDate(dates[dates.length - 1]))}`],
  ], "", [
    actionBtn("speeches", searchHash("", { speaker: name }), "View all their speeches", { primary: true }),
    actionBtn("external", `https://theyvoteforyou.org.au/search?query=${q}`, "Voting record", { external: true }),
    actionBtn("external", `https://www.aph.gov.au/Senators_and_Members/Parliamentarian_Search_Results?q=${q}`, "Parliamentary profile", { external: true }),
    actionBtn("external", `https://en.wikipedia.org/w/index.php?search=${q}%20Australian%20politician`, "Wikipedia", { external: true }),
    actionBtn("external", webSearchUrl(name), "Search the web", { external: true }),
  ]);
  sections.insertAdjacentHTML("beforeend", `
    <form class="query-line" id="subject-ask-form" style="margin:0 0 0.4rem">
      <label class="visually-hidden" for="subject-ask-topic">Topic</label>
      <input id="subject-ask-topic" type="text" autocomplete="off"
             placeholder="Ask what ${esc(name)} said about…">
      <button type="submit" class="secondary">Ask</button>
    </form>`);
  $("subject-ask-form").addEventListener("submit", (e) => {
    e.preventDefault();
    const topic = $("subject-ask-topic").value.trim();
    if (topic) location.hash = askHash(`What did ${name} say about ${topic}?`);
  });
  // The structured record first; the speeches follow it.
  renderPersonVotes(name, photoMap?.[name.trim().toLowerCase()] ?? null, sections);
  if (speeches.length) {
    const newest = [...speeches].sort((a, b) => String(b.date || "").localeCompare(String(a.date || ""))).slice(0, 8);
    // On the person's own page the name and party are known, so each row
    // leads with the date and gives the debate title; when the title is only
    // "Name — date" the passage itself carries the row.
    const reName = new RegExp(`^${name.trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s+—\\s+`, "i");
    const debateOf = (r) => String(r.title || "").replace(reName, "")
      .replace(/\s+—\s+\d{4}-\d{2}-\d{2}\s*$/, "").replace(/^\d{4}-\d{2}-\d{2}\s*$/, "").trim();
    const multiHouse = chambers.length > 1;
    sections.insertAdjacentHTML("beforeend",
      `<p class="kicker">Latest indexed speeches</p><ul class="speech-rows" role="list">${newest.map((r) => {
        const debate = debateOf(r);
        const snip = String(r.snippet || "").trim();
        const where = multiHouse && r.state ? ` <span class="speech-where">${esc(STATE_NAMES[r.state] || r.state)}</span>` : "";
        // With a debate title the passage sits beneath it; without one the
        // passage itself is the row and the link.
        const body = debate
          ? `<a class="speech-debate" href="#/doc/${esc(r.slug)}">${esc(debate)}</a>${where}${snip ? `<p class="speech-snip">${esc(snip)}</p>` : ""}`
          : `<a class="speech-passage" href="#/doc/${esc(r.slug)}">${esc(snip || "Speech")}</a>${where}`;
        return `<li><time datetime="${esc(String(r.date || "").slice(0, 10))}">${esc(r.date ? fmtDate(r.date) : "")}</time>
          <div>${body}</div></li>`;
      }).join("")}</ul>
      <p class="fineprint">The corpus is still indexing: this is what has been loaded so far, not their full record.</p>`);
  } else {
    sections.insertAdjacentHTML("beforeend",
      `<p class="status">No speeches by “${esc(name)}” in the indexed corpus yet. Names appear as in
       Hansard, and the record is still loading. <a href="${esc(searchHash(name, {}))}">Search the record instead</a>.</p>`);
  }
  renderPersonInterests(name, null, sections);
  renderPersonDiary(name, sections, chambers);
  await subjectNews(name, sections);
  await renderPersonExpenses(name, photoMap?.[name.trim().toLowerCase()], sections);
  if (party) {
    await loadMoneyData();
    if (currentSubjectKey !== key) return;
    const pnode = findMoneyNode("party", party);
    if (pnode) {
      sections.insertAdjacentHTML("beforeend",
        `<p class="fineprint" style="margin-top:1rem">The money map starts from ${esc(party)}, the party this
         speaker's indexed speeches carry. In AEC disclosure data, money flows to parties, not individuals.</p>`);
      mountSubjectMap(pnode.id);
    }
  }
}

// --- topic entries (the encyclopedia's ideas wing) ---------------------------
// Every enrichment topic gets an entry: live label counts, the party split,
// the newest labelled speeches, the money pairing where an AEC donor industry
// maps onto the debate, and the standing report where one exists. The machine
// labelling pass is still running, so every count reads "so far", never as a
// corpus total.

/** How a topic reads mid-sentence ("What has parliament said about …?"). */
function topicPhrase(slug) {
  if (slug === "indigenous-affairs") return "Indigenous affairs";
  return (TOPICS[slug] || slug).toLowerCase().replace(/ & /g, " and ");
}

/** The donors pairing for a topic that maps onto an AEC donor industry. */
function topicMoneyHTML(ind) {
  const donors = (moneyData?.nodes || []).filter(
    (n) => n.kind === "donor" && (n.industry === ind || n.group === ind));
  if (!donors.length) return "";
  const total = donors.reduce((a, n) => a + (n.total || 0), 0);
  const donorRows = donors.sort((a, b) => (b.total || 0) - (a.total || 0)).slice(0, 6)
    .map((n) => [n.label, n.total || 0]);
  return `
    <p class="kicker">The money beside the words</p>
    <p style="margin:0.2rem 0 0.6rem">While parliament debated this, ${esc(industryLabel(ind))}
      interests disclosed <b>${esc(fmtMoney(total))}</b> in donations to political parties.</p>
    ${barList(donorRows, { fmt: fmtMoney, heading: `Largest ${industryLabel(ind)} donors`,
      linkTo: (nm) => subjectHash("donor", nm) })}
    <p class="fineprint">${esc(AEC_NOTE)} <a href="#/money">Explore on the money map</a></p>`;
}

async function openTopicPage(slug, manageFocus) {
  let newestHTML = ""; // built with the counts, rendered last on the page
  const key = `topic:${slug}`;
  if (currentSubjectKey === key) { if (manageFocus) $("subject-title")?.focus(); return; }
  currentSubjectKey = key;
  destroySubjectMap();
  const body = $("subject-body");
  const name = TOPICS[slug];
  if (!name) {
    body.innerHTML = `<p class="kicker">Topic</p>
      <p class="status">No topic called “${esc(slug)}” in the taxonomy.
      <a href="#/subject/topic">All topics</a></p>`;
    return;
  }
  body.innerHTML = subjectSkeleton("Topic", name, `<span id="subject-loader" class="subject-loader"></span>`);
  if (manageFocus) $("subject-title")?.focus();
  showPageLoader("subject-loader", "Counting the labelled record.");
  const sections = $("subject-sections");
  const box = $("subject-infobox");
  box.hidden = true; // fills once the counts land
  const phrase = topicPhrase(slug);
  const searchTopic = searchHash(phrase, { topic: slug });

  let data = null;
  try {
    [data] = await Promise.all([api(`/api/topic/${encodeURIComponent(slug)}`), loadReportsIndex()]);
  } catch { /* the ask and search actions below work without counts */ }
  if (currentSubjectKey !== key) return;
  const report = reportsIndex?.find((r) => r.slug === TOPIC_REPORT[slug]) || null;

  const count = data?.count ?? null;
  const labelled = data?.labelled ?? 0;
  clearPageLoader("subject-loader");
  body.querySelector(".subject-tag").innerHTML = count === null
    ? `<span>The live counts could not be loaded. The searches below still work.</span>`
    : `<span>${esc(count.toLocaleString())} speeches carry this label so far, of
       ${esc(labelled.toLocaleString())} labelled to date. The labelling pass is still running.</span>`;

  const share = count && labelled ? `${((count / labelled) * 100).toFixed(1)}%` : null;
  box.hidden = false;
  box.innerHTML = infoboxHTML([
    ["Type", "Topic"],
    count !== null && ["Labelled so far", `<b>${esc(count.toLocaleString())}</b> speeches`],
    share && ["Of labelled speeches", esc(share)],
    report && ["Standing report", `<a href="#/reports/${esc(report.slug)}">${esc(report.title)}</a>`],
  ], "", [
    actionBtn("ask", askHash(`What has parliament said about ${phrase}?`), "Ask what parliament said", { primary: true }),
    actionBtn("search", searchTopic, "Search this topic"),
    ...(report ? [actionBtn("speeches", `#/reports/${report.slug}`, `Read the ${report.title} report`)] : []),
  ]);

  if (data) {
    if (data.parties?.length) {
      sections.insertAdjacentHTML("beforeend", barList(data.parties.slice(0, 8), {
        heading: "Who speaks on it, by party (labelled so far)",
        fmt: (v) => Number(v).toLocaleString(),
        linkTo: (nm) => searchHash(phrase, { topic: slug, party: nm }),
        partyDots: true,
      }));
      sections.insertAdjacentHTML("beforeend",
        `<p class="fineprint">Party names open that party's labelled speeches on this topic.
         Some speeches carry no party label, so the bars can sum below the total.</p>`);
    }
    if (data.recent?.length) {
      newestHTML =
        `<p class="kicker">Newest in the index with this label</p>
         <ul class="subject-list" role="list">${data.recent.map((r) => `
           <li><a href="#/doc/${esc(r.slug)}" class="source-title">${esc(
               r.speaker && r.title.startsWith(`${r.speaker} — `) ? r.title.slice(r.speaker.length + 3) : r.title)}</a>
             <span class="result-meta">${metaHTML(r, { linkSpeaker: true })}</span></li>`).join("")}</ul>
         <p class="fineprint">The newest labelled speeches to enter the index, not the newest
         speeches on the subject. <a href="${esc(searchTopic)}">Search all of them</a></p>`;
    } else if (count !== null) {
      sections.insertAdjacentHTML("beforeend",
        `<p class="status">The labelling pass has not reached this debate yet.
         <a href="${esc(searchHash(phrase, {}))}">Search the record for ${esc(phrase)} instead</a>.</p>`);
    }
  }

  const moneyInd = detectMoneyIndustry(`who donates money to ${phrase}`);
  if (moneyInd) {
    await loadMoneyData();
    if (currentSubjectKey !== key) return;
    const html = topicMoneyHTML(moneyInd);
    if (html) sections.insertAdjacentHTML("beforeend", html);
  }

  // "The latest, in brief": the machine summaries of the newest labelled
  // speeches, stitched into a briefing under the sections above. The topic
  // endpoint serves no summaries, so each comes from its own /api/resource
  // fetch; speeches the summariser has not reached are skipped, and under
  // two summaries the section stays out entirely rather than stand as a stub.
  if ((data?.recent?.length ?? 0) >= 2) {
    const docs = await Promise.all(data.recent.slice(0, 5).map(async (r) => {
      try {
        const doc = await api(`/api/resource/${encodeURIComponent(r.slug)}`);
        return doc?.summary ? { ...r, summary: doc.summary } : null;
      } catch { return null; }
    }));
    if (currentSubjectKey !== key) return;
    const briefed = docs.filter(Boolean);
    if (briefed.length >= 2) {
      sections.insertAdjacentHTML("beforeend", `
        <div class="topic-digest">
          <p class="kicker">The latest, in brief</p>
          ${briefed.map((d) => `
            <div class="topic-digest-item">
              <a class="topic-digest-source" href="#/doc/${esc(d.slug)}">${partyDotHTML(d.party)}${esc(d.speaker || String(d.title || "").replace(/\s+—\s+\d{4}-\d{2}-\d{2}\s*$/, ""))}${d.date ? `, ${esc(fmtDate(d.date))}` : ""}</a>
              <p class="topic-digest-text">${inlineHTML(d.summary)}</p>
            </div>`).join("")}
          <p class="fineprint">Machine summaries of the newest speeches to enter the index
            with this label; each links to the full record.</p>
        </div>`);
    }
  }
  if (newestHTML && currentSubjectKey === key) sections.insertAdjacentHTML("beforeend", newestHTML);
}

async function openTopicsIndex(manageFocus) {
  const key = "topic:index";
  if (currentSubjectKey === key) { if (manageFocus) $("subject-title")?.focus(); return; }
  currentSubjectKey = key;
  destroySubjectMap();
  const body = $("subject-body");
  body.innerHTML = `
    <div class="subject-head">
      <h2 id="subject-title" tabindex="-1">Topics A-Z</h2>
      <p class="subject-tag"><span id="subject-loader" class="subject-loader"></span></p>
    </div>
    <div id="subject-sections"></div>`;
  if (manageFocus) $("subject-title")?.focus();
  showPageLoader("subject-loader", "Counting the labelled record.");
  let data = null;
  try { data = await api("/api/topics"); } catch { /* honest failure below */ }
  if (currentSubjectKey !== key) return;
  const tag = body.querySelector(".subject-tag");
  clearPageLoader("subject-loader");
  if (!data?.topics?.length) {
    tag.innerHTML = `<span>The live counts could not be loaded. Try again shortly.</span>`;
    return;
  }
  tag.innerHTML = `<span>${esc((data.labelled ?? 0).toLocaleString())} speeches carry topic labels
    so far. The labelling pass is still running, so every count below is a floor.</span>`;
  const known = data.topics.filter((t) => TOPICS[t.slug])
    .sort((a, b) => TOPICS[a.slug].localeCompare(TOPICS[b.slug]));
  const li = (t) => `<li><a href="${esc(subjectHash("topic", t.slug))}" class="source-title">${esc(TOPICS[t.slug])}</a>
    <span class="result-meta">${esc(t.count.toLocaleString())} labelled so far</span></li>`;
  const half = Math.ceil(known.length / 2);
  $("subject-sections").innerHTML = `
    <div class="split-list">
      <ul class="subject-list" role="list">${known.slice(0, half).map(li).join("")}</ul>
      <ul class="subject-list" role="list">${known.slice(half).map(li).join("")}</ul>
    </div>
    <p class="fineprint">A machine pass is labelling every speech in the corpus by subject;
    these counts are live and grow as it runs. A topic with few speeches yet is not a quiet
    debate, just one the pass has not reached.</p>`;
}

$("subject-back").addEventListener("click", () => {
  if (routeCount > 1) history.back();
  else location.hash = "#/";
});


// --- explore (time machine + quiz) ------------------------------------------
// Both are standalone lazy modules with a mount/destroy contract; the page
// only owns the toggle. Modules are mounted once and kept alive per session.

const explore = { tm: null, quiz: null, ledger: null, matrix: null, wd: null, tvn: null };

const GAMES = {
  tm: { dialog: "dialog-tm", body: "explore-tm", module: "/timemachine.js", mount: "mountTimeMachine" },
  quiz: { dialog: "dialog-quiz", body: "explore-quiz", module: "/quiz.js", mount: "mountQuiz" },
  ledger: { dialog: "dialog-ledger", body: "explore-ledger", module: "/ledger.js", mount: "mountLedger" },
  matrix: { dialog: "dialog-matrix", body: "explore-matrix", module: "/matrix.js", mount: "mountMatrix" },
  wd: { dialog: "dialog-wd", body: "explore-wd", module: "/wordsdollars.js", mount: "mountWordsDollars" },
  tvn: { dialog: "dialog-tvn", body: "explore-tvn", module: "/thenvsnow.js", mount: "mountThenVsNow" },
};

async function openGame(which) {
  const game = GAMES[which];
  if (!game) return;
  $(game.dialog).showModal();
  try {
    if (!explore[which]) {
      const mod = await import(game.module);
      explore[which] = mod[game.mount]($(game.body));
    }
  } catch (err) {
    $(game.body).innerHTML =
      `<p class="status">This could not load (${esc(String(err.message || err))}). Try again shortly.</p>`;
  }
}

$("explore-tm-btn").addEventListener("click", () => openGame("tm"));
$("explore-quiz-btn").addEventListener("click", () => openGame("quiz"));
$("explore-ledger-btn").addEventListener("click", () => openGame("ledger"));
$("explore-matrix-btn").addEventListener("click", () => openGame("matrix"));
$("explore-wd-btn").addEventListener("click", () => openGame("wd"));
$("explore-tvn-btn").addEventListener("click", () => openGame("tvn"));
for (const btn of document.querySelectorAll(".game-close")) {
  btn.addEventListener("click", () => $(btn.dataset.close).close());
}
// A click on the backdrop (outside the dialog's box) closes the game.
for (const dialog of document.querySelectorAll(".game-dialog")) {
  dialog.addEventListener("click", (e) => {
    const r = dialog.getBoundingClientRect();
    const inside = e.clientX >= r.left && e.clientX <= r.right &&
                   e.clientY >= r.top && e.clientY <= r.bottom;
    if (!inside) dialog.close();
  });
}


// --- the front page ----------------------------------------------------------
// A broadsheet front page over the live dataset: news that pivots into the
// record, today's numbers, a daily Money & Words topic, encyclopedia features,
// and the newest documents to enter the index. Everything renders
// progressively below the ask box; nothing blocks it.

let frontRendered = false;

function onIdle(fn) {
  (window.requestIdleCallback || ((f) => setTimeout(f, 1)))(fn);
}

function relTime(iso) {
  if (!iso) return "";
  // KB catalog timestamps carry no timezone suffix but are UTC.
  const d = new Date(/[zZ]|[+-]\d\d:?\d\d$/.test(iso) ? iso : iso + "Z");
  const mins = Math.round((Date.now() - d.getTime()) / 60000);
  if (mins < 2) return "moments ago";
  if (mins < 60) return mins === 1 ? "1 minute ago" : `${mins} minutes ago`;
  if (mins < 60 * 36) {
    const h = Math.round(mins / 60);
    return h === 1 ? "1 hour ago" : `${h} hours ago`;
  }
  return fmtDate(iso.slice(0, 10));
}

async function renderFrontNews() {
  const holder = $("front-news");
  try {
    const data = await api("/api/news");
    const items = (data.items || []).filter((i) => safeUrl(i.url)).slice(0, 6);
    if (!items.length) { $("mod-news").hidden = true; return; }
    const srcName = { ABC: "ABC News", Guardian: "The Guardian" };
    holder.innerHTML = `<ol class="news-list" role="list">${items.map((i) => {
      const topic = String(i.topic || "").trim();
      const pivots = topic ? `<span class="news-pivots">
          <a href="${esc(askHash(`What has parliament said about ${topic}?`))}">What does the record say?</a>
          <a href="${esc(searchHash(topic, {}))}">Search the speeches</a>
        </span>` : "";
      const when = relTime(i.published);
      return `<li>
        <a class="news-headline" href="${esc(safeUrl(i.url))}" rel="noopener" target="_blank">${esc(i.title)} ↗</a>
        <span class="news-meta"><span class="news-source">${esc(srcName[i.source] || i.source || "")}</span>${when ? ` · ${esc(when)}` : ""}</span>
        ${pivots}</li>`;
    }).join("")}</ol>
    <p class="fineprint">Headlines link to ABC News and The Guardian: their words, not ours.
    “What does the record say?” asks OPAX’s corpus of parliamentary speeches; the two are
    independent sources shown side by side.</p>`;
  } catch {
    $("mod-news").hidden = true;
  }
}

function renderFrontNumbers() {
  const holder = $("front-numbers");
  const aec = (corpusManifest?.sources || []).find((x) => x.name.startsWith("AEC donations"));
  const tiles = [
    [liveStats ? (liveStats.resources ?? 0).toLocaleString() : "—", "documents in the live index"],
    [liveStats ? (liveStats.paragraphs ?? 0).toLocaleString() : "—", "passages searchable"],
    [corpusManifest ? (corpusManifest.collected_speeches ?? 0).toLocaleString() : "—", "speeches collected"],
    [aec ? aec.docs.toLocaleString() : "—", "donations classified"],
  ];
  holder.innerHTML = tiles.map(([v, l]) => tile(v, l)).join("");
  if (corpusManifest) {
    $("front-numbers-note").innerHTML =
      `Live from the search index and corpus manifest v${esc(corpusVersion())}. <a href="#/stats">Full corpus breakdown</a>`;
  }
}

// How each report topic reads mid-sentence in a prewired question ("What did
// X say about …?"). Falls back to the lowercased title for future reports.
const TOPIC_PHRASE = {
  climate: "climate and energy",
  indigenous: "First Nations issues",
  media: "media ownership",
};

async function renderFrontTopic() {
  try {
    if (!reportsIndex) await loadReportsIndex();
    if (!reportsIndex?.length) return;
    const dayIdx = Math.floor(Date.now() / 864e5) % reportsIndex.length;
    const today = reportsIndex[dayIdx];
    const report = await api(`/reports/${encodeURIComponent(today.slug)}.json`);
    const stats = report.stats;
    if (!stats) return;
    const don = stats.donations;
    const phrase = TOPIC_PHRASE[today.slug] || report.title.toLowerCase();
    // "mining and fossil fuels", not "mining, fossil_fuels".
    const inds = (don?.industries || []).map(industryLabel);
    const indPhrase = inds.length > 1
      ? `${inds.slice(0, -1).join(", ")} and ${inds[inds.length - 1]}`
      : inds[0] || "";
    const speechYears = toYearSeries(stats.timeline ?? []);
    const firstYear = speechYears.size ? Math.min(...speechYears.keys()) : null;
    const [peakYear] = peakOf(speechYears.entries()) ?? [];
    // Where the report maps onto an enrichment topic, the module's name opens
    // the topic's live encyclopedia entry.
    const mwTopic = REPORT_TOPIC[today.slug];
    $("h-mw").innerHTML = mwTopic
      ? `Money &amp; words: <a href="${esc(subjectHash("topic", mwTopic))}">${esc(report.title)}</a>`
      : `Money &amp; words: ${esc(report.title)}`;

    // The module's name, enacted: the words and the money in one sentence.
    const lede = `<b>${esc((stats.speech_count ?? 0).toLocaleString())}</b> speeches` +
      (stats.unique_speakers ? ` from <b>${esc(Number(stats.unique_speakers).toLocaleString())}</b> speakers` : "") +
      (firstYear ? ` since ${esc(String(firstYear))}` : "") +
      (don?.total
        ? `, and <b>${esc(fmtMoney(don.total))}</b> in disclosed donations from ${esc(indPhrase)} interests to political parties over the same years.`
        : `. No donor industry in the AEC disclosures maps onto this debate, so today the words stand alone.`);

    // Prewired questions, each built from this topic's own data.
    const chips = [];
    if (don?.industries?.length) {
      const ind = industryLabel(don.industries[0]);
      chips.push(ind === phrase
        ? `Who takes ${ind} money and what do they say about ${ind} reform?`
        : `Who takes ${ind} money and what do they say about ${phrase}?`);
    } else if (firstYear) {
      chips.push(`How has the debate over ${phrase} changed since ${firstYear}?`);
    }
    if (peakYear) chips.push(`Why did parliament talk so much about ${phrase} in ${peakYear}?`);
    const loudest = stats.top_speakers?.[0]?.[0];
    if (loudest) chips.push(`What did ${loudest} say about ${phrase}?`);

    $("front-mw").innerHTML = `
      <p class="mw-lede">${lede}</p>
      ${moneyWordsCharts(stats, { topic: report.title })}
      <div class="mw-cols">
        ${stats.top_speakers?.length ? barList(stats.top_speakers.slice(0, 3), {
          heading: "Most speeches on this topic", fmt: (v) => Number(v).toLocaleString(),
          linkTo: (nm) => subjectHash("person", nm) }) : ""}
        ${don?.top_donors?.length ? barList(don.top_donors.slice(0, 3), {
          heading: `Largest ${indPhrase} donors`, fmt: fmtMoney,
          linkTo: (nm) => subjectHash("donor", nm) }) : ""}
      </div>
      ${chips.length ? `<nav class="mw-chips" aria-label="Ask about ${esc(report.title)}">
        <span class="chip-label">Ask the record:</span>
        ${chips.map((q) => `<a class="chip" href="${esc(askHash(q))}">${esc(q)}</a>`).join("")}
      </nav>` : ""}
      <p class="fineprint" style="margin-top:0.9rem">The topic rotates daily.
      <a href="#/reports/${esc(today.slug)}">Read the full ${esc(report.title)} report</a> ·
      ${mwTopic ? `<a href="${esc(subjectHash("topic", mwTopic))}">Follow the topic live</a> · ` : ""}
      <a href="#/reports">All reports</a></p>`;
    $("mod-mw").hidden = false;

    // Encyclopedia rail: the loudest voices across every report, today's
    // topic leading. Needs the other reports too, so it fills in on its own.
    renderFrontEncy(dayIdx, report, don).catch(() => { /* module stays hidden */ });

    // Reports row (index already in hand).
    $("front-reports").innerHTML = reportsIndex.map((r) => `
      <a class="report-card" href="#/reports/${esc(r.slug)}">
        <span class="card-title">${esc(r.title)}</span>
        <span class="card-blurb">${esc(r.blurb)}</span>
        <span class="card-meta">Updated ${esc(fmtDate(r.updated || ""))}</span></a>`).join("");
    $("mod-reports").hidden = false;
  } catch { /* modules stay hidden */ }
}

// The encyclopedia slider: one card per report's top speaker (today's topic
// first, then the daily rotation order), deduped, filled from the second and
// later ranks up to eight. Speakers without a portrait are skipped. Votes come
// from the static export; a person missing from it simply has no vote block.
// Today's top donor closes the row so the AEC half of the fineprint holds.
async function renderFrontEncy(dayIdx, todayReport, don) {
  const n = reportsIndex.length;
  const order = reportsIndex.map((_, i) => reportsIndex[(dayIdx + i) % n]);
  const [reports] = await Promise.all([
    Promise.all(order.map((r) => r.slug === order[0].slug
      ? todayReport
      : api(`/reports/${encodeURIComponent(r.slug)}.json`).catch(() => null))),
    loadPhotoMap(), loadVotes(), loadMoneyData(),
  ]);
  const ranked = reports.map((rep) => ({
    topic: rep?.title || "",
    speakers: (rep?.stats?.top_speakers || []).filter(([nm]) => photoUrlFor(nm)),
  }));
  const seen = new Set();
  const picks = [];
  for (let rank = 0; picks.length < 8 && ranked.some((r) => r.speakers[rank]); rank++) {
    for (const r of ranked) {
      const row = r.speakers[rank];
      if (!row || seen.has(row[0]) || picks.length >= 8) continue;
      seen.add(row[0]);
      picks.push({ name: row[0], count: row[1], topic: r.topic });
    }
  }

  const voteList = (label, rows) => rows?.length ? `
    <div class="ency-votes-col">
      <span class="ency-votes-label">${label}</span>
      <ul class="ency-votes-list" role="list">${rows.slice(0, 2).map((d) => `
        <li><span class="ency-bill">${esc(d.name)}</span><span class="ency-year">${esc(String(d.date || "").slice(0, 4))}</span></li>`).join("")}
      </ul>
    </div>` : "";
  const cards = picks.map((p) => {
    const v = votesFor(p.name);
    const hasVotes = Boolean(v?.for?.length || v?.against?.length);
    return `<article class="report-card ency-card">
      <div class="ency-head">
        <img class="ency-portrait" src="${esc(photoUrlFor(p.name))}" alt="" width="64" height="64">
        <div class="ency-id">
          <span class="card-kicker">Parliamentarian</span>
          <a class="card-title ency-name" href="${esc(subjectHash("person", p.name))}">${esc(p.name)}</a>
          ${v?.party ? partyChipHTML(v.party) : ""}
        </div>
      </div>
      <p class="card-blurb">${esc(Number(p.count).toLocaleString())} speeches on ${esc(p.topic.toLowerCase())} in the indexed record.</p>
      ${hasVotes ? `<div class="ency-votes">${voteList("Voted for", v.for)}${voteList("Voted against", v.against)}</div>
      <span class="card-meta">${esc(Number(v.divisions_total || 0).toLocaleString())} recorded votes${v.years ? `, ${esc(String(v.years[0]))} to ${esc(String(v.years[1]))}` : ""}</span>` : ""}
      ${actionBtn("entry", subjectHash("person", p.name), "Open the entry")}
    </article>`;
  });

  const topDonor = don?.top_donors?.[0];
  if (topDonor) {
    const node = findMoneyNode("donor", topDonor[0]);
    const fact = node ? weeklyFunFact(node).replace(/<[^>]+>/g, "") : "";
    cards.push(`<article class="report-card ency-card">
      <div class="ency-id">
        <span class="card-kicker">Donor${node?.industry ? ` · ${esc(industryLabel(node.industry))}` : ""}</span>
        <a class="card-title ency-name" href="${esc(subjectHash("donor", topDonor[0]))}">${esc(topDonor[0])}</a>
      </div>
      <p class="card-blurb">${esc(fmtMoney(topDonor[1]))} disclosed${node ? `, ${node.firstYear} to ${node.lastYear}` : " to parties"}.
        ${esc(fact)}</p>
      ${actionBtn("entry", subjectHash("donor", topDonor[0]), "Open the entry")}
    </article>`);
  }
  if (!cards.length) return;

  const holder = $("front-ency");
  holder.innerHTML = `
    <div class="ency-slider">
      <div class="ency-track">${cards.join("")}</div>
      ${cards.length > 1 ? `<div class="ency-nav">
        <button type="button" class="action-btn ency-prev" aria-label="Previous entry">${iconSvg("prev")}</button>
        <span class="ency-count" aria-live="polite"></span>
        <button type="button" class="action-btn ency-next" aria-label="Next entry">${iconSvg("next")}</button>
      </div>` : ""}
    </div>`;
  // Unhide before measuring: a display:none track reports zero widths.
  $("mod-ency").hidden = false;
  if (cards.length > 1) mountEncySlider(holder.querySelector(".ency-slider"));
}

// Prev/next step one card; the count and the disabled ends follow the track's
// own scroll position, so swipes and arrow clicks stay in agreement.
function mountEncySlider(root) {
  const track = root.querySelector(".ency-track");
  const prev = root.querySelector(".ency-prev");
  const next = root.querySelector(".ency-next");
  const count = root.querySelector(".ency-count");
  const cards = [...track.children];
  const step = () => (cards[1].offsetLeft - cards[0].offsetLeft) || track.clientWidth;
  const sync = () => {
    const atEnd = track.scrollLeft + track.clientWidth >= track.scrollWidth - 2;
    const i = atEnd ? cards.length - 1 : Math.min(cards.length - 1, Math.round(track.scrollLeft / step()));
    count.textContent = `${i + 1} of ${cards.length}`;
    prev.disabled = track.scrollLeft <= 2;
    next.disabled = atEnd;
  };
  prev.addEventListener("click", () => track.scrollBy({ left: -step() }));
  next.addEventListener("click", () => track.scrollBy({ left: step() }));
  track.addEventListener("scroll", sync, { passive: true });
  window.addEventListener("resize", sync);
  sync();
}

async function renderFrontAdded() {
  try {
    const data = await api("/api/recent");
    const items = (data.items || []).slice(0, 6);
    if (!items.length) return;
    const half = Math.ceil(items.length / 2);
    const li = (i) => `<li><a href="#/doc/${esc(i.slug)}" class="source-title">${esc(i.title)}</a>
      <span class="result-meta">indexed ${esc(relTime(i.indexed))}</span></li>`;
    $("front-added").innerHTML =
      `<ul class="subject-list" role="list">${items.slice(0, half).map(li).join("")}</ul>` +
      `<ul class="subject-list" role="list">${items.slice(half).map(li).join("")}</ul>`;
    $("mod-added").hidden = false;
  } catch { /* stays hidden */ }
}

function renderFrontPage() {
  setFrontPageHidden(false);
  renderFrontNumbers();
  resetFrontMap();
  if (frontRendered) return;
  frontRendered = true;
  renderFrontNews();
  onIdle(() => { mountFrontMaps(); renderFrontTopic(); renderFrontAdded(); });
}

// --- the home maps ----------------------------------------------------------
// Two plates above the modules. Left, the record by state: Australia engraved
// (statemap.js), each parliament in the corpus labelled with its speech count
// from the manifest, a click searching that parliament's record. Right, where
// the money goes: the money map in its mini chrome, framed on the whole graph -
// the parties at the centre, the top donors ringed by industry, drifting until
// touched. Clicking a donor or party opens its encyclopedia entry; the industry
// chips beneath (the keyboard path to the same territory) open the full map
// with that cluster isolated. Both mount once, lazily; the 3D map is paused
// whenever it cannot be seen: scrolled past, hidden behind an ask, or behind
// another panel.

let stateMapHandle = null;
let frontMapHandle = null;
let frontMapLoading = false;
let frontMapObserver = null;

function mountFrontMaps() {
  mountStateMap();
  mountFrontMap();
}

async function mountStateMap() {
  const root = $("front-statemap");
  if (!root || stateMapHandle) return;
  try {
    const [mod, manifest] = await Promise.all([
      import("/statemap.js"),
      corpusManifest ? Promise.resolve(corpusManifest) : fetch("/corpus.json").then((r) => r.json()),
    ]);
    root.textContent = "";
    stateMapHandle = mod.mountStateMap(root, {
      manifest,
      searchHref: (code) => searchHash("", { state: code }),
      moneyHref: (jur) => moneyHash(jur),
    });
  } catch {
    root.innerHTML = `<p class="status">The map could not load here. <a href="#/search">Search the record</a>.</p>`;
  }
}

async function mountFrontMap() {
  const root = $("front-map-root");
  if (!root || frontMapHandle || frontMapLoading) return;
  frontMapLoading = true;
  try {
    const [mod, data] = await Promise.all([import("/money-map.js"), loadMoneyData()]);
    if (!data) throw new Error("money data unavailable");
    root.textContent = "";
    const handle = await mod.mountMoneyMap(root, "/graph/money.json", {
      chrome: "mini",
      askUrl: (industry) => askHash(`What has parliament said about ${industryLabel(industry)}?`),
      onSelect: (node) => {
        if (node) location.hash = subjectHash(node.kind === "party" ? "party" : "donor", node.label);
      },
    });
    frontMapHandle = handle;
    frontMapObserver = new IntersectionObserver((entries) => handle.setPaused?.(!entries[entries.length - 1].isIntersecting));
    frontMapObserver.observe(root);
    renderFrontMapChips(mod, data);
  } catch {
    root.innerHTML = `<p class="status">The map could not load here. <a href="#/money">Open the money map</a>.</p>`;
  } finally {
    frontMapLoading = false;
  }
}

/** One chip per industry cluster, in the map's own colours and legend order. */
function renderFrontMapChips(mod, data) {
  const nav = $("front-map-chips");
  if (!nav || !mod.CLUSTER_COLOURS) return;
  const counts = new Map();
  for (const n of data.nodes || []) {
    if (n.kind === "donor") counts.set(n.group, (counts.get(n.group) || 0) + 1);
  }
  const groups = [...mod.CLUSTER_COLOURS.keys()].filter((g) => g !== "parties" && counts.has(g));
  if (!groups.length) return;
  nav.innerHTML = groups.map((g) => `<a class="map-chip" href="${esc(moneyHash("federal", g))}">
      <span class="map-dot" style="background:${esc(mod.clusterColour(g).colour)}"></span>
      <span>${esc(g[0].toUpperCase() + g.slice(1))}</span>
      <span class="map-chip-n">${counts.get(g)}</span></a>`).join("");
  nav.hidden = false;
}

/** Back on the home page: whatever was clicked last, the whole territory is in view again. */
function resetFrontMap() {
  if (!frontMapHandle) return;
  frontMapHandle.select(null);
  frontMapHandle.fit?.(false);
}


// --- the wombat (loading companion) -----------------------------------------

let wombat = null;
let wombatLoading = false;

async function showWombat(label) {
  const slot = $("ask-wombat");
  slot.hidden = false;
  if (!wombat && !wombatLoading) {
    wombatLoading = true;
    try {
      const mod = await import("/wombat.js");
      if (!$("ask-wombat").hidden) {
        wombat = mod.mountWombat(slot, { label });
      } else {
        wombat = mod.mountWombat(slot, { label });
        slot.hidden = true;
      }
    } catch { /* the text status still carries the state */ }
    wombatLoading = false;
  } else if (wombat) {
    wombat.setLabel(label);
  }
}

function hideWombat() {
  $("ask-wombat").hidden = true;
}

// The same menagerie for any other waiting slot (search results, the
// answer rail). One mount per slot, kept across shows; a hidden slot that
// finishes loading late stays hidden.
const loaders = new Map();
async function showLoader(slotId, label) {
  const slot = $(slotId);
  if (!slot) return;
  slot.hidden = false;
  const have = loaders.get(slotId);
  if (have) { have.setLabel(label); return; }
  try {
    const mod = await import("/wombat.js");
    if (loaders.get(slotId)) return;
    loaders.set(slotId, mod.mountWombat(slot, { label }));
  } catch { /* the status text still carries the state */ }
}
function hideLoader(slotId) {
  const slot = $(slotId);
  if (slot) slot.hidden = true;
}
// Loaders in slots a page rebuilds on every render: the controller cached
// for the last visit points at a removed element, so it is dropped first.
function showPageLoader(slotId, label) {
  clearPageLoader(slotId);
  return showLoader(slotId, label);
}
function clearPageLoader(slotId) {
  loaders.get(slotId)?.destroy?.();
  loaders.delete(slotId);
}
/** Inline markdown (bold, italics, code) as safe HTML, for one-paragraph texts. */
function inlineHTML(text) {
  const el = document.createElement("span");
  appendInline(el, String(text || ""));
  return el.innerHTML;
}

/** Show the ask result once: a gentle rise, and the page glides to meet it. */
function revealAskResult() {
  const result = $("ask-result");
  if (!result.hidden) return;
  result.hidden = false;
  result.classList.remove("ask-reveal");
  void result.offsetWidth;
  result.classList.add("ask-reveal");
  result.scrollIntoView({
    behavior: matchMedia("(prefers-reduced-motion: no-preference)").matches ? "smooth" : "auto",
    block: "start",
  });
}

async function runAsk(question) {
  if (askAbort) askAbort.abort();
  const myAbort = new AbortController();
  askAbort = myAbort;
  const btn = $("ask-submit");
  // Structured money answer, rendered immediately from local data.
  const moneyInd = detectMoneyIndustry(question);
  $("ask-money").hidden = true;
  if (moneyInd) {
    loadMoneyData().then(() => {
      if (askAbort === myAbort) renderMoneyPanel(moneyInd);
    });
  }
  let speakerFilter = parseSpeakerIntent(question);
  btn.disabled = true;
  btn.classList.add("btn-loading");
  btn.innerHTML = '<span class="btn-spinner" aria-hidden="true"></span>Asking…';
  $("ask-result").hidden = true;
  $("ask-chips").hidden = true;
  setFrontPageHidden(true);
  setQuoteRail([]);
  const started = Date.now();
  setStatus($("ask-status"), "Checking the record. This can take up to a minute.");
  $("ask-status").classList.add("visually-hidden");
  showWombat("Checking the record. This can take up to a minute.");
  clearInterval(askTimer);
  askTimer = setInterval(() => {
    const s = Math.round((Date.now() - started) / 1000);
    if (s >= 10) {
      $("ask-status").textContent = `Checking the record (${s}s). This can take up to a minute.`;
      if (wombat && !$("ask-wombat").hidden) wombat.setLabel(`Still digging (${s}s). Long questions can take a minute.`);
    }
  }, 5000);
  try {
    // Canonicalize the speaker before the filter leaves the UI. The popover
    // input gets the resolved name written back so the user sees what was
    // actually filtered (askFilters() re-reads it below and in the stamp).
    const aSpeaker = $("a-speaker");
    if (aSpeaker?.value.trim()) {
      const canon = await resolveSpeaker(aSpeaker.value);
      if (canon) aSpeaker.value = canon;
    } else if (speakerFilter) {
      // A lone surname must resolve to be usable as a filter; an unresolved
      // full name still passes through as typed.
      speakerFilter = (await resolveSpeaker(speakerFilter)) ||
        (speakerFilter.includes(" ") ? speakerFilter : null);
    }
    const askBody = JSON.stringify((() => {
      const f = askFilters();
      if (!f.speaker && speakerFilter) f.speaker = speakerFilter;
      const body = { question, kind: askKind() };
      for (const [k, v] of Object.entries(f)) if (v) body[k] = v;
      return body;
    })());
    // The answer streams into the page as it is written; the wombat leaves
    // on the first words. Sources, stamp and rail wait for the final payload.
    const live = streamRenderer($("ask-answer"), () => askAbort === myAbort);
    let streamed = false;
    const data = await askRecord(askBody, myAbort.signal, {
      delta(text) {
        if (askAbort !== myAbort) return;
        if (!streamed) {
          streamed = true;
          hideWombat();
          // The result block still holds the previous answer and its
          // trimmings; the first paint is a timer tick away.
          $("ask-answer").replaceChildren();
          $("ask-stamp").textContent = "";
          $("ask-sources").hidden = true;
          $("ask-result").querySelector(".action-row").hidden = true;
          revealAskResult();
        }
        live.push(text);
      },
      retry() {
        if (askAbort !== myAbort) return;
        // Attempt one is being withdrawn: back to the wombat, a clean page.
        streamed = false;
        live.reset();
        $("ask-result").hidden = true;
        showWombat("Reading the record again.");
      },
    });
    live.stop();
    if (askAbort !== myAbort) return; // superseded by a newer question
    // Trim before every use: a whitespace-only answer is truthy and would
    // otherwise slip past the "(no answer)" fallback and render nothing.
    const answerText = (data.answer || "").trim();
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
    lastAsk = { question, answer: answerText, sources, kind: askKind() };

    hideWombat();
    setStatus($("ask-status"), `Answer ready: ${sources.length} sources.`);
    $("ask-status").classList.add("visually-hidden"); // announced, not displayed
    revealAskResult();
    $("ask-result").querySelector(".action-row").hidden = false;
    if (answerText) {
      renderAnswer($("ask-answer"), answerText);
    } else {
      // Both attempts came back blank (it happens under model load). Own it
      // plainly and hand the reader a retry, rather than a bare sources list.
      const p = document.createElement("p");
      p.textContent = "The record was searched and the sources below were retrieved, but no written answer came back this time.";
      const retry = document.createElement("button");
      retry.type = "button";
      retry.className = "primary";
      retry.textContent = "Ask again";
      retry.addEventListener("click", () => runAsk(question));
      $("ask-answer").replaceChildren(p, retry);
    }
    $("ask-stamp").textContent =
      `Generated ${fmtDate(localISODate())} · corpus v${corpusVersion()}` +
      ((askFilterSummary(askFilters()) || (speakerFilter ? speakerFilter : ""))
        ? ` · filtered: ${askFilterSummary(askFilters()) || `${speakerFilter}'s speeches`}` : "");
    $("ask-cited-list").replaceChildren(...citedList.map((s, i) => sourceItem(s, i + 1)));
    $("ask-retrieved").hidden = !alsoList.length;
    $("ask-retrieved-list").replaceChildren(...alsoList.map((s) => sourceItem(s, null)));
    $("ask-sources-sum").textContent = `Sources (${sources.length})`;
    $("ask-sources").open = false; // each new answer starts folded
    $("ask-sources").hidden = !sources.length;
    setQuoteRail(citedList);
    $("ask-answer").focus({ preventScroll: true });
  } catch (err) {
    if (askAbort !== myAbort) return; // a newer request owns the UI now
    hideWombat();
    if (err.name === "AbortError") setStatus($("ask-status"), "Cancelled.");
    else {
      setStatus($("ask-status"),
        `${err.message || err}. The record is still there; try again.`, true);
      // A failed ask leaves the page empty; the suggested starts return.
      // (A stream that broke after its first words leaves them standing.)
      if ($("ask-result").hidden) {
        if (suggestions.length) $("ask-chips").hidden = false;
        setFrontPageHidden(false);
      }
    }
  } finally {
    if (askAbort === myAbort) {
      clearInterval(askTimer);
      btn.disabled = false;
      btn.classList.remove("btn-loading");
      btn.textContent = "Ask the record";
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
  copyText(siteUrl(askHash(q, askKind())), e.currentTarget.querySelector("span") || e.target,
    "Copied. Opening it re-asks the question; wording may vary");
});

$("ask-export").addEventListener("click", () => {
  offerExport(lastAsk.sources,
    [`# question: ${lastAsk.question}`, `# note: sources retrieved for a generated answer`],
    "opax-ask-sources");
});

$("ask-continue").addEventListener("click", () => {
  if (!lastAsk.question || !lastAsk.answer) return;
  try { sessionStorage.setItem("opax-chat-seed", JSON.stringify(lastAsk)); } catch { /* still usable unseeded */ }
  location.hash = "#/chat";
});

/**
 * Suggested questions as home-page cards. They exist to start a first journey,
 * so they leave the moment a question is asked (runAsk hides the block) and
 * only return if that ask fails and the page is empty again.
 */
function renderChips() {
  // An ask already underway (status set synchronously at runAsk start) or
  // answered: the chips and the front page stay out of the way.
  if (lastAsk.question || !$("ask-result").hidden || $("ask-status").textContent) return;
  if (!suggestions.length) return;
  const row = $("chip-row");
  for (const el of row.querySelectorAll(".chip")) el.remove();
  const picks = [...suggestions].sort(() => Math.random() - 0.5).slice(0, 4);
  for (const q of picks) {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "chip";
    b.textContent = q.length > 60 ? q.slice(0, 57) + "…" : q;
    b.addEventListener("click", () => {
      $("ask-input").value = q;
      history.replaceState(null, "", askHash(q));
      runAsk(q);
    });
    row.appendChild(b);
  }
  $("ask-chips").hidden = false;
}

function setFrontPageHidden(hidden) {
  for (const id of ["front-map", "front-page"]) {
    const el = $(id);
    if (el) el.hidden = hidden;
  }
}

// --- chat (keep asking) -----------------------------------------------------
// The ask page's "Keep asking about this" button seeds a conversation with the
// original question and answer; every later turn goes back to /api/ask with
// the prior turns as context, and each answer offers follow-up questions the
// Worker generated from the passages retrieved for that answer (a candidate it
// cannot ground in those passages is discarded, so a chip is never a question
// the record would refuse). Thread lives in sessionStorage: it survives
// reload and navigation, and ends with the tab, like a conversation should.

let chatThread = []; // {role: 'user'|'answer', text, sources?, next?}
let chatKind = "speech";
let chatAbort = null;
let chatFollowAbort = null;
let chatTimer = null;

function saveChatSession() {
  try {
    sessionStorage.setItem("opax-chat", JSON.stringify({ kind: chatKind, thread: chatThread }));
  } catch { /* private windows: the thread just won't survive reload */ }
}

function loadChatSession() {
  try {
    const data = JSON.parse(sessionStorage.getItem("opax-chat") || "null");
    if (!data || !Array.isArray(data.thread)) return;
    chatThread = data.thread.filter((m) => m && typeof m.text === "string");
    chatKind = data.kind === "all" ? "all" : "speech";
  } catch { /* malformed storage reads as an empty thread */ }
}

function initChat(manageFocus) {
  if (!chatThread.length) loadChatSession();
  try {
    const raw = sessionStorage.getItem("opax-chat-seed");
    if (raw) {
      sessionStorage.removeItem("opax-chat-seed");
      const seed = JSON.parse(raw);
      // Re-seeding with the SAME ask keeps the thread (and its later turns);
      // a different ask starts a fresh conversation.
      if (seed?.question && seed?.answer &&
          !(chatThread[0]?.text === seed.question && chatThread[1]?.text === seed.answer)) {
        chatThread = [
          { role: "user", text: seed.question },
          { role: "answer", text: seed.answer, sources: seed.sources || [] },
        ];
        chatKind = seed.kind === "all" ? "all" : "speech";
        saveChatSession();
      }
    }
  } catch { /* a bad seed leaves the existing thread standing */ }
  renderChatThread();
  requestChatFollowups();
  // Land at the composer: the thread above is history, the input is the
  // point of this view. Double-rAF so route()'s scroll-to-top settles first.
  requestAnimationFrame(() => requestAnimationFrame(() => {
    $("chat-form")?.scrollIntoView({
      behavior: matchMedia("(prefers-reduced-motion: no-preference)").matches ? "smooth" : "auto",
      block: "end",
    });
    if (manageFocus) $("chat-input").focus({ preventScroll: true });
  }));
}

function renderChatThread() {
  const thread = $("chat-thread");
  thread.replaceChildren();
  if (!chatThread.length) {
    const p = document.createElement("p");
    p.className = "chat-hint";
    p.textContent = "Ask the record a question below — or ask one on the Ask page and choose “Keep asking about this” to continue it here.";
    thread.appendChild(p);
    return;
  }
  for (const msg of chatThread) {
    if (msg.role === "user") {
      const wrap = document.createElement("div");
      wrap.className = "chat-turn chat-turn-user";
      const p = document.createElement("p");
      p.textContent = msg.text;
      wrap.appendChild(p);
      thread.appendChild(wrap);
    } else {
      thread.appendChild(chatAnswerEl(msg));
    }
  }
  const next = document.createElement("div");
  next.id = "chat-next";
  thread.appendChild(next);
}

function chatAnswerEl(msg) {
  const wrap = document.createElement("div");
  wrap.className = "chat-turn chat-turn-answer";
  const body = document.createElement("div");
  body.className = "answer";
  renderAnswer(body, msg.text || "(no answer)");
  wrap.appendChild(body);
  const sources = msg.sources || [];
  if (sources.length) {
    // Collapsed by default: in a running conversation the sources are a
    // reference, not the reading path between an answer and the composer.
    const cited = sources.filter((s) => s.cited);
    const shown = (cited.length ? cited : sources).slice(0, 5);
    const rest = sources.filter((s) => !shown.includes(s));
    const det = document.createElement("details");
    det.className = "chat-sources";
    const sum = document.createElement("summary");
    sum.textContent = `Sources (${sources.length})`;
    det.appendChild(sum);
    const ol = document.createElement("ol");
    ol.className = "source-list chat-source-list";
    shown.forEach((s, i) => ol.appendChild(sourceItem(s, i + 1)));
    det.appendChild(ol);
    if (rest.length) {
      const more = document.createElement("p");
      more.className = "fineprint";
      more.textContent = "Also retrieved for this answer:";
      det.appendChild(more);
      const ol2 = document.createElement("ol");
      ol2.className = "source-list";
      rest.forEach((s) => ol2.appendChild(sourceItem(s, null)));
      det.appendChild(ol2);
    }
    wrap.appendChild(det);
  }
  if (msg.carried) {
    const p = document.createElement("p");
    p.className = "fineprint";
    p.textContent = msg.carried.source
      ? `This suggested follow-up drew on a passage from “${msg.carried.source}”, retrieved for the previous answer.`
      : "This suggested follow-up drew on a passage retrieved for the previous answer.";
    wrap.appendChild(p);
  }
  return wrap;
}

async function requestChatFollowups() {
  if (chatFollowAbort) chatFollowAbort.abort();
  const last = chatThread[chatThread.length - 1];
  const asked = chatThread[chatThread.length - 2];
  if (!last || last.role !== "answer" || asked?.role !== "user") return;
  if (last.next?.length) { renderChatNext(last.next); return; } // generated once, kept on the message
  const passages = (last.sources || [])
    .map((s) => ({ title: s.title || s.slug || "", text: (s.snippet || "").trim() }))
    .filter((p) => p.text)
    .slice(0, 8);
  if (!passages.length) return; // no passages, no follow-ups — never a spinner
  const myAbort = new AbortController();
  chatFollowAbort = myAbort;
  try {
    const data = await api("/api/followups", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ question: asked.text, answer: last.text, passages }),
      signal: myAbort.signal,
    });
    if (chatFollowAbort !== myAbort || chatThread[chatThread.length - 1] !== last) return;
    const questions = (data.questions || [])
      .map((item) => (typeof item === "string" ? { question: item } : item))
      .filter((item) => item && typeof item.question === "string" && item.question.trim());
    if (!questions.length) return;
    last.next = questions;
    saveChatSession();
    renderChatNext(questions);
  } catch { /* follow-ups are an extra, never an error */ }
}

function renderChatNext(questions) {
  const next = $("chat-next");
  if (!next || !questions.length) return;
  next.replaceChildren();
  next.className = "chat-next";
  const kicker = document.createElement("p");
  kicker.className = "kicker";
  kicker.textContent = "Ask next";
  next.appendChild(kicker);
  const row = document.createElement("div");
  row.className = "chat-next-btns";
  row.setAttribute("role", "group");
  row.setAttribute("aria-label", "Suggested follow-up questions");
  for (const raw of questions) {
    // Sessions saved before follow-ups carried evidence stored plain strings.
    const item = typeof raw === "string" ? { question: raw } : raw;
    if (!item?.question) continue;
    const b = document.createElement("button");
    b.type = "button";
    b.className = "chat-next-btn";
    const text = document.createElement("span");
    text.textContent = item.question;
    const arrow = document.createElement("span");
    arrow.className = "next-arrow";
    arrow.setAttribute("aria-hidden", "true");
    arrow.textContent = "→";
    b.append(text, arrow);
    b.addEventListener("click", () => sendChat(item.question, item));
    row.appendChild(b);
  }
  next.appendChild(row);
}

async function sendChat(question, carry) {
  const q = String(question || "").trim();
  if (!q) return;
  if (chatAbort) chatAbort.abort();
  if (chatFollowAbort) chatFollowAbort.abort();
  const myAbort = new AbortController();
  chatAbort = myAbort;
  // Everything before this question travels as context for the retrieval.
  const context = chatThread
    .map((m) => ({ author: m.role === "answer" ? "answer" : "user", text: m.text }))
    .slice(-12);
  // A chip's question was proven against a passage retrieved for the PREVIOUS
  // answer; fresh retrieval on the chip's wording alone can miss that passage,
  // so the proof travels with the click as one extra context turn (appended
  // after the slice — it must never be trimmed away). Typed follow-ups carry
  // nothing: they are pure re-retrieval.
  if (carry?.evidence) {
    context.push({
      author: "answer",
      text: `From the record${carry.source ? ` (${carry.source})` : ""}: "${carry.evidence}"`,
    });
  }
  chatThread.push({ role: "user", text: q });
  saveChatSession();
  renderChatThread();
  $("chat-input").value = "";
  $("chat-send").disabled = true;
  setStatus($("chat-status"), "Checking the record.");
  $("chat-status").classList.add("visually-hidden"); // announced, not displayed
  const slot = document.createElement("div");
  slot.setAttribute("role", "status");
  $("chat-thread").appendChild(slot);
  let trundler = null;
  import("/wombat.js")
    .then((mod) => {
      if (chatAbort === myAbort && slot.isConnected) {
        trundler = mod.mountWombat(slot, { label: "Checking the record." });
        slot.scrollIntoView({ block: "nearest" });
      }
    })
    .catch(() => { /* the status line has it covered */ });
  const started = Date.now();
  clearInterval(chatTimer);
  chatTimer = setInterval(() => {
    const s = Math.round((Date.now() - started) / 1000);
    if (s >= 10 && trundler) trundler.setLabel(`Still digging (${s}s). Long questions can take a minute.`);
  }, 5000);
  try {
    const chatBody = JSON.stringify({ question: q, kind: chatKind, context });
    // The answer streams into a provisional turn beneath the loader's slot;
    // the finished thread re-renders from chatThread as before.
    let liveWrap = null;
    let live = null;
    let streamed = false;
    const data = await askRecord(chatBody, myAbort.signal, {
      delta(text) {
        if (chatAbort !== myAbort || !slot.isConnected) return;
        if (!live) {
          liveWrap = document.createElement("div");
          liveWrap.className = "chat-turn chat-turn-answer";
          const body = document.createElement("div");
          body.className = "answer";
          liveWrap.appendChild(body);
          slot.insertAdjacentElement("afterend", liveWrap);
          live = streamRenderer(body, () => chatAbort === myAbort);
        }
        if (!streamed) {
          streamed = true;
          slot.hidden = true;
          liveWrap.hidden = false;
          liveWrap.scrollIntoView({ block: "start" });
        }
        live.push(text);
      },
      retry() {
        if (chatAbort !== myAbort) return;
        streamed = false;
        live?.reset();
        if (liveWrap) liveWrap.hidden = true;
        slot.hidden = false;
        trundler?.setLabel("Reading the record again.");
      },
    });
    live?.stop();
    if (chatAbort !== myAbort) return;
    chatThread.push({
      role: "answer",
      text: (data.answer || "").trim() || "(no answer)",
      sources: data.sources || [],
      // Disclosed under the answer: the carried passage is real corpus text,
      // but this turn's retrieval did not necessarily surface it itself.
      ...(carry?.evidence ? { carried: { source: carry.source || "" } } : {}),
    });
    saveChatSession();
    renderChatThread();
    setStatus($("chat-status"), "Answer ready.");
    $("chat-status").classList.add("visually-hidden");
    requestChatFollowups();
    if (!streamed) {
      // A streamed answer was scrolled to on its first words; the reader may
      // be partway down it by now.
      const answers = $("chat-thread").querySelectorAll(".chat-turn-answer");
      answers[answers.length - 1]?.scrollIntoView({ block: "start" });
    }
  } catch (err) {
    if (chatAbort !== myAbort) return;
    renderChatThread(); // clears the wombat slot and any half-streamed turn
    const p = document.createElement("p");
    p.className = "chat-error";
    p.textContent = err.name === "AbortError"
      ? "Cancelled."
      : `${err.message || err}. The record is still there; try again.`;
    $("chat-thread").appendChild(p);
  } finally {
    if (chatAbort === myAbort) {
      clearInterval(chatTimer);
      $("chat-send").disabled = false;
    }
  }
}

$("chat-form").addEventListener("submit", (e) => {
  e.preventDefault();
  const q = $("chat-input").value.trim();
  if (q) sendChat(q);
});

// --- corpus meter -----------------------------------------------------------

function renderCorpusMeter() {
  if (!liveStats || !corpusManifest) return;
  fillMeter("corpus-meter", "corpus-meter-text", "corpus-meter-bar");
}

function fillMeter(boxId, textId, barId) {
  if (!$(boxId)) return;
  const indexed = liveStats.resources ?? 0;
  // NOTE: /api/stats counts every KB resource. corpus.json's expected_resources
  // covers speeches+news only — it MUST be raised when the legal push is
  // approved, or this meter will hide while speeches are still incomplete.
  const expected = corpusManifest.expected_resources || 0;
  if (!expected) return;
  const meter = $(boxId);
  if (indexed >= expected * 0.98) { meter.hidden = true; return; }
  meter.hidden = false;
  $(textId).textContent =
    `${indexed.toLocaleString()} of ${expected.toLocaleString()} collected documents indexed, with more added daily. Answers may be incomplete while indexing runs.`;
  const pct = Math.min(Math.max(Math.round((indexed / expected) * 100), 1), 100);
  const bar = $(barId);
  bar.setAttribute("aria-valuenow", String(pct));
  bar.querySelector("i").style.width = `${pct}%`;
}

// --- search / workbench -----------------------------------------------------

function currentFilters() {
  // Year sliders mirror the ask popover: crossed thumbs swap, and the full
  // range means "no year filter".
  let from = $("f-from").value.trim(), to = $("f-to").value.trim();
  if (Number(from) > Number(to)) [from, to] = [to, from];
  if (from === "1993" && to === "2026") { from = ""; to = ""; }
  return {
    speaker: $("f-speaker").value.trim(),
    party: $("f-party").value,
    state: $("f-state").value,
    topic: $("f-topic").value,
    from,
    to,
    kind: $("search-kind").value,
    mode: $("search-mode").value,
  };
}

function updateSearchYearsLabel() {
  const lab = $("f-years-label");
  if (!lab) return;
  let a = Number($("f-from").value), b = Number($("f-to").value);
  if (a > b) [a, b] = [b, a];
  lab.textContent = `${a}–${b}`;
}

function searchHash(q, f) {
  const p = new URLSearchParams();
  if (q) p.set("q", q);
  for (const k of ["speaker", "party", "state", "topic", "from", "to"]) if (f[k]) p.set(k, f[k]);
  if (f.kind && f.kind !== "speech") p.set("kind", f.kind);
  if (f.mode && f.mode !== "hybrid") p.set("mode", f.mode);
  return `#/search?${p.toString()}`;
}

// Search filters popover: same behavior as the ask page's options button.
{
  const btn = $("search-options-btn");
  const pop = $("search-options-pop");
  btn?.addEventListener("click", () => {
    pop.hidden = !pop.hidden;
    btn.setAttribute("aria-expanded", String(!pop.hidden));
  });
  document.addEventListener("pointerdown", (e) => {
    if (!pop || pop.hidden) return;
    if (!pop.contains(e.target) && !btn.contains(e.target)) {
      pop.hidden = true;
      btn.setAttribute("aria-expanded", "false");
    }
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && pop && !pop.hidden) {
      pop.hidden = true;
      btn.setAttribute("aria-expanded", "false");
      btn.focus();
    }
  });
  $("f-from")?.addEventListener("input", updateSearchYearsLabel);
  $("f-to")?.addEventListener("input", updateSearchYearsLabel);
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
    $("f-topic").value = params.get("topic") || "";
    // Range inputs reset to their midpoint on "", so absent params pin the
    // slider ends (which currentFilters reads back as "no year filter").
    $("f-from").value = params.get("from") || "1993";
    $("f-to").value = params.get("to") || "2026";
    updateSearchYearsLabel();
    $("search-kind").value = params.get("kind") || "speech";
    $("search-mode").value = params.get("mode") || "hybrid";
    runSearch();
  } else if (params.has("state")) {
    // A parliament alone (the home page's state map): preset the filter and
    // say so; there is no query to run until the reader types one.
    const state = params.get("state") || "";
    $("f-state").value = state;
    const name = STATE_NAMES[state] || state;
    setStatus($("search-status"), name
      ? `Filtered to the ${name} parliament. Type a question or a phrase to search its record.`
      : "");
  }
}

function activeFilterSummary(f) {
  const bits = [];
  if (f.speaker) bits.push(`speaker ${f.speaker}`);
  if (f.party) bits.push(f.party);
  if (f.state) bits.push(STATE_NAMES[f.state] || f.state);
  if (f.topic) bits.push(TOPICS[f.topic] || f.topic);
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
        <span class="result-meta">${metaHTML(r, { linkSpeaker: true, linkParty: true, portrait: true })}</span>
        <p class="snippet">${highlightHTML(r.snippet, $("search-input").value)}</p>`;
      li.querySelector("button").addEventListener("click", () => {
        location.hash = `#/doc/${r.slug}`;
      });
      return li;
    }),
  );
  decorateMetaPortraits($("search-results"));
}

// --- empty record ------------------------------------------------------------
// A blank record is a finding in itself, so it gets the page's own register
// rather than a grey status line: what was looked for, why Hansard may not
// hold it, and the ways out (looser phrase, fewer filters, the web).

function renderSearchEmpty(q, f) {
  const box = $("search-empty");
  const bare = q.replace(/["“”]/g, "").trim();
  const shown = bare || f.speaker;
  const lede = f.speaker
    ? `No speeches found for “${f.speaker}”${bare ? ` on ${bare}` : ""}. Names appear as Hansard prints them: “Anthony Albanese”, not “the PM”.`
    : "No indexed speech uses that phrase. Hansard is literal: a company, a place or a person is usually named in full, and often only once.";
  const actions = [];
  if (q && bare !== q) actions.push(`<a class="action-btn" href="${esc(searchHash(bare, f))}">Try without the quotes</a>`);
  if (q && f.mode === "keyword") actions.push(`<a class="action-btn" href="${esc(searchHash(q, { ...f, mode: "hybrid" }))}">Match by meaning too</a>`);
  if (q && activeFilterSummary(f)) actions.push(`<a class="action-btn" href="${esc(searchHash(q, { kind: f.kind, mode: f.mode }))}">Search without filters</a>`);
  if (shown) actions.push(`<a class="action-btn" href="${esc(webSearchUrl(shown))}" target="_blank" rel="noopener">Search the web ↗</a>`);
  box.innerHTML = `
    <span class="empty-mark" aria-hidden="true">“ ”</span>
    <h2 class="empty-title">Nothing in the record for “${esc(shown)}”.</h2>
    <p class="empty-lede">${esc(lede)}</p>
    <div class="empty-actions">${actions.join("")}</div>`;
  box.hidden = false;
}

// With nothing retrieved there is nothing to answer from: stop the reader
// rather than let the rail wait on a model that has no passages.
function giveUpSearchAnswer() {
  const box = $("search-answer");
  if (box.hidden) return;
  if (searchAnswerAbort) { searchAnswerAbort.abort(); searchAnswerAbort = null; }
  clearTimeout(searchAnswerStill);
  hideLoader("search-answer-wombat");
  setStatus($("search-answer-status"), "");
  $("search-answer-body").replaceChildren();
  $("search-answer-fold").hidden = true;
  $("search-answer-more").textContent = "";
  const empty = $("search-answer-empty");
  empty.innerHTML = `<p class="rail-empty-line">Nothing to read from.</p>
    <p class="fineprint">The record answers only from passages it can cite. None matched this search, so it stays silent rather than guess.</p>`;
  empty.hidden = false;
}


// --- search answer (the record's answer beside the results) -----------------

let searchAnswerAbort = null;
let searchAnswerStill = null;

async function runSearchAnswer(q, f, mySeq) {
  const box = $("search-answer");
  if (!q) { box.hidden = true; return; }
  if (searchAnswerAbort) searchAnswerAbort.abort();
  const abort = new AbortController();
  searchAnswerAbort = abort;
  box.hidden = false;
  $("search-answer-body").replaceChildren();
  $("search-answer-sources").replaceChildren();
  $("search-answer-fold").hidden = true;
  $("search-answer-fold").open = false;
  $("search-answer-more").textContent = "";
  setStatus($("search-answer-status"), "Reading the record…");
  $("search-answer-status").classList.add("visually-hidden"); // announced; the loader shows it
  showLoader("search-answer-wombat", "");
  // Silent for the first ten seconds; then a small word so a long wait reads
  // as patience, not a stall.
  clearTimeout(searchAnswerStill);
  searchAnswerStill = setTimeout(() => {
    if (searchAnswerAbort === abort) loaders.get("search-answer-wombat")?.setLabel("Still reading…");
  }, 10000);
  try {
    // A search query is rarely a question ("gambling"); the model refuses bare
    // keywords. Phrase it, folding in the speaker when one is filtered.
    const looksLikeQuestion = /\?\s*$|^(what|how|why|who|when|where|did|does|do|has|have|is|are|was|were)\b/i.test(q);
    const question = looksLikeQuestion ? q
      : f.speaker ? `What did ${f.speaker} say about ${q}?`
      : `What has parliament said about ${q}?`;
    const body = { question, kind: f.kind || "speech" };
    for (const k of ["speaker", "party", "state", "topic", "from", "to"]) if (f[k]) body[k] = f[k];
    // The answer streams into the rail; the loader leaves on the first words.
    const mine = () => mySeq === searchSeq && searchAnswerAbort === abort;
    const live = streamRenderer($("search-answer-body"), mine);
    let streamed = false;
    const data = await askRecord(JSON.stringify(body), abort.signal, {
      delta(text) {
        if (!mine()) return;
        if (!streamed) {
          streamed = true;
          clearTimeout(searchAnswerStill);
          hideLoader("search-answer-wombat");
          setStatus($("search-answer-status"), "");
        }
        live.push(text);
      },
      retry() {
        if (!mine()) return;
        streamed = false;
        live.reset();
        showLoader("search-answer-wombat", "");
      },
    });
    live.stop();
    if (!mine()) return;
    const answer = (data.answer || "").trim();
    if (!answer) { clearTimeout(searchAnswerStill); hideLoader("search-answer-wombat"); box.hidden = true; return; }
    clearTimeout(searchAnswerStill);
    hideLoader("search-answer-wombat");
    setStatus($("search-answer-status"), "");
    renderAnswer($("search-answer-body"), answer);
    const cited = (data.sources || []).filter((x) => x.cited).slice(0, 3);
    $("search-answer-sources").replaceChildren(...cited.map((x, i) => sourceItem(x, i + 1)));
    $("search-answer-sum").textContent = `Sources (${cited.length})`;
    $("search-answer-fold").hidden = !cited.length;
    $("search-answer-more").innerHTML =
      `Generated from the retrieved passages. <a href="${esc(askHash(question, f.kind))}">Open in Ask</a> for the full sources.`;
  } catch (err) {
    if (err.name === "AbortError" || mySeq !== searchSeq) return;
    box.hidden = true;
  }
}

let searchSeq = 0;

async function runSearch() {
  const q = $("search-input").value.trim();
  // Canonicalize the speaker box before currentFilters() reads it, writing the
  // resolved name back so the user sees what was actually filtered. Covers
  // every entry path (submit, URL params).
  const fSpeaker = $("f-speaker");
  if (fSpeaker?.value.trim()) {
    const canon = await resolveSpeaker(fSpeaker.value);
    if (canon) fSpeaker.value = canon;
  }
  const f = currentFilters();
  if (!q && !f.speaker) return;
  const mySeq = ++searchSeq;
  runSearchAnswer(q, f, mySeq);
  const btn = $("search-form").querySelector('button[type="submit"]');
  btn.disabled = true;
  setStatus($("search-status"), "Searching the record…");
  $("search-status").classList.add("visually-hidden"); // announced; the loader shows it
  showLoader("search-wombat", "Searching the record.");
  $("results-bar").hidden = true;
  $("search-results").replaceChildren();
  $("search-empty").hidden = true;
  $("search-answer-empty").hidden = true;
  try {
    const params = new URLSearchParams({ q: q || f.speaker, kind: f.kind, mode: f.mode });
    for (const k of ["speaker", "party", "state", "topic", "from", "to"]) if (f[k]) params.set(k, f[k]);
    const data = await api(`/api/search?${params}`);
    if (mySeq !== searchSeq) return; // a newer search owns the results now
    lastSearch = { query: q, filters: f, results: data.results || [] };
    if (!data.count) {
      hideLoader("search-wombat");
      setStatus($("search-status"), "No results from the record.");
      $("search-status").classList.add("visually-hidden"); // announced; the empty state carries the words
      renderSearchEmpty(q, f);
      giveUpSearchAnswer();
    } else {
      hideLoader("search-wombat");
      $("search-status").classList.remove("visually-hidden");
      setStatus($("search-status"), "");
      const active = activeFilterSummary(f);
      $("results-count").textContent =
        `${data.count} results from the record${active ? ` · ${active}` : ""} (top ${data.count} matches)`;
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

$("search-copylink").addEventListener("click", (e) => {
  // Swap only the label span so the "Copied" feedback keeps the icon.
  copyText(siteUrl(searchHash(lastSearch.query, lastSearch.filters)),
    e.currentTarget.querySelector("span"));
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
    <p class="fineprint">For AGLC-compliant page references, use the official record via the source link. OPAX never invents Hansard page numbers.</p>
    <h3>APA 7</h3><pre>${esc(apa)}</pre>
    <h3>BibTeX</h3><pre>${esc(bibtexFor(src))}</pre>
    <h3>RIS</h3><pre>${esc(risFor(src))}</pre>`;
}

async function openDocPage(slug, manageFocus) {
  if (currentDocSlug === slug && currentDoc) return;
  currentDocSlug = slug;
  currentDoc = null;
  $("doc-title").textContent = "Loading…";
  document.querySelector("#panel-doc .doc-portrait")?.remove();
  $("doc-meta").textContent = "";
  $("doc-topics").textContent = "";
  $("doc-topics").hidden = true;
  $("doc-topic").hidden = true;
  $("doc-speaker-links").hidden = true;
  $("doc-text").textContent = "";
  $("doc-brief").hidden = true;
  $("doc-caveat").hidden = true;
  $("doc-cite-panel").hidden = true;
  $("doc-cite").setAttribute("aria-expanded", "false");
  $("doc-actions").hidden = true;
  setStatus($("doc-status"), "Fetching the document…");
  try {
    const doc = await api(`/api/resource/${encodeURIComponent(slug)}`);
    if (currentDocSlug !== slug) return; // user navigated away while fetching
    currentDoc = doc;
    setStatus($("doc-status"), "");
    // The headline is the speaker; raw titles ("Name — 2000-03-07") repeat
    // what the byline says, so they only stand in when no speaker is attached.
    $("doc-title").textContent = doc.speaker || doc.title;
    // Headshot floats beside the headline; the name is already in the
    // headline, so the image is decorative (alt "").
    if (doc.speaker) {
      loadPhotoMap().then(() => {
        if (currentDocSlug !== slug) return;
        const url = photoUrlFor(doc.speaker);
        if (url && !document.querySelector("#panel-doc .doc-portrait")) {
          $("doc-title")?.insertAdjacentHTML("beforebegin",
            `<img class="doc-portrait" src="${esc(url)}" alt="" width="64" height="64">`);
        }
      });
    }
    const topic = doc.metadata?.topic || doc.metadata?.debate;
    $("doc-topic").textContent = topic ? String(topic) : "";
    $("doc-topic").hidden = !topic;
    // One byline, each fact once: party · seat · chamber · date · source.
    const chamber = CHAMBER_NAMES[String(doc.labels?.chamber || "").toLowerCase()];
    const state = doc.labels?.state;
    const stateName = state ? (STATE_NAMES[state] || state) : null;
    const house = chamber
      ? (state && state !== "federal" ? `${chamber}, ${stateName}` : chamber)
      : (state ? (state === "federal" ? "Federal Parliament" : `Parliament of ${stateName}`) : null);
    const origin = safeUrl(doc.url);
    $("doc-meta").innerHTML = [
      doc.labels?.party ? partyChipHTML(doc.labels.party) : "",
      doc.metadata?.electorate ? `Member for ${esc(doc.metadata.electorate)}` : "",
      house ? esc(house) : "",
      doc.metadata?.date ? esc(fmtDate(doc.metadata.date)) : "",
      origin ? `<a href="${esc(origin)}" rel="noopener" target="_blank">View original ↗</a>` : "",
    ].filter(Boolean).join(" · ");
    // Machine topic labels (field-level enrichment; a speech can carry
    // several). Chips only for slugs the taxonomy knows — an unknown label
    // has no topic page to link to. Most of the corpus has none yet: the
    // labelling pass is still running, so absence renders nothing.
    const topicSlugs = (Array.isArray(doc.topics) ? doc.topics : []).filter((t) => TOPICS[t]);
    if (topicSlugs.length) {
      $("doc-topics").innerHTML = topicSlugs.map((t) =>
        `<a class="topic-chip" href="${esc(subjectHash("topic", t))}">${esc(TOPICS[t])}</a>`).join("");
      $("doc-topics").hidden = false;
    }
    // Ways into this speaker's wider record. External links are SEARCHES, so
    // a shared name shows candidates rather than asserting the wrong person.
    const speakerLinks = $("doc-speaker-links");
    if (doc.speaker) {
      const q = encodeURIComponent(doc.speaker);
      const ext = (href, label) =>
        `<a href="${href}" rel="noopener" target="_blank">${label} ↗</a>`;
      speakerLinks.innerHTML = `Research ${esc(doc.speaker)}: ` + [
        ext(`https://theyvoteforyou.org.au/search?query=${q}`, "voting record"),
        ext(`https://www.aph.gov.au/Senators_and_Members/Parliamentarian_Search_Results?q=${q}`, "parliamentary profile"),
        ext(`https://en.wikipedia.org/w/index.php?search=${encodeURIComponent(`${doc.speaker} Australian politician`)}`, "Wikipedia"),
      ].join(" · ");
      speakerLinks.hidden = false;
    }
    if (doc.summary) {
      $("doc-brief-text").textContent = doc.summary;
      $("doc-brief").hidden = false;
    }
    $("doc-text").textContent = doc.text || "(no text)";
    $("doc-actions").hidden = false;
    $("doc-profile").hidden = !doc.speaker;
    $("doc-more").hidden = !doc.speaker;
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
        ? "No document with this identifier. It may not be indexed yet."
        : String(err.message || err), true);
    $("doc-title").textContent = "Document unavailable";
  }
}

$("doc-back").addEventListener("click", () => {
  // history.length counts cross-origin entries too: a visitor arriving on a
  // shared citation link would be sent back OFF the site. Only go back if
  // this app has navigated at least once; otherwise go home.
  if (routeCount > 1) history.back();
  else location.hash = "#/";
});
// Toolbar buttons: labels live in the markup; wrap them with the house icons.
for (const [id, icon] of [
  ["doc-profile", "map"], ["doc-cite", "cite"], ["doc-more", "speeches"],
  ["doc-similar", "search"], ["doc-copylink", "link"],
]) {
  const btn = $(id);
  btn.innerHTML = `${iconSvg(icon)}<span>${esc(btn.textContent)}</span>`;
}
$("doc-cite").addEventListener("click", () => {
  const panel = $("doc-cite-panel");
  panel.hidden = !panel.hidden;
  $("doc-cite").setAttribute("aria-expanded", String(!panel.hidden));
});
$("doc-copylink").addEventListener("click", () => {
  // Swap only the label span so the "Copied" feedback keeps the icon.
  if (currentDocSlug) copyText(opaxUrl(currentDocSlug), $("doc-copylink").querySelector("span"));
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
$("doc-profile").addEventListener("click", () => {
  if (!currentDoc?.speaker) return;
  location.hash = subjectHash("person", currentDoc.speaker);
});

// --- reports ----------------------------------------------------------------

// One fetch for everyone who needs the index (reports panel, front page,
// the Reports megamenu); a failure leaves reportsIndex null so callers keep
// their own empty states.
let reportsIndexPromise = null;
function loadReportsIndex() {
  reportsIndexPromise ??= api("/reports/index.json")
    .then((d) => (reportsIndex = d.reports || []))
    .catch(() => null);
  return reportsIndexPromise;
}

async function loadReportsList(manageFocus) {
  const list = $("reports-list");
  currentReportSlug = null;
  $("report-view").hidden = true;
  list.hidden = false;
  if (!reportsIndex) {
    await loadReportsIndex();
    if (!reportsIndex) {
      setStatus($("reports-status"),
        "No reports published yet. They are generated from the corpus and will appear here.");
      return;
    }
  }
  setStatus($("reports-status"), "");
  list.replaceChildren(
    ...reportsIndex.map((r) => {
      const card = document.createElement("button");
      card.className = "report-card";
      card.innerHTML = `${reportGlyph(r.slug, "card-glyph")}<span class="card-title">${esc(r.title)}</span>
        <span class="card-blurb">${esc(r.blurb)}</span>
        <span class="card-meta">Updated ${esc(fmtDate(r.updated || ""))}</span>`;
      card.addEventListener("click", () => { location.hash = `#/reports/${r.slug}`; });
      return card;
    }),
  );
  if (manageFocus) list.querySelector(".report-card")?.focus();
}

// Charts: single-hue bronze marks (CSS-owned); sr-only data table carries the values.
// `note` is escaped here; `noteHTML` is trusted markup the caller has already
// escaped piece by piece (it exists so a note can carry a link).
function columnChart(pairs, { fmt = String, heading, note, noteHTML }) {
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
    ${noteHTML ? `<p class="chart-note">${noteHTML}</p>` : ""}
    ${note ? `<p class="chart-note">${esc(note)}</p>` : ""}
  </figure>`;
}

function barList(rows, { fmt = String, heading, linkTo, partyDots = false }) {
  const max = Math.max(...rows.map(([, v]) => v), 1);
  const items = rows.map(([name, v]) => `
    <div class="barrow">
      ${linkTo
        ? `<a class="barrow-name" title="${esc(name)}" href="${esc(linkTo(name))}">${partyDots ? partyDotHTML(name) : ""}${esc(name)}</a>`
        : `<span class="barrow-name" title="${esc(name)}">${partyDots ? partyDotHTML(name) : ""}${esc(name)}</span>`}
      <span class="barrow-track" aria-hidden="true"><i style="width:${Math.max((v / max) * 100, 1)}%"></i></span>
      <span class="barrow-value">${esc(fmt(v))}</span>
    </div>`).join("");
  return `<figure class="chart"><figcaption>${esc(heading)}</figcaption>${items}</figure>`;
}

const fmtIndustries = (list) => list.map((i) => i.replace(/_/g, " ")).join(", ");

const AEC_NOTE =
  "AEC disclosure data: donations under the disclosure threshold are not reported " +
  "and cannot appear here, so totals are a floor, not a ceiling.";

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

/** Peak entry ([year, value]) of a year→value map. */
function peakOf(series) {
  let best = null;
  for (const e of series) if (!best || e[1] > best[1]) best = e;
  return best;
}

/**
 * What the speech timeline actually says: where the peak was, how the latest
 * FULL year compares (the current year is always mid-count), and a link into
 * search filtered to the peak year when we know the topic to search for.
 * Returns trusted HTML for columnChart's noteHTML slot.
 */
function speechTrendNote(speechYears, topic) {
  const entries = [...speechYears.entries()].sort((a, b) => a[0] - b[0]);
  const [peakY, peakV] = peakOf(entries) ?? [];
  if (!peakY) return "";
  const nowY = new Date().getFullYear();
  const full = entries.filter(([y, v]) => y < nowY && v > 0);
  const [lastY, lastV] = full[full.length - 1] ?? [];
  let sentence;
  if (!lastY || peakY >= lastY) {
    sentence = `Mentions peaked in ${peakY} with ${peakV.toLocaleString()} speeches, the biggest year on record.`;
  } else {
    const drop = Math.round((1 - lastV / peakV) * 100);
    sentence = drop === 0
      ? `Mentions peaked in ${peakY} with ${peakV.toLocaleString()} speeches, and ${lastY} matched it.`
      : `Mentions peaked in ${peakY} with ${peakV.toLocaleString()} speeches; ${lastY} came in ${drop}% lower.`;
  }
  const link = topic
    ? ` <a href="${esc(searchHash(topic, { from: String(peakY), to: String(peakY) }))}">Read the ${esc(String(peakY))} speeches</a>.`
    : "";
  return esc(sentence) + link;
}

/** The paired speech/donation charts on one shared year axis (report page + homepage). */
function moneyWordsCharts(stats, { topic } = {}) {
  const don = stats.donations;
  const industries = fmtIndustries(don?.industries || []);
  const speechYears = toYearSeries(stats.timeline ?? []);
  const donYears = toYearSeries(don?.by_year ?? []);
  const paired = speechYears.size > 1 && donYears.size > 1;
  const domain = paired
    ? (() => {
        const all = [...new Set([...speechYears.keys(), ...donYears.keys()])].sort();
        const out = [];
        for (let y = all[0]; y <= all[all.length - 1]; y++) out.push(y);
        return out;
      })()
    : null;
  const seriesFor = (m) => (domain ?? [...m.keys()].sort()).map((y) => [y, m.get(y) ?? 0]);
  let out = "";
  if (speechYears.size > 1) {
    out += columnChart(seriesFor(speechYears), {
      heading: "Speeches per year", fmt: (v) => v.toLocaleString(),
      noteHTML: speechTrendNote(speechYears, topic),
    });
  }
  if (donYears.size > 1) {
    const [dPeakY, dPeakV] = peakOf(donYears.entries()) ?? [];
    out += columnChart(seriesFor(donYears), {
      heading: `Donations per financial year, plotted at end year (${industries})`,
      fmt: fmtMoney,
      note: (dPeakY ? `The biggest year ended ${dPeakY}, with ${fmtMoney(dPeakV)} disclosed. ` : "") +
        (paired
          ? "Shown together for comparison. OPAX does not claim one series causes the other. "
          : "") + AEC_NOTE,
    });
  }
  return out;
}

function renderStats(container, stats, topic) {
  if (!stats) { container.innerHTML = ""; return; }
  const don = stats.donations;
  const industries = fmtIndustries(don?.industries || []);
  let htmlOut = "";
  htmlOut += moneyWordsCharts(stats, { topic });
  if (don?.top_donors?.length) htmlOut += barList(don.top_donors, {
    heading: "Largest donors", fmt: fmtMoney,
    linkTo: (nm) => subjectHash("donor", nm) });
  if (stats.top_speakers?.length) htmlOut += barList(stats.top_speakers, {
    heading: "Most speeches on this topic", fmt: (v) => v.toLocaleString(),
    linkTo: (nm) => subjectHash("person", nm) });
  container.innerHTML = htmlOut;
}

let currentReportSlug = null;

/**
 * The evidence-brief layers of a report: prose lead, key figures traced to
 * the record, where the parties stand, and the reading list. Every value is
 * model- or corpus-derived text, so everything reaches the DOM via
 * textContent — never innerHTML.
 */
function renderReportBrief(report) {
  const kicker = (text) => {
    const p = document.createElement("p");
    p.className = "kicker";
    p.textContent = text;
    return p;
  };
  const docLink = (slug, title) => {
    const a = document.createElement("a");
    a.href = `#/doc/${slug}`;
    a.textContent = title || slug;
    return a;
  };

  const brief = $("report-brief");
  brief.replaceChildren();
  if (report.brief?.answer) {
    const body = document.createElement("div");
    body.className = "answer";
    renderAnswer(body, report.brief.answer);
    brief.append(body);
  }

  const figures = $("report-figures");
  figures.replaceChildren();
  if (report.key_stats?.length) {
    const grid = document.createElement("div");
    grid.className = "tiles";
    for (const s of report.key_stats) {
      const t = document.createElement("div");
      t.className = "tile";
      const b = document.createElement("b");
      b.textContent = s.value;
      const label = document.createElement("span");
      label.textContent = s.label;
      const src = document.createElement("span");
      src.className = "tile-source";
      src.append("— ", docLink(s.slug, s.source_title));
      if (s.detail) t.title = s.detail;
      t.append(b, label, src);
      grid.appendChild(t);
    }
    figures.append(kicker("Key figures: spoken on the record"), grid);
  }

  const positions = $("report-positions");
  positions.replaceChildren();
  if (report.positions?.length) {
    const list = document.createElement("ul");
    list.className = "position-list";
    for (const p of report.positions) {
      const li = document.createElement("li");
      const head = document.createElement("span");
      head.className = "position-party";
      head.innerHTML = partyChipHTML(p.party); // fixed map lookup, not model text
      if (!head.firstChild) head.textContent = p.party;
      const text = document.createElement("span");
      text.className = "position-text";
      text.textContent = ` ${p.position} `;
      const cite = document.createElement("span");
      cite.className = "source-meta";
      const who = [p.speaker, fmtDate(p.date || "")].filter(Boolean).join(", ");
      cite.append(who ? `${who} · ` : "", docLink(p.slug, "read the speech"));
      li.append(head, text, cite);
      list.appendChild(li);
    }
    positions.append(kicker("Where the parties stand"), list);
  }

  const moments = $("report-moments");
  moments.replaceChildren();
  if (report.key_moments?.length) {
    const ol = document.createElement("ol");
    ol.className = "source-list";
    ol.replaceChildren(...report.key_moments.map((m, i) => sourceItem(m, i + 1)));
    moments.append(kicker("Start reading: key speeches"), ol);
  }
}

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
    setStatus($("reports-status"), "That report could not be loaded. It may not exist yet.", true);
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
  $("report-title").innerHTML = `${reportGlyph(slug, "report-glyph")}${esc(report.title)}`;
  $("report-blurb").textContent = report.blurb;
  $("report-meta").textContent =
    `Generated ${fmtDate(report.generated_at || "")} · every claim cited to the record · corpus v${corpusVersion()}`;
  renderStats($("report-stats"), report.stats, report.title);
  {
    const st = report.stats;
    if (st) {
      const don = st.donations;
      $("report-figures").insertAdjacentHTML("beforeend", `<div class="tiles">
        ${tile((st.speech_count ?? 0).toLocaleString(), "speeches on the record")}
        ${tile((st.unique_speakers ?? 0).toLocaleString(), "parliamentarians spoke")}
        ${don ? tile(fmtMoney(don.total ?? 0), `donations: ${fmtIndustries(don.industries || [])}`) : ""}
      </div>`);
    }
  }
  renderReportBrief(report);
  $("report-download").innerHTML =
    `<a class="action-btn report-download-btn" href="/reports/${esc(slug)}.json">${iconSvg("download")}<span>Download the data behind this report</span></a>`;

  const sectionsEl = $("report-sections");
  if (!report.sections?.length) {
    sectionsEl.innerHTML =
      `<p class="status">The cited analysis for this investigation is generated from the full
      speech corpus, which is currently indexing. It will appear here automatically.</p>`;
  } else {
    sectionsEl.replaceChildren(
      ...report.sections.map((s, i) => {
        const sec = document.createElement("section");
        sec.className = "report-section";
        sec.id = `report-s-${i + 1}`;
        const h = document.createElement("h3");
        h.textContent = s.question;
        const body = document.createElement("div");
        body.className = "answer";
        renderAnswer(body, s.answer || "");
        sec.append(h, body);
        if (s.sources?.length) {
          const det = document.createElement("details");
          det.className = "chat-sources";
          const sum = document.createElement("summary");
          sum.textContent = `Sources (${s.sources.length})`;
          const ol = document.createElement("ol");
          ol.className = "source-list";
          ol.replaceChildren(...s.sources.map((src, j) => sourceItem(src, j + 1)));
          det.append(sum, ol);
          sec.append(det);
        }
        const tools = document.createElement("p");
        tools.className = "section-tools action-row";
        const linkBtn = document.createElement("button");
        linkBtn.type = "button";
        linkBtn.className = "action-btn";
        linkBtn.innerHTML = `${iconSvg("link")}<span>Copy link to this section</span>`;
        linkBtn.addEventListener("click", (e) =>
          copyText(siteUrl(`#/reports/${slug}/s/${i + 1}`), e.currentTarget.querySelector("span")));
        const askBtn = document.createElement("button");
        askBtn.type = "button";
        askBtn.className = "action-btn";
        askBtn.innerHTML = `${iconSvg("ask")}<span>Ask the record about this</span>`;
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
  if (frontRendered) renderFrontNumbers();
  // The stats page's hero figures come from the manifest, so a re-sync
  // updates them in one place.
  const donations = (m.sources || []).find((s) => s.name.startsWith("AEC donations"));
  const stat = (figure, label) =>
    `<span><span class="stat-figure">${figure}</span><span class="stat-label">${label}</span></span>`;
  $("stats-hero").innerHTML = [
    stat((m.collected_speeches ?? 0).toLocaleString(), "speeches collected"),
    stat("5", "parliaments"),
    donations ? stat(donations.docs.toLocaleString(), "donations classified") : "",
    donations ? stat(esc(donations.coverage), "coverage") : "",
  ].join("");
  const statsBody = $("stats-sources");
  if (statsBody && m.sources) {
    statsBody.innerHTML = m.sources.map((s) =>
      `<tr><td>${esc(s.name)}</td><td>${s.docs.toLocaleString()}</td><td>${esc(s.coverage)}</td></tr>`).join("");
  }
  if (m.version) $("stats-version").textContent = `Corpus version ${m.version}.`;
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
  $("stats-hero").innerHTML =
    '<span><span class="stat-figure">Half a million</span><span class="stat-label">speeches collected</span></span>' +
    '<span><span class="stat-figure">5</span><span class="stat-label">parliaments</span></span>';
});

fetch("/suggestions.json").then((r) => r.json()).then((s) => {
  suggestions = s.questions || [];
  renderChips();
}).catch(() => {});

api("/api/stats")
  .then((s) => {
    liveStats = s;
    const line = `${(s.resources ?? 0).toLocaleString()} documents · ` +
      `${(s.paragraphs ?? 0).toLocaleString()} passages indexed · growing daily`;
    $("stats").textContent = line;
    $("stats-live").textContent = `Live index: ${line}.`;
    renderCorpusMeter();
    if (frontRendered) renderFrontNumbers();
  })
  .catch(() => {
    $("stats").textContent = "corpus loading…";
    $("stats-live").textContent = "Live index figures are unavailable right now.";
  });

// Legacy entry contract: /?ask=<question> (used by standalone map pages).
{
  const legacyAsk = new URLSearchParams(location.search).get("ask");
  if (legacyAsk) {
    history.replaceState(null, "", `/${askHash(legacyAsk)}`);
  }
}

route();
