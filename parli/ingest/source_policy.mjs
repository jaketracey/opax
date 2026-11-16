// Source policy: how each source's text may be used, and the withheld list. One file
// (source_policy.json), read here for the Workers and the Node builds and by
// parli/source_policy.py for Python; the two loaders apply the same rules and are tested
// against each other. The rules are set out in parli/source_policy.py and docs/TAKEDOWN.md.
import file from './source_policy.json' with { type: 'json' }

/** The four use tiers, least to most. What each allows is CAPABILITIES, and nowhere else. */
export const USES = ['documents_only', 'search_only', 'quote_and_cite', 'full']
/**
 * index      text may be held in an index to locate a hearing and page
 * quote      a tool may return a short attributed quotation, and Ask may show it
 * narrative  a model may write its own sentences from the text
 * kb         the text may be pushed to the knowledge base
 */
export const CAPABILITIES = {
  documents_only: [],
  search_only: ['index'],
  quote_and_cite: ['index', 'quote'],
  full: ['index', 'quote', 'narrative', 'kb'],
}
export const allows = (use, capability) => (CAPABILITIES[use] ?? []).includes(capability)
/** Never sent on a path where the knowledge base generates text, whatever its tier or flags say. */
export const KB_GENERATION_NEVER = ['vic-major-infrastructure']
export const REASONS = ['publisher_request', 'legal_order', 'withdrawn', 'amended_pending']
export const LABELS = {
  publisher_request: "Withheld at the publisher's request",
  legal_order: 'Withheld: subject to a legal order',
  withdrawn: 'Withheld: withdrawn by the publisher',
  amended_pending: 'Withheld: an amended version is pending',
}
const SOURCE_ID = /^[a-z0-9][a-z0-9._-]{0,199}$/
const DOCUMENT_ID = /^[a-z0-9][a-z0-9._-]{0,199}(?:\/[a-z0-9][a-z0-9._-]{0,199})?$/
const HOST = /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]*[a-z0-9])?)+$/
const SOURCE_KEYS = ['use', 'summaries', 'kb_generation', 'hosts', 'names']
const TEXT_KEYS = ['date_quote', 'full_text']
const keys = value => Object.keys(value).sort().join(',')
const realDate = value => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(value + 'T00:00:00Z')) && new Date(value + 'T00:00:00Z').toISOString().slice(0, 10) === value
const fail = message => { throw new Error('source policy: ' + message) }
const plain = value => value && typeof value === 'object' && !Array.isArray(value)
const strings = (value, out = []) => {
  if (typeof value === 'string') out.push(value)
  else if (value && typeof value === 'object') for (const v of Object.values(value)) strings(v, out)
  return out
}

