const esc = value => String(value ?? '').slice(0,5000).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const safeHref = value => {
  if(value.length>2048) return null;
  if(/^\/(?!\/)/.test(value)) return value;
  try { const url = new URL(value); return /^https?:$/.test(url.protocol) ? url.href : null; } catch { return null; }
};
import { isOrganisationRecipient } from "./recipient-privacy.js";
const number = (n) => n.toLocaleString("en-AU");
const amount = new Intl.NumberFormat("en-AU", { style: "currency", currency: "AUD", maximumFractionDigits: 2 });
const dollars = (n) => typeof n === "number" && Number.isFinite(n) ? amount.format(n) : "Value not recorded";
const link = (href, label) => safeHref(href) ? `<a href="${esc(href)}">${esc(label)}</a>` : esc(label);
const localPath = (canonical) => {
  const url = new URL(canonical, "https://opax.com.au");
  return url.pathname + url.search;
};
export const rowsHTML = rows => rows.map(row=>`<tr>${row.map(cell=>`<td>${cell}</td>`).join('')}</tr>`).join('');
const title = html => `<span data-record-title>${html}</span>`;
const details = (entries, passage) => passage || entries.some(([,value])=>value != null && value !== '')
  ? `<details><summary>Record details</summary>${passage ? `<p>${esc(passage)}</p>` : ''}${entries.filter(([,value])=>value != null && value !== '').map(([label,value])=>`<p>${esc(label)}: ${esc(value)}</p>`).join('')}</details>` : '';
