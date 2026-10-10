import {subjectUrl} from './canonical-urls.js?v=225d5915ea';
/* Homepage adapters: source exports, never editorial selections. Each block's
   figures carry the date of the export they came from, in its source line. */
import {shortDate} from './format.js';
import {partyLabelHTML, statusLabelHTML, sourceLineHTML} from './labels.js?v=804befe8de';
const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const count = value => Number(value).toLocaleString('en-AU');
const date = value => shortDate(String(value).slice(0,10));
const jur = value => ({federal:'Federal',nsw:'New South Wales',vic:'Victoria',qld:'Queensland',sa:'South Australia',act:'ACT'}[value] || value);
const href = (kind, name) => subjectUrl(kind,name);
const read = async (url, init) => { const response = await fetch(url, init); if (!response.ok) throw Error('Data unavailable'); return response.json(); };
// who-is-who files revalidate on every load (app.js loadPhotoMap says why)
const IDENTITY = { cache: 'no-cache' };
export function newest(items, key, limit) {
  return items.filter(item => item[key]).slice().sort((a,b) => String(b[key]).localeCompare(String(a[key]))).slice(0,limit);
}
export function safeSource(url) {
  try { const value = new URL(url); return ['https:','http:'].includes(value.protocol) ? value.href : null; } catch { return null; }
}
function time(value) { return `<time datetime="${esc(String(value).slice(0,10))}">${esc(date(value))}</time>`; }

// --- labels and source lines ---------------------------------------------------
// The site's one copy (labels.js), shared with app.js and the electorate pages.
export { partyLabelHTML, statusLabelHTML, sourceLineHTML };

// --- rows -------------------------------------------------------------------------
const BILL_STATUS = {
  before_parliament: ['Before parliament','active'], passed: ['Passed','done'],
  lapsed: ['Lapsed','ended'], exposure_draft: ['Exposure draft','draft'],
};
/** BillRow: status and date, the title, the portfolio. */
export function billRowHTML(b) {
  const raw = String(b.status || '').replaceAll('_',' ');
  const [word, tone] = BILL_STATUS[b.status] || [raw.replace(/^./, c => c.toUpperCase()), 'ended'];
  const when = `${b.status === 'exposure_draft' ? 'Released' : 'Introduced'} ${time(b.introduced)}${b.jurisdiction && b.jurisdiction !== 'federal' ? ` · ${esc(jur(b.jurisdiction))}` : ''}`;
  return `<li class="hp-row"><p class="hp-row-meta">${statusLabelHTML(word, tone)} <span>${when}</span></p>` +
    `<h3 class="hp-row-title"><a href="/bill/${encodeURIComponent(b.key)}">${esc(b.short_title || b.title)}</a></h3>` +
    `${b.portfolio ? `<p class="hp-row-detail">${esc(b.portfolio)}</p>` : ''}</li>`;
}
const DECLARED_KINDS = {
  shareholdings: 'Shareholding', real_estate: 'Real estate', trusts: 'Trust',
  directorships: 'Directorship', gifts: 'Gift', travel: 'Sponsored travel or hospitality',
  memberships: 'Membership or office', liabilities: 'Liability', other: 'Other interest',
};
/** PersonRow for a register entry: portrait, name and party, the entry as
 *  declared, then what it is, when the register recorded it and the register.
 *  No ↗ per row (principle 10): the register link says where it goes. */
export function declarationRowHTML(item, { photos = {}, parties = new Map() } = {}) {
  const name = String(item.name || '');
  // Official portraits only: a Commons portrait's credit belongs beside it, on the profile.
  const key = photos[name.toLowerCase()];
  const portrait = /^\d+$/.test(key || '')
    ? `<img class="hp-portrait" src="/photos/${encodeURIComponent(key)}.webp" alt="" width="44" height="44" loading="lazy" decoding="async">`
    : '<span class="hp-portrait" aria-hidden="true"></span>';
  const source = safeSource(item.url);
  const kind = DECLARED_KINDS[item.bucket] || 'Other interest';
  const party = partyLabelHTML(parties.get(name.toLowerCase()));
  return `<li class="hp-row hp-person-row">${portrait}<div class="hp-row-body">` +
    `<div class="hp-row-who"><h3 class="hp-row-name"><a href="${href('person', name)}">${esc(name)}</a></h3>${party}</div>` +
    `<p class="hp-row-text">“${esc(item.description)}”</p>` +
    `<p class="hp-row-detail">${item.kind === 'deletion' ? `${statusLabelHTML('Removed')} ` : ''}${esc(kind)} · <span>recorded ${time(item.date)}</span>` +
    `${source ? ` · <a href="${esc(source)}" rel="noopener" target="_blank" aria-label="Register entry for ${esc(name)}">Register</a>` : ''}</p>` +
    `</div></li>`;
}
export function reportCardHTML(r) {
  return `<li class="hp-report"><h3><a href="/reports/${encodeURIComponent(r.slug)}">${esc(r.title)}</a></h3><p>${esc(r.blurb)}</p></li>`;
}

