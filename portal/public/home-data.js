/* Homepage adapters: source exports and live index endpoints, never editorial selections. */
const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const count = value => Number(value).toLocaleString('en-AU');
const cash = value => Number(value).toLocaleString('en-AU', {style:'currency', currency:'AUD', maximumFractionDigits:0});
const date = value => new Date(String(value).slice(0,10) + 'T12:00:00').toLocaleDateString('en-AU', {day:'numeric',month:'short',year:'numeric'});
const jur = value => ({federal:'Federal',nsw:'New South Wales',vic:'Victoria',qld:'Queensland',sa:'South Australia'}[value] || value);
const href = (kind, name) => `/subject/${kind}/${encodeURIComponent(name)}`;
const read = async url => { const response = await fetch(url); if (!response.ok) throw Error('Data unavailable'); return response.json(); };
export function newest(items, key, limit) {
  return items.filter(item => item[key]).slice().sort((a,b) => String(b[key]).localeCompare(String(a[key]))).slice(0,limit);
}
export function dailySelection(items, key, limit, now = new Date()) {
  const day = new Intl.DateTimeFormat('en-CA', {timeZone:'Australia/Melbourne',year:'numeric',month:'2-digit',day:'2-digit'}).format(now);
  let seed = 2166136261;
  for (const c of `ency:${day}`) seed = Math.imul(seed ^ c.charCodeAt(0),16777619) >>> 0;
  const rows = [...items].sort((a,b) => key(a).localeCompare(key(b),'en'));
  for (let i=rows.length-1;i>0;i--) {
    seed = (Math.imul(seed,1664525)+1013904223) >>> 0;
    const j = Math.floor(seed / 4294967296 * (i+1));
    [rows[i],rows[j]] = [rows[j],rows[i]];
  }
  return rows.slice(0,limit);
}
export function safeSource(url) {
  try { const value = new URL(url); return ['https:','http:'].includes(value.protocol) ? value.href : null; } catch { return null; }
}
function time(value) { return `<time datetime="${esc(String(value).slice(0,10))}">${esc(date(value))}</time>`; }
function unavailable(root, label, destination) {
  root.innerHTML = `<li class="hp-meta">${esc(label)} could not load. <a href="${destination}">Browse the collection →</a></li>`;
}

export async function hydrateCollections() {
  const jobs = [
    (async () => {
      const cells = document.querySelectorAll('.hp-counts dd');
      const note = document.querySelector('[data-home-count-note]');
      const [stats, corpus] = await Promise.allSettled([read('/api/stats'),read('/corpus.json')]);
      if (stats.status === 'fulfilled') {
        cells[0].textContent = Number.isFinite(stats.value.resources) ? count(stats.value.resources) : 'Unavailable';
        cells[1].textContent = Number.isFinite(stats.value.paragraphs) ? count(stats.value.paragraphs) : 'Unavailable';
      } else { cells[0].textContent = cells[1].textContent = 'Unavailable'; }
      if (corpus.status === 'fulfilled') {
        cells[2].textContent = count(corpus.value.collected_speeches);
        const aec = corpus.value.sources.find(s => s.name.startsWith('AEC donations'));
        cells[3].textContent = aec ? count(aec.docs) : 'Unavailable';
      } else { cells[2].textContent = cells[3].textContent = 'Unavailable'; }
      note.textContent = stats.status === 'fulfilled' && corpus.status === 'fulfilled'
        ? `Live index and corpus manifest ${corpus.value.version}. ` : 'Some collection counts could not load. ';
    })(),
    (async () => {
      const root = document.querySelector('[aria-labelledby="hp-bills-title"] ol');
      try {
        const rows = newest((await read('/bills/index.json')).bills,'introduced',3);
        root.innerHTML = rows.map(b => `<li><p class="hp-meta">Introduced ${time(b.introduced)} · ${esc(jur(b.jurisdiction))}</p><h3><a href="/bill/${encodeURIComponent(b.key)}">${esc(b.short_title || b.title)}</a></h3><p>${esc([String(b.status || '').replaceAll('_',' ').replace(/^./,c=>c.toUpperCase()),b.portfolio].filter(Boolean).join(' · '))}</p></li>`).join('') || '<li>No bills recorded yet.</li>';
      } catch { unavailable(root,'Recent bills','/bills'); }
    })(),
    (async () => {
      const root = document.querySelector('[aria-labelledby="hp-declared-title"] ol');
      try {
        const rows = newest((await read('/interests/recent.json')).items,'date',3);
        root.innerHTML = rows.map(item => `<li><p class="hp-meta">Recorded ${time(item.date)} · ${esc(jur(item.jurisdiction))}${item.kind === 'deletion' ? ' · Removed from register' : ''}</p><h3><a href="${href('person',item.name)}">${esc(item.name)}</a></h3><p>${esc(item.description)}</p>${safeSource(item.url) ? `<a class="hp-source" href="${esc(safeSource(item.url))}">Parliamentary register ↗</a>` : ''}</li>`).join('') || '<li>No declarations recorded yet.</li>';
      } catch { unavailable(root,'Recent declarations','/declared'); }
    })(),
    (async () => {
      const root = document.querySelector('.hp-indexed-list');
      try {
        const rows = newest((await read('/api/recent')).items,'indexed',4);
        root.innerHTML = rows.map(item => `<li><p class="hp-meta">Indexed ${time(item.indexed)}</p><a href="/doc/${encodeURIComponent(item.slug)}">${esc(item.title || item.slug)}</a></li>`).join('') || '<li>No recently indexed records available.</li>';
      } catch { unavailable(root,'Newly indexed records','/ask?view=search'); }
    })(),
    (async () => {
      const rows = (await read('/reports/index.json')).reports.slice().sort((a,b)=>a.title.localeCompare(b.title));
      document.querySelector('.hp-report-list').innerHTML = rows.map(r => `<article class="hp-report" data-report><h3><a href="/reports/${encodeURIComponent(r.slug)}">${esc(r.title)}</a></h3><p>${esc(r.blurb)}</p></article>`).join('');
    })(),
  ];
  await Promise.allSettled(jobs);
}
const partyMap = {Labor:['alp','ALP'],Liberal:['lib','LIB'],Nationals:['nat','NAT'],Greens:['grn','GRN'],Independent:['ind','IND'],LNP:['lnp','LNP'],'One Nation':['onp','ONP']};
function party(value) { const [key,label] = partyMap[value] || ['oth',value]; return value ? `<span class="party party-${key}"><i aria-hidden="true"></i>${esc(label)}</span>` : ''; }
function votes(label, rows) { return rows?.length ? `<div><h3>${label}</h3><ul>${rows.slice(0,2).map(row=>`<li><span>${esc(row.name)}</span><time>${esc(String(row.date || '').slice(0,4))}</time></li>`).join('')}</ul></div>` : ''; }
function card(kind, body, url, label='Open the entry →') { return `<article class="hp-ency-card" data-record-type="${kind}">${body}<a class="hp-ency-open" href="${esc(url)}">${label}</a></article>`; }
function facts(rows) { return `<dl class="hp-record-facts">${rows.map(([k,v])=>`<div><dt>${k}</dt><dd>${esc(v)}</dd></div>`).join('')}</dl>`; }

