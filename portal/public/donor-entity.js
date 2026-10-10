/** Whether a money-map donor node is an organisation, for every surface that
 * can name a donor without the client: server-rendered pages, the sitemap,
 * the search catalogue and llms.txt. Individual donors stay out of those.
 *
 * Donor nodes carry no entity type and no ABN, only a label, aliases and an
 * industry tag, and individuals are often tagged with a sector ("Roslyn
 * Packer" is media). So the industry never counts. Organisation evidence is a
 * legal-form or organisation word as a whole token, or an ABN/ACN, in the
 * label or an alias; or the unions tag, since a union is an organisation by
 * definition, unless its label reads as a personal name. Everything else is
 * treated as an individual: a bare company name ("Visy") fails closed.
 *
 * Shared by src/seo-content.ts, src/index.ts and scripts/build_crawl_catalog.mjs
 * and scripts/build_search_catalog.mjs; test/donor-entity.test.mjs. */

const ORGANISATION_WORDS = [
  'pty', 'ltd', 'limited', 'proprietary', 'inc', 'incorporated', 'corporation', 'corp', 'company',
  'co-operative', 'cooperative', 'co-op', 'association', 'union', 'unions', 'federation', 'council', 'trust',
  'foundation', 'institute', 'society', 'club', 'clubs', 'party', 'committee', 'fund', 'holdings', 'group',
  'partners', 'llp', 'bank', 'authority', 'chamber', 'alliance', 'network', 'services', 'enterprises', 'industries',
]
const ORGANISATION_WORD = new RegExp(`(?:^|[^a-z0-9])(?:${ORGANISATION_WORDS.join('|')})(?=$|[^a-z0-9])`, 'i')
// "ABN 12 345 678 901", an 11-digit ABN or a 9-digit ACN, spaced or not.
const REGISTRATION = /\b(?:ABN|ACN)\b|(?:^|\D)(?:\d{2} ?\d{3} ?\d{3} ?\d{3}|\d{3} ?\d{3} ?\d{3})(?!\d)/i
// "Mrs Roslyn Packer AO" or "Packer, Roslyn".
const PERSONAL_NAME = /^\s*(?:mr|mrs|ms|miss|mx|dr|prof|professor|sir|dame|hon|the hon)\.?\s|^\s*[a-z'’-]+,\s*[a-z'’. -]+$/i

/** @param {{label?: string, aliases?: string[] | null, industry?: string | null} | null | undefined} node */
export function isOrganisationDonor(node) {
  if (!node || typeof node.label !== 'string' || !node.label.trim()) return false
  const names = [node.label, ...(Array.isArray(node.aliases) ? node.aliases : [])].filter(n => typeof n === 'string')
  if (names.some(n => ORGANISATION_WORD.test(n) || REGISTRATION.test(n))) return true
  return node.industry === 'unions' && !PERSONAL_NAME.test(node.label)
}
