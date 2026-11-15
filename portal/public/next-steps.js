/* "Next in the record": the one block that names a reader's next page.
   Each row is a fact the page's own record already holds (a person, a seat, a
   division, an agency) with the address of that record's page. Nothing here is
   written by a model, ordered by judgement or fetched for the block: callers pass
   what they have loaded, in the record's own order (newest first, or largest
   recorded value first, as the source lists them).

   Text wraps; nothing is cut. A page that learns a row later (a member's latest
   votes) reserves its place with `reserve` and fills it with fillNextSteps: a held
   row keeps room for a label, two lines of link text and a line of detail, and its
   link is drawn on at most two lines (the whole title stays the link's text and its
   title attribute), so filling it moves nothing below the block. */
import { shortDate, shortMoney } from './format.js';

const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const text = (value) => String(value ?? '').replace(/\s+/g, ' ').trim();
/** Site paths and http(s) links only; anything else is not a row. */
const safe = (href) => {
  const value = String(href ?? '');
  if (!value || value.length > 2048) return '';
  if (/^\/(?!\/)/.test(value) || /^#[\w-]+$/.test(value)) return value;
  try { return /^https?:$/.test(new URL(value).protocol) ? value : ''; } catch { return ''; }
};
const plural = (n, one, many = `${one}s`) => `${(Number(n) || 0).toLocaleString('en-AU')} ${Number(n) === 1 ? one : many}`;
const day = (value) => /^\d{4}-\d{2}-\d{2}/.test(String(value || '')) && Number(String(value).slice(0, 4)) > 1900 ? shortDate(String(value).slice(0, 10)) : '';

export const NEXT_STEPS_TITLE = 'Next in the record';
export const NEXT_STEPS_MAX = 6;

/** Rows that can be drawn: a label, link text and a usable address; one row per address. */
export function nextStepRows(items = []) {
  const seen = new Set();
  const rows = [];
  for (const item of items) {
    const href = safe(item?.href), label = text(item?.text), kind = text(item?.kind);
    if (!href || !label || !kind || seen.has(href)) continue;
    seen.add(href);
    rows.push({ kind, href, text: label, meta: text(item.meta) });
  }
  return rows;
}
export function nextStepRowHTML(row, held = false) {
  return `<li class="next-steps-row${held ? ' next-steps-held' : ''}"><span class="next-steps-kind">${esc(row.kind)}</span><a class="next-steps-link" href="${esc(row.href)}" title="${esc(row.text)}">${esc(row.text)}</a><span class="next-steps-meta">${esc(row.meta)}</span></li>`;
}
const pendingRowHTML = () => '<li class="next-steps-row next-steps-held next-steps-pending" data-next-pending aria-hidden="true"><span class="next-steps-kind"></span><span class="next-steps-link"></span><span class="next-steps-meta"></span></li>';

/**
 * The block. `pageType` is the page's analytics template word (growth-modules.js moduleAttrs:
 * a click is counted as opax_module_click {module: "next", page_type}), never a record's name.
 * `reserve` holds that many rows' space for facts still loading. Empty with nothing to show.
 */
export function nextStepsHTML(items = [], { pageType = 'page', id = 'next-steps', reserve = 0, level = 2 } = {}) {
  const rows = nextStepRows(items).slice(0, NEXT_STEPS_MAX);
  const held = Math.max(0, Math.min(Number(reserve) || 0, NEXT_STEPS_MAX - rows.length));
  if (!rows.length && !held) return '';
  const h = `h${Math.min(6, Math.max(2, Number(level) || 2))}`;
  return `<nav class="next-steps" id="${esc(id)}" aria-labelledby="${esc(id)}-title" data-module="next" data-page-type="${esc(pageType)}" data-module-position="1"${held ? ' aria-busy="true"' : ''}>`
    + `<${h} class="next-steps-title" id="${esc(id)}-title">${NEXT_STEPS_TITLE}</${h}>`
    + `<ul class="next-steps-list" role="list">${rows.map(nextStepRowHTML).join('')}${pendingRowHTML().repeat(held)}</ul></nav>`;
}

/**
 * Fill the rows a block reserved. Fewer facts than places leaves the spare places empty but
 * standing (the block keeps its height); none at all says so in the first place, in `empty`'s words.
 */
export function fillNextSteps(root, items = [], empty = '') {
  if (!root) return;
  const pending = [...root.querySelectorAll('[data-next-pending]')];
  const taken = new Set([...root.querySelectorAll('a.next-steps-link')].map((a) => a.getAttribute('href')));
  const rows = nextStepRows(items).filter((row) => !taken.has(row.href)).slice(0, pending.length);
  pending.forEach((slot, index) => {
    const row = rows[index];
    if (row) { slot.outerHTML = nextStepRowHTML(row, true); return; }
    slot.removeAttribute('data-next-pending');
    slot.classList.remove('next-steps-pending');
    slot.classList.add('next-steps-spare');
    if (!rows.length && index === 0 && empty) {
      slot.removeAttribute('aria-hidden');
      // In the link's place, where two lines are held: the sentence can wrap without moving the page.
      slot.querySelector('.next-steps-link').textContent = empty;
    }
  });
  root.removeAttribute('aria-busy');
}

// ---- what each page's record offers --------------------------------------------------
// Each builder takes the record the page has already loaded and the page's own link
// helpers, and returns rows. No builder reads anything else.

/** A document: its speaker's page, their other speeches, the same debate on the same day, its bill. */
export function docNextSteps(doc, { personHref = () => '', searchHref = () => '', subject = '', attributed = undefined } = {}) {
  const rows = [];
  const kind = doc?.labels?.kind || doc?.kind;
  const date = String(doc?.metadata?.date || '').slice(0, 10);
  const billKey = String(doc?.metadata?.bill_key || '');
  if (/^[a-z0-9][a-z0-9-]{1,160}$/.test(billKey)) rows.push({ kind: 'Bill', href: `/bill/${encodeURIComponent(billKey)}`, text: text(doc.title) || 'The bill this text belongs to', meta: 'Status, stages and divisions' });
  // The caller's own attribution rule where it has one; else only a speech the record ties to one member.
  const named = Boolean(doc?.speaker) && (attributed ?? (doc.speaker_attribution !== 'unattributed'
    && !['witness', 'multi_speaker'].includes(doc?.labels?.speaker_type) && doc?.metadata?.person_id != null));
  if (named) {
    rows.push({ kind: 'Speaker', href: personHref(doc.speaker), text: doc.speaker,
      meta: [doc.labels?.party, doc.metadata?.electorate].map(text).filter(Boolean).join(' · ') || 'Votes, speeches and declared interests' });
    rows.push({ kind: 'Their speeches', href: searchHref('', { speaker: doc.speaker, kind: 'speech' }, 'newest'), text: `All speeches by ${doc.speaker}`, meta: 'Newest first' });
  }
  const debate = text(subject);
  if (debate && day(date) && kind !== 'bill_text' && kind !== 'division') rows.push({ kind: 'Same debate', href: searchHref(`"${debate.slice(0, 120)}"`, { since: date, until: date, kind: 'speech' }, 'newest'),
    text: debate, meta: `Speeches on ${day(date)}` });
  return rows;
}

/** A supplier: the agency holding the greatest recorded value with it (the figure is stated), its most
 *  recently started contract at each of two other agencies, and suppliers under the same ABN. */
export function supplierNextSteps(profile, { agencyHref = () => '', suppliers = [], contractTitle = (c) => c?.title } = {}) {
  const rows = [];
  const agencies = [...(profile?.agencies || [])].sort((a, b) => Number(b.total) - Number(a.total));
  const top = agencies[0];
  if (top?.name) rows.push({ kind: 'Awarding agency', href: agencyHref(top.name), text: top.name,
    meta: `${shortMoney(top.total)} in ${plural(top.count, 'contract')} with this supplier` });
  // Other agencies' contracts by one stated rule: the most recent recorded start date first.
  const dated = (profile?.contracts || []).filter((c) => Number(c?.amount) > 0 && c.agency && day(c.start_date))
    .sort((a, b) => String(b.start_date).localeCompare(String(a.start_date)));
  const seenAgency = new Set(top?.name ? [top.name] : []);
  for (const contract of dated) {
    if (seenAgency.has(contract.agency)) continue;
    seenAgency.add(contract.agency);
    rows.push({ kind: 'Another contract', href: agencyHref(contract.agency), text: text(contractTitle(contract)) || contract.agency,
      meta: [shortMoney(contract.amount), contract.agency, `started ${day(contract.start_date)}`].filter(Boolean).join(' · ') });
    if (seenAgency.size >= 3) break;
  }
  const abn = String(profile?.abn || '').replace(/\D/g, '');
  if (abn) for (const other of suppliers) {
    if (rows.length >= NEXT_STEPS_MAX - 1) break;
    if (!other?.id || other.id === profile.id || String(other.abn || '').replace(/\D/g, '') !== abn) continue;
    rows.push({ kind: 'Same ABN', href: `/subject/supplier/${encodeURIComponent(other.id)}`, text: other.name,
      meta: Number(other.total) > 0 ? `${shortMoney(other.total)} in recorded contracts` : 'Supplier record' });
  }
  rows.push({ kind: 'All suppliers', href: '/subject/supplier', text: 'Government suppliers', meta: 'Recorded Commonwealth contract awards' });
  return rows;
}

/** A grant recipient: the programs its awards sit under, the agencies that awarded them, its other jurisdiction's page. */
export function recipientNextSteps(data, { jurisdiction = 'federal', programs = [], money = shortMoney, otherHref = () => '', jurisdictionName = (j) => j } = {}) {
  const rows = [];
  for (const [label, value] of (data?.programs || []).slice(0, 4)) {
    // Only a label one catalogue program answers to: a shared label names many rounds, and the page lists those.
    const matches = programs.filter((p) => p?.key && (p.n === label || p.id === label));
    if (matches.length !== 1) continue;
    rows.push({ kind: 'Program', href: `/money/grants?${new URLSearchParams({ jur: jurisdiction, program: matches[0].id })}`, text: text(label).replace(/\)(?=[A-Za-z])/g, ') '),
      meta: `${money(value)} to this recipient` });
    if (rows.length >= 2) break;
  }
  for (const [name, value] of (data?.agencies || []).slice(0, 2)) {
    if (!text(name)) continue;
    rows.push({ kind: 'Agency', href: `/subject/agency?q=${encodeURIComponent(name)}`, text: name, meta: `${money(value)} to this recipient` });
  }
  if (data?.other?.jur && otherHref(data.other.jur)) rows.push({ kind: 'Other jurisdiction', href: otherHref(data.other.jur), text: `${jurisdictionName(data.other.jur)} records for this recipient`,
    meta: `${money(data.other.t)} in ${plural(data.other.c, 'record')}` });
  rows.push({ kind: 'All grants', href: `/money/grants?${new URLSearchParams({ jur: jurisdiction })}`, text: 'Government grants', meta: 'By program, recipient and electorate' });
  return rows;
}

