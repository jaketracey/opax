/* OPAX portal — vanilla JS, no build step.
   The hash is the single source of truth for navigation; route() renders it. */

"use strict";

const $ = (id) => document.getElementById(id);

// --- shared state -----------------------------------------------------------

let corpusManifest = null; // /corpus.json
let liveStats = null; // /api/stats
let suggestions = []; // /suggestions.json
let reportsIndex = null;
// `key` is the search identity (query + filters, no page, no sort): it says
// whether a run is a new result set or another page of the one on screen.
let lastSearch = {
  key: "", query: "", filters: {}, sort: "relevance", results: [],
  page: 1, perPage: 20, pageCount: 1, total: 0, truncated: false,
};
let lastAsk = { question: "", sources: [] };
let currentDocSlug = null;
let currentDoc = null;

const PANELS = ["ask", "chat", "search", "money", "reports", "explore", "doc", "subject", "about", "methods", "stats", "expenses"];

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

// --- resource titles --------------------------------------------------------
// Corpus titles carry the speaker and the date inside the string itself
// ("J.A.W. Gardner — Childcare Sector — 2020-06-04"), and every list that shows
// a title shows a meta line with the same speaker and the same date underneath
// it. Read straight, the heading says both facts twice and buries the subject
// in the middle. These two take the ends off so the heading is the subject.
//
// Only the record's OWN speaker and date come off, never a leading segment that
// merely looks like a name: the corpus holds titles whose first segment IS the
// subject, and guessing there would eat it.

/** Trim, collapse whitespace, casefold: for comparing, never for rendering. */
const titleKey = (s) => String(s ?? "").replace(/\s+/g, " ").trim().toLowerCase();

/** How a date may be written at the end of a title: as ISO, or as we render it. */
function titleDateForms(value) {
  const iso = String(value ?? "").slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return iso ? [titleKey(iso)] : [];
  return [iso, titleKey(fmtDate(iso))];
}

/**
 * The subject a title carries, or "" when it holds nothing but the speaker and
 * the date. Splitting keeps the separators, so a subject with an em dash of its
 * own ("Budget — the reply") comes back exactly as the record wrote it.
 */
function titleSubject(rec) {
  const parts = String(rec?.title ?? "").trim().split(/(\s+—\s+)/);
  if (rec?.speaker && titleKey(parts[0]) === titleKey(rec.speaker)) parts.splice(0, 2);
  const dates = titleDateForms(rec?.date ?? rec?.metadata?.date);
  if (parts.length && dates.includes(titleKey(parts[parts.length - 1]))) parts.splice(-2);
  return parts.join("").trim();
}

/**
 * A resource title as a reader should see it. A title that is only a speaker
 * and a date has no subject to fall back on, so it stands whole: the name is
 * all the reader has. Exports and citations never come through here; they
 * quote the record's own title verbatim.
 */