// --- source lines per block ------------------------------------------------------
export function billsSourceHTML(index) {
  return sourceLineHTML({ updated: index.generated_at, source: 'Parliament of Australia', notes: [
    'Bills and their dates come from the parliamentary record; each bill page links the official source it was read from.',
    'A bill missing from this list is not evidence it does not exist: the register is still being built.',
  ] });
}
export function declarationsSourceHTML(meta) {
  return sourceLineHTML({ updated: meta?.generated, source: 'Registers of interests', asAt: meta?.source ? `${meta.source}.` : '', notes: [
    'Entries as declared, not verified by OPAX.',
    'The date is when the register recorded the entry, which can differ from the date of the gift or event. Each entry links to its page in the register.',
  ] });
}
/** "1998–99 to 2025–26" from the money export's coverage note. */
export function mapSpan(meta) {
  const m = /(\d{4})-(\d{2})\s+to\s+(\d{4})-(\d{2})/.exec(String(meta?.coverage || ''));
  return m ? `${m[1]}–${m[2]} to ${m[3]}–${m[4]}` : '';
}
export function mapSourceHTML(meta) {
  const span = mapSpan(meta);
  return sourceLineHTML({ updated: meta?.generated, source: 'AEC annual returns', state: 'totals are a floor',
    originals: [
      { label: 'AEC Transparency Register', href: 'https://transparency.aec.gov.au/' },
      { label: 'Funding records', href: '/money/receipts' },
      { label: 'Methods and coverage', href: '/methods' },
    ],
    asAt: span ? `Financial years ${span}.` : '',
    notes: [
      'Lines connect donors and the parties they gave to. The map shows the largest disclosed donors, not every donor.',
      'Totals are a floor: donations under the disclosure threshold are not reported.',
    ],
    licence: 'AEC Transparency Register returns, <a href="https://creativecommons.org/licenses/by/4.0/" rel="license noopener" target="_blank">CC BY 4.0 ↗︎</a>.' });
}
/** The map's industry groups, largest first by donors in the map. */
export function industryGroups(graph) {
  const counts = new Map();
  for (const node of graph?.nodes || []) {
    if (node.kind === 'donor' && node.group) counts.set(node.group, (counts.get(node.group) || 0) + 1);
  }
  return [...counts].map(([key, n]) => ({ key, label: key[0].toUpperCase() + key.slice(1), count: n }))
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label, 'en'));
}
/** The footer's coverage line: two dated figures and the full table. */
export function coverageLineHTML(corpus) {
  const link = '<a href="/stats">Sources and coverage</a>';
  const aec = corpus?.sources?.find?.(s => String(s.name).startsWith('AEC donations'));
  if (!corpus?.version || !Number.isFinite(corpus.collected_speeches) || !Number.isFinite(aec?.docs)) return link;
  return `${count(corpus.collected_speeches)} speeches and ${count(aec.docs)} donations classified, as at ${esc(date(corpus.version))} · ${link}`;
}

// --- hydration -------------------------------------------------------------------

/** Reports and the footer line: small files, read at once. */
export async function hydrateCollections() {
  await Promise.allSettled([
    (async () => {
      const rows = (await read('/reports/index.json')).reports.slice().sort((a,b)=>a.title.localeCompare(b.title,'en'));
      if (rows.length) document.querySelector('#hp-reports').innerHTML = rows.map(reportCardHTML).join('');
    })(),
    (async () => {
      const line = document.querySelector('#stats');
      try { if (line) line.innerHTML = coverageLineHTML(await read('/corpus.json')); }
      catch { if (line) line.innerHTML = coverageLineHTML(null); }
    })(),
  ]);
}

/** New bills and declarations: read when the block nears the screen. A failed
 *  read keeps the rows the page was published with, and their dated line. */
export async function hydrateLatest() {
  await Promise.allSettled([
    (async () => {
      const index = await read('/bills/index.json');
      const rows = newest(index.bills,'introduced',3);
      if (!rows.length) return;
      document.querySelector('#hp-bills').innerHTML = rows.map(billRowHTML).join('');
      document.querySelector('#hp-bills-source').innerHTML = billsSourceHTML(index);
    })(),
    (async () => {
      const [recent, photos, roster] = await Promise.allSettled([read('/interests/recent.json'), read('/photos/people.json', IDENTITY), read('/parliamentarians.json', IDENTITY)]);
      if (recent.status !== 'fulfilled') return;
      const rows = newest(recent.value.items,'date',3);
      if (!rows.length) return;
      // As the declarations page joins them: the roster's current party, else its recorded one.
      const parties = new Map();
      for (const p of roster.status === 'fulfilled' ? roster.value.people || [] : []) {
        const party = p.party_now || p.party;
        if (party) for (const n of [p.name, p.full]) if (n) parties.set(String(n).toLowerCase(), party);
      }
      const identity = { photos: photos.status === 'fulfilled' ? photos.value : {}, parties };
      document.querySelector('#hp-declared').innerHTML = rows.map(item => declarationRowHTML(item, identity)).join('');
      document.querySelector('#hp-declared-source').innerHTML = declarationsSourceHTML(recent.value.meta);
    })(),
  ]);
}
