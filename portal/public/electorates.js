import { personUrl, partyUrl } from './canonical-urls.js?v=225d5915ea';
/* Electorate reference pages. Independently loadable; no funding-data dependency. */
import { shortDate } from './format.js';
import { partyLabelHTML, statusLabelHTML, sourceLineHTML, moreMenuHTML } from './labels.js?v=804befe8de';
export const JURISDICTIONS = { federal: 'Federal', nsw: 'New South Wales', vic: 'Victoria', qld: 'Queensland', sa: 'South Australia', wa: 'Western Australia', tas: 'Tasmania', nt: 'Northern Territory', act: 'Australian Capital Territory' };
export const CHAMBERS = { representatives: 'House of Representatives', senate: 'Senate', nsw_la: 'NSW Legislative Assembly', nsw_lc: 'NSW Legislative Council', vic_la: 'Victorian Legislative Assembly', vic_lc: 'Victorian Legislative Council', qld_la: 'Queensland Legislative Assembly', sa_ha: 'SA House of Assembly', sa_lc: 'SA Legislative Council', wa_la: 'WA Legislative Assembly', wa_lc: 'WA Legislative Council', tas_ha: 'Tasmanian House of Assembly', tas_lc: 'Tasmanian Legislative Council', nt_la: 'NT Legislative Assembly', act_la: 'ACT Legislative Assembly' };
export const escapeHTML = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const esc = escapeHTML;
const number = (n) => Number(n).toLocaleString('en-AU', { maximumFractionDigits: 1 });
const date = (s) => s ? shortDate(s) : 'Unknown';
const personURL = (p) => personUrl(p.name);
/** A roster name as a reader sees it: some service records set the whole name
 *  or the surname in capitals ("LEO McLEAY"). Mc/Mac/O' keep their own shape. */
