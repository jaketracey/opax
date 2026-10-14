import {mountSuppliersTable} from './suppliers-table.js?v=badfb223ea';
import {mountContractsTable} from './contracts-table.js?v=8cf20d9253';
/* Supplier entries: recorded procurement, source notices and funding cross-links.
   No dependencies but the shared formats; the host router owns mounting and calls destroy on departure. */
import { shortDate, shortMoney } from "./format.js";
import { mountSupplierGrowth, supplierDonations } from "./supplier-growth.js?v=5b53604a51";
import { sourceLineHTML } from "./labels.js?v=fc03aa14cf";
import { partyUrl } from "./canonical-urls.js?v=225d5915ea";
const esc = (value) => String(value ?? "").replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]);
const number = (value) => (Number(value) || 0).toLocaleString("en-AU");
const currency = (value) => (Number(value) || 0).toLocaleString("en-AU", { style: "currency", currency: "AUD", maximumFractionDigits: 0 });
const percent = (value) => value > 0 && value < 0.1 ? "less than 0.1%" : value > 99.9 && value < 100 ? "over 99.9%" : `${value.toLocaleString("en-AU", { maximumFractionDigits: 1 })}%`;
const sourceUrl = (value) => typeof value === "string" && /^https?:\/\//i.test(value) ? value : null;
const profileUrl = (id) => `/subject/supplier/${encodeURIComponent(id)}`;
const identityMethod = (method) => ({ source: "Supplier identity in the source register", source_abn: "ABN in the source register", abn: "Matching ABN", exact_normalized_name: "Matching recorded name", normalized_name: "Matching recorded name", exact_name: "Matching recorded name", published_graph_supplier_id: "Recorded in the money map", verified_abn: "Matching ABN" })[method] || "Matching source records";
const donorUrl = (value) => typeof value === "string" && /^\/subject\/donor\/[^\s]+$/.test(value) ? value : null;
// The source writes 1900-01-01 where it has no date; that is "not recorded", not a day.
const placeholderDate = (value) => !value || !/^\d{4}-\d{2}-\d{2}/.test(value) || Number(value.slice(0, 4)) <= 1900;
const date = (value) => placeholderDate(value) ? "Not recorded" : shortDate(value);
/** An undated $0 row is the register's placeholder, not a contract a reader can follow. */
export function placeholderContract(contract) { return placeholderDate(contract?.start_date) && !(Number(contract?.amount) > 0); }
let agencyIdsPromise = null;
/** Agency pages canonicalise on their id; the supplier export names agencies only, so the directory supplies the ids. */
function agencyIds(signal) {
  agencyIdsPromise ??= json("/agencies.json", signal).then((data) => new Map((data.agencies || []).map((agency) => [agency.name, agency.id]))).catch(() => { agencyIdsPromise = null; return new Map(); });
  return agencyIdsPromise;
}
const agencyUrl = (name, ids) => ids?.has(name) ? `/subject/agency/${encodeURIComponent(ids.get(name))}` : `/subject/agency?q=${encodeURIComponent(name)}`;

/** A load that runs long says so at 12 s and gives up at 90 s, so a status line never spins
 *  for ever (the aggregateApi() pattern). The largest agency export is about 13 MB. */
const SLOW_MS = 12000, GIVE_UP_MS = 90000;
export async function json(url, signal, wait = GIVE_UP_MS) {
  const controller = new AbortController();
  let timedOut = false;
  const timer = setTimeout(() => { timedOut = true; controller.abort(); }, wait);
  const forward = () => controller.abort();
  if (signal?.aborted) forward(); else signal?.addEventListener("abort", forward, { once: true });
  try {
    const response = await fetch(url, { signal: controller.signal, cache:"no-cache" });
    if (!response.ok) throw new Error("The supplier records could not be loaded.");
    return await response.json();
  } catch (error) {
    throw timedOut ? new Error("The records took too long to load.") : error;
  } finally { clearTimeout(timer); signal?.removeEventListener("abort", forward); }
}

