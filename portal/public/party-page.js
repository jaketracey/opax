/* Party pages for every party the record names, not only the money map's
   (Jake, 16 Oct). A party outside the map, such as one senator's own party, has
   no node to hang an entry on, so the page is built from who sat for it: the
   roster's party fields and the division records' party labels
   (/graph/party-members.json, scripts/build_party_index.mjs).
   Pure functions; app.js passes in its helpers. */

import { PARTY_MAP, PARTY_NAMES } from './labels.js?v=75e6c65ff7';
import { partyUrl, personUrl, PERSON_PATHS } from './canonical-urls.js?v=6c889d487d';

// Server consumers use these re-exports too, keeping the stamped browser
// dependencies and their identity tables to one copy in the Worker bundle.
export * from './labels.js?v=75e6c65ff7';
export * from './canonical-urls.js?v=6c889d487d';

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
  out.push(...Object.keys(divisions?.parties || {}));
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
 *  fields names the party; the division records add those who voted under it. One row per person:
 *  the roster's pid joins its prints, and person-paths joins division slugs to those identities.
 *  Only division rows without a slug fall back to their printed name. */
export function partyMembers(label, {roster = null, divisions = null, same = (a, b) => identity(a) === identity(b)} = {}) {
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
        first: span.get(id)?.first ?? 9999, last: span.get(id)?.last ?? fallback.last ?? 0, divisions: 0});
    }
    return rows.get(id);
  };
  for (const p of people) {
    if (!memberPartyLabels(p).some(l => same(l, label))) continue;
    const r = row(idOf(p));
    if (p.current && same(p.party_now || p.party, label)) r.current = true;
  }
  for (const [party, members] of Object.entries(divisions?.parties || {})) {
    if (!same(party, label)) continue;
    for (const m of members) {
      const id = m.slug
        ? byAddress.get(personAddresses.get(m.slug) || `/subject/person/${m.slug}`) || `slug:${m.slug}`
        : byName.get(fold(m.name)) || `name:${fold(m.name)}`;
      row(id, {name: m.name, last: Number(String(m.last || '').slice(0, 4)) || 0}).divisions += m.divisions || 0;
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
    const meta = [
      now && !h.same(now, label) ? `<span class="dir-muted">now</span> ${h.partyChipHTML(now)}` : '',
      where ? h.esc(where) : '',
      // Roster years where the roster has the person; else only the division records' last vote.
      m.first < 9999 ? h.esc(h.yearSpan(m.first, m.last)) : m.last ? h.esc(`Last recorded vote ${m.last}`) : '',
    ].filter(Boolean).join(' · ');
    return `<li class="dir-row">${portrait}<div class="dir-main">${name}${meta ? `<span class="result-meta">${meta}</span>` : ''}</div>
      <div class="dir-figs">${m.divisions ? `<span class="dir-fig"><b>${Number(m.divisions).toLocaleString()}</b>division${m.divisions === 1 ? '' : 's'}</span>` : ''}</div></li>`;
  };
  const group = (title, list) => {
    if (!list.length) return '';
    const shown = list.slice(0, SHOWN), rest = list.slice(SHOWN);
    // With nobody sitting, the block's own heading says it all: no subheading.
    return `${title ? `<h4 class="entry-subhead">${h.esc(title)} (${list.length.toLocaleString()})</h4>` : ''}
      <ul class="subject-list dir-list party-member-list" role="list">${shown.map(row).join('')}</ul>
      ${rest.length ? `<details class="party-members-more"><summary>${rest.length.toLocaleString()} more ${h.esc((title || 'members').toLowerCase())}</summary>
        <ul class="subject-list dir-list party-member-list" role="list">${rest.map(row).join('')}</ul></details>` : ''}`;
  };
  return `<section class="party-members" id="party-members">
    <div class="entry-section-head"><h3 class="subject-section-title">${independent ? 'Parliamentarians' : 'Members'}</h3>${speechesHref ? `<a href="${h.esc(speechesHref)}">Their speeches</a>` : ''}</div>
    ${members.current.length ? group(independent ? 'Sitting parliamentarians' : 'Sitting members', members.current) + group(independent ? 'Former parliamentarians' : 'Former members', members.former) : group('', members.former)}
    ${directoryHref ? `<p class="entry-more"><a href="${h.esc(directoryHref)}">${h.esc(label)} in the parliamentarians directory</a></p>` : ''}
    ${h.sourceLineHTML({
      updated, source: 'Parliamentary roster and recorded divisions',
      notes: [PARTY_MEMBER_SCOPE, 'Division records use the latest recorded affiliation, so they do not establish when it began.'],
    })}
  </section>`;
}

