/* Party pages for every party the record names, not only the money map's
   (Jake, 16 Oct). A party outside the map, such as one senator's own party, has
   no node to hang an entry on, so the page is built from who sat for it: the
   roster's party fields and the division records' party labels
   (/graph/party-members.json, scripts/build_party_index.mjs).
   Pure functions; app.js passes in its helpers. */

import { PARTY_MAP, PARTY_NAMES, PARTY_RENAMES } from './labels.js?v=8d287e0533';
import { partyUrl, personUrl, PERSON_PATHS } from './canonical-urls.js?v=bcc9a57bab';
// sponsor-party-aliases:begin
// Generated from scripts/export_bills.py SPONSOR_PARTY_TOKENS.
const SPONSOR_PARTY_ALIASES = {
  "alp": "Labor",
  "australia's voice": "Australia's Voice",
  "australian conservatives": "Australian Conservatives",
  "australian democrats": "Australian Democrats",
  "australian greens": "Greens",
  "australian labor party": "Labor",
  "australian motoring enthusiast party": "Australian Motoring Enthusiast Party",
  "centre alliance": "Centre Alliance",
  "country liberal party": "Country Liberal Party",
  "country liberals (northern territory": "Country Liberal Party",
  "democratic labor party": "DLP",
  "democratic labor party (dlp": "DLP",
  "democratic labour party (dlp": "DLP",
  "derryn hinch's justice party": "Derryn Hinch's Justice Party",
  "family first": "Family First",
  "gerard rennick people first": "Gerard Rennick People First",
  "greens": "Greens",
  "independent": "Independent",
  "independent member": "Independent",
  "independent members": "Independent",
  "jacqui lambie network": "Jacqui Lambie Network",
  "katter's australian party": "Katter's Australian Party",
  "labor": "Labor",
  "liberal": "Liberal",
  "liberal democratic party": "Liberal Democratic Party",
  "liberal national party of queensland": "LNP",
  "liberal party of australia": "Liberal",
  "lnp": "LNP",
  "national party of australia": "Nationals",
  "nationals": "Nationals",
  "nick xenophon team": "Nick Xenophon Team",
  "one nation": "One Nation",
  "palmer united party": "Palmer United Party",
  "pauline hanson's one nation": "One Nation",
  "pauline hansons one nation": "One Nation",
  "queensland greens": "Greens",
  "rex patrick team": "Rex Patrick Team",
  "the nationals": "Nationals",
  "united australia party": "United Australia Party",
  "united australia party (clive palmer": "United Australia Party"
};
// sponsor-party-aliases:end

// Server consumers use these re-exports too, keeping the stamped browser
// dependencies and their identity tables to one copy in the Worker bundle.
export * from './labels.js?v=8d287e0533';
export * from './canonical-urls.js?v=bcc9a57bab';

