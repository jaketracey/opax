/* Shared keyboard-accessible suggestions and header search disclosure. */
(() => {
// Keep the controller on the element so a second script evaluation reuses it.
const searchHref = q => '/ask?' + new URLSearchParams({ view: 'search', q });
const typeLabels = { person: 'Parliamentarian', party: 'Party', donor: 'Receipt source', receipt: 'Political receipt', contract: 'Contract', grant: 'Grant', supplier: 'Supplier', agency: 'Agency', bill: 'Bill', bill_text: 'Bill text', interest: 'Declared interest', expense: 'Expenses', access: 'Access record', campaigner: 'Campaigner', pay: 'Pay', speech: 'Speech', division: 'Division', press_release: 'Media release', committee: 'Committee', written_answer: 'Written answer', report: 'Report', 'audit report': 'Audit report', electorate: 'Electorate', topic: 'Topic', instrument: 'Legislative instrument', sitting: 'Sitting week', estimates: 'Estimates', video: 'Video', register: 'Register record', page: 'Page' };
const initialSuggestions = q => [{ label: `Search the record for “${q}”`, type: 'Search', href: searchHref(q) }];
async function siteSuggestions(q, signal) {
  const out = initialSuggestions(q);
  try {
    const response = await fetch('/api/suggest?' + new URLSearchParams({ q }), { signal });
    if (!response.ok) return out;
    const data = await response.json();
    const seen = new Set(out.map(row => row.href));
    for (const row of data.results || []) {
      const href = row.href || (row.slug ? '/doc/' + encodeURIComponent(row.slug) : '');
      if (!href || seen.has(href) || !(href.startsWith('/') && !href.startsWith('//') || /^https?:\/\//i.test(href))) continue;
      seen.add(href);
      out.push({ label: row.title || row.speaker || 'Record', type: typeLabels[row.kind] || row.kind || 'Record', href });
      if (out.length === 10) break;
    }
  } catch { /* The full-search link remains usable during a network failure. */ }
  return out;
}
const disclosureKey = Symbol.for('opax.quick-search.disclosure');
function attachQuickSearch(input, panel, { idPrefix, beforeGo, source, enterFallback = "search", clearOnGo = true, navigate, searchHref } = {}) {
  if (!input || !panel) return;
  let items = [];
  let active = -1;
  let seq = 0;
  let debounce = null;
  let pending = null;
  const prefix = idPrefix || "ms";
  const close = () => {
    seq++;
    clearTimeout(debounce);
    pending?.abort();
    panel.hidden = true;
    input.setAttribute("aria-expanded", "false");
    active = -1;
  };
  const go = (href) => {
    close();
    if (clearOnGo) input.value = "";
    input.blur();
    beforeGo?.();
    navigate(href);
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
    pending?.abort();
    pending = new AbortController();
    if (source === siteSuggestions) { items = initialSuggestions(q); active = -1; render(); }
    let out;
    try { out = await source(q, pending.signal); } catch { out = []; }
    if (my !== seq) return;
    items = (out || []).slice(0, 10);
    active = -1;
    render();
  };
  input.addEventListener("input", () => {
    clearTimeout(debounce);
    seq++;
    pending?.abort();
    items = []; active = -1; render();
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
      else if (enterFallback === "search" && input.value.trim()) go(searchHref(input.value.trim()));
      else close();
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

function disclosure(toggle, panel, input) {
  if (!toggle || !panel || !input) return;
  if (toggle[disclosureKey]) return toggle[disclosureKey];
  const close = (restoreFocus = false) => {
    panel.hidden = true;
    toggle.setAttribute('aria-expanded', 'false');
    if (restoreFocus) toggle.focus();
  };
  toggle.addEventListener('click', () => {
    if (!panel.hidden) return close(true);
    panel.hidden = false;
    toggle.setAttribute('aria-expanded', 'true');
    input.focus();
  });
  document.addEventListener('pointerdown', event => {
    if (!panel.contains(event.target) && !toggle.contains(event.target)) close();
  });
  document.addEventListener('keydown', event => {
    if (event.key === 'Escape' && !panel.hidden) { event.preventDefault(); close(true); }
  }, true); // Close even when the suggestion list consumes Escape at the input.
  document.addEventListener('focusin', event => {
    if (!panel.contains(event.target) && !toggle.contains(event.target)) close();
  });
  return toggle[disclosureKey] = { close };
}
const api = globalThis.OpaxQuickSearch = { attach: attachQuickSearch, disclosure, suggestions: siteSuggestions };
if (typeof document !== 'undefined') {
  // Server-rendered research pages retain this script but omit app.js. The
  // shared script owns the disclosure; page scripts only use its controller.
  const initHeader = () => {
    api.header = disclosure(document.getElementById('header-search-open'), document.getElementById('header-search-panel'), document.getElementById('mast-q'));
  };
  initHeader();
  if (!api.header && document.readyState === 'loading') document.addEventListener('DOMContentLoaded', initHeader, { once: true });
}
})();
