import { fileKey, formatABN, kindLabel, grantRecipientUrl, donorBlocs, govShare } from './grants.js?v=recipient-pages-20260913';

const MONEY = new Intl.NumberFormat('en-AU', { style: 'currency', currency: 'AUD', maximumFractionDigits: 0 });
const NUMBER = new Intl.NumberFormat('en-AU');
const JURISDICTIONS = { federal: 'Commonwealth', qld: 'Queensland' };
const SOURCES = { federal: 'https://www.grants.gov.au/', qld: 'https://www.data.qld.gov.au/dataset/queensland-government-investment-portal-expenditure' };
const REGISTERS = { qld: 'Queensland electoral returns', vic: 'Victorian electoral returns', tas: 'Tasmanian electoral returns' };
const money = value => MONEY.format(Number(value) || 0);
const node = (tag, text, className) => {
  const element = document.createElement(tag);
  if (text != null) element.textContent = String(text);
  if (className) element.className = className;
  return element;
};
const link = (href, text, className) => {
  const element = node('a', text, className); element.href = href; return element;
};
const section = (title, id) => {
  const element = node('section', null, 'grant-recipient-section'); element.id = id;
  const heading = node('h2', title); element.append(heading); return element;
};
function definitionList(entries) {
  const list = node('dl', null, 'grant-recipient-facts');
  for (const [label, value] of entries) {
    if (value == null || value === '') continue;
    const row = node('div'); row.append(node('dt', label), node('dd', value)); list.append(row);
  }
  return list;
}
function valueTable(title, rows, nameFor = value => node('span', value)) {
  const table = node('table', null, 'grant-recipient-table');
  table.append(node('caption', title));
  const head = node('thead'), hr = node('tr');
  for (const label of ['Record', 'Value (AUD)']) { const th = node('th', label); th.scope = 'col'; hr.append(th); }
  head.append(hr); table.append(head);
  const body = node('tbody');
  for (const [name, value] of rows) {
    const row = node('tr'), th = node('th'), td = node('td', money(value));
    th.scope = 'row'; th.append(nameFor(name)); row.append(th, td); body.append(row);
  }
  table.append(body); return table;
}
function financialYears(years, title = 'Value by financial year') {
  const table = node('table', null, 'grant-recipient-table'); table.append(node('caption', title));
  const head = node('thead'), hr = node('tr');
  for (const label of ['Financial year', 'Value (AUD)', 'Records']) { const th = node('th', label); th.scope = 'col'; hr.append(th); }
  head.append(hr); table.append(head);
  const body = node('tbody');
  for (const [year, [value, count]] of Object.entries(years).sort(([a], [b]) => b.localeCompare(a))) {
    const row = node('tr'), th = node('th', year); th.scope = 'row';
    row.append(th, node('td', money(value)), node('td', NUMBER.format(count))); body.append(row);
  }
  table.append(body); return table;
}
function donorYears(years) {
  const rows = [];
  for (const [party, entries] of Object.entries(years || {})) for (const [year, value] of Object.entries(entries)) rows.push([`${year} · ${party}`, value]);
  return rows.sort(([a], [b]) => b.localeCompare(a));
}
export function recipientProgramMatches(programs, label) {
  return (programs || []).filter(program => program.key && (program.n === label || program.id === label));
}
export function recipientSourceUrl(jurisdiction, grant) {
  if (jurisdiction !== 'federal') return SOURCES.qld;
  return grant.guid ? `https://www.grants.gov.au/Ga/Show/${encodeURIComponent(grant.guid)}`
    : `https://www.grants.gov.au/Ga/ListResult?Type=Ga&AgencyStatus=-1&GaId=${encodeURIComponent(grant.id || '')}`;
}

