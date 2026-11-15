/**
 * One published search-catalogue record (a bill, member, program or other catalogue entry), read
 * by its catalog slug. Catalog slugs are positions in one built index (catalog-<n>), so search
 * results name the index version too (catalog-<version>-<n>): a slug from an older build is
 * refused rather than read as a different record. A slug without a version reads the current index.
 * Shared by the MCP read_record tool and the voice agent's read_record.
 */
export const CATALOG_SLUG = /^catalog-(?:([a-f0-9]{16})-)?(\d{1,8})$/

/** Reads one published JSON file under the site's assets; `records` allows a top-level record list. */
export type CatalogRead = (path: string, maxBytes: number, records: boolean) => Promise<Record<string, unknown>>

export class CatalogRecordError extends Error {
  constructor(readonly status: 404 | 409, message: string) { super(message) }
}

export const CATALOG_MISSING = 'This catalogue record is not available. Search again.'
export const CATALOG_CHANGED = 'The record catalogue has changed. Search again to get its current identifier.'

export async function readCatalogRecord(slug: string, read: CatalogRead): Promise<{ record: Record<string, unknown>, coverage: unknown }> {
  const match = CATALOG_SLUG.exec(slug)
  if (!match) throw new CatalogRecordError(404, CATALOG_MISSING)
  const manifest = await read('/search-catalog/manifest.json', 20_000, false)
  const size = Number(manifest.recordShardSize), count = Number(manifest.count), id = Number(match[2]), version = String(manifest.version)
  if (!/^[a-f0-9]{16}$/.test(version) || !Number.isSafeInteger(size) || size < 1 || size > 2000 || !Number.isSafeInteger(count) || id >= count) throw new CatalogRecordError(404, CATALOG_MISSING)
  if (match[1] && match[1] !== version) throw new CatalogRecordError(409, CATALOG_CHANGED)
  const shard = await read('/search-catalog/' + version + '/records-' + Math.floor(id / size) + '.json', 2_000_000, true)
  const list = Array.isArray(shard.records) ? shard.records : []
  const record = list[id % size] as Record<string, unknown> | undefined
  if (!record || typeof record !== 'object' || Array.isArray(record) || record.slug !== 'catalog-' + id) throw new CatalogRecordError(404, CATALOG_MISSING)
  return { record, coverage: manifest.coverage }
}

/** A search result's catalog slug, pinned to the index version the search read. Other slugs pass through. */
export function versionedCatalogSlug(slug: unknown, version: unknown): unknown {
  return typeof slug === 'string' && /^catalog-\d{1,8}$/.test(slug) && typeof version === 'string' && /^[a-f0-9]{16}$/.test(version)
    ? slug.replace('catalog-', 'catalog-' + version + '-')
    : slug
}
