// Source policy: how each source's text may be used, and the withheld list. One file
// (source_policy.json), read here for the Workers and the Node builds and by
// parli/source_policy.py for Python; the two loaders apply the same rules and are tested
// against each other. The rules are set out in parli/source_policy.py and docs/TAKEDOWN.md.
import file from './source_policy.json' with { type: 'json' }

export const USES = ['documents_only', 'search_only', 'quotable']
export const REASONS = ['publisher_request', 'legal_order', 'withdrawn', 'amended_pending']
export const LABELS = {
  publisher_request: "Withheld at the publisher's request",
  legal_order: 'Withheld: subject to a legal order',
  withdrawn: 'Withheld: withdrawn by the publisher',
  amended_pending: 'Withheld: an amended version is pending',
}
const SOURCE_ID = /^[a-z0-9][a-z0-9._-]{0,199}$/
const DOCUMENT_ID = /^[a-z0-9][a-z0-9._-]{0,199}(?:\/[a-z0-9][a-z0-9._-]{0,199})?$/
const TEXT_KEYS = ['date_quote', 'full_text']
const keys = value => Object.keys(value).sort().join(',')
const realDate = value => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(value + 'T00:00:00Z')) && new Date(value + 'T00:00:00Z').toISOString().slice(0, 10) === value
const fail = message => { throw new Error('source policy: ' + message) }
const plain = value => value && typeof value === 'object' && !Array.isArray(value)

/** A validated policy. Every reader fails closed on a malformed file. */
export function sourcePolicy(data = file) {
  if (!plain(data) || keys(data) !== 'schema,use,withheld' || data.schema !== 1) fail('must hold exactly schema, use and withheld')
  if (!plain(data.use) || !Array.isArray(data.withheld)) fail('use must be an object and withheld a list')
  const uses = new Map(), sources = new Map(), documents = new Map()
  for (const [key, use] of Object.entries(data.use)) {
    if (!DOCUMENT_ID.test(key) || !USES.includes(use)) fail('a use entry is not a source or document id with a known use')
    uses.set(key, use)
  }
  for (const entry of data.withheld) {
    if (!plain(entry) || !['date,reason,source', 'date,document,reason'].includes(keys(entry))) fail('a withheld entry holds exactly source or document, reason and date')
    if (!REASONS.includes(entry.reason) || !realDate(entry.date)) fail('a withheld entry needs a known reason class and an ISO date')
    const kind = 'source' in entry ? 'source' : 'document', id = entry[kind], held = kind === 'source' ? sources : documents
    if (typeof id !== 'string' || !(kind === 'source' ? SOURCE_ID : DOCUMENT_ID).test(id)) fail('a withheld id is not well formed')
    if (held.has(id)) fail('a withheld id is listed twice')
    held.set(id, { reason: entry.reason, date: entry.date, label: LABELS[entry.reason] })
  }
  const use = (source, document) => (document != null && uses.get(document)) || uses.get(source) || 'quotable'
  const withheld = ({ sources: ss = [], documents: ds = [] } = {}) => {
    for (const id of ds) {
      if (documents.has(id)) return { ...documents.get(id) }
      if (typeof id === 'string' && id.includes('/') && sources.has(id.split('/')[0])) return { ...sources.get(id.split('/')[0]) }
    }
    for (const id of ss) if (sources.has(id)) return { ...sources.get(id) }
    return null
  }
  const textAllowed = ({ sources: ss = [], documents: ds = [] } = {}) => !withheld({ sources: ss, documents: ds }) &&
    [...ss.map(s => use(s)), ...ds.map(d => use(d.includes('/') ? d.split('/')[0] : undefined, d))].every(u => u === 'quotable')
  return {
    use, withheld, textAllowed, listed: source => uses.has(source),
    withheldSources: [...sources.keys()], withheldDocuments: [...documents.keys()],
    /** True when some source or document is closed, so readers have something to check. */
    active: sources.size + documents.size > 0 || [...uses.values()].some(u => u !== 'quotable'),
    /** Sources and documents whose text may not be searched, quoted or sent to a model. */
    closedIds: [...new Set([...sources.keys(), ...documents.keys(), ...[...uses].filter(([, u]) => u !== 'quotable').map(([id]) => id)])],
  }
}