/** After SLOW_MS a page still loading swaps its status line for a quieter, honest one. */
export function slowNotice(root, life, text) {
  const timer = setTimeout(() => {
    const status = root.querySelector('[role="status"]');
    if (life.alive() && status && root.getAttribute("aria-busy") === "true") status.textContent = text;
  }, SLOW_MS);
  life.cleanup(() => clearTimeout(timer));
}

/** "1 contract", "2 contracts": counts read as written. */
export function plural(count, one, many = `${one}s`) { return `${number(count)} ${Number(count) === 1 ? one : many}`; }

export function lifecycle(root) {
  const controller = new AbortController();
  let active = true;
  const cleanups = [];
  return { signal: controller.signal, alive: () => active, cleanup(fn) { cleanups.push(fn); }, destroy() { active = false; controller.abort(); root.removeAttribute("aria-busy"); cleanups.forEach((fn) => fn()); } };
}

function loading(root, life) {
  root.innerHTML = '<div class="supplier-page"><p class="ui-status-line" role="status">Opening the supplier records…</p></div>';
  root.setAttribute("aria-busy", "true");
  slowNotice(root, life, "Still opening the supplier records. Large records take longer to load.");
}

function failure(root, retry, message = "The supplier records could not be loaded.") {
  root.removeAttribute("aria-busy");
  root.innerHTML = `<div class="supplier-page" role="alert"><div class="ui-page-head"><h1>Supplier records unavailable</h1></div><p class="ui-empty" data-variant="error">${esc(message)}</p><p class="ui-actions"><button type="button" class="ui-button">Try again</button></p></div>`;
  root.querySelector("button").addEventListener("click", retry);
}

/** A block's figures (ui-stats): [value, label, exact value as a title]. */
export function statsHTML(figures) {
  return `<div class="ui-stats supplier-totals">${figures.map(([value, label, exact]) => `<div class="ui-stat"><span class="ui-stat-value"${exact ? ` title="${esc(exact)}"` : ""}>${esc(value)}</span><span class="ui-stat-label">${esc(label)}</span></div>`).join("")}</div>`;
}

export function coverageHTML(meta) {
  const snapshot = meta?.generated_at || meta?.snapshot_at;
  return `<p class="fineprint">${coverageNotes(meta).join(" ")}${snapshot ? ` Exported ${esc(date(snapshot))}.` : ""}</p>`;
}

/** The coverage sentences, for a source sheet's notes. */
export function coverageNotes(meta) {
  const from = meta?.publication_window_start || meta?.published_from;
  const hasOlder = meta?.supplemental_legacy_contract_count || (meta?.publication_window_start && meta?.published_from < meta.publication_window_start);
  return ["Recorded contract values are commitments, not verified payments. Coverage reflects the available AusTender records, not all government procurement.",
    from && meta?.published_to ? `Publication window: ${esc(date(from))} to ${esc(date(meta.published_to))}${hasOlder ? ", plus selected older contracts" : ""}.` : ""].filter(Boolean);
}

/** One AusTender source line for a procurement block; the caveats live in its sheet. */
export function procurementSourceHTML(meta, notes = []) {
  const updated = meta?.generated_at || meta?.snapshot_at;
  return sourceLineHTML({ updated: placeholderDate(updated) ? "" : updated, dateLabel: "Exported", source: "AusTender", originals: [{ label: "AusTender contract notices", href: "https://www.tenders.gov.au/" }], notes: [...notes.map(esc), ...coverageNotes(meta)] });
}

/** "On this page": the rail on a supplier or agency entry, plus its ways out.
 *  Rows are the blocks on the page; ways out are plain links. */
export function procurementRailHTML(rows, links) {
  return `<aside class="supplier-rail" aria-label="On this page and related pages"><nav class="supplier-rail-nav" aria-labelledby="supplier-rail-head"><p class="ui-toc-head" id="supplier-rail-head">On this page</p><ul class="ui-toc-list" role="list">${rows.map(([id, label]) => `<li><a href="#${esc(id)}">${esc(label)}</a></li>`).join("")}</ul></nav><ul class="supplier-rail-links" role="list">${links.map(([href, label, note]) => `<li><a href="${esc(href)}">${esc(label)}</a>${note ? `<span>${esc(note)}</span>` : ""}</li>`).join("")}</ul></aside>`;
}

