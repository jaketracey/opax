/* OPAX portal — vanilla JS, no build step. */

const $ = (id) => document.getElementById(id);

// --- tabs -------------------------------------------------------------------

function showPanel(name) {
  for (const t of document.querySelectorAll(".tab")) {
    const active = t.dataset.panel === name;
    t.classList.toggle("active", active);
    t.setAttribute("aria-selected", String(active));
  }
  for (const p of ["ask", "search", "reports", "about"]) {
    $(`panel-${p}`).hidden = p !== name;
  }
}

for (const tab of document.querySelectorAll(".tab")) {
  tab.addEventListener("click", () => {
    location.hash = tab.dataset.panel === "ask" ? "" : `#/${tab.dataset.panel}`;
    showPanel(tab.dataset.panel);
    if (tab.dataset.panel === "reports") loadReportsList();
  });
}

// --- helpers ----------------------------------------------------------------

function setStatus(el, message, isError = false) {
  el.hidden = !message;
  el.textContent = message || "";
  el.classList.toggle("error", isError);
}

function esc(s) {
  const d = document.createElement("span");
  d.textContent = s ?? "";
  return d.innerHTML;
}

function metaLine(item) {
  return [item.speaker, item.party, item.state, item.date]
    .filter(Boolean)
    .join(" · ");
}

async function api(path, options) {
  const res = await fetch(path, options);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
  return data;
}

// --- document viewer --------------------------------------------------------

async function openDoc(slug) {
  const dialog = $("doc-dialog");
  $("doc-title").textContent = "Loading…";
  $("doc-meta").textContent = "";
  $("doc-text").textContent = "";
  dialog.showModal();
  try {
    const doc = await api(`/api/resource/${encodeURIComponent(slug)}`);
    $("doc-title").textContent = doc.title;
    $("doc-meta").textContent = [doc.speaker, doc.metadata?.date, doc.url]
      .filter(Boolean)
      .join(" · ");
    $("doc-text").textContent = doc.text || "(no text)";
  } catch (err) {
    $("doc-title").textContent = "Could not load document";
    $("doc-meta").textContent = String(err.message || err);
  }
}
$("doc-close").addEventListener("click", () => $("doc-dialog").close());
$("doc-dialog").addEventListener("click", (e) => {
  if (e.target === $("doc-dialog")) $("doc-dialog").close();
});

function sourceButton(s) {
  const li = document.createElement("li");
  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = "link";
  btn.textContent = s.title || s.slug;
  btn.addEventListener("click", () => openDoc(s.slug));
  li.appendChild(btn);
  const meta = metaLine(s);
  if (meta) {
    const span = document.createElement("span");
    span.className = "source-meta";
    span.textContent = ` — ${meta}`;
    li.appendChild(span);
  }
  return li;
}

// --- ask --------------------------------------------------------------------

$("ask-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const question = $("ask-input").value.trim();
  if (!question) return;
  const button = e.target.querySelector("button");
  button.disabled = true;
  $("ask-answer").hidden = true;
  $("ask-sources").hidden = true;
  setStatus($("ask-status"), "Consulting the corpus… this can take up to a minute.");
  try {
    const data = await api("/api/ask", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ question }),
    });
    setStatus($("ask-status"), "");
    $("ask-answer").hidden = false;
    $("ask-answer").textContent = data.answer || "(no answer)";
    const list = $("ask-sources-list");
    list.replaceChildren(...(data.sources || []).map(sourceButton));
    $("ask-sources").hidden = !data.sources?.length;
  } catch (err) {
    setStatus($("ask-status"), String(err.message || err), true);
  } finally {
    button.disabled = false;
  }
});

// --- search -----------------------------------------------------------------