/** A bill: its sponsor, and its most recent divisions (how members voted). `divisions` are vote-tables.js divisionRows. */
export function billNextSteps(bill, { divisions = [], sponsor = null } = {}) {
  const rows = [];
  const voted = [...divisions].filter((d) => /^\/doc\//.test(String(d?.href || '')))
    .sort((a, b) => String(b.date || '').localeCompare(String(a.date || '')));
  for (const d of voted.slice(0, 2)) rows.push({ kind: 'How members voted', href: d.href, text: d.title,
    meta: [d.chamber, `Ayes ${d.ayes}, noes ${d.noes}`, d.outcome].map(text).filter(Boolean).join(' · ') });
  if (sponsor?.href && sponsor.name) rows.push({ kind: 'Sponsor', href: sponsor.href, text: sponsor.name, meta: text(sponsor.party) || 'Votes, speeches and other bills' });
  for (const r of (bill?.related || []).slice(0, 2)) if (r?.key && r?.title) rows.push({ kind: 'Related bill', href: `/bill/${encodeURIComponent(r.key)}`, text: r.title,
    meta: text(r.relation === 'predecessor' ? 'Earlier bill this one builds on' : r.relation || 'Related in the bill register') });
  if (bill?.became) rows.push({ kind: 'Related bill', href: `/bill/${encodeURIComponent(bill.became)}`, text: 'The bill as introduced to Parliament', meta: 'This page is its exposure draft' });
  rows.push({ kind: 'All bills', href: '/bills', text: 'Bills before the parliaments', meta: 'Search by title, status and sponsor' });
  return rows;
}

/** A member: their seat(s) and party. Their latest votes arrive later (memberVoteSteps) into reserved rows. */
export function memberNextSteps({ seats = [], party = null } = {}) {
  const rows = [];
  for (const seat of seats.slice(0, 2)) rows.push({ kind: 'Electorate', href: seat.href, text: seat.name, meta: text(seat.chamber) || 'Members, results and boundary' });
  if (party?.href && party.name) rows.push({ kind: 'Party', href: party.href, text: party.name, meta: 'Members and disclosed receipts' });
  return rows;
}
/** A member's newest recorded votes on bills. `votes` are vote-tables.js votingRows. */
export function memberVoteSteps(votes = []) {
  return [...votes].filter((v) => !v?.procedural && day(v.date) && /^\/(?:doc|bill)\//.test(String(v.href || '')))
    .sort((a, b) => String(b.date).localeCompare(String(a.date)))
    .map((v) => ({ kind: 'Latest vote', href: v.href, text: v.title, meta: `${v.vote} · ${day(v.date)}` }));
}

/** An electorate: its member(s), and the way to another electorate. Postcodes are published for Victorian districts only.
 *  `sitting` is false when the page cannot say who represents the seat today (a dissolved house, a past date,
 *  a term that has ended): then no person is named and no seat is said to "represent you". */
export function electorateNextSteps(detail, { members = [], personHref = () => '', displayName = (n) => n, sitting = true } = {}) {
  const rows = [];
  if (sitting) for (const m of members.slice(0, 3)) {
    const person = detail?.people?.[m.person_id] || m.person;
    if (!person?.name) continue;
    rows.push({ kind: detail?.status === 'historical' ? 'Last recorded member' : 'Member', href: personHref(person), text: displayName(person.name),
      meta: [text(m.party), 'Votes, speeches and declared interests'].filter(Boolean).join(' · ') });
  }
  for (const r of (detail?.relations || []).filter((r) => sitting || r?.kind !== 'within_upper_house').slice(0, 1)) if (r?.related?.slug) rows.push({ kind: r.kind === 'within_upper_house' ? 'Also represents you' : 'Related electorate',
    href: `/subject/electorate/${encodeURIComponent(r.related.slug)}`, text: r.related.name, meta: 'Members, results and boundary' });
  if (detail?.jurisdiction === 'vic') rows.push({ kind: 'Find your own MP', href: '/vic-election-2026#find', text: 'Search by suburb or postcode', meta: 'Victorian state districts' });
  rows.push({ kind: 'Find your own MP', href: '/subject/electorate', text: 'Search every electorate by name', meta: 'Federal, state and territory seats' });
  return rows;
}

/**
 * A Victorian election district page. Until polls close this block names no person, party or vote
 * and counts no members: only the seat's previous result at the VEC, how to vote, its region and the
 * seat finder. After polls close it adds the seat's standing electorate record. The region's members are
 * counted only from a roster dated after the poll (`pollDay`, YYYY-MM-DD): the new parliament's.
 * It never names the roster member: how members and candidates are shown is the page's own business.
 */
export function vicDistrictNextSteps(seat, region, { closed = false, pollDay = '' } = {}) {
  const newRoster = closed && /^\d{4}-\d{2}-\d{2}$/.test(pollDay) && /^\d{4}-\d{2}-\d{2}/.test(String(region?.roster_date || '')) && String(region.roster_date).slice(0, 10) > pollDay;
  const rows = [];
  const general = seat?.result?.general;
  if (general?.url && /^\d{4}/.test(String(general.date || ''))) rows.push({ kind: 'Previous result', href: general.url, text: `${seat.name}: ${String(general.date).slice(0, 4)} election result`, meta: 'Victorian Electoral Commission' });
  if (!closed) rows.push({ kind: 'Voting', href: '#voting', text: 'How and where to vote', meta: 'Voting times and the VEC’s locations' });
  if (closed && seat?.electorate_url) rows.push({ kind: 'Electorate record', href: seat.electorate_url, text: `${seat.name}: electorate record`, meta: 'Election timeline and Census context' });
  if (region?.path) rows.push({ kind: 'Upper house region', href: region.path, text: `${region.name} Region`,
    meta: newRoster ? `${plural(region.members?.length, 'member')} and ${plural(region.districts?.length, 'district')}` : plural(region.districts?.length, 'district') });
  rows.push({ kind: 'Districts', href: '/vic-election-2026#districts', text: 'All 88 lower house districts', meta: 'Listed by name' });
  rows.push({ kind: 'Another seat', href: '/vic-election-2026#find', text: 'Search by suburb, postcode or district', meta: '88 districts and 8 regions' });
  return rows;
}

/** A page in a dated series (a sitting week): the periods either side of it, then the whole list. */
export function seriesNextSteps({ newer = null, older = null, index = null } = {}) {
  const rows = [];
  if (newer?.href) rows.push({ kind: 'Next', href: newer.href, text: newer.text, meta: newer.meta });
  if (older?.href) rows.push({ kind: 'Previous', href: older.href, text: older.text, meta: older.meta });
  if (index?.href) rows.push({ kind: 'All', href: index.href, text: index.text, meta: index.meta });
  return rows;
}