export function mountSupplierDirectory(root, helpers = {}) {
  const life = lifecycle(root);
  async function load() {
    loading(root, life);
    try {
      root.innerHTML = '<div class="supplier-page"><div class="ui-page-head"><h1 id="subject-title" tabindex="-1">Government suppliers</h1><p class="ui-lede">Recorded Commonwealth contract awards.</p></div><div data-suppliers-table></div></div>';
      const table = await mountSuppliersTable(root.querySelector('[data-suppliers-table]'), {params: helpers.params, signal: life.signal});
      if (!life.alive()) {table.destroy(); return;}
      life.cleanup(() => table.destroy());
      root.removeAttribute('aria-busy');
      helpers.onTitle?.('Government suppliers');
    } catch (error) {if (life.alive()) failure(root, load, error.message);}
  }
  load();
  return {destroy: life.destroy};
}

/** One ranked row: the name and its figure on a line, a ui-bar under them, then its meta. */
function barRowHTML(name, figure, share, meta) {
  return `<li><div class="supplier-bar-head"><span class="ui-row-name">${name}</span><span class="ui-row-figure">${figure}</span></div><span class="ui-bar" aria-hidden="true"><i style="width:${Math.max(0, Math.min(1, share) * 100).toFixed(2)}%"></i></span><span class="ui-row-meta">${meta}</span></li>`;
}

function agencyChart(agencies, total, ids, meta) {
  const rows = agencies.slice(0, 8);
  const max = Math.max(1, ...rows.map((row) => Number(row.total) || 0));
  return `<section class="ui-section supplier-section" id="supplier-agencies"><h2 class="ui-section-title">Who awards the contracts</h2><p class="ui-section-note supplier-section-note">${agencies.length > 8 ? "The eight largest agencies" : "Agencies"} by recorded contract value.</p><ol class="ui-list supplier-bars" data-rule="none" role="list">${rows.map((row) => barRowHTML(`<a href="${agencyUrl(row.name, ids)}">${esc(row.name)}</a>`, currency(row.total), Number(row.total) / max, `${plural(row.count, "contract")}${total > 0 ? ` · ${percent(Number(row.total) / total * 100)} of recorded value` : ""}`)).join("")}</ol>${procurementSourceHTML(meta)}</section>`;
}

/** Contract value by start year. The bars stretch to the column (preserveAspectRatio none, so a
 *  wide page draws no giant text); the years are an HTML axis under them. A short record keeps
 *  bars a readable width, centred, and a long one labels every few years, more sparsely on phones. */
export function yearChart(years, undated) {
  const rows = [...years].sort((a, b) => Number(a.year) - Number(b.year));
  if (!rows.length) return "";
  const max = Math.max(1, ...rows.map((row) => Number(row.total) || 0));
  const slots = Math.max(rows.length, 12), step = 100 / slots, offset = (slots - rows.length) * step / 2;
  const every = Math.max(1, Math.ceil(rows.length / 10));
  // Every `every`th year, and the last; a label too close to the last one gives way to it.
  const labelled = rows.map((_, index) => index).filter((index) => index % every === 0 && rows.length - 1 - index >= every || index === rows.length - 1);
  const count = (row) => plural(row.count, "contract");
  const bars = rows.map((row, index) => {
    const height = Math.max(0, Number(row.total) / max * 100), x = offset + index * step;
    return `<g class="supplier-year-bar" tabindex="0" role="img" aria-label="${esc(row.year)}: ${currency(row.total)}, ${count(row)}" data-year-value="${esc(row.year)} · ${currency(row.total)} · ${count(row)}"><rect x="${x.toFixed(3)}" y="0" width="${step.toFixed(3)}" height="100" fill="transparent"/><rect x="${(x + step * .15).toFixed(3)}" y="${(100 - height).toFixed(3)}" width="${(step * .7).toFixed(3)}" height="${height.toFixed(3)}" class="supplier-bar-fill supplier-year-value-bar"/></g>`;
  }).join("");
  const axis = labelled.map((index, n) => `<span${n % 2 && index !== rows.length - 1 ? " data-minor" : ""} style="left:${(offset + (index + .5) * step).toFixed(3)}%">${esc(rows[index].year)}</span>`).join("");
  return `<section class="ui-section supplier-section" id="procurement-years"><h2 class="ui-section-title">Contract value over time</h2><p class="ui-section-note supplier-section-note">Recorded value grouped by contract start year. Each bar is a year with available records.</p><div class="supplier-year-chart"><svg viewBox="0 0 100 100" preserveAspectRatio="none" role="group" aria-label="Contract value by start year. Hover, tap or focus a bar for its value."><line x1="0" y1="100" x2="100" y2="100" class="supplier-chart-baseline"/>${bars}</svg><div class="supplier-year-axis" aria-hidden="true">${axis}</div><div class="supplier-year-tooltip" role="tooltip" hidden></div></div><details class="ui-disclosure supplier-chart-data"><summary>Read the yearly values</summary><div class="ui-disclosure-body"><table><caption>Recorded contracts by start year</caption><thead><tr><th scope="col">Year</th><th scope="col">Value</th><th scope="col">Contracts</th></tr></thead><tbody>${rows.map((row) => `<tr><th scope="row">${esc(row.year)}</th><td>${currency(row.total)}</td><td>${number(row.count)}</td></tr>`).join("")}</tbody></table></div></details>${Number(undated?.count) > 0 ? `<p class="fineprint">${plural(undated.count, "contract")} worth ${currency(undated.total)} have no recorded start year and are not shown in this chart.</p>` : ""}</section>`;
}


