/** Whether a money-map donor node is an organisation, for every surface that
 * can name a donor without the client: server-rendered pages, share cards,
 * the sitemap, the search catalogue, IndexNow, and server-side answers, stories
 * and tools. Individual donors stay out of those.
 *
 * Donor nodes carry no entity type and no ABN, only a label, aliases and an
 * industry tag, and individuals are often tagged with a sector (a person
 * tagged media or fossil fuels). So the industry never counts. Organisation evidence is a
 * legal-form or organisation word as a whole token, or an ABN/ACN, in the
 * label or an alias; or the unions tag, since a union is an organisation by
 * definition, unless its label reads as a personal name. Everything else is
 * treated as an individual: a bare company name ("Visy") fails closed.
 *
 * Shared by the Worker (src/) and the build scripts (scripts/build_*_catalog.mjs);
 * test/donor-entity.test.mjs and test/donor-privacy.test.mjs. */

const ORGANISATION_WORDS = [
  'pty', 'ltd', 'limited', 'proprietary', 'inc', 'incorporated', 'corporation', 'corp', 'company',
  'co-operative', 'cooperative', 'co-op', 'association', 'union', 'unions', 'federation', 'council', 'trust',
  'foundation', 'institute', 'society', 'club', 'clubs', 'party', 'committee', 'fund', 'holdings', 'group',
  'partners', 'llp', 'bank', 'authority', 'chamber', 'alliance', 'network', 'services', 'enterprises', 'industries',
  'lawyers', 'university', 'college', 'guild',
]
const ORGANISATION_WORD = new RegExp(`(?:^|[^a-z0-9])(?:${ORGANISATION_WORDS.join('|')})(?=$|[^a-z0-9])`, 'i')
// "& Co" or "Pastoral Co" as the last word; "Co" elsewhere is too often part of a name.
const TRAILING_CO = /(?:^|[^a-z0-9])co\.?\s*$/i
// "ABN 12 345 678 901", an 11-digit ABN or a 9-digit ACN, spaced or not.
const REGISTRATION = /\b(?:ABN|ACN)\b|(?:^|\D)(?:\d{2} ?\d{3} ?\d{3} ?\d{3}|\d{3} ?\d{3} ?\d{3})(?!\d)/i
// "Mrs Jane Citizen AO" or "Citizen, Jane".
const PERSONAL_NAME = /^\s*(?:mr|mrs|ms|miss|mx|dr|prof|professor|sir|dame|hon|the hon)\.?\s|^\s*[a-z'’-]+,\s*[a-z'’. -]+$/i

/** @param {{label?: string, aliases?: string[] | null, industry?: string | null} | null | undefined} node */
export function isOrganisationDonor(node) {
  if (!node || typeof node.label !== 'string' || !node.label.trim()) return false
  const names = [node.label, ...(Array.isArray(node.aliases) ? node.aliases : [])].filter(n => typeof n === 'string')
  if (names.some(n => ORGANISATION_WORD.test(n) || TRAILING_CO.test(n) || REGISTRATION.test(n))) return true
  return node.industry === 'unions' && !PERSONAL_NAME.test(node.label)
}

/** A money graph in which every donor failing isOrganisationDonor is renamed
 * and re-keyed (its id embeds the name) before a server-side answer, story or
 * tool reads it. Amounts, years and industry tags are kept, so totals and
 * rankings stay true; a withheld donor is never merged with another.
 * @template {{nodes: {id: string, label: string, kind: string, aliases?: string[] | null, industry?: string | null}[], edges: {source: string, target: string}[]}} G
 * @param {G} graph
 * @returns {G} */
export function withholdIndividualDonors(graph) {
  const ids = new Map()
  const nodes = graph.nodes.map(node => {
    if (node.kind !== 'donor' || isOrganisationDonor(node)) return node
    const n = ids.size + 1
    ids.set(node.id, `donor:withheld-${n}`)
    // Neutral: failing closed also withholds organisations without a legal form.
    return {...node, id: `donor:withheld-${n}`, label: `Donor ${n} (name withheld)`, aliases: []}
  })
  if (!ids.size) return graph
  const edges = graph.edges.map(e => ids.has(e.source) || ids.has(e.target) ? {...e, source: ids.get(e.source) ?? e.source, target: ids.get(e.target) ?? e.target} : e)
  return {...graph, nodes, edges}
}

/** Every money graph a donor can be named from, state graphs included. */
export const MONEY_GRAPHS = ['/graph/money.json', '/graph/money.qld.json', '/graph/money.vic.json', '/graph/money.tas.json']

/** @param {unknown} s */
export const foldDonorName = s => String(s).normalize('NFKC').replace(/[‘’ʼ`]/g, "'").replace(/\s+/g, ' ').trim().toLowerCase()

/** Folded donor labels across the money graphs: a label is an organisation if
 * any graph gives it organisation evidence, otherwise it is withheld. For
 * server-side and build-time filters only; never publish the withheld set.
 * @param {{nodes: {label: string, kind: string, aliases?: string[] | null, industry?: string | null}[]}[]} graphs */
export function donorPrivacyIndex(graphs) {
  const donors = graphs.flatMap(g => g.nodes.filter(n => n.kind === 'donor'))
  const organisations = new Set(donors.filter(isOrganisationDonor).map(n => foldDonorName(n.label)))
  return {organisations, withheld: new Set(donors.map(n => foldDonorName(n.label)).filter(l => !organisations.has(l)))}
}

/** Whether a donor page or link for this name must withhold it. A name the
 * graphs do not hold is judged on the name alone, failing closed.
 * @param {{organisations: Set<string>, withheld: Set<string>}} index
 * @param {string} name */
export function donorNameWithheld(index, name) {
  const key = foldDonorName(name)
  if (index.organisations.has(key)) return false
  return index.withheld.has(key) || !isOrganisationDonor({label: name})
}
