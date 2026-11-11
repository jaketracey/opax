/**
 * /suppliers.json (about 7.6 MB) split by the two hex digits after a supplier id's "s-", the
 * same digits that name its profile shard (/suppliers/<xx>.json), so a server-rendered supplier
 * page and its head read about 30 KB instead of parsing the whole index on a cold isolate.
 * scripts/build_growth_modules.mjs writes all 256 buckets at release, each with the index's
 * generated_at and source. A reader falls back to /suppliers.json when a bucket is unreadable or
 * does not hold the id, so a name lookup or a 404 still sees every row.
 */
export const SUPPLIER_ID_RE = /^s-[a-f0-9]{20}$/;
export const SUPPLIER_ROW_BUCKETS = 256;
/** The bucket for a supplier id or a two-digit hex prefix. */
export const supplierRowsPath = (id) => `/growth/supplier-rows/${String(id).replace(/^s-/, '').slice(0, 2)}.json`;
/** The index's meta alone (totals, dates, source): what the money summary pages print. */
export const SUPPLIERS_META_PATH = '/growth/supplier-rows/meta.json';