const fold = value => String(value ?? '').normalize('NFKC').replace(/[‘’ʼ`]/g, "'").replace(/\s+/g, ' ').trim().toLowerCase();
/** The party URL's last segment; the same spelling as canonical-urls.js entitySlug. */
export const partySlug = name => String(name ?? '').normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase()
  .replace(/['’‘ʼ`.]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');

// A division slug can name a reviewed alias. Canonical addresses take precedence
// where removing punctuation would otherwise make two names share a slug.
const personAddresses = new Map(Object.entries(PERSON_PATHS.folded).map(([name, href]) => [partySlug(name), href]));
for (const href of Object.values(PERSON_PATHS.exact)) personAddresses.set(href.slice('/subject/person/'.length), href);

/** Every party label in the loaded sources, money first so a map party keeps the map's spelling. */
export function partyLabels({money = [], roster = null, divisions = null, live = null} = {}) {
  const out = [];
  for (const graph of money) for (const n of graph?.nodes || []) if (n.kind === 'party') out.push(n.label);
  for (const p of roster?.people || []) out.push(...personPartyLabels(p));
  out.push(...Object.keys(divisions?.parties || {}), ...Object.keys(divisions?.bills || {}));
  for (const r of live?.parties || []) out.push(r.label);
  return [...new Set(out.map(l => String(l ?? '').trim()).filter(Boolean))];
}

/** The label a /subject/party/<segment> names: its exact name or its slug. Never a prefix match:
 *  "liberal-democratic-party" is not the Liberal Party. */
export function resolvePartyLabel(segment, labels) {
  const want = fold(segment), slug = String(segment ?? '').toLowerCase();
  if (!want) return null;
  return labels.find(l => fold(l) === want) || labels.find(l => partySlug(l) === slug) || null;
}

/** The parties a roster row says the person sat for. */
function memberPartyLabels(p) {
  return [p.party_now, p.party, ...(p.parties || [])].filter(Boolean);
}

/** Every party label a roster row carries. recorded_parties are the speech labels of a print the
 *  roster could not tie to one person (a surname shared across parliaments: "Hughes" holds a
 *  federal Liberal's speeches and an SA member's), so they name a party page but never make the
 *  print one of its members (state-datasets-001). */
function personPartyLabels(p) {
  return [...memberPartyLabels(p),
    ...(p.recorded_parties || []).map(r => typeof r === 'string' ? r : r?.party)].filter(Boolean);
}

/** Members of a party, current and former. A roster person is a member when any of their party
 *  fields names the party, or, with none, when a verified seat roster does (the index's
 *  seat_rosters); the division records add those who voted under it. One row per person:
 *  the roster's pid joins its prints, and person-paths joins division slugs to those identities.
 *  Only division rows without a slug fall back to their printed name.
 *  A seat-roster member carries `seat_roster` ({as_of, next_election, stale}). They sit until the
 *  next election the repository records after the roster's date has passed (`today`, YYYY-MM-DD);
 *  after it they are `stale`: neither sitting nor former, only on the roster of that date. */
export function partyMembers(label, {roster = null, divisions = null, same = (a, b) => identity(a) === identity(b), today = utcDay()} = {}) {
  const people = roster?.people || [];
  const idOf = p => p.pid ? `pid:${p.pid}` : `name:${fold(p.full || p.name)}`;
  // A full name with a party outranks a surname print or a committee-witness stub.
  const rank = p => (/\s/.test(p.name) ? 4 : 0) + (p.party ? 2 : 0) + (p.current ? 1 : 0);
  const best = new Map(), span = new Map(), byName = new Map(), byAddress = new Map();
  for (const p of people) {
    const id = idOf(p);
    if (!best.has(id) || rank(p) > rank(best.get(id))) best.set(id, p);
    const s = span.get(id) || {first: 9999, last: 0};
    span.set(id, {first: Math.min(s.first, p.first || 9999), last: Math.max(s.last, p.last || 0)});
  }
  // A printed name first, then the register's full name, so "Gerard Rennick" finds his own row.
  for (const p of people) if (p.full && !byName.has(fold(p.full))) byName.set(fold(p.full), idOf(p));
  for (const p of people) byName.set(fold(p.name), idOf(p));
  for (const p of people) {
    const href = p.full && personUrl(p.full);
    if (href && href !== '/subject/person' && !byAddress.has(href)) byAddress.set(href, idOf(p));
  }
  for (const p of people) {
    const href = personUrl(p.name);
    if (href !== '/subject/person') byAddress.set(href, idOf(p));
  }
  const rows = new Map();
  const row = (id, fallback = {}) => {
    if (!rows.has(id)) {
      const p = best.get(id);
      rows.set(id, {name: p?.name || fallback.name, pid: p?.pid || null, roster: p || null, current: false,
        first: span.get(id)?.first ?? 9999, last: span.get(id)?.last ?? fallback.last ?? 0, divisions: 0, labels: []});
    }
    return rows.get(id);
  };
  // The party names each person was recorded under, as the records spell them: a renamed party's page
  // labels a member with the name they sat under (partyMembersHTML), never only with its current one.
  const recordedAs = (r, l) => { l = String(l ?? '').trim(); if (l && !r.labels.includes(l)) r.labels.push(l); };
  for (const p of people) {
    if (!memberPartyLabels(p).some(l => same(l, label))) continue;
    const r = row(idOf(p));
    for (const l of memberPartyLabels(p)) if (same(l, label)) recordedAs(r, l);
    if (p.current && same(p.party_now || p.party, label)) r.current = true;
  }
  // A roster person with no party of their own, filed under the party a verified seat roster records
  // for them (scripts/build_party_index.mjs seat_rosters, roster-party.js). The index named them by
  // their roster row, so only that row's pid or exact name joins; the roster said they held the seat
  // on its date, so they sit unless their own record says they left or a later election has been held.
  const seatMembers = [];
  for (const [party, members] of Object.entries(divisions?.seat_rosters || {})) {
    if (!same(party, label)) continue;
    for (const m of members) {
      // A `reference` member has no roster row of their own (roster-party.js referenceOnlyPeople); the Worker
      // adds one under the same pid, the browser does not, so the entry stands in for it here.
      const id = m.pid && best.has(`pid:${m.pid}`) ? `pid:${m.pid}` : byName.get(fold(m.name))
        || (m.reference ? (m.pid ? `pid:${m.pid}` : `name:${fold(m.name)}`) : null);
      if (!id) continue;
      const r = row(id, {name: m.name});
      recordedAs(r, party);
      const stale = Boolean(m.next_election && today > m.next_election);
      r.seat_roster = {as_of: m.as_of || null, next_election: m.next_election || null, stale};
      if (r.roster?.current !== false && !stale) r.current = true;
      if (stale && m.reference) r.current = false;
      seatMembers.push({id, m});
    }
  }
  // Victorian Hansard also prints some of these members by initials ("J Bull" beside "Josh Bull"), as a
  // separate roster row with no pid. On this page only, an initials row the party's seat roster explains
  // is hidden: same jurisdiction, chamber, party, surname and first initial, and exactly one such member.
  // Two candidates keep both rows; identities are not merged here.
  // An initials row the seat rosters tie to one member of another party is also hidden: "T Bull" (Victorian
  // Assembly, 2018 to 2022) carries the Labor label, but the only Assembly Bull with initial T is Tim Bull,
  // whom the Victorian roster files as a National. The repository holds no dated party for him in those years,
  // so the row is neither moved nor relabelled: it is only not listed as this party's member.
  const fitsPrint = (p, print, m) => (p.states || []).includes(m.jurisdiction) && (p.chambers || []).includes(m.chamber) &&
    initialsPrint(m.name, true)?.surname === print.surname && initialsPrint(m.name, true)?.initial === print.initial;
  const everySeat = Object.entries(divisions?.seat_rosters || {}).flatMap(([party, members]) => members.map(m => ({party, m})));
  for (const [id, r] of [...rows]) {
    const p = r.roster, print = p && !p.pid ? initialsPrint(p.name) : null;
    if (!print || r.seat_roster || !memberPartyLabels(p).some(l => same(l, label))) continue;
    const fits = seatMembers.filter(({id: other, m}) => other !== id && fitsPrint(p, print, m));
    if (new Set(fits.map(f => f.id)).size === 1) { rows.delete(id); continue; }
    const elsewhere = everySeat.filter(({m}) => fitsPrint(p, print, m));
    if (!fits.length && elsewhere.length === 1 && !same(elsewhere[0].party, label)) rows.delete(id);
  }
  for (const [party, members] of Object.entries(divisions?.parties || {})) {
    if (!same(party, label)) continue;
    for (const m of members) {
      const id = m.slug
        ? byAddress.get(personAddresses.get(m.slug) || `/subject/person/${m.slug}`) || `slug:${m.slug}`
        : byName.get(fold(m.name)) || `name:${fold(m.name)}`;
      const r = row(id, {name: m.name, last: Number(String(m.last || '').slice(0, 4)) || 0});
      r.divisions += m.divisions || 0;
      recordedAs(r, party);
    }
  }
  const list = [...rows.values()];
  // Full names before the roster's surname-only prints, then the most recent first.
  const byRecent = (a, b) => Number(/\s/.test(b.name)) - Number(/\s/.test(a.name)) || (b.last || 0) - (a.last || 0) || a.name.localeCompare(b.name);
  return {
    current: list.filter(r => r.current).sort((a, b) => a.name.localeCompare(b.name)),
    former: list.filter(r => !r.current).sort(byRecent),
  };
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
/** "2026-09-09" -> "9 Sep 2026". */
export function dayMonthYear(day) {
  const [y, mo, d] = String(day ?? '').split('-').map(Number);
  return y && mo && d ? `${d} ${MONTHS[mo - 1]} ${y}` : String(day ?? '');
}

/** Today as YYYY-MM-DD (UTC). */
function utcDay() { return new Date().toISOString().slice(0, 10); }

/** {initial, surname} of an initials print ("J Bull", "K.J. Maher", "M O’Brien"), or of any full name when
 *  `full`; null for a surname print or, without `full`, a name with a written-out given name. */
function initialsPrint(name, full = false) {
  const parts = String(name ?? '').trim().split(/\s+/);
  if (parts.length < 2) return null;
  const given = parts.slice(0, -1);
  if (!full && !given.every(g => /^(?:[A-Z]\.?)+$/.test(g))) return null;
  return {initial: given[0][0].toUpperCase(), surname: fold(parts.at(-1))};
}

/** The label the search index files a party's speeches under, with their count, or null when the
 *  record holds no speech for it ("Reason Party": money and divisions, no Hansard). `indexed` is
 *  /graph/party-speeches.json, the index's own labels; where that cannot be read, the roster stands
 *  in (a person's party is the label their speeches carry). Aliases join through `same`
 *  ("Pauline Hanson's One Nation Party" is "One Nation"); of two indexed spellings the larger wins. */
export function partySpeechLabel(label, {indexed = null, roster = null, same = (a, b) => fold(a) === fold(b)} = {}) {
  const counts = new Map();
  if (indexed?.parties) {
    for (const [l, n] of Object.entries(indexed.parties)) if (Number(n) > 0 && same(l, label)) counts.set(l, Number(n));
  } else {
    for (const p of roster?.people || []) if (p.party && p.speeches > 0 && same(p.party, label)) counts.set(p.party, (counts.get(p.party) || 0) + p.speeches);
  }
  let best = null;
  for (const [l, count] of counts) if (!best || count > best.count) best = {label: l, count};
  return best;
}

const SHOWN = 12;
/** The Members block: portrait rows as the people directory draws them, sitting members first.
 *  `h` carries app.js's esc, photoUrlFor, personUrl, partyChipHTML, yearSpan, stateName, sourceLineHTML. */
export function partyMembersHTML(label, members, h, {speechesHref = '', directoryHref = '', updated = ''} = {}) {
  const independent = isIndependent(label);
  const total = members.current.length + members.former.length;
  if (!total) return '';
  // Seat-roster members after a later election: not known to sit, not known to have left.
  const rostered = members.former.filter(m => m.seat_roster?.stale);
  const former = members.former.filter(m => !m.seat_roster?.stale);
  const row = m => {
    const photo = h.photoUrlFor(m.name);
    const portrait = photo
      ? `<span class="dir-portrait"><img src="${h.esc(photo)}" alt="" width="64" height="64" loading="lazy"></span>`
      : '<span class="dir-mono" aria-hidden="true"></span>';
    const href = h.personUrl(m.name);
    const name = href && href !== '/subject/person' ? `<a class="source-title dir-name" href="${h.esc(href)}">${h.esc(m.name)}</a>` : `<span class="source-title dir-name">${h.esc(m.name)}</span>`;
    const p = m.roster || {};
    // Only a sitting member's party is "now"; a former member's roster party is the label their speeches carry.
    const now = p.current ? p.party_now || p.party : '';
    const where = (p.states || []).map(h.stateName).join(', ');
    // A seat-roster member's status is the roster's, on its date: said beside them unless the heading says it.
    const asAt = m.seat_roster?.as_of && !datedGroup ? `Parliamentary roster as at ${dayMonthYear(m.seat_roster.as_of)}` : '';
    const meta = [
      recordedAsText(label, m.labels) ? h.esc(recordedAsText(label, m.labels)) : '',
      now && !h.same(now, label) ? `<span class="dir-muted">now</span> ${h.partyChipHTML(now)}` : '',
      where ? h.esc(where) : '',
      // Roster years where the roster has the person; else only the division records' last vote.
      m.first < 9999 ? h.esc(h.yearSpan(m.first, m.last)) : m.last ? h.esc(`Last recorded vote ${m.last}`) : '',
      asAt ? h.esc(asAt) : '',
    ].filter(Boolean).join(' · ');
    return `<li class="dir-row">${portrait}<div class="dir-main">${name}${meta ? `<span class="result-meta">${meta}</span>` : ''}</div>
      <div class="dir-figs">${m.divisions ? `<span class="dir-fig"><b>${Number(m.divisions).toLocaleString()}</b>division${m.divisions === 1 ? '' : 's'}</span>` : ''}</div></li>`;
  };
  let datedGroup = false;
  const group = (title, list) => {
    if (!list.length) return '';
    // A group made up only of seat-roster members of one date carries the date in its heading.
    const dates = new Set(list.map(m => m.seat_roster?.as_of || ''));
    datedGroup = Boolean(title) && dates.size === 1 && !dates.has('');
    if (datedGroup && !/as at/.test(title)) title = `${title}, as at ${dayMonthYear([...dates][0])}`;
    const shown = list.slice(0, SHOWN), rest = list.slice(SHOWN);
    // With nobody sitting, the block's own heading says it all: no subheading.
    return `${title ? `<h4 class="entry-subhead">${h.esc(title)} (${list.length.toLocaleString()})</h4>` : ''}
      <ul class="subject-list dir-list party-member-list" role="list">${shown.map(row).join('')}</ul>
      ${rest.length ? `<details class="party-members-more"><summary>${rest.length.toLocaleString()} more ${h.esc((title || 'members').toLowerCase())}</summary>
        <ul class="subject-list dir-list party-member-list" role="list">${rest.map(row).join('')}</ul></details>` : ''}`;
  };
  const rosteredGroups = [...new Set(rostered.map(m => m.seat_roster.as_of))].sort().reverse()
    .map(day => group(`On the parliamentary roster as at ${dayMonthYear(day)}`, rostered.filter(m => m.seat_roster.as_of === day))).join('');
  return `<section class="party-members" id="party-members">
    <div class="entry-section-head"><h3 class="subject-section-title">${independent ? 'Parliamentarians' : 'Members'}</h3>${speechesHref ? `<a href="${h.esc(speechesHref)}">Their speeches</a>` : ''}</div>
    ${members.current.length || rostered.length
      ? group(independent ? 'Sitting parliamentarians' : 'Sitting members', members.current) + rosteredGroups + group(independent ? 'Former parliamentarians' : 'Former members', former)
      : group('', former)}
    ${directoryHref ? `<p class="entry-more"><a href="${h.esc(directoryHref)}">${h.esc(label)} in the parliamentarians directory</a></p>` : ''}
    ${h.sourceLineHTML({
      updated, source: 'Parliamentary roster, verified electorate rosters and recorded divisions',
      notes: [PARTY_MEMBER_SCOPE, 'Division records use the latest recorded affiliation, so they do not establish when it began.'],
    })}
  </section>`;
}

/** Disclosed receipts a party holds in the state money files (no federal map node): one row per commission. */
export function partyStateMoneyHTML(label, files, h) {
  const hits = files.flatMap(([jur, data]) => {
    // A renamed party can hold a node under each name it lodged returns as: one row per commission,
    // the names' figures combined, and the row says which name each part was lodged under.
    const nodes = (data?.nodes || []).filter(n => n.kind === 'party' && h.same(n.label, label));
    if (!nodes.length) return [];
    const ids = new Set(nodes.map(n => n.id));
    const totals = new Map();
    for (const e of data.edges || []) {
      if (!ids.has(e.target)) continue;
      const name = (data.nodes.find(n => n.id === e.source) || {}).label;
      if (name) totals.set(name, (totals.get(name) || 0) + (e.total || 0));
    }
    const donors = [...totals].sort((a, b) => b[1] - a[1]);
    const node = nodes.length === 1 ? nodes[0] : combinedNode(nodes);
    return [{jur, node, meta: data.meta || {}, donors}];
  });
  if (!hits.length) return '';
  const items = hits.map(({jur, node, meta, donors}) => {
    const years = node.firstYear === node.lastYear ? String(node.firstYear || '') : `${node.firstYear}–${node.lastYear}`;
    const detail = [`${h.fmtMoney(node.total || 0)} across ${(node.count || 0).toLocaleString()} disclosed gifts`, years, meta.sourceShort || '', node.lodgedAs || ''].filter(Boolean).join(' · ');
    const top = donors.slice(0, 5).map(([name]) => h.donorNameHTML(name)).join(', ');
    return `<li><a class="source-title" href="${h.esc(h.moneyHref(jur))}">${h.esc(meta.jurisdictionLabel || h.jurisdictionLabel(jur))}</a>
      <span class="result-meta">${h.esc(detail)}</span>${top ? `<p class="snippet">Largest disclosed receipt sources: ${top}${donors.length > 5 ? `, and ${(donors.length - 5).toLocaleString()} more` : ''}.</p>` : ''}</li>`;
  }).join('');
  const commissions = [...new Set(hits.map(x => x.meta.commission).filter(Boolean))];
  const total = hits.reduce((a, x) => Math.max(a, x.node.total || 0), 0);
  return `<section class="state-money party-state-money" id="party-state-money" data-accent="money" data-rail-figure="${h.esc(h.fmtMoney(total))}">
    <h3 class="subject-section-title">Disclosed to state commissions</h3>
    <ul class="subject-list" role="list">${items}</ul>
    ${h.sourceLineHTML({source: commissions.join('; ') || 'State electoral commissions', state: 'totals are a floor',
      notes: ["Gifts under each state's disclosure threshold are not reported, so these totals are a floor, not a ceiling.", h.esc(h.notSummed)]})}
  </section>`;
}

/** The bills a party's members sponsored, newest first, from the party index's `bills` (scripts/build_party_index.mjs):
 *  every spelling the party joins through `same`, each bill once. */
export function partyBills(label, divisions, same = (a, b) => identity(a) === identity(b)) {
  const seen = new Set(), out = [];
  for (const [party, bills] of Object.entries(divisions?.bills || {})) {
    if (!same(party, label)) continue;
    for (const b of bills || []) if (b?.key && !seen.has(b.key)) { seen.add(b.key); out.push({...b, party}); }
  }
  return out.sort((a, b) => String(b.introduced || '').localeCompare(String(a.introduced || '')) || a.key.localeCompare(b.key));
}

// The bill rows' words (home-data.js billRowHTML).
const BILL_STATUS = {before_parliament: 'Before parliament', passed: 'Passed', lapsed: 'Lapsed', exposure_draft: 'Exposure draft'};
/** The "Bills sponsored" block: each bill linked to its page, with its introduction date and status. */
export function partyBillsHTML(label, bills, h, {updated = ''} = {}) {
  if (!bills?.length) return '';
  const row = b => {
    const raw = String(b.status || '').replace(/_/g, ' ');
    const status = BILL_STATUS[b.status] || raw.replace(/^./, c => c.toUpperCase());
    const meta = [b.introduced ? `Introduced ${dayMonthYear(b.introduced)}` : '', status, recordedAsText(label, [b.party], 'Sponsor recorded as')].filter(Boolean).join(' · ');
    return `<li><a class="source-title" href="/bill/${encodeURIComponent(b.key)}">${h.esc(b.title || b.key)}</a>${meta ? `<span class="result-meta">${h.esc(meta)}</span>` : ''}</li>`;
  };
  const shown = bills.slice(0, SHOWN), rest = bills.slice(SHOWN);
  return `<section class="party-sponsored-bills" id="party-sponsored-bills">
    <h3 class="subject-section-title">Bills sponsored (${bills.length.toLocaleString()})</h3>
    <ul class="subject-list" role="list">${shown.map(row).join('')}</ul>
    ${rest.length ? `<details class="party-members-more"><summary>${rest.length.toLocaleString()} more bills</summary>
      <ul class="subject-list" role="list">${rest.map(row).join('')}</ul></details>` : ''}
    ${h.sourceLineHTML({updated, source: 'Federal bills register (Parliament of Australia)',
      notes: [`Bills whose sponsor the register records as ${isIndependent(label) ? 'an independent' : `a member of ${partyDisplayName(label)}`} when the bill was introduced.`]})}
  </section>`;
}

const identity = label => PARTY_MAP[fold(label)]?.[1] || fold(label);
/** A renamed party's entry (labels.js PARTY_RENAMES) for its current or a former name, or null. */
function renameOf(label, renames = PARTY_RENAMES) {
  const key = fold(label);
  return renames.find(r => fold(r.name) === key || r.former.some(f => [f.name, ...(f.aliases || [])].some(n => fold(n) === key))
    || (PARTY_MAP[key] && PARTY_MAP[key][1] === r.code)) || null;
}
/** The former name a label is, under a renamed party, or null. */
function formerNameOf(label, renames = PARTY_RENAMES) {
  const key = fold(label);
  for (const r of renames) for (const f of r.former) if ([f.name, ...(f.aliases || [])].some(n => fold(n) === key)) return f;
  return null;
}
/** "Recorded as Liberal Democratic Party": the former names a record of a renamed party carries.
 *  Empty for a party never renamed and for a record under the current name. */
export function recordedAsText(label, labels, lead = 'Recorded as', renames = PARTY_RENAMES) {
  if (!renameOf(label, renames)) return '';
  const names = [...new Set((labels || []).filter(l => formerNameOf(l, renames)).map(l => String(l).trim()))];
  return names.length ? `${lead} ${names.join(' and ')}` : '';
}
/** The name history of a renamed party: its plain-English line and the registers' notices, or null. */
export function partyHistory(label, renames = PARTY_RENAMES) {
  const r = renameOf(label, renames);
  return r ? {name: r.name, since: r.since || null, line: r.history, former: r.former.map(f => ({...f})), sources: r.sources || []} : null;
}
/** The history line under a renamed party's heading, with the registers' notices linked. */
export function partyHistoryHTML(label, h, renames = PARTY_RENAMES) {
  const history = partyHistory(label, renames);
  if (!history) return '';
  const links = history.sources.filter(s => /^https:\/\//.test(s.href || '')).map(s => `<a href="${h.esc(s.href)}" rel="noopener">${h.esc(s.label)}</a>`);
  return `<p class="party-history" id="party-history">${h.esc(history.line)}${links.length ? ` Sources: ${links.join('; ')}.` : ''}</p>`;
}
/** Several nodes of one renamed party in one money file, as one: totals and counts summed, the years
 *  spanned, and `lodgedAs` naming each name's part ("Lodged as Liberal Democrats $1,000; as Libertarian $2,000"). */
function combinedNode(nodes) {
  const years = nodes.flatMap(n => [n.firstYear, n.lastYear]).filter(Boolean).sort();
  const parts = [...nodes].sort((a, b) => String(a.firstYear || '').localeCompare(String(b.firstYear || '')))
    .map(n => `${n.label} ${Math.round(n.total || 0).toLocaleString('en-AU', {style: 'currency', currency: 'AUD', maximumFractionDigits: 0})}`);
  return {...nodes[0], total: nodes.reduce((a, n) => a + (n.total || 0), 0), count: nodes.reduce((a, n) => a + (n.count || 0), 0),
    firstYear: years[0], lastYear: years.at(-1), lodgedAs: `Lodged as ${parts.join('; as ')}`};
}
/** A renamed party's AEC annual-return rows (aec-extras.json `parties`) under every name it lodged as,
 *  one row per year (figures summed where two names lodged for one year), with which name each year
 *  was lodged under. `rows` are app.js partyReceiptsHTML's [year, receipts, ...] tuples. */
export function partyReturns(label, parties, same = (a, b) => identity(a) === identity(b)) {
  const names = Object.keys(parties || {}).filter(name => same(name, label));
  const byYear = new Map(), lodged = [];
  for (const name of names) {
    const returns = parties[name]?.returns || [];
    if (!returns.length) continue;
    const years = returns.map(r => String(r[0] || '')).filter(Boolean).sort();
    lodged.push({name, from: years[0], to: years.at(-1)});
    for (const r of returns) {
      const year = String(r[0] || '');
      const prev = byYear.get(year);
      byYear.set(year, prev ? prev.map((v, i) => i === 0 ? v : v == null && r[i] == null ? null : (Number(v) || 0) + (Number(r[i]) || 0)) : [...r]);
    }
  }
  lodged.sort((a, b) => a.from.localeCompare(b.from));
  const note = lodged.length > 1 ? `Returns lodged as ${lodged.map(l => `${l.name} (${l.from === l.to ? l.from : `${l.from} to ${l.to}`})`).join(' and as ')}, combined here.` : '';
  return {rows: [...byYear.values()], names: lodged.map(l => l.name), note, entry: names.length === 1 ? parties[names[0]] : null};
}
export const isIndependent = label => identity(label) === 'IND';
export const INDEPENDENTS_DESCRIPTION = 'Parliamentarians who sat without a party. Not a party organisation.';
export const PARTY_MEMBER_SCOPE = 'Parliamentarian counts include current and former people recorded under the affiliation in the roster, a verified electorate roster or the divisions. Each person is counted once per affiliation, using their person ID where held.';
export const partyDisplayName = label => isIndependent(label) ? 'Independents' : identity(label) === 'DLP' ? PARTY_NAMES.DLP[1] : label;
export const PARTY_MONEY_PATHS = ['/graph/money.json', '/graph/money.qld.json', '/graph/money.vic.json', '/graph/money.tas.json'];

/** One page per party identity. The money map's spelling wins, then the existing
 * full canonical label, so roster and division aliases never add another page. */
export function canonicalPartyPages({ money = [], roster = null, divisions = null, renames = PARTY_RENAMES } = {}) {
  const parties = new Map();
  const add = (label, source, date) => {
    label = String(label ?? '').trim();
    if (!label || label.length > 120 || /^(?:null|undefined|PRES|DPRES|SPK|DSPK|CWM|CHAIR)$/i.test(label)) return;
    // A renamed party is one page under every name it was recorded as (labels.js PARTY_RENAMES).
    const key = renameOf(label, renames) ? `rename:${renameOf(label, renames).code}` : identity(label);
    if (!parties.has(key)) parties.set(key, { label, aliases: [], money: false, roster: false, divisions: false, bills: false, lastmod: '' });
    const page = parties.get(key);
    if (!page.aliases.includes(label)) page.aliases.push(label);
    if (source === 'money' && !page.money) page.label = label;
    page[source] = true;
    if (date && date > page.lastmod) page.lastmod = date;
  };
  for (const graph of money) for (const node of graph?.nodes || []) if (node.kind === 'party') add(node.label, 'money', graph.meta?.generated);
  for (const person of roster?.people || []) {
    for (const label of [person.party, person.party_now, ...(person.parties || []), ...(person.recorded_parties || []).map(r => typeof r === 'string' ? r : r?.party)]) add(label, 'roster', roster.meta?.generated);
  }
  const labels = Array.isArray(divisions?.parties) ? divisions.parties : Object.keys(divisions?.parties || {});
  for (const label of labels) add(label, 'divisions', divisions?.generated_at || roster?.meta?.generated);
  // A sponsor's party the bills register records ("Rex Patrick Team"): its page lists the bills.
  for (const [label, bills] of Object.entries(divisions?.bills || {})) add(label, 'bills', (bills || []).map(b => b.introduced || '').sort().at(-1));
  return [...parties.values()].map(page => {
    const rename = renameOf(page.label, renames);
    // A renamed party's page carries its current name and address, whatever name the money file held;
    // its former names stay aliases, each with the date it ended (`formerNames`).
    if (rename) {
      page.label = rename.name;
      if (!page.aliases.some(l => fold(l) === fold(rename.name))) page.aliases.push(rename.name);
      const formerNames = rename.former.map(f => ({name: f.name, until: f.until || null,
        recorded: page.aliases.filter(l => [f.name, ...(f.aliases || [])].some(n => fold(n) === fold(l)))}));
      return { ...page, name: rename.name, href: `/subject/party/${partySlug(rename.name)}`, since: rename.since || null, formerNames, history: rename.history };
    }
    if (!page.money) page.label = page.aliases.find(label => fold(label) === fold(PARTY_NAMES[identity(label)]?.[1])) || page.label;
    return { ...page, name: partyDisplayName(page.label), href: partyUrl(page.label) };
  }).sort((a, b) => a.label.localeCompare(b.label, 'en-AU'));
}

/** Shared source inventory for the server directory, browser directory and sitemap. */
export async function readPartyPages(read) {
  const [money, roster, divisions] = await Promise.all([
    Promise.all(PARTY_MONEY_PATHS.map(path => path.endsWith('money.tas.json') ? read(path).catch(() => null) : read(path))),
    read('/parliamentarians.json', {cache: 'no-cache'}), read('/graph/party-members.json').catch(() => null),
  ]);
  return canonicalPartyPages({ money, roster, divisions });
}

/** Accept source spellings and the existing label aliases, but return one page. */
export function resolvePartyPage(segment, pages) {
  const want = fold(segment);
  // A former name's own slug ("liberal-democratic-party") names its party's page: partyUrl now
  // writes the current address, so the raw slug is compared too, and the Worker answers it with a 301.
  const slugs = label => [partyUrl(label).split('/').at(-1), partySlug(label)];
  const sponsorAlias = Object.entries(SPONSOR_PARTY_ALIASES).find(([label]) => fold(label) === want || partySlug(label) === want)?.[1];
  const alias = sponsorAlias || Object.keys(PARTY_MAP).find(label => slugs(label).includes(want));
  return pages.find(page => page.aliases.some(label => fold(label) === want || slugs(label).includes(want))
    || page.href.split('/').at(-1) === want || identity(page.label) === identity(alias || segment)) || null;
}

export function partyPageCoverage(page) {
  if (isIndependent(page.label)) return INDEPENDENTS_DESCRIPTION;
  const held = page.roster ? `Parliamentary roster${page.divisions ? ' and recorded divisions' : ''}` : page.divisions ? 'Recorded divisions' : page.bills ? 'Bill sponsor records' : 'Recorded divisions';
  return page.money ? 'Published political receipts; federal and state returns remain separate.' : `${held}. No party-level disclosure file held by OPAX.`;
}