function displayTitle(rec) {
  return titleSubject(rec) || String(rec?.title || rec?.slug || "");
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

function samePartyLabel(a, b) {
  const la = PARTY_MAP[String(a).toLowerCase()]?.[1] || String(a);
  const lb = PARTY_MAP[String(b).toLowerCase()]?.[1] || String(b);
  return la === lb;
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

/**
 * Replay a finished answer through the streaming painter, so an answer served
 * from cache arrives the way a freshly written one does. It is the same
 * machinery, fed on a timer: the text goes in as a fixed number of slices cut
 * on whitespace, and the painter already coalesces to one parse every 120ms,
 * so a long answer costs no more paints than a short one. Readers who ask for
 * less motion get the finished text at once.
 */
function replayAnswer(container, text, alive) {
  const body = String(text || "");
  if (!body || !matchMedia("(prefers-reduced-motion: no-preference)").matches) {
    renderAnswer(container, body);
    return;
  }
  const SLICES = 16, TOTAL_MS = 850;
  const cuts = [];
  for (let i = 1; i <= SLICES; i++) {
    const at = Math.round((body.length * i) / SLICES);
    const ws = i === SLICES ? body.length : body.indexOf(" ", at);
    const cut = ws === -1 ? body.length : ws;
    if (cut > (cuts[cuts.length - 1] ?? 0)) cuts.push(cut);
  }
  const live = streamRenderer(container, alive);
  let n = 0, from = 0;
  const step = () => {
    if (alive && !alive()) { live.stop(); return; }
    const to = cuts[n++];
    live.push(body.slice(from, to));
    from = to;
    if (n < cuts.length) { setTimeout(step, TOTAL_MS / cuts.length); return; }
    // The painter trims trailing half-written markdown as it goes. If that
    // trimming would change the finished text, repaint it exactly once done.
    if (streamSafeText(body) !== body) {
      setTimeout(() => { if (!alive || alive()) renderAnswer(container, body); }, 160);
    }
  };
  step();
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

// Shared and cited links take the PATH form (https://opax.com.au/doc/speech-1):
// the Worker serves those paths with per-page titles and previews, and the app
// routes on them (docs/SEO.md). pathFor() accepts either form, so a caller
// passing the older "#/..." shape still gets a clean permalink.
function siteUrl(target) {
  return `${SITE_ORIGIN}${pathFor(target)}`;
}

// The route builders — askHash, moneyHash, subjectHash, directoryHash,
// searchHash — return the ROOT-RELATIVE PATH of a route ("/ask?q=…"), which is
// what an href, a pushState and a permalink all want. They kept their names
// through the move off the hash router: renaming them would have churned a
// hundred call sites for nothing.
function askHash(q, kind) {
  const scope = kind && kind !== "speech" ? `&kind=${encodeURIComponent(kind)}` : "";
  return `/ask?q=${encodeURIComponent(q)}${scope}`;
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

function updateAskYearsLabel() {
  const lab = $("a-years-label");
  if (!lab) return;
  let a = Number($("a-from").value), b = Number($("a-to").value);
  if (a > b) [a, b] = [b, a];
  lab.textContent = `${a}–${b}`;
}

{
  const btn = $("ask-options-btn");
  const pop = $("ask-options-pop");
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
  $("a-from")?.addEventListener("input", updateAskYearsLabel);
  $("a-to")?.addEventListener("input", updateAskYearsLabel);
  // Chips and popover in step both ways: a control changing re-draws the chips
  // and, once a question is on the page, asks it again under the new filters.
  // Range inputs fire `change` on release, so dragging a year is one ask.
  for (const id of ["a-speaker", "a-party", "a-state", "a-topic", "a-from", "a-to", "ask-wide"]) {
    $(id)?.addEventListener("change", askFiltersChanged);
  }
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
  return siteUrl(`/doc/${slug}`);
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

/* A reader who lands on a box they came to type in should already hold the
   caret. Guarded three ways: never when the box already holds a query (paging
   back to results must not steal focus), never without a fine pointer (on a
   phone the keyboard would cover the page they came to read), and never with a
   scroll, so the caret does not drag the view. */
function focusEntry(id) {
  if (!matchMedia("(hover: hover) and (pointer: fine)").matches) return;
  const el = $(id);
  if (!el || el.value.trim()) return;
  el.focus({ preventScroll: true });
}

function showPanel(name) {
  // Methods and the expense-category glossary live under the About menu, so its
  // trigger stays lit there; the drawer has exact links of its own.
  const headerName = name === "methods" || name === "expenses" ? "about" : name;
  for (const t of document.querySelectorAll("#primary-nav [data-panel], #nav-drawer [data-panel]")) {
    const active = t.dataset.panel === (t.closest("#nav-drawer") ? name : headerName);
    t.classList.toggle("active", active);
    if (t.tagName !== "A") continue; // aria-current marks pages, not disclosure buttons
    if (active) t.setAttribute("aria-current", "page");
    else t.removeAttribute("aria-current");
    // The drawer's sections fold; the one holding the current page opens.
    if (active) { const group = t.closest("details.drawer-group"); if (group) group.open = true; }
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
  expenses: "What the expense categories mean · OPAX",
};

// --- money map (lazy-loaded 3D bundle) --------------------------------------
// One export per jurisdiction, all in the same node/edge shape, loaded one at
// a time: AEC returns of federally registered parties already include their
// state branches' receipts, so a Queensland gift to the LNP can sit in both
// the federal and the Queensland file. Jurisdiction is a filter, never a sum.
// Western Australia, the ACT and the Northern Territory are in parli.db but
// WAEC, Elections ACT and the NTEC each assert copyright with no open licence,
// so they are not shipped (docs/DATA-MONEY.md section 1.1).

const STATE_NOT_SUMMED =
  "State and federal returns are not summed: AEC returns already include state branch receipts.";

const MONEY_JURISDICTIONS = {
  federal: { label: "Federal", file: "/graph/money.json" },
  qld: { label: "Queensland", file: "/graph/money.qld.json" },
  vic: { label: "Victoria", file: "/graph/money.vic.json" },
  tas: { label: "Tasmania", file: "/graph/money.tas.json" },
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
  return q ? `/money?${q}` : "/money";
}

function renderMoneySwitch(jur) {
  const box = $("money-jur");
  if (!box) return;
  box.innerHTML = Object.entries(MONEY_JURISDICTIONS).map(([k, c]) =>
    `<button type="button" data-jur="${esc(k)}" aria-pressed="${k === jur ? "true" : "false"}">${esc(c.label)}</button>`).join("");
  for (const btn of box.querySelectorAll("button")) {
    btn.addEventListener("click", () => { goRoute(moneyHash(btn.dataset.jur)); });
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
  // The note runs the width of the map; its two ways out are buttons, not prose.
  return `<span class="money-note-text">${parts.filter(Boolean).map((s) => esc(s)).join(" ")}</span>
      <span class="money-note-actions">${actionBtn("download", cfg.file, "Download the data")}${actionBtn("map", full, "Full-screen map")}</span>`;
}

let moneyMapHandle = null;
let moneyMapJur = null;     // jurisdiction the mounted map shows
let moneyMapLoading = null; // jurisdiction of the mount in flight
let moneyMapIsolate = null; // industry cluster the route asked to isolate (/money?industry=)

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

// --- breadcrumb -------------------------------------------------------------
// The strip under the masthead. The router sets it on every route change;
// pages whose name arrives later (a document's speaker, a report's title)
// call it again once they know, guarded by their own stale-fetch checks.
// `items` is the trail after Home: [{ label, href? }], the last being the
// page itself (plain text, aria-current). Ancestors without an href are
// plain text too: a step in the hierarchy with no page of its own.

const CRUMB_SEP =
  '<svg class="crumb-sep" viewBox="0 0 6 10" aria-hidden="true"><path d="M1 1l4 4-4 4" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>';

function setCrumbs(items) {
  const bar = $("crumbs");
  if (!bar) return;
  if (!items?.length) { bar.hidden = true; return; } // the home page needs none
  const trail = [{ label: "Home", href: "/" }, ...items];
  const list = bar.querySelector("ol");
  list.replaceChildren(...trail.map((it, i) => {
    const li = document.createElement("li");
    const here = i === trail.length - 1;
    if (i > 0) li.insertAdjacentHTML("afterbegin", CRUMB_SEP);
    const el = document.createElement(!here && it.href ? "a" : "span");
    el.className = "crumb-label";
    el.textContent = String(it.label || "");
    if (el.tagName === "A") el.href = it.href;
    if (here) { li.className = "crumb-here"; li.setAttribute("aria-current", "page"); }
    li.appendChild(el);
    return li;
  }));
  bar.hidden = false;
  list.scrollLeft = 0;
}

/** A label short enough for the strip: the current page, not its full title. */
function crumbLabel(s, max = 60) {
  const t = String(s || "").replace(/\s+/g, " ").trim();
  return t.length > max ? `${t.slice(0, max - 1).trimEnd()}…` : t;
}

// The band is sticky, so scroll targets and sticky asides offset by its real
// height: measured once it has rendered, and again whenever it reflows
// (breakpoints, font load). style.css carries per-breakpoint estimates so
// the first paint is right too.
{
  const band = document.querySelector("header");
  const measure = () => document.documentElement.style.setProperty("--header-h", `${band.offsetHeight}px`);
  if (band && "ResizeObserver" in window) new ResizeObserver(measure).observe(band);
  if (band) measure();
}

let firstRoute = true;

function rawFragment() {
  // location.hash is percent-DECODED in Firefox; parse from href so encoded
  // & / = / % inside queries survive reload and back/forward everywhere.
  return location.href.split("#")[1] || "";
}

/* --- routes are real paths --------------------------------------------------
   /subject/person/Anthony%20Albanese, /reports/gambling, /search?q=…: the
   Worker serves each one with its own head (docs/SEO.md) and the address bar
   shows what a reader can copy. The older "#/…" form is still understood
   everywhere it survives — bookmarks, shared links, the bundled explore
   modules, anything assigning location.hash — and is folded to the path form
   as it arrives, so one page never has two URLs. */

/** The route now showing, as "/path?query"; a route-shaped hash still wins. */
function hereRoute() {
  const frag = rawFragment();
  return frag.startsWith("/") ? frag : `${location.pathname}${location.search}`;
}

/** The path form of a link target: "#/money", "/#/money" and "/money" all give "/money". */
function pathFor(target) {
  const s = String(target ?? "");
  const cut = s.startsWith("/#") ? s.slice(2) : s.startsWith("#") ? s.slice(1) : s;
  return cut.startsWith("/") ? cut : `/${cut}`;
}

/** Rewrite the address bar to a route without adding a history entry. */
function replaceRoute(target) {
  history.replaceState(null, "", pathFor(target));
}

/** Navigate inside the app: a history entry, then a render. */
function goRoute(target) {
  const to = pathFor(target);
  if (rawFragment() || to !== `${location.pathname}${location.search}`) history.pushState(null, "", to);
  route();
}

function parseHash() {
  const h = hereRoute().replace(/^\/?/, "");
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

  if (view !== "subject") { destroySubjectMap(); currentSubjectKey = null; }
  if (view === "subject" && segs[1] === "topic") {
    showPanel("subject");
    document.title = TITLES.subject;
    if (segs[2]) {
      const slug = decodeURIComponent(segs[2]);
      setCrumbs([{ label: "Topics", href: "/subject/topic" }, { label: TOPICS[slug] || slug }]);
      openTopicPage(slug, manageFocus);
    } else {
      setCrumbs([{ label: "Topics" }]);
      openTopicsIndex(manageFocus);
    }
  } else if (view === "subject" && segs[1] && segs[2]) {
    showPanel("subject");
    document.title = TITLES.subject;
    const name = decodeURIComponent(segs[2]);
    // The group step leads to that kind's index (/subject/person etc.).
    const group = DIRECTORY_KINDS[segs[1]];
    setCrumbs([group ? { label: group, href: `/subject/${segs[1]}` } : { label: "Encyclopedia" }, { label: name }]);
    openSubject(segs[1], name, manageFocus);
  } else if (view === "subject" && DIRECTORY_KINDS[segs[1]]) {
    showPanel("subject");
    document.title = `${DIRECTORY_KINDS[segs[1]]} · OPAX`;
    setCrumbs([{ label: DIRECTORY_KINDS[segs[1]] }]);
    openDirectory(segs[1], params, manageFocus);
  } else if (view === "doc" && segs[1]) {
    showPanel("doc");
    document.title = TITLES.doc;
    // Provisional until the document loads and names its speaker.
    setCrumbs([{ label: "Search", href: "/search" },
      { label: segs[1].split("-")[0] === "division" ? "Division" : "Document" }]);
    openDocPage(segs[1], manageFocus);
  } else if (view === "chat") {
    showPanel("chat");
    document.title = TITLES.chat;
    setCrumbs([lastAsk.question ? { label: "Ask", href: askHash(lastAsk.question) } : { label: "Ask" },
      { label: "Keep asking" }]);
    initChat(manageFocus);
  } else if (view === "search") {
    showPanel("search");
    document.title = TITLES.search;
    setCrumbs([{ label: "Search" }]);
    applySearchParams(params);
    focusEntry("search-input");
  } else if (view === "reports") {
    showPanel("reports");
    document.title = TITLES.reports;
    if (segs[1]) {
      // The index (when loaded) has the title; the slug stands in until the
      // report itself arrives and openReport sets the real one.
      const known = reportsIndex?.find((r) => r.slug === segs[1]);
      setCrumbs([{ label: "Reports", href: "/reports" },
        { label: known?.title || segs[1].replace(/-/g, " ").replace(/^./, (c) => c.toUpperCase()) }]);
      openReport(segs[1], segs[3] ? Number(segs[3]) : null, manageFocus);
    } else {
      setCrumbs([{ label: "Reports" }]);
      loadReportsList(manageFocus);
    }
  } else if (view === "money") {
    showPanel("money");
    document.title = TITLES.money;
    setCrumbs([{ label: "Money map" }]);
    mountMoney(params.get("jur"), params.get("industry"));
  } else if (view === "explore") {
    showPanel("explore");
    document.title = TITLES.explore;
    // A game already open (e.g. reload with its dialog up) keeps its own crumb.
    const open = Object.entries(GAMES).find(([, g]) => $(g.dialog)?.open);
    setCrumbs(open ? [{ label: "Explore", href: "/explore" }, { label: open[1].name }] : [{ label: "Explore" }]);
  } else if (view === "about") {
    showPanel("about");
    document.title = TITLES.about;
    setCrumbs([{ label: "About" }]);
  } else if (view === "methods") {
    showPanel("methods");
    document.title = TITLES.methods;
    setCrumbs([{ label: "About", href: "/about" }, { label: "Methods & how to cite" }]);
  } else if (view === "stats") {
    showPanel("stats");
    document.title = TITLES.stats;
    setCrumbs([{ label: "About", href: "/about" }, { label: "Corpus stats" }]);
  } else if (view === "expenses") {
    showPanel("expenses");
    document.title = TITLES.expenses;
    setCrumbs([{ label: "About", href: "/about" }, { label: "Expense categories" }]);
    renderExpenseGlossary();
  } else {
    showPanel("ask");
    document.title = TITLES.ask;
    const q = params.get("q");
    // Home shows no trail; a question is a page of its own; anything else
    // that landed here is a route the app does not know.
    if (view !== "ask" && view !== "") setCrumbs([{ label: "Not found" }]);
    else setCrumbs(q ? [{ label: "Ask" }] : null);
    if (view === "ask" && q && q !== lastAsk.question) {
      $("ask-input").value = q;
      if ($("ask-wide")) $("ask-wide").checked = params.get("kind") === "all";
      renderAskFilterChips(); // a shared &kind=all link arrives with a filter on
      runAsk(q);
    } else if (!q && $("ask-result").hidden) {
      renderFrontPage();
      focusEntry("ask-input");
    }
  }
  syncPathMeta();
  // A pushState fires no event of its own, so the render announces itself:
  // gtm.js counts a page view from this (title and canonical already set).
  dispatchEvent(new Event("opax:route"));
  // A view change can hide the element that held focus (e.g. a button on the
  // page just left); catch the drop so keyboard users keep a place in the page.
  if (manageFocus && document.activeElement === document.body) {
    document.querySelector("main").focus();
  }
  // Fresh view, fresh top of page (section deep-links re-scroll themselves).
  if (manageFocus) window.scrollTo(0, 0);
}

function resetAsk() {
  if (askAbort) { askAbort.abort(); askAbort = null; }
  foldHero(false);
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
// It owns the click (the delegated router below would otherwise navigate a
// second time), clears the ask, and lands on "/" with the front page rebuilt.
const goHomeFresh = (e) => {
  e?.preventDefault?.();
  resetAsk();
  goRoute("/");
  window.scrollTo(0, 0);
};
for (const el of document.querySelectorAll(".logo, .masthead-name a")) el.addEventListener("click", goHomeFresh);

document.querySelector('a[href="#main"]')?.addEventListener("click", (e) => {
  e.preventDefault();
  document.querySelector("main").focus();
});

// --- quick search (masthead and drawer) -----------------------------------
// One input over everything with a page: speakers, topics, donors and
// parties, reports — plus a plain search of the record as the first row.
// The masthead field and the drawer field share the engine; only where the
// panel lives and what happens on the way out differ.
function attachQuickSearch(input, panel, { idPrefix, beforeGo } = {}) {
  if (!input || !panel) return;
  let items = [];
  let active = -1;
  let seq = 0;
  let debounce = null;
  const prefix = idPrefix || "ms";
  const close = () => {
    panel.hidden = true;
    input.setAttribute("aria-expanded", "false");
    active = -1;
  };
  const go = (href) => {
    close();
    input.value = "";
    input.blur();
    beforeGo?.();
    goRoute(href);
  };
  const render = () => {
    panel.replaceChildren(...items.map((it, i) => {
      const b = document.createElement("button");
      b.type = "button";
      b.className = "ms-row" + (i === active ? " ms-active" : "");
      b.setAttribute("role", "option");
      b.id = `${prefix}-opt-${i}`;
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
    input.setAttribute("aria-activedescendant", active >= 0 ? `${prefix}-opt-${active}` : "");
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
        out.push({ label: disp, type: "Topic", href: `/subject/topic/${slug}` });
      }
      for (const n of (moneyData?.nodes || []).filter((n) => n.label.toLowerCase().includes(ql)).slice(0, 3)) {
        out.push({
          label: n.label,
          type: n.kind === "party" ? "Party" : "Donor",
          href: subjectHash(n.kind === "party" ? "party" : "donor", n.label),
        });
      }
      for (const r of (reportsIndex || []).filter((r) => (r.title || "").toLowerCase().includes(ql)).slice(0, 2)) {
        out.push({ label: `${r.title} report`, type: "Report", href: `/reports/${r.slug}` });
      }
    } catch { /* the plain-search row stands alone */ }
    if (my !== seq) return;
    items = out.slice(0, 10);
    active = -1;
    render();
  };
  input.addEventListener("input", () => {
    clearTimeout(debounce);
    debounce = setTimeout(suggest, 120);
  });
  input.addEventListener("keydown", (e) => {
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
  input.addEventListener("focus", () => { if (items.length) { panel.hidden = false; input.setAttribute("aria-expanded", "true"); } });
  document.addEventListener("pointerdown", (e) => {
    if (!panel.hidden && !panel.contains(e.target) && e.target !== input) close();
  });
  return { close, go };
}
attachQuickSearch($("mast-q"), $("mast-sugg"), { idPrefix: "ms" });
attachQuickSearch($("drawer-q"), $("drawer-sugg"), { idPrefix: "ds", beforeGo: () => closeNavDrawer() });

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

// A file under a route's own prefix is still a file: /reports/gambling.json is
// the report's data download, not the report page.
const ROUTE_FILE = /\.(json|csv|xml|txt|pdf|zip|png|jpe?g|webp|svg|js|css|html?)$/i;
/** Is this path one of ours to render, or a real file for the browser to fetch? */
const isRoute = (path) => {
  const bare = path.split("?")[0];
  if (ROUTE_FILE.test(bare)) return false;
  const first = bare.replace(/^\//, "").split("/")[0];
  return first === "" || PANELS.includes(first);
};
// One delegated listener owns in-app navigation. An anchor whose href is a
// route of ours — the path form, or the "#/…" form still written by the app's
// own markup and by the bundled explore modules — is followed in place, so the
// address bar keeps the real path and nothing reloads. Modified clicks, new
// tabs, downloads, off-site links, real files (/map, /reports/x.json) and
// plain in-page anchors (#main) are left to the browser.
document.addEventListener("click", (e) => {
  if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
  const a = e.target instanceof Element ? e.target.closest("a[href]") : null;
  if (!(a instanceof HTMLAnchorElement) || a.target || a.hasAttribute("download")) return;
  const raw = a.getAttribute("href") || "";
  let to;
  if (raw.startsWith("#/")) to = raw.slice(1);
  else if (raw.startsWith("/#/")) to = raw.slice(2);
  else if (raw.startsWith("#")) return; // native in-page anchor
  else if (a.origin === location.origin) to = `${a.pathname}${a.search}`;
  else return;
  if (!isRoute(to)) return;
  e.preventDefault();
  goRoute(to);
});

// Back and forward now move between real paths, so popstate does the routing.
// hashchange stays for anything still assigning location.hash (older code, and
// code arriving from another branch); it folds that assignment to the path
// form before rendering, so the hash never survives a navigation.
window.addEventListener("popstate", route);
window.addEventListener("hashchange", () => {
  const frag = rawFragment();
  if (frag.startsWith("/")) replaceRoute(frag);
  route();
});

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
    <a class="mm-link" href="/reports/${esc(r.slug)}">${reportGlyph(r.slug, "mm-glyph")}
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
// Closing animates the panel out before the dialog actually closes; every
// close path goes through here so the motion is the same from a link, the X,
// the backdrop or Escape.
function closeNavDrawer() {
  const drawer = $("nav-drawer");
  if (!drawer?.open || drawer.classList.contains("is-closing")) return;
  if (matchMedia("(prefers-reduced-motion: reduce)").matches) { drawer.close(); return; }
  let done = false;
  const finish = () => {
    if (done) return;
    done = true;
    drawer.classList.remove("is-closing");
    drawer.close();
  };
  drawer.classList.add("is-closing");
  drawer.addEventListener("animationend", (e) => { if (e.target === drawer) finish(); }, { once: true });
  setTimeout(finish, 300); // the animation is 220ms; this is the safety net
}
{
  const drawer = $("nav-drawer");
  const toggle = $("nav-open");
  toggle.addEventListener("click", () => {
    drawer.showModal();
    // The dialog itself takes focus, so a tap on the hamburger does not land
    // a focus ring on the first control; Tab still reaches everything.
    drawer.focus({ preventScroll: true });
    toggle.setAttribute("aria-expanded", "true");
  });
  drawer.addEventListener("close", () => toggle.setAttribute("aria-expanded", "false"));
  // Escape: run the same exit animation instead of the instant native close.
  drawer.addEventListener("cancel", (e) => { e.preventDefault(); closeNavDrawer(); });
  $("drawer-close").addEventListener("click", () => closeNavDrawer());
  // A search typed into the drawer lands on the Search page with the query.
  $("drawer-search").addEventListener("submit", (e) => {
    e.preventDefault();
    const q = $("drawer-q").value.trim();
    if (!q) return;
    closeNavDrawer();
    $("drawer-q").value = "";
    $("drawer-sugg").hidden = true;
    goRoute(`/search?q=${encodeURIComponent(q)}`);
  });
  drawer.addEventListener("click", (e) => {
    // A link tap navigates (the hash does the routing) and dismisses the drawer.
    if (e.target.closest("a")) { closeNavDrawer(); return; }
    const r = drawer.getBoundingClientRect(); // outside the panel = backdrop
    const inside = e.clientX >= r.left && e.clientX <= r.right &&
                   e.clientY >= r.top && e.clientY <= r.bottom;
    if (!inside) closeNavDrawer();
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
  btn.textContent = displayTitle(s);
  btn.addEventListener("click", () => { goRoute(`/doc/${s.slug}`); });
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
    : esc(displayTitle(s));
  return `<span class="kicker">From the record · ${i + 1} of ${n}</span>` +
    `<blockquote>${body}</blockquote>` +
    (meta ? `<span class="quote-meta"><span class="quote-portrait"></span><span>${meta}</span></span>` : "");
}

function setQuoteRail(sources) {
  quoteRail.sources = sources || [];
  quoteRail.idx = -1;
  updateQuoteRail();
}

// --- people rail ------------------------------------------------------------
// The rail opens on the people, not the passages: before a line has been read,
// the faces say whose words the answer rests on. The reader's first real
// scroll trades them for the quotes in the same slot, once and for good, so
// the rail never flickers between two panels on the way back up.

const peopleRail = { list: [], scrolled: false, base: 0, settleUntil: 0 };
const PEOPLE_MAX = 6;
/** Below this the page has not really moved: a trackpad twitch, not a read. */
const PEOPLE_SCROLL_PX = 24;

/**
 * The page also scrolls itself (the answer reveal, the hero folding away).
 * That motion is not the reader's, so hold the handover while it plays out.
 */
function holdPeopleRail(ms) {
  peopleRail.settleUntil = Math.max(peopleRail.settleUntil, Date.now() + ms);
  peopleRail.base = scrollY;
}

/** Distinct speakers behind these sources, in the order the answer cites them. */
function peopleFromSources(sources) {
  const seen = new Map();
  for (const s of sources || []) {
    const name = String(s.speaker || "").trim();
    if (!name || seen.has(name)) continue;
    seen.set(name, { name, party: s.party || "", state: s.state || "" });
  }
  return [...seen.values()];
}

function peopleCardHTML(people) {
  const rows = people.slice(0, PEOPLE_MAX).map((p) => {
    // Party where it is known; otherwise the parliament they sat in, which is
    // the only other thing a retrieved speech reliably says about a speaker.
    const sub = (p.party_now || p.party)
      ? partyChipHTML(p.party_now || p.party)
      : (p.state ? esc(STATE_NAMES[p.state] || p.state) : "");
    return `<li>` +
      `<a class="people-row" href="${esc(subjectHash("person", p.name))}" tabindex="-1">` +
      `<span class="people-face" data-speaker="${esc(p.name)}">` +
      `<span class="people-face-mono">${esc(p.name.slice(0, 1))}</span></span>` +
      `<span><span class="people-name">${esc(p.name)}</span>` +
      (sub ? `<span class="people-sub">${sub}</span>` : "") + `</span></a></li>`;
  }).join("");
  const rest = people.length - PEOPLE_MAX;
  return `<span class="kicker">Whose words this draws on</span>` +
    `<ul class="people-list">${rows}</ul>` +
    (rest > 0 ? `<p class="people-more">and ${rest} more in the sources</p>` : "");
}

/**
 * Hand the rail this answer's people. An answer that cites nobody nameable (a
 * procedural reply, or one drawn from news rather than speeches) leaves the
 * list empty and the quotes take the rail from the start, as they always did.
 */
function setPeopleRail(sources) {
  peopleRail.list = peopleRail.scrolled ? [] : peopleFromSources(sources);
  const card = $("people-card");
  card.innerHTML = peopleRail.list.length ? peopleCardHTML(peopleRail.list) : "";
  if (peopleRail.list.length) {
    loadPhotoMap().then(() => {
      for (const slot of card.querySelectorAll(".people-face[data-speaker]")) {
        const url = photoUrlFor(slot.dataset.speaker);
        if (url) slot.innerHTML = `<img src="${esc(url)}" alt="" width="28" height="28">`;
      }
    });
  }
  updateQuoteRail();
}

/** A new question: the people clear, and the first-scroll gate is re-armed. */
function resetPeopleRail() {
  peopleRail.list = [];
  peopleRail.scrolled = false;
  $("people-card").classList.remove("shown");
  $("people-card").replaceChildren();
  // Long enough to cover the hero folding away 900ms in and its transition.
  holdPeopleRail(1600);
}

/** Has the reader scrolled, as opposed to the page moving under them? */
function notePeopleScroll() {
  if (peopleRail.scrolled) return;
  // Inside a settling window every sample is the new baseline, so the page's
  // own motion cannot accumulate into the threshold.
  if (Date.now() < peopleRail.settleUntil) { peopleRail.base = scrollY; return; }
  if (Math.abs(scrollY - peopleRail.base) < PEOPLE_SCROLL_PX) return;
  peopleRail.scrolled = true;
}

let heroWaitTimer = 0;
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
  const clearOfFrom = (top, h) => sourcesTop > top + (h || 280) + 12;
  const clearOf = (h) => clearOfFrom(innerHeight * 0.3, h);
  const clearOfSources = clearOf(rail.offsetHeight);
  // Both states want the same thing: room to the answer's right, and an answer
  // to sit beside. Narrow screens have no rail, so neither state appears.
  const room = space >= 348 && !$("ask-result").hidden && rect.height > 1;
  // The people hold the slot until the reader's first real scroll. Reduced
  // motion skips the state outright rather than snapping between two panels.
  // ...and only once the hero has finished folding away. A cached answer comes
  // back almost at once, so without this the rail faded up while the line above
  // was still collapsing and the two moves fought each other.
  const heroLeft = heroSettledAt - Date.now();
  if (heroLeft > 0) {
    clearTimeout(heroWaitTimer);
    heroWaitTimer = setTimeout(updateQuoteRail, heroLeft + 16);
  }
  // The rail sits at 30vh (see .quote-rail), but the ask form runs wider than
  // the answer, so a card placed to the ANSWER's right still lands under the
  // form's button while the form is on screen. The quote state avoids this by
  // waiting for the answer to scroll up; the people state shows before any
  // scroll by design, so it drops below the form instead of hiding.
  const peopleTop = Math.max(innerHeight * 0.3, $("ask-form").getBoundingClientRect().bottom + 16);
  const people = room && heroLeft <= 0 && peopleRail.list.length > 0 && !peopleRail.scrolled &&
    !matchMedia("(prefers-reduced-motion: reduce)").matches &&
    rect.bottom > peopleTop + 24 && clearOfFrom(peopleTop, $("people-card").offsetHeight);
  // The card is fixed at 30vh: it may only appear once the answer's top has
  // actually scrolled up to that zone — otherwise it floats over the ask form
  // on short answers before any scrolling happens.
  const visible = room && !people && n > 0 &&
    rect.top < innerHeight * 0.3 + 8 && rect.bottom > innerHeight * 0.28 && clearOfSources;
  rail.hidden = !(visible || people);
  // Both states ride the answer's right edge, so the left is set for whichever
  // one is up, not only for the quotes.
  if (visible || people) rail.style.left = `${Math.round(rect.right + Math.min(48, space - 316))}px`;
  // Only the people state moves; the quotes keep the stylesheet's 30vh so they
  // stay aligned with the answer as it scrolls past.
  rail.style.top = people ? `${Math.round(peopleTop)}px` : "";
  const peopleCard = $("people-card");
  // The rail was display:none a statement ago; give the browser its zero state
  // to leave from, or the faces would land at full strength with no fade.
  if (people && !peopleCard.classList.contains("shown")) void peopleCard.offsetWidth;
  peopleCard.classList.toggle("shown", people);
  if (!visible) {
    quoteRail.idx = -1;
    // The rail can still be up with the people in it, so the quote has to be
    // put away by name rather than left to the rail's own hidden flag. A swap
    // already in flight would otherwise land on top of them.
    clearTimeout(quoteRail.swap);
    $("quote-card").classList.remove("shown");
    return;
  }
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
    card.onclick = (e) => { e.preventDefault(); goRoute(`/doc/${s.slug}`); };
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
  quoteRail.raf = requestAnimationFrame(() => {
    quoteRail.raf = 0;
    notePeopleScroll();
    updateQuoteRail();
  });
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
  const receipts = donors.reduce((a, n) => a + (n.count || 0), 0);
  const donorRows = donors.sort((a, b) => (b.total || 0) - (a.total || 0)).slice(0, 8)
    .map((n) => [n.label, n.total || 0]);
  box.hidden = false;
  box.innerHTML = `
    <p class="kicker">The money: ${esc(industryLabel(ind))} (AEC disclosures)</p>
    <div class="tiles">
      ${tile(fmtMoney(total), `disclosed by ${industryLabel(ind)} donors`)}
      ${tile(String(donors.length), "major donors disclosed")}
      ${tile(receipts.toLocaleString(), `disclosed donation${receipts === 1 ? "" : "s"}`)}
      ${tile(`${years[0]}–${years[1]}`, "years covered")}
    </div>
    <div class="money-charts">
      ${barList(donorRows, { fmt: fmtMoney, heading: "Largest donors", linkTo: (nm) => subjectHash("donor", nm) })}
      ${barList(partyRows, { fmt: fmtMoney, heading: "Where it went", linkTo: (nm) => subjectHash("party", nm), partyDots: true })}
    </div>
    <p class="fineprint">${esc(AEC_NOTE)}
      <a href="/money">Explore on the money map</a> ·
      <a href="/graph/money.json">Download the data</a></p>`;
  // Blocks rise in sequence (kicker, each figure, each chart, the note); fresh
  // nodes on every render, so a second question replays it. Motion is CSS-side.
  box.querySelectorAll(":scope > :not(.tiles, .money-charts), :scope > .tiles > .tile, :scope > .money-charts > .chart").forEach((el, i) => {
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
    `${iconSvg(icon)}<span>${esc(label)}${external ? " ↗︎" : ""}</span></a>`;
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

function photoIdFor(name) {
  return photoMap?.[String(name || "").trim().toLowerCase()] || null;
}
function photoUrlFor(name) {
  const pid = photoIdFor(name);
  return pid ? `/photos/${pid}.webp` : null;
}

// Portraits keyed "wd-<QID>" come from Wikimedia Commons under a per-file licence
// (photos/credits.json, written by scripts/fetch_commons_portraits.py). The credit is
// the licence condition, so it sits in the infobox beside the facts. Numeric keys are
// the official APH portraits (via OpenAustralia) under the site-wide CC BY-NC-ND and
// need no per-image line.
let portraitCreditsPromise = null;
async function renderPortraitCredit(name, key) {
  const id = photoIdFor(name);
  if (!id || !id.startsWith("wd-")) return;
  portraitCreditsPromise ??= fetch("/photos/credits.json").then((r) => (r.ok ? r.json() : null)).catch(() => null);
  const c = (await portraitCreditsPromise)?.[id];
  if (!c || currentSubjectKey !== key) return;
  const who = c.artist || c.credit || "author not recorded";
  const lic = c.licence ? (c.licence_url
    ? `, <a href="${esc(c.licence_url)}" rel="noopener" target="_blank">${esc(c.licence)}</a>` : `, ${esc(c.licence)}`) : "";
  const page = safeUrl(c.page);
  $("subject-infobox")?.querySelector("dl")?.insertAdjacentHTML("beforeend",
    `<dt>Photo</dt><dd>${esc(who)}${lic}, via ${page ? `<a href="${esc(page)}" rel="noopener" target="_blank">Wikimedia Commons ↗︎</a>` : "Wikimedia Commons"}</dd>`);
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
  return `/subject/${kind}/${encodeURIComponent(label)}`;
}

// Declared interests on person pages: the registers of members' interests
// (House 48th, Senate 48th, QLD 58th) exported by scripts/export_interests.py
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
      src ? `<a href="${esc(it.page ? `${src}#page=${Number(it.page) || 1}` : src)}" rel="noopener" target="_blank">${it.page ? `page ${esc(String(Number(it.page)))}` : "source"} ↗︎</a>` : "",
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
    <p class="fineprint">${esc(register)}; entries as declared, not verified by OPAX. One entry is one cell of the form, so a list typed in one cell counts once.${base ? ` <a href="${esc(base)}" rel="noopener" target="_blank">Open the register entry ↗︎</a>` : ""}</p>
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
  let best = null, byAlias = null;
  for (const n of moneyData.nodes) {
    if (kind && n.kind !== kind) continue;
    const c = normName(n.label);
    if (c === nn) return n;
    // A donor answers to every spelling the money data records for it, so a
    // /subject/donor/Westpac%20Bank link still opens Westpac Banking
    // Corporation after the seven Westpac spellings became one entity.
    if (!byAlias && n.aliases && n.aliases.some((a) => normName(a) === nn)) byAlias = n;
    if (!best && nn && (c.startsWith(nn) || nn.startsWith(c))) best = n;
  }
  return byAlias || best;
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
          <a href="/money">open the full map</a></p>
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

/** Hold (or release) the entry-page map's height before it has anything to show. */
function reserveSubjectMap(on) {
  const el = $("subject-map");
  if (!el) return;
  el.hidden = !on;
  el.classList.toggle("is-waiting", !!on);
  const hint = $("subject-map-hint");
  if (hint) hint.hidden = !on;
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
      scrub: true, // the year window, so a reader can watch the donors change
      askUrl: (industry) => askHash(`What has parliament said about ${industry.replace(/_/g, " ")}?`),
      onSelect: (node) => {
        if (!node || node.id === nodeId) return;
        goRoute(subjectHash(node.kind === "party" ? "party" : "donor", node.label));
      },
    });
    if (currentSubjectKey !== key) { handle.destroy?.(); return; } // navigated away while mounting
    el.classList.remove("is-waiting");
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
    <li><a class="news-headline" href="${esc(safeUrl(i.url) || "#")}" rel="noopener" target="_blank">${esc(i.title)} ↗︎</a>
      <span class="news-meta"><span class="news-source">${esc(srcName[i.source] || i.source || "")}</span>${i.published ? ` · ${esc(relTime(i.published))}` : ""}</span></li>`).join("");
  container.insertAdjacentHTML("beforeend", `
    <p class="kicker">In the news</p>
    ${list ? `<ol class="news-list" role="list">${list}</ol>` : `<p class="status" style="margin-top:0.2rem">Nothing in today's politics headlines mentions them.</p>`}
    <p class="fineprint">Search the outlets:
      <a href="https://www.abc.net.au/news/search?query=${q}" rel="noopener" target="_blank">ABC News ↗︎</a> ·
      <a href="https://www.theguardian.com/australia-news?query=${q}#search" rel="noopener" target="_blank">The Guardian ↗︎</a></p>`);
}

async function subjectMentions(name, container, heading) {
  try {
    const [data, roster] = await Promise.all([
      api(`/api/search?${new URLSearchParams({ q: `"${name}"`, top_k: "6" })}`), loadParliamentarians()]);
    if (!data.results?.length) return;
    // Speeches made from the chair or a ministry carry an office string, not a party, so the
    // chip goes missing (Michaelia Cash as Deputy Leader, Scott Ryan as President). The roster
    // knows the party; today's party for sitting members, the speech-dominant one otherwise.
    const byName = new Map((roster?.people || []).map((p) => [p.name.toLowerCase(), p.party_now || p.party]));
    for (const r of data.results) if (!r.party && r.speaker) r.party = byName.get(String(r.speaker).toLowerCase()) || null;
    const items = data.results.slice(0, 5).map((r) => `
      <li><a href="/doc/${esc(r.slug)}" class="source-title doc-title">${esc(displayTitle(r))}</a>
        <span class="result-meta">${metaHTML(r, { linkSpeaker: true, linkParty: true })}</span>
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
  await Promise.all([loadExpenses(), loadPhotoMap(), loadExpenseDefs()]);
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
    ${e.by_category?.length ? barList(e.by_category, { fmt: fmtMoney, heading: "By category", term: expenseTermKey }) : ""}
    ${e.by_year?.length > 1 ? columnChart(e.by_year, {
      fmt: fmtMoney, heading: "Claimed per year",
      note: "Summed by reporting quarter. IPEA data starts in April 2017 and runs to the latest published quarter, so the first and last years can be partial.",
    }) : ""}
    ${items ? `<figure class="chart"><figcaption>Five largest line items</figcaption>
      <ul class="subject-list" role="list" style="margin:0">${items}</ul></figure>` : ""}
    <p class="fineprint">${esc(IPEA_NOTE)} <a href="/expenses">What the categories mean</a>${src ? ` · <a href="${esc(src)}" rel="noopener" target="_blank">Latest quarter on data.gov.au ↗︎</a>` : ""}</p>`);
  $("subject-infobox")?.querySelector("dl")?.insertAdjacentHTML("beforeend",
    `<dt>Claimed expenses</dt><dd><b>${esc(fmtMoney(e.total))}</b></dd>`);
}

// --- expense categories: definitions, popover and glossary page --------------
// IPEA publishes its own category names and OPAX reproduces them unchanged, so
// most readers meet "COMCAR" or "Private-Plated Vehicle" with no idea what they
// cover. /expense-categories.json carries one definition per category, kept out
// of expenses.json because that is a per-person export regenerated from the DB
// by scripts/export_expenses.py and this is editorial copy. The same file feeds
// the row popovers and the /expenses glossary.

let expenseDefs = null;         // { meta, groups, byName, categories }
let expenseDefsPromise = null;

function loadExpenseDefs() {
  expenseDefsPromise ??= fetch("/expense-categories.json")
    .then((r) => (r.ok ? r.json() : null))
    .then((d) => {
      if (!d?.categories) return null;
      d.byName = Object.fromEntries(d.categories.map((c) => [c.name, c]));
      expenseDefs = d;
      initTermTips();
      return d;
    })
    .catch(() => null);
  return expenseDefsPromise;
}

/** The bar list's key for a category label, or null when nothing defines it.
 *  export_expenses.py rolls the tail up as "Other (N categories)". */
function expenseTermKey(name) {
  if (!expenseDefs) return null;
  if (expenseDefs.byName[name]) return name;
  return /^Other \(\d+ categor/.test(name) && expenseDefs.byName.Other ? "Other" : null;
}

// One popover for the whole page, moved next to whichever trigger opened it so
// Tab reaches its link, positioned in viewport coordinates so it can flip above
// the trigger and clamp to the screen edges.
let termTipEl = null;
let termTipTrigger = null;
let termTipTimer = 0;
let termTipsWired = false;

// Any element carrying one of these opens the card. `data-term` names a
// category in expense-categories.json; `data-tip` names a kind of trigger that
// describes itself from its own data attributes and needs no fetch.
const TERM_TIP_TRIGGER = "[data-term], [data-tip]";

const EXPENSE_TIP_ACTION = { href: "/expenses", text: "What the categories mean" };

/** The card's content for a trigger, as { name, text, note, action }, or null
 *  when nothing describes it (a category whose definitions have not landed
 *  yet, or a kind of trigger this build does not know). */
function termTipDef(trigger) {
  if (trigger.dataset.term) {
    const def = expenseDefs?.byName?.[trigger.dataset.term];
    return def ? { ...def, action: EXPENSE_TIP_ACTION } : null;
  }
  if (trigger.dataset.tip === "relevance") return relevanceTipDef(trigger.dataset.tipPct);
  return null;
}

/** The gold bar beside a search result. It is the retrieval engine's own score
 *  for the passage, and a reader who has never seen one reads it as a verdict,
 *  so the card says what it is and what it is not. */
function relevanceTipDef(pct) {
  const n = Number(pct);
  if (!Number.isFinite(n)) return null;
  return {
    name: `Relevance ${n}%`,
    text: "How strongly this passage matched your search, as scored by the retrieval engine.",
    note: "That is match strength, not truth or importance. The words of the record are the evidence.",
  };
}

function termTip() {
  if (termTipEl) return termTipEl;
  const tip = document.createElement("div");
  tip.id = "term-tip";
  tip.className = "term-tip";
  tip.hidden = true;
  tip.setAttribute("role", "tooltip");
  tip.innerHTML = '<b class="term-tip-name"></b><p class="term-tip-text"></p>' +
    '<p class="term-tip-note"></p>' +
    '<a class="term-tip-action"></a>';
  tip.addEventListener("pointerenter", cancelTermTipHide);
  tip.addEventListener("pointerleave", scheduleTermTipHide);
  document.body.append(tip);
  termTipEl = tip;
  return tip;
}

function showTermTip(trigger) {
  const def = termTipDef(trigger);
  if (!def) return;
  cancelTermTipHide();
  const tip = termTip();
  tip.querySelector(".term-tip-name").textContent = def.name;
  tip.querySelector(".term-tip-text").textContent = def.text || "";
  const note = tip.querySelector(".term-tip-note");
  note.textContent = def.note || "";
  note.hidden = !def.note;
  const action = tip.querySelector(".term-tip-action");
  if (def.action) { action.href = def.action.href; action.textContent = def.action.text; }
  action.hidden = !def.action;
  if (termTipTrigger && termTipTrigger !== trigger) termTipTrigger.removeAttribute("aria-describedby");
  termTipTrigger = trigger;
  trigger.setAttribute("aria-describedby", "term-tip");
  if (tip.previousElementSibling !== trigger) trigger.insertAdjacentElement("afterend", tip);
  tip.hidden = false;
  placeTermTip();
}

/** Below the trigger by default; above it when the card would run off the
 *  bottom; always inside the viewport horizontally. */
function placeTermTip() {
  const tip = termTipEl;
  if (!tip || tip.hidden || !termTipTrigger) return;
  const M = 8, GAP = 8;
  const r = termTipTrigger.getBoundingClientRect();
  const vw = document.documentElement.clientWidth;
  const vh = document.documentElement.clientHeight;
  const w = tip.offsetWidth, h = tip.offsetHeight;
  let top = r.bottom + GAP;
  if (top + h > vh - M && r.top - GAP - h >= M) top = r.top - GAP - h;
  top = Math.max(M, Math.min(top, vh - h - M));
  const left = Math.max(M, Math.min(r.left, vw - w - M));
  tip.style.left = `${Math.round(left)}px`;
  tip.style.top = `${Math.round(top)}px`;
}

function hideTermTip(refocus) {
  cancelTermTipHide();
  if (!termTipEl || termTipEl.hidden) return;
  termTipEl.hidden = true;
  const trigger = termTipTrigger;
  termTipTrigger = null;
  trigger?.removeAttribute("aria-describedby");
  if (refocus) trigger?.focus();
}

function scheduleTermTipHide() {
  clearTimeout(termTipTimer);
  termTipTimer = setTimeout(() => hideTermTip(false), 160);
}
function cancelTermTipHide() { clearTimeout(termTipTimer); }

const termTipTarget = (e, sel) => (e.target instanceof Element ? e.target.closest(sel) : null);

const termTipIsOpenFor = (trigger) => trigger === termTipTrigger && !termTipEl?.hidden;

/** Whether the card was already up when the press that is now becoming a click
 *  began. A trigger is a button, so pressing it focuses it, and focus opens the
 *  card: without this, the click that follows would read its own gesture's
 *  handiwork as "already open" and shut it again. On touch, where nothing
 *  hovers first, that made a tap show nothing at all. */
let termTipOpenAtPress = false;

/** Hover, focus and tap all open the popover; Escape, blur, a pointer that
 *  leaves both trigger and card, and any route change close it. */
function initTermTips() {
  if (termTipsWired) return;
  termTipsWired = true;
  document.addEventListener("pointerover", (e) => {
    const trigger = termTipTarget(e, TERM_TIP_TRIGGER);
    if (trigger) { if (e.pointerType !== "touch") showTermTip(trigger); return; }
    if (!termTipTarget(e, ".term-tip")) scheduleTermTipHide();
  });
  // Both run before the browser moves focus, so they see the state the reader
  // meant to act on.
  document.addEventListener("pointerdown", (e) => {
    const trigger = termTipTarget(e, TERM_TIP_TRIGGER);
    if (trigger) termTipOpenAtPress = termTipIsOpenFor(trigger);
  }, true);
  document.addEventListener("keydown", (e) => {
    if (e.key !== "Enter" && e.key !== " ") return;
    const trigger = termTipTarget(e, TERM_TIP_TRIGGER);
    if (trigger) termTipOpenAtPress = termTipIsOpenFor(trigger);
  }, true);
  document.addEventListener("click", (e) => {
    const trigger = termTipTarget(e, TERM_TIP_TRIGGER);
    if (trigger) {
      if (termTipOpenAtPress) hideTermTip(false);
      else showTermTip(trigger);
      return;
    }
    if (!termTipTarget(e, ".term-tip")) hideTermTip(false);
  });
  document.addEventListener("focusin", (e) => {
    const trigger = termTipTarget(e, TERM_TIP_TRIGGER);
    if (trigger) { showTermTip(trigger); return; }
    if (!termTipTarget(e, ".term-tip")) hideTermTip(false);
  });
  document.addEventListener("focusout", (e) => {
    if (!termTipTarget(e, `${TERM_TIP_TRIGGER}, .term-tip`)) return;
    const to = e.relatedTarget instanceof Element ? e.relatedTarget : null;
    if (to && (to.closest(".term-tip") || to.closest(TERM_TIP_TRIGGER) === termTipTrigger)) return;
    hideTermTip(false);
  });
  document.addEventListener("keydown", (e) => {
    if (e.key !== "Escape" || !termTipEl || termTipEl.hidden) return;
    const inside = document.activeElement === termTipTrigger ||
      (document.activeElement instanceof Element && termTipEl.contains(document.activeElement));
    hideTermTip(inside);
  });
  window.addEventListener("scroll", placeTermTip, { passive: true, capture: true });
  window.addEventListener("resize", placeTermTip);
  window.addEventListener("hashchange", () => hideTermTip(false));
}

/** /expenses: every category IPEA publishes, grouped, each with its source. */
let expenseGlossaryDone = false;
async function renderExpenseGlossary() {
  const body = $("expenses-defs");
  if (!body || expenseGlossaryDone) return;
  const d = await loadExpenseDefs();
  if (!d) {
    body.innerHTML = '<p class="status error">The category definitions could not be loaded.</p>';
    return;
  }
  expenseGlossaryDone = true;
  const meta = d.meta || {};
  body.innerHTML = (d.groups || []).map((g) => {
    const rows = d.categories.filter((c) => c.group === g.id);
    if (!rows.length) return "";
    return `<h3>${esc(g.title)}</h3>
      ${g.blurb ? `<p>${esc(g.blurb)}</p>` : ""}
      <dl class="defs">${rows.map((c) => {
        const url = safeUrl(c.url);
        return `<dt>${esc(c.name)}</dt>
          <dd><p>${esc(c.text)}${c.note ? ` ${esc(c.note)}` : ""}</p>
            <p class="defs-src">${esc(c.source || "")}${url ? ` <a href="${esc(url)}" rel="noopener" target="_blank">source ↗︎</a>` : ""}</p>
          </dd>`;
      }).join("")}</dl>`;
  }).join("") +
    (meta.licence_note
      ? `<h3>Sources and licence</h3><p class="fineprint">${esc(meta.licence_note)}${
        safeUrl(meta.source_url) ? ` <a href="${esc(meta.source_url)}" rel="noopener" target="_blank">IPEA expenditure reports ↗︎</a>` : ""}</p>`
      : "");
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
  // A donor can appear in access.json with neither list populated. The heading
  // and the sourcing note are not content, so the section goes rather than
  // standing over an empty space.
  if (!meetings.length && !firms.length) { slot.remove(); return; }
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
    html += `${meetings.length ? `<p class="kicker kicker-sub">Registered lobbying client of</p>` : ""}
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
    ${recent ? `<p class="kicker kicker-sub">Recent meetings</p><ul class="subject-list" role="list">${recent}</ul>` : ""}
    <p class="fineprint">${scheme} Staff, cabinet, departmental and other government meetings are counted
      but left out of the lists. Organisation names link to a donor's entry where the name matches an AEC donor
      exactly, otherwise to the record.${m.latest_pdf ? ` <a href="${esc(safeUrl(m.latest_pdf) || "#")}" rel="noopener" target="_blank">Latest diary (PDF) ↗︎</a>` : ""}</p>`;
}

// --- debts and other funding on party pages -----------------------------------
// scripts/export_aec_extras.py reads the ext_aec_* tables (the AEC Transparency
// Register's debts, discretionary benefits and return totals) into one static
// file, /graph/aec-extras.json. Fetched by the first party page that needs it.
let aecExtrasPromise = null;
function loadAecExtras() {
  aecExtrasPromise ??= fetch("/graph/aec-extras.json")
    .then((r) => (r.ok ? r.json() : null)).catch(() => null);
  return aecExtrasPromise;
}

/** Party page "Debts and other funding": the creditors on the party's own
 *  latest annual return, its discretionary benefits and the associated
 *  entities whose returns name it. Silent for a party the register lacks. */
async function renderPartyDebts(label, sections) {
  const key = currentSubjectKey;
  const slot = document.createElement("div");
  slot.id = "subject-party-debts";
  sections.appendChild(slot);
  const extras = await loadAecExtras();
  if (currentSubjectKey !== key) return;
  const p = extras?.parties?.[label];
  const d = p?.debts, b = p?.benefits, ents = p?.associated_entities || [];
  if (!d && !b && !ents.length) { slot.remove(); return; }
  const endOf = (fy) => String(Number(String(fy).slice(0, 4)) + 1); // "2024-25" -> "2025"
  let html = `<p class="kicker">Debts and other funding</p>`;
  if (d) {
    const lenders = (d.top || []).map((l) => [l.type === "Financial" ? `${l.name} (financial institution)` : l.name, l.amount || 0]);
    html += `<div class="tiles">
      ${tile(fmtMoney(d.total || 0), `owed at 30 June ${endOf(d.year)}`)}
      ${tile(fmtMoney(d.financial_total || 0), "of it to banks and other financial institutions")}
      ${tile(String(d.lenders || 0), d.lenders === 1 ? "creditor listed" : "creditors listed")}
    </div>
    ${lenders.length ? barList(lenders, { fmt: fmtMoney, heading: `Largest creditors, ${d.year}` }) : ""}
    ${d.by_year?.length > 1 ? columnChart(d.by_year.map(([y, t]) => [y, t || 0]), {
      fmt: fmtMoney, heading: "Owed at each 30 June",
      note: "Year-end balances, not new borrowing; a year with no debt itemised shows nothing.",
    }) : ""}`;
  }
  if (b) {
    const top = (b.top || []).slice(0, 3).map((t) => `${t.name} ${fmtMoney(t.amount || 0)}`).join(", ");
    html += `<p style="margin:0.6rem 0 0"><b>${esc(fmtMoney(b.total || 0))}</b> in discretionary benefits in ${esc(b.year)}${top ? `: ${esc(top)}` : ""}.
      These are government payments other than public election funding, as listed on the return.</p>`;
  }
  if (ents.length) {
    const shown = ents.slice(0, 6);
    html += `<p class="kicker kicker-sub">Associated entities</p>
      <ul class="subject-list" role="list">${shown.map((e) => `
      <li><a class="source-title" href="${esc(subjectHash("campaigner", e.name))}">${esc(e.name)}</a>
        <span class="result-meta">${esc([e.year, e.receipts != null ? `receipts ${fmtMoney(e.receipts)}` : "",
          e.payments != null ? `payments ${fmtMoney(e.payments)}` : "", e.debts ? `debts ${fmtMoney(e.debts)}` : ""].filter(Boolean).join(" · "))}</span></li>`).join("")}</ul>
      ${(p.associated_entities_total || 0) > shown.length ? `<p class="fineprint" style="margin-top:0.5rem">${p.associated_entities_total} entities have named ${esc(label)} on an associated-entity return; the ${shown.length} with the largest receipts on their latest return are shown, each with that return's year.</p>` : ""}`;
  }
  const reg = safeUrl(extras.meta?.register_url);
  html += `<p class="fineprint">Debts are the balances the party's branches listed as owed at 30 June on their own AEC
    annual returns, all branches summed: bank loans sit beside trade creditors and tax owed, and a balance is not new
    borrowing. Creditors under the disclosure threshold are not itemised. Source: AEC Transparency Register, CC BY 4.0.${reg ? ` <a href="${esc(reg)}" rel="noopener" target="_blank">Open the register ↗︎</a>` : ""}</p>`;
  slot.innerHTML = html;
  if (d) $("subject-infobox")?.querySelector("dl")?.insertAdjacentHTML("beforeend",
    `<dt>Debts at 30 June ${esc(endOf(d.year))}</dt><dd><b>${esc(fmtMoney(d.total || 0))}</b></dd>`);
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
  let key = `${kind}:${name}`;
  if (currentSubjectKey === key) { if (manageFocus) $("subject-title")?.focus(); return; }
  currentSubjectKey = key;
  destroySubjectMap();
  const body = $("subject-body");
  const SUBJECT_LABELS = {
    person: "Parliamentarian", party: "Political party", donor: "Donor",
    // Provisional: the entry names its own AEC category once the register
    // file has loaded and the entity is known.
    campaigner: "Campaigner or third party",
  };
  body.innerHTML = subjectSkeleton(SUBJECT_LABELS[kind] || "Donor", name,
    `<span class="status" style="margin:0">Opening the entry…</span>`);
  if (manageFocus) $("subject-title")?.focus();

  if (kind === "campaigner") { await renderCampaignerEntry(name, key); return; }

  if (kind === "donor" || kind === "party") {
    reserveSubjectMap(true);
    const [, fits] = await Promise.all([loadMoneyData(), loadFits()]);
    if (currentSubjectKey !== key) return;
    const node = findMoneyNode(kind, name);
    // An old spelling reaches the canonical entry: retitle to the canonical
    // name so the totals below are never attributed to one of its aliases.
    if (node && normName(node.label) !== normName(name)) {
      const h = $("subject-title");
      if (h) h.textContent = node.label;
      replaceRoute(subjectHash(kind, node.label));
      currentSubjectKey = `${kind}:${node.label}`;
      key = currentSubjectKey;
      setCrumbs([{ label: kind === "party" ? "Parties" : "Donors", href: `/subject/${kind}` }, { label: node.label }]);
    }
    const sections = $("subject-sections");
    const box = $("subject-infobox");
    if (!node) {
      reserveSubjectMap(false); // no map for this one: give the space back
      body.querySelector(".subject-tag").innerHTML =
        `<span>Not among the top 250 disclosed donors in the money data. The record may still mention them.</span>`;
      box.innerHTML = infoboxHTML(
        [["Type", kind === "party" ? "Political party" : "Organisation"],
         kind === "donor" && fitsInfoRow(fits, "by_entity", name)], "",
        [actionBtn("search", searchHash(`"${name}"`, {}), "Search the record for them", { primary: true }),
         actionBtn("map", "/money", "Open the money map"),
         actionBtn("external", webSearchUrl(name), "Search the web", { external: true })]);
      if (kind === "donor") renderDonorStateMoney(name, sections);
      subjectMentions(name, sections, "In parliament");
      return;
    }
    const donors = moneyData.nodes.filter((n) => n.kind === node.kind);
    const rank = donors.sort((a, b) => (b.total || 0) - (a.total || 0)).findIndex((n) => n.id === node.id) + 1;
    const isParty = node.kind === "party";
    // The money data's spelling of the name is the entry's; the trail follows it.
    if (node.label && node.label !== name) {
      setCrumbs([{ label: isParty ? "Parties" : "Donors", href: `/subject/${node.kind}` }, { label: node.label }]);
    }
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
      !isParty && fitsInfoRow(fits, "by_entity", node.label),
      // The registers spell one donor many ways; the totals above cover them all.
      // A merged donor can carry dozens of spellings, so the row shows three and
      // opens the rest in place rather than running down the whole column.
      !isParty && (node.aliases || []).length > 0 && ["Also disclosed as", (() => {
        const a = node.aliases;
        const head = a.slice(0, 3).map(esc).join("; ");
        if (a.length <= 3) return `<span class="alias-list">${head}</span>`;
        return `<details class="alias-more"><summary><span class="alias-list">${head}</span>` +
          `<span class="alias-toggle">and ${a.length - 3} more</span></summary>` +
          `<span class="alias-list alias-rest">${a.slice(3).map(esc).join("; ")}</span></details>`;
      })()],
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
    if (isParty) renderPartyDebts(node.label, sections);
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
    const official = /^\d+$/.test(photoIdFor(name) || "");
    if (url) $("subject-title")?.insertAdjacentHTML("beforebegin",
      `<img class="subject-portrait" src="${esc(url)}" alt="${official ? "Official portrait" : "Portrait"} of ${esc(name)}" width="112" height="112">`);
  });
  let speeches = [];
  try {
    const data = await api(`/api/search?${new URLSearchParams({ q: name, speaker: name, top_k: "20" })}`);
    speeches = data.results || [];
  } catch { /* fall through to the empty state */ }
  if (currentSubjectKey !== key) return;
  const partyCount = new Map();
  for (const r of speeches) if (r.party) partyCount.set(r.party, (partyCount.get(r.party) || 0) + 1);
  const spokeAs = [...partyCount.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] || null;
  // A sitting parliamentarian is shown under the party they sit for today (members table via
  // parliamentarians.json "party_now", refreshed from the APH list); the speeches say which
  // party they spoke for, so a defector reads "One Nation · formerly Nationals".
  const roster = (await loadParliamentarians())?.people?.find((p) => p.name.toLowerCase() === String(name).toLowerCase());
  if (currentSubjectKey !== key) return;
  const partyNow = roster?.party_now || null;
  const party = partyNow || spokeAs;
  const formerly = partyNow && spokeAs && !samePartyLabel(partyNow, spokeAs) ? spokeAs : null;
  const dates = speeches.map((r) => r.date).filter(Boolean).sort();
  const chambers = [...new Set(speeches.map((r) => STATE_NAMES[r.state] || r.state).filter(Boolean))];
  body.querySelector(".subject-tag").innerHTML = [
    party ? partyChipHTML(party) : "",
    formerly ? `<span>formerly ${esc(formerly)}</span>` : "",
    chambers.length ? `<span>${esc(chambers.join(" · "))} parliament</span>` : "",
  ].filter(Boolean).join(" · ") || "<span>From the parliamentary record</span>";
  const q = encodeURIComponent(name);
  const fits = await loadFits();
  if (currentSubjectKey !== key) return;
  box.innerHTML = infoboxHTML([
    ["Type", roster?.current ? "Sitting parliamentarian" : "Parliamentarian"],
    party && ["Party", partyChipHTML(party) + (formerly ? ` <span class="fineprint" style="display:inline">formerly ${esc(formerly)}</span>` : "")],
    chambers.length && ["Parliament", esc(chambers.join(", "))],
    dates.length && ["Indexed speeches span", `${esc(fmtDate(dates[0]))} – ${esc(fmtDate(dates[dates.length - 1]))}`],
    fitsInfoRow(fits, "people", name),
  ], "", [
    actionBtn("speeches", searchHash("", { speaker: name }), "View all their speeches", { primary: true }),
    actionBtn("external", `https://theyvoteforyou.org.au/search?query=${q}`, "Voting record", { external: true }),
    actionBtn("external", `https://www.aph.gov.au/Senators_and_Members/Parliamentarian_Search_Results?q=${q}`, "Parliamentary profile", { external: true }),
    actionBtn("external", `https://en.wikipedia.org/w/index.php?search=${q}%20Australian%20politician`, "Wikipedia", { external: true }),
    actionBtn("external", webSearchUrl(name), "Search the web", { external: true }),
  ]);
  renderPortraitCredit(name, key);
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
    if (topic) goRoute(askHash(`What did ${name} say about ${topic}?`));
  });
  // The structured record first; the speeches follow it.
  renderPersonVotes(name, photoMap?.[name.trim().toLowerCase()] ?? null, sections);
  if (speeches.length) {
    const newest = [...speeches].sort((a, b) => String(b.date || "").localeCompare(String(a.date || ""))).slice(0, 8);
    // On the person's own page the name and party are known, so each row
    // leads with the date and gives the debate title; when the title is only
    // "Name — date" the passage itself carries the row.
    const multiHouse = chambers.length > 1;
    sections.insertAdjacentHTML("beforeend",
      `<p class="kicker">Latest indexed speeches</p><ul class="speech-rows" role="list">${newest.map((r) => {
        const debate = titleSubject(r);
        const snip = String(r.snippet || "").trim();
        const where = multiHouse && r.state ? ` <span class="speech-where">${esc(STATE_NAMES[r.state] || r.state)}</span>` : "";
        // With a debate title the passage sits beneath it; without one the
        // passage itself is the row and the link.
        const body = debate
          ? `<a class="speech-debate" href="/doc/${esc(r.slug)}">${esc(debate)}</a>${where}${snip ? `<p class="speech-snip">${esc(snip)}</p>` : ""}`
          : `<a class="speech-passage" href="/doc/${esc(r.slug)}">${esc(snip || "Speech")}</a>${where}`;
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
    <p class="fineprint">${esc(AEC_NOTE)} <a href="/money">Explore on the money map</a></p>`;
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
      <a href="/subject/topic">All topics</a></p>`;
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
    report && ["Standing report", `<a href="/reports/${esc(report.slug)}">${esc(report.title)}</a>`],
  ], "", [
    actionBtn("ask", askHash(`What has parliament said about ${phrase}?`), "Ask what parliament said", { primary: true }),
    actionBtn("search", searchTopic, "Search this topic"),
    ...(report ? [actionBtn("speeches", `/reports/${report.slug}`, `Read the ${report.title} report`)] : []),
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
           <li><a href="/doc/${esc(r.slug)}" class="source-title doc-title">${esc(displayTitle(r))}</a>
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
              <a class="topic-digest-source" href="/doc/${esc(d.slug)}">${partyDotHTML(d.party)}${esc(d.speaker || String(d.title || "").replace(/\s+—\s+\d{4}-\d{2}-\d{2}\s*$/, ""))}${d.date ? `, ${esc(fmtDate(d.date))}` : ""}</a>
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

// --- encyclopedia indexes (directories) -------------------------------------
// Parliamentarians, Parties and Donors each get a full list at
// /subject/<kind>: instant search, filters, a sort, and every control
// mirrored into the URL (replaceRoute) so a filtered view is a link
// that survives sharing and the back button. One renderer serves all three;
// each page supplies its rows, filters and sorts. Rows render in chunks of
// DIR_CHUNK with a "Show more" button so 1,400 people stay instant.

const DIRECTORY_KINDS = {
  person: "Parliamentarians", party: "Parties", donor: "Donors",
  campaigner: "Campaigners & third parties",
};
const DIR_CHUNK = 60;

// Chamber codes as parli.db records them, in the order the filter lists them.
const DIR_CHAMBERS = {
  representatives: "House of Representatives", senate: "Senate", senate_committee: "Senate committees",
  nsw_la: "NSW Legislative Assembly", nsw_lc: "NSW Legislative Council",
  vic_la: "Victorian Legislative Assembly", vic_lc: "Victorian Legislative Council",
  sa_ha: "SA House of Assembly", sa_lc: "SA Legislative Council",
  qld_la: "Queensland Legislative Assembly",
};

// The money map's cluster hues (mirror of ledger.js GROUP_COLOURS and
// graph/palette.ts): donor nodes carry a `group` but no colour of their own.
const DONOR_GROUP_COLOURS = {
  "parties": "#9AA0A8", "unions": "#E15759", "finance": "#4E79A7", "individuals": "#79706E",
  "property": "#F28E2B", "mining & energy": "#9C755F", "hospitality": "#EDC948",
  "media & tech": "#76B7B2", "health & pharma": "#59A14F", "gambling": "#B07AA1",
  "legal & lobbying": "#6A51A3", "defence & security": "#37474F", "agriculture": "#6B8E23",
  "retail": "#FF9DA7", "tobacco & alcohol": "#A65628", "other": "#999966",
};
const donorGroupColour = (group) => DONOR_GROUP_COLOURS[String(group || "").toLowerCase()] || "#999966";

/** Search key: lowercase, accents and apostrophes stripped, punctuation to spaces. */
function foldText(s) {
  return String(s || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .toLowerCase().replace(/['’]/g, "").replace(/[^a-z0-9]+/g, " ").trim();
}

function directoryHash(kind, state) {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(state)) if (v) p.set(k, v);
  const q = p.toString();
  return `/subject/${kind}${q ? `?${q}` : ""}`;
}

/** A year span for a row: "1998–2019", or the one year. */
function yearSpan(first, last) {
  if (!first && !last) return "";
  return first === last || !last ? String(first || last) : `${first}–${last}`;
}

/** Party dot for a label the party map may not know (state-only parties): the money file's colour stands in. */
function anyPartyDotHTML(label, colours) {
  const cls = partyClass(label);
  if (cls) return `<span class="party party-${cls} party-dot-only"><i aria-hidden="true"></i></span>`;
  const c = colours?.get(label);
  return `<span class="party party-oth party-dot-only"${c ? ` style="--pc:${esc(c)}"` : ""}><i aria-hidden="true"></i></span>`;
}

let parliamentariansPromise = null;
function loadParliamentarians() {
  parliamentariansPromise ??= fetch("/parliamentarians.json")
    .then((r) => (r.ok ? r.json() : null)).catch(() => null);
  return parliamentariansPromise;
}
function loadAccess() {
  accessPromise ??= fetch("/access.json").then((r) => (r.ok ? r.json() : null)).then((d) => (accessData = d)).catch(() => null);
  return accessPromise;
}

/** fits.json: Foreign Influence Transparency Scheme registrations, keyed by normName()
 *  of the donor label (`by_entity`) or the person page name (`people`). */
let fitsPromise = null;
function loadFits() {
  fitsPromise ??= fetch("/fits.json").then((r) => (r.ok ? r.json() : null)).catch(() => null);
  return fitsPromise;
}

/** Quick-facts row for an entry on the FITS register; null when nothing matches.
 *  Registration is a disclosure the scheme requires, so the row states the fact,
 *  names the principals and leaves it there. Current relationships are shown
 *  first (up to three) and ceased ones are only counted, so the tense is never
 *  wrong: a registrant with nothing current reads "was registered". */
function fitsInfoRow(fits, bucket, name) {
  const list = fits?.[bucket]?.[normName(name)];
  if (!list?.length) return null;
  const current = list.filter((r) => r.status === "current");
  // One line per principal, newest relationship first: a registrant that renews for the same
  // principal has one row per term ("Home Office UK" twice for Alexander Downer), and naming
  // it twice reads as two principals. Two at most — the register link carries the rest.
  const pool = current.length ? current : list;
  const seenPrincipal = new Set();
  const byPrincipal = pool.filter((r) => {
    const p = r.principal || r.url;
    return seenPrincipal.has(p) ? false : (seenPrincipal.add(p), true); // keep the newest term
  });
  const shown = byPrincipal.slice(0, 2);
  const more = byPrincipal.length - shown.length;
  const ceased = current.length ? list.length - current.length : 0;
  const url = safeUrl(shown[0].url);
  const year = (d) => String(d || "").slice(0, 4);
  const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;
  const who = shown.map((r) => `<b>${esc(r.principal || "an unnamed principal")}</b>${r.country ? ` (${esc(r.country)})` : ""}${
    r.from ? (r.status === "current" ? `, since ${esc(year(r.from))}` : `, ${esc(year(r.from))}–${esc(year(r.to) || "ceased")}`) : ""}`);
  const sentence = current.length
    ? `Registered under the Foreign Influence Transparency Scheme for ${who.join("; ")}${
        more > 0 ? ` and ${plural(more, "other current principal", "other current principals")}` : ""}.${
        ceased > 0 ? ` ${plural(ceased, "earlier relationship has", "earlier relationships have")} ceased.` : ""}`
    : `Was registered under the Foreign Influence Transparency Scheme for ${who.join("; ")}${
        more > 0 ? ` and ${plural(more, "other principal", "other principals")}` : ""}; every relationship has ceased.`;
  // The label stays as short as the longest existing one ("Donations counted"):
  // the infobox's label column is `auto`, so a longer term squeezes every value.
  return ["Foreign influence",
    `${sentence}
     ${url ? `<a href="${esc(url)}" rel="noopener" target="_blank" style="display:inline-block;margin-top:0.15rem">Register entry&nbsp;↗︎</a>` : ""}
     <span style="display:block;color:var(--ink-faint);font-size:0.75rem;line-height:1.4;margin-top:0.2rem">Registration is a disclosure the scheme requires by law, not a finding of wrongdoing.</span>`];
}

// The live directory, so a second visit to the same index with other hash
// params (a menu link while filtered) re-applies them instead of rebuilding.
let activeDirectory = null;

/**
 * Render one directory into #subject-body.
 *   spec.kind      person | party | donor (the route and hash base)
 *   spec.title     serif heading; spec.lede: one sentence with the counts (HTML)
 *   spec.tiles     [[value, label]] figures for the whole directory
 *   spec.items     rows; spec.text(item) is what the search box matches
 *   spec.filters   [{ key, label, options: [[value, label]], test(item, value) }]
 *                  or { key, label, check: true, test(item) } for a checkbox
 *   spec.sorts     [[value, label, cmp]]; the first is the default
 *   spec.row(item) one <li>; spec.fineprint: HTML for the sources note
 *   spec.params    URLSearchParams from the hash
 */
function renderDirectory(spec) {
  const body = $("subject-body");
  const state = { q: "", sort: spec.sorts[0][0] };
  for (const f of spec.filters) state[f.key] = "";
  const readParams = (params) => {
    state.q = params.get("q") || "";
    const sort = params.get("sort");
    state.sort = spec.sorts.some(([v]) => v === sort) ? sort : spec.sorts[0][0];
    for (const f of spec.filters) {
      const v = params.get(f.key) || "";
      state[f.key] = f.check ? (v ? "1" : "") : (f.options.some(([o]) => o === v) ? v : "");
    }
  };
  readParams(spec.params);
  for (const it of spec.items) it._text = foldText(spec.text(it));

  const filterHTML = (f) => f.check
    ? `<label class="dir-check"><input type="checkbox" data-filter="${esc(f.key)}"${state[f.key] ? " checked" : ""}>${esc(f.label)}</label>`
    : `<label class="dir-field"><span>${esc(f.label)}</span>
        <select data-filter="${esc(f.key)}">
          <option value="">${esc(f.any || "All")}</option>
          ${f.options.map(([v, l]) => `<option value="${esc(v)}"${state[f.key] === v ? " selected" : ""}>${esc(l)}</option>`).join("")}
        </select></label>`;
  body.innerHTML = `
    <p class="kicker">Encyclopedia</p>
    <div class="subject-head">
      <h2 id="subject-title" tabindex="-1">${esc(spec.title)}</h2>
      <p class="subject-tag"><span>${spec.lede}</span></p>
    </div>
    <div class="tiles tiles-compact dir-tiles">${spec.tiles.map(([v, l]) => tile(v, l)).join("")}</div>
    <form class="dir-controls" id="dir-controls" role="search" aria-label="Filter the list">
      <label class="visually-hidden" for="dir-q">Search ${esc(spec.title.toLowerCase())} by name</label>
      <input id="dir-q" type="search" autocomplete="off" spellcheck="false"
             placeholder="Search by name…" value="${esc(state.q)}">
      ${spec.filters.filter((f) => !f.check).map(filterHTML).join("")}
      <label class="dir-field"><span>Sort</span>
        <select id="dir-sort">${spec.sorts.map(([v, l]) => `<option value="${esc(v)}"${state.sort === v ? " selected" : ""}>${esc(l)}</option>`).join("")}</select></label>
      ${spec.filters.some((f) => f.check) ? `<div class="dir-checks">${spec.filters.filter((f) => f.check).map(filterHTML).join("")}</div>` : ""}
    </form>
    <p class="dir-count" id="dir-count" role="status" aria-live="polite"></p>
    <ul class="subject-list dir-list" id="dir-list" role="list"></ul>
    <div class="dir-empty" id="dir-empty" hidden>
      <span>Nothing in the ${esc(spec.title.toLowerCase())} directory matches that.</span>
      <button type="button" class="secondary" id="dir-clear">Clear filters</button>
    </div>
    <p class="dir-more-row"><button type="button" class="secondary" id="dir-more" hidden>Show more</button></p>
    <p class="fineprint">${spec.fineprint}</p>`;

  const list = $("dir-list"), count = $("dir-count"), empty = $("dir-empty"), moreBtn = $("dir-more");
  const form = $("dir-controls"), input = $("dir-q"), sortSel = $("dir-sort");
  const sortMap = new Map(spec.sorts.map(([v, , cmp]) => [v, cmp]));
  let matched = [], shown = 0;
  const noun = spec.title.toLowerCase();

  const more = () => {
    const next = matched.slice(shown, shown + DIR_CHUNK);
    list.insertAdjacentHTML("beforeend", next.map(spec.row).join(""));
    shown += next.length;
    moreBtn.hidden = shown >= matched.length;
    if (!moreBtn.hidden) moreBtn.textContent = `Show more (${(matched.length - shown).toLocaleString()} more)`;
  };
  const apply = () => {
    const terms = foldText(state.q).split(" ").filter(Boolean);
    matched = spec.items.filter((it) =>
      terms.every((t) => it._text.includes(t)) &&
      spec.filters.every((f) => !state[f.key] || f.test(it, state[f.key])));
    const cmp = sortMap.get(state.sort) || spec.sorts[0][2];
    matched.sort((a, b) => cmp(a, b, state)); // comparators may read the filters (a jurisdiction's own figure)
    list.innerHTML = "";
    shown = 0;
    more();
    const filtered = matched.length !== spec.items.length;
    count.textContent = filtered
      ? `${matched.length.toLocaleString()} of ${spec.items.length.toLocaleString()} ${noun}`
      : `${spec.items.length.toLocaleString()} ${noun}`;
    empty.hidden = matched.length > 0;
    const hashState = { ...state, sort: state.sort === spec.sorts[0][0] ? "" : state.sort };
    replaceRoute(directoryHash(spec.kind, hashState));
  };
  const syncControls = () => {
    input.value = state.q;
    sortSel.value = state.sort;
    for (const el of form.querySelectorAll("[data-filter]")) {
      if (el.type === "checkbox") el.checked = Boolean(state[el.dataset.filter]);
      else el.value = state[el.dataset.filter];
    }
  };

  let timer = 0;
  input.addEventListener("input", () => {
    clearTimeout(timer);
    timer = setTimeout(() => { state.q = input.value.trim(); apply(); }, 120);
  });
  form.addEventListener("submit", (e) => { e.preventDefault(); clearTimeout(timer); state.q = input.value.trim(); apply(); });
  form.addEventListener("change", (e) => {
    const el = e.target;
    if (el === sortSel) { state.sort = el.value; apply(); return; }
    if (!el.dataset.filter) return;
    state[el.dataset.filter] = el.type === "checkbox" ? (el.checked ? "1" : "") : el.value;
    apply();
  });
  $("dir-clear").addEventListener("click", () => {
    readParams(new URLSearchParams());
    syncControls();
    apply();
    input.focus();
  });
  moreBtn.addEventListener("click", () => {
    const firstNew = shown;
    more();
    list.children[firstNew]?.querySelector("a")?.focus();
  });
  apply();
  activeDirectory = {
    key: `dir:${spec.kind}`,
    setParams(params) { readParams(params); syncControls(); apply(); },
  };
}

async function openDirectory(kind, params, manageFocus) {
  const key = `dir:${kind}`;
  if (currentSubjectKey === key) {
    activeDirectory?.setParams(params);
    if (manageFocus) $("subject-title")?.focus();
    return;
  }
  currentSubjectKey = key;
  activeDirectory = null;
  destroySubjectMap();
  const body = $("subject-body");
  body.innerHTML = `
    <p class="kicker">Encyclopedia</p>
    <div class="subject-head">
      <h2 id="subject-title" tabindex="-1">${esc(DIRECTORY_KINDS[kind])}</h2>
      <p class="subject-tag"><span id="subject-loader" class="subject-loader"></span></p>
    </div>`;
  if (manageFocus) $("subject-title")?.focus();
  showPageLoader("subject-loader", "Opening the directory.");
  const build = {
    person: buildPeopleDirectory, party: buildPartiesDirectory,
    donor: buildDonorsDirectory, campaigner: buildCampaignersDirectory,
  }[kind];
  let spec = null;
  try { spec = await build(); } catch { /* honest failure below */ }
  if (currentSubjectKey !== key) return;
  clearPageLoader("subject-loader");
  if (!spec) {
    body.querySelector(".subject-tag").innerHTML = `<span>The directory could not be loaded. Try again shortly.</span>`;
    return;
  }
  spec.kind = kind;
  spec.params = params;
  renderDirectory(spec);
}

const byNumDesc = (get) => (a, b, state) => (get(b, state) || 0) - (get(a, state) || 0) || a._sortName.localeCompare(b._sortName);
/** Disclosed money for a row: the filtered commission's own figure when one is chosen, else the headline. */
const moneyFor = (row, state) => (state?.jur && row.money[state.jur]) ? row.money[state.jur].total : row._total;
const byName = (a, b) => a._sortName.localeCompare(b._sortName);
/** A select option carrying its count: ["Labor", "Labor (383)"]. */
const countOpt = (value, label, n) => [value, `${label} (${Number(n || 0).toLocaleString()})`];

/** Parliamentarians: parliamentarians.json joined to portraits and votes by lowercased name. */
async function buildPeopleDirectory() {
  const [data] = await Promise.all([loadParliamentarians(), loadPhotoMap(), loadVotes()]);
  if (!data?.people?.length) return null;
  const items = data.people;
  for (const p of items) {
    const lname = p.name.toLowerCase();
    p._photo = photoUrlFor(p.name);
    const keys = [...new Set([p.pid, photoMap?.[lname], ...(votesData?._names?.[lname] || [])].filter(Boolean))];
    p._divisions = keys.reduce((a, k) => a + (Number(votesData?.[k]?.divisions_total) || 0), 0);
    p._sortName = `${lname.split(" ").pop()} ${lname}`;
  }
  const partyCounts = new Map();
  const chamberCounts = new Map();
  const stateCounts = new Map();
  for (const p of items) {
    if (p.party) partyCounts.set(p.party, (partyCounts.get(p.party) || 0) + 1);
    for (const c of p.chambers || []) chamberCounts.set(c, (chamberCounts.get(c) || 0) + 1);
    for (const s of p.states || []) stateCounts.set(s, (stateCounts.get(s) || 0) + 1);
  }
  const partyOptions = [...partyCounts.entries()].sort((a, b) => b[1] - a[1])
    .map(([party, n]) => countOpt(party, party, n));
  partyOptions.push(countOpt("none", "No party recorded", items.filter((p) => !p.party).length));
  const speeches = items.reduce((a, p) => a + (p.speeches || 0), 0);
  const withVotes = items.filter((p) => p._divisions > 0).length;
  const meta = data.meta || {};
  const num = (n) => Number(n || 0).toLocaleString();

  const row = (p) => {
    const portrait = p._photo
      ? `<span class="dir-portrait"><img src="${esc(p._photo)}" alt="" width="40" height="40" loading="lazy"></span>`
      : `<span class="dir-mono" aria-hidden="true">${esc(p.name.slice(0, 1))}</span>`;
    const where = (p.states || []).map((s) => STATE_NAMES[s] || s).join(", ");
    const metaLine = [
      p.party ? partyChipHTML(p.party) : `<span class="dir-muted">No party recorded</span>`,
      (p.parties || []).length > 1 ? `<span class="dir-muted">also ${esc(p.parties.slice(1).join(", "))}</span>` : "",
      where ? esc(where) : "",
      yearSpan(p.first, p.last) ? esc(yearSpan(p.first, p.last)) : "",
    ].filter(Boolean).join(" · ");
    return `<li class="dir-row">
      ${portrait}
      <div class="dir-main">
        <a class="source-title dir-name" href="${esc(subjectHash("person", p.name))}">${esc(p.name)}</a>${p.full ? `<span class="dir-alt">${esc(p.full)}</span>` : ""}
        <span class="result-meta">${metaLine}</span>
      </div>
      <div class="dir-figs">
        <span class="dir-fig"><b>${num(p.speeches)}</b>speech${p.speeches === 1 ? "" : "es"}</span>
        ${p._divisions ? `<span class="dir-fig"><b>${num(p._divisions)}</b>division${p._divisions === 1 ? "" : "s"}</span>` : ""}
      </div>
    </li>`;
  };

  return {
    title: "Parliamentarians",
    lede: `<b>${num(items.length)}</b> people who spoke in ${stateCounts.size} parliaments since the 1993 election,
      with ${num(speeches)} speeches between them under the site's corpus rule. Every name opens its entry.`,
    tiles: [[num(items.length), "people listed"], [String(partyCounts.size), "parties"],
      [String(stateCounts.size), "parliaments"], [num(speeches), "speeches in the corpus"], [num(withVotes), "with a voting record"]],
    items,
    text: (p) => `${p.name} ${p.full || ""} ${p.party || ""} ${(p.states || []).map((s) => STATE_NAMES[s] || s).join(" ")}`,
    filters: [
      { key: "party", label: "Party", options: partyOptions,
        test: (p, v) => v === "none" ? !p.party : (p.party === v || (p.parties || []).includes(v)) },
      { key: "state", label: "Parliament",
        options: Object.keys(STATE_NAMES).filter((s) => stateCounts.has(s)).map((s) => countOpt(s, STATE_NAMES[s], stateCounts.get(s))),
        test: (p, v) => (p.states || []).includes(v) },
      { key: "chamber", label: "Chamber",
        options: Object.keys(DIR_CHAMBERS).filter((c) => chamberCounts.has(c)).map((c) => countOpt(c, DIR_CHAMBERS[c], chamberCounts.get(c))),
        test: (p, v) => (p.chambers || []).includes(v) },
      { key: "votes", label: "Voting record", check: true, test: (p) => p._divisions > 0 },
      { key: "photo", label: "Portrait", check: true, test: (p) => Boolean(p._photo) },
    ],
    sorts: [
      ["speeches", "Most speeches", byNumDesc((p) => p.speeches)],
      ["name", "Name A-Z", byName],
      ["recent", "Most recent", (a, b) => (b.last || 0) - (a.last || 0) || (b.speeches || 0) - (a.speeches || 0)],
      ["divisions", "Most divisions", byNumDesc((p) => p._divisions)],
    ],
    row,
    fineprint: `Names appear as Hansard prints them, so a surname-only print ("Shoebridge") is its own entry, with the
      members register's full name beside it where the record knows it. Speech counts follow the site's corpus rule
      (speeches since the 1993 election, 200+ characters, procedural rows removed) and are counted from the
      corpus itself, so they can run ahead of what the index has loaded so far; speakers with fewer than
      ${num(meta.floor || 5)} indexed speeches${meta.witnesses_excluded ? ` and ${num(meta.witnesses_excluded)} people who appear only as committee witnesses` : ""}
      are not listed. Party is the label the person's speeches carry, or the members register's where they carry none;
      many state Hansard rows record neither. Portraits are official APH and OpenAustralia photos; divisions come from
      They Vote For You and the NSW, Victorian and Queensland Hansard.`,
  };
}

/** Parties: money-file party nodes, the record's party facet and the directory's member counts. */
async function buildPartiesDirectory() {
  const [fed, qld, vic, live, dir] = await Promise.all([
    loadMoneyFile("federal"), loadMoneyFile("qld"), loadMoneyFile("vic"),
    api("/api/parties").catch(() => null), loadParliamentarians(),
  ]);
  const files = [["federal", fed], ["qld", qld], ["vic", vic]].filter(([, d]) => d?.nodes);
  if (!files.length && !live?.parties?.length) return null;
  const parties = new Map();
  const get = (label) => {
    if (!parties.has(label)) parties.set(label, { label, colour: null, speeches: 0, members: 0, money: {}, _sortName: label.toLowerCase() });
    return parties.get(label);
  };
  for (const [jur, data] of files) {
    for (const n of data.nodes) if (n.kind === "party") {
      const p = get(n.label);
      p.colour ??= n.colour || null;
      p.money[jur] = { total: n.total || 0, count: n.count || 0, first: n.firstYear, last: n.lastYear, donors: 0 };
    }
    for (const e of data.edges || []) {
      const p = parties.get(String(e.target).replace(/^party:/, ""));
      if (p?.money[jur]) p.money[jur].donors += 1;
    }
  }
  for (const r of live?.parties || []) if (r.label) get(r.label).speeches = r.count || 0;
  for (const p of dir?.people || []) if (p.party) get(p.party).members += 1;
  const items = [...parties.values()];
  const colours = new Map(items.filter((p) => p.colour).map((p) => [p.label, p.colour]));
  const sourceShort = { federal: "AEC returns", qld: (qld?.meta?.sourceShort) || "ECQ", vic: (vic?.meta?.sourceShort) || "VEC" };
  for (const p of items) {
    const jurs = Object.keys(p.money);
    // Headline receipts: the AEC figure where there is one (it already
    // includes state branches); a state-only party shows its largest file.
    p._total = p.money.federal ? p.money.federal.total : Math.max(0, ...jurs.map((j) => p.money[j].total));
    p._first = Math.min(...jurs.map((j) => p.money[j].first || 9999));
    p._last = Math.max(...jurs.map((j) => p.money[j].last || 0));
  }
  const num = (n) => Number(n || 0).toLocaleString();
  const aecTotal = items.reduce((a, p) => a + (p.money.federal?.total || 0), 0);
  const members = items.reduce((a, p) => a + p.members, 0);

  const row = (p) => {
    const jurs = Object.keys(p.money);
    const meta = [
      jurs.length ? esc(`Disclosures: ${jurs.map((j) => MONEY_JURISDICTIONS[j]?.label || j).join(", ")}`) : `<span class="dir-muted">No party-level disclosure file</span>`,
      jurs.length && p._first < 9999 ? esc(yearSpan(p._first, p._last)) : "",
    ].filter(Boolean).join(" · ");
    const figs = [
      `<span class="dir-fig"><b>${num(p.speeches)}</b>speech${p.speeches === 1 ? "" : "es"}</span>`,
      `<span class="dir-fig"><b>${num(p.members)}</b>in the directory</span>`,
      ...jurs.map((j) => `<span class="dir-fig"><b>${esc(fmtMoney(p.money[j].total))}</b>${esc(sourceShort[j] || j)}</span>`),
    ].join("");
    return `<li class="dir-row dir-row-plain">
      <div class="dir-main">
        <a class="source-title dir-name" href="${esc(subjectHash("party", p.label))}">${anyPartyDotHTML(p.label, colours)}${esc(p.label)}</a>
        <span class="result-meta">${meta}</span>
      </div>
      <div class="dir-figs">${figs}</div>
    </li>`;
  };

  return {
    title: "Parties",
    lede: `<b>${num(items.length)}</b> parties, from the record's party labels, the parliamentarians directory and the
      disclosure returns of ${files.length} commission${files.length === 1 ? "" : "s"}. Every name opens its entry.`,
    tiles: [[num(items.length), "parties listed"], [num(live?.labelled), "speeches with a party label"],
      [num(members), "directory members with a party"], [fmtMoney(aecTotal), "disclosed to the AEC, all parties"]],
    items,
    text: (p) => p.label,
    filters: [
      { key: "jur", label: "Disclosures", any: "Any commission",
        options: [["federal", "Federal (AEC)"], ["qld", "Queensland (ECQ)"], ["vic", "Victoria (VEC)"]],
        test: (p, v) => Boolean(p.money[v]) },
      { key: "show", label: "Show", any: "Every party",
        options: [["speeches", "With speeches in the record"], ["members", "With members in the directory"], ["money", "With disclosed receipts"]],
        test: (p, v) => v === "speeches" ? p.speeches > 0 : v === "members" ? p.members > 0 : Object.keys(p.money).length > 0 },
    ],
    sorts: [
      ["speeches", "Most speeches", byNumDesc((p) => p.speeches)],
      ["donations", "Most disclosed receipts", byNumDesc(moneyFor)],
      ["members", "Most members", byNumDesc((p) => p.members)],
      ["name", "Name A-Z", byName],
    ],
    row,
    fineprint: `Speech counts are the index's live party labels; a speech with no party label (many state Hansard
      rows) is not counted, and a party with speeches but no disclosure file (independents, parties that wound up
      before 1998) still lists. Receipts are per commission and are not summed: ${esc(STATE_NOT_SUMMED)}
      ${esc(AEC_NOTE)}`,
  };
}

/** Donors: donor nodes across the three money files, merged by normalised name, with access.json markers. */
async function buildDonorsDirectory() {
  const [fed, qld, vic, acc, fits] = await Promise.all([
    loadMoneyFile("federal"), loadMoneyFile("qld"), loadMoneyFile("vic"), loadAccess(), loadFits(),
  ]);
  const files = [["federal", fed], ["qld", qld], ["vic", vic]].filter(([, d]) => d?.nodes);
  if (!files.length) return null;
  const donors = new Map();
  const colours = new Map();
  for (const [jur, data] of files) {
    const byId = new Map(data.nodes.map((n) => [n.id, n]));
    for (const n of data.nodes) {
      if (n.kind === "party") { if (n.colour && !colours.has(n.label)) colours.set(n.label, n.colour); continue; }
      if (n.kind !== "donor") continue;
      const k = normName(n.label) || String(n.label).toLowerCase();
      if (!donors.has(k)) {
        donors.set(k, { label: n.label, labels: new Set(), industry: n.industry, group: n.group, money: {},
          parties: new Map(), first: n.firstYear || 9999, last: n.lastYear || 0 });
      }
      const d = donors.get(k);
      d.labels.add(n.label);
      if (jur === "federal") { d.label = n.label; d.industry = n.industry; d.group = n.group; }
      d.money[jur] = { total: n.total || 0, count: n.count || 0, first: n.firstYear, last: n.lastYear };
      d.first = Math.min(d.first, n.firstYear || 9999);
      d.last = Math.max(d.last, n.lastYear || 0);
    }
    for (const e of data.edges || []) {
      const n = byId.get(e.source);
      const d = n && donors.get(normName(n.label) || String(n.label).toLowerCase());
      if (!d) continue;
      const party = String(e.target).replace(/^party:/, "");
      d.parties.set(party, (d.parties.get(party) || 0) + (e.total || 0));
    }
  }
  const items = [...donors.values()];
  const sourceShort = { federal: "AEC returns", qld: (qld?.meta?.sourceShort) || "ECQ", vic: (vic?.meta?.sourceShort) || "VEC" };
  for (const d of items) {
    d._sortName = d.label.toLowerCase();
    d._partyList = [...d.parties.entries()].sort((a, b) => b[1] - a[1]).map(([p]) => p);
    // Headline: the AEC figure where there is one; else the largest state file.
    const jurs = Object.keys(d.money);
    d._total = d.money.federal ? d.money.federal.total : Math.max(0, ...jurs.map((j) => d.money[j].total));
    d._count = d.money.federal ? d.money.federal.count : Math.max(0, ...jurs.map((j) => d.money[j].count));
    const access = [...d.labels].map((l) => acc?.donors?.[l]).find(Boolean) || null;
    d._lobbyists = Number(access?.lobbyists_total) || (access?.lobbyists?.length || 0);
    d._meetings = Number(access?.meetings_total) || (access?.meetings?.length || 0);
    d._fits = [...d.labels].map((l) => fits?.by_entity?.[normName(l)]).find((x) => x?.length) || null;
  }
  const groupCounts = new Map();
  const partyCounts = new Map();
  for (const d of items) {
    const g = d.group || "other";
    groupCounts.set(g, (groupCounts.get(g) || 0) + 1);
    for (const p of d._partyList) partyCounts.set(p, (partyCounts.get(p) || 0) + 1);
  }
  const num = (n) => Number(n || 0).toLocaleString();
  const aecTotal = items.reduce((a, d) => a + (d.money.federal?.total || 0), 0);
  const withAccess = items.filter((d) => d._lobbyists || d._meetings).length;

  const row = (d) => {
    const colour = donorGroupColour(d.group);
    const shownParties = d._partyList.slice(0, 3);
    const more = d._partyList.length - shownParties.length;
    const partiesHTML = shownParties.length
      ? `<span class="dir-parties">to ${shownParties.map((p) => `${anyPartyDotHTML(p, colours)}${esc(p)}`).join(", ")}${more > 0 ? ` and ${more} more` : ""}</span>`
      : "";
    const marks = [
      d._lobbyists ? `<span class="dir-mark" title="${esc(`${d._lobbyists} registered lobbying firm${d._lobbyists === 1 ? "" : "s"}`)}">lobbyists</span>` : "",
      d._meetings ? `<span class="dir-mark" title="${esc(`${d._meetings} disclosed ministerial meeting${d._meetings === 1 ? "" : "s"}`)}">meetings</span>` : "",
      d._fits ? `<span class="dir-mark" title="${esc(`On the Foreign Influence Transparency Scheme register for ${[...new Set(d._fits.map((r) => r.principal).filter(Boolean))].slice(0, 3).join(", ") || "a foreign principal"}`)}">FITS</span>` : "",
    ].filter(Boolean).join(" ");
    const meta = [
      `<span class="party party-oth" style="--pc:${esc(colour)}"><i aria-hidden="true"></i>${esc(industryLabel(d.industry || d.group || "other"))}</span>`,
      d.first < 9999 ? esc(yearSpan(d.first, d.last)) : "",
      partiesHTML,
      marks,
    ].filter(Boolean).join(" · ");
    const jurs = Object.keys(d.money);
    const figs = [
      ...jurs.map((j) => `<span class="dir-fig"><b>${esc(fmtMoney(d.money[j].total))}</b>${esc(sourceShort[j] || j)}</span>`),
      `<span class="dir-fig"><b>${num(d._count)}</b>donation${d._count === 1 ? "" : "s"}</span>`,
    ].join("");
    return `<li class="dir-row dir-row-plain">
      <div class="dir-main">
        <a class="source-title dir-name" href="${esc(subjectHash("donor", d.label))}">${esc(d.label)}</a>
        <span class="result-meta">${meta}</span>
      </div>
      <div class="dir-figs">${figs}</div>
    </li>`;
  };

  const commissions = files.map(([j, d]) => d.meta?.commission || (j === "federal" ? "Australian Electoral Commission" : j));
  return {
    title: "Donors",
    lede: `The <b>${num(items.length)}</b> largest disclosed donors to registered parties across ${files.length} disclosure
      files, merged where one name appears in more than one. Every name opens its entry.`,
    tiles: [[num(items.length), "donors listed"], [fmtMoney(aecTotal), "disclosed to the AEC"],
      [String(partyCounts.size), "parties given to"], [num(withAccess), "with lobbyists or meetings"]],
    items,
    text: (d) => `${[...d.labels].join(" ")} ${d.industry || ""} ${d.group || ""} ${d._partyList.join(" ")}`,
    filters: [
      { key: "industry", label: "Industry",
        options: [...groupCounts.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([g, n]) => [g, `${g} (${n.toLocaleString()})`]),
        test: (d, v) => (d.group || "other") === v },
      { key: "jur", label: "Disclosed to", any: "Any commission",
        options: [["federal", "Federal (AEC)"], ["qld", "Queensland (ECQ)"], ["vic", "Victoria (VEC)"]],
        test: (d, v) => Boolean(d.money[v]) },
      { key: "party", label: "Party given to", any: "Any party",
        options: [...partyCounts.entries()].sort((a, b) => b[1] - a[1]).map(([p, n]) => [p, `${p} (${n.toLocaleString()})`]),
        test: (d, v) => d._partyList.includes(v) },
      { key: "access", label: "Lobbyists or meetings", check: true, test: (d) => d._lobbyists > 0 || d._meetings > 0 },
      { key: "fits", label: "Foreign influence register", check: true, test: (d) => Boolean(d._fits) },
    ],
    sorts: [
      ["total", "Largest disclosed total", byNumDesc(moneyFor)],
      ["count", "Most donations", byNumDesc((d, s) => (s?.jur && d.money[s.jur]) ? d.money[s.jur].count : d._count)],
      ["recent", "Most recent", (a, b, s) => (b.last || 0) - (a.last || 0) || moneyFor(b, s) - moneyFor(a, s)],
      ["name", "Name A-Z", byName],
    ],
    row,
    fineprint: `These are the largest disclosed donors per commission (the top 250 in each file), not every donor.
      ${esc(AEC_NOTE)} The same goes for gifts under each state's disclosure threshold.
      ${esc(STATE_NOT_SUMMED)} Source: ${esc(commissions.join("; "))}. Lobbyist and meeting markers
      come from the six lobbyist registers and the NSW and QLD ministerial diaries; name matching is exact after
      normalisation, so a company using several trading names may be under-counted. The FITS marker means the
      donor is on the Attorney-General's Foreign Influence Transparency Scheme register; registration is a
      disclosure the scheme requires by law, not a finding of wrongdoing.`,
  };
}

// --- campaigners and third parties -------------------------------------------
// The organisations that spend on politics without donating: associated
// entities, third parties, significant third parties and political campaigners,
// each of which lodges an annual return of its own with the AEC. The money map
// only knows donors, so without this wing some of the largest political
// spenders in the country have no page anywhere on the site.
// The AEC annual-returns export writes /graph/campaigners.json; it is about
// half a megabyte, so only this index and its entry pages fetch it, never the
// front page.

const CAMPAIGNER_KINDS = {
  associated_entity: "Associated entity",
  third_party: "Third party",
  significant_third_party: "Significant third party",
  political_campaigner: "Political campaigner",
};

// The `years` rows in file order: [year, receipts, payments, debts,
// electoral_expenditure, gifts_received]. Each column carries how it reads
// inside a sentence and what its own chart is called.
const CAMPAIGNER_COLUMNS = [
  ["receipts", "Receipts, year by year"],
  ["payments", "Payments, year by year"],
  ["debts", "Owed at each 30 June"],
  ["electoral expenditure", "Electoral expenditure, year by year"],
  ["gifts received", "Gifts received, year by year"],
];

// Flows before the year-end balance: what an organisation raised and spent
// says more about its politics than what it happened to owe on 30 June.
const CAMPAIGNER_CHART_ORDER = [0, 1, 3, 4, 2];

let campaignersPromise = null;
function loadCampaigners() {
  campaignersPromise ??= fetch("/graph/campaigners.json")
    .then((r) => (r.ok ? r.json() : null)).catch(() => null);
  return campaignersPromise;
}

const campaignerKindLabel = (kind) => CAMPAIGNER_KINDS[kind] || "Registered organisation";

/** The register chip a campaigner wears wherever it is listed. The four kinds
 *  share one hue on purpose: the words tell them apart, never the colour. */
const campaignerKindChip = (kind) =>
  `<span class="party party-oth" style="--pc:var(--bronze)"><i aria-hidden="true"></i>${esc(campaignerKindLabel(kind))}</span>`;

/** The years an organisation's returns run over, as the AEC writes them. */
function campaignerSpan(e) {
  const years = (e.years || []).map((r) => r[0]).filter(Boolean);
  if (!years.length) return "";
  const first = years[0], last = years[years.length - 1];
  return first === last ? String(first) : `${first} to ${last}`;
}

// The three lines `peak` is drawn from, as [column, noun]. Payments and debts
// are not among them, which is why nothing on these pages calls peak the
// largest figure on a return: for 169 of the roster a payments or debts figure
// is larger, and the Nursing and Midwifery Federation's $130.0M peak sits
// beside $139.6M of payments. What peak measures is the money an organisation
// took in or put into politics, and the labels say exactly that.
const CAMPAIGNER_PEAK_COLUMNS = [[0, "receipts"], [3, "electoral expenditure"], [4, "gifts received"]];

/** How the peak figure is described wherever it appears: the index tiles, the
 *  index rows, the sort and the entry page all use this one phrase, so a reader
 *  moving between them is never comparing two definitions. */
const CAMPAIGNER_PEAK_LABEL = "largest received or spent on politics";
/* The sort control caps at 230px, where the full phrase clips to "Largest
   received or spen" and reads as a broken control rather than a considered one.
   The tile above states the phrase whole, so the sort only has to be unambiguous
   in that company: "raised or spent" matches the lede and cannot be mistaken for
   the payments column the way a bare "spent" could. */
const CAMPAIGNER_SORT_LABEL = "Most raised or spent";
const capFirst = (s) => s.charAt(0).toUpperCase() + s.slice(1);

/** A party filter's count, with its unit spelled out so the number cannot be
 *  taken for an amount of money. */
const orgCount = (n) => `${Number(n || 0).toLocaleString()} organisation${n === 1 ? "" : "s"}`;

/** Which line `peak` came off, and in which year. The file gives the largest
 *  figure but not where on the form it sat, and "receipts" reads very
 *  differently from "gifts received". Matched against the rows rather than
 *  assumed, columns before years so a figure two lines happen to tie on is
 *  reported as the receipts it almost always is. A peak these columns cannot
 *  account for goes unlabelled, never mislabelled. */
function campaignerPeakSource(e) {
  const peak = Number(e.peak) || 0;
  if (!peak) return null;
  for (const [col, noun] of CAMPAIGNER_PEAK_COLUMNS) {
    for (const row of e.years || []) if (row[col + 1] === peak) return { noun, year: String(row[0] || "") };
  }
  return null;
}

/** One year-by-year money series. Six returns or more make a column chart worth
 *  reading; two make one fat block, so a short series takes the bar list. */
function campaignerSeries(e, col, heading) {
  // A null is a line the return left empty, not a nil figure, and the two must
  // not be drawn the same way: charting the CFMEU's unreported 2006-07 receipts
  // as a zero bar tells a reader it took in nothing that year, which the return
  // does not say. Empty lines are left out of the series; a real zero stays.
  const pairs = (e.years || [])
    .filter((r) => r[col + 1] !== null && r[col + 1] !== undefined && r[col + 1] !== "")
    .map((r) => [String(r[0] || ""), Number(r[col + 1]) || 0]);
  if (!pairs.some(([, v]) => v > 0)) return "";
  return pairs.length >= 6
    ? columnChart(pairs, { fmt: fmtMoney, heading })
    : barList(pairs, { fmt: fmtMoney, heading });
}

/** Campaigners and third parties: one row per organisation on the register,
 *  sorted by the largest figure it ever lodged. */
async function buildCampaignersDirectory() {
  const data = await loadCampaigners();
  const items = data?.entities;
  if (!items?.length) return null;
  const meta = data.meta || {};
  const num = (n) => Number(n || 0).toLocaleString();
  const kindCounts = new Map();
  const partyCounts = new Map();
  let first = "", last = "", largest = 0, returns = 0;
  for (const e of items) {
    e._sortName = String(e.name || "").toLowerCase();
    e._parties = e.associated_parties || [];
    e._span = campaignerSpan(e);
    e._returns = (e.years || []).length;
    e._last = String(e.latest_year || e.years?.[e._returns - 1]?.[0] || "");
    e._peakFrom = campaignerPeakSource(e);
    const start = String(e.years?.[0]?.[0] || "");
    kindCounts.set(e.kind, (kindCounts.get(e.kind) || 0) + 1);
    for (const p of e._parties) partyCounts.set(p, (partyCounts.get(p) || 0) + 1);
    if (start && (!first || start < first)) first = start;
    if (e._last && e._last > last) last = e._last;
    largest = Math.max(largest, Number(e.peak) || 0);
    returns += e._returns;
  }
  const withParty = items.filter((e) => e._parties.length).length;
  const floor = Number(meta.floor) || 0;
  const register = safeUrl(meta.register_url);

  const row = (e) => {
    const shown = e._parties.slice(0, 3);
    const more = e._parties.length - shown.length;
    // "names" rather than "associated with": the return names a party, which
    // is all the register says and all this row may imply.
    const partiesHTML = shown.length
      ? `<span class="dir-parties">names ${shown.map((p) => `${anyPartyDotHTML(p)}${esc(p)}`).join(", ")}${more > 0 ? ` and ${more} more` : ""}</span>`
      : "";
    const metaLine = [campaignerKindChip(e.kind), e._span ? esc(e._span) : "", partiesHTML].filter(Boolean).join(" · ");
    return `<li class="dir-row dir-row-plain">
      <div class="dir-main">
        <a class="source-title dir-name" href="${esc(subjectHash("campaigner", e.name))}">${esc(e.name)}</a>
        <span class="result-meta">${metaLine}</span>
      </div>
      <div class="dir-figs">
        <span class="dir-fig"><b>${esc(fmtMoney(Number(e.peak) || 0))}</b>${
          // The tile and the sort name the measure once; each row then names
          // the line and year its own figure came off, which is shorter than
          // the definition, true of that row alone, and the same words the
          // entry page puts beside the same number. The full phrase stands in
          // only when the columns cannot account for the figure.
          esc(e._peakFrom ? `${e._peakFrom.noun}, ${e._peakFrom.year}` : CAMPAIGNER_PEAK_LABEL)}</span>
        <span class="dir-fig"><b>${num(e._returns)}</b>${e._returns === 1 ? "return" : "returns"}</span>
      </div>
    </li>`;
  };

  return {
    title: DIRECTORY_KINDS.campaigner,
    lede: `The <b>${num(items.length)}</b> organisations that lodge annual returns with the AEC as associated
      entities, third parties, significant third parties or political campaigners${first && last
        ? `, covering ${esc(first)} to ${esc(last)}` : ""}. This is money raised and spent on politics outside
      the donation columns. Every name opens its entry.`,
    // The fourth tile counts the organisations naming NO party, not the ones
    // naming one. Most of the roster names none, and leading with that is what
    // keeps the party filter from reading as a map of who spends.
    tiles: [[num(items.length), "organisations listed"], [fmtMoney(largest), CAMPAIGNER_PEAK_LABEL],
      [num(returns), "annual returns covered"], [num(items.length - withParty), "naming no party at all"]],
    items,
    text: (e) => `${e.name} ${campaignerKindLabel(e.kind)} ${(e.return_types || []).join(" ")} ${e._parties.join(" ")}`,
    filters: [
      { key: "kind", label: "Register category", any: "Any category",
        options: Object.keys(CAMPAIGNER_KINDS).filter((k) => kindCounts.has(k))
          .map((k) => countOpt(k, CAMPAIGNER_KINDS[k], kindCounts.get(k))),
        test: (e, v) => e.kind === v },
      // Every count here is spelled "organisations", never left as a bare
      // number: one side of politics registers far more associated entities
      // than the other, and a bare "Labor (153)" beside "Liberal (36)" invites
      // a reader to take it for four times the money, which it is not.
      { key: "party", label: "Party named on the return", any: "Any party",
        options: [...partyCounts.entries()].sort((a, b) => b[1] - a[1])
          .map(([p, n]) => [p, `${p} (${orgCount(n)})`])
          .concat([["none", `No party named (${orgCount(items.length - withParty)})`]]),
        test: (e, v) => v === "none" ? !e._parties.length : e._parties.includes(v) },
    ],
    sorts: [
      // Sentence case of the same phrase, not a shorter one. The select caps at
      // 230px so the closed control clips it, which is the lesser cost: the open
      // dropdown shows the phrase whole, and dropping "on politics" to make it
      // fit would leave "spent" free to be read as the payments column.
      ["peak", CAMPAIGNER_SORT_LABEL, byNumDesc((e) => e.peak)],
      ["name", "Name A-Z", byName],
      ["recent", "Most recent return", (a, b) => b._last.localeCompare(a._last) || (b.peak || 0) - (a.peak || 0)],
    ],
    row,
    // The file's own caveats first, then the three things the page itself can
    // be misread as saying: that the ranking figure is everything on a return,
    // that these totals are donations, and that the party counts measure money.
    fineprint: `${(meta.notes || []).map((n) => esc(String(n))).join(" ")}
      ${floor ? `Smaller filers are left out by a $${esc(floor.toLocaleString())} floor.` : ""}
      The figure each organisation is ranked and listed by is the largest it ever reported receiving or spending on
      politics in one year, taken from its receipts, its electoral expenditure and the gifts it received. It is not
      the largest number on its returns: payments and debts are its own outgoings and balance sheet, they are often
      larger, and they are not counted here.
      Every figure is a headline total the organisation itself put on its own return: receipts are its income and
      payments its spending, and neither is a donation to or from a party. Amounts under the AEC's disclosure
      threshold are never itemised, so each figure is a floor rather than a ceiling.
      Most of these organisations name no party at all, and where a return does name one that is a registration
      fact and nothing more: the party named neither gave nor received the figures shown. The counts beside each
      party in the filter count registered organisations, never money. More returns name Labor than any other
      party because the associated-entity class fits that side of politics' organisational shape, its clubs and
      its union-linked bodies, so a larger count there says nothing about which side spends more.
      Source: ${esc(meta.source || "AEC Transparency Register annual returns")}${meta.licence ? `, ${esc(meta.licence)}` : ""}.${
      register ? ` <a href="${esc(register)}" rel="noopener" target="_blank">Open the register ↗︎</a>` : ""}`,
  };
}

/** One campaigner or third party: the facts off its own returns, the money year
 *  by year, and the two ways into the record. Nothing on this page is a
 *  donation, and the copy never lets it read as one. */
async function renderCampaignerEntry(name, key) {
  const body = $("subject-body");
  const data = await loadCampaigners();
  if (currentSubjectKey !== key) return;
  const box = $("subject-infobox");
  const sections = $("subject-sections");
  const list = data?.entities || [];
  const nn = normName(name);
  // Exact spelling first: normName drops company suffixes, so it would fold
  // two entities that differ only by "Pty Ltd" into whichever came first.
  const e = list.find((x) => x.name === name) || list.find((x) => normName(x.name) === nn) || null;
  if (!e) {
    body.querySelector(".subject-tag").innerHTML = data
      ? `<span>No annual return is held under this name on the register roster. The record may still mention them.</span>`
      : `<span>The register file could not be loaded. The record may still mention them.</span>`;
    box.innerHTML = infoboxHTML([["Type", "Organisation"]], "", [
      actionBtn("search", searchHash(`"${name}"`, {}), "Search the record for them", { primary: true }),
      actionBtn("entry", "/subject/campaigner", "All campaigners and third parties"),
      actionBtn("external", webSearchUrl(name), "Search the web", { external: true }),
    ]);
    await subjectMentions(name, sections, "In parliament");
    return;
  }
  // The register's own spelling is the entry's, so a link that arrived under an
  // older one never leaves the totals attributed to a name the AEC does not use.
  if (e.name !== name) {
    const h = $("subject-title");
    if (h) h.textContent = e.name;
    replaceRoute(subjectHash("campaigner", e.name));
    currentSubjectKey = `campaigner:${e.name}`;
    key = currentSubjectKey;
    setCrumbs([{ label: DIRECTORY_KINDS.campaigner, href: "/subject/campaigner" }, { label: e.name }]);
  }
  const kicker = body.querySelector(".kicker");
  if (kicker) kicker.textContent = campaignerKindLabel(e.kind);

  const parties = e.associated_parties || [];
  const span = campaignerSpan(e);
  const count = (e.years || []).length;
  const peak = Number(e.peak) || 0;
  const peakFrom = campaignerPeakSource(e);
  // The kicker above the name already says the AEC category, so the tag line
  // carries what it does not: how far back the returns run, and who the
  // organisation names.
  body.querySelector(".subject-tag").innerHTML = [
    span
      ? `<span class="subject-active"><svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true"><circle cx="10" cy="10" r="7"/><path d="M10 6v4l2.8 1.8"/></svg>Returns ${esc(span)}</span>`
      : campaignerKindChip(e.kind),
    parties.length
      ? `<span>names ${parties.map((p) => `${anyPartyDotHTML(p)}${esc(p)}`).join(", ")} on its returns</span>`
      : "",
  ].filter(Boolean).join(" · ");

  box.innerHTML = infoboxHTML([
    ["Register category", esc(campaignerKindLabel(e.kind))],
    // "None" and not "independent": a return with no party on it records an
    // absence on a form, not a political stance.
    ["Party named on the return", parties.length
      ? parties.map((p) => `${anyPartyDotHTML(p)}<a href="${esc(subjectHash("party", p))}">${esc(p)}</a>`).join(", ")
      : `<span class="dir-muted">None</span>`],
    e.abn && ["ABN", esc(String(e.abn))],
    // An organisation can change category between returns, and which forms it
    // has lodged over the years is part of the record. "Return" comes off each
    // one: the label above it already says these are returns.
    (e.return_types || []).length
      && ["Return types", esc(e.return_types.map((t) => String(t).replace(/\s+Return$/i, "")).join(", "))],
    span && ["Years covered", `${esc(span)} (${count} ${count === 1 ? "return" : "returns"})`],
    // Same phrase as the index tile, row and sort, so a reader arriving from
    // the list is not handed a second definition of the same number.
    peak && [capFirst(CAMPAIGNER_PEAK_LABEL),
      `<b>${esc(fmtMoney(peak))}</b>${peakFrom ? ` <span class="dir-muted">(${esc(peakFrom.noun)}, ${esc(peakFrom.year)})</span>` : ""}`],
  ], "", [
    actionBtn("ask", askHash(`What has parliament said about ${e.name}?`),
      "Ask what parliament said about them", { primary: true }),
    actionBtn("search", searchHash(`"${e.name}"`, {}), "Search mentions in the record"),
    actionBtn("download", "/graph/campaigners.json", "Download the data"),
    actionBtn("external", webSearchUrl(e.name), "Search the web", { external: true }),
  ]);

  const charts = CAMPAIGNER_CHART_ORDER
    .map((i) => campaignerSeries(e, i, CAMPAIGNER_COLUMNS[i][1])).filter(Boolean).join("");
  // Newest return first: a reader coming to a name for the first time wants
  // what it filed last, not what it filed in 1998.
  const yearRows = (e.years || []).slice().reverse().map((r) => {
    const figs = CAMPAIGNER_COLUMNS
      .map(([noun], i) => (r[i + 1] == null ? "" : `${noun} ${fmtMoney(Number(r[i + 1]))}`))
      .filter(Boolean).join(" · ");
    return `<li><b>${esc(String(r[0] || ""))}</b>
      <span class="result-meta">${esc(figs || "nothing itemised on the return")}</span></li>`;
  }).join("");
  const register = safeUrl(data?.meta?.register_url);
  sections.insertAdjacentHTML("beforeend", `
    <p class="kicker">The money on the returns</p>
    ${charts || `<p class="status" style="margin-top:0.4rem">Every money column on this organisation's returns is blank or nil.</p>`}
    <details class="chat-sources" style="margin-top:1rem">
      <summary>Every year on the return</summary>
      <ul class="subject-list" role="list">${yearRows}</ul>
    </details>
    <p class="fineprint">These are the totals ${esc(e.name)} put on its own annual returns to the AEC. Receipts are
      what it took in and payments what it spent; neither is a donation to or from a party, and a party named on a
      return neither gave nor received this money. A blank column is a line the return left empty, not a nil figure,
      and amounts under the disclosure threshold are never itemised, so every number is a floor.
      Debts are balances owed at 30 June, not new borrowing. The quick fact above counts only what was received or
      spent on politics, so a payments or debts figure on one of these returns can be larger than it.
      Source: AEC Transparency Register, CC BY 4.0.${register
        ? ` <a href="${esc(register)}" rel="noopener" target="_blank">Open the register ↗︎</a>` : ""}</p>`);
  await subjectMentions(e.name, sections, "In parliament");
}

// --- explore (time machine + quiz) ------------------------------------------
// Both are standalone lazy modules with a mount/destroy contract; the page
// only owns the toggle. Modules are mounted once and kept alive per session.

const explore = { tm: null, quiz: null, ledger: null, matrix: null, wd: null, tvn: null };

const GAMES = {
  tm: { name: "Time machine", dialog: "dialog-tm", body: "explore-tm", module: "/timemachine.js", mount: "mountTimeMachine" },
  quiz: { name: "The record quiz", dialog: "dialog-quiz", body: "explore-quiz", module: "/quiz.js", mount: "mountQuiz" },
  ledger: { name: "The ledger", dialog: "dialog-ledger", body: "explore-ledger", module: "/ledger.js", mount: "mountLedger" },
  matrix: { name: "Who owns which debate", dialog: "dialog-matrix", body: "explore-matrix", module: "/matrix.js", mount: "mountMatrix" },
  wd: { name: "Words per dollar", dialog: "dialog-wd", body: "explore-wd", module: "/wordsdollars.js", mount: "mountWordsDollars" },
  tvn: { name: "Then vs now", dialog: "dialog-tvn", body: "explore-tvn", module: "/thenvsnow.js", mount: "mountThenVsNow" },
};

async function openGame(which) {
  const game = GAMES[which];
  if (!game) return;
  $(game.dialog).showModal();
  // The module is a page in its own right while it is up; the trail says so
  // and returns to plain Explore when it closes (see the close listener below).
  setCrumbs([{ label: "Explore", href: "/explore" }, { label: game.name }]);
  try {
    if (!explore[which]) {
      const mod = await import(game.module);
      // The modules stay standalone (they carry their own fallbacks), but a
      // speech reads the same in here as it does in search because the shell
      // hands them its own title helper rather than each keeping a copy.
      explore[which] = mod[game.mount]($(game.body), { displayTitle });
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
  // Closed by any route (button, backdrop, Esc): the trail is Explore's again,
  // unless the page underneath has already moved on.
  dialog.addEventListener("close", () => {
    if (parseHash().segs[0] === "explore") setCrumbs([{ label: "Explore" }]);
  });
  dialog.addEventListener("click", (e) => {
    // Only the dialog itself is the backdrop; a click on anything inside it
    // is never a dismissal. Without this guard a keyboard-activated button
    // (Enter, or the quiz's 1/2/3 shortcuts calling click()) reports
    // coordinates of 0,0 and reads as a click outside the box.
    if (e.target !== dialog) return;
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

// A news headline is not a parliamentary phrase, so passing it to search finds
// nothing. These keywords map a headline onto the taxonomy the corpus is
// labelled with; the pivot then asks about a subject parliament debates.
const NEWS_TOPIC_HINTS = [
  ["housing", ["housing", "rent", "renter", "mortgage", "homeless", "home buyer", "negative gearing"]],
  ["health", ["health", "hospital", "medicare", "doctor", "nurse", "ambulance", "aged care", "ndis", "vaccine", "mental health"]],
  ["education", ["school", "student", "university", "teacher", "childcare", "child care", "hecs", "curriculum"]],
  ["immigration", ["immigration", "migrant", "migration", "visa", "asylum", "refugee", "border"]],
  ["climate-environment", ["climate", "emission", "renewable", "solar", "coal", "gas", "environment", "bushfire", "flood", "drought", "water"]],
  ["mining-energy", ["mining", "mine", "energy", "electricity", "power price", "petrol", "fuel", "nuclear"]],
  ["tax-budget", ["tax", "budget", "deficit", "surplus", "treasury", "inflation", "interest rate", "cost of living"]],
  ["welfare-social", ["welfare", "centrelink", "pension", "jobseeker", "disability", "poverty", "payment"]],
  ["justice-law", ["police", "court", "crime", "prison", "sentencing", "assault", "shooting", "murder", "bail", "domestic violence"]],
  ["integrity-democracy", ["corruption", "integrity", "icac", "donation", "lobbying", "electoral", "election", "poll", "referendum",
    "one nation", "labor", "liberal", "greens", "nationals", "coalition", "populist", "voter", "byelection", "preselection", "preference"]],
  ["defence-security", ["defence", "military", "adf", "army", "navy", "war", "aukus", "submarine", "veteran", "security"]],
  ["foreign-affairs", ["foreign", "china", "united states", "ukraine", "israel", "gaza", "pacific", "indonesia", "trade deal", "diplomat",
    "nepal", "tibet", "india", "japan", "korea", "png", "papua new guinea", "new zealand", "britain", "europe", "russia", "iran", "consular", "embassy"]],
  ["indigenous-affairs", ["indigenous", "first nations", "aboriginal", "closing the gap", "native title", "uluru", "voice to parliament"]],
  ["unions-workplace", ["union", "worker", "wage", "workplace", "industrial", "strike", "employment", "jobs"]],
  ["media-communications", ["media", "broadcast", "abc", "news corp", "social media", "privacy", "tech giant", "internet", "telecommunications"]],
  ["infrastructure-transport", ["transport", "road", "rail", "airport", "airline", "infrastructure", "nbn", "traffic"]],
  ["agriculture", ["farm", "farmer", "agriculture", "livestock", "fisheries", "biosecurity"]],
  ["gambling", ["gambling", "poker machine", "pokies", "wagering", "betting", "casino"]],
  ["hospitality-alcohol", ["alcohol", "pub", "hotel", "hospitality", "tobacco", "vaping"]],
  ["financial-services", ["bank", "banking", "superannuation", "insurance", "financial"]],
  ["property-construction", ["construction", "builder", "developer", "property", "planning"]],
];

/** The topic slug a headline is about, or null when nothing matches cleanly. */
function newsTopicSlug(headline) {
  const h = ` ${String(headline || "").toLowerCase().replace(/[^a-z0-9 ]+/g, " ").replace(/\s+/g, " ")} `;
  let best = null, bestHits = 0;
  for (const [slug, words] of NEWS_TOPIC_HINTS) {
    // A place name counts double. "Australians safe in the Nepal flood" is a
    // story about Australians abroad, not about Australian flood policy, and
    // one incidental domestic word should not outrank the country it happened in.
    const weight = slug === "foreign-affairs" ? 2 : 1;
    const hits = words.reduce((n, w) => n + (h.includes(` ${w}`) ? weight : 0), 0);
    if (hits > bestHits) { bestHits = hits; best = slug; }
  }
  return bestHits > 0 ? best : null;
}

async function renderFrontNews() {
  const holder = $("front-news");
  try {
    const data = await api("/api/news");
    const items = (data.items || []).filter((i) => safeUrl(i.url)).slice(0, 6);
    if (!items.length) { $("mod-news").hidden = true; return; }
    const srcName = { ABC: "ABC News", Guardian: "The Guardian" };
    holder.innerHTML = `<ol class="news-list" role="list">${items.map((i) => {
      // Ask and search the SUBJECT, not the headline: a labelled topic when the
      // headline names one, otherwise the two strongest words it left behind.
      // A headline that matches no topic gets no pivots. The old fallback took
      // two words off the article's keyword string, which asked the record
      // about phrases like "populist one" and retrieved nothing.
      const slug = newsTopicSlug(i.title);
      const subject = slug ? TOPICS[slug] : "";
      // Six identical pairs of buttons read as a form, not as a way in. The
      // topic leads instead, so every row differs where the eye lands, and the
      // two ways in are quiet verbs after it rather than boxes.
      const pivots = subject ? `<span class="news-pivots">
          <a class="news-pivot-topic" href="${esc(askHash(`What has parliament said about ${subject.toLowerCase()}?`))}">${esc(subject)}</a>
          <span class="news-pivot-rest">in the record<span aria-hidden="true"> · </span><a
            href="${esc(searchHash(subject, { topic: slug }))}">search the speeches</a></span>
        </span>` : "";
      const when = relTime(i.published);
      return `<li>
        <a class="news-headline" href="${esc(safeUrl(i.url))}" rel="noopener" target="_blank">${esc(i.title)}</a>
        <span class="news-meta"><span class="news-source">${esc(srcName[i.source] || i.source || "")}</span>${when ? ` · ${esc(when)}` : ""}</span>
        ${pivots}</li>`;
    }).join("")}</ol>`;
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
      `Live from the search index and corpus manifest v${esc(corpusVersion())}. <a href="/stats">Full corpus breakdown</a>`;
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
      <a href="/reports/${esc(today.slug)}">Read the full ${esc(report.title)} report</a> ·
      ${mwTopic ? `<a href="${esc(subjectHash("topic", mwTopic))}">Follow the topic live</a> · ` : ""}
      <a href="/reports">All reports</a></p>`;
    $("mod-mw").hidden = false;

    // Encyclopedia rail: the loudest voices across every report, today's
    // topic leading. Needs the other reports too, so it fills in on its own.
    renderFrontEncy(dayIdx, report, don).catch(() => { /* module stays hidden */ });

    // Reports row (index already in hand).
    $("front-reports").innerHTML = reportsIndex.map((r) => `
      <a class="report-card" href="/reports/${esc(r.slug)}">
        ${reportGlyph(r.slug, "card-glyph")}<span class="card-title">${esc(r.title)}</span>
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
    const li = (i) => `<li><a href="/doc/${esc(i.slug)}" class="source-title doc-title">${esc(displayTitle(i))}</a>
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
  // The money map is a 167 KB bundle plus its data. The plate reserves its own
  // height, so deferring the mount until it nears the viewport costs no layout
  // shift and keeps the bundle off the home page's critical path.
  const root = $("front-map-root");
  if (!root || !("IntersectionObserver" in window)) { mountFrontMap(); return; }
  const io = new IntersectionObserver((entries) => {
    if (!entries.some((e) => e.isIntersecting)) return;
    io.disconnect();
    mountFrontMap();
  }, { rootMargin: "300px" });
  io.observe(root);
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
    root.innerHTML = `<p class="status">The map could not load here. <a href="/search">Search the record</a>.</p>`;
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
        if (node) goRoute(subjectHash(node.kind === "party" ? "party" : "donor", node.label));
      },
    });
    frontMapHandle = handle;
    frontMapObserver = new IntersectionObserver((entries) => handle.setPaused?.(!entries[entries.length - 1].isIntersecting));
    frontMapObserver.observe(root);
    renderFrontMapChips(mod, data);
  } catch {
    root.innerHTML = `<p class="status">The map could not load here. <a href="/money">Open the money map</a>.</p>`;
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
  // The page is about to glide on its own; that is not the reader scrolling.
  holdPeopleRail(1000);
  result.scrollIntoView({
    behavior: matchMedia("(prefers-reduced-motion: no-preference)").matches ? "smooth" : "auto",
    block: "start",
  });
}

let heroFoldTimer = 0;
/* When the hero will have finished folding: a 900ms beat before it starts, then
   the 520ms the max-height transition takes. The people rail waits for this so
   the two moves do not overlap. A cached answer returns almost at once, which
   is when they used to collide. */
const HERO_FOLD_MS = 900 + 520;
let heroSettledAt = 0;
/** The hero line folds away a beat after a question is asked, or comes back. */
function foldHero(folded) {
  clearTimeout(heroFoldTimer);
  const hero = $("hero-intro");
  if (!hero) return;
  if (!folded) { hero.classList.remove("hero-folded"); heroSettledAt = 0; return; }
  heroSettledAt = Date.now() + HERO_FOLD_MS;
  heroFoldTimer = setTimeout(() => hero.classList.add("hero-folded"), 900);
}

async function runAsk(question) {
  if (askAbort) askAbort.abort();
  const myAbort = new AbortController();
  askAbort = myAbort;
  foldHero(true);
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
  resetPeopleRail();
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
      if (canon) { aSpeaker.value = canon; renderAskFilterChips(); }
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
    prefetchAskFollowups(lastAsk);

    hideWombat();
    setStatus($("ask-status"), `Answer ready: ${sources.length} sources.`);
    $("ask-status").classList.add("visually-hidden"); // announced, not displayed
    revealAskResult();
    $("ask-result").querySelector(".action-row").hidden = false;
    if (answerText) {
      // A streamed answer has already painted itself; only a cached or
      // non-streaming one arrives whole, and it should not just appear.
      if ($("ask-answer").childElementCount) renderAnswer($("ask-answer"), answerText);
      else replayAnswer($("ask-answer"), answerText, () => askAbort === myAbort);
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
    // The finished answer replaces the streamed one: let that settle before a
    // shift in the page counts as the reader deciding to move on. People first,
    // so the rail opens on them rather than flashing a quote on the way.
    holdPeopleRail(600);
    setPeopleRail(citedList);
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
  replaceRoute(askHash(q, askKind()));
  setCrumbs([{ label: "Ask" }]); // replaceState fires no hashchange, so the router will not
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
  goRoute("/chat");
});

/**
 * Suggested questions as home-page cards. They exist to start a first journey,
 * so they leave the moment a question is asked (runAsk hides the block) and
 * only return if that ask fails and the page is empty again.
 */
function renderChips() {
  // An ask already underway (status set synchronously at runAsk start) or
  // answered: the chips and the front page stay out of the way.
  if (askInPlay()) return;
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
      replaceRoute(askHash(q));
      setCrumbs([{ label: "Ask" }]);
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
// Follow-up questions for the answer on the Ask page are generated as soon as
// the answer lands, not when the reader chooses "Keep asking about this": by
// then the chips are usually ready and the chat opens with them in place. The
// result rides on lastAsk (so the seed carries it); an unfinished fetch is
// registered so the chat view can await it instead of asking again.
let askFollowupsInflight = null; // {question, answer, promise}
function followupPassages(sources) {
  return (sources || [])
    .map((s) => ({ title: s.title || s.slug || "", text: (s.snippet || "").trim() }))
    .filter((p) => p.text)
    .slice(0, 8);
}
function normaliseFollowups(data) {
  return (data?.questions || [])
    .map((item) => (typeof item === "string" ? { question: item } : item))
    .filter((item) => item && typeof item.question === "string" && item.question.trim());
}
function prefetchAskFollowups(ask) {
  if (!ask?.question || !ask?.answer) return;
  const passages = followupPassages(ask.sources);
  if (!passages.length) return;
  const promise = api("/api/followups", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ question: ask.question, answer: ask.answer, passages }),
  }).then((data) => {
    const questions = normaliseFollowups(data);
    if (questions.length && lastAsk === ask) ask.next = questions;
    return questions;
  }).catch(() => []);
  askFollowupsInflight = { question: ask.question, answer: ask.answer, promise };
}

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
          { role: "answer", text: seed.answer, sources: seed.sources || [], next: seed.next || undefined },
        ];
        chatKind = seed.kind === "all" ? "all" : "speech";
        saveChatSession();
      }
    }
  } catch { /* a bad seed leaves the existing thread standing */ }
  renderChatThread();
  requestChatFollowups();
  // Land at the end of the thread: the history above is context, the last
  // answer, its chips and the input are the point of this view. The composer
  // is sticky at the viewport's foot, so scrolling IT into view moves nothing;
  // scroll the document to its end instead. Double-rAF so route()'s
  // scroll-to-top settles first.
  requestAnimationFrame(() => requestAnimationFrame(() => {
    scrollChatToEnd();
    if (manageFocus) $("chat-input").focus({ preventScroll: true });
  }));
}

function scrollChatToEnd() {
  window.scrollTo({
    top: document.documentElement.scrollHeight,
    behavior: matchMedia("(prefers-reduced-motion: no-preference)").matches ? "smooth" : "auto",
  });
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
  const passages = followupPassages(last.sources);
  if (!passages.length) return; // no passages, no follow-ups — never a spinner
  const myAbort = new AbortController();
  chatFollowAbort = myAbort;
  try {
    // The Ask page started generating these the moment its answer landed;
    // if that fetch is still running for this very turn, wait for it.
    const inflight = askFollowupsInflight;
    const reuse = inflight && inflight.question === asked.text && inflight.answer === last.text;
    const questions = reuse
      ? await inflight.promise
      : normaliseFollowups(await api("/api/followups", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ question: asked.text, answer: last.text, passages }),
          signal: myAbort.signal,
        }));
    if (chatFollowAbort !== myAbort || chatThread[chatThread.length - 1] !== last) return;
    if (!questions.length) return;
    last.next = questions;
    saveChatSession();
    renderChatNext(questions);
    // They arrive under the answer, above the sticky composer: bring them into view.
    requestAnimationFrame(() => scrollChatToEnd());
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
    // They land together but read as a list, so they arrive as one: rise-in
    // staggers off --i, and the stylesheet drops the motion under
    // prefers-reduced-motion.
    b.className = "chat-next-btn rise-in";
    b.style.setProperty("--i", String(row.children.length));
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

/**
 * The search URL. `page` and `sort` are optional and omitted at their defaults,
 * so searchHash(q, f) is still the search's identity — what the answer rail and
 * the "search without filters" links key on — while searchHash(q, f, 3, sort)
 * is a shareable link to one page of it.
 */
function searchHash(q, f, page, sort) {
  const p = new URLSearchParams();
  if (q) p.set("q", q);
  for (const k of ["speaker", "party", "state", "topic", "from", "to"]) if (f[k]) p.set(k, f[k]);
  if (f.kind && f.kind !== "speech") p.set("kind", f.kind);
  if (f.mode && f.mode !== "hybrid") p.set("mode", f.mode);
  if (sort && sort !== "relevance") p.set("sort", sort);
  if (page > 1) p.set("page", String(page));
  return `/search?${p.toString()}`;
}

const SEARCH_PER_PAGE = 20;
// One request can take the whole retrieved window, which is what Export needs.
// Matches SEARCH_PER_MAX in the Worker.
const SEARCH_EXPORT_MAX = 200;

function searchQueryParams(q, f, page, sort) {
  const p = new URLSearchParams({
    q: q || f.speaker, kind: f.kind || "speech", mode: f.mode || "hybrid",
    page: String(page || 1), per: String(SEARCH_PER_PAGE), sort: sort || "relevance",
  });
  for (const k of ["speaker", "party", "state", "topic", "from", "to"]) if (f[k]) p.set(k, f[k]);
  return p;
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
  // Chips and popover in step both ways: a control changing re-draws the chips
  // and, once something has been searched, re-runs at page one. Range inputs
  // fire `change` on release, so dragging a year is one search, not thirty.
  for (const id of ["f-speaker", "f-party", "f-state", "f-topic", "f-from", "f-to",
    "search-kind", "search-mode"]) {
    $(id)?.addEventListener("change", searchFiltersChanged);
  }
}

// --- active filters, shown outside the popover that set them ----------------
// Search and ask offer nearly the same filters behind nearly the same popover,
// so both say what is on with the same chips: one builder for the labels, one
// renderer, and a per-page clear function behind each cross.

const FILTER_KIND_LABELS = {
  speech: "Speeches", news: "News", division: "Divisions", all: "Everything",
};
const FILTER_MODE_LABELS = { hybrid: "Hybrid", semantic: "Semantic", keyword: "Keyword" };

/**
 * One entry per genuinely non-default filter, over the union of what the two
 * pages offer: each passes only the keys it has, so search's mode never earns
 * a chip on ask. Corpus and mode have defaults (speeches, hybrid) so they only
 * earn one when changed; the year slider at full extent is not a filter at all,
 * which currentFilters() and askFilters() already blank.
 */
function filterChipSpecs(f) {
  const out = [];
  if (f.speaker) out.push({ id: "speaker", k: "Speaker", v: f.speaker });
  if (f.party) out.push({ id: "party", k: "Party", v: f.party });
  if (f.state) out.push({ id: "state", k: "Parliament", v: STATE_NAMES[f.state] || f.state });
  if (f.topic) out.push({ id: "topic", k: "Topic", v: TOPICS[f.topic] || f.topic });
  if (f.from || f.to) {
    const a = f.from || "1993", b = f.to || "2026";
    out.push({ id: "years", k: "Years", v: a === b ? a : `${a} to ${b}` });
  }
  if (f.kind && f.kind !== "speech") {
    out.push({ id: "kind", k: "Corpus", v: FILTER_KIND_LABELS[f.kind] || f.kind });
  }
  if (f.mode && f.mode !== "hybrid") {
    out.push({ id: "mode", k: "Mode", v: FILTER_MODE_LABELS[f.mode] || f.mode });
  }
  return out;
}

/**
 * Draw `f`'s chips into `row`; each cross calls `clear` with the spec's id, and
 * the link past two chips calls it with "all". An emptied row folds away in CSS
 * (`.filter-chips:empty`), so nothing here has to juggle `hidden`.
 */
function renderFilterChipsInto(row, f, clear) {
  if (!row) return;
  const specs = filterChipSpecs(f);
  row.replaceChildren();
  for (const s of specs) {
    const chip = document.createElement("span");
    chip.className = "fchip";
    chip.innerHTML =
      `<span class="fchip-k">${esc(s.k)}</span><span class="fchip-v">${esc(s.v)}</span>` +
      `<button type="button" class="fchip-x" aria-label="Remove the ${esc(s.k.toLowerCase())} filter, ${esc(s.v)}">` +
      `<svg viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" aria-hidden="true"><path d="M2.6 2.6l6.8 6.8M9.4 2.6l-6.8 6.8"/></svg></button>`;
    chip.querySelector("button").addEventListener("click", () => clear(s.id));
    row.appendChild(chip);
  }
  if (specs.length > 1) {
    const all = document.createElement("button");
    all.type = "button";
    all.className = "fchip-clear";
    all.textContent = "Clear all";
    all.addEventListener("click", () => clear("all"));
    row.appendChild(all);
  }
}

function renderFilterChips() {
  renderFilterChipsInto($("search-filter-chips"), currentFilters(), clearSearchFilter);
}

const SEARCH_FILTER_RESETS = {
  speaker: () => { $("f-speaker").value = ""; },
  party: () => { $("f-party").value = ""; },
  state: () => { $("f-state").value = ""; },
  topic: () => { $("f-topic").value = ""; },
  years: () => { $("f-from").value = "1993"; $("f-to").value = "2026"; updateSearchYearsLabel(); },
  kind: () => { $("search-kind").value = "speech"; },
  mode: () => { $("search-mode").value = "hybrid"; },
};

function clearSearchFilter(id) {
  if (id === "all") for (const reset of Object.values(SEARCH_FILTER_RESETS)) reset();
  else SEARCH_FILTER_RESETS[id]?.();
  searchFiltersChanged();
}

/** A filter moved, from a chip's cross or from the popover. */
function searchFiltersChanged() {
  renderFilterChips();
  if (!lastSearch.key) return; // nothing searched yet: the chips are the whole feedback
  const q = $("search-input").value.trim();
  const f = currentFilters();
  if (!q && !f.speaker) {
    // Dropping the speaker chip on a speaker-only search leaves nothing to
    // search for, so go back to a blank search page rather than stale results.
    goRoute("/search");
    return;
  }
  // A wider or narrower set: page one, never page seven of two.
  goRoute(searchHash(q, f, 1, $("search-sort").value));
}

// The same three pieces for the ask page. Its scope checkbox ("Also search
// recorded divisions") is the corpus filter under another name, so it
// arrives as `kind` and earns the same Corpus chip search shows.
function askChipFilters() {
  return { ...askFilters(), kind: askKind() };
}

function renderAskFilterChips() {
  const row = $("ask-filter-chips");
  renderFilterChipsInto(row, askChipFilters(), clearAskFilter);
  // The row holds its line only once a question is in play, so a chip arriving
  // beside an answer cannot shove it down. On the front page, where nobody has
  // set a filter yet, reserving it would just be dead air above the box.
  row.classList.toggle("is-reserved", askInPlay());
}

const ASK_FILTER_RESETS = {
  speaker: () => { $("a-speaker").value = ""; },
  party: () => { $("a-party").value = ""; },
  state: () => { $("a-state").value = ""; },
  topic: () => { $("a-topic").value = ""; },
  years: () => { $("a-from").value = "1993"; $("a-to").value = "2026"; updateAskYearsLabel(); },
  kind: () => { $("ask-wide").checked = false; },
};

function clearAskFilter(id) {
  if (id === "all") for (const reset of Object.values(ASK_FILTER_RESETS)) reset();
  else ASK_FILTER_RESETS[id]?.();
  askFiltersChanged();
}

/** A question is answered, or on its way: a filter change has an ask to redo. */
function askInPlay() {
  return Boolean(lastAsk.question) || !$("ask-result").hidden ||
    Boolean($("ask-status").textContent);
}

/** A filter moved, from a chip's cross or from the popover. */
function askFiltersChanged() {
  renderAskFilterChips();
  if (!askInPlay()) return; // nothing asked yet: the chips are the whole feedback
  const q = lastAsk.question || $("ask-input").value.trim();
  if (!q) return;
  // The answer standing on the page was written under the old filters, so ask
  // again under the new ones. The URL carries the scope the way it always has,
  // so the link still re-asks what is being read.
  replaceRoute(askHash(q, askKind()));
  runAsk(q);
}

let searchApplied = null; // guards re-running the same URL state (null: nothing applied yet)

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
    $("search-sort").value = params.get("sort") === "newest" ? "newest" : "relevance";
    renderFilterChips();
    // The page rides in the hash, so back, forward and a pasted &page=3 all
    // land on the same twenty results.
    runSearch(Number(params.get("page")) || 1);
  } else if (params.has("state")) {
    // A parliament alone (the home page's state map): preset the filter and
    // say so; there is no query to run until the reader types one.
    const state = params.get("state") || "";
    $("f-state").value = state;
    const name = STATE_NAMES[state] || state;
    setStatus($("search-status"), name
      ? `Filtered to the ${name} parliament. Type a question or a phrase to search its record.`
      : "");
    renderFilterChips();
    renderSearchChips();
  } else {
    // A bare search page: nothing asked yet, so offer somewhere to start.
    clearSearchResults();
    renderFilterChips();
    renderSearchChips();
  }
}

