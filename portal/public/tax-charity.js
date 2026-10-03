/* Charity and tax-transparency block for an organisation's page.

   Reads /entities/tax-charity/ (scripts/export_tax_charity.py): index.json (sources, licences,
   caveat sentences), one shard per last two digits of the ABN, and names.json (donor labels to ABNs,
   fetched only when a page knows a name and not an ABN).

   Three publishers, each attributed on the page with its licence and a link to its record:
     ACNC Charity Register   registered charity, size, PBI / HPC
     ACNC AIS                revenue and revenue from government, as the charity reported it
     ATO Corporate Tax Transparency   total income, taxable income, tax payable, as the ATO published

   Wording: the ATO figures are shown neutrally and never summarised as a rate or a verdict. "Tax
   payable" is not "tax paid", a blank is the ATO's "zero or less", and the ATO's own caveat sits
   under the figures. No dependencies; the host page mounts it and it removes its slot when there is
   nothing to show. */

import { shortDate, shortMoney } from "./format.js";

const BASE = "/entities/tax-charity";
const esc = (value) => String(value ?? "").replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]);
const safeUrl = (value) => (typeof value === "string" && /^https:\/\//i.test(value) ? value : null);
const abnOf = (value) => { const d = String(value ?? "").replace(/\D/g, ""); return d.length === 11 ? d : null; };
/** Same folding as normName() in app.js, so a donor label finds its key. */
export function normName(x) {
  return String(x || "").toLowerCase().replace(/[^a-z0-9]+/g, " ")
    .replace(/\b(pty|ltd|limited|the|inc|co|holdings)\b/g, "").replace(/\s+/g, " ").trim();
}
export const shardOf = (abn) => String(abn).slice(-2);

const EXACT = new Intl.NumberFormat("en-AU", { style: "currency", currency: "AUD", maximumFractionDigits: 0 });
/** "$1.40B", with the exact dollars in the tooltip. */
const money = (value) => `<span title="${esc(EXACT.format(value))}">${esc(shortMoney(value))}</span>`;
/** A year's filed figure in the table, to the dollar. */
const dollars = (value) => esc(EXACT.format(value));
const day = (iso) => {
  if (!/^\d{4}-\d{2}-\d{2}/.test(iso || "")) return "";
  return shortDate(iso);
};

/** Government's share of a charity's revenue, from the two AIS figures; null when it cannot be stated. */
export function govShare(ais) {
  if (!ais || !(ais.rev > 0) || ais.gov == null) return null;
  const share = ais.gov / ais.rev;
  const pct = share > 0 && share < 0.005 ? "under 1%" : `${Math.round(share * 100)}%`;
  return { share, pct };
}

// ── loading ──────────────────────────────────────────────────────────────────

let indexPromise = null;
let namesPromise = null;
const shardPromises = new Map();
const getJson = (url) => fetch(url).then((r) => (r.ok ? r.json() : null)).catch(() => null);
export function loadIndex() { indexPromise ??= getJson(`${BASE}/index.json`); return indexPromise; }
export function loadNames() { namesPromise ??= getJson(`${BASE}/names.json`); return namesPromise; }
export function loadShard(abn) {
  const key = shardOf(abn);
  if (!shardPromises.has(key)) shardPromises.set(key, getJson(`${BASE}/${key}.json`));
  return shardPromises.get(key);
}
/** The record for one ABN, or null. */
export async function loadRecord(abn) {
  const a = abnOf(abn);
  if (!a) return null;
  const shard = await loadShard(a);
  return shard?.[a] || null;
}
/** ABN for a donor name, only through the exporter's exact-normalised-name index (ambiguous names are absent). */
export async function abnForName(name) {
  const names = await loadNames();
  return names?.by_name?.[normName(name)] || null;
}

// ── rendering ────────────────────────────────────────────────────────────────

const link = (href, text) => (safeUrl(href) ? `<a href="${esc(href)}" rel="noopener" target="_blank">${esc(text)}&nbsp;↗︎</a>` : "");
const yearOf = (row) => row?.y;

function charityRows(rec, meta, abn) {
  const c = rec.c;
  const ais = (rec.a || [])[0];
  const reg = meta?.sources?.register || {};
  const rows = [];
  const registerLink = link(`https://www.acnc.gov.au/charity/charities?search=${encodeURIComponent(abn)}`, "ACNC Charity Register");
  if (c) {
    const facts = [c.sz ? `${c.sz} charity` : "Registered charity", c.pbi ? "Public Benevolent Institution (PBI)" : "", c.hpc ? "Health Promotion Charity (HPC)" : "",
      c.reg ? `registered ${day(c.reg)}` : ""].filter(Boolean);
    rows.push(["Charity", `${esc(facts.join(" · "))}${c.n ? `<span class="tc-sub">ACNC name: ${esc(c.n)}</span>` : ""}${registerLink ? `<span class="tc-sub">${registerLink}</span>` : ""}`]);
  } else if (ais) {
    // A charity whose registration has ended still has its AIS rows: say what the dataset says, no more.
    const status = ais.rs || "Registered";
    rows.push(["Charity", `In the ACNC ${esc(ais.y)} Annual Information Statement dataset (status there: ${esc(status)}). Not in the current Charity Register dataset.${ais.n ? `<span class="tc-sub">ACNC name: ${esc(ais.n)}</span>` : ""}${registerLink ? `<span class="tc-sub">${registerLink}</span>` : ""}`]);
  }
  if (ais) {
    const share = govShare(ais);
    const period = ais.to ? `year to ${day(ais.to)}` : `AIS ${ais.y}`;
    let text;
    if (ais.rev == null) {
      text = ais.rel ? "A basic religious charity: no financial information is reported to the ACNC." : `The AIS dataset publishes no financial figures for ${esc(ais.y)}.`;
    } else if (ais.rev === 0) {
      text = `The dataset shows $0 revenue (${esc(period)}).`;   // a reported zero and no figure look alike in the AIS dataset
    } else {
      text = `${money(ais.rev)} revenue (${esc(period)})${ais.gov != null ? `, of which ${money(ais.gov)}${share ? ` (${esc(share.pct)})` : ""} from government` : ""}${ais.don ? `; ${money(ais.don)} donations and bequests` : ""}.`;
    }
    const earlier = (rec.a || []).slice(1).filter((r) => r.rev != null);
    const more = earlier.length ? `<details class="tc-more"><summary>Earlier years</summary><ul>${earlier.map((r) => {
      const s = govShare(r);
      return `<li>AIS ${esc(r.y)}: ${money(r.rev)} revenue${r.gov != null ? `, ${money(r.gov)}${s ? ` (${esc(s.pct)})` : ""} from government` : ""}</li>`;
    }).join("")}</ul></details>` : "";
    rows.push([`AIS ${esc(ais.y)}`, `${text}${more}`]);
  }
  return { rows, reg };
}

function atoRows(rec, meta) {
  const years = rec.t || [];
  if (!years.length) return [];
  const t = years[0];
  const src = meta?.sources?.ato?.years?.[t.y] || {};
  const blank = `<span class="tc-blank" title="The ATO leaves a field blank when the amount is zero or less">blank</span>`;
  let text;
  if (t.inc == null && t.prrt != null) {
    text = `Petroleum resource rent tax payable ${money(t.prrt)}. Listed on the ATO's PRRT tab; no income tax entry that year.`;
  } else {
    text = [`Total income ${t.inc != null ? money(t.inc) : blank}`,
      `taxable income ${t.tax != null ? money(t.tax) : blank}`,
      `tax payable ${t.pay != null ? money(t.pay) : blank}`,
      t.prrt != null ? `PRRT payable ${money(t.prrt)}` : ""].filter(Boolean).join(" · ");
  }
  const latestNote = t.y !== meta?.sources?.ato?.latest_year && meta?.sources?.ato?.latest_year ? `<span class="tc-sub">The latest year listed under this ABN. The ${esc(meta.sources.ato.latest_year)} report has no entry under it.</span>` : "";
  const older = years.slice(1);
  const table = older.length ? `<details class="tc-more"><summary>Earlier years</summary><div class="table-scroll" role="region" tabindex="0" aria-label="Earlier years (scrollable)"><table class="tc-table"><thead><tr><th scope="col">Income year</th><th scope="col">Total income</th><th scope="col">Taxable income</th><th scope="col">Tax payable</th></tr></thead><tbody>${older.map((r) =>
    `<tr><th scope="row">${esc(r.y)}</th><td>${r.inc != null ? dollars(r.inc) : blank}</td><td>${r.tax != null ? dollars(r.tax) : blank}</td><td>${r.pay != null ? dollars(r.pay) : blank}</td></tr>`).join("")}</tbody></table></div></details>` : "";
  // The earlier years go in a row of their own, across the whole block: beside the label
  // there is no room for three exact figures side by side.
  return [[`ATO ${esc(t.y)}`, `${text}${rec.tn ? `<span class="tc-sub">ATO name: ${esc(rec.tn)}</span>` : ""}${latestNote}`, src, table]];
}

/** The block's HTML for one record; "" when there is nothing to show. */
export function taxCharityHTML(rec, meta, { abn } = {}) {
  if (!rec || (!rec.c && !rec.a?.length && !rec.t?.length)) return "";
  const a = abnOf(abn) || "";
  const { rows: charity } = charityRows(rec, meta, a);
  const ato = atoRows(rec, meta);
  const rowsHtml = [...charity.map(([k, v]) => [k, v]), ...ato.map(([k, v, , wide]) => [k, v, wide])]
    .map(([k, v, wide]) => `<dt>${k}</dt><dd>${v}</dd>${wide ? `<dd class="tc-wide">${wide}</dd>` : ""}`).join("");
  if (!rowsHtml) return "";
  const s = meta?.sources || {};
  const sources = [];
  if (rec.c && s.register) sources.push(`${link(s.register.dataset_url, "ACNC Registered Charities")} (${esc(s.register.licence || "")}${s.register.snapshot_date ? `, updated ${esc(day(s.register.snapshot_date))}` : ""})`);
  const aisYear = rec.a?.[0]?.y;
  if (aisYear && s.ais?.years?.[aisYear]) { const y = s.ais.years[aisYear]; sources.push(`${link(y.dataset_url, `ACNC ${aisYear} Annual Information Statement`)} (${esc(y.licence || "")})`); }
  const atoYear = rec.t?.[0]?.y;
  if (atoYear && s.ato?.years?.[atoYear]) { const y = s.ato.years[atoYear]; sources.push(`${link(y.record_url, `ATO Corporate Tax Transparency ${atoYear}`)} (${esc(y.licence || "")})`); }
  const caveats = [];
  if (rec.t?.length && meta?.caveats?.ato) caveats.push(esc(meta.caveats.ato) + (safeUrl(s.ato?.guidance_url) ? ` ${link(s.ato.guidance_url, "ATO guidance")}` : ""));
  if (rec.a?.length && meta?.caveats?.ais) caveats.push(esc(meta.caveats.ais));
  if (rec.c && meta?.caveats?.register) caveats.push(esc(meta.caveats.register));
  return `<p class="kicker">Charity and tax transparency</p>
    <dl class="tc-facts">${rowsHtml}</dl>
    <p class="fineprint">Source: ${sources.join("; ")}. ${caveats.join(" ")}</p>`;
}

/** Fill `slot` for an organisation. `abn` when the page has one; `name` only where the page has no ABN
 *  and its name is a donor label (the exporter's exact-normalised-name index). `alive` lets the host
 *  say the reader has moved on. Removes the slot when there is nothing to show. */
export async function mountTaxCharity(slot, { abn = null, name = null, alive = () => true } = {}) {
  const drop = () => { if (slot?.remove) slot.remove(); else if (slot) slot.hidden = true; };
  try {
    const index = await loadIndex();
    if (!index?.meta || !alive()) return drop();
    const a = abnOf(abn) || (name ? abnOf(await abnForName(name)) : null);
    if (!a) return drop();
    const rec = await loadRecord(a);
    if (!alive()) return;
    const html = taxCharityHTML(rec, index.meta, { abn: a });
    if (!html) return drop();
    slot.className = `${slot.className || ""} taxcharity`.trim();
    slot.innerHTML = html;
    slot.hidden = false;
  } catch { drop(); }
}