/** A validated policy. Every reader fails closed on a malformed file. */
export function sourcePolicy(data = file) {
  if (!plain(data) || keys(data) !== 'schema,sources,withheld' || data.schema !== 2) fail('must hold exactly schema, sources and withheld')
  if (!plain(data.sources) || !Array.isArray(data.withheld)) fail('sources must be an object and withheld a list')
  const records = new Map(), sources = new Map(), documents = new Map()
  for (const [id, record] of Object.entries(data.sources)) {
    if (!DOCUMENT_ID.test(id) || !plain(record) || !USES.includes(record.use)) fail('a source entry is not a source or document id with a known use')
    if (Object.keys(record).some(k => !SOURCE_KEYS.includes(k)) || (id.includes('/') && keys(record) !== 'use')) fail('a source entry holds a field that is not allowed')
    for (const flag of ['summaries', 'kb_generation']) if (flag in record && record[flag] !== 'allowed') fail(`${flag} may only be "allowed"`)
    // Both flags let a model write from the text, so they need the tier that allows it.
    if ((record.summaries || record.kb_generation) && !allows(record.use, 'narrative')) fail('summaries and kb_generation need the full tier')
    if (record.kb_generation && KB_GENERATION_NEVER.includes(id)) fail('this source may never be sent to knowledge base generation')
    if ('hosts' in record && !(Array.isArray(record.hosts) && record.hosts.length && record.hosts.every(h => typeof h === 'string' && HOST.test(h)))) fail('hosts must be host names')
    if ('names' in record && !(Array.isArray(record.names) && record.names.length && record.names.every(n => typeof n === 'string' && n.length >= 8 && n.length <= 200))) fail('names must be the source\'s own names')
    // A quotation from this tier is shown as it stands, so its facts must be recognisable where the answer is written.
    if (record.use === 'quote_and_cite' && !record.hosts && !record.names) fail('a quote_and_cite source needs hosts or names')
    records.set(id, record)
  }
  for (const entry of data.withheld) {
    if (!plain(entry) || !['date,reason,source', 'date,document,reason'].includes(keys(entry))) fail('a withheld entry holds exactly source or document, reason and date')
    if (!REASONS.includes(entry.reason) || !realDate(entry.date)) fail('a withheld entry needs a known reason class and an ISO date')
    const kind = 'source' in entry ? 'source' : 'document', id = entry[kind], held = kind === 'source' ? sources : documents
    if (typeof id !== 'string' || !(kind === 'source' ? SOURCE_ID : DOCUMENT_ID).test(id)) fail('a withheld id is not well formed')
    if (held.has(id)) fail('a withheld id is listed twice')
    held.set(id, { reason: entry.reason, date: entry.date, label: LABELS[entry.reason] })
  }
  const sourceOf = document => typeof document === 'string' && document.includes('/') ? document.split('/')[0] : undefined
  const use = (source, document) => (document != null && records.get(document)?.use) || records.get(source)?.use || 'full'
  const withheld = ({ sources: ss = [], documents: ds = [] } = {}) => {
    for (const id of ds) {
      if (documents.has(id)) return { ...documents.get(id) }
      if (sourceOf(id) && sources.has(sourceOf(id))) return { ...sources.get(sourceOf(id)) }
    }
    for (const id of ss) if (sources.has(id)) return { ...sources.get(id) }
    return null
  }
  /** True when every id given is open for this capability and nothing is withheld. */
  const can = (capability, { sources: ss = [], documents: ds = [] } = {}) => !withheld({ sources: ss, documents: ds }) &&
    [...ss.map(s => use(s)), ...ds.map(d => use(sourceOf(d), d))].every(u => allows(u, capability))
  const flag = (name, id) => !records.has(id) || records.get(id)[name] === 'allowed'
  /** Machine summaries and topic labels: off for a listed source unless its record allows them. */
  const summaries = ({ sources: ss = [], documents: ds = [] } = {}) => can('narrative', { sources: ss, documents: ds }) &&
    [...ss, ...ds.map(sourceOf).filter(Boolean)].every(id => flag('summaries', id))
  /** Paths where the knowledge base itself generates text: only a full source that allows it, and never the named ones. */
  const kbGeneration = id => !KB_GENERATION_NEVER.includes(id) && !sources.has(id) && allows(use(id), 'narrative') && flag('kb_generation', id)
  const listed = [...records.keys()].filter(id => !id.includes('/'))
  const matchers = listed.map(id => {
    const record = records.get(id), token = new RegExp(`(?:^|[^a-z0-9])${id.replace(/[.]/g, '\\.')}(?:$|[^a-z0-9-])`)
    const hosts = (record.hosts ?? []).map(h => new RegExp(`(?:^|[/.@])${h.replace(/[.]/g, '\\.')}(?:$|[/:?#"'\\s])`, 'i'))
    const names = (record.names ?? []).map(n => n.toLowerCase())
    return { id, test: text => token.test(text) || hosts.some(h => h.test(text)) || (names.length && names.some(n => text.toLowerCase().includes(n))) }
  })
  /** Ids of the listed sources that any string in the value names: by id, by one of its hosts or by its name. */
  const sourcesIn = value => { const all = strings(value); return matchers.filter(m => all.some(text => m.test(text))).map(m => m.id) }
  return {
    use, withheld, can, summaries, kbGeneration, sourcesIn, listed: source => records.has(source),
    withheldSources: [...sources.keys()], withheldDocuments: [...documents.keys()],
    /** Listed sources that may never reach a path where the knowledge base generates text. */
    kbGenerationClosed: [...new Set([...listed, ...KB_GENERATION_NEVER, ...sources.keys()])].filter(id => !kbGeneration(id)),
    /** True when a record, fact, turn or line names a source closed to knowledge base generation. */
    kbGenerationExcluded: value => sourcesIn(value).some(id => !kbGeneration(id)),
    /** True when it names a source whose text may be quoted but not written about (quote_and_cite). */
    passageOnly: value => sourcesIn(value).some(id => allows(use(id), 'quote') && !allows(use(id), 'narrative')),
    /** True when some source or document is closed, so readers have something to check. */
    active: sources.size + documents.size > 0 || [...records.values()].some(r => !allows(r.use, 'kb')),
    /** Sources and documents whose text may not be in the knowledge base or sent to a model from it. */
    closedIds: [...new Set([...sources.keys(), ...documents.keys(), ...[...records].filter(([, r]) => !allows(r.use, 'kb')).map(([id]) => id)])],
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
 * entry, or { label } when its tier keeps it out of the knowledge base; null when it may. */
export function kbRefusal(resource, policy = POLICY) {
  const ids = kbIds(resource)
  return policy.withheld(ids) ?? (policy.can('kb', ids) ? null : { label: 'Listed only: the source policy does not allow this text to be used' })
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
 * parli/source_policy.py). Withheld documents become listing rows; a document whose tier allows no quotation
 * carries no quotation or text pointer; recommendations and court context drawn from either go, and so does a
 * fact read from a withheld document. */
export function redactCommission(c, policy = POLICY) {
  const cid = c.id, out = { ...c }, sourceEntry = policy.withheld({ sources: [cid] })
  const quotable = key => allows(policy.use(cid, `${cid}/${key}`), 'quote')
  const withheldKeys = new Set(), withheldUrls = new Set(), heldUrls = new Set()
  for (const group of ['reports', 'responses', 'transcripts']) {
    out[group] = (c[group] ?? []).map(d => {
      const entry = policy.withheld({ sources: [cid], documents: [`${cid}/${d.key}`] })
      if (entry) {
        withheldKeys.add(d.key)
        for (const f of d.files ?? []) withheldUrls.add(f.url)
        return listingRow(c, d, entry)
      }
      if (!quotable(d.key)) {
        for (const f of d.files ?? []) heldUrls.add(f.url)
        return without(d, TEXT_KEYS)
      }
      return d
    })
  }
  out.recommendations = (c.recommendations ?? []).filter(r => !withheldKeys.has(r.report) && quotable(r.report))
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
