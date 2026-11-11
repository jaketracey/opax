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
export const votesBucketPath = (bucket) => `/growth/votes/${bucket}.json`;
/** votes.json's _names (name to person keys), which a profile reads before it knows its keys. */
export const VOTES_NAMES_PATH = '/growth/votes/names.json';
