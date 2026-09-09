/* Electorate reference pages. Independently loadable; no funding-data dependency. */
export const JURISDICTIONS = { federal: 'Federal', nsw: 'New South Wales', vic: 'Victoria', qld: 'Queensland', sa: 'South Australia', wa: 'Western Australia', tas: 'Tasmania', nt: 'Northern Territory', act: 'Australian Capital Territory' };
export const CHAMBERS = { representatives: 'House of Representatives', senate: 'Senate', nsw_la: 'NSW Legislative Assembly', nsw_lc: 'NSW Legislative Council', vic_la: 'Victorian Legislative Assembly', vic_lc: 'Victorian Legislative Council', qld_la: 'Queensland Legislative Assembly', sa_ha: 'SA House of Assembly', sa_lc: 'SA Legislative Council', wa_la: 'WA Legislative Assembly', wa_lc: 'WA Legislative Council', tas_ha: 'Tasmanian House of Assembly', tas_lc: 'Tasmanian Legislative Council', nt_la: 'NT Legislative Assembly', act_la: 'ACT Legislative Assembly' };
export const escapeHTML = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const esc = escapeHTML;
const number = (n) => Number(n).toLocaleString('en-AU', { maximumFractionDigits: 1 });
const date = (s) => s ? new Date(`${s}T12:00:00`).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' }) : 'Unknown';
const personURL = (p) => `/subject/person/${encodeURIComponent(p.name)}`;
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
export function personLinksHTML(person) {
  if (!person?.electorates?.length) return '';
  return `<section class="person-section electorate-person-links"><h3 class="subject-section-title">Electorates represented</h3><ul>${person.electorates.map((e) => `<li><a href="${esc(e.url)}">${esc(e.name)}</a> · ${esc(CHAMBERS[e.chamber] || e.chamber)}${e.current ? ` · verified ${esc(date(e.as_of))}${e.party ? ` · ${esc(e.party)}` : ''}` : ' · historical service'}${e.periods?.length ? `<div class="fineprint">${e.periods.map((p) => `${esc(date(p.start))}–${p.end ? esc(date(p.end)) : 'end not recorded'}`).join('; ')}</div>` : ''}</li>`).join('')}</ul><p class="fineprint">These links describe parliamentary service. The speech record on this page can span several electorates.</p></section>`;
}
export async function directorySpec() {
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
    row: (e) => `<li class="el-directory-row"><a href="${esc(e.url)}"><strong>${esc(e.name)}</strong><span class="fineprint">${esc(JURISDICTIONS[e.jurisdiction])} · ${esc(CHAMBERS[e.chamber] || e.chamber)}${e.jurisdiction === 'federal' ? ` · ${esc(e.state_code.toUpperCase())}` : ''}${e.status === 'historical' ? ' · Historical' : ''}</span></a><div>${e.representatives.length ? e.representatives.map((m) => `<a href="${esc(personURL(m.person))}">${esc(m.person.name)}</a>${m.party ? ` · ${esc(m.party)}` : ''}`).join('<br>') : 'Representation not yet verified'}${e.representation_as_of ? `<small>Verified ${esc(date(e.representation_as_of))}</small>` : ''}</div><span class="fineprint">${e.election_count ? `${e.election_count} election${e.election_count === 1 ? '' : 's'} indexed` : 'Results not yet indexed'}</span></li>`,
    fineprint: `Coverage varies by parliament. A missing representative or result means it has not been verified in this release. ABS state outlines use 2025 statistical geography. <a href="/electorates/manifest.json">Sources and reference downloads</a>.`,
  };
}