export async function hydrateRecordCards(onChange) {
  const track = document.querySelector('#hp-ency-track');
  const groups = await Promise.allSettled([
    (async () => {
      const [photos, ballots] = await Promise.all([read('/photos/people.json'),read('/votes.json')]);
      // Official portrait-backed voting records; Wikimedia credits remain on profile pages.
      const pool = Object.values(ballots).filter(p => p?.name && /^\d+$/.test(photos[p.name.toLowerCase()] || '') && (p.for?.length || p.against?.length));
      return dailySelection(pool,p=>p.name,8).map(p => card('parliamentarian', `<div class="hp-ency-head"><img src="/photos/${encodeURIComponent(photos[p.name.toLowerCase()])}.webp" alt="" width="64" height="64" loading="lazy"><div><span class="hp-meta">Parliamentarian</span><h3><a href="${href('person',p.name)}">${esc(p.name)}</a></h3>${party(p.party)}</div></div><div class="hp-ency-votes">${votes('Voted for',p.for)}${votes('Voted against',p.against)}</div><p class="hp-meta">${count(p.divisions_total)} recorded votes${p.years ? `, ${esc(p.years[0])} to ${esc(p.years[1])}` : ''}</p>`,href('person',p.name)));
    })(),
    (async () => {
      const graph = await read('/graph/money.json');
      return dailySelection(graph.nodes.filter(n=>n.kind==='donor'),n=>n.id,1).map(n => card('donor',`<div><span class="hp-meta">Donor</span><h3><a href="${href('donor',n.label)}">${esc(n.label)}</a></h3></div><p>${cash(n.total)} disclosed to parties.</p><p class="hp-meta">${esc(n.firstYear)} to ${esc(n.lastYear)}</p>`,href('donor',n.label)));
    })(),
    (async () => {
      const graph = await read('/graph/grants.federal.json');
      const selected = dailySelection(graph.programs.filter(p=>p.key && p.c),p=>p.key,1)[0];
      if (!selected) return [];
      const p = await read(`/grants/federal/programs/${encodeURIComponent(selected.key)}.json`);
      const url = '/money/grants?' + new URLSearchParams({jur:'federal',program:p.id});
      const program = card('program',`<div><span class="hp-meta">Program · Federal</span><h3><a href="${esc(url)}">${esc(p.n)}</a></h3></div><p class="hp-record-amount">${cash(p.t)}<span>Recorded award value · ${esc(p.y0)} to ${esc(p.y1)}</span></p>${facts([['Awards',count(p.c)],['Recipients',count(p.r)]])}<p class="hp-meta">GrantConnect</p>`,url,'Explore program →');
      const g = dailySelection((p.grants || []).filter(g=>g.guid),g=>g.id,1)[0];
      if (!g) return [program];
      const source = `https://www.grants.gov.au/Ga/Show/${encodeURIComponent(g.guid)}`;
      const grant = card('grant',`<div><span class="hp-meta">Grant · Federal</span><h3><a href="${source}">${esc(g.rn || g.n)}</a></h3></div><p class="hp-record-amount">${cash(g.v)}<span>Published award value</span></p><dl class="hp-record-facts"><div><dt>Program</dt><dd><a href="${esc(url)}">${esc(p.n)}</a></dd></div><div><dt>Financial year</dt><dd>${esc(g.fy)}</dd></div></dl>`,source,'View grant record ↗');
      return [grant,program];
    })(),
  ]);
  const [people,donors,grants] = groups.map(result=>result.status==='fulfilled' ? result.value : []);
  const cards = [...people.slice(0,1),...grants,...donors,...people.slice(1)];
  track.innerHTML = cards.join('') || '<p class="hp-meta">Record previews could not load. Browse the collections above.</p>';
  onChange();
}
