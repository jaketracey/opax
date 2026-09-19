// Restored from the previous homepage's Money & words module.
// Keep its charts, rankings, questions and source notes while readers choose the topic.
const esc = (value) => String(value ?? '').replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
const subjectHash = (kind, name) => '/subject/' + kind + '/' + encodeURIComponent(name);
const askHash = (question) => '/ask?' + new URLSearchParams({q: question});
const searchHash = (topic, filters) => '/ask?' + new URLSearchParams({view: 'search', q: topic, ...filters});
function fmtMoney(n) {
  if (n >= 1e9) return `$${(n / 1e9).toFixed(2)}B`;
  if (n >= 1e6) return `$${(n / 1e6).toFixed(1)}M`;
  if (n >= 1e3) return `$${Math.round(n / 1e3)}K`;
  return `$${n}`;
}


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
      // A peak near either edge keeps its figure inside the drawing: the label
      // hangs from the bar's outer edge instead of straddling the chart's rim.
      const cx = x + bw / 2;
      const anchor = cx < W * 0.14 ? "start" : cx > W * 0.86 ? "end" : "middle";
      const lx = anchor === "start" ? x : anchor === "end" ? x + bw : cx;
      bars += `<text x="${lx.toFixed(1)}" y="${y - 6}" class="chart-peak" text-anchor="${anchor}">${esc(fmt(v))}</text>`;
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
function barList(rows, {
  fmt = String, heading, linkTo, term = null, detail = null,
  className = "", maxValue = null, marker = null,
}) {
  const max = maxValue ?? Math.max(...rows.map(([, v]) => v), 1);
  const items = rows.map((row) => {
    const [name, v] = row;
    const key = linkTo ? null : term?.(name);
    const label = `${esc(name)}`;
    const sub = detail?.(name, v, row);
    const marked = marker?.(name, v, row);
    const markerValue = Number(typeof marked === "object" ? marked?.value : marked);
    const markerLabel = typeof marked === "object" ? marked?.label : "";
    const markerHTML = Number.isFinite(markerValue)
      ? `<b class="barrow-marker" style="left:${Math.max(0, Math.min(100, (markerValue / max) * 100)).toFixed(2)}%"${markerLabel ? ` title="${esc(markerLabel)}"` : ""}></b>`
      : "";
    return `
    <div class="barrow">
      ${linkTo
        ? `<a class="barrow-name" title="${esc(name)}" href="${esc(linkTo(name, v, row))}">${label}</a>`
        : key
          ? `<button type="button" class="barrow-name barrow-term" data-term="${esc(key)}">${label}</button>`
          : `<span class="barrow-name" title="${esc(name)}">${label}</span>`}
      <span class="barrow-track" aria-hidden="true"><i style="width:${Math.max((v / max) * 100, 1)}%"></i>${markerHTML}</span>
      <span class="barrow-value">${esc(fmt(v))}${sub !== null && sub !== undefined ? `<small>${esc(sub)}</small>` : ""}${markerLabel ? `<span class="visually-hidden">; ${esc(markerLabel)}</span>` : ""}</span>
    </div>`;
  }).join("");
  return `<figure class="chart${className ? ` ${esc(className)}` : ""}"><figcaption>${esc(heading)}</figcaption>${items}</figure>`;
}

const fmtIndustries = (list) => list.map((i) => i.replace(/_/g, " ")).join(", ");

const AEC_NOTE =
  "AEC disclosure data: donations under the disclosure threshold are not reported " +
  "and cannot appear here, so totals are a floor, not a ceiling.";

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


const SPOTLIGHT_TOPICS = {
  gambling: {label: 'Gambling', topic: 'gambling', phrase: 'gambling'},
  housing: {label: 'Housing', topic: 'housing', phrase: 'housing'},
  climate: {label: 'Climate', topic: 'climate-environment', phrase: 'climate and energy'},
};

