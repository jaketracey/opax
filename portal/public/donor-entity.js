/** Whether a money-map donor node is an organisation, for every surface that
 * can name a donor without the client: server-rendered pages, share cards,
 * the sitemap, the search catalogue, IndexNow, and server-side answers, stories
 * and tools. Individual donors stay out of those.
 *
 * Donor nodes carry no entity type and no ABN, only a label, aliases and an
 * industry tag, and individuals are often tagged with a sector (a person
 * tagged media or fossil fuels). So the industry never counts, not even unions.
 * Organisation evidence is a legal-form or organisation word or phrase as whole
 * tokens in the label or an alias, a trailing "Co", or a label that is a single
 * acronym of 3-7 capitals ("CFMEU"). An alias is never an acronym ("RP" reads as
 * initials), a two-letter label is not one ("EY" needs a legal form in an alias),
 * and ABN, ACN, ARBN and TFN are registration words, not names. An ABN/ACN is not
 * evidence: sole traders have ABNs. Everything else is treated as an individual:
 * a bare company name ("Visy") fails closed.
 *
 * Shared by the Worker (src/) and the build scripts (scripts/build_*_catalog.mjs);
 * test/donor-entity.test.mjs and test/donor-privacy.test.mjs. */

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
