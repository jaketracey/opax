/* Homepage adapters: source exports, never editorial selections. Each block's
   figures carry the date of the export they came from, in its source line. */
import {shortDate} from './format.js';
const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const count = value => Number(value).toLocaleString('en-AU');
const date = value => shortDate(String(value).slice(0,10));
const jur = value => ({federal:'Federal',nsw:'New South Wales',vic:'Victoria',qld:'Queensland',sa:'South Australia',act:'ACT'}[value] || value);
const href = (kind, name) => `/subject/${kind}/${encodeURIComponent(name)}`;
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
// The markup app.js writes between "labels:begin" and "labels:end" (pass 2C);
// the homepage cannot load app.js, so it keeps this copy, and
// test/home-data.test.mjs holds the two to the same output.
const PARTY_MAP = {
  'labor': ['alp','ALP'], 'liberal': ['lib','LIB'], 'nationals': ['nat','NAT'],
  'lnp': ['lnp','LNP'], 'country liberal party': ['nat','CLP'],
  'greens': ['grn','GRN'], 'one nation': ['onp','ONP'], 'independent': ['ind','IND'],
  'centre alliance': ['oth','CA'], "katter's australian party": ['oth','KAP'],
  'united australia party': ['oth','UAP'], 'australian democrats': ['oth','AD'],
  'family first': ['oth','FF'], 'dlp': ['oth','DLP'], 'jln': ['oth','JLN'],
};
const PARTY_NAMES = {
  ALP: ['Labor','Australian Labor Party'], LIB: ['Liberal','Liberal Party'],
  NAT: ['Nationals','The Nationals'], LNP: ['LNP','Liberal National Party'],
  CLP: ['CLP','Country Liberal Party'], GRN: ['Greens','Australian Greens'],
  ONP: ['One Nation',"Pauline Hanson's One Nation"], IND: ['Independent','Independent'],
  CA: ['Centre Alliance','Centre Alliance'], KAP: ['KAP',"Katter's Australian Party"],
  UAP: ['UAP','United Australia Party'], AD: ['Democrats','Australian Democrats'],
  FF: ['Family First','Family First'], DLP: ['DLP','Democratic Labour Party'],
  JLN: ['JLN','Jacqui Lambie Network'],
};
const PARTY_PLACEHOLDER = /^(?:not recorded|unknown|none|n\/?a|-|—)$/i;
/** PartyLabel: a dot beside the party's short name, the full name spoken. */
export function partyLabelHTML(party) {
  const name = String(party ?? '').trim();
  if (!name || PARTY_PLACEHOLDER.test(name)) return '';
  const hit = PARTY_MAP[name.toLowerCase()];
  const [shown, long] = (hit && PARTY_NAMES[hit[1]]) || [name, name];
  const text = shown === long ? esc(shown)
    : `<span aria-hidden="true">${esc(shown)}</span><span class="visually-hidden">${esc(long)}</span>`;
  return `<span class="ui-party party party-${hit ? hit[0] : 'oth'}"${shown === long ? '' : ` title="${esc(long)}"`}><i aria-hidden="true"></i>${text}</span>`;
}
/** StatusLabel: one word with a tone: done, active, ended or draft. */
export function statusLabelHTML(word, tone = 'ended') {
  return word ? `<span class="ui-status" data-tone="${esc(tone)}">${esc(word)}</span>` : '';
}
const SOURCE_GLYPH = '<svg class="ui-source-glyph" viewBox="0 0 16 16" aria-hidden="true"><path d="M4 1.75h5.25L12.5 5v9.25h-8.5z"/><path d="M9 1.75V5.25h3.5M6.25 8.5h4M6.25 11h4"/></svg>';
/** SourceLine, one per block: "Updated 4 Oct 2026 · AEC annual returns", opening
 *  the originals, as-at, notes and licence. `notes` and `licence` are HTML. */
export function sourceLineHTML({ updated = '', source = '', state = '', originals = [], asAt = '', notes = [], licence = '' } = {}) {
  const when = updated ? esc(`Updated ${date(updated)}`) : '';
  const what = source ? `<span class="ui-source-name">${esc(source)}</span>` : '';
  const line = [when, what].filter(Boolean).join(' · ') || '<span class="ui-source-name">Sources and notes</span>';
  const links = originals.map((o) => {
    const external = typeof o?.href === 'string' && /^https?:\/\//i.test(o.href) ? o.href : null;
    const target = external || (/^\/(?!\/)/.test(o?.href || '') ? o.href : null);
    return target && `<li><a href="${esc(target)}"${external ? ' rel="noopener" target="_blank"' : ''}>${
      esc(o.label || 'View original')}${external ? ' ↗︎' : ''}</a></li>`;
  }).filter(Boolean);
  const kept = notes.filter(Boolean);
  const sheet = [
    links.length ? `<ul class="ui-sheet-originals">${links.join('')}</ul>` : '',
    asAt ? `<p class="ui-sheet-asat">${esc(asAt)}</p>` : '',
    kept.length ? `<div class="ui-sheet-notes">${kept.map((n) => `<p>${n}</p>`).join('')}</div>` : '',
    licence ? `<p class="ui-sheet-licence">${licence}</p>` : '',
  ].join('');
  return `<details class="ui-pop ui-source"${state ? ` data-state="${esc(state)}"` : ''}><summary>${SOURCE_GLYPH}` +
    `<span class="ui-source-text">${line}</span>${state ? `<span class="ui-source-state">· ${esc(state)}</span>` : ''}</summary>` +
    `<div class="ui-sheet">${sheet || '<p>No further notes for this source.</p>'}</div></details>`;
}

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
 *  declared, then what it is, when the register recorded it and the register. */
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
    `${source ? ` · <a href="${esc(source)}" rel="noopener" target="_blank" aria-label="Register entry for ${esc(name)}">Register <span aria-hidden="true">↗︎</span></a>` : ''}</p>` +
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