export function renderSpotlight(report, slug) {
  const config = SPOTLIGHT_TOPICS[slug];
  if (!config || !report.stats) throw new Error('Report statistics unavailable');
  const stats = report.stats;
  const don = stats.donations;
  const industries = (don?.industries || []).map(value => value.replace(/_/g, ' '));
  const industryPhrase = new Intl.ListFormat('en-AU', {style: 'long', type: 'conjunction'}).format(industries);
  const speechYears = toYearSeries(stats.timeline ?? []);
  const firstYear = speechYears.size ? Math.min(...speechYears.keys()) : null;
  const [peakYear] = peakOf(speechYears.entries()) ?? [];
  const lede = '<b>' + esc((stats.speech_count ?? 0).toLocaleString()) + '</b> speeches' +
    (stats.unique_speakers ? ' from <b>' + esc(Number(stats.unique_speakers).toLocaleString()) + '</b> speakers' : '') +
    (firstYear ? ' since ' + esc(String(firstYear)) : '') +
    (don?.total ? ', and <b>' + esc(fmtMoney(don.total)) + '</b> in disclosed donations from ' + esc(industryPhrase) + ' interests to political parties over the same years.' : '.');
  const questions = [];
  if (industries.length) questions.push(industries[0] === config.phrase
    ? 'Who takes ' + industries[0] + ' money and what do they say about ' + config.phrase + ' reform?'
    : 'Who takes ' + industries[0] + ' money and what do they say about ' + config.phrase + '?');
  else if (firstYear) questions.push('How has the debate over ' + config.phrase + ' changed since ' + firstYear + '?');
  if (peakYear) questions.push('Why did parliament talk so much about ' + config.phrase + ' in ' + peakYear + '?');
  const loudest = stats.top_speakers?.[0]?.[0];
  if (loudest) questions.push('What did ' + loudest + ' say about ' + config.phrase + '?');
  return '<p class="mw-lede">' + lede + '</p>' +
    (!don ? '<p class="fineprint">This report has no matching donor industry in the AEC disclosures.</p>' : '') +
    '<div class="hp-spotlight-charts">' + moneyWordsCharts(stats, {topic: report.title}) + '</div>' +
    '<div class="mw-cols">' +
    (stats.top_speakers?.length ? barList(stats.top_speakers.slice(0, 3), {
      heading: 'Most speeches on this topic', fmt: value => Number(value).toLocaleString(),
      linkTo: name => subjectHash('person', name)
    }) : '') +
    (don?.top_donors?.length ? barList(don.top_donors.slice(0, 3), {
      heading: 'Largest ' + industryPhrase + ' donors', fmt: fmtMoney,
      linkTo: name => subjectHash('donor', name)
    }) : '') + '</div>' +
    '<p id="hp-spotlight-questions-label" class="hp-spotlight-question-label">Ask about ' + esc(config.label.toLowerCase()) + '</p>' +
    '<nav class="hp-spotlight-questions" aria-labelledby="hp-spotlight-questions-label">' +
    questions.map(question => '<a href="' + esc(askHash(question)) + '">' + esc(question) + '</a>').join('') + '</nav>';
}

export async function mountSpotlight() {
  const holder = document.getElementById('hp-gambling-content');
  const select = document.getElementById('hp-spotlight-topic');
  const status = document.getElementById('hp-spotlight-status');
  const more = document.getElementById('hp-spotlight-more');
  if (!holder || !select) return;
  const cache = new Map();
  let request = 0;
  async function update() {
    const slug = select.value;
    const config = SPOTLIGHT_TOPICS[slug];
    if (!config) return;
    const current = ++request;
    more.textContent = 'Learn more about ' + config.label.toLowerCase() + ' →';
    more.href = subjectHash('topic', config.topic);
    holder.setAttribute('aria-busy', 'true');
    holder.innerHTML = '<p class="status">Loading ' + esc(config.label) + '…</p>';
    status.textContent = 'Loading ' + config.label;
    try {
      let report = cache.get(slug);
      if (!report) {
        const response = await fetch('/reports/' + slug + '.json');
        if (!response.ok) throw new Error('Report unavailable');
        report = await response.json();
        cache.set(slug, report);
      }
      if (current !== request) return;
      holder.innerHTML = renderSpotlight(report, slug);
      status.textContent = config.label + ' spotlight loaded';
    } catch {
      if (current !== request) return;
      holder.innerHTML = '<p>The ' + esc(config.label) + ' figures could not load. <a href="/reports/' + slug + '">Open the report</a>.</p>';
      status.textContent = config.label + ' spotlight could not load';
    } finally {
      if (current === request) holder.setAttribute('aria-busy', 'false');
    }
  }
  select.addEventListener('change', update);
  await update();
}
