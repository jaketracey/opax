/* When the connections data is from: the day its evidence export was built
   (generated_at in /evidence/stats.json and in /evidence/index.json's meta),
   as a Sydney calendar day. The connections pages and the Worker's connection
   tools all read it here, so every surface names the same day, and a rebuilt
   export moves the date with no code change. The layer is rebuilt on its own
   schedule: docs/operations/nightly-refresh.md, "Connections rebuild". */
import { shortDate } from './format.js';
import { sourceLineHTML } from './labels.js?v=9dc97707be';

const SYDNEY_DAY = new Intl.DateTimeFormat('en-CA', {timeZone: 'Australia/Sydney', year: 'numeric', month: '2-digit', day: '2-digit'});
const SOURCES = 'Speeches, official releases and grant records';

/** "2026-09-08" from the export's metadata, or '' when it carries no valid build time. */
export function evidenceAsAt(meta) {
  const stamp = meta && typeof meta === 'object' ? meta.generated_at : undefined;
  const time = typeof stamp === 'string' ? Date.parse(stamp) : NaN;
  return Number.isFinite(time) ? SYDNEY_DAY.format(time) : '';
}

/** The day the connections run to, said once at the foot of a block: the house
 *  "Updated <date> · <source>" SourceLine, its sheet holding the long date, the
 *  counts read and the figures' file. With `plain`, the same words as one note
 *  line, for the money map's card, which draws no popovers. '' without a dated
 *  export. */
export function evidenceDateHTML(meta, {plain = false} = {}) {
  const day = evidenceAsAt(meta);
  if (!day) return '';
  if (plain) return `<p class="evidence-as-at">Updated ${shortDate(day)} · ${SOURCES}</p>`;
  const long = new Date(`${day}T00:00:00Z`).toLocaleDateString('en-AU', {day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC'});
  const counts = meta.source_records || {};
  const count = (value) => (Number.isFinite(Number(value)) && value != null ? Number(value).toLocaleString('en-AU') : null);
  return sourceLineHTML({updated: day, source: SOURCES,
    asAt: `Connections from records collected to ${long}.`,
    facts: [['Speech records', count(counts.speeches)], ['Official releases', count(counts.ext_press_releases)], ['Grant records', count(counts.government_grants)]],
    originals: [{label: 'Coverage figures (JSON)', href: '/evidence/stats.json'}]});
}
