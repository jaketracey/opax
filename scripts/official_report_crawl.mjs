import { REPORT_COLLECTIONS } from '../portal/public/official-reports-model.js';
import { REPORT_SLUG } from '../portal/src/report-records.ts';

const publicRecord = record => record && record.public !== false && record.published !== false
  && !record.withdrawn && !record.withdrawn_at
  && (!record.visibility || record.visibility === 'public')
  && !/^(?:withdrawn|private|draft|unpublished|non-public)$/i.test(record.status || '');
const day = value => String(value || '').replace(/^(\d{4})(\d{2})(\d{2})$/, '$1-$2-$3');

/** Discover only records in the public collection indexes, never arbitrary JSON
 * files or the separately gated /reports investigations. Use the page's own
 * date, with its snapshot as the fallback for records without a published day. */
export async function officialReportCrawlEntries(read) {
  const summary = await read('/report-records/index.json');
  if (!summary) return [];
  if (summary.schema !== 1 || !Array.isArray(summary.collections)) throw new Error('Invalid official report catalogue');
  const entries = [];
  for (const collection of summary.collections) {
    const type = collection.type;
    if (!REPORT_COLLECTIONS[type]) throw new Error('Unknown official report collection');
    const index = await read(`/report-records/index-${type}.json`);
    if (index?.schema !== 1 || index.type !== type || !Array.isArray(index.rows)) throw new Error('Invalid official report collection');
    const rows = type === 'annual_report' ? index.rows.filter(publicRecord).flatMap(row => row.years || []) : index.rows;
    for (const row of rows.filter(publicRecord)) {
      if (!REPORT_SLUG.test(row.slug || '') || row.slug.length > 260 || !row.slug.startsWith(type.replace(/_/g, '-') + '-')) throw new Error('Invalid official report slug');
      const record = await read(`/report-records/${row.slug}.json`);
      if (!record) throw new Error('Official report record unavailable');
      if (!publicRecord(record) || !publicRecord(record.record || {})) continue;
      if (record.schema !== 1 || record.kind !== 'report' || record.slug !== row.slug || record.report_type !== type) throw new Error('Invalid official report record');
      entries.push({path: `/report/${record.slug}`, date: day(record.date), updated: day(record.updated_at), snapshot: day(record.snapshot_at || index.snapshot_at)});
    }
  }
  return entries;
}
