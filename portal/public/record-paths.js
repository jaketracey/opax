// Which public record a /support?record=<path> report is about. A path counts
// only when it is exactly the page of a record OPAX publishes: the search
// catalog's records, indexed by path at build time (scripts/build_search_catalog.mjs
// writes search-catalog/<version>/paths-<n>.json), and a person's slug
// address used by the catalog. Anything else, and any
// failure to look it up, leaves the report general, with no path in it.
// Shared by the build, /support (app.js imports it lazily) and the tests.

export const RECORD_PATH_SHARDS = 256;

/**
 * The first filter, before any lookup: the path alone (no query, no
 * fragment), each segment decoded exactly once and encoded again, so
 * legacy name addresses meet their canonical slug address.
 * Refused, as "": a segment that is empty, "." or "..", or that still holds
 * an escape, a slash, a backslash or a control character once decoded.
 */
export function canonicalRecordPath(raw) {
  const cut = String(raw ?? '').split(/[?#]/)[0];
  if (!cut.startsWith('/') || cut.length > 600) return '';
  let segments;
  try { segments = cut.slice(1).replace(/\/$/, '').split('/').map(decodeURIComponent); } catch { return ''; }
  if (!segments.length || segments.some((s) => s === '' || /^\.+$/.test(s) || /[/\\%\u0000-\u001f\u007f]/.test(s))) return '';
  return '/' + segments.map(encodeURIComponent).join('/');
}

/** The index file a canonical path lives in: FNV-1a over the whole path. */
export function recordPathShard(path) {
  let hash = 2166136261;
  for (let i = 0; i < path.length; i++) hash = Math.imul(hash ^ path.charCodeAt(i), 16777619);
  return (hash >>> 0) % RECORD_PATH_SHARDS;
}

/** Whether a record is the page its path opens, not one that only links to it. */
function ownsPath(record, path) {
  if (record?.owner === true) return true;
  const [, route, kind] = path.split('/');
  if (route === 'subject') return record?.kind === kind;
  if (route === 'bill') return record?.kind === 'bill';
  if (route === 'reports') return record?.kind === 'report';
  return false;
}

/**
 * Build-time: canonical path → title, for catalog records whose link is a
 * plain path on the site. Several records can link to one page (a member's
 * expenses and interests link to the member); the page takes the title of
 * the record that owns it: one flagged `owner` by the build, or the one whose
 * kind is the route's (person, party, donor, supplier, agency, campaigner,
 * bill, report). A path with no single owner title is a section or listing,
 * and is left out.
 *
 * `aliases` are optional [alias, target] pairs. The deployed catalog
 * supplies only canonical addresses. An alias takes the title its target ends up with. A path that a
 * record links to itself keeps its own entry, or stays out of the index if
 * it has none, and an alias claimed by two titles is left out too.
 */
export function recordPathIndex(records, aliases = []) {
  const byPath = new Map();
  // Every path a record links to, titled or not: none of them is an alias's to take.
  const linked = new Set();
  for (const record of records) {
    const href = String(record?.href ?? '');
    if (!href.startsWith('/') || href.startsWith('//') || /[?#]/.test(href)) continue;
    const path = canonicalRecordPath(href);
    if (path) linked.add(path);
    const title = String(record?.title ?? '').trim();
    if (!path || !title) continue;
    const entry = byPath.get(path) ?? { all: new Set(), owners: new Set() };
    entry.all.add(title);
    if (ownsPath(record, path)) entry.owners.add(title);
    byPath.set(path, entry);
  }
  const titleOf = new Map();
  for (const [path, { all, owners }] of byPath) {
    const titles = all.size === 1 ? all : owners;
    if (titles.size === 1) titleOf.set(path, [...titles][0]);
  }
  const byAlias = new Map();
  for (const [alias, target] of aliases) {
    const path = canonicalRecordPath(alias);
    const title = titleOf.get(canonicalRecordPath(target));
    if (!path || !title || linked.has(path)) continue;
    byAlias.set(path, (byAlias.get(path) ?? new Set()).add(title));
  }
  const shards = Array.from({ length: RECORD_PATH_SHARDS }, () => ({}));
  for (const [path, title] of titleOf) shards[recordPathShard(path)][path] = title;
  for (const [path, titles] of byAlias) {
    if (titles.size === 1) shards[recordPathShard(path)][path] = [...titles][0];
  }
  return shards;
}

/**
 * Run time: the record a reported path names, as { path, title }, or null.
 * `fetchJson(url)` resolves to parsed JSON and rejects on any failure; a
 * missing manifest, a missing shard, an unknown path or anything malformed
 * all come back null.
 */
export async function lookupRecordPath(raw, fetchJson) {
  const path = canonicalRecordPath(raw);
  if (!path) return null;
  try {
    const manifest = await fetchJson('/search-catalog/manifest.json');
    // A plain object whose version is a string of the build's exact shape: an
    // array, a number or anything that only stringifies to one is malformed.
    if (!manifest || typeof manifest !== 'object' || Array.isArray(manifest)) return null;
    const version = manifest.version;
    if (typeof version !== 'string' || !/^[0-9a-f]{16}$/.test(version)) return null;
    const shard = await fetchJson(`/search-catalog/${version}/paths-${recordPathShard(path)}.json`);
    const title = shard && Object.prototype.hasOwnProperty.call(shard, path) ? shard[path] : null;
    return typeof title === 'string' && title ? { path, title } : null;
  } catch {
    return null;
  }
}