$("search-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const q = $("search-input").value.trim();
  if (!q) return;
  const button = e.target.querySelector("button");
  button.disabled = true;
  setStatus($("search-status"), "Searching…");
  $("search-results").replaceChildren();
  try {
    const params = new URLSearchParams({
      q,
      kind: $("search-kind").value,
      mode: $("search-mode").value,
    });
    const data = await api(`/api/search?${params}`);
    setStatus(
      $("search-status"),
      data.count ? `${data.count} results` : "No results.",
    );
    $("search-results").replaceChildren(
      ...data.results.map((r) => {
        const li = document.createElement("li");
        li.innerHTML = `
          <div class="result-top">
            <button type="button" class="link">${esc(r.title)}</button>
            <span class="scorebar" title="relevance ${Math.round(r.score * 100)}%">
              <i style="width:${Math.round(r.score * 100)}%"></i>
            </span>
          </div>
          <div class="result-meta">${esc(metaLine(r))}</div>
          <p class="snippet">${esc(r.snippet)}</p>`;
        li.querySelector("button").addEventListener("click", () => openDoc(r.slug));
        return li;
      }),
    );
  } catch (err) {
    setStatus($("search-status"), String(err.message || err), true);
  } finally {
    button.disabled = false;
  }
});

// --- reports ----------------------------------------------------------------

let reportsIndex = null;

$("report-back").addEventListener("click", () => {
  location.hash = "#/reports";
  loadReportsList();
});

async function loadReportsList() {
  const list = $("reports-list");
  $("report-view").hidden = true;
  list.hidden = false;
  if (!reportsIndex) {
    try {
      reportsIndex = (await api("/reports/index.json")).reports || [];
    } catch {
      list.innerHTML = `<p class="status">No reports published yet — they are generated
        from the corpus and will appear here.</p>`;
      return;
    }
  }
  list.replaceChildren(
    ...reportsIndex.map((r) => {
      const card = document.createElement("button");
      card.className = "report-card";
      card.innerHTML = `<h3>${esc(r.title)}</h3><p>${esc(r.blurb)}</p>
        <span class="report-meta">Updated ${esc((r.updated || "").slice(0, 10))}</span>`;
      card.addEventListener("click", () => openReport(r.slug));
      return card;
    }),
  );
}

// --- report stats & charts --------------------------------------------------
// Mark color #b5832c validated (dataviz six-checks) against the dark surface.

const MARK = "#b5832c";

const fmtIndustries = (list) => list.map((i) => i.replace(/_/g, " ")).join(", ");

function fmtMoney(n) {
  if (n >= 1e9) return `$${(n / 1e9).toFixed(2)}B`;
  if (n >= 1e6) return `$${(n / 1e6).toFixed(1)}M`;
  if (n >= 1e3) return `$${Math.round(n / 1e3)}K`;
  return `$${n}`;
}

function tile(value, label) {
  return `<div class="tile"><b>${esc(value)}</b><span>${esc(label)}</span></div>`;
}

// Column chart: thin top-rounded bars anchored to the baseline, 2px gaps,
// per-mark hover tooltip, direct label on the peak only.
function columnChart(pairs, { fmt = String, heading }) {
  const W = 640, H = 150, pad = 4, base = H - 18;
  const max = Math.max(...pairs.map(([, v]) => v), 1);
  const bw = Math.max((W - pad * 2) / pairs.length - 2, 2);
  const peakIdx = pairs.findIndex(([, v]) => v === max);
  let bars = "";
  pairs.forEach(([k, v], i) => {
    const h = Math.max((v / max) * (base - 24), 1);
    const x = pad + i * ((W - pad * 2) / pairs.length);
    const y = base - h;
    const r = Math.min(2, bw / 2, h);
    bars += `<path d="M${x},${base} V${y + r} Q${x},${y} ${x + r},${y} H${x + bw - r} Q${x + bw},${y} ${x + bw},${y + r} V${base} Z"
      fill="${MARK}" data-k="${esc(String(k))}" data-v="${esc(fmt(v))}"><title>${esc(String(k))}: ${esc(fmt(v))}</title></path>`;
    if (i === peakIdx) {
      bars += `<text x="${x + bw / 2}" y="${y - 5}" class="chart-peak" text-anchor="middle">${esc(fmt(v))}</text>`;
    }
  });
  const first = pairs[0]?.[0] ?? "", last = pairs[pairs.length - 1]?.[0] ?? "";
  return `<figure class="chart">
    <figcaption>${esc(heading)}</figcaption>
    <svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(heading)}">
      <line x1="${pad}" y1="${base}" x2="${W - pad}" y2="${base}" class="chart-axis"/>
      ${bars}
      <text x="${pad}" y="${H - 4}" class="chart-tick">${esc(String(first))}</text>
      <text x="${W - pad}" y="${H - 4}" class="chart-tick" text-anchor="end">${esc(String(last))}</text>
    </svg>
  </figure>`;
}