/** Back to a search page with nothing on it (a cleared filter can land here). */
function clearSearchResults() {
  lastSearch = {
    key: "", query: "", filters: {}, sort: "relevance", results: [],
    page: 1, perPage: SEARCH_PER_PAGE, pageCount: 1, total: 0, truncated: false,
  };
  $("search-results").replaceChildren();
  $("results-bar").hidden = true;
  $("search-pager").hidden = true;
  $("search-empty").hidden = true;
  $("search-answer").hidden = true;
  setStatus($("search-status"), "");
}

// Example searches for an empty search page. Plain phrases a reader might
// actually wonder about, not jargon; each returns real passages.
const SEARCH_EXAMPLES = [
  "cost of living", "negative gearing", "poker machines", "rental crisis",
  "aged care", "childcare", "bulk billing", "student debt",
  "supermarket prices", "penalty rates", "climate change", "renewable energy",
  "housing affordability", "robodebt", "gambling advertising", "Uluru Statement",
  "submarines", "bushfires", "domestic violence", "public transport",
  "vaping", "interest rates", "aged pension", "childcare subsidy",
];

/** Six examples, fading up in turn, on a search page with nothing on it yet. */
function renderSearchChips() {
  const row = $("search-chips");
  if (!row) return;
  row.replaceChildren();
  const label = document.createElement("span");
  label.className = "chip-label";
  label.textContent = "Try:";
  row.appendChild(label);
  const picks = [...SEARCH_EXAMPLES].sort(() => Math.random() - 0.5).slice(0, 6);
  picks.forEach((q, i) => {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "chip rise-in";
    b.style.setProperty("--i", String(i + 1));
    b.textContent = q;
    b.addEventListener("click", () => {
      $("search-input").value = q;
      $("search-form").requestSubmit();
    });
    row.appendChild(b);
  });
  row.hidden = false;
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

// Sorting is the Worker's job now. It orders every retrieved match before it
// slices the page, so "newest first" means newest of the whole result set and
// not merely newest of the twenty in hand.
// The gold bar is a button, not decoration: hovering, focusing or tapping it
// opens the shared definition card (see initTermTips) with the score in words.
// Its own label carries the number, so the row says it once.
function renderResults(results) {
  initTermTips();
  // A new page of results throws away the row the open card was parented to.
  hideTermTip(false);
  $("search-results").replaceChildren(
    ...results.map((r) => {
      const li = document.createElement("li");
      const pct = Math.round((r.score || 0) * 100);
      li.innerHTML = `
        <div>
          <button type="button" class="link result-title">${esc(displayTitle(r))}</button><button
            type="button" class="scorebar" data-tip="relevance" data-tip-pct="${pct}"
            aria-label="Relevance ${pct}%"><i style="width:${pct}%"></i></button>
        </div>
        <span class="result-meta">${metaHTML(r, { linkSpeaker: true, linkParty: true, portrait: true })}</span>
        <p class="snippet">${highlightHTML(r.snippet, $("search-input").value)}</p>`;
      li.querySelector(".result-title").addEventListener("click", () => {
        goRoute(`/doc/${r.slug}`);
      });
      return li;
    }),
  );
  decorateMetaPortraits($("search-results"));
}

/**
 * The count line. It says how many are shown and how many were retrieved, and
 * when retrieval hit its ceiling it says the record holds more rather than
 * implying the ceiling is the answer. The filters are not repeated here: the
 * chips under the search box carry them.
 */
function resultsCountLine(s) {
  const n = s.total.toLocaleString();
  if (s.pageCount <= 1) {
    return s.truncated
      ? `The ${n} strongest matches. The record holds more.`
      : `All ${n} ${s.total === 1 ? "match" : "matches"} in the record.`;
  }
  const from = ((s.page - 1) * s.perPage + 1).toLocaleString();
  const to = Math.min(s.page * s.perPage, s.total).toLocaleString();
  return s.truncated
    ? `Showing ${from} to ${to} of the ${n} strongest matches. The record holds more.`
    : `Showing ${from} to ${to} of ${n} matches in the record.`;
}

// How many numbered slots the pager offers. Odd, so the page you are on sits in
// the middle of its window, and fixed, so the row keeps its width from page to
// page instead of growing and shrinking under the pointer.
const PAGER_SLOTS = 7;

/**
 * The numbers to show: the first page, the last page, and a run around the one
 * you are on, with 0 standing for an elided run. Once the result has PAGER_SLOTS
 * pages or more the answer is always exactly that many entries, and an ellipsis
 * only ever replaces two pages or more, so no page is ever hidden behind one.
 */
function pagerSlots(page, pageCount) {
  const run = (a, b) => Array.from({ length: b - a + 1 }, (_, i) => a + i);
  if (pageCount <= PAGER_SLOTS) return run(1, pageCount);
  const near = PAGER_SLOTS - 2; // what fits beside one ellipsis and the far end
  if (page <= near - 1) return [...run(1, near), 0, pageCount];
  if (page > pageCount - near + 1) return [1, 0, ...run(pageCount - near + 1, pageCount)];
  const half = Math.floor((PAGER_SLOTS - 4) / 2);
  return [1, 0, ...run(page - half, page + half), 0, pageCount];
}

/** The numbered buttons between Previous and Next. */
function renderPagerNumbers(s) {
  const box = $("pager-pages");
  if (!box) return;
  // Rebuilding drops whatever the keyboard was on, so if the reader paged from
  // here, hand focus to the number they landed on rather than to the document.
  const held = box.contains(document.activeElement);
  const frag = document.createDocumentFragment();
  for (const n of pagerSlots(s.page, s.pageCount)) {
    if (!n) {
      // The elided run is not a control and has nothing to say that the numbers
      // either side do not: heard, it would only be "horizontal ellipsis".
      const gap = document.createElement("span");
      gap.className = "pager-gap";
      gap.setAttribute("aria-hidden", "true");
      gap.textContent = "…";
      frag.append(gap);
      continue;
    }
    const b = document.createElement("button");
    b.type = "button";
    b.className = "pager-btn pager-num";
    b.dataset.page = String(n);
    // A bare digit is no name to hear, and the total is what tells the reader
    // how far a jump is: the same words Previous and Next use.
    b.setAttribute("aria-label", `Page ${n} of ${s.pageCount}`);
    b.textContent = String(n);
    // Marked, not disabled: the page you are on stays in the tab order, and
    // clicking it is already a no-op in goToSearchPage.
    if (n === s.page) b.setAttribute("aria-current", "page");
    frag.append(b);
  }
  box.replaceChildren(frag);
  // preventScroll because the search flow scrolls to the top of the results
  // straight after this, and two scrolls read as a flinch.
  if (held) box.querySelector('[aria-current="page"]')?.focus({ preventScroll: true });
}

function renderPager() {
  const nav = $("search-pager");
  const s = lastSearch;
  if (!nav) return;
  if (!s.results.length) { nav.hidden = true; return; }
  nav.hidden = false;
  // One page still keeps the band: the controls go invisible, not away, so
  // arriving at a short last page never lifts everything below it.
  nav.dataset.single = s.pageCount > 1 ? "0" : "1";
  const prev = $("pager-prev"), next = $("pager-next");
  prev.disabled = s.page <= 1;
  next.disabled = s.page >= s.pageCount;
  prev.setAttribute("aria-label",
    prev.disabled ? "Previous page (you are on the first page)" : `Previous page, page ${s.page - 1} of ${s.pageCount}`);
  next.setAttribute("aria-label",
    next.disabled ? "Next page (you are on the last page)" : `Next page, page ${s.page + 1} of ${s.pageCount}`);
  renderPagerNumbers(s);
  // The numbers say where you are on screen. This says it again for a reader
  // who hears the page turn instead of seeing it.
  $("pager-where").textContent = s.pageCount > 1 ? `Page ${s.page} of ${s.pageCount}` : "";
}

let searchScrollPending = false;

/** Put the reader at the top of the results, not the top of the document.
 *  scrollIntoView honours html { scroll-padding-top }, so the sticky header
 *  does not sit over the first result. */
function scrollToResults() {
  const anchor = $("results-bar");
  if (!anchor || anchor.hidden) return;
  anchor.scrollIntoView({
    block: "start",
    behavior: matchMedia("(prefers-reduced-motion: no-preference)").matches ? "smooth" : "auto",
  });
}

function goToSearchPage(n) {
  const s = lastSearch;
  const target = Math.min(Math.max(1, n), s.pageCount);
  if (target === s.page) return;
  searchScrollPending = true;
  // A real navigation, so back and forward walk the pages and a copied link
  // opens the page the reader was on.
  goRoute(searchHash(s.query, s.filters, target, s.sort));
}

$("pager-prev")?.addEventListener("click", () => goToSearchPage(lastSearch.page - 1));
$("pager-next")?.addEventListener("click", () => goToSearchPage(lastSearch.page + 1));
// Delegated: the numbered buttons are rebuilt on every page, the container is not.
$("pager-pages")?.addEventListener("click", (e) => {
  const btn = e.target.closest("button[data-page]");
  if (btn) goToSearchPage(Number(btn.dataset.page));
});

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
  if (shown) actions.push(`<a class="action-btn" href="${esc(webSearchUrl(shown))}" target="_blank" rel="noopener">Search the web ↗︎</a>`);
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
  if (!searchAnswerWanted) return;
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
  box.hidden = false;
}


