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
 * rankings stay true. The anonymous id is keyed by the source id: a source id
 * carried by two nodes (one donor group) keeps one anonymous id, and two
 * groups never share one. A group is withheld when none of its nodes is an
 * organisation.
 * @template {{nodes: {id: string, label: string, kind: string, aliases?: string[] | null, industry?: string | null}[], edges: {source: string, target: string}[]}} G
 * @param {G} graph
 * @returns {G} */
export function withholdIndividualDonors(graph) {
  const withheld = new Map()
  for (const node of graph.nodes) if (node.kind === 'donor') withheld.set(node.id, (withheld.get(node.id) ?? true) && !isOrganisationDonor(node))
  /** @type {Map<string, number>} source id -> anonymous number, in first-appearance order of the groups */
  const anonymous = new Map()
  for (const [id, hidden] of withheld) if (hidden) anonymous.set(id, anonymous.size + 1)
  if (!anonymous.size) return graph
  const anonymousId = id => `donor:withheld-${anonymous.get(id)}`
  const nodes = graph.nodes.map(node => node.kind === 'donor' && anonymous.has(node.id)
    // Neutral: failing closed also withholds organisations without a legal form.
    ? {...node, id: anonymousId(node.id), label: `Donor ${anonymous.get(node.id)} (name withheld)`, aliases: []}
    : node)
  const edges = graph.edges.map(e => anonymous.has(e.source) || anonymous.has(e.target)
    ? {...e, source: anonymous.has(e.source) ? anonymousId(e.source) : e.source, target: anonymous.has(e.target) ? anonymousId(e.target) : e.target} : e)
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

/** @param {unknown} s */
const phraseOf = s => String(s).normalize('NFKC').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()
// Money ranking or receipt intent: the vocabulary the money answers are routed on.
const MONEY_INTENT = /\b(?:money|donat\w*|donors?|receipts?|funding|funded|contributions?)\b/i

/** Normalised phrases for the query check: every withheld donor's label and aliases
 * ("Surname, Given" also as "Given Surname"), each with the longer organisation
 * names that contain it. An occurrence inside a longer organisation donor's name
 * or alias ("<name> Holdings Pty Ltd") is that organisation's and does not count.
 * A parliamentarian's or minister's name is never treated as a withheld donor's:
 * office holders who gave to their party are named as office holders.
 * Server-side and build-time only; never publish the result.
 * @param {{nodes: {label: string, kind: string, aliases?: string[] | null, industry?: string | null}[]}[]} graphs
 * @param {string[]} officeHolders
 * @returns {{withheld: [string, string[]][]}} */
export function withheldPhrases(graphs, officeHolders) {
  const index = donorPrivacyIndex(graphs)
  const donors = graphs.flatMap(g => g.nodes.filter(n => n.kind === 'donor'))
  const names = n => [n.label, ...(Array.isArray(n.aliases) ? n.aliases : [])].filter(s => typeof s === 'string')
  const organisations = new Set(donors.filter(n => index.organisations.has(foldDonorName(n.label))).flatMap(names).map(phraseOf).filter(p => p.length > 1))
  const exempt = new Set([...officeHolders.map(phraseOf), ...organisations])
  const withheld = new Set()
  for (const n of donors) if (index.withheld.has(foldDonorName(n.label))) for (const name of names(n)) {
    const inverted = /^([^,]+),\s*([^,]+)$/.exec(name)
    for (const p of [name, ...(inverted ? [`${inverted[2]} ${inverted[1]}`] : [])].map(phraseOf)) if (p.length > 1 && !exempt.has(p)) withheld.add(p)
  }
  const orgs = [...organisations]
  return {withheld: [...withheld].map(p => [p, orgs.filter(o => o.length > p.length && ` ${o} `.includes(` ${p} `))])}
}

/** A single word names a donor only in donor context: "donations from X", "X
 * donated", "X's donations", "donor X", the name in quotes, or money or receipt
 * intent anywhere in the text. "What has parliament said about X outages?" does not.
 * @param {string} text @param {string} word */
function donorContext(text, word) {
  const raw = String(text).normalize('NFKC').toLowerCase().replace(/[‘’ʼ`]/g, "'")
  const w = word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  return MONEY_INTENT.test(raw)
    || new RegExp(`\\b(?:donations?\\s+(?:from|by)|donors?)\\s+(?:the\\s+)?${w}\\b|\\b${w}(?:'s)?\\s+(?:donat\\w*|gave|gives|has\\s+given)\\b`).test(raw)
    || new RegExp(`["“'«]\\s*${w}\\s*["”'»]`).test(raw)
}

/** Whether any of these texts names a withheld donor (see withheldPhrases). A name
 * of several words counts wherever it stands; one word only in donor context.
 * @param {{withheld: [string, string[]][]}} phrases @param {...unknown} texts */
export function namesWithheldPhrase(phrases, ...texts) {
  for (const text of texts) {
    const q = ` ${phraseOf(text)} `
    if (q.length < 4) continue
    for (const [p, longer] of phrases.withheld) {
      const needle = ` ${p} `
      for (let at = q.indexOf(needle); at >= 0; at = q.indexOf(needle, at + 1)) {
        // Excused only when a longer organisation name covers this very occurrence.
        const covered = longer.some(o => { const span = ` ${o} `; for (let from = q.indexOf(span); from >= 0; from = q.indexOf(span, from + 1)) if (from <= at && from + span.length >= at + needle.length) return true; return false })
        if (covered) continue
        if (p.includes(' ') || donorContext(String(text), p)) return true
      }
    }
  }
  return false
}
