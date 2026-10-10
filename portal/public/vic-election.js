// One publication gate, shared by SSR, canonical resolution and discovery.
// Only the exact deployment value "true" enables publication.
export const VIC_ELECTION_HUB_ENABLED = false;
export const VIC_ELECTION_PATH = '/vic-election-2026';
export const VIC_ELECTION_ASSET = '/hubs/vic-election-2026.json';
export const VIC_ELECTION_SITEMAP = '/sitemaps/vic-election-1.xml';
// Control hub decision, 10 October 2026. Address verified against Noice's contact page.
export const VIC_ELECTION_AUTHORISATION_LINE = 'Authorised by Jake Tracey, Noice Pty Ltd, Level 6, 343 Little Collins St, Melbourne VIC 3000.';
export const VIC_ELECTION_CORRECTIONS_EMAIL = 'corrections@opax.com.au';
export const VIC_ELECTION_CORRECTIONS_RESPONSE = 'We aim to respond within 2 business days.';
export const vicElectionEnabled = value => value === 'true' || (value == null && VIC_ELECTION_HUB_ENABLED);
export function vicElectionAssetPath(path) {
  try { return decodeURIComponent(path).replace(/\/+/g,'/').toLowerCase().startsWith('/hubs/vic-election'); }
  catch { return false; }
}
// Recognise unpublished pages and discovery assets before any canonical redirect.
export function vicElectionPublicationPath(path) {
  // A malformed constituency segment must not bypass the publication gate.
  const normalized = path.split('/').map(part => {
    try { return decodeURIComponent(part); } catch { return part; }
  }).join('/').replace(/\/+/g,'/').replace(/\/+$/,'').toLowerCase();
  return normalized === VIC_ELECTION_PATH || normalized.startsWith(VIC_ELECTION_PATH+'/')
    || /^\/sitemaps\/vic-election-\d+\.xml(?:\/|$)/.test(normalized)
    || normalized.startsWith('/hubs/vic-election');
}
export const vicElectionLlms = '- [Victorian election 2026](https://opax.com.au/vic-election-2026): 28 November 2026; 88 state districts and 8 regions, sitting members and exported parliamentary records. Victorian divisions cover 2026 only; no state grants or Victorian interests. Speech aggregates have explicit period limits. No donor records.\n';
export function vicElectionDiscovery(data, enabled = false) {
  return enabled ? { 'vic-election': data.pages.map(p => ({path:p.path,lastmod:p.lastmod})) } : {};
}
