/** Donor organisation classifier used for data quality, never publication. */
const ORGANISATION_WORDS = [
  'pty', 'ltd', 'limited', 'proprietary', 'inc', 'incorporated', 'corporation', 'corp', 'company',
  'co-operative', 'cooperative', 'co-op', 'association', 'union', 'unions', 'federation', 'council', 'trust',
  'foundation', 'institute', 'society', 'club', 'clubs', 'party', 'committee', 'fund', 'holdings', 'group',
  'partners', 'llp', 'bank', 'authority', 'chamber', 'alliance', 'network', 'services', 'enterprises', 'industries',
  'lawyers', 'university', 'college', 'guild', 'trades\\s+hall',
]
const ORGANISATION_WORD = new RegExp(`(?:^|[^a-z0-9])(?:${ORGANISATION_WORDS.join('|')})(?=$|[^a-z0-9])`, 'i')
// "& Co" or "Pastoral Co" as the last word; "Co" elsewhere is too often part of a name.
const TRAILING_CO = /(?:^|[^a-z0-9])co\.?\s*$/i
// A label that is one all-capitals token of 3-7 letters, such as "CFMEU" or "SDA".
// "JOHN SMITH" has two tokens; "RP" reads as initials; registration words are not names.
const ACRONYM = /^[A-Z]{3,7}$/
const REGISTRATION_WORDS = new Set(['ABN', 'ACN', 'ARBN', 'TFN'])

/** @param {{label?: string, aliases?: string[] | null, industry?: string | null} | null | undefined} node */
export function isOrganisationDonor(node) {
  if (!node || typeof node.label !== 'string' || !node.label.trim()) return false
  const names = [node.label, ...(Array.isArray(node.aliases) ? node.aliases : [])].filter(n => typeof n === 'string')
  if (names.some(n => ORGANISATION_WORD.test(n) || TRAILING_CO.test(n))) return true
  // The label only: an alias acronym can be a person's initials.
  const label = node.label.trim()
  return ACRONYM.test(label) && !REGISTRATION_WORDS.has(label)
}

/** Money graphs stay separate by disclosure jurisdiction. */
export const MONEY_GRAPHS = ['/graph/money.json', '/graph/money.qld.json', '/graph/money.vic.json', '/graph/money.tas.json'];
export const foldDonorName = value => String(value).normalize('NFKC').replace(/[‘’ʼ`]/g, "'").replace(/\s+/g, ' ').trim().toLowerCase();