export function mountYearChart(root, life) {
  const chart = root.querySelector('.supplier-year-chart');
  if (!chart) return;
  const tooltip = chart.querySelector('.supplier-year-tooltip');
  if (!tooltip) return;
  let active = null;
  const hide = () => { tooltip.hidden = true; active?.classList.remove('is-active'); active = null; };
  const show = (bar) => {
    if (!bar || !chart.contains(bar)) return;
    hide(); active = bar; bar.classList.add('is-active');
    tooltip.textContent = bar.dataset.yearValue;
    tooltip.hidden = false;
    const bounds = chart.getBoundingClientRect();
    const mark = bar.querySelector('.supplier-year-value-bar').getBoundingClientRect();
    const x = mark.left - bounds.left + mark.width / 2 - tooltip.offsetWidth / 2;
    tooltip.style.left = `${Math.max(0, Math.min(bounds.width - tooltip.offsetWidth, x))}px`;
    tooltip.style.top = `${Math.max(0, mark.top - bounds.top - tooltip.offsetHeight - 8)}px`;
  };
  const target = event => event.target.closest?.('.supplier-year-bar');
  const over = event => { const bar = target(event); if (bar && bar !== active) show(bar); };
  const leave = () => { if (!chart.contains(document.activeElement)) hide(); };
  const focus = event => show(target(event));
  const click = event => { const bar = target(event); if (bar) { bar.focus(); show(bar); } };
  const key = event => { if (event.key === 'Escape') { hide(); event.stopPropagation(); } };
  const handlers = { pointerover: over, pointerleave: leave, focusin: focus, focusout: hide, click, keydown: key };
  for (const [event, fn] of Object.entries(handlers)) chart.addEventListener(event, fn);
  life.cleanup(() => { for (const [event, fn] of Object.entries(handlers)) chart.removeEventListener(event, fn); });
}

// Most AusTender titles are the agency's own reference ("4600062643"); a row reads by what was bought.
const referenceTitle = (value) => !/\s/.test(value) && (/\d/.test(value) || value === value.toUpperCase());
export function contractTitle(contract) {
  const title = String(contract?.title || "").trim();
  const description = String(contract?.description || "").trim();
  const counterpart = contract?.supplier || contract?.agency;
  return description || (title && !referenceTitle(title) ? title : counterpart ? `Contract with ${counterpart}` : "Untitled contract");
}

