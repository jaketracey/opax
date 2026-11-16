// Source policy: how each source's text may be used (source_policy.json, public), and the withheld list.
// The withheld list's real contents are never in this repository: an entry, or an id that resolves to a
// document, can itself disclose that an order exists. The list is handed to loadWithheld() from a private
// store (a Worker secret, an Actions secret, a private file on the refresh box); withheld.example.json is the
// empty shape. This loader serves the Workers and the Node builds, parli/source_policy.py serves Python, and
// the two are tested against each other. The rules are set out there and in docs/TAKEDOWN.md.
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
/** How a withheld item is shown: one neutral line with the publisher's link, or not at all. */
export const MODES = ['list_only', 'hide']
/** The only wording a reader sees for a withheld item, whatever the reason. The reason is never public. */
export const NOTICE = "Not available on OPAX. Open the publisher's copy."
const SOURCE_ID = /^[a-z0-9][a-z0-9._-]{0,199}$/
const DOCUMENT_ID = /^[a-z0-9][a-z0-9._-]{0,199}(?:\/[a-z0-9][a-z0-9._-]{0,199})?$/
const HOST = /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]*[a-z0-9])?)+$/
const SOURCE_KEYS = ['use', 'summaries', 'kb_generation', 'hosts', 'names']
const TEXT_KEYS = ['date_quote', 'full_text']
const keys = value => Object.keys(value).sort().join(',')
const realDate = value => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(value + 'T00:00:00Z')) && new Date(value + 'T00:00:00Z').toISOString().slice(0, 10) === value
const fail = message => { throw new Error('source policy: ' + message) }
/** A string as a literal inside a regular expression. */
const literal = text => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
const plain = value => value && typeof value === 'object' && !Array.isArray(value)
const strings = (value, out = []) => {
  if (typeof value === 'string') out.push(value)
  else if (value && typeof value === 'object') for (const v of Object.values(value)) strings(v, out)
  return out
}

/** A validated policy. Every reader fails closed on a malformed file. */
export function sourcePolicy(data = file, withheldEntries = []) {
  if (!plain(data) || keys(data) !== 'schema,sources' || data.schema !== 2) fail('must hold exactly schema and sources')
  if (!plain(data.sources) || !Array.isArray(withheldEntries)) fail('sources must be an object and withheld a list')
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
  // Messages here never repeat an entry: an error line must not name what is withheld.
  for (const entry of withheldEntries) {
    if (!plain(entry) || !['date,reason,source', 'date,document,reason', 'date,mode,reason,source', 'date,document,mode,reason'].includes(keys(entry))) fail('a withheld entry holds exactly source or document, reason, date and an optional mode')
    if (!REASONS.includes(entry.reason) || !realDate(entry.date) || ('mode' in entry && !MODES.includes(entry.mode))) fail('a withheld entry needs a known reason class, an ISO date and a known mode')
    const kind = 'source' in entry ? 'source' : 'document', id = entry[kind], held = kind === 'source' ? sources : documents
    if (typeof id !== 'string' || !(kind === 'source' ? SOURCE_ID : DOCUMENT_ID).test(id)) fail('a withheld id is not well formed')
    if (held.has(id)) fail('a withheld id is listed twice')
    // Only the mode leaves this loader. The reason and date stay in the private store.
    held.set(id, { mode: entry.mode ?? 'list_only' })
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
    const record = records.get(id), token = new RegExp(`(?:^|[^a-z0-9])${literal(id)}(?:$|[^a-z0-9-])`)
    const hosts = (record.hosts ?? []).map(h => new RegExp(`(?:^|[/.@])${literal(h)}(?:$|[/:?#"'\\s])`, 'i'))
    const names = (record.names ?? []).map(n => n.toLowerCase())
    return { id, test: text => token.test(text) || hosts.some(h => h.test(text)) || (names.length && names.some(n => text.toLowerCase().includes(n))) }
  })
  /** Ids of the listed sources that any string in the value names: by id, by one of its hosts or by its name. */
  const sourcesIn = value => { const all = strings(value); return matchers.filter(m => all.some(text => m.test(text))).map(m => m.id) }
  return {
    use, withheld, can, summaries, kbGeneration, sourcesIn, listed: source => records.has(source), withheldCount: sources.size + documents.size,
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

/** The policy in force: the public tiers, and the withheld list once a private store has been loaded. A live
 * binding, so every importer sees the list loadWithheld() last accepted. */
export let POLICY = sourcePolicy(file)
let loaded

/** Read a private store's contents ({ "schema": 1, "withheld": [...] } as text) into the policy in force.
 * Nothing, or an empty string, is "nothing withheld". Anything else that does not parse and validate throws,
 * with a message that never repeats the store, and the caller must not serve from the old list. */
export function loadWithheld(raw) {
  const text = raw == null ? '' : String(raw).trim()
  if (text === loaded) return POLICY
  let entries = []
  if (text) {
    let store
    try { store = JSON.parse(text) } catch { fail('the withheld store is unreadable') }
    if (!plain(store) || keys(store) !== 'schema,withheld' || store.schema !== 1 || !Array.isArray(store.withheld)) fail('the withheld store is unreadable')
    entries = store.withheld
  }
  POLICY = sourcePolicy(file, entries)
  loaded = text
  return POLICY
}

/** A short digest of a store's entries, the same from this loader and the Python one, so the copies held by
 * the Workers, the build and the refresh box can be compared without showing an entry. */
export async function withheldDigest(raw) {
  const text = raw == null ? '' : String(raw).trim(), entries = text ? JSON.parse(text).withheld : []
  const canonical = entries.map(e => JSON.stringify(Object.fromEntries(Object.entries({ mode: 'list_only', ...e }).sort(([a], [b]) => a < b ? -1 : 1)))).sort()
  const hash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode('[' + canonical.join(',') + ']'))
  return [...new Uint8Array(hash)].slice(0, 8).map(b => b.toString(16).padStart(2, '0')).join('')
}