// --- search answer (the summary beside the results) -------------------------

let searchAnswerAbort = null;
let searchAnswerStill = null;
let searchAnswerWanted = false; // an ask runs beside this search (there was a query)


// On phones the summary sits above the results (CSS order) and folds to a
// few lines once it has finished streaming, so the first result is one
// thumb-flick away rather than a screen of prose away. Wide screens keep the
// full rail. The fold only applies when the text actually overflows.
const SEARCH_ANSWER_FOLD_QUERY = "(max-width: 1099px)";
function resetSearchAnswerFold() {
  const box = $("search-answer");
  const body = $("search-answer-body");
  const btn = $("search-answer-readmore");
  const narrow = window.matchMedia(SEARCH_ANSWER_FOLD_QUERY).matches;
  // Phones: the card is clamped from the first character and holds its
  // folded height while it waits (a hairline skeleton stands in), so the
  // results underneath never move and nothing is shown whole then folded.
  box.classList.toggle("is-clamped", narrow);
  box.classList.toggle("is-loading", narrow);
  if (narrow) {
    const sk = document.createElement("div");
    sk.className = "answer-skeleton";
    sk.setAttribute("aria-hidden", "true");
    sk.append(...[92, 100, 96, 60].map((w) => { const b = document.createElement("i"); b.style.width = `${w}%`; return b; }));
    body.replaceChildren(sk);
  }
  // Folded: the control is present but invisible (its line is reserved);
  // unfolded (wide screens): absent.
  if (btn) { btn.hidden = !narrow; btn.classList.remove("is-ready"); btn.setAttribute("aria-expanded", "false"); }
}
const searchAnswerFolds = () => window.matchMedia(SEARCH_ANSWER_FOLD_QUERY).matches;
function searchAnswerArrived() {
  const box = $("search-answer");
  box.classList.remove("is-loading");
  $("search-answer-body").querySelector(".answer-skeleton")?.remove();
}
function offerSearchAnswerReadMore() {
  const box = $("search-answer");
  const body = $("search-answer-body");
  const btn = $("search-answer-readmore");
  if (!btn || !box.classList.contains("is-clamped") || btn.classList.contains("is-ready")) return;
  if (body.scrollHeight <= body.clientHeight + 8) return;
  btn.classList.add("is-ready");
  btn.onclick = () => {
    box.classList.remove("is-clamped");
    btn.hidden = true;
    btn.setAttribute("aria-expanded", "true");
  };
}
function foldSearchAnswer() {
  const box = $("search-answer");
  const body = $("search-answer-body");
  searchAnswerArrived();
  if (!box.classList.contains("is-clamped")) return;
  // A short summary needs no fold: let it stand whole.
  if (body.scrollHeight <= body.clientHeight + 8) { box.classList.remove("is-clamped"); $("search-answer-readmore").hidden = true; return; }
  offerSearchAnswerReadMore();
  // Overflowing but never offered (a rare race): offer it now.
  if (!$("search-answer-readmore").classList.contains("is-ready")) { $("search-answer-readmore").classList.add("is-ready"); }
}

