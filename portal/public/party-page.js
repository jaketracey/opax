/* Party pages for every party the record names, not only the money map's
   (Jake, 16 Oct). A party outside the map, such as one senator's own party, has
   no node to hang an entry on, so the page is built from who sat for it: the
   roster's party fields and the division records' party labels
   (/graph/party-members.json, scripts/build_party_index.mjs).
   Pure functions; app.js passes in its helpers. */

const fold = value => String(value ?? '').normalize('NFKC').replace(/[‘’ʼ`]/g, "'").replace(/\s+/g, ' ').trim().toLowerCase();
/** The party URL's last segment; the same spelling as canonical-urls.js entitySlug. */
export const partySlug = name => String(name ?? '').normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase()
  .replace(/['’‘ʼ`.]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');

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

function personPartyLabels(p) {
  return [p.party_now, p.party, ...(p.parties || []),
    ...(p.recorded_parties || []).map(r => typeof r === 'string' ? r : r?.party)].filter(Boolean);
}

/** Members of a party, current and former. A roster person is a member when any of their party
 *  fields names the party; the division records add those who voted under it. One row per person:
 *  the roster's pid joins a surname-only print ("Rennick") to the full name, which is the one shown. */
export function partyMembers(label, {roster = null, divisions = null, same = (a, b) => fold(a) === fold(b)} = {}) {
  const people = roster?.people || [];
  const idOf = p => p.pid ? `pid:${p.pid}` : `name:${fold(p.full || p.name)}`;
  // A full name with a party outranks a surname print or a committee-witness stub.
  const rank = p => (/\s/.test(p.name) ? 4 : 0) + (p.party ? 2 : 0) + (p.current ? 1 : 0);
  const best = new Map(), span = new Map(), byName = new Map();
  for (const p of people) {
    const id = idOf(p);
    if (!best.has(id) || rank(p) > rank(best.get(id))) best.set(id, p);
    const s = span.get(id) || {first: 9999, last: 0};
    span.set(id, {first: Math.min(s.first, p.first || 9999), last: Math.max(s.last, p.last || 0)});
  }
  // A printed name first, then the register's full name, so "Gerard Rennick" finds his own row.
  for (const p of people) if (p.full && !byName.has(fold(p.full))) byName.set(fold(p.full), idOf(p));
  for (const p of people) byName.set(fold(p.name), idOf(p));
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
    if (!personPartyLabels(p).some(l => same(l, label))) continue;
    const r = row(idOf(p));
    if (p.current && same(p.party_now || p.party, label)) r.current = true;
  }
  for (const [party, members] of Object.entries(divisions?.parties || {})) {
    if (!same(party, label)) continue;
    for (const m of members) {
      const id = byName.get(fold(m.name)) || `name:${fold(m.name)}`;
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
    <div class="entry-section-head"><h3 class="subject-section-title">Members</h3>${speechesHref ? `<a href="${h.esc(speechesHref)}">Their speeches</a>` : ''}</div>
    ${members.current.length ? group('Sitting members', members.current) + group('Former members', members.former) : group('', members.former)}
    ${directoryHref ? `<p class="entry-more"><a href="${h.esc(directoryHref)}">${h.esc(label)} in the parliamentarians directory</a></p>` : ''}
    ${h.sourceLineHTML({
      updated, source: 'Parliamentary roster and recorded divisions',
      notes: [`A member is listed under ${h.esc(label)} when the roster records it as their party, now or before, or when the division records name them under it. The division records give each member their latest party label, so they say who sat for a party, not from when. Divisions are the votes recorded under this label.`],
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
      <span class="result-meta">${h.esc(detail)}</span>${top ? `<p class="snippet">Largest disclosed donors: ${top}${donors.length > 5 ? `, and ${(donors.length - 5).toLocaleString()} more` : ''}.</p>` : ''}</li>`;
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
