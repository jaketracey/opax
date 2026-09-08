/* Supplier entries: recorded procurement, source notices and funding cross-links.
   No dependencies; the host router owns mounting and calls destroy on departure. */
const esc = (value) => String(value ?? "").replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]);
const number = (value) => (Number(value) || 0).toLocaleString("en-AU");
const currency = (value) => (Number(value) || 0).toLocaleString("en-AU", { style: "currency", currency: "AUD", maximumFractionDigits: 0 });
const percent = (value) => value > 0 && value < 0.1 ? "less than 0.1%" : value > 99.9 && value < 100 ? "over 99.9%" : `${value.toLocaleString("en-AU", { maximumFractionDigits: 1 })}%`;
const compact = (value) => (Number(value) || 0).toLocaleString("en-AU", { style: "currency", currency: "AUD", notation: "compact", maximumFractionDigits: 1 });
const sourceUrl = (value) => typeof value === "string" && /^https?:\/\//i.test(value) ? value : null;
const profileUrl = (id) => `/subject/supplier/${encodeURIComponent(id)}`;
const identityMethod = (method) => ({ source: "Supplier identity in the source register", source_abn: "ABN in the source register", abn: "Matching ABN", exact_normalized_name: "Matching recorded name", normalized_name: "Matching recorded name", exact_name: "Matching recorded name", published_graph_supplier_id: "Linked in the money map", verified_abn: "Matching ABN" })[method] || "Linked source records";
const donorUrl = (value) => typeof value === "string" && /^\/subject\/donor\/[^\s]+$/.test(value) ? value : null;
const date = (value) => value && /^\d{4}-\d{2}-\d{2}/.test(value) ? new Date(`${value.slice(0, 10)}T00:00:00`).toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric" }) : "Not recorded";

export async function json(url, signal) {
  const response = await fetch(url, { signal });
  if (!response.ok) throw new Error("The supplier records could not be loaded.");
  return response.json();
}

export function lifecycle(root) {
  const controller = new AbortController();
  let active = true;
  const cleanups = [];
  return { signal: controller.signal, alive: () => active, cleanup(fn) { cleanups.push(fn); }, destroy() { active = false; controller.abort(); root.removeAttribute("aria-busy"); cleanups.forEach((fn) => fn()); } };
}

function loading(root) {
  root.innerHTML = '<div class="supplier-page"><p class="status" role="status">Opening the supplier records…</p></div>';
  root.setAttribute("aria-busy", "true");
}

function failure(root, retry, message = "The supplier records could not be loaded.") {
  root.removeAttribute("aria-busy");
  root.innerHTML = `<div class="supplier-page supplier-empty" role="alert"><h2>Supplier records unavailable</h2><p>${esc(message)}</p><button type="button" class="supplier-button">Try again</button></div>`;
  root.querySelector("button").addEventListener("click", retry);
}

export function coverageHTML(meta) {
  const snapshot = meta?.generated_at || meta?.snapshot_at;
  const window = meta?.published_from && meta?.published_to ? ` Current notices published ${date(meta.published_from)} to ${date(meta.published_to)}${meta.supplemental_legacy_contract_count ? ", supplemented by older contract records" : ""}.` : "";
  return `<p class="fineprint">Recorded contract values are commitments, not verified payments. Coverage reflects the available AusTender records, not all government procurement.${window}${snapshot ? ` Exported ${esc(date(snapshot))}.` : ""}</p>`;
}