export const POLICY = sourcePolicy(file)

/** { sources, documents } of a knowledge base resource: its source label, origin source id and slug. */
export function kbIds(resource) {
  const labels = resource?.usermetadata?.classifications ?? []
  const sources = labels.filter(c => c?.labelset === 'source' && c.label).map(c => String(c.label))
  if (resource?.origin?.source_id) sources.push(String(resource.origin.source_id))
  return { sources, documents: resource?.slug ? [String(resource.slug)] : [] }
}

/** Why a knowledge base resource's text may not be read, quoted, summarised or labelled: its withheld
 * entry, or { label } when its source is not quotable; null when it may. */
export function kbRefusal(resource, policy = POLICY) {
  const ids = kbIds(resource)
  return policy.withheld(ids) ?? (policy.textAllowed(ids) ? null : { label: 'Listed only: the source policy does not allow this text to be used' })
}

/** What a withheld document shows: title, date, its label and the publisher's page. */
export function listingRow(commission, doc, entry) {
  // The publisher's own page for the document; never the file itself where a page or the site is known.
  const files = new Set((doc.files ?? []).map(f => f.url))
  const page = [doc.page_url, commission.site].find(u => u && !files.has(u)) ?? doc.page_url ?? null
  return { key: doc.key, kind: doc.kind, title: doc.title, date: doc.date ?? null, date_basis: doc.date_basis ?? null, page_url: page, files: [],
    cite: { url: page, document: doc.title }, acquisition: doc.acquisition ?? null, withheld: entry }
}

const without = (row, drop) => Object.fromEntries(Object.entries(row).filter(([k]) => !drop.includes(k)))

/** One commission's public record with the policy applied (same rules as redact_commission in
 * parli/source_policy.py). Withheld documents become listing rows; a document that is not quotable carries
 * no quotation or text pointer; recommendations and court context drawn from either go, and so does a fact
 * read from a withheld document. */
export function redactCommission(c, policy = POLICY) {
  const cid = c.id, out = { ...c }, sourceEntry = policy.withheld({ sources: [cid] })
  const withheldKeys = new Set(), withheldUrls = new Set(), heldUrls = new Set()
  for (const group of ['reports', 'responses', 'transcripts']) {
    out[group] = (c[group] ?? []).map(d => {
      const id = `${cid}/${d.key}`, entry = policy.withheld({ sources: [cid], documents: [id] })
      if (entry) {
        withheldKeys.add(d.key)
        for (const f of d.files ?? []) withheldUrls.add(f.url)
        return listingRow(c, d, entry)
      }
      if (policy.use(cid, id) !== 'quotable') {
        for (const f of d.files ?? []) heldUrls.add(f.url)
        return without(d, TEXT_KEYS)
      }
      return d
    })
  }
  out.recommendations = (c.recommendations ?? []).filter(r => !withheldKeys.has(r.report) && policy.use(cid, `${cid}/${r.report}`) === 'quotable')
  out.court_context = (c.court_context ?? []).filter(x => !withheldKeys.has(x.applies_to))
  // A fact read from a withheld document goes; one read from a document that is not quotable keeps its value
  // and page and loses its quotation.
  const fact = f => !f || withheldUrls.has(f.cite?.url) || (sourceEntry && 'quote' in f) ? null : heldUrls.has(f.cite?.url) ? without(f, ['quote']) : f
  out.established = fact(c.established ?? null)
  out.commissioners = (c.commissioners ?? []).map(fact).filter(Boolean)
  if (policy.listed(cid)) out.use = policy.use(cid)
  if (sourceEntry) { out.notes = []; out.withheld = sourceEntry }
  return out
}