async function runSearchAnswer(q, f, mySeq) {
  const box = $("search-answer");
  if (!q) { box.hidden = true; return; }
  if (searchAnswerAbort) searchAnswerAbort.abort();
  const abort = new AbortController();
  searchAnswerAbort = abort;
  // The rail stays hidden until the results land: the answer always takes
  // longer than the search, and an empty rail with a loader reads as a stall.
  $("search-answer-body").replaceChildren();
  $("search-answer-sources").replaceChildren();
  $("search-answer-fold").hidden = true;
  $("search-answer-fold").open = false;
  $("search-answer-more").textContent = "Generating from the retrieved passages…";
  setStatus($("search-answer-status"), "Reading the record…");
  resetSearchAnswerFold();
  $("search-answer-status").classList.add("visually-hidden"); // announced; the loader shows it
  if (!searchAnswerFolds()) showLoader("search-answer-wombat", ""); // phones: the skeleton is the loader
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
          searchAnswerArrived();
        }
        live.push(text);
        offerSearchAnswerReadMore();
      },
      retry() {
        if (!mine()) return;
        streamed = false;
        live.reset();
        if (!searchAnswerFolds()) showLoader("search-answer-wombat", "");
      },
    });
    live.stop();
    if (!mine()) return;
    const answer = (data.answer || "").trim();
    if (!answer) { clearTimeout(searchAnswerStill); hideLoader("search-answer-wombat"); searchAnswerArrived(); box.hidden = true; return; }
    clearTimeout(searchAnswerStill);
    hideLoader("search-answer-wombat");
    setStatus($("search-answer-status"), "");
    renderAnswer($("search-answer-body"), answer);
    foldSearchAnswer();
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