const options = {
  recipient: ['Find a record', 'recipient-record-query'],
  program: ['Find a record', 'program-record-query'],
  'agency-suppliers': ['Find a supplier', 'agency-supplier-query'],
  'agency-contracts': ['Filter contracts', 'agency-contract-query'],
  topic: ['Find a speech', 'topic-record-query'],
};
const supplierSorts = [['value_desc','Highest value'],['value_asc','Lowest value'],['count_desc','Most contracts'],['count_asc','Fewest contracts'],['name_asc','Name A–Z'],['name_desc','Name Z–A']];
const table = (kind, id, caption, headings, rows) => {
  const [label, name] = options[kind];
  const sorts = kind === 'topic' ? [['newest','Newest'],['oldest','Oldest']] : kind === 'agency-suppliers' ? supplierSorts : [];
  return `<section data-record-list="${kind}" data-record-id="${esc(id)}" id="${kind === 'recipient' ? 'recipient-records' : kind === 'program' ? 'program-records' : kind === 'topic' ? 'topic-records' : kind}">
    <div class="ui-toolbar record-core-tools"><label class="ui-field">${label}<input class="ui-input" name="${name}" type="search" disabled></label>${sorts.length ? `<label class="ui-field">Sort by<select class="ui-input" disabled>${sorts.map(([value,label])=>`<option value="${value}">${label}</option>`).join('')}</select></label>` : ''}
    <nav aria-label="${esc(caption)} pages" class="record-core-pages"><button class="ui-button" type="button" data-record-previous disabled>Previous</button><span role="status">Showing ${rows.length ? '1–'+rows.length : '0'} listed records</span><button class="ui-button" type="button" data-record-next disabled>Next</button></nav></div>
    <div class="record-core-scroll"><table><caption>${esc(caption)}</caption><thead><tr>${headings.map(h=>`<th scope="col">${esc(h)}</th>`).join('')}</tr></thead><tbody>${rowsHTML(rows)}</tbody></table></div></section>`;
};
// These row builders run on the Worker and after a reader filters or pages the
// same table. Initial hydration only attaches listeners; it never clears rows.
export function grantRows(grants, detail, jur, program) {
  return grants.map(g=>[
    title(esc(g.n || g.id)) + (g.n ? `<small>${esc(g.id)}</small>` : '') + details([
      ['Category',g.cat],['Approval date',g.a],['Selection process',g.sel],['Electorate',g.el],['Ad hoc / one-off',g.adhoc ? 'Yes' : null],
      ['Seat held by',g.holder?.join(' · ')],
    ],g.desc),
    program ? g.rid && isOrganisationRecipient(g) ? link(`/money/grants/${jur}/recipient/${encodeURIComponent(g.rid)}`,g.rn || g.rid) : 'Recipient not publicly named' : esc(g.pr || ''),
    esc(dollars(g.v)),esc([g.s,g.fy].filter(Boolean).join(' · ')),esc(g.ag || detail.ag || ''),link(grantSource(jur,g),jur === 'qld' ? 'Source dataset' : 'Original award'),
  ]);
}
export const supplierRows = rows => rows.map(s=>[title(link(`/subject/supplier/${encodeURIComponent(s.id)}`,s.name))+details([['ABN',s.abn],['Registered name',s.identity?.legal_name],['ABR type',s.identity?.type]]),esc(dollars(s.total)),esc(number(s.count))]);
export const contractRows = rows => rows.map(c=>[title(esc(c.title || c.id))+details([['End date',c.end_date],['Procurement method',c.procurement_method]],c.description),c.supplier_id ? link(`/subject/supplier/${encodeURIComponent(c.supplier_id)}`,c.supplier || c.supplier_id) : esc(c.supplier || ''),esc(dollars(c.amount)),esc(c.start_date || ''),link(c.url || '',c.id)]);
export const topicRows = rows => rows.map(s=>[title(link('/doc/'+encodeURIComponent(s.slug),s.title || s.slug))+details([],s.snippet),esc(s.speaker || ''),esc(s.date?.slice(0,10) || ''),safeHref(s.source_url || s.url || '') ? link(s.source_url || s.url || '','Official record') : 'Source link not recorded']);
const KIND_LABELS = {
  company: 'Company', association: 'Association / not-for-profit', trust: 'Trust',
  partnership: 'Partnership', 'co-operative': 'Co-operative', council: 'Local council',
  government: 'Government body', university: 'University / TAFE', 'health service': 'Health service',
  'super fund': 'Super fund', union: 'Union', individual: 'Individual', undisclosed: 'Not disclosed',
  other: 'Other',
}
/** A grant recipient's kind in words ("Company"); the client page and the Worker's record core share it. */
export function kindLabel(k) {
  return KIND_LABELS[k] || (k ? k.charAt(0).toUpperCase() + k.slice(1) : 'Other');
}
const JURISDICTION_NAMES = { federal: 'Commonwealth', qld: 'Queensland' };
/** The meta line under a recipient's title: "Commonwealth · Company". */
export function recipientMetaLine(jur, k) {
  return `${JURISDICTION_NAMES[jur] || 'Commonwealth'} · ${kindLabel(k)}`;
}
const figures = (rows) => `<dl class="record-core-figures">${rows.map(([label, value]) => `<div><dt>${esc(label)}</dt><dd>${esc(value)}</dd></div>`).join("")}</dl>`;
const grantSource = (jur, grant) => jur === "qld" ? "https://www.data.qld.gov.au/dataset/b102c881-2c7f-484a-a8b6-b056fe318964" : grant?.guid ? `https://www.grants.gov.au/Ga/Show/${encodeURIComponent(grant.guid)}` : grant ? `https://www.grants.gov.au/Ga/ListResult?Type=Ga&AgencyStatus=-1&GaId=${encodeURIComponent(grant.id)}` : "https://www.grants.gov.au/";
function grantCoreBody(detail, jur, canonical, program = false, dataPath) {
  const rows = (detail.grants || []).slice(0, 20);
  const countLabel = jur === "qld" ? "Expenditure rows" : "Award records";
  let body = figures([
    [jur === "qld" ? "Recorded expenditure" : "Published award value", dollars(detail.t)],
    [countLabel, number(detail.c)],
    ...detail.r != null ? [["Recipients", number(detail.r)]] : []
  ]);
  if (detail.ag) body += `<p>Agency: ${esc(detail.ag)}</p>`;
  body += table(program ? 'program' : 'recipient',detail.id,jur === 'qld' ? 'Recorded expenditure' : 'Grant awards',['Record',program ? 'Recipient' : 'Program','Value','Date / financial year','Agency','Source'],grantRows(rows,detail,jur,program));
  const listed = detail.grants?.length || 0;
  body += `<p>${number(listed)} listed records; ${number(detail.c)} ${countLabel.toLowerCase()} in the total. ${link(localPath(canonical) + "#" + (program ? "program-records" : "recipient-records"), "Explore the full list")}.</p>`;
  if (dataPath) body += `<p>${link(dataPath, "Read the full exported list (JSON)")}</p>`;
  body += `<p class="source-line">Source: ${link(grantSource(jur), jur === "qld" ? "Queensland Government Investment Portal" : "GrantConnect, Department of Finance")}. ${jur === "qld" ? "A multi-year funding agreement can appear in several financial years; rows are not distinct grants." : "Published award values do not establish payments received."}</p>`;
  return body;
}
const supplierNames = new Intl.Collator("en-AU", { sensitivity: "base", numeric: true });
function firstAgencySuppliers(suppliers) {
  return [...suppliers].sort((a, b) => b.total - a.total || supplierNames.compare(a.name, b.name) || a.id.localeCompare(b.id)).slice(0, 20);
}
function agencyCoreBody(profile, canonical, meta) {
  const suppliers = firstAgencySuppliers(profile.suppliers);
  const contracts = profile.contracts.filter((c) => !((!c.start_date || !/^\d{4}-\d{2}-\d{2}/.test(c.start_date) || Number(c.start_date.slice(0, 4)) <= 1900) && !(Number(c.amount) > 0))).slice(0, 20);
  return figures([["Recorded contract value", dollars(profile.total)], ["Contracts", number(profile.count)], ["Suppliers", number(profile.supplier_count ?? profile.suppliers.length)]]) + table('agency-suppliers',profile.id,'Who receives the contracts',['Supplier','Recorded value','Contracts'],supplierRows(suppliers)) + table('agency-contracts',profile.id,'The contract record',['Contract','Supplier','Value','Start date','Source'],contractRows(contracts)) + `<p>${link(`/agencies/${profile.id}.json`, "Read the full exported lists (JSON)")}</p><p>${link(localPath(canonical) + "#agency-suppliers", "Explore all suppliers")} \xB7 ${link(localPath(canonical) + "#agency-contracts", "Explore the full contract list")}</p><p class="source-line">Source: ${link(meta?.source_url || "https://www.tenders.gov.au/", meta?.source || "AusTender, Department of Finance")}. Award values are not expenditure. Agency names remain separate as recorded.</p>`;
}
function topicSummary(name, counts) {
  return `${name}: ${number(counts.count)} speeches carry this label so far, of ${number(counts.labelled)} speeches labelled to date. Not every speech has a topic label yet, so this count is a floor.`;
}
function topicCoreBody(slug, counts, speeches, dataPath) {
  const phrase = dataPath ? new URL(dataPath, "https://opax.com.au").searchParams.get("q") || slug : slug;
  const search = "/ask?" + new URLSearchParams({ view: "search", q: phrase, kind: "speech", topic: slug, sort: "newest" });
  return figures([["Speeches labelled with this topic", number(counts.count)], ["Speeches labelled to date", number(counts.labelled)]]) + table('topic',slug,'Newest retrieved speeches',['Speech','Speaker','Date','Source'],topicRows(speeches.filter(s=>s.slug).slice(0,20))) + `<p>${link(search, "Explore the full speech list")}${dataPath ? " \xB7 " + link(dataPath, "Read retrieved speeches (JSON)") : ""}</p><p class="source-line">Source: the parliamentary records linked above. Topic labels are machine applied. This list is the newest part of the retrieved search window.</p>`;
}
export {
  agencyCoreBody,
  firstAgencySuppliers,
  grantCoreBody,
  grantSource,
  topicCoreBody,
  topicSummary
};
