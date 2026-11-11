/**
 * /seo/recent-votes.json (about 3 MB) and /votes.json (1.3 MB), every member's votes, split by
 * person key, so a server-rendered profile reads the few kilobytes it shows.
 * scripts/build_growth_modules.mjs writes the buckets from the same files at release; a
 * recent-votes bucket keeps that file's _meta, and votes.json's name index is written whole.
 */
export const RECENT_VOTES_BUCKETS = 64;
/** FNV-1a over the key's UTF-16 code units: the same bucket in the build and the Worker. */
export function recentVotesBucket(key) {
  let hash = 2166136261;
  const text = String(key);
  for (let i = 0; i < text.length; i++) { hash ^= text.charCodeAt(i); hash = Math.imul(hash, 16777619) >>> 0; }
  return hash % RECENT_VOTES_BUCKETS;
}
export const recentVotesBucketPath = (bucket) => `/growth/recent-votes/${bucket}.json`;
/** The layout fields each bucket file carries, so a reader with another split can tell. */
export const bucketLayout = (bucket) => ({ _bucket: bucket, _of: RECENT_VOTES_BUCKETS });
const inLayout = (part, bucket) => !!part?.people && part._bucket === bucket && part._of === RECENT_VOTES_BUCKETS;
export const votesBucketPath = (bucket) => `/growth/votes/${bucket}.json`;
/** votes.json's _names (name to person keys) and _meta, which a profile reads before it knows its keys. */
export const VOTES_NAMES_PATH = '/growth/votes/names.json';

/**
 * A profile's part of /votes.json: _names and _meta, then the buckets holding the keys
 * `keysFor(names)` picks. `read(path)` resolves parsed JSON, or null when unreadable. Null when
 * any part is missing, so the caller reads the whole file instead.
 */
export async function votesSlice(read, keysFor) {
  const names = await read(VOTES_NAMES_PATH);
  if (!names?._names || !names._meta) return null;
  const buckets = [...new Set(keysFor(names).map(recentVotesBucket))];
  const parts = await Promise.all(buckets.map((bucket) => read(votesBucketPath(bucket))));
  if (!parts.every((part, i) => inLayout(part, buckets[i]))) return null;
  return Object.assign({ _names: names._names, _meta: names._meta }, ...parts.map((part) => part.people));
}

/** These keys' part of /seo/recent-votes.json ({_meta, people}), or null when a bucket is unreadable. */
export async function recentVotesSlice(read, keys) {
  if (!keys.length) return null;
  const buckets = [...new Set(keys.map(recentVotesBucket))];
  const parts = await Promise.all(buckets.map((bucket) => read(recentVotesBucketPath(bucket))));
  if (!parts.every((part, i) => inLayout(part, buckets[i]))) return null;
  return { _meta: parts[0]._meta, people: Object.assign({}, ...parts.map((part) => part.people)) };
}