export function mountGrantRecipient(container, { jurisdiction, id, onTitle = () => {}, manageFocus = false }) {
  const aborter = new AbortController();
  let destroyed = false, downloadUrl;
  const root = node('article', null, 'grant-recipient-page');
  root.setAttribute('aria-busy', 'true');
  const skeleton = container.querySelector('.grant-recipient-page');
  if (skeleton) root.append(...skeleton.childNodes); else root.append(node('p', 'Loading recipient records…', 'status'));
  container.replaceChildren(root);
  const alive = () => !destroyed && root.isConnected;
  const get = async path => {
    const response = await fetch(path, { signal: aborter.signal });
    if (!response.ok) throw new Error(response.status === 404 ? 'not-found' : 'unavailable');
    return response.json();
  };
  const programReference = (programs, label) => {
    const matches = recipientProgramMatches(programs, label);
    if (!matches.length) return node('span', label);
    if (matches.length === 1) return link(`/money/grants?${new URLSearchParams({ jur: jurisdiction, program: matches[0].id })}`, label);
    const group = node('span', null, 'grant-recipient-program-options'); group.append(node('span', label));
    for (const match of matches) group.append(link(`/money/grants?${new URLSearchParams({ jur: jurisdiction, program: match.id })}`, `Program ${match.id}`));
    return group;
  };
  function render(data, index) {
    root.replaceChildren(); root.removeAttribute('aria-busy');
    const qld = jurisdiction === 'qld', recordNoun = qld ? 'expenditure rows' : 'award records';
    const header = node('div', null, 'grant-recipient-header');
    header.append(node('p', `${JURISDICTIONS[jurisdiction]} · ${kindLabel(data.k)}`, 'grant-recipient-kicker'));
    const title = node('h1', data.n); title.tabIndex = -1; header.append(title);
    header.append(node('p', qld
      ? 'Published annual expenditure, including grants, service agreements and other assistance.'
      : 'Published Commonwealth grant awards. Award values do not establish payments received.', 'grant-recipient-intro'));
    const actions = node('nav', null, 'grant-recipient-actions'); actions.setAttribute('aria-label', 'Recipient actions');
    actions.append(link(`/search?q=${encodeURIComponent('"' + data.n + '"')}`, 'Search parliamentary records'));
    if (data.d) actions.append(link(`/subject/donor/${encodeURIComponent(data.d.n)}`, 'View donor profile'));
    downloadUrl = URL.createObjectURL(new Blob([JSON.stringify({ ...data, source_url: SOURCES[jurisdiction], source_meta: index.meta }, null, 2)], { type: 'application/json' }));
    const download = link(downloadUrl, 'Download recipient data'); download.download = `${jurisdiction}-${fileKey(id)}.json`; actions.append(download);
    header.append(actions); root.append(header);
    const metrics = node('dl', null, 'grant-recipient-metrics');
    for (const [label, value] of [[qld ? 'Published expenditure' : 'Published award value', money(data.t)], [recordNoun, NUMBER.format(data.c)], ['Financial years', data.y0 === data.y1 ? data.y0 : `${data.y0 || '—'} to ${data.y1 || '—'}`]]) {
      const item = node('div'); item.append(node('dt', label), node('dd', value)); metrics.append(item);
    }
    root.append(metrics);
    const jump = node('nav', null, 'grant-recipient-jump'); jump.setAttribute('aria-label', 'On this recipient page');
    for (const [label, anchor] of [['Records', 'recipient-records'], ['Breakdown', 'recipient-breakdown'], ['Identity', 'recipient-identity'], ['Donor registers', 'recipient-donations'], ['Sources', 'recipient-sources']]) jump.append(link('#' + anchor, label));
    root.append(jump);
    const layout = node('div', null, 'grant-recipient-layout'), main = node('div'), aside = node('aside');
    const records = section(qld ? 'Expenditure records' : 'Grant awards', 'recipient-records');
    const grants = Array.isArray(data.grants) ? data.grants : [];
    const omitted = Math.max(Number(data.more) || 0, Number(data.c) - grants.length);
    records.append(node('p', omitted > 0
      ? `The ${NUMBER.format(grants.length)} largest of ${NUMBER.format(data.c)} ${recordNoun} are published in this recipient file. ${NUMBER.format(omitted)} further rows are included in the total but are not available individually here.`
      : `All ${NUMBER.format(grants.length)} ${recordNoun} in this recipient file, largest value first.`, 'grant-recipient-note'));
    let page = 0;
    const list = node('ol', null, 'grant-recipient-records'), pagination = node('nav', null, 'grant-recipient-pagination');
    pagination.setAttribute('aria-label', 'Recipient record pages');
    function renderRecords(focus = false) {
      list.replaceChildren(); list.start = page * 20 + 1;
      for (const grant of grants.slice(page * 20, page * 20 + 20)) {
        const item = node('li'), heading = node('div', null, 'grant-recipient-record-heading');
        heading.append(node('h3', grant.n || grant.pr || grant.id), node('strong', money(grant.v)));
        item.append(heading);
        if (grant.desc) item.append(node('p', grant.desc, 'grant-recipient-description'));
        const metadata = [grant.ag, grant.cat].filter(Boolean);
        if (metadata.length) item.append(node('p', metadata.join(' · '), 'grant-recipient-note'));
        if (grant.pr && grant.pr !== grant.n) { const p = node('p', null, 'grant-recipient-note'); p.append(programReference(index.programs, grant.pr)); item.append(p); }
        item.append(definitionList([['Record', grant.id], ['Financial year', grant.fy], ['Start date', grant.s], ['Approval date', grant.a], ['Selection process', grant.sel], ['Electorate', grant.el], ['Ad hoc / one-off', grant.adhoc ? 'Yes' : null]]));
        const source = link(recipientSourceUrl(jurisdiction, grant), qld ? 'View source dataset' : grant.guid ? 'View original award' : `Find ${grant.id} on GrantConnect`, 'grant-recipient-source-link');
        source.target = '_blank'; source.rel = 'noopener'; item.append(source);
        if (qld || !grant.guid) item.append(node('p', qld ? 'Dataset provenance; an individual record link is not published.' : 'A direct award link is not available; this opens an award-ID search.', 'grant-recipient-source-note'));
        list.append(item);
      }
      pagination.replaceChildren();
      if (grants.length > 20) {
        const previous = node('button', 'Previous'), next = node('button', 'Next'); previous.type = next.type = 'button';
        previous.disabled = page === 0; next.disabled = (page + 1) * 20 >= grants.length;
        const status = node('span', `${page * 20 + 1}–${Math.min((page + 1) * 20, grants.length)} of ${grants.length} listed records`); status.setAttribute('aria-live', 'polite');
        previous.addEventListener('click', () => { page--; renderRecords(true); }); next.addEventListener('click', () => { page++; renderRecords(true); });
        pagination.append(previous, status, next);
      }
      if (focus) { const heading = list.querySelector('h3'); if (heading) { heading.tabIndex = -1; heading.focus({ preventScroll: true }); heading.scrollIntoView({ block: 'start' }); } }
    }
    renderRecords(); records.append(list, pagination); main.append(records);
    const breakdown = section('Funding breakdown', 'recipient-breakdown');
    breakdown.append(node('p', 'Agency, program and electorate lists are the largest entries published in this file. They can be partial and should not be added together as a complete total.', 'grant-recipient-note'));
    if (Object.keys(data.by || {}).length) breakdown.append(financialYears(data.by, qld ? 'Expenditure by financial year' : 'Award value by financial year'));
    if (data.agencies?.length) breakdown.append(valueTable('By agency', data.agencies));
    if (data.programs?.length) {
      breakdown.append(valueTable('By program', data.programs, label => programReference(index.programs, label)));
      breakdown.append(node('p', 'Program links match published catalog labels. Check the program records to confirm membership; a matching label alone is not proof.', 'grant-recipient-note'));
    }
    if (Object.keys(data.sel || {}).length) breakdown.append(valueTable('Selection process, where recorded', Object.entries(data.sel)));
    if (data.el?.length) breakdown.append(valueTable('By federal electorate, where recorded', data.el));
    breakdown.append(definitionList([['Ad hoc / one-off value', money(data.adhoc)], ['Share of total', data.t > 0 ? `${((Number(data.adhoc) || 0) / data.t * 100).toFixed(1)}%` : '—']]));
    main.append(breakdown);
    const identity = section('Recipient identity', 'recipient-identity');
    identity.append(definitionList([['Recipient kind', kindLabel(data.k)], ['ABN', data.abn ? formatABN(data.abn) : 'Not published'], ['ABN source', data.abn_method === 'source' ? 'Published source record' : null], ['Registered name', data.abr?.name], ['ABN status', data.abr?.status === 'ACT' ? 'Active' : data.abr?.status === 'CAN' ? 'Cancelled' : null], ['State', data.abr?.state], ['Postcode', data.abr?.postcode]]));
    if (data.abn) { const abr = link(`https://abr.business.gov.au/ABN/View?abn=${encodeURIComponent(data.abn)}`, 'View Australian Business Register'); abr.target = '_blank'; abr.rel = 'noopener'; identity.append(abr); }
    if (data.aliases?.length) { identity.append(node('h3', 'Names in the records')); const names = node('ul', null, 'grant-recipient-aliases'); for (const alias of data.aliases) names.append(node('li', alias)); identity.append(names); }
    aside.append(identity);
    const donations = section('In the donor registers', 'recipient-donations');
    if (data.d) {
      const donor = data.d;
      const matched = node('p'); matched.append(document.createTextNode('Listed as '), link(`/subject/donor/${encodeURIComponent(donor.n)}`, donor.n), document.createTextNode('.')); donations.append(matched);
      donations.append(definitionList([['Matched by', donor.m === 'abn' ? 'ABN' : donor.m === 'abr_name' ? 'Registered business name' : 'Organisation name'], ['Matched name / identifier', donor.on]]));
      if (donor.aec > 0) {
        donations.append(node('h3', 'AEC returns'), node('p', `${money(donor.aec)} disclosed${donor.y0 ? `, ${donor.y0}–${donor.y1 || donor.y0}` : ''}.`));
        donations.append(valueTable('Disclosed by party', Object.entries(donor.p || {}).sort((a,b) => b[1] - a[1]), name => link(`/subject/party/${encodeURIComponent(name)}`, name)));
        const years = donorYears(donor.py); if (years.length) donations.append(valueTable('AEC party returns by year', years));
      }
      for (const [jur, register] of Object.entries(donor.st || {})) {
        donations.append(node('h3', REGISTERS[jur] || jur), node('p', `${money(register.t)} in ${NUMBER.format(register.c || 0)} gifts.`));
        donations.append(valueTable('Disclosed by party', Object.entries(register.p || {}).sort((a,b) => b[1] - a[1]), name => link(`/subject/party/${encodeURIComponent(name)}`, name)));
        const years = donorYears(register.py); if (years.length) donations.append(valueTable('State party returns by year', years));
      }
      if (!(donor.aec > 0) && !Object.keys(donor.st || {}).length) donations.append(node('p', 'Listed in the register, with no gifts to a party in the exposed returns.'));
      if (!qld) {
        const blocs = donorBlocs(donor, index.meta?.blocs || {});
        if (blocs.size) {
          const timing = govShare(grants, index.meta?.government || [], new Set(blocs.keys()));
          donations.append(node('p', `${(timing.share * 100).toFixed(1)}% of the award value listed on this page (${money(timing.dollars)}) has a start date, or financial-year proxy, when a party this organisation has given to was in government. This describes timing only, not influence or preferential treatment.`, 'grant-recipient-note'));
        }
      }
      donations.append(node('p', 'AEC and state figures are shown separately because AEC returns include state branch receipts. Recorded donations and grants do not establish influence.', 'grant-recipient-note'));
    } else donations.append(node('p', data.k === 'individual' ? 'People are never matched to donor registers by name.' : ['government', 'council', 'university'].includes(data.k) ? 'Public bodies are not matched to donor registers.' : 'No match was found under this name or ABN. Donations below disclosure thresholds are not reported, so this is not evidence of no donations.'));
    aside.append(donations);
    if (data.other && JURISDICTIONS[data.other.jur]) {
      const other = section('Other jurisdiction', 'recipient-other');
      other.append(node('p', `${money(data.other.t)} in ${NUMBER.format(data.other.c)} ${data.other.jur === 'qld' ? 'Queensland annual expenditure rows' : 'Commonwealth award records'}.`), link(grantRecipientUrl(data.other.jur, id), `View ${JURISDICTIONS[data.other.jur]} recipient page`)); aside.append(other);
    }
    const provenance = section('Sources and coverage', 'recipient-sources');
    provenance.append(node('p', qld ? 'Queensland Government Investment Portal consolidated expenditure data. A funding agreement may appear once in each financial year paid. Counts are expenditure rows, not distinct grants.' : 'GrantConnect published awards, using current varied values where available. An aggregate award can cover multiple recipients. Values are not evidence of payments received.'));
    const original = link(SOURCES[jurisdiction], qld ? 'Open Queensland source dataset' : 'Open GrantConnect'); original.target = '_blank'; original.rel = 'noopener'; provenance.append(original);
    provenance.append(definitionList([['Coverage', index.meta?.coverage], ['Published data generated', index.meta?.generated], ['Licence', index.meta?.licence], ['Rows available here', `${grants.length} of ${data.c}`]]));
    provenance.append(node('p', 'Summaries cover the published recipient total; individual records may cover only the largest entries. Source websites can change or be temporarily unavailable.', 'grant-recipient-note')); aside.append(provenance);
    layout.append(main, aside); root.append(layout);
    onTitle(data.n);
    if (manageFocus) title.focus({ preventScroll: true });
    const anchor = document.getElementById(location.hash.slice(1));
    if (anchor && root.contains(anchor)) requestAnimationFrame(() => { if (alive()) anchor.scrollIntoView({ block: 'start' }); });
  }
  async function load() {
    try {
      if (!JURISDICTIONS[jurisdiction] || !id) throw new Error('not-found');
      const index = await get(`/graph/grants.${jurisdiction}.json`);
      const entry = index.recipients?.find(recipient => recipient.id === id);
      if (!entry || !Number.isInteger(entry.sh)) throw new Error('not-found');
      const bundle = await get(`/grants/${jurisdiction}/shard-${String(entry.sh).padStart(2, '0')}.json`);
      const data = bundle[fileKey(id)];
      if (!data || data.id !== id || typeof data.n !== 'string' || !Array.isArray(data.grants)) throw new Error('not-found');
      if (alive()) render(data, index);
    } catch (error) {
      if (!alive() || error.name === 'AbortError') return;
      root.replaceChildren(); root.removeAttribute('aria-busy');
      const heading = node('h1', error.message === 'not-found' ? 'Recipient not found' : 'Recipient records could not load'); heading.tabIndex = -1;
      const message = node('p', error.message === 'not-found' ? 'This recipient is not listed in the published file for this jurisdiction.' : 'The published records are temporarily unavailable. Try loading them again.'); message.setAttribute('role', 'alert'); root.append(heading, message);
      if (error.message !== 'not-found') { const retry = node('button', 'Try again', 'primary'); retry.type = 'button'; retry.addEventListener('click', () => { root.setAttribute('aria-busy', 'true'); retry.disabled = true; retry.textContent = 'Loading…'; load(); }); root.append(retry); }
      root.append(link('/money/grants', 'Browse government grants')); onTitle(heading.textContent);
      if (manageFocus) heading.focus({ preventScroll: true });
    }
  }
  const ready = load();
  return { ready, destroy() { destroyed = true; aborter.abort(); if (downloadUrl) URL.revokeObjectURL(downloadUrl); root.remove(); } };
}