export function contractHTML(contract, ids) {
  const url = contract.link_scope === "source_register" && contract.id
    ? `https://www.tenders.gov.au/Search/KeywordSearch?keyword=${encodeURIComponent(contract.id)}`
    : sourceUrl(contract.url);
  const counterpart = contract.supplier_id ? `<a href="/subject/supplier/${encodeURIComponent(contract.supplier_id)}">${esc(contract.supplier)}</a>` : contract.agency ? `<a href="${agencyUrl(contract.agency, ids)}">${esc(contract.agency)}</a>` : "Agency not recorded";
  const when = placeholderDate(contract.start_date) ? "date not recorded" : date(contract.start_date);
  const heading = contractTitle(contract);
  const party = contract.supplier || contract.agency;
  const meta = [heading.startsWith("Contract with ") ? "" : party || "Agency not recorded", contract.id, when].filter(Boolean);
  const reference = String(contract.title || "").trim();
  return `<details class="ui-disclosure supplier-contract"><summary><span class="supplier-contract-what"><span class="ui-row-name">${esc(heading)}</span><span class="ui-row-meta">${meta.map(esc).join(" · ")}</span></span><span class="ui-row-figure">${currency(contract.amount)}</span></summary><div class="ui-disclosure-body"><dl class="ui-kv"><dt>${contract.supplier_id ? "Supplier" : "Awarding agency"}</dt><dd>${counterpart}</dd><dt>Contract reference</dt><dd>${esc(contract.id)}</dd>${reference && reference !== heading && reference !== contract.id ? `<dt>Agency reference</dt><dd>${esc(reference)}</dd>` : ""}<dt>Start date</dt><dd>${esc(date(contract.start_date))}</dd><dt>End date</dt><dd>${esc(date(contract.end_date))}</dd><dt>Published</dt><dd>${esc(date(contract.published))}</dd><dt>Procurement method</dt><dd>${esc(contract.procurement_method || "Not recorded")}</dd></dl>${url ? `<a class="ui-source-link" href="${esc(url)}" target="_blank" rel="noopener noreferrer">${contract.link_scope === "source_register" ? `Find ${esc(contract.id)} on AusTender` : "Open the source notice"}<span class="visually-hidden"> (opens in a new tab)</span></a>` : '<p class="fineprint">No direct source URL is recorded. Use the contract reference to find the notice on <a href="https://www.tenders.gov.au/" target="_blank" rel="noopener noreferrer">AusTender</a>.</p>'}${Number(contract.notices) > 1 ? `<p class="fineprint">${number(contract.notices)} source notices are associated with this contract.</p>` : ""}</div></details>`;
}