export function mountSupplierDirectory(root, helpers = {}) {
  const life = lifecycle(root);
  async function load() {
    loading(root);
    try {
      const data = await json("/suppliers.json", life.signal);
      if (!life.alive()) return;
      if (!Array.isArray(data.suppliers)) throw new Error("The supplier directory is incomplete.");
      const suppliers = data.suppliers;

      root.removeAttribute("aria-busy");
      root.innerHTML = `<div class="supplier-page">
        <div class="subject-head"><h2 id="subject-title" tabindex="-1">Government suppliers</h2><p class="subject-tag">Follow Commonwealth contracts, agencies and recorded funding connections behind a supplier.</p></div>
        <div class="supplier-controls"><label>Find a supplier<input type="search" name="supplier-query" placeholder="Name or ABN" autocomplete="off"></label><label>Sort by<select name="supplier-sort"><option value="total">Contract value</option><option value="count">Number of contracts</option><option value="name">Name</option></select></label></div>
        <p class="supplier-result-count" role="status"></p><div class="supplier-directory"></div><div class="supplier-more"></div>${coverageHTML(data.meta)}
      </div>`;
      const query = root.querySelector('input[name="supplier-query"]');
      const sort = root.querySelector('select[name="supplier-sort"]');
      const donor = helpers.params?.get("donor") || "";
      query.value = helpers.params?.get("q") || "";
      helpers.onTitle?.("Government suppliers");
      let visible = 40;
      function render() {
        const term = query.value.trim().toLocaleLowerCase();
        const abnTerm = term.replace(/\s/g, "");
        const filtered = suppliers.filter((item) => (!donor || (item.money_node_ids || []).includes(donor)) && (!term || [item.name, ...(item.aliases || []), ...(item.lookup_names || [])].some((name) => String(name).toLocaleLowerCase().includes(term)) || (item.abn && String(item.abn).replace(/\s/g, "").includes(abnTerm))))
          .sort((a, b) => sort.value === "name" ? a.name.localeCompare(b.name) : (Number(b[sort.value]) || 0) - (Number(a[sort.value]) || 0) || a.name.localeCompare(b.name));
        root.querySelector(".supplier-result-count").textContent = `${number(filtered.length)} ${filtered.length === 1 ? "supplier" : "suppliers"}${term ? ` matching your search` : " in the available records"}${donor ? " linked to this funding profile" : ""}`;
        root.querySelector(".supplier-directory").innerHTML = filtered.length ? filtered.slice(0, visible).map((item) => `<a class="supplier-directory-row" href="${profileUrl(item.id)}"><span><strong>${esc(item.name)}</strong><small>${item.abn ? `ABN ${esc(item.abn)}` : "No ABN recorded"}${item.first_year ? ` · ${esc(item.first_year)}${item.last_year !== item.first_year ? `–${esc(item.last_year)}` : ""}` : ""}</small></span><span class="supplier-directory-value"><strong>${currency(item.total)}</strong><small>${number(item.count)} ${Number(item.count) === 1 ? "contract" : "contracts"} · ${number(item.agency_count)} ${Number(item.agency_count) === 1 ? "agency" : "agencies"}</small></span></a>`).join("") : '<div class="supplier-empty"><p>No suppliers match this view. Try another name or ABN, or <a href="/subject/supplier">browse all suppliers</a>.</p></div>';
        const more = root.querySelector(".supplier-more");
        more.innerHTML = filtered.length > visible ? '<button type="button" class="supplier-button">Show more suppliers</button>' : "";
        more.querySelector("button")?.addEventListener("click", () => { const firstNew = visible; visible += 40; render(); root.querySelectorAll(".supplier-directory-row")[firstNew]?.focus(); });
      }
      query.addEventListener("input", () => { const params = new URLSearchParams(); if (donor) params.set("donor", donor); if (query.value.trim()) params.set("q", query.value.trim()); history.replaceState(null, "", `/subject/supplier${params.size ? `?${params}` : ""}`); visible = 40; render(); });
      sort.addEventListener("change", () => { visible = 40; render(); });
      render();
    } catch (error) { if (life.alive()) failure(root, load, error.message); }
  }
  load();
  return { destroy: life.destroy };
}

function agencyChart(agencies, total) {
  const rows = agencies.slice(0, 8);
  const max = Math.max(1, ...rows.map((row) => Number(row.total) || 0));
  return `<section class="supplier-section"><h3 class="subject-section-title">Who awards the contracts</h3><p class="supplier-section-note">${agencies.length > 8 ? "The eight largest agencies" : "Agencies"} by recorded contract value.</p><ol class="supplier-bars">${rows.map((row) => `<li><div><a href="/subject/agency/${encodeURIComponent(row.name)}">${esc(row.name)}</a><strong>${currency(row.total)}</strong></div><svg viewBox="0 0 100 5" preserveAspectRatio="none" aria-hidden="true"><rect width="100" height="5" class="supplier-bar-track"/><rect width="${Math.max(0, Number(row.total) / max * 100).toFixed(2)}" height="5" class="supplier-bar-fill"/></svg><small>${number(row.count)} ${Number(row.count) === 1 ? "contract" : "contracts"}${total > 0 ? ` · ${percent(Number(row.total) / total * 100)} of recorded value` : ""}</small></li>`).join("")}</ol></section>`;
}