// Horizontal labeled bar list (name + value in text tokens, bar carries magnitude).
function barList(rows, { fmt = String, heading }) {
  const max = Math.max(...rows.map(([, v]) => v), 1);
  const items = rows.map(([name, v]) => `
    <div class="barrow" title="${esc(name)}: ${esc(fmt(v))}">
      <span class="barrow-name">${esc(name)}</span>
      <span class="barrow-track"><i style="width:${Math.max((v / max) * 100, 1)}%"></i></span>
      <span class="barrow-value">${esc(fmt(v))}</span>
    </div>`).join("");
  return `<figure class="chart"><figcaption>${esc(heading)}</figcaption>${items}</figure>`;
}

function renderStats(container, stats) {
  if (!stats) { container.innerHTML = ""; return; }
  const don = stats.donations;
  let htmlOut = `<div class="tiles">
    ${tile(stats.speech_count.toLocaleString(), "speeches on the record")}
    ${tile(stats.unique_speakers.toLocaleString(), "parliamentarians spoke")}
    ${don ? tile(fmtMoney(don.total), `donations — ${fmtIndustries(don.industries)}`) : ""}
  </div>`;
  if (stats.timeline?.length > 1) {
    htmlOut += columnChart(stats.timeline, { heading: "Speeches per year", fmt: (v) => v.toLocaleString() });
  }
  if (don?.by_year?.length > 1) {
    htmlOut += columnChart(don.by_year, { heading: `Donations per financial year (${fmtIndustries(don.industries)})`, fmt: fmtMoney });
  }
  if (don?.top_donors?.length) {
    htmlOut += barList(don.top_donors, { heading: "Largest donors", fmt: fmtMoney });
  }
  if (stats.top_speakers?.length) {
    htmlOut += barList(stats.top_speakers, { heading: "Most speeches on this topic", fmt: (v) => v.toLocaleString() });
  }
  container.innerHTML = htmlOut;
}

async function openReport(slug) {
  let report;
  try {
    report = await api(`/reports/${encodeURIComponent(slug)}.json`);
  } catch {
    return;
  }
  location.hash = `#/reports/${slug}`;
  $("reports-list").hidden = true;
  const view = $("report-view");
  view.hidden = false;
  $("report-title").textContent = report.title;
  $("report-blurb").textContent = report.blurb;
  $("report-meta").textContent =
    `Generated ${report.generated_at?.slice(0, 10)}. Every claim in the analysis is cited.`;
  renderStats($("report-stats"), report.stats);
  if (!report.sections?.length) {
    $("report-sections").innerHTML =
      `<p class="status">The cited analysis for this investigation is generated from the full
      speech corpus, which is currently indexing — it will appear here automatically.</p>`;
    return;
  }
  $("report-sections").replaceChildren(
    ...report.sections.map((s) => {
      const sec = document.createElement("section");
      sec.className = "report-section";
      const h = document.createElement("h3");
      h.textContent = s.question;
      const body = document.createElement("div");
      body.className = "answer";
      body.textContent = s.answer;
      sec.append(h, body);
      if (s.sources?.length) {
        const label = document.createElement("h4");
        label.textContent = "Sources";
        const ol = document.createElement("ol");
        ol.className = "report-sources";
        ol.replaceChildren(...s.sources.map(sourceButton));
        sec.append(label, ol);
      }
      return sec;
    }),
  );
}

// Deep links: #/reports, #/reports/<slug>, #/search
(function route() {
  const m = location.hash.match(/^#\/(search|reports|about)(?:\/([a-z-]+))?/);
  if (!m) return;
  showPanel(m[1]);
  if (m[1] === "reports") {
    loadReportsList().then(() => (m[2] ? openReport(m[2]) : null));
  }
})();

// --- footer stats -----------------------------------------------------------

api("/api/stats")
  .then((s) => {
    $("stats").textContent =
      `${(s.resources ?? 0).toLocaleString()} documents · ` +
      `${(s.paragraphs ?? 0).toLocaleString()} passages indexed`;
  })
  .catch(() => {
    $("stats").textContent = "corpus loading…";
  });