/** { sources, documents } of a knowledge base resource: its source label, origin source id and slug. */
export function kbIds(resource) {
  const labels = resource?.usermetadata?.classifications ?? []
  const sources = labels.filter(c => c?.labelset === 'source' && c.label).map(c => String(c.label))
  if (resource?.origin?.source_id) sources.push(String(resource.origin.source_id))
  return { sources, documents: resource?.slug ? [String(resource.slug)] : [] }
}

/** Why a knowledge base resource's text may not be read, quoted, summarised or labelled: { mode } when it
 * is withheld (hide: it is not shown at all) or its tier keeps it out of the knowledge base; null when it may. */
export function kbRefusal(resource, policy = POLICY) {
  const ids = kbIds(resource)
  return policy.withheld(ids) ?? (policy.can('kb', ids) ? null : { mode: 'list_only' })
}

/** What a withheld document shows in list_only mode: title, date, the neutral notice and the publisher's page. */
export function listingRow(commission, doc) {
  // The publisher's own page for the document; never the file itself where a page or the site is known.
  const files = new Set((doc.files ?? []).map(f => f.url))
  const page = [doc.page_url, commission.site].find(u => u && !files.has(u)) ?? doc.page_url ?? null
  return { key: doc.key, kind: doc.kind, title: doc.title, date: doc.date ?? null, date_basis: doc.date_basis ?? null, page_url: page, files: [],
    cite: { url: page, document: doc.title }, acquisition: doc.acquisition ?? null, unavailable: NOTICE }
}

const without = (row, drop) => Object.fromEntries(Object.entries(row).filter(([k]) => !drop.includes(k)))

/** One commission's public record with the policy applied, or null when the whole commission is hidden. A
 * withheld document becomes a neutral listing row, or is left out in hide mode; a document whose tier allows
 * no quotation carries no quotation or text pointer; recommendations and court context drawn from either go,
 * and so does a fact read from a withheld document. Nothing in the result says why. */
export function redactCommission(c, policy = POLICY) {
  const cid = c.id, out = { ...c }, sourceEntry = policy.withheld({ sources: [cid] })
  if (sourceEntry?.mode === 'hide') return null
  const quotable = key => allows(policy.use(cid, `${cid}/${key}`), 'quote')
  const withheldKeys = new Set(), withheldUrls = new Set(), heldUrls = new Set()
  for (const group of ['reports', 'responses', 'transcripts']) {
    out[group] = (c[group] ?? []).flatMap(d => {
      const entry = policy.withheld({ sources: [cid], documents: [`${cid}/${d.key}`] })
      if (entry) {
        withheldKeys.add(d.key)
        for (const f of d.files ?? []) withheldUrls.add(f.url)
        return entry.mode === 'hide' ? [] : [listingRow(c, d)]
      }
      if (!quotable(d.key)) {
        for (const f of d.files ?? []) heldUrls.add(f.url)
        return [without(d, TEXT_KEYS)]
      }
      return [d]
    })
  }
  out.recommendations = (c.recommendations ?? []).filter(r => !withheldKeys.has(r.report) && quotable(r.report))
  out.court_context = (c.court_context ?? []).filter(x => !withheldKeys.has(x.applies_to))
  // A fact read from a withheld document goes; one read from a document that is not quotable keeps its value
  // and page and loses its quotation.
  const fact = f => !f || withheldUrls.has(f.cite?.url) || (sourceEntry && 'quote' in f) ? null : heldUrls.has(f.cite?.url) ? without(f, ['quote']) : f
  out.established = fact(c.established ?? null)
  out.commissioners = (c.commissioners ?? []).map(fact).filter(Boolean)
  if (sourceEntry) { out.notes = []; out.unavailable = NOTICE }
  return out
}
