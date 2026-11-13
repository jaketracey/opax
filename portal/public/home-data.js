import {subjectUrl} from './canonical-urls.js?v=bcc9a57bab';
/* Homepage adapters: source exports, never editorial selections. Each block's
   figures carry the date of the export they came from, in its source line. */
import {shortDate} from './format.js';
import {partyLabelHTML, statusLabelHTML, sourceLineHTML, coverageLineHTML} from './labels.js?v=6d2e2e9cd8';
const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const count = value => Number(value).toLocaleString('en-AU');
const date = value => shortDate(String(value).slice(0,10));
const jur = value => ({federal:'Federal',nsw:'New South Wales',vic:'Victoria',qld:'Queensland',sa:'South Australia',act:'ACT'}[value] || value);
const href = (kind, name) => subjectUrl(kind,name);
const read = async (url, init) => { const response = await fetch(url, {cache:"no-cache",...init}); if (!response.ok) throw Error('Data unavailable'); return response.json(); };
// who-is-who files revalidate on every load (app.js loadPhotoMap says why)
const IDENTITY = { cache: 'no-cache' };
export function newest(items, key, limit) {
  return items.filter(item => item[key]).slice().sort((a,b) => String(b[key]).localeCompare(String(a[key]))).slice(0,limit);
}
/** The home page's newest bills, read from a small file rather than /bills/index.json (1.8 MB):
 *  the index's date and its LATEST_BILLS newest bills, with the fields billRowHTML reads.
 *  scripts/build_growth_modules.mjs writes it at release. */
export const LATEST_BILLS = 3;
export const NEWEST_BILLS_PATH = '/growth/newest-bills.json';
const NEWEST_BILL_FIELDS = ['key','title','short_title','status','introduced','jurisdiction','portfolio'];
/** /bills/index.json -> the file the home page reads. */
export function newestBillsFile(index) {
  if (!Array.isArray(index?.bills)) throw new Error('newest bills: no bills');
  return {generated_at: index.generated_at, bills: newest(index.bills,'introduced',LATEST_BILLS)
    .map(bill => Object.fromEntries(NEWEST_BILL_FIELDS.filter(k => bill[k] !== undefined).map(k => [k, bill[k]])))};
}
/** The newest-bills file, or the whole index when it is unreadable. */
export async function latestBillsSource(read) {
  const small = await read(NEWEST_BILLS_PATH).catch(() => null);
  return Array.isArray(small?.bills) ? small : read('/bills/index.json');
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
    // Each dot sits inside the unbroken part after it, so a wrapped line never ends in one.
    `<p class="hp-row-detail">${item.kind === 'deletion' ? `${statusLabelHTML('Removed')} ` : ''}${esc(kind)} <span>· recorded ${time(item.date)}</span>` +
    `${source ? ` <span>· <a href="${esc(source)}" rel="noopener" target="_blank" aria-label="Register entry for ${esc(name)}">Register</a></span>` : ''}</p>` +
    `</div></li>`;
}
export function reportCardHTML(r) {
  return `<li class="hp-report"><h3><a href="/reports/${encodeURIComponent(r.slug)}">${esc(r.title)}</a></h3><p>${esc(r.blurb)}</p></li>`;
}

