/**
 * Each party's disclosed-receipt rows from the uncapped federal selection or a state graph,
 * grouped into buckets by party, so a server-rendered profile reads its party's rows rather than
 * the three graphs. scripts/build_growth_modules.mjs writes them with register-tables.js's
 * partyMoneyData at release.
 */
export const PARTY_MONEY_BUCKETS = 16;
/** The party-name fold the profile matches graph nodes with (src/seo-content.ts). */
export const partyFold = (s) => String(s).normalize('NFKC').replace(/[‘’ʼ`]/g, "'").replace(/\s+/g, ' ').trim().toLowerCase();
/** FNV-1a over a folded party name's UTF-16 code units: the same bucket in the build and the Worker. */
export function partyMoneyBucket(folded) {
  let hash = 2166136261;
  for (let i = 0; i < folded.length; i++) { hash ^= folded.charCodeAt(i); hash = Math.imul(hash, 16777619) >>> 0; }
  return hash % PARTY_MONEY_BUCKETS;
}
/** /graph/money.qld.json, bucket 3 -> /growth/party-money/money.qld/3.json */
export const partyMoneyBucketPath = (graphPath, bucket) => `/growth/party-money/${graphPath.split('/').pop().replace(/\.json$/, '')}/${bucket}.json`;