export function yearChart(years, undated) {
  const rows = [...years].sort((a, b) => Number(a.year) - Number(b.year));
  if (!rows.length) return '<section class="supplier-section"><h3 class="subject-section-title">Contract value over time</h3><p>No dated contracts are available.</p></section>';
  const max = Math.max(1, ...rows.map((row) => Number(row.total) || 0));
  const width = 640, height = 175, step = width / rows.length;
  const labelEvery = Math.max(1, Math.ceil(rows.length / 10));
  return `<section class="supplier-section"><h3 class="subject-section-title">Contract value over time</h3><p class="supplier-section-note">Recorded value grouped by contract start year. Each bar is a year with available records.</p><div class="supplier-year-chart"><svg viewBox="0 0 640 210" role="group" aria-label="Contract value by start year. Hover, tap or focus a bar for its value."><line x1="0" y1="175" x2="640" y2="175" class="supplier-chart-baseline"/>${rows.map((row, index) => { const barHeight = Math.max(0, Number(row.total) / max * (height - 20)); return `<g class="supplier-year-bar" tabindex="0" role="img" aria-label="${esc(row.year)}: ${currency(row.total)}, ${number(row.count)} ${Number(row.count) === 1 ? "contract" : "contracts"}" data-year-value="${esc(row.year)} · ${currency(row.total)} · ${number(row.count)} ${Number(row.count) === 1 ? "contract" : "contracts"}"><rect x="${(index * step).toFixed(2)}" y="0" width="${step.toFixed(2)}" height="210" fill="transparent"/><rect x="${(index * step + step * .15).toFixed(2)}" y="${(height - barHeight).toFixed(2)}" width="${(step * .7).toFixed(2)}" height="${barHeight.toFixed(2)}" class="supplier-bar-fill supplier-year-value-bar"/>${index % labelEvery === 0 || index === rows.length - 1 ? `<text x="${(index * step + step / 2).toFixed(2)}" y="198" text-anchor="middle">${esc(row.year)}</text>` : ""}</g>`; }).join("")}</svg><div class="supplier-year-tooltip" role="tooltip" hidden></div></div><details class="supplier-chart-data"><summary>Read the yearly values</summary><table><caption>Recorded contracts by start year</caption><thead><tr><th scope="col">Year</th><th scope="col">Value</th><th scope="col">Contracts</th></tr></thead><tbody>${rows.map((row) => `<tr><th scope="row">${esc(row.year)}</th><td>${currency(row.total)}</td><td>${number(row.count)}</td></tr>`).join("")}</tbody></table></details>${Number(undated?.count) > 0 ? `<p class="fineprint">${number(undated.count)} contracts worth ${currency(undated.total)} have no recorded start year and are not shown in this chart.</p>` : ""}</section>`;
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

export function contractHTML(contract) {
  const url = contract.link_scope === "source_register" && contract.id
    ? `https://www.tenders.gov.au/Search/KeywordSearch?keyword=${encodeURIComponent(contract.id)}`
    : sourceUrl(contract.url);
  const counterpart = contract.supplier_id ? `<a href="/subject/supplier/${encodeURIComponent(contract.supplier_id)}">${esc(contract.supplier)}</a>` : contract.agency ? `<a href="/subject/agency/${encodeURIComponent(contract.agency)}">${esc(contract.agency)}</a>` : "Agency not recorded";
  return `<details class="supplier-contract"><summary><span><strong>${esc(contract.title || "Untitled contract")}</strong><small>${esc(contract.supplier || contract.agency || "Agency not recorded")} · ${esc(date(contract.start_date))}</small></span><b>${currency(contract.amount)}</b></summary>${contract.description ? `<p class="supplier-contract-description">${esc(contract.description)}</p>` : ""}<dl><dt>${contract.supplier_id ? "Supplier" : "Awarding agency"}</dt><dd>${counterpart}</dd><dt>Contract reference</dt><dd>${esc(contract.id)}</dd><dt>Start date</dt><dd>${esc(date(contract.start_date))}</dd><dt>End date</dt><dd>${esc(date(contract.end_date))}</dd><dt>Published</dt><dd>${esc(date(contract.published))}</dd><dt>Procurement method</dt><dd>${esc(contract.procurement_method || "Not recorded")}</dd></dl>${url ? `<a href="${esc(url)}" target="_blank" rel="noopener noreferrer">${contract.link_scope === "source_register" ? `Find ${esc(contract.id)} on AusTender` : "Open the source notice"}<span class="visually-hidden"> (opens in a new tab)</span></a>` : '<p class="fineprint">No direct source URL is recorded. Use the contract reference to find the notice on <a href="https://www.tenders.gov.au/" target="_blank" rel="noopener noreferrer">AusTender</a>.</p>'}${Number(contract.notices) > 1 ? `<p class="fineprint">${number(contract.notices)} source notices are associated with this contract.</p>` : ""}</details>`;
}

function renderProfile(root, profile, meta, helpers, life) {
  const agencies = [...(profile.agencies || [])].sort((a, b) => Number(b.total) - Number(a.total));
  const years = profile.years || [];
  const donorLinks = (profile.donor_links || []).filter((link) => donorUrl(link.url));
  const top = agencies[0];
  const share = top && profile.total > 0 ? Number(top.total) / Number(profile.total) * 100 : 0;

  root.removeAttribute("aria-busy");
  root.innerHTML = `<div class="supplier-page"><div class="subject-head"><h2 id="subject-title" tabindex="-1">${esc(profile.name)}</h2><p class="subject-tag">Commonwealth supplier${profile.abn ? ` · ABN ${esc(profile.abn)}` : ""}</p></div>
    <p class="supplier-lede">${top ? `${esc(top.name)} accounts for ${percent(share)} of the recorded contract value.` : "No agency breakdown is available in this export."}</p>
    <dl class="supplier-totals"><div><dt>Recorded contract value</dt><dd title="${currency(profile.total)}">${compact(profile.total)}</dd></div><div><dt>Contracts</dt><dd>${number(profile.count)}</dd></div><div><dt>Agencies</dt><dd>${number(agencies.length)}</dd></div></dl>
    <div class="supplier-profile-grid"><div class="supplier-profile-main">${agencyChart(agencies, Number(profile.total))}<section class="supplier-section"><h3 class="subject-section-title">Agency connections</h3><p>Explore the agencies awarding contracts to this supplier.</p><div class="supplier-money-map supplier-agency-map"></div></section>${yearChart(years, profile.undated)}<section class="supplier-section supplier-funding" hidden></section><section class="supplier-section supplier-mentions"></section>
      <section class="supplier-section"><h3 class="subject-section-title">The contract record</h3><div class="supplier-controls"><label>Filter contracts<input type="search" name="contract-query" placeholder="Title, agency or reference" autocomplete="off"></label></div><p class="supplier-contract-count" role="status"></p><div class="supplier-contract-list"></div><div class="supplier-contract-more"></div></section>
    </div><aside class="supplier-context"><section><h3>Follow the connections</h3>${donorLinks.length ? `<p>Also in the recorded party funding data:</p><ul>${donorLinks.map((link) => `<li><a href="${esc(donorUrl(link.url))}">${esc(link.name)}</a>${link.method ? `<small>${esc(identityMethod(link.method))}</small>` : ""}</li>`).join("")}</ul><p class="fineprint">An identity link connects records. It does not establish that funding influenced a contract award.</p>` : '<p>No link to an available donor profile is recorded for this supplier.</p>'}<a href="/search?kind=speech&q=${encodeURIComponent(`"${profile.name}"`)}">Find mentions in parliament</a><p class="fineprint">Search results may refer to other organisations with similar names.</p><a class="supplier-directory-link" href="/subject/supplier">Browse all suppliers</a></section>
      <section><details><summary>Identity and coverage</summary><dl class="supplier-identity">${sourceUrl(profile.identity?.abn_url) ? `<dt>Business register</dt><dd><a href="${esc(sourceUrl(profile.identity.abn_url))}" target="_blank" rel="noopener noreferrer">Check the ABN record</a></dd>` : ""}${profile.identity?.legal_name ? `<dt>Legal name</dt><dd>${esc(profile.identity.legal_name)}</dd>` : ""}${profile.identity?.method ? `<dt>Records grouped by</dt><dd>${esc(identityMethod(profile.identity.method))}</dd>` : ""}${profile.identity?.status ? `<dt>ABN status</dt><dd>${esc(profile.identity.status === "ACT" ? "Active" : profile.identity.status === "CAN" ? "Cancelled" : profile.identity.status)}</dd>` : ""}</dl>${(profile.aliases || []).length > 1 ? `<details><summary>Names in the source records</summary><ul>${profile.aliases.map((name) => `<li>${esc(name)}</li>`).join("")}</ul></details>` : ""}<ul class="supplier-caveats">${(profile.caveats || []).map((caveat) => `<li>${esc(caveat)}</li>`).join("")}</ul>${coverageHTML(meta)}</details></section>
    </aside></div></div>`;
  import('/agencies.js?v=austender-1').then(({ mountProcurementPreview }) => {
    if (life.alive()) return mountProcurementPreview(root.querySelector('.supplier-agency-map'), profile, 'supplier', life);
  }).catch(() => {
    if (life.alive()) root.querySelector('.supplier-agency-map').innerHTML = '<p>The map could not open. Agency relationships are listed above.</p>';
  });
  mountYearChart(root, life);
  helpers.onCanonical?.(profile.id, profile.name);
  helpers.onTitle?.(`${profile.name} · Government supplier`);
  helpers.onMentions?.(profile.name, root.querySelector(".supplier-mentions"));
  if (donorLinks.length) mountFunding(root.querySelector(".supplier-funding"), donorLinks, life);
  const contracts = [...(profile.contracts || [])].sort((a, b) => String(b.start_date || "").localeCompare(String(a.start_date || "")) || Number(b.amount) - Number(a.amount));
  let visible = 15;
  const query = root.querySelector('input[name="contract-query"]');
  query.value = helpers.params?.get("contract") || "";
  function renderContracts() {
    const term = query.value.trim().toLocaleLowerCase();
    const filtered = contracts.filter((contract) => !term || `${contract.title} ${contract.agency} ${contract.id}`.toLocaleLowerCase().includes(term));
    root.querySelector(".supplier-contract-count").textContent = `${number(Math.min(visible, filtered.length))} of ${number(filtered.length)} ${filtered.length === 1 ? "contract" : "contracts"}${term ? " matching this filter" : " shown, newest first"}`;
    root.querySelector(".supplier-contract-list").innerHTML = filtered.length ? filtered.slice(0, visible).map(contractHTML).join("") : '<p class="status">No contracts match this filter.</p>';
    const more = root.querySelector(".supplier-contract-more");
    more.innerHTML = filtered.length > visible ? '<button type="button" class="supplier-button">Show more contracts</button>' : "";
    more.querySelector("button")?.addEventListener("click", () => { const firstNew = visible; visible += 15; renderContracts(); root.querySelectorAll(".supplier-contract summary")[firstNew]?.focus(); });
  }
  query.addEventListener("input", () => { visible = 15; renderContracts(); });
  renderContracts();
  if (query.value) {
    const selected = root.querySelector(".supplier-contract");
    if (selected) { selected.open = true; selected.querySelector("summary")?.focus(); selected.scrollIntoView({block:"center"}); }
  }
}

export function mountSupplierProfile(root, idOrName, helpers = {}) {
  const life = lifecycle(root);
  async function load() {
    loading(root);
    try {
      const directory = await json("/suppliers.json", life.signal);
      if (!life.alive()) return;
      const exact = (directory.suppliers || []).find((item) => item.id === idOrName);
      const matches = exact ? [exact] : (directory.suppliers || []).filter((item) => [item.name, ...(item.aliases || []), ...(item.lookup_names || [])].some((name) => String(name).trim().toLocaleLowerCase() === String(idOrName).trim().toLocaleLowerCase()));
      if (matches.length > 1) {
        root.removeAttribute("aria-busy");
        root.innerHTML = `<div class="supplier-page"><h2 id="subject-title" tabindex="-1">Choose a supplier</h2><p>More than one supplier uses this name. Check the ABN before opening a profile.</p><ul>${matches.map((item) => `<li><a href="${profileUrl(item.id)}">${esc(item.name)}</a> — ${item.abn ? `ABN ${esc(item.abn)}` : "No ABN recorded"}</li>`).join("")}</ul></div>`;
        helpers.onTitle?.("Choose a supplier"); return;
      }
      const entry = matches[0];
      if (!entry) {
        root.removeAttribute("aria-busy");
        root.innerHTML = '<div class="supplier-page supplier-empty"><h2 id="subject-title" tabindex="-1">Supplier not found</h2><p>This supplier is not in the current export.</p><a href="/subject/supplier">Search the supplier directory</a></div>';
        helpers.onTitle?.("Supplier not found");
        return;
      }
      if (!/^\/suppliers\/[a-z0-9-]+\.json$/.test(entry.profile_path)) throw new Error("The supplier profile reference is invalid.");
      const shard = await json(entry.profile_path, life.signal);
      if (!life.alive()) return;
      const profile = shard.profiles?.[entry.id];
      if (!profile || !Array.isArray(profile.contracts)) throw new Error("This supplier profile is not available in the current export.");
      renderProfile(root, profile, directory.meta, helpers, life);
    } catch (error) { if (life.alive()) failure(root, load, error.message); }
  }
  load();
  return { destroy: life.destroy };
}

async function mountFunding(root, links, life) {
  root.hidden = false;
  root.innerHTML = '<h3 class="subject-section-title">Also in the funding record</h3><p role="status">Opening the linked funding records…</p>';
  try {
    const data = await json("/graph/money.json?v=suppliers-1", life.signal);
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
    root.innerHTML = `<h3 class="subject-section-title">Also in the funding record</h3><p class="supplier-section-note">Party receipts linked to this supplier’s recorded identity, from the money map’s selected donor data${yearSpan ? ` (${yearSpan})` : ""}. These totals cover a different set of records and dates from the contracts above.</p>${rows.length ? `<ol class="supplier-bars">${rows.map((row) => `<li><div><a href="/subject/party/${encodeURIComponent(row.name)}">${esc(row.name)}</a><strong>${currency(row.total)}</strong></div><svg viewBox="0 0 100 5" preserveAspectRatio="none" aria-hidden="true"><rect width="100" height="5" class="supplier-bar-track"/><rect width="${(row.total / max * 100).toFixed(2)}" height="5" class="supplier-bar-fill"/></svg><small>${number(row.count)} recorded receipts</small></li>`).join("")}</ol>` : matchedNodes.length ? `<p><strong>${currency(nodeTotal)}</strong> across ${number(nodeCount)} recorded receipts${yearSpan ? ` (${yearSpan})` : ""}. The party breakdown is not available in this map export.</p>` : "<p>This linked donor is not present in the current map export.</p>"}${matchedNodes.length ? '<button type="button" class="supplier-button supplier-map-toggle">Explore the money map</button><div class="supplier-money-map" hidden></div>' : ""}<p class="fineprint">A connection between records does not establish influence over a contract award. ${links.map((link) => `${esc(link.name)}: ${esc(identityMethod(link.method))}.`).join(" ")}</p>`;
    root.querySelector(".supplier-map-toggle")?.addEventListener("click", async (event) => {
      const button = event.currentTarget;
      const slot = root.querySelector(".supplier-money-map");
      button.disabled = true;
      slot.hidden = false;
      slot.innerHTML = '<p role="status">Opening the money map…</p>';
      try {
        const { mountMoneyMap } = await import("/money-map.js?v=suppliers-1");
        if (!life.alive()) return;
        slot.textContent = "";
        const handle = await mountMoneyMap(slot, "/graph/money.json?v=suppliers-1", { focus: links[0].id, chrome: "mini", reveal: true, openCard: false });
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
    if (life.alive()) root.innerHTML = '<h3 class="subject-section-title">Also in the funding record</h3><p>The funding chart could not be loaded. The linked donor profiles remain available alongside.</p>';
  }
}