export const displayName = (name) => String(name ?? '').replace(/\b(Mc|Mac|O['’])?([A-Z])([A-Z]+)\b/g, (_, pre = '', first, rest) => `${pre}${first}${rest.toLowerCase()}`);
const sourceURL = (s) => /^https?:\/\//.test(s || '') ? s : null;
let manifestPromise, indexPromise, peoplePromise;
const json = async (url) => { const r = await fetch(url); if (!r.ok) throw new Error(`Reference data unavailable (${r.status})`); return r.json(); };
export function loadManifest() { return manifestPromise ??= json('/electorates/manifest.json').catch((e) => { manifestPromise = null; throw e; }); }
export function loadIndex() { return indexPromise ??= loadManifest().then((m) => json(m.index_url)).catch((e) => { indexPromise = null; throw e; }); }
export function loadPeople() { return peoplePromise ??= loadManifest().then((m) => json(m.people_url)).catch((e) => { peoplePromise = null; throw e; }); }
export function validDate(s) { return /^\d{4}-\d{2}-\d{2}$/.test(s || '') && !Number.isNaN(Date.parse(s)) && new Date(s).toISOString().slice(0, 10) === s; }
export function representationAt(detail, on) {
  if (!validDate(on)) return { status: 'unknown', members: [] };
  const rosters = (detail.rosters || []).filter((r) => r.as_of === on).sort((a, b) => (b.priority || 0) - (a.priority || 0));
  if (rosters.length) return { status: rosters[0].complete ? 'verified' : 'partial', members: rosters[0].members, as_of: on };
  const terms = (detail.terms || []).filter((t) => t.start_precision === 'day' && t.start && t.start <= on &&
    ((t.end_precision === 'day' && t.end && on < t.end) || (t.end_precision === 'open' && t.observed_through && on <= t.observed_through)));
  const members = terms.map((t) => ({ ...t, party: t.party_periods?.find((p) => p.start && p.start <= on && (!p.end || on < p.end))?.party }));
  return { status: members.length ? (members.length > detail.capacity ? 'conflicting' : 'historical') : 'unknown', members, as_of: on };
}
export function findPerson(people, name) {
  const key = String(name).toLocaleLowerCase();
  const matches = people.filter((p) => [p.name, ...(p.aliases || [])].some((n) => n.toLocaleLowerCase() === key));
  return matches.length === 1 ? matches[0] : null;
}
// Recorded affiliations can be historical and can contain legacy labels.
// Only one match in the stated parliament/chamber may become a profile link.
export function recordedElectorate(representation, electorates) {
  const fold = (value) => String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/['’]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();
  const stateCode = (value) => Object.entries(JURISDICTIONS).find(([code, label]) => code !== 'federal' && [fold(code), fold(label)].includes(fold(value)))?.[0];
  const r = representation;
  const state = r.state ? stateCode(r.state) : null;
  if (!r.jurisdiction || !r.chamber || (r.state && !state)) return null;
  let name = fold(r.electorate);
  if (r.chamber === 'senate') {
    const region = stateCode(r.electorate);
    if (region) name = fold(JURISDICTIONS[region]);
  } else if (r.chamber.endsWith('_lc')) {
    name = name.replace(/^legislative council district of /, '');
  }
  const matches = electorates.filter((e) => e.jurisdiction === r.jurisdiction && e.chamber === r.chamber &&
    (!state || e.state_code === state) && [e.name, ...(e.aliases || [])].some((alias) => fold(alias) === name));
  return matches.length === 1 ? matches[0] : null;
}
export function recordedRepresentationHTML(representation, electorates) {
  const entry = recordedElectorate(representation, electorates);
  const label = esc(representation.electorate);
  const name = entry ? `<a href="${esc(entry.url)}">${label}</a>` : label;
  return name + (representation.state && representation.chamber !== 'senate' ? `, ${esc(representation.state)}` : '');
}
export function personElectorateLinksHTML(person, representations = [], electorates = []) {
  const seats = person?.electorates || [];
  const current = seats.filter((e) => e.current);
  if (seats.length) return (current.length ? current : seats).map((e) => `<a href="${esc(e.url)}">${esc(e.name)}</a>`).join(', ');
  return representations.map((r) => recordedRepresentationHTML(r, electorates)).join(', ');
}
export function personRepresentationRows(person, representations = [], electorates = []) {
  const seats = person?.electorates || [];
  const current = seats.filter((e) => e.current);
  const historical = seats.filter((e) => !e.current);
  const link = (e) => `<a href="${esc(e.url)}">${esc(e.name)}</a>`;
  const recorded = representations.filter((r) => !seats.some((e) => e.url === recordedElectorate(r, electorates)?.url));
  return [
    current.length && [current.length === 1 ? 'Electorate' : 'Electorates', current.map((e) =>
      `${link(e)}<small class="representation-note">Verified ${esc(date(e.as_of))}</small>`).join('<br>')],
    historical.length && ['Representation history', historical.map(link).join('<br>') + '<small class="representation-note">Historical service records</small>'],
    recorded.length && ['Recorded representation', recorded.map((r) => recordedRepresentationHTML(r, electorates)).join('<br>') + '<small class="representation-note">Roster affiliation; may include past seats.</small>'],
  ].filter(Boolean);
}
export async function directorySpec({ photoUrlFor = () => null, partyChipHTML = (party) => esc(party) } = {}) {
  const data = await loadIndex();
  const items = data.electorates.map((e) => ({ ...e, _sortName: e.name.toLowerCase() }));
  const choices = (field, labels = {}) => [...new Set(items.map((e) => e[field]).filter(Boolean))].sort().map((v) => [v, labels[v] || v]);
  return {
    title: 'Electorates', items, lede: 'Places, representatives and the elections that shaped them.',
    text: (e) => [e.name, e.jurisdiction, e.state_code, CHAMBERS[e.chamber], ...(e.aliases || []), ...e.representatives.flatMap((m) => [m.person.name, m.party])].join(' '),
    name: (e) => e.name, href: (e) => e.url, hint: (e) => `${JURISDICTIONS[e.jurisdiction]} · ${CHAMBERS[e.chamber] || e.chamber}`,
    filters: [
      { key: 'jur', label: 'Parliament', options: choices('jurisdiction', JURISDICTIONS), test: (e, v) => e.jurisdiction === v },
      { key: 'chamber', label: 'Chamber', options: choices('chamber', CHAMBERS), test: (e, v) => e.chamber === v },
      { key: 'state', label: 'State', options: choices('state_code', JURISDICTIONS), test: (e, v) => e.state_code === v },
      { key: 'status', label: 'Status', options: [['current', 'Current'], ['historical', 'Historical']], test: (e, v) => e.status === v },
      { key: 'party', label: 'Party at latest check', options: [...new Set(items.flatMap((e) => e.representatives.map((m) => m.party)).filter(Boolean))].sort().map((v) => [v, v]), test: (e, v) => e.representatives.some((m) => m.party === v) },
      { key: 'results', label: 'With election results', check: true, test: (e) => e.election_count > 0 },
    ],
    sorts: [['name', 'Name A–Z', (a, b) => a.name.localeCompare(b.name)], ['elections', 'Most elections indexed', (a, b) => b.election_count - a.election_count || a.name.localeCompare(b.name)]],
    row: (e) => {
      const holders = e.representatives || [];
      const src = holders[0]?.person?.name ? photoUrlFor(holders[0].person.name) : null;
      const face = src ? `<span class="el-face"><img src="${esc(src)}" alt="" loading="lazy" width="36" height="36"></span>` : '<span class="el-face el-face-blank" aria-hidden="true"></span>';
      return `<li class="el-directory-row">${face}<div class="el-seat"><a class="el-name" href="${esc(e.url)}">${esc(e.name)}</a><span class="el-meta">${esc(JURISDICTIONS[e.jurisdiction])} · ${esc(CHAMBERS[e.chamber] || e.chamber)}${e.jurisdiction === 'federal' ? ` · ${esc(e.state_code.toUpperCase())}` : ''}${e.status === 'historical' ? ' · Historical' : ''}</span></div><div class="el-holders">${holders.length ? holders.map((m) => `<a href="${esc(personURL(m.person))}">${esc(m.person.name)}</a>${m.party ? ` · <a class="el-party" href="${partyUrl(m.party)}">${partyChipHTML(m.party)}</a>` : ''}`).join('<br>') : 'Representation not yet verified'}${e.representation_as_of ? `<small>Verified ${esc(date(e.representation_as_of))}</small>` : ''}</div><span class="el-meta">${e.election_count ? `${e.election_count} election${e.election_count === 1 ? '' : 's'} indexed` : 'Results not yet indexed'}</span></li>`;
    },
    fineprint: `Coverage varies by parliament. A missing representative or result means it has not been verified in this release. ABS state outlines use 2025 statistical geography. <a href="/electorates/manifest.json">Sources and reference downloads</a>.`,
  };
}

export function outlineHTML(boundary, name) {
  if (!boundary?.geometry) return '';
  const geometry = boundary.geometry;
  const polygons = geometry.type === 'Polygon' ? [geometry.coordinates] : geometry.type === 'MultiPolygon' ? geometry.coordinates : [];
  const coords = polygons.flat(2);
  if (!coords.length || coords.some((p) => !p.every(Number.isFinite))) return '';
  const latitude = coords.reduce((sum, p) => sum + p[1], 0) / coords.length;
  const cos = Math.cos(latitude * Math.PI / 180);
  const points = coords.map(([x, y]) => [x * cos, -y]);
  const xs = points.map((p) => p[0]), ys = points.map((p) => p[1]);
  const x0 = Math.min(...xs), y0 = Math.min(...ys), width = Math.max(...xs) - x0 || 1, height = Math.max(...ys) - y0 || 1;
  const scale = Math.min(280 / width, 180 / height);
  const path = polygons.map((rings) => rings.map((ring) => ring.map(([x, y], i) => `${i ? 'L' : 'M'}${(10 + (280 - width * scale) / 2 + (x * cos - x0) * scale).toFixed(2)},${(10 + (180 - height * scale) / 2 + (-y - y0) * scale).toFixed(2)}`).join(' ') + ' Z').join(' ')).join(' ');
  return `<figure class="el-outline"><svg viewBox="0 0 300 200" role="img" aria-label="${esc(name)} boundary outline"><path d="${path}" fill-rule="evenodd"/></svg></figure>`;
}
function memberHTML(m, people) {
  const p = people[m.person_id] || m.person;
  return `<li>${p ? `<a href="${esc(personURL(p))}">${esc(displayName(p.name))}</a>` : 'Unresolved person'}${m.party ? ` ${partyLabelHTML(m.party)}` : ''}</li>`;
}
/** A relation's vintage in words: the year it was recorded for, never the
 *  pipeline's own label ("2026 source configuration"). */
const relatedAsAt = (vintage) => { const year = /^\d{4}\b/.exec(String(vintage || ''))?.[0]; return year ? ` · as at ${year}` : ''; };
/** A block's own sources, by the record keys it is drawn from: each opens in its source sheet. */
function sourcesOf(detail, keys) {
  const ids = new Set();
  const walk = (v) => { if (Array.isArray(v)) v.forEach(walk); else if (v && typeof v === 'object') for (const [k, x] of Object.entries(v)) { if (k === 'sources' && Array.isArray(x)) x.forEach((id) => ids.add(id)); else if (k !== 'sources') walk(x); } };
  for (const k of keys) walk(detail[k]);
  return [...ids].map((id) => detail.sources[id]).filter(Boolean);
}
const originalsOf = (list) => list.map((s) => ({ label: s.label, href: sourceURL(s.url) }));
/** The newest retrieval among a block's sources: the date its line carries. */
const retrieved = (list) => list.map((s) => String(s.fetched_at || '').slice(0, 10)).filter(Boolean).sort().pop() || '';
const licences = (list) => [...new Set(list.map((s) => s.licence).filter(Boolean))].map(esc).join('; ');
function electionHTML(c, people) {
  const winner = c.candidates.filter((p) => p.elected).map((p) => `${p.name} (${p.party})`).join(', ');
  const kinds = ['primary', 'tcp', 'tpp'].filter((kind) => c.candidates.some((p) => p.votes.some((v) => v.kind === kind)));
  const label = { primary: 'First preferences', tcp: 'Two-candidate preferred', tpp: 'Two-party preferred' };
  const value = (p, kind) => {
    const v = p.votes.find((v) => v.kind === kind);
    return v ? `${number(v.votes)}${v.denominator ? `<small>${(100 * v.votes / v.denominator).toFixed(2)}%</small>` : ''}` : '—';
  };
  return `<li><details class="el-election"><summary><time datetime="${esc(c.election.poll_date)}">${esc(date(c.election.poll_date))}</time><strong>${c.election.kind === 'by_election' ? 'By-election' : 'General election'}</strong><span>${esc(winner || 'No elected candidate recorded')}</span></summary><div class="el-election-body"><p class="el-election-meta">${esc(c.status)} result · ${esc(c.voting_system)} · ${c.vacancies} ${c.vacancies === 1 ? 'vacancy' : 'vacancies'}${c.boundary_version_id ? '' : ' · Boundary version not yet indexed'}</p><div class="el-table-scroll" tabindex="0" role="region" aria-label="Candidate results for ${esc(date(c.election.poll_date))}"><table><caption>${esc(c.election.name)}: ${c.candidates.length} candidates</caption><thead><tr><th scope="col">Candidate and party</th>${kinds.map((k) => `<th scope="col">${label[k]}</th>`).join('')}</tr></thead><tbody>${c.candidates.map((p) => `<tr><th scope="row">${p.person_id && people[p.person_id] ? `<a href="${esc(personURL(people[p.person_id]))}">${esc(p.name)}</a>` : esc(p.name)}${p.elected ? ` ${statusLabelHTML('Elected', 'done')}` : ''}<small>${esc(p.party)}</small></th>${kinds.map((k) => `<td>${value(p, k)}</td>`).join('')}</tr>`).join('')}</tbody></table></div></div></details></li>`;
}
const INDICATORS = {
  population: ['Population', 'people'], median_age: ['Median age', 'years'], median_household_income_weekly: ['Median household income', '$/week'], median_rent_weekly: ['Median rent', '$/week'], median_mortgage_monthly: ['Median mortgage', '$/month'], homeownership_pct: ['Home ownership', '%'], rental_pct: ['Renting', '%'], unemployment_rate: ['Unemployment', '%'], university_pct: ['University qualification', '%'], born_overseas_pct: ['Born overseas', '%'], indigenous_pct: ['Aboriginal and Torres Strait Islander', '%'], average_household_size: ['Average household size', 'people'],
};
const unitOf = (value, unit) => unit === '%' ? `${number(value)}%` : unit.startsWith('$') ? `$${number(value)}${unit.slice(1)}` : `${number(value)} ${unit}`;
/** Census context: population is the block's one figure; the rest is a key/value list. */
function censusHTML(d) {
  const rows = Object.entries(INDICATORS).filter(([key]) => key !== 'population' && d.indicators[key] != null);
  return `${d.indicators.population != null ? `<p class="el-figure"><b>${number(d.indicators.population)}</b><span>people, ${esc(d.vintage)}</span></p>` : ''}
    <dl class="el-demographics">${rows.map(([key, [label, unit]]) => `<div><dt>${esc(label)}</dt><dd>${esc(unitOf(d.indicators[key], unit))}</dd></div>`).join('')}</dl>`;
}
/* One title and one meta line (no kicker); then blocks, each ending in one
   source line that opens its originals, dates, notes and licences. The date
   control lives in Representation history, the census is one figure and a
   key/value list, and the downloads and reference ID sit under ⋯ and in the
   representation sheet. */
export function profileHTML(detail, on = '') {
  const selected = on ? representationAt(detail, on) : { status: detail.representation_status, members: detail.representatives, as_of: detail.representation_as_of };
  const title = on ? `Representation on ${date(on)}` : 'Latest verified representation';
  const boundary = [...detail.boundaries].filter((b) => b.geometry).sort((a, b) => Number(b.geometry_kind === 'official') - Number(a.geometry_kind === 'official') || String(b.applicable_election_date || b.effective_from || b.vintage || '').localeCompare(String(a.applicable_election_date || a.effective_from || a.vintage || '')))[0];
  const terms = [...detail.terms].sort((a, b) => (b.start || '').localeCompare(a.start || ''));
  const people = detail.people;
  const held = sourcesOf(detail, ['rosters', 'terms', 'keys']);
  const outline = boundary ? sourcesOf({ boundaries: [boundary], sources: detail.sources }, ['boundaries']) : [];
  const contests = sourcesOf(detail, ['elections']);
  const service = sourcesOf(detail, ['terms']);
  const census = sourcesOf(detail, ['demographics']);
  const line = (list, opts) => sourceLineHTML({ updated: retrieved(list), dateLabel: 'Retrieved', originals: originalsOf(list), licence: licences(list), ...opts });
  return `<div class="subject-head"><h1 id="subject-title" tabindex="-1">${esc(detail.name)}</h1><p class="subject-tag"><span>${esc(CHAMBERS[detail.chamber] || detail.chamber)} · ${esc(detail.state_code.toUpperCase())}${detail.capacity > 1 ? ` · ${detail.capacity} seats` : ''}${detail.status === 'historical' ? ' · Historical electorate' : ''}</span></p>
    <div class="page-actions">${moreMenuHTML([
      { href: detail.detail_url, label: 'Download this electorate', detail: 'JSON, every record on this page with its sources' },
      { href: '/subject/electorate', label: 'All electorates' },
    ], 'More about this electorate')}</div></div>
    <div class="el-intro"><section id="el-held"><h3 class="subject-section-title">${esc(title)}</h3>${selected.status === 'conflicting' ? '<p>Conflicting service records require review.</p>' : selected.members.length ? `<ul class="el-members">${selected.members.map((m) => memberHTML(m, people)).join('')}</ul>` : `<p>${selected.status === 'verified' ? 'Vacant at this observation.' : 'Representation has not yet been verified for this date.'}</p>`}${on ? `<p class="el-latest"><a href="${esc(detail.url)}">Latest check</a></p>` : ''}
      ${sourceLineHTML({ updated: selected.as_of || '', dateLabel: 'As at', source: 'Electoral and parliamentary records',
        state: selected.status === 'partial' ? 'partial' : '',
        originals: originalsOf(held), licence: licences(held),
        facts: [['Reference ID', `<code class="el-id">${esc(detail.electorate_id)}</code>`]],
        notes: [selected.status === 'historical' ? 'From dated service records; coverage may be incomplete.' : selected.status === 'partial' ? 'Partial roster; other members may be missing.' : 'Election winners and present-day representation can differ.',
          'Representation is shown only as recorded in the dated release.'] })}</section>
    ${boundary ? `<aside class="el-outline-block">${outlineHTML(boundary, detail.name)}${line(outline, { source: `${boundary.geometry_kind === 'official' ? 'AEC election boundary' : 'ABS statistical outline'}, ${boundary.vintage}`, notes: [esc(boundary.note), 'Simplified for display.', on ? 'This outline is not a reconstruction of the selected date.' : ''] })}</aside>` : ''}</div>
    <section id="el-elections" class="el-section"><h3 class="subject-section-title">Election timeline</h3>${detail.elections.length ? `<ol class="el-timeline">${detail.elections.map((c) => electionHTML(c, people)).join('')}</ol>
      ${line(contests, { source: 'AEC results', notes: [`${detail.elections.length} indexed ${detail.elections.length === 1 ? 'contest' : 'contests'}; gaps are missing coverage.`, 'Percentages use each count’s recorded denominator. “—” means no result for that candidate in that count. TCP and TPP are distinct counts.'] })}` : '<p class="el-empty">Election results have not yet been imported for this electorate.</p>'}</section>
    <section id="el-history" class="el-section"><div class="el-section-head"><h3 class="subject-section-title">Representation history</h3>
      <form id="el-asof-form" class="el-asof"><label for="el-asof">On a date</label><input id="el-asof" class="ui-input" name="asof" type="date" value="${esc(on)}" required><button type="submit" class="ui-button">Show</button></form></div>
      ${terms.length ? `<ol class="el-service">${terms.map((t) => `<li><div><time>${esc(date(t.start))}</time> – ${t.end ? `<time>${esc(date(t.end))}</time> (exclusive)` : `end not recorded${t.observed_through ? `; observed ${esc(date(t.observed_through))}` : ''}`}</div><strong>${people[t.person_id] ? `<a href="${esc(personURL(people[t.person_id]))}">${esc(displayName(people[t.person_id].name))}</a>` : 'Unresolved person'}</strong><span>${(t.party_periods || []).map((p) => partyLabelHTML(p.party) || esc(p.party || '')).filter(Boolean).join(' → ')}</span></li>`).join('')}</ol>
      ${line(service, { source: 'Service records', notes: ['Dated service records, newest first. Party changes may create a new period. Open-ended records are not proof of current membership.'] })}` : '<p class="el-empty">Historical service has not yet been imported.</p>'}</section>
    <section id="el-context" class="el-section"><h3 class="subject-section-title">Census context</h3>${detail.demographics.length ? `${detail.demographics.map(censusHTML).join('')}
      ${line(census, { source: detail.demographics.map((d) => d.vintage).join('; '), notes: detail.demographics.map((d) => esc(d.note)) })}` : '<p class="el-empty">Census indicators have not yet been imported for this electorate.</p>'}</section>
    ${detail.relations.length ? `<section class="el-section"><h3 class="subject-section-title">Related constituencies</h3><ul class="el-related">${detail.relations.map((r) => `<li><a href="/subject/electorate/${esc(r.related.slug)}">${esc(r.related.name)}</a> · ${esc(CHAMBERS[r.related.chamber] || r.related.chamber)}${relatedAsAt(r.vintage)}</li>`).join('')}</ul></section>` : ''}`;
}
export async function renderProfile({ body, slug, on, isActive, setCrumbs, goRoute, manageFocus }) {
  try {
    const data = await loadIndex();
    if (!isActive()) return;
    const entry = data.electorates.find((e) => e.slug === slug || e.electorate_id === slug);
    if (!entry) { body.innerHTML = '<h1 id="subject-title" tabindex="-1">Electorate not found</h1><p>No electorate has this address. <a href="/subject/electorate">Browse electorates</a></p>'; return; }
    const detail = await json(entry.detail_url);
    if (!isActive()) return;
    if (on && !validDate(on)) { body.innerHTML = `<h1 id="subject-title" tabindex="-1">Invalid date</h1><p><a href="${esc(entry.url)}">Return to ${esc(entry.name)}</a></p>`; return; }
    document.title = `${entry.name} · Electorate · OPAX`;
    setCrumbs([{ label: 'Electorates', href: '/subject/electorate' }, { label: entry.name }]);
    body.innerHTML = profileHTML(detail, on);
    body.querySelector('#el-asof-form').addEventListener('submit', (event) => { event.preventDefault(); const value = body.querySelector('#el-asof').value; if (validDate(value)) goRoute(`${entry.url}?asof=${value}`); });
    if (manageFocus) body.querySelector('#subject-title')?.focus();
  } catch {
    if (isActive()) body.innerHTML = `<h1 id="subject-title" tabindex="-1">Electorate</h1><p>The electorate's record could not load just now. <a href="${esc(location.pathname + location.search)}">Try again</a></p>`;
  }
}
