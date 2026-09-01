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

const PANELS = ["ask", "search", "money", "reports", "explore", "doc", "subject", "about", "methods", "stats"];

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
  const statsLink = document.querySelector(".masthead-link");
  if (statsLink) {
    if (name === "stats") statsLink.setAttribute("aria-current", "true");
    else statsLink.removeAttribute("aria-current");
  }
}

const TITLES = {
  ask: "OPAX — ask what Australian politicians actually said",
  search: "Search the record — OPAX",
  money: "Money map — OPAX",
  reports: "Reports — OPAX",
  doc: "From the record — OPAX",
  subject: "OPAX encyclopedia",
  explore: "Explore — OPAX",
  about: "About — OPAX",
  methods: "Methods — OPAX",
  stats: "Corpus stats — OPAX",
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
  if (view === "subject" && segs[1] && segs[2]) {
    showPanel("subject");
    document.title = TITLES.subject;
    openSubject(segs[1], decodeURIComponent(segs[2]), manageFocus);
  } else if (view === "doc" && segs[1]) {
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
  const parts = String(text).split(/\*\*(.+?)\*\*/);
  parts.forEach((part, j) => {
    if (!part) return;
    if (j % 2 === 1) {
      const b = document.createElement("strong");
      b.textContent = part;
      el.appendChild(b);
    } else {
      el.appendChild(document.createTextNode(part));
    }
  });
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
    (meta ? `<span class="quote-meta">${meta}</span>` : "");
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
  card.classList.remove("shown");
  card.innerHTML = quoteCardHTML(s, idx, n);
  card.onclick = (e) => { e.preventDefault(); location.hash = `#/doc/${s.slug}`; };
  void card.offsetWidth; // restart the fade-up from the bottom
  card.classList.add("shown");
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
    <p class="kicker">The money — ${esc(industryLabel(ind))} (AEC disclosures)</p>
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
}

/** "What did John Howard say about pokies?" → filter retrieval to the speaker. */
function parseSpeakerIntent(q) {
  const m = /^what (?:did|has|have|does) ([A-Za-z'\u2019 .-]{4,40}?) (?:say|said|says)(?: about| on)? /i.exec(q.trim());
  if (!m) return null;
  const who = m[1].trim();
  if (/\b(parliament|house|senate|mps?|senators?|government|labor|liberal|greens|nationals|coalition|minister|ministers|politicians?|members|people|courts?|they)\b/i.test(who)) return null;
  const words = who.split(/\s+/);
  if (words.length < 2 || words.length > 4) return null;
  return who;
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

function subjectHash(kind, label) {
  return `#/subject/${kind}/${encodeURIComponent(label)}`;
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
    <p class="kicker">OPAX encyclopedia · ${esc(kindLabel)}</p>
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
    subjectMapHandle = await mountMoneyMap(el, "/graph/money.json", {
      focus: nodeId,
      chrome: "mini",
      askUrl: (industry) => askHash(`What has parliament said about ${industry.replace(/_/g, " ")}?`),
      onSelect: (node) => {
        if (!node || node.id === nodeId) return;
        location.hash = subjectHash(node.kind === "party" ? "party" : "donor", node.label);
      },
    });
    subjectMapHandle.select?.(nodeId);
  } catch {
    el.innerHTML = `<p class="status" style="padding:1rem">The map could not load here — <a href="/map">open the full map</a>.</p>`;
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
    ${list ? `<ol class="news-list" role="list">${list}</ol>` : `<p class="fineprint" style="margin-top:0.2rem">Nothing in today's politics headlines mentions them.</p>`}
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
    ${years} year${years > 1 ? "s" : ""} — all from published AEC disclosures.`;
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
        `<span>Not among the top 250 disclosed donors in the money data — the record may still mention them.</span>`;
      box.innerHTML = infoboxHTML(
        [["Type", kind === "party" ? "Political party" : "Organisation"]], "",
        [actionBtn("search", searchHash(`"${name}"`, {}), "Search the record for them", { primary: true }),
         actionBtn("map", "#/money", "Open the money map")]);
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
      `<span>active ${node.firstYear}–${node.lastYear}</span>`,
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
          : `What has parliament said about ${industryLabel(node.industry || name)}?`),
        `Ask what parliament said about ${isParty ? "them" : "this industry"}`, { primary: true }),
      actionBtn("search", searchHash(`"${node.label}"`, {}), "Search mentions in the record"),
      actionBtn("download", "/graph/money.json", "Download the data"),
    ]);
    sections.insertAdjacentHTML("beforeend", barList(flowRows, {
      fmt: fmtMoney,
      heading: isParty ? "Where it came from" : "Where the money went",
      linkTo: (nm) => subjectHash(isParty ? "donor" : "party", nm),
      partyDots: !isParty, // donor page rows are parties; party page rows are donors
    }));
    sections.insertAdjacentHTML("beforeend",
      `<p class="fineprint">${esc(AEC_NOTE)}</p>`);
    await subjectMentions(node.label, sections, "In parliament");
    subjectNews(node.label, sections);
    mountSubjectMap(node.id);
    return;
  }

  // person
  const sections = $("subject-sections");
  const box = $("subject-infobox");
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
    actionBtn("speeches", searchHash("", { speaker: name }), "All their speeches on OPAX", { primary: true }),
    actionBtn("external", `https://theyvoteforyou.org.au/search?query=${q}`, "Voting record", { external: true }),
    actionBtn("external", `https://www.aph.gov.au/Senators_and_Members/Parliamentarian_Search_Results?q=${q}`, "Parliamentary profile", { external: true }),
    actionBtn("external", `https://en.wikipedia.org/w/index.php?search=${q}%20Australian%20politician`, "Wikipedia", { external: true }),
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
  if (speeches.length) {
    const newest = [...speeches].sort((a, b) => String(b.date || "").localeCompare(String(a.date || ""))).slice(0, 8);
    sections.insertAdjacentHTML("beforeend",
      `<p class="kicker">Latest indexed speeches</p><ul class="subject-list" role="list">${newest.map((r) => `
        <li><a href="#/doc/${esc(r.slug)}" class="source-title">${esc(r.title)}</a>
          <span class="result-meta">${metaHTML(r)}</span></li>`).join("")}</ul>
      <p class="fineprint">The corpus is still indexing — this is what has been loaded so far, not their full record.</p>`);
  } else {
    sections.insertAdjacentHTML("beforeend",
      `<p class="status">No speeches by “${esc(name)}” in the indexed corpus yet — names appear as in
       Hansard, and the record is still loading. <a href="${esc(searchHash(name, {}))}">Search the record instead</a>.</p>`);
  }
  await subjectNews(name, sections);
  if (party) {
    await loadMoneyData();
    if (currentSubjectKey !== key) return;
    const pnode = findMoneyNode("party", party);
    if (pnode) {
      sections.insertAdjacentHTML("beforeend",
        `<p class="fineprint" style="margin-top:1rem">The money map starts from ${esc(party)} — the party this
         speaker's indexed speeches carry. In AEC disclosure data, money flows to parties, not individuals.</p>`);
      mountSubjectMap(pnode.id);
    }
  }
}

$("subject-back").addEventListener("click", () => {
  if (routeCount > 1) history.back();
  else location.hash = "#/";
});


// --- explore (time machine + quiz) ------------------------------------------
// Both are standalone lazy modules with a mount/destroy contract; the page
// only owns the toggle. Modules are mounted once and kept alive per session.

const explore = { tm: null, quiz: null };

async function openGame(which) {
  const dialog = $(which === "tm" ? "dialog-tm" : "dialog-quiz");
  dialog.showModal();
  try {
    if (which === "tm" && !explore.tm) {
      const mod = await import("/timemachine.js");
      explore.tm = mod.mountTimeMachine($("explore-tm"));
    }
    if (which === "quiz" && !explore.quiz) {
      const mod = await import("/quiz.js");
      explore.quiz = mod.mountQuiz($("explore-quiz"));
    }
  } catch (err) {
    $(which === "tm" ? "explore-tm" : "explore-quiz").innerHTML =
      `<p class="status">This could not load (${esc(String(err.message || err))}) — try again shortly.</p>`;
  }
}

$("explore-tm-btn").addEventListener("click", () => openGame("tm"));
$("explore-quiz-btn").addEventListener("click", () => openGame("quiz"));
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
    <p class="fineprint">Headlines link to ABC News and The Guardian — their words, not ours.
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
    ["5", "parliaments"],
  ];
  holder.innerHTML = tiles.map(([v, l]) => tile(v, l)).join("");
  if (corpusManifest) {
    $("front-numbers-note").innerHTML =
      `Live from the search index and corpus manifest v${esc(corpusVersion())}. <a href="#/stats">Full corpus breakdown</a>`;
  }
}

async function renderFrontTopic() {
  try {
    if (!reportsIndex) reportsIndex = (await api("/reports/index.json")).reports || [];
    if (!reportsIndex.length) return;
    const today = reportsIndex[Math.floor(Date.now() / 864e5) % reportsIndex.length];
    const report = await api(`/reports/${encodeURIComponent(today.slug)}.json`);
    const stats = report.stats;
    if (!stats) return;
    const don = stats.donations;
    $("h-mw").textContent = `Money & words — ${report.title}`;
    $("front-mw").innerHTML = `
      <p class="fineprint" style="margin:-0.3rem 0 0.4rem">Today's topic — changes daily.
      ${esc((stats.speech_count ?? 0).toLocaleString())} speeches${don ? ` · ${esc(fmtMoney(don.total ?? 0))} disclosed by ${esc(fmtIndustries(don.industries || []))} donors` : ""}.</p>
      ${moneyWordsCharts(stats)}
      ${don?.top_donors?.length ? barList(don.top_donors.slice(0, 5), {
        heading: "Largest donors", fmt: fmtMoney, linkTo: (nm) => subjectHash("donor", nm) }) : ""}
      <p class="fineprint"><a href="#/reports/${esc(today.slug)}">Read the ${esc(report.title)} report</a> ·
      <a href="#/reports">All reports</a></p>`;
    $("mod-mw").hidden = false;

    // Encyclopedia rail: today's topic's #1 donor and #1 speaker.
    const cards = [];
    await loadMoneyData();
    const topDonor = don?.top_donors?.[0];
    if (topDonor) {
      const node = findMoneyNode("donor", topDonor[0]);
      const fact = node ? weeklyFunFact(node).replace(/<[^>]+>/g, "") : "";
      cards.push(`<a class="report-card" href="${esc(subjectHash("donor", topDonor[0]))}">
        <span class="card-kicker">Donor${node?.industry ? ` · ${esc(industryLabel(node.industry))}` : ""}</span>
        <span class="card-title">${esc(topDonor[0])}</span>
        <span class="card-blurb">${esc(fmtMoney(topDonor[1]))} disclosed${node ? `, ${node.firstYear}–${node.lastYear}` : " to parties"}.
          ${esc(fact)}</span>
        <span class="card-meta">Open the entry →</span></a>`);
    }
    const topSpeaker = stats.top_speakers?.[0];
    if (topSpeaker) {
      cards.push(`<a class="report-card" href="${esc(subjectHash("person", topSpeaker[0]))}">
        <span class="card-kicker">Parliamentarian</span>
        <span class="card-title">${esc(topSpeaker[0])}</span>
        <span class="card-blurb">${esc(Number(topSpeaker[1]).toLocaleString())} speeches on ${esc(report.title.toLowerCase())} in the indexed record.</span>
        <span class="card-meta">Open the entry →</span></a>`);
    }
    if (cards.length) {
      $("front-ency").innerHTML = cards.join("");
      $("mod-ency").hidden = false;
    }

    // Reports row (index already in hand).
    $("front-reports").innerHTML = reportsIndex.map((r) => `
      <a class="report-card" href="#/reports/${esc(r.slug)}">
        <span class="card-title">${esc(r.title)}</span>
        <span class="card-blurb">${esc(r.blurb)}</span>
        <span class="card-meta">Updated ${esc(fmtDate(r.updated || ""))}</span></a>`).join("");
    $("mod-reports").hidden = false;
  } catch { /* modules stay hidden */ }
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
  if (frontRendered) return;
  frontRendered = true;
  renderFrontNews();
  onIdle(() => { renderFrontTopic(); renderFrontAdded(); });
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
  const speakerFilter = parseSpeakerIntent(question);
  btn.disabled = true;
  $("ask-result").hidden = true;
  $("ask-chips").hidden = true;
  setFrontPageHidden(true);
  setQuoteRail([]);
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
      body: JSON.stringify({ question, kind: askKind(), ...(speakerFilter ? { speaker: speakerFilter } : {}) }),
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
    renderAnswer($("ask-answer"), data.answer || "(no answer)");
    $("ask-stamp").textContent =
      `Generated ${fmtDate(localISODate())} · corpus v${corpusVersion()}` +
      (speakerFilter ? ` · retrieval filtered to ${speakerFilter}'s speeches` : "");
    $("ask-cited-list").replaceChildren(...citedList.map((s, i) => sourceItem(s, i + 1)));
    $("ask-retrieved").hidden = !alsoList.length;
    $("ask-retrieved-list").replaceChildren(...alsoList.map((s) => sourceItem(s, null)));
    $("ask-sources").hidden = !sources.length;
    setQuoteRail(citedList);
    $("ask-answer").focus();
  } catch (err) {
    if (askAbort !== myAbort) return; // a newer request owns the UI now
    if (err.name === "AbortError") setStatus($("ask-status"), "Cancelled.");
    else {
      setStatus($("ask-status"),
        `${err.message || err} — the record is still there; try again.`, true);
      // A failed ask leaves the page empty; the suggested starts return.
      if (suggestions.length) $("ask-chips").hidden = false;
      setFrontPageHidden(false);
    }
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
  for (const id of ["front-page", "front-rule"]) {
    const el = $(id);
    if (el) el.hidden = hidden;
  }
}

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
    `${indexed.toLocaleString()} of ${expected.toLocaleString()} collected documents indexed — more added daily. Answers may be incomplete while indexing runs.`;
  const pct = Math.min(Math.max(Math.round((indexed / expected) * 100), 1), 100);
  const bar = $(barId);
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
// The guided line is prose, not a <form>, so Enter must be wired by hand.
for (const id of ["guided-speaker", "guided-topic"]) {
  $(id).addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      $("guided-go").click();
    }
  });
}

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
  $("doc-speaker-links").hidden = true;
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
    // Ways into this speaker's wider record. External links are SEARCHES, so
    // a shared name shows candidates rather than asserting the wrong person.
    const speakerLinks = $("doc-speaker-links");
    if (doc.speaker) {
      const q = encodeURIComponent(doc.speaker);
      const ext = (href, label) =>
        `<a href="${href}" rel="noopener" target="_blank">${label} ↗</a>`;
      speakerLinks.innerHTML = `About ${esc(doc.speaker)}: ` + [
        `<a href="${esc(searchHash("", { speaker: doc.speaker }))}">all their speeches here</a>`,
        ext(`https://theyvoteforyou.org.au/search?query=${q}`, "voting record"),
        ext(`https://www.aph.gov.au/Senators_and_Members/Parliamentarian_Search_Results?q=${q}`, "parliamentary profile"),
        ext(`https://en.wikipedia.org/w/index.php?search=${encodeURIComponent(`${doc.speaker} Australian politician`)}`, "Wikipedia"),
      ].join(" · ");
      speakerLinks.hidden = false;
    }
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
  // history.length counts cross-origin entries too: a visitor arriving on a
  // shared citation link would be sent back OFF the site. Only go back if
  // this app has navigated at least once; otherwise go home.
  if (routeCount > 1) history.back();
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
      card.innerHTML = `<span class="card-title">${esc(r.title)}</span>
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

/** The paired speech/donation charts on one shared year axis (report page + homepage). */
function moneyWordsCharts(stats) {
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
    out += columnChart(seriesFor(speechYears),
      { heading: "Speeches per year", fmt: (v) => v.toLocaleString() });
  }
  if (donYears.size > 1) {
    out += columnChart(seriesFor(donYears), {
      heading: `Donations per financial year, plotted at end year (${industries})`,
      fmt: fmtMoney,
      note: (paired
        ? "Shown together for comparison. OPAX does not claim one series causes the other. "
        : "") + AEC_NOTE,
    });
  }
  return out;
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
  htmlOut += moneyWordsCharts(stats);
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
    body.className = "answer record-rule";
    renderAnswer(body, report.brief.answer);
    brief.append(kicker("The brief"), body);
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
    figures.append(kicker("Key figures — spoken on the record"), grid);
  }

  const positions = $("report-positions");
  positions.replaceChildren();
  if (report.positions?.length) {
    const list = document.createElement("ul");
    list.className = "position-list";
    for (const p of report.positions) {
      const li = document.createElement("li");
      li.className = "record-rule";
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
      cite.append(who ? `${who} — ` : "", docLink(p.slug, "read the speech"));
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
    moments.append(kicker("Start reading — key speeches"), ol);
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
  renderReportBrief(report);
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
        renderAnswer(body, s.answer || "");
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