async function runSearch(page = 1) {
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
  renderFilterChips(); // in place before the results land, so nothing shifts
  const sort = $("search-sort").value;
  const key = searchHash(q, f);
  // A different result set, or another page of the one on screen? Only the
  // first is worth a new answer: the rail asks once per search, not per page.
  const fresh = key !== lastSearch.key;
  const mySeq = ++searchSeq;
  if (fresh) {
    searchAnswerWanted = !!q;
    $("search-answer").hidden = true;
    $("search-answer-empty").hidden = true;
    runSearchAnswer(q, f, mySeq);
  }
  const btn = $("search-form").querySelector('button[type="submit"]');
  btn.disabled = true;
  setStatus($("search-status"), "Searching the record…");
  $("search-status").classList.add("visually-hidden"); // announced; the loader shows it
  showLoader("search-wombat", fresh ? "Searching the record." : "Turning the page.");
  // Paging keeps the bar and the pager in place: only the list is swapped, so
  // the page does not collapse and rebuild under the reader.
  if (fresh) { $("results-bar").hidden = true; $("search-pager").hidden = true; }
  $("search-results").replaceChildren();
  $("search-chips").hidden = true; // the examples step aside once a search runs
  $("search-empty").hidden = true;
  try {
    const data = await api(`/api/search?${searchQueryParams(q, f, page, sort)}`);
    if (mySeq !== searchSeq) return; // a newer search owns the results now
    const results = data.results || [];
    lastSearch = {
      key, query: q, filters: f, sort, results,
      page: data.page || 1,
      perPage: data.per_page || SEARCH_PER_PAGE,
      pageCount: data.page_count || 1,
      total: data.total ?? results.length,
      truncated: !!data.truncated,
    };
    if (!data.count) {
      hideLoader("search-wombat");
      setStatus($("search-status"), "No results from the record.");
      $("search-status").classList.add("visually-hidden"); // announced; the empty state carries the words
      $("results-bar").hidden = true;
      $("search-pager").hidden = true;
      renderSearchEmpty(q, f);
      giveUpSearchAnswer();
    } else {
      hideLoader("search-wombat");
      $("search-status").classList.remove("visually-hidden");
      setStatus($("search-status"), "");
      $("results-count").textContent = resultsCountLine(lastSearch);
      $("results-bar").hidden = false;
      renderResults(results);
      renderPager();
      // A stale &page=9 past the end lands on the last real page; correct the
      // URL in place so the link the reader copies is the page they can see.
      if (lastSearch.page !== page) {
        const fixed = searchHash(q, f, lastSearch.page, sort);
        searchApplied = fixed.replace(/^#\/search\?/, "");
        history.replaceState(null, "", fixed);
      }
      if (searchAnswerWanted && fresh) $("search-answer").hidden = false; // the rail joins the results
      if (searchScrollPending) scrollToResults();
    }
  } catch (err) {
    if (mySeq !== searchSeq) return;
    hideLoader("search-wombat");
    setStatus($("search-status"), String(err.message || err), true);
  } finally {
    if (mySeq === searchSeq) { btn.disabled = false; searchScrollPending = false; }
  }
}

$("search-form").addEventListener("submit", (e) => {
  e.preventDefault();
  const q = $("search-input").value.trim();
  const f = currentFilters();
  if (!q && !f.speaker) return;
  // A new query always starts at page one.
  const sort = $("search-sort").value;
  searchApplied = searchHash(q, f, 1, sort).split("?")[1] || "";
  replaceRoute(searchHash(q, f, 1, sort));
  runSearch(1);
});

// The sort is applied by the Worker across every retrieved match, so changing
// it is a new first page, not a reshuffle of the twenty on screen.
$("search-sort").addEventListener("change", () => {
  if (!lastSearch.key) return;
  goRoute(searchHash(lastSearch.query, lastSearch.filters, 1, $("search-sort").value));
});

$("search-copylink").addEventListener("click", (e) => {
  // Swap only the label span so the "Copied" feedback keeps the icon.
  // The page goes with the link: what you share is what you were reading.
  copyText(siteUrl(searchHash(lastSearch.query, lastSearch.filters, lastSearch.page, lastSearch.sort)),
    e.currentTarget.querySelector("span"));
});

// Export means the whole result set, not the page in hand. The Worker keeps
// the retrieved window assembled, so `per` takes all of it in one request.
$("search-export").addEventListener("click", async (e) => {
  const s = lastSearch;
  if (!s.results.length) return;
  const btn = e.currentTarget;
  const label = btn.querySelector("span");
  const wording = label.textContent;
  let rows = s.results;
  let scope = `all ${s.total} retrieved matches`;
  if (s.pageCount > 1) {
    btn.disabled = true;
    label.textContent = "Collecting every page…";
    try {
      const params = searchQueryParams(s.query, s.filters, 1, s.sort);
      params.set("per", String(SEARCH_EXPORT_MAX));
      const data = await api(`/api/search?${params}`);
      rows = data.results?.length ? data.results : rows;
    } catch {
      scope = `page ${s.page} of ${s.pageCount} only (collecting the rest failed)`;
    } finally {
      btn.disabled = false;
      label.textContent = wording;
    }
  }
  const f = s.filters;
  offerExport(rows, [
    `# query: ${s.query}`,
    `# filters: ${activeFilterSummary(f) || "none"} · corpus: ${f.kind || "speech"} · mode: ${f.mode || "hybrid"} · sort: ${s.sort}`,
    `# scope: ${scope}`,
    s.truncated
      ? `# retrieval reaches the ${s.total} strongest matches; the record holds more`
      : `# retrieval reached every match in the record for this query`,
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
  $("doc-record-head").hidden = true;
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
    // The headline is the speaker; the title repeats what the byline says, so
    // it only stands in when no speaker is attached, and then as its subject.
    $("doc-title").textContent = doc.speaker || displayTitle(doc);
    // The trail names the page the same way, shortened for the strip.
    setCrumbs([{ label: "Search", href: "/search" }, {
      label: (doc.kind || slug.split("-")[0]) === "division"
        ? "Division" : crumbLabel(doc.speaker || displayTitle(doc), 48),
    }]);
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
    // The debate this speech sat in. Most of the corpus carries no debate
    // field, and there the title's own subject is the only thing that names
    // what was being discussed, so it stands in rather than leaving a blank.
    // Only under a speaker headline: without one the headline is already it.
    const topic = doc.metadata?.topic || doc.metadata?.debate ||
      (doc.speaker ? titleSubject(doc) : "");
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
      origin ? `<a href="${esc(origin)}" rel="noopener" target="_blank">View original ↗︎</a>` : "",
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
        `<a href="${href}" rel="noopener" target="_blank">${label} ↗︎</a>`;
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
      // Only worth naming when something else stands above it.
      $("doc-record-head").hidden = false;
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
  // Search the subject, not the speaker and not the date: those would find
  // this speaker's other days rather than other speeches on this debate.
  goRoute(searchHash(titleSubject(currentDoc) || currentDoc.title, {}));
});
$("doc-more").addEventListener("click", () => {
  if (!currentDoc?.speaker) return;
  goRoute(searchHash("", { speaker: currentDoc.speaker }));
});
$("doc-profile").addEventListener("click", () => {
  if (!currentDoc?.speaker) return;
  goRoute(subjectHash("person", currentDoc.speaker));
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
      card.addEventListener("click", () => { goRoute(`/reports/${r.slug}`); });
      return card;
    }),
  );
  if (manageFocus) list.querySelector(".report-card")?.focus();
}

// Charts: single-hue bronze marks (CSS-owned); sr-only data table carries the values.
// `note` is escaped here; `noteHTML` is trusted markup the caller has already
// escaped piece by piece (it exists so a note can carry a link).
// `linkTo(key)` makes each column a link (the whole column height is the hit
// area, so a thin bar is as easy to reach as a tall one); the hidden table
// carries the same links for screen readers.
function columnChart(pairs, { fmt = String, heading, note, noteHTML, linkTo }) {
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
      const bar = `<path class="chart-bar" d="M${x},${base} V${y + r} Q${x},${y} ${x + r},${y} H${x + bw - r} Q${x + bw},${y} ${x + bw},${y + r} V${base} Z"/>`;
      const tip = `<title>${esc(String(k))}: ${esc(fmt(v))}${linkTo ? ". Open these speeches" : ""}</title>`;
      bars += linkTo
        ? `<a class="chart-bar-link" href="${esc(linkTo(k))}" tabindex="-1">${tip}<rect class="chart-hit" x="${x}" y="0" width="${bw}" height="${base}"/>${bar}</a>`
        : bar.replace("/>", `>${tip}</path>`);
    }
    if (i === peakIdx) {
      bars += `<text x="${Math.min(Math.max(x + bw / 2, 24), W - 24)}" y="${y - 5}" class="chart-peak" text-anchor="middle">${esc(fmt(v))}</text>`;
    }
  });
  const first = pairs[0]?.[0] ?? "", last = pairs[pairs.length - 1]?.[0] ?? "";
  // The hiding wrapper is a div, not the table: a table's caption box sits
  // outside the table's own clipped box, so a visually-hidden table still
  // paints its caption over whatever follows it.
  const srTable = `<div class="visually-hidden"><table><caption>${esc(heading)}</caption>
    <thead><tr><th scope="col">Year</th><th scope="col">Value</th></tr></thead>
    <tbody>${pairs.map(([k, v]) => `<tr><td>${linkTo ? `<a href="${esc(linkTo(k))}">${esc(String(k))}</a>` : esc(String(k))}</td><td>${esc(fmt(v))}</td></tr>`).join("")}</tbody></table></div>`;
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