export function outlineHTML(boundary, name) {
  if (!boundary?.geometry) return '<p class="fineprint">Boundary outline not yet available.</p>';
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
  return `<figure class="el-outline"><svg viewBox="0 0 300 200" role="img" aria-label="${esc(name)} boundary outline"><path d="${path}" fill-rule="evenodd"/></svg><figcaption>${boundary.geometry_kind === 'official' ? 'AEC election boundary' : 'ABS statistical outline'} · ${esc(boundary.vintage)}<br>Simplified for display</figcaption></figure>`;
}
function memberHTML(m, people) {
  const p = people[m.person_id] || m.person;
  return `<li>${p ? `<a href="${esc(personURL(p))}">${esc(p.name)}</a>` : 'Unresolved person'}${m.party ? `<span>${esc(m.party)}</span>` : ''}</li>`;
}
const sourceLinks = (ids, sources) => [...new Set(ids || [])].map((id) => sources[id]).filter(Boolean).map((s) => sourceURL(s.url) ? `<a href="${esc(s.url)}" target="_blank" rel="noopener">${esc(s.label)}</a>` : esc(s.label)).join(' · ');
function electionHTML(c, sources, people) {
  const winner = c.candidates.filter((p) => p.elected).map((p) => `${p.name} (${p.party})`).join(', ');
  const kinds = ['primary', 'tcp', 'tpp'].filter((kind) => c.candidates.some((p) => p.votes.some((v) => v.kind === kind)));
  const label = { primary: 'First preferences', tcp: 'Two-candidate preferred', tpp: 'Two-party preferred' };
  const value = (p, kind) => {
    const v = p.votes.find((v) => v.kind === kind);
    return v ? `${number(v.votes)}${v.denominator ? `<small>${(100 * v.votes / v.denominator).toFixed(2)}%</small>` : ''}` : '—';
  };
  return `<li><details class="el-election"><summary><time datetime="${esc(c.election.poll_date)}">${esc(date(c.election.poll_date))}</time><strong>${c.election.kind === 'by_election' ? 'By-election' : 'General election'}</strong><span>${esc(winner || 'No elected candidate recorded')}</span></summary><div class="el-election-body"><p class="fineprint">${esc(c.status)} result · ${esc(c.voting_system)} · ${c.vacancies} ${c.vacancies === 1 ? 'vacancy' : 'vacancies'}${c.boundary_version_id ? '' : ' · Boundary version not yet indexed'}</p><div class="el-table-scroll" tabindex="0" role="region" aria-label="Candidate results for ${esc(date(c.election.poll_date))}"><table><caption>${esc(c.election.name)} — ${c.candidates.length} candidates</caption><thead><tr><th scope="col">Candidate / party</th>${kinds.map((k) => `<th scope="col">${label[k]}</th>`).join('')}</tr></thead><tbody>${c.candidates.map((p) => `<tr><th scope="row">${p.person_id && people[p.person_id] ? `<a href="${esc(personURL(people[p.person_id]))}">${esc(p.name)}</a>` : esc(p.name)}${p.elected ? ' <span class="el-elected">Elected</span>' : ''}<small>${esc(p.party)}</small></th>${kinds.map((k) => `<td>${value(p, k)}</td>`).join('')}</tr>`).join('')}</tbody></table></div><p class="fineprint">Percentages use each count’s recorded denominator. “—” means no result for that candidate in that count. TCP and TPP are distinct counts.</p><p class="fineprint">${sourceLinks(c.sources, sources)}</p></div></details></li>`;
}
const INDICATORS = {
  population: ['Population', 'people'], median_age: ['Median age', 'years'], median_household_income_weekly: ['Median household income', '$/week'], median_rent_weekly: ['Median rent', '$/week'], median_mortgage_monthly: ['Median mortgage', '$/month'], homeownership_pct: ['Home ownership', '%'], rental_pct: ['Renting', '%'], unemployment_rate: ['Unemployment', '%'], university_pct: ['University qualification', '%'], born_overseas_pct: ['Born overseas', '%'], indigenous_pct: ['Aboriginal and Torres Strait Islander', '%'], average_household_size: ['Average household size', 'people'],
};
export function profileHTML(detail, on = '') {
  const selected = on ? representationAt(detail, on) : { status: detail.representation_status, members: detail.representatives, as_of: detail.representation_as_of };
  const title = on ? `Representation on ${date(on)}` : 'Latest verified representation';
  const boundary = [...detail.boundaries].filter((b) => b.geometry).sort((a, b) => Number(b.geometry_kind === 'official') - Number(a.geometry_kind === 'official') || String(b.applicable_election_date || b.effective_from || b.vintage || '').localeCompare(String(a.applicable_election_date || a.effective_from || a.vintage || '')))[0];
  const terms = [...detail.terms].sort((a, b) => (b.start || '').localeCompare(a.start || ''));
  const people = detail.people;
  return `<p class="kicker">Electorate · ${esc(JURISDICTIONS[detail.jurisdiction])}</p><div class="subject-head"><h2 id="subject-title" tabindex="-1">${esc(detail.name)}</h2><p class="subject-tag"><span>${esc(CHAMBERS[detail.chamber] || detail.chamber)} · ${esc(detail.state_code.toUpperCase())}${detail.capacity > 1 ? ` · ${detail.capacity} seats` : ''}${detail.status === 'historical' ? ' · Historical electorate' : ''}</span></p></div>
    <div class="el-intro"><section><h3>${esc(title)}</h3>${selected.status === 'conflicting' ? '<p>Conflicting service records require review.</p>' : selected.members.length ? `<ul class="el-members">${selected.members.map((m) => memberHTML(m, people)).join('')}</ul>` : `<p>${selected.status === 'verified' ? 'Vacant at this observation.' : 'Representation has not yet been verified for this date.'}</p>`}<p class="fineprint">${selected.as_of ? `As of ${esc(date(selected.as_of))}. ` : ''}${selected.status === 'historical' ? 'From dated service records; coverage may be incomplete.' : selected.status === 'partial' ? 'Partial roster; other members may be missing.' : 'Election winners and present-day representation can differ.'}</p><form id="el-asof-form" class="el-asof"><label for="el-asof">View representation on a date</label><div><input id="el-asof" name="asof" type="date" value="${esc(on)}" required><button type="submit" class="secondary">View</button>${on ? `<a href="${esc(detail.url)}">Latest check</a>` : ''}</div></form></section><aside>${outlineHTML(boundary, detail.name)}${boundary ? `<p class="fineprint">${esc(boundary.note)}${on ? ' This outline is not a reconstruction of the selected date.' : ''}</p>` : ''}</aside></div>
    <nav class="el-jumps" aria-label="On this page"><a href="#el-elections">Elections</a><a href="#el-history">Representation history</a><a href="#el-context">Census context</a><a href="#el-sources">Sources &amp; downloads</a></nav>
    <section id="el-elections" class="el-section"><h3>Election timeline</h3><p class="fineprint">${detail.elections.length ? `${detail.elections.length} indexed contests. Expand an election for every candidate and available count. Gaps indicate missing coverage.` : 'Election results have not yet been imported for this electorate.'}</p><ol class="el-timeline">${detail.elections.map((c) => electionHTML(c, detail.sources, people)).join('')}</ol></section>
    <section id="el-history" class="el-section"><h3>Representation history</h3><p class="fineprint">${terms.length ? 'Dated service records, newest first. Party changes may create a new period. Open-ended records are not proof of current membership.' : 'Historical service has not yet been imported.'}</p><ol class="el-service">${terms.map((t) => `<li><div><time>${esc(date(t.start))}</time> – ${t.end ? `<time>${esc(date(t.end))}</time> (exclusive)` : `end not recorded${t.observed_through ? `; observed ${esc(date(t.observed_through))}` : ''}`}</div><strong>${people[t.person_id] ? `<a href="${esc(personURL(people[t.person_id]))}">${esc(people[t.person_id].name)}</a>` : 'Unresolved person'}</strong><span>${esc((t.party_periods || []).map((p) => p.party).join(' → '))}</span></li>`).join('')}</ol><p>Explore each parliamentarian’s page for their speeches, divisions and other indexed records.</p></section>
    <section id="el-context" class="el-section"><h3>Census context</h3>${detail.demographics.length ? detail.demographics.map((d) => `<p>${esc(d.vintage)}</p><p class="fineprint">${esc(d.note)}</p><dl class="el-demographics">${Object.entries(INDICATORS).filter(([key]) => d.indicators[key] != null).map(([key, [label, unit]]) => `<div><dt>${esc(label)}</dt><dd>${number(d.indicators[key])}<small>${unit}</small></dd></div>`).join('')}</dl>`).join('') : '<p>Census indicators have not yet been imported for this electorate.</p>'}</section>
    ${detail.relations.length ? `<section class="el-section"><h3>Related constituencies</h3><ul>${detail.relations.map((r) => `<li><a href="/subject/electorate/${esc(r.related.slug)}">${esc(r.related.name)}</a> · ${esc(CHAMBERS[r.related.chamber] || r.related.chamber)} · ${esc(r.vintage)}</li>`).join('')}</ul></section>` : ''}
    <section id="el-sources" class="el-section"><h3>Sources &amp; downloads</h3><p class="fineprint">Source records are dated independently. Unknown dates and missing data stay explicit. Boundary and Census vintages can differ from election dates.</p><ul>${pageSources(detail).map((s) => `<li>${sourceURL(s.url) ? `<a href="${esc(s.url)}" target="_blank" rel="noopener">${esc(s.label)}</a>` : esc(s.label)}<small>Retrieved ${esc((s.fetched_at || '').slice(0, 10))}${s.licence ? ` · ${esc(s.licence)}` : ''}</small></li>`).join('')}</ul><p><a href="${esc(detail.detail_url)}" download>Download electorate JSON</a> · <a href="/electorates/manifest.json">Versioned reference manifest</a></p><details><summary>Stable reference ID</summary><code class="el-id">${esc(detail.electorate_id)}</code></details></section>`;
}
function pageSources(d) {
  const ids = new Set();
  const walk = (v) => { if (Array.isArray(v)) v.forEach(walk); else if (v && typeof v === 'object') for (const [k, x] of Object.entries(v)) { if (k === 'sources' && Array.isArray(x)) x.forEach((id) => ids.add(id)); else if (k !== 'sources') walk(x); } };
  for (const k of ['boundaries', 'keys', 'terms', 'rosters', 'elections', 'demographics', 'relations']) walk(d[k]);
  return [...ids].map((id) => d.sources[id]).filter(Boolean);
}
export async function renderProfile({ body, slug, on, isActive, setCrumbs, goRoute, manageFocus }) {
  try {
    const data = await loadIndex();
    if (!isActive()) return;
    const entry = data.electorates.find((e) => e.slug === slug || e.electorate_id === slug);
    if (!entry) { body.innerHTML = '<h2 id="subject-title" tabindex="-1">Electorate not found</h2><p><a href="/subject/electorate">Browse electorates</a></p>'; return; }
    const detail = await json(entry.detail_url);
    if (!isActive()) return;
    if (on && !validDate(on)) { body.innerHTML = `<h2>Invalid date</h2><p><a href="${esc(entry.url)}">Return to ${esc(entry.name)}</a></p>`; return; }
    document.title = `${entry.name} · Electorate · OPAX`;
    setCrumbs([{ label: 'Electorates', href: '/subject/electorate' }, { label: entry.name }]);
    body.innerHTML = profileHTML(detail, on);
    body.querySelector('#el-asof-form').addEventListener('submit', (event) => { event.preventDefault(); const value = body.querySelector('#el-asof').value; if (validDate(value)) goRoute(`${entry.url}?asof=${value}`); });
    if (manageFocus) body.querySelector('#subject-title')?.focus();
  } catch {
    if (isActive()) body.innerHTML = '<h2 id="subject-title" tabindex="-1">Electorate data unavailable</h2><p>The reference data could not be loaded. Reload this page to try again.</p>';
  }
}