async function renderProfile(root, profile, meta, helpers, life, suppliers) {
  const ids = await agencyIds(life.signal);
  if (!life.alive()) return;
  const agencies = [...(profile.agencies || [])].sort((a, b) => Number(b.total) - Number(a.total));
  const years = profile.years || [];
  const top = agencies[0];
  const share = top && profile.total > 0 ? Number(top.total) / Number(profile.total) * 100 : 0;

  root.removeAttribute("aria-busy");
  const identity = [
    sourceUrl(profile.identity?.abn_url) ? `<dt>Business register</dt><dd><a href="${esc(sourceUrl(profile.identity.abn_url))}" target="_blank" rel="noopener noreferrer">Check the ABN record</a></dd>` : "",
    profile.identity?.legal_name ? `<dt>Legal name</dt><dd>${esc(profile.identity.legal_name)}</dd>` : "",
    profile.identity?.method ? `<dt>Records grouped by</dt><dd>${esc(identityMethod(profile.identity.method))}</dd>` : "",
    profile.identity?.status ? `<dt>ABN status</dt><dd>${esc(profile.identity.status === "ACT" ? "Active" : profile.identity.status === "CAN" ? "Cancelled" : profile.identity.status)}</dd>` : "",
  ].join("");
  const aliases = (profile.aliases || []).length > 1 ? `<details class="ui-disclosure supplier-aliases"><summary>Names in the source records</summary><ul class="ui-list ui-disclosure-body" data-density="compact" role="list">${profile.aliases.map((name) => `<li>${esc(name)}</li>`).join("")}</ul></details>` : "";
  const rail = procurementRailHTML([
    ["supplier-agencies", "Who awards the contracts"], ["supplier-connections", "Agency connections"], ...(years.length ? [["procurement-years", "Contract value over time"]] : []),
    ["supplier-contracts", "The contract record"], ...(identity || aliases ? [["supplier-identity", "Identity"]] : []),
  ], [
    [`/ask?view=search&kind=speech&q=${encodeURIComponent(`"${profile.name}"`)}`, "Find mentions in parliament", "Results may include organisations with similar names."],
    ["/subject/supplier", "Browse all suppliers"],
  ]);
  const seedNode = document.querySelector('#prerender [data-contracts-seed]');
  const seed = seedNode ? JSON.parse(seedNode.textContent) : null;
  // The head: the name, one meta line, the lede and the three figures (ui-stats).
  root.innerHTML = `<div class="supplier-page supplier-entry"><div class="ui-page-head supplier-head"><h1 id="subject-title" tabindex="-1">${esc(profile.name)}</h1><p class="ui-page-meta">Commonwealth supplier${profile.abn ? ` · ABN ${esc(profile.abn)}` : ""}</p>
    <p class="ui-lede supplier-lede">${top ? `${esc(top.name)} accounts for ${percent(share)} of the recorded contract value.` : "No agency breakdown is available in this export."}</p>
    ${statsHTML([[shortMoney(profile.total), "Recorded contract value", currency(profile.total)], [number(profile.count), "Contracts"], [number(agencies.length), "Agencies"]])}</div>
    <div class="supplier-profile-grid"><div class="supplier-profile-main">${agencyChart(agencies, Number(profile.total), ids, meta)}<section class="ui-section supplier-section" id="supplier-connections"><h2 class="ui-section-title">Agency connections</h2><p class="ui-section-note">Explore the agencies awarding contracts to this supplier.</p><div class="supplier-money-map supplier-agency-map"></div></section>${yearChart(years, profile.undated)}<div class="supplier-growth"></div><section class="ui-section supplier-section supplier-funding" id="supplier-funding" hidden></section><section class="ui-section supplier-section supplier-evidence" hidden></section><section class="ui-section supplier-section supplier-taxcharity" hidden></section><section class="ui-section supplier-section supplier-mentions"></section>
      <section class="ui-section supplier-section" id="supplier-contracts"><div data-contracts-table></div>${procurementSourceHTML(meta, profile.caveats || [])}</section>
      ${identity || aliases ? `<section class="ui-section supplier-section" id="supplier-identity"><h2 class="ui-section-title">Identity</h2>${identity ? `<dl class="ui-kv supplier-identity">${identity}</dl>` : ""}${aliases}</section>` : ""}
    </div>${rail}</div></div>`;
  mountSupplierGrowth(root.querySelector(".supplier-growth"), profile, meta, life, suppliers);
  import('/agencies.js?v=agency-polish-20261014').then(({ mountProcurementPreview }) => {
    if (life.alive()) return mountProcurementPreview(root.querySelector('.supplier-agency-map'), profile, 'supplier', life);
  }).catch(() => {
    if (life.alive()) root.querySelector('.supplier-agency-map').innerHTML = '<p>The map could not open. Agency relationships are listed above.</p>';
  });
  const evidenceSlot = root.querySelector('.supplier-evidence');
  import('/evidence.js').then(({ mountEvidence }) => {
    if (life.alive()) return mountEvidence(evidenceSlot, {name: profile.name, abn: profile.abn}, life);
  }).catch(() => {});
  // Charity register, AIS and ATO tax transparency, by the supplier's ABN only (no ABN: no block).
  const taxSlot = root.querySelector('.supplier-taxcharity');
  if (profile.abn) import('/tax-charity.js?v=tax-charity-20260929c').then(({ mountTaxCharity }) => {
    if (life.alive()) return mountTaxCharity(taxSlot, { abn: profile.abn, alive: life.alive });
  }).catch(() => {}); else taxSlot?.remove();
  mountYearChart(root, life);
  helpers.onCanonical?.(profile.id, profile.name);
  helpers.onTitle?.(`${profile.name} · Government supplier`);
  helpers.onMentions?.(profile.name, root.querySelector(".supplier-mentions"));
  supplierDonations(profile, life).then(donations => {
    if (!life.alive()) return;
    const donorLinks = donations.links;
    if (donorLinks.length) mountFunding(root.querySelector(".supplier-funding"), donorLinks, life, donations.html);
  }).catch(() => {});
  const table = root.querySelector('#supplier-contracts [data-contracts-table]');
  const seeded = seed?.supplierId === profile.id;
  // Without the server's seed (an in-app visit) the table reads /api/table/contracts:
  // a status line meanwhile, a quieter one at SLOW_MS, and no waiting past GIVE_UP_MS.
  const wait = new AbortController(), forward = () => wait.abort();
  life.signal.addEventListener("abort", forward, { once: true });
  const timers = [setTimeout(forward, GIVE_UP_MS)];
  if (!seeded) {
    table.innerHTML = '<p class="ui-status-line" role="status">Opening the contract records…</p>';
    timers.push(setTimeout(() => { const status = table.querySelector('[role="status"]'); if (status) status.textContent = "Still opening the contract records. Large records take longer to load."; }, SLOW_MS));
  }
  const settle = () => timers.forEach(clearTimeout);
  life.cleanup(settle);
  try {
    const handle = await mountContractsTable(table, {supplierId: profile.id, count: profile.contracts.length,
      seed: seeded ? seed : undefined, signal: wait.signal, params: helpers.params});
    settle();
    if (life.alive()) life.cleanup(() => handle.destroy()); else handle.destroy();
  } catch {settle(); if (life.alive()) table.innerHTML = '<p role="alert">The contract records could not be loaded.</p>';}

}