/** `term(name)` turns a row label into a definition popover trigger (see
 *  initTermTips); the button's text is still the label, so its accessible name
 *  reads as the category. Only used where nothing else claims the label. */
function barList(rows, { fmt = String, heading, linkTo, partyDots = false, term = null }) {
  const max = Math.max(...rows.map(([, v]) => v), 1);
  const items = rows.map(([name, v]) => {
    const key = linkTo ? null : term?.(name);
    const label = `${partyDots ? partyDotHTML(name) : ""}${esc(name)}`;
    return `
    <div class="barrow">
      ${linkTo
        ? `<a class="barrow-name" title="${esc(name)}" href="${esc(linkTo(name))}">${label}</a>`
        : key
          ? `<button type="button" class="barrow-name barrow-term" data-term="${esc(key)}">${label}</button>`
          : `<span class="barrow-name" title="${esc(name)}">${label}</span>`}
      <span class="barrow-track" aria-hidden="true"><i style="width:${Math.max((v / max) * 100, 1)}%"></i></span>
      <span class="barrow-value">${esc(fmt(v))}</span>
    </div>`;
  }).join("");
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
      linkTo: (y) => searchHash(topic, { from: String(y), to: String(y) }), // a bar opens that year's speeches
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
    a.href = `/doc/${slug}`;
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
    setCrumbs([{ label: "Reports", href: "/reports" }, { label: $("report-title").textContent.trim() }]);
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
  if (!hereRoute().startsWith(`/reports/${slug}`)) return;
  currentReportSlug = slug;
  setStatus($("reports-status"), "");
  $("reports-list").hidden = true;
  const view = $("report-view");
  view.hidden = false;
  $("report-title").innerHTML = `${reportGlyph(slug, "report-glyph")}${esc(report.title)}`;
  setCrumbs([{ label: "Reports", href: "/reports" }, { label: report.title }]);
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
          copyText(siteUrl(`/reports/${slug}/s/${i + 1}`), e.currentTarget.querySelector("span")));
        const askBtn = document.createElement("button");
        askBtn.type = "button";
        askBtn.className = "action-btn";
        askBtn.innerHTML = `${iconSvg("ask")}<span>Ask the record about this</span>`;
        askBtn.addEventListener("click", () => {
          goRoute(askHash(s.question));
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
    replaceRoute(askHash(legacyAsk));
  }
}

