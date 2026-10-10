/** Whether a money-map donor node is an organisation, for every surface that
 * can name a donor without the client: server-rendered pages, the sitemap,
 * the search catalogue and llms.txt. Individual donors stay out of those.
 *
 * Donor nodes carry no entity type and no ABN, only a label, aliases and an
 * industry tag, and individuals are often tagged with a sector ("Roslyn
 * Packer" is media). So the industry never counts. Organisation evidence is a
 * legal-form or organisation word as a whole token in the label or an alias,
 * or a single-token acronym ("CFMEU"). An ABN/ACN is not evidence (sole
 * traders have ABNs) and no industry tag is, not even unions. Everything else
 * is treated as an individual: a bare company name ("Visy") fails closed.
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
// A single all-capitals token such as "CFMEU" or "SDA". "JOHN SMITH" has two tokens and is not one.
const ACRONYM = /^[A-Z]{2,7}$/

/** @param {{label?: string, aliases?: string[] | null, industry?: string | null} | null | undefined} node */
export function isOrganisationDonor(node) {
  if (!node || typeof node.label !== 'string' || !node.label.trim()) return false
  const names = [node.label, ...(Array.isArray(node.aliases) ? node.aliases : [])].filter(n => typeof n === 'string')
  if (names.some(n => ORGANISATION_WORD.test(n))) return true
  return names.some(n => ACRONYM.test(n.trim()))
}