export function mountSupplierProfile(root, idOrName, helpers = {}) {
  const life = lifecycle(root);
  async function load() {
    loading(root, life);
    try {
      const directory = await json("/suppliers.json", life.signal);
      if (!life.alive()) return;
      const exact = (directory.suppliers || []).find((item) => item.id === idOrName);
      const matches = exact ? [exact] : (directory.suppliers || []).filter((item) => [item.name, ...(item.aliases || []), ...(item.lookup_names || [])].some((name) => String(name).trim().toLocaleLowerCase() === String(idOrName).trim().toLocaleLowerCase()));
      if (matches.length > 1) {
        root.removeAttribute("aria-busy");
        root.innerHTML = `<div class="supplier-page"><div class="ui-page-head"><h1 id="subject-title" tabindex="-1">Choose a supplier</h1><p class="ui-lede">More than one supplier uses this name. Check the ABN before opening a profile.</p></div><ul class="ui-list" role="list">${matches.map((item) => `<li><p class="ui-row-name"><a href="${profileUrl(item.id)}">${esc(item.name)}</a></p><p class="ui-row-meta">${item.abn ? `ABN ${esc(item.abn)}` : "No ABN recorded"}</p></li>`).join("")}</ul></div>`;
        helpers.onTitle?.("Choose a supplier"); return;
      }
      const entry = matches[0];
      if (!entry) {
        root.removeAttribute("aria-busy");
        root.innerHTML = '<div class="supplier-page"><div class="ui-page-head"><h1 id="subject-title" tabindex="-1">Supplier not found</h1><p class="ui-lede">This supplier is not in the current export. <a href="/subject/supplier">Search the supplier directory</a>.</p></div></div>';
        helpers.onTitle?.("Supplier not found");
        return;
      }
      if (!/^\/suppliers\/[a-z0-9-]+\.json$/.test(entry.profile_path)) throw new Error("The supplier profile reference is invalid.");
      const shard = await json(entry.profile_path, life.signal);
      if (!life.alive()) return;
      const profile = shard.profiles?.[entry.id];
      if (!profile || !Array.isArray(profile.contracts)) throw new Error("This supplier profile is not available in the current export.");
      await renderProfile(root, profile, directory.meta, helpers, life, directory.suppliers);
    } catch (error) { if (life.alive()) failure(root, load, error.message); }
  }
  load();
  return { destroy: life.destroy };
}