/** Disclosed receipts a party holds in the state money files (no federal map node): one row per commission. */
export function partyStateMoneyHTML(label, files, h) {
  const hits = files.flatMap(([jur, data]) => {
    const node = (data?.nodes || []).find(n => n.kind === 'party' && h.same(n.label, label));
    if (!node) return [];
    const donors = (data.edges || []).filter(e => String(e.target) === node.id)
      .map(e => [(data.nodes.find(n => n.id === e.source) || {}).label, e.total || 0]).filter(([n]) => n)
      .sort((a, b) => b[1] - a[1]);
    return [{jur, node, meta: data.meta || {}, donors}];
  });
  if (!hits.length) return '';
  const items = hits.map(({jur, node, meta, donors}) => {
    const years = node.firstYear === node.lastYear ? String(node.firstYear || '') : `${node.firstYear}–${node.lastYear}`;
    const detail = [`${h.fmtMoney(node.total || 0)} across ${(node.count || 0).toLocaleString()} disclosed gifts`, years, meta.sourceShort || ''].filter(Boolean).join(' · ');
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

const identity = label => PARTY_MAP[fold(label)]?.[1] || fold(label);
export const isIndependent = label => identity(label) === 'IND';
export const INDEPENDENTS_DESCRIPTION = 'Parliamentarians who sat without a party. Not a party organisation.';
export const PARTY_MEMBER_SCOPE = 'Parliamentarian counts include current and former people recorded under the affiliation in the roster or divisions. Each person is counted once per affiliation, using their person ID where held.';
export const partyDisplayName = label => isIndependent(label) ? 'Independents' : identity(label) === 'DLP' ? PARTY_NAMES.DLP[1] : label;
export const PARTY_MONEY_PATHS = ['/graph/money.json', '/graph/money.qld.json', '/graph/money.vic.json', '/graph/money.tas.json'];

/** One page per party identity. The money map's spelling wins, then the existing
 * full canonical label, so roster and division aliases never add another page. */
export function canonicalPartyPages({ money = [], roster = null, divisions = null } = {}) {
  const parties = new Map();
  const add = (label, source, date) => {
    label = String(label ?? '').trim();
    if (!label || label.length > 120 || /^(?:null|undefined|PRES|DPRES|SPK|DSPK|CWM|CHAIR)$/i.test(label)) return;
    const key = identity(label);
    if (!parties.has(key)) parties.set(key, { label, aliases: [], money: false, roster: false, divisions: false, lastmod: '' });
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
  return [...parties.values()].map(page => {
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
  const alias = Object.keys(PARTY_MAP).find(label => partyUrl(label).split('/').at(-1) === want);
  return pages.find(page => page.aliases.some(label => fold(label) === want || partyUrl(label).split('/').at(-1) === want)
    || page.href.split('/').at(-1) === want || identity(page.label) === identity(alias || segment)) || null;
}

export function partyPageCoverage(page) {
  if (isIndependent(page.label)) return INDEPENDENTS_DESCRIPTION;
  const held = page.roster ? `Parliamentary roster${page.divisions ? ' and recorded divisions' : ''}` : 'Recorded divisions';
  return page.money ? 'Published political receipts; federal and state returns remain separate.' : `${held}. No party-level disclosure file held by OPAX.`;
}