// Path entry contract (docs/SEO.md): the Worker serves real paths such as
// /subject/person/Name, /reports/gambling and /search?q=... for crawlers and
// shared links, and the app routes on those paths directly; the Worker's
// crawler block (#prerender) then yields to the app's own render. What the
// Worker wrote into the head names this one page ("Anthony Albanese · OPAX");
// route() would replace it with the view's generic title, so keep it for as
// long as that page is the one showing (a renderer such as Googlebot sees the
// named version, not "OPAX encyclopedia").
const BOOT_META = {
  url: document.querySelector('link[rel="canonical"]')?.getAttribute("href") || "",
  title: document.title,
  description: document.querySelector('meta[name="description"]')?.getAttribute("content") || "",
};
{
  // A link from before real paths ("/#/subject/donor/Name", still live in
  // bookmarks and other people's posts) becomes its path form before the first
  // route(), so the page a reader landed on has exactly one URL.
  const frag = rawFragment();
  if (frag.startsWith("/")) history.replaceState(null, "", pathFor(frag));
  document.documentElement.classList.add("spa-ready");
}

// Keeps the head's canonical/og:url on the current route after each route(),
// and the title/description on the view now showing.
const VIEW_DESCRIPTIONS = {
  search: "Search half a million Australian parliamentary speeches by keyword, speaker, party, state, topic and year.",
  money: "Disclosed political donations as territory you can spin: donors, parties and 28 years of returns.",
  reports: "Standing investigations pairing the money with the words, every claim cited to the record.",
  subject: "An entry in the OPAX encyclopedia of Australian parliamentarians, parties, donors and topics.",
  doc: "A document from the Australian parliamentary record, with its speaker, date and official source.",
  explore: "Play with the parliamentary record: the time machine, the record quiz, the ledger and the money map.",
  chat: "Follow-up questions on an answer from the parliamentary record, each reply cited to its sources.",
  about: "What OPAX is, what you can do here, and how answers are produced.",
  methods: "How the OPAX corpus is built, its known limits, and how to cite an answer or a speech.",
  stats: "Live counts for every collection in the OPAX index.",
  expenses: "What each category in the Independent Parliamentary Expenses Authority's quarterly reports covers.",
};
function syncPathMeta() {
  const path = hereRoute();
  const url = `${SITE_ORIGIN}${path}`;
  // Still on the page the Worker described: its title and description name
  // this subject, so they beat anything the view would set.
  const landed = url === BOOT_META.url;
  if (landed && BOOT_META.title) document.title = BOOT_META.title;
  const view = path.replace(/^\//, "").split(/[/?]/)[0];
  const desc = landed
    ? BOOT_META.description
    : view && view !== "ask"
      ? (VIEW_DESCRIPTIONS[view] || VIEW_DESCRIPTIONS.subject)
      : "Ask questions of half a million Australian parliamentary speeches and see who funds the people doing the talking. Every answer cited to the official record.";
  document.querySelector('link[rel="canonical"]')?.setAttribute("href", url);
  document.querySelector('meta[property="og:url"]')?.setAttribute("content", url);
  for (const sel of ['meta[name="description"]', 'meta[property="og:description"]', 'meta[name="twitter:description"]']) {
    document.querySelector(sel)?.setAttribute("content", desc);
  }
  for (const sel of ['meta[property="og:title"]', 'meta[name="twitter:title"]']) {
    document.querySelector(sel)?.setAttribute("content", document.title);
  }
}

route();