async function mountFunding(root, links, life, register = "") {
  root.hidden = false;
  root.innerHTML = `<h2 class="ui-section-title">Also in the funding record</h2><p class="ui-status-line" role="status">Opening the funding records…</p>${register}`;
  try {
    const data = await json("/graph/money.json", life.signal);
    if (!life.alive()) return;
    const ids = new Set(links.map((link) => link.id));
    const nodes = new Map((data.nodes || []).map((node) => [node.id, node]));
    const matchedNodes = [...ids].map((id) => nodes.get(id)).filter(Boolean);
    const nodeTotal = matchedNodes.reduce((sum, node) => sum + (Number(node.total) || 0), 0);
    const nodeCount = matchedNodes.reduce((sum, node) => sum + (Number(node.count) || 0), 0);
    const fromYears = matchedNodes.map((node) => Number(node.firstYear)).filter((year) => Number.isFinite(year) && year > 0);
    const toYears = matchedNodes.map((node) => Number(node.lastYear)).filter((year) => Number.isFinite(year) && year > 0);
    const firstYear = Math.min(...fromYears), lastYear = Math.max(...toYears);
    const yearSpan = fromYears.length && toYears.length ? (firstYear === lastYear ? String(firstYear) : `${firstYear}–${lastYear}`) : "";
    const edges = (data.edges || []).filter((edge) => ids.has(edge.source) && nodes.get(edge.target)?.kind === "party");
    const grouped = new Map();
    for (const edge of edges) {
      const row = grouped.get(edge.target) || { name: nodes.get(edge.target).label, total: 0, count: 0 };
      row.total += Number(edge.total) || 0;
      row.count += Number(edge.count) || 0;
      grouped.set(edge.target, row);
    }
    const rows = [...grouped.values()].sort((a, b) => b.total - a.total);
    const max = Math.max(1, ...rows.map((row) => row.total));
    root.innerHTML = `<h2 class="ui-section-title">Also in the funding record</h2><p class="ui-section-note supplier-section-note">Disclosed party receipts recorded under this supplier’s identity, from the money map’s selected donor data${yearSpan ? ` (${yearSpan})` : ""}. These totals cover a different set of records and dates from the contracts above.</p>${rows.length ? `<ol class="ui-list supplier-bars" data-rule="none" role="list">${rows.map((row) => barRowHTML(`<a href="${partyUrl(row.name)}">${esc(row.name)}</a>`, currency(row.total), row.total / max, plural(row.count, "recorded receipt"))).join("")}</ol>` : matchedNodes.length ? `<p><strong>${currency(nodeTotal)}</strong> across ${plural(nodeCount, "recorded receipt")}${yearSpan ? ` (${yearSpan})` : ""}. The party breakdown is not available in this map export.</p>` : "<p>This recorded identity is not present in the current map export.</p>"}${matchedNodes.length ? '<button type="button" class="ui-button supplier-map-toggle">Explore the money map</button><div class="supplier-money-map" hidden></div>' : ""}${register}`;
    root.querySelector(".supplier-map-toggle")?.addEventListener("click", async (event) => {
      const button = event.currentTarget;
      const slot = root.querySelector(".supplier-money-map");
      button.disabled = true;
      slot.hidden = false;
      slot.innerHTML = '<p role="status">Opening the money map…</p>';
      try {
        const { mountMoneyMap } = await import("/money-map.js?v=60a91b38e8");
        if (!life.alive()) return;
        slot.textContent = "";
        const handle = await mountMoneyMap(slot, "/graph/money.json", { focus: links[0].id, chrome: "mini", reveal: true, openCard: false });
        if (!life.alive()) { handle.destroy(); return; }
        life.cleanup(() => handle.destroy());
        if (typeof IntersectionObserver !== "undefined") {
          const observer = new IntersectionObserver((entries) => handle.setPaused(!entries.at(-1).isIntersecting));
          observer.observe(slot);
          life.cleanup(() => observer.disconnect());
        }
        button.hidden = true;
      } catch {
        if (!life.alive()) return;
        slot.innerHTML = '<p>The map could not open here. <a href="/money">Open the full money map</a>.</p>';
        button.disabled = false;
      }
    });
  } catch {
    if (life.alive()) root.innerHTML = `<h2 class="ui-section-title">Also in the funding record</h2>${register}`;
  }
}
