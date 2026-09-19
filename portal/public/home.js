// The homepage and research workspace have separate document lifecycles.
const legacyRoute = location.href.split('#')[1] || '';
if (legacyRoute.startsWith('/')) {
  const target = new URL(legacyRoute, location.origin);
  if (target.origin === location.origin) location.replace(target.pathname + target.search + target.hash);
}

// Homepage research entry adapter; question definitions match the existing app.js builder.
const ASK_PARTIES = [
  "Labor",
  "Liberal",
  "Nationals",
  "Greens",
  "One Nation",
  "Independent",
];
const ASK_SHAPES = {
  person: {
    label: "a person",
    variants: [
      ["What did ", { slot: "person" }, " say about ", { slot: "topic" }, "?"],
      [
        "What would ",
        { slot: "person" },
        " say about ",
        { slot: "topic" },
        "?",
      ],
    ],
  },
  party: {
    label: "a party",
    variants: [
      [
        "What have ",
        { slot: "party" },
        " MPs said about ",
        { slot: "topic" },
        "?",
      ],
      ["Who funds ", { slot: "party" }, "?"],
    ],
  },
  money: {
    label: "money",
    variants: [
      ["Who takes the most money from ", { slot: "industry" }, " donors?"],
      ["Who are the biggest donors to ", { slot: "party" }, "?"],
      [
        "Who gets more money from ",
        { slot: "industry" },
        " donors, Labor or Liberal?",
      ],
    ],
  },
  pay: {
    label: "pay",
    variants: [
      ["How much is ", { slot: "person" }, " paid?"],
      ["Who is the highest paid ", { slot: "party" }, " politician?"],
      ["Who is the highest paid politician?"],
    ],
  },
  bill: {
    label: "a bill",
    variants: [
      ["What does the ", { slot: "bill", size: "wide" }, " change?"],
      ["Who spoke for and against the ", { slot: "bill", size: "wide" }, "?"],
    ],
  },
};
const INDUSTRY_ALIASES = {
  gambling: [
    "gambling",
    "pokies",
    "poker machine",
    "casino",
    "wagering",
    "betting",
    "bookmaker",
  ],
  finance: ["bank", "finance", "financial", "insurance", "superannuation"],
  mining: ["mining", "miner", "resources sector"],
  fossil_fuels: [
    "coal",
    " gas",
    "oil ",
    "fossil",
    "petroleum",
    "energy compan",
  ],
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

const $ = (id) => document.getElementById(id);

// The homepage uses the existing report pictograms and megamenu components.
const REPORT_GLYPHS = {
  'grants-allocation': '<path d="M3 10l9-7 9 7M5 8.5V21h14V8.5M3 21h18M10 21v-6h4v6"/><circle cx="12" cy="9" r="1.5"/>',
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


// Use the application's navigation taxonomy rather than inventing another menu.
await import('/navigation.js');
const reportMenuItems = await fetch('/reports/index.json').then(r => r.ok ? r.json() : null).then(d => d?.reports).catch(() => null);
for (const nav of document.querySelectorAll('.hp-nav, .hp-mobile-nav > nav')) {
  nav.replaceChildren();
  for (const section of globalThis.OpaxNavigation.sections) {
    if (!section.children) {
      const link = document.createElement('a');
      link.href = section.href;
      link.textContent = section.label;
      nav.append(link);
      continue;
    }
    const group = document.createElement('details');
    const summary = document.createElement('summary');
    summary.textContent = section.label;
    summary.insertAdjacentHTML('beforeend', '<svg class="nav-caret" viewBox="0 0 10 6" aria-hidden="true"><path d="M1 1l4 4 4-4" fill="none" stroke="currentColor" stroke-width="1.8"/></svg>');
    group.append(summary);
    const panel = document.createElement('div');
    panel.className = 'hp-menu-panel megamenu megamenu-wide';
    const links = document.createElement('div');
    links.className = 'mm-grid';
    const items = section.id === 'reports' && reportMenuItems
      ? reportMenuItems.map(r => ['/reports/' + r.slug, r.title, r.blurb])
      : section.children.filter(([href]) => section.id !== 'reports' || href !== '/reports');
    for (const [href, label, description] of items) {
      const link = document.createElement('a');
      link.href = href;
      link.className = 'mm-link';
      if (section.id === 'reports') link.innerHTML = reportGlyph(href.split('/').pop(), 'mm-glyph');
      const title = document.createElement('span');
      title.className = 'mm-title';
      title.textContent = label;
      const blurb = document.createElement('span');
      blurb.className = 'mm-blurb';
      blurb.textContent = description;
      link.append(title, blurb);
      links.append(link);
    }
    panel.append(links);
    if (section.id === 'reports') {
      const all = document.createElement('a');
      all.className = 'mm-all';
      all.href = '/reports';
      all.textContent = 'All reports';
      panel.append(all);
    }
    group.append(panel);
    group.addEventListener('toggle', () => {
      if (group.open) for (const peer of nav.querySelectorAll('details')) {
        if (peer !== group) peer.open = false;
      }
    });
    nav.append(group);
  }
}
document.addEventListener('keydown', (event) => {
  if (event.key !== 'Escape') return;
  const open = document.querySelector('.hp-header details[open]');
  if (open) { open.open = false; open.querySelector('summary').focus(); }
});
document.addEventListener('click', (event) => {
  for (const open of document.querySelectorAll('.hp-header details[open]')) {
    if (!open.contains(event.target)) open.open = false;
  }
});

// Both research panels stay mounted, preserving their drafts when modes change.
for (const button of document.querySelectorAll("[data-mode]")) {
  button.addEventListener("click", () => {
    const ask = button.dataset.mode === "ask";
    $("hp-ask").hidden = !ask;
    $("hp-search-panel").hidden = ask;
    for (const peer of document.querySelectorAll("[data-mode]")) {
      peer.setAttribute("aria-pressed", String(peer === button));
    }
  });
}

const builder = { shape: "person", variant: 0, values: {} };
try {
  const saved = localStorage.getItem("opax-ask-shape");
  if (ASK_SHAPES[saved]) builder.shape = saved;
} catch {
  /* Storage is optional. */
}
const loadedLists = new Set();
async function loadList(kind) {
  if (loadedLists.has(kind)) return;
  loadedLists.add(kind);
  try {
    const response = await fetch(
      kind === "person" ? "/speakers.json" : "/bills/index.json",
    );
    if (!response.ok) throw new Error("Suggestions unavailable");
    const data = await response.json();
    const names =
      kind === "person"
        ? (Array.isArray(data) ? data : data.names || data.speakers || []).map(
            (row) => (Array.isArray(row) ? row[0] : row),
          )
        : data.bills
            .filter(
              (bill) =>
                bill.jurisdiction === "federal" &&
                Number(bill.parliament) >= 47,
            )
            .map((bill) => bill.short_title || bill.title);
    const list = $(kind === "person" ? "hp-people-list" : "hp-bills-list");
    for (const name of [...new Set(names)].sort((a, b) => a.localeCompare(b))) {
      list.append(
        Object.assign(document.createElement("option"), { value: name }),
      );
    }
  } catch {
    loadedLists.delete(kind); /* Typed questions work without suggestions. */
  }
}
function chooseShape(shape) {
  builder.shape = shape;
  builder.variant = 0;
  try {
    localStorage.setItem("opax-ask-shape", shape);
  } catch {
    /* Optional preference. */
  }
  renderBuilder();
}
for (const [key, shape] of Object.entries(ASK_SHAPES)) {
  const button = Object.assign(document.createElement("button"), {
    type: "button",
    className: "ui-button",
    textContent: shape.label,
  });
  button.dataset.shape = key;
  button.addEventListener("click", () => chooseShape(key));
  $("hp-shapes").append(button);
  $("hp-shape").append(
    Object.assign(document.createElement("option"), {
      value: key,
      textContent: shape.label,
    }),
  );
}
$("hp-shape").addEventListener("change", (event) =>
  chooseShape(event.target.value),
);
function slotElement(part) {
  const slot = part.slot;
  const select = slot === "party" || slot === "industry";
  const field = document.createElement(select ? "select" : "input");
  field.className = "ask-slot";
  field.dataset.slot = slot;
  if (part.size) field.dataset.size = part.size;
  field.setAttribute(
    "aria-label",
    {
      person: "Parliamentarian",
      topic: "Topic",
      bill: "Bill",
      party: "Party",
      industry: "Donor industry",
    }[slot],
  );
  if (select) {
    const values =
      slot === "party"
        ? ASK_PARTIES
        : Object.keys(INDUSTRY_ALIASES).map((key) => key.replaceAll("_", " "));
    for (const value of values)
      field.append(
        Object.assign(document.createElement("option"), {
          value,
          textContent: value,
        }),
      );
  } else {
    field.type = "text";
    field.required = true;
    field.autocomplete = "off";
    field.placeholder = {
      person: "a politician",
      topic: "a topic",
      bill: "a bill",
    }[slot];
    field.setAttribute(
      "list",
      {
        person: "hp-people-list",
        topic: "hp-topics-list",
        bill: "hp-bills-list",
      }[slot],
    );
    if (slot !== "topic") field.addEventListener("focus", () => loadList(slot));
  }
  if (builder.values[slot]) field.value = builder.values[slot];
  field.addEventListener("input", () => {
    builder.values[slot] = field.value;
  });
  return field;
}
function renderBuilder() {
  for (const button of $("hp-shapes").children)
    button.setAttribute(
      "aria-pressed",
      String(button.dataset.shape === builder.shape),
    );
  $("hp-shape").value = builder.shape;
  const shape = ASK_SHAPES[builder.shape];
  const parts = shape.variants[builder.variant];
  const sentence = $("hp-sentence");
  sentence.replaceChildren();
  let start = 0;
  if (shape.variants.length > 1) {
    const pick = Object.assign(document.createElement("select"), {
      className: "ask-slot ask-slot-variant",
    });
    pick.setAttribute("aria-label", "Question");
    shape.variants.forEach((variant, index) =>
      pick.append(
        Object.assign(document.createElement("option"), {
          value: String(index),
          textContent: variant[0].trim(),
        }),
      ),
    );
    pick.value = String(builder.variant);
    pick.addEventListener("change", () => {
      builder.variant = Number(pick.value);
      renderBuilder();
      $("hp-sentence").querySelector(".ask-slot-variant").focus();
    });
    sentence.append(pick, " ");
    start = 1;
  }
  for (const part of parts.slice(start)) {
    if (typeof part !== "string") sentence.append(slotElement(part));
    else if (/^[\s?.!,]+$/.test(part))
      sentence.append(
        Object.assign(document.createElement("span"), {
          className: "ask-tail",
          textContent: part,
        }),
      );
    else sentence.append(part);
  }
}
$("hp-builder-form").addEventListener("submit", (event) => {
  event.preventDefault();
  let question = "";
  for (const node of $("hp-sentence").childNodes) {
    if (node.nodeType === 3 || !("value" in node)) question += node.textContent;
    else if (node.classList.contains("ask-slot-variant"))
      question += node.options[node.selectedIndex].textContent;
    else {
      const value = node.value.trim();
      if (!value) {
        node.focus();
        return;
      }
      question += value;
    }
  }
  location.href =
    "/ask?" + new URLSearchParams({ q: question.replace(/\s+/g, " ").trim() });
});
renderBuilder();

const topicRows = [...document.querySelectorAll("[data-topic]")];
function filterTopics() {
  const query = $("hp-topic-filter").value.trim().toLocaleLowerCase();
  let count = 0;
  for (const row of topicRows) {
    row.hidden = !row.textContent.toLocaleLowerCase().includes(query);
    if (!row.hidden) count++;
  }
  $("hp-topic-status").textContent = query
    ? `${count} of ${topicRows.length} topics`
    : "";
  $("hp-topic-empty").hidden = count > 0;
}
$("hp-topic-filter").addEventListener("input", filterTopics);
$("hp-topic-clear").addEventListener("click", () => {
  $("hp-topic-filter").value = "";
  filterTopics();
  $("hp-topic-filter").focus();
});

// The map owns the displayed filter state. Its callback also catches selections
// made inside the scene, so the external controls and outgoing link cannot drift.
const root = $("hp-money-map");
const mapButtons = [...document.querySelectorAll("[data-industry]")];
let handle;
let visible = false;
let started = false;
let disposed = false;
let industry = "";
let focus = "";
let years;
const pause = () => handle?.setPaused?.(!visible || document.hidden);
function syncMapControls(filters = {}, windowYears) {
  industry = filters.industry || "";
  if (windowYears) years = windowYears;
  for (const button of mapButtons)
    button.setAttribute(
      "aria-pressed",
      String(button.dataset.industry === industry),
    );
  const selected = mapButtons.find(
    (button) => button.dataset.industry === industry,
  );
  $("hp-map-status").textContent = selected
    ? `${industry[0].toUpperCase() + industry.slice(1)} · ${selected.querySelector(".ui-map-filter__count").textContent} donors in this map`
    : "All industries";
  const params = new URLSearchParams();
  if (industry) params.set("industry", industry);
  if (focus) params.set("focus", focus);
  if (years) {
    params.set("from", years.from);
    params.set("to", years.to);
    if (years.cpi) params.set("cpi", "1");
  }
  $("hp-full-map").href = "/money" + (params.size ? `?${params}` : "");
  const records = new URLSearchParams(params);
  records.delete("focus");
  $("hp-map-records").href =
    "/money/receipts" + (records.size ? `?${records}` : "");
}
for (const button of mapButtons) {
  button.addEventListener("click", () => {
    focus = "";
    handle.select(null);
    handle.setFilters({
      industry:
        industry === button.dataset.industry ? "" : button.dataset.industry,
    });
  });
}
$("hp-map-reset").addEventListener("click", () => {
  focus = "";
  handle.select(null);
  handle.clearScene();
  handle.fit();
});
async function mount() {
  if (started) return;
  started = true;
  try {
    const { mountMoneyMap } = await import(
      "/money-map.js?v=home-page-scroll-20260913"
    );
    if (disposed) return;
    root.replaceChildren();
    const mounted = await mountMoneyMap(
      root,
      "/graph/money.json?v=suppliers-1",
      {
        chrome: "mini",
        overview: true,
        pageScroll: true,
        askUrl: (industry) =>
          "/ask?" +
          new URLSearchParams({
            q: `What has parliament said about ${industry}?`,
          }),
        onViewChange: (_view, filters, windowYears) =>
          syncMapControls(filters, windowYears),
        onSelect: (node) => {
          focus = node?.id || "";
          syncMapControls({ industry });
        },
      },
    );
    if (disposed) {
      mounted.destroy();
      return;
    }
    handle = mounted;
    mapButtons.forEach((button) => {
      button.disabled = false;
    });
    $("hp-map-reset").disabled = false;
    pause();
  } catch {
    if (disposed) return;
    const message = document.createElement("p");
    message.textContent = "The embedded map could not load. ";
    message.append(
      Object.assign(document.createElement("a"), {
        href: "/money",
        textContent: "Open the full map",
      }),
    );
    const retry = Object.assign(document.createElement("button"), {
      type: "button",
      className: "ui-button",
      textContent: "Retry map",
    });
    retry.addEventListener("click", () => {
      started = false;
      mount();
    });
    root.replaceChildren(message, retry);
    $("hp-map-status").textContent =
      "Map unavailable. You can still browse funding records.";
  }
}
const observer = new IntersectionObserver(
  (entries) => {
    visible = entries.at(-1).isIntersecting;
    if (visible) mount();
    pause();
  },
  { rootMargin: "150px" },
);
observer.observe(root);
document.addEventListener("visibilitychange", pause);
window.addEventListener("pagehide", (event) => {
  handle?.setPaused?.(true);
  if (event.persisted) return;
  disposed = true;
  observer.disconnect();
  handle?.destroy();
  document.removeEventListener("visibilitychange", pause);
});
window.addEventListener("pageshow", pause);

// Native horizontal scrolling keeps all encyclopedia entries reachable without scripts.
const encyclopediaTrack = $('hp-ency-track');
const encyclopediaCards = () => [...encyclopediaTrack.querySelectorAll('.hp-ency-card')];
function syncEncyclopedia() {
  const cards = encyclopediaCards();
  if (cards.length < 2) {
    $('hp-ency-prev').disabled = $('hp-ency-next').disabled = true;
    $('hp-ency-position').textContent = cards.length ? '1 of 1' : '';
    return;
  }
  const left = encyclopediaTrack.scrollLeft;
  const width = encyclopediaTrack.clientWidth;
  const step = encyclopediaCards()[1].offsetLeft - encyclopediaCards()[0].offsetLeft;
  const first = Math.round(left / step) + 1;
  const visible = Math.max(1, Math.round(width / step));
  $('hp-ency-position').textContent = `${first}${visible > 1 ? '–' + Math.min(encyclopediaCards().length, first + visible - 1) : ''} of ${encyclopediaCards().length}`;
  $('hp-ency-prev').disabled = left <= 2;
  $('hp-ency-next').disabled = left + width >= encyclopediaTrack.scrollWidth - 2;
}
for (const [id, direction] of [['hp-ency-prev', -1], ['hp-ency-next', 1]]) {
  $(id).addEventListener('click', () => encyclopediaTrack.scrollBy({left: direction * (encyclopediaCards()[1].offsetLeft - encyclopediaCards()[0].offsetLeft)}));
}
encyclopediaTrack.addEventListener('scroll', syncEncyclopedia, {passive:true});
new ResizeObserver(syncEncyclopedia).observe(encyclopediaTrack);
syncEncyclopedia();

// The compact header keeps the same cross-collection quick search as the app.
const headerSearch = OpaxQuickSearch.disclosure($('header-search-open'), $('header-search-panel'), $('mast-q'));
const searchHref = q => '/ask?' + new URLSearchParams({view:'search', q});
let headerReferences;
async function headerSuggestions(q) {
  const out = [{label:`Search the record for “${q}”`, type:'Search', href:searchHref(q)}];
  const contains = value => String(value || '').toLowerCase().includes(q.toLowerCase());
  const read = async url => { const response = await fetch(url); if (!response.ok) throw Error('Unavailable'); return response.json(); };
  headerReferences ??= Promise.allSettled([
    read('/speakers.json'), read('/graph/money.json'), read('/reports/index.json'),
    import('/electorates.js').then(async module => ({...await module.loadIndex(), jurisdictions:module.JURISDICTIONS})),
  ]);
  const [speakers, money, reports, electorates] = (await headerReferences).map(result => result.status === 'fulfilled' ? result.value : null);
  for (const e of (electorates?.electorates || []).filter(e => contains(e.name)).slice(0,3)) out.push({label:e.name, type:`${electorates.jurisdictions[e.jurisdiction]} electorate`, href:e.url});
  const names = (Array.isArray(speakers) ? speakers : speakers?.speakers || speakers?.names || []).map(row => Array.isArray(row) ? row[0] : row);
  for (const name of names.filter(contains).slice(0,4)) out.push({label:name, type:'Speaker', href:'/subject/person/' + encodeURIComponent(name)});
  for (const link of [...document.querySelectorAll('.hp-topic-list a')].filter(link => contains(link.textContent)).slice(0,3)) out.push({label:link.textContent, type:'Topic', href:link.getAttribute('href')});
  for (const node of (money?.nodes || []).filter(n => contains(n.label)).slice(0,3)) out.push({label:node.label, type:node.kind === 'party' ? 'Party' : 'Donor', href:'/subject/' + (node.kind === 'party' ? 'party' : 'donor') + '/' + encodeURIComponent(node.label)});
  for (const report of (reports?.reports || []).filter(r => contains(r.title)).slice(0,2)) out.push({label:report.title + ' report', type:'Report', href:'/reports/' + report.slug});
  return out;
}
OpaxQuickSearch.attach($('mast-q'), $('mast-sugg'), {idPrefix:'ms', source:headerSuggestions, navigate:href => location.assign(href), searchHref, beforeGo:() => headerSearch.close()});

// Keep the approved layout while replacing prototype snapshots with source data.
import { hydrateCollections, hydrateRecordCards } from '/home-data.js';
hydrateCollections();
const recordObserver = new IntersectionObserver(entries => {
  if (entries.some(entry => entry.isIntersecting)) {
    recordObserver.disconnect();
    hydrateRecordCards(syncEncyclopedia);
  }
}, {rootMargin:'400px'});
recordObserver.observe(encyclopediaTrack);