// --- source lines per block ------------------------------------------------------
// "Updated" is the date of the export the block's rows came from, which the nightly rewrites only when its
// content changes. It is not a source check: corpus.json's refresh block says when the site was last refreshed
// and which sources are paused (the honest OPAX agent refused; records retained), and the line says so.
let refreshRead;
/** corpus.json's `refresh` block, read once per page; null when unreadable. */
export function refreshInfo() {
  return refreshRead ??= read('/corpus.json').then(corpus => corpus?.refresh || null).catch(() => null);
}
/** The state and sheet facts a block's source line owes the reader for the sources it draws on. */
export function sourceFreshness(refresh, sources = []) {
  const paused = sources.map(name => [name, refresh?.source_access?.[name]]).filter(([, access]) => access?.status === 'paused');
  const facts = [];
  if (refresh?.checked_at) facts.push(['Site refreshed', esc(date(refresh.checked_at))]);
  for (const [name, access] of paused) {
    facts.push(['Source check', esc(`${access.host || name}: paused, ${access.reason || 'access refused'}. Entries shown are retained from the last successful read, not a current check.`)]);
  }
  // A paused source reads as the date of its last good read on the line ("Last checked 4 Oct 2026");
  // the sheet keeps why it is paused.
  return { state: '', dateLabel: paused.length ? 'Last checked' : 'Updated', facts };
}
export function billsSourceHTML(index, refresh = null) {
  const freshness = sourceFreshness(refresh, ['bills']);
  return sourceLineHTML({ updated: index.generated_at, dateLabel: freshness.dateLabel, source: 'Parliament of Australia', facts: freshness.facts, notes: [
    'Bills and their dates come from the parliamentary record; each bill page links the official source it was read from.',
    'A bill missing from this list is not evidence it does not exist: the register is still being built.',
  ] });
}
export function declarationsSourceHTML(meta, refresh = null) {
  const freshness = sourceFreshness(refresh, ['interests_federal', 'interests_qld']);
  return sourceLineHTML({ updated: meta?.generated, dateLabel: freshness.dateLabel, source: 'Registers of interests', facts: freshness.facts, asAt: meta?.source ? `${meta.source}.` : '', notes: [
    'Entries as declared, not verified by OPAX.',
    'The date is when the register recorded the entry, which can differ from the date of the gift or event. Each entry links to its page in the register.',
  ] });
}
/** "1998–99 to 2025–26" from the money export's coverage note. */
export function mapSpan(meta) {
  const m = /(\d{4})-(\d{2})\s+to\s+(\d{4})-(\d{2})/.exec(String(meta?.coverage || ''));
  return m ? `${m[1]}–${m[2]} to ${m[3]}–${m[4]}` : '';
}
export function mapSourceHTML(meta, refresh = null) {
  const span = mapSpan(meta);
  const freshness = sourceFreshness(refresh);
  return sourceLineHTML({ updated: meta?.generated, source: 'AEC annual returns', state: 'totals are a floor', facts: freshness.facts,
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
/** The footer's coverage line (labels.js): one line on every page. */
export { coverageLineHTML };

// --- whether parliament sits today ------------------------------------------------
// /parliament/sitting-days.json (docs/DATA-SITTING-DAYS.md) is the Parliament's published calendar as dated
// flags. Outside its coverage, after it expires, or in any shape this does not expect, sitting is unknown and
// there is no line: never a guess.
const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;
const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
/** Today's calendar date in Sydney, as the file's dates are. */
export const sydneyToday = (now = new Date()) => new Intl.DateTimeFormat('en-CA', { timeZone: 'Australia/Sydney' }).format(now);
/** "Monday 23 November" for an ISO day. */
function longDay(iso) {
  const [y, m, d] = iso.split('-').map(Number);
  return `${WEEKDAYS[new Date(Date.UTC(y, m - 1, d)).getUTCDay()]} ${d} ${MONTH_NAMES[m - 1]}`;
}
/** The home page's sitting line for `today` (YYYY-MM-DD, Sydney), or null when the calendar cannot say. */
export function sittingLine(calendar, today) {
  if (!calendar || calendar.schema_version !== 1 || calendar.timezone !== 'Australia/Sydney' || !ISO_DAY.test(today || '')) return null;
  const { first, last } = calendar.coverage || {};
  if (!ISO_DAY.test(first || '') || !ISO_DAY.test(last || '') || today < first || today > last) return null;
  if (!ISO_DAY.test(calendar.expires || '') || today > calendar.expires) return null;
  if (!Array.isArray(calendar.days)) return null;
  const days = calendar.days.filter(d => d && ISO_DAY.test(d.date || '') && (d.house === true || d.senate === true));
  const now = days.find(d => d.date === today);
  if (now) return { href: '/sitting', text: now.house && now.senate ? 'Parliament is sitting today'
    : now.senate ? 'The Senate is sitting today' : 'The House of Representatives is sitting today' };
  const next = days.filter(d => d.date > today && d.date <= last).sort((a, b) => a.date.localeCompare(b.date))[0];
  return next ? { href: '/sitting', text: `Next sitting day: ${longDay(next.date)}` } : null;
}
/** Fills the line above the home page's title; it stays hidden when the calendar is missing or out of range. */
export async function hydrateSitting(slot = document.querySelector('#hp-sitting'), today = sydneyToday()) {
  if (!slot) return;
  const line = sittingLine(await read('/parliament/sitting-days.json').catch(() => null), today);
  if (!line) { slot.hidden = true; slot.innerHTML = ''; return; }
  slot.innerHTML = `<a href="${esc(line.href)}">${esc(line.text)}</a>`;
  slot.hidden = false;
}

// --- hydration -------------------------------------------------------------------

/** Reports and the footer line: small files, read at once. */
export async function hydrateCollections() {
  await Promise.allSettled([
    (async () => {
      // The block is published with the reports only (REPORTS_ENABLED).
      const grid = document.querySelector('#hp-reports');
      if (!grid) return;
      const rows = (await read('/reports/index.json')).reports.slice().sort((a,b)=>a.title.localeCompare(b.title,'en'));
      if (rows.length) grid.innerHTML = rows.map(reportCardHTML).join('');
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
  const refresh = await refreshInfo();
  await Promise.allSettled([
    (async () => {
      const index = await latestBillsSource(read);
      const rows = newest(index.bills,'introduced',LATEST_BILLS);
      if (!rows.length) return;
      document.querySelector('#hp-bills').innerHTML = rows.map(billRowHTML).join('');
      document.querySelector('#hp-bills-source').innerHTML = billsSourceHTML(index, refresh);
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
      document.querySelector('#hp-declared-source').innerHTML = declarationsSourceHTML(recent.value.meta, refresh);
    })(),
  ]);
}
