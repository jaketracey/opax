/**
 * /seo/recent-votes.json (about 3 MB, every member) split by person key, so a server-rendered
 * profile reads the few kilobytes it shows. scripts/build_growth_modules.mjs writes the buckets
 * from the same file at release; each keeps that file's _meta.
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
