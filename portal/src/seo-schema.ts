/** Schema.org V30.1 shapes; no network or Worker bindings are needed here. */
export type SchemaNode = Record<string, unknown>

export interface PersonSchemaIdentity {
  portraitId?: string | null
  /** A verified APH MPID, not the OpenAustralia pid used by votes/portraits. */
  aphMpid?: string | null
  aphProfileUrl?: string | null
  wikidata?: string | null
}

export interface BillSchemaInfo {
  identifier?: string | null
  status?: string | null
  /** Supply only when the source establishes commencement, not just assent. */
  legalForce?: 'InForce' | 'NotInForce' | 'PartiallyInForce' | null
}

export interface DatasetSchemaInfo {
  name?: string
  description?: string
  distributions?: { url: string; encodingFormat?: string }[]
}

export interface SchemaGraphOptions {
  canonical: string
  title: string
  description?: string
  jsonLd?: SchemaNode | null
  person?: PersonSchemaIdentity
  bill?: BillSchemaInfo
  dataset?: DatasetSchemaInfo
  breadcrumbs?: { name: string; url: string }[]
}

const STATUS_LABELS: Record<string, string> = {
  introduced: 'Introduced', before_house: 'Before the house', before_parliament: 'Before parliament',
  passed_one_house: 'Passed one house', passed_both: 'Passed both houses', passed: 'Passed',
  assented: 'Assented', rejected: 'Rejected', withdrawn: 'Withdrawn', lapsed: 'Lapsed',
  exposure_draft: 'Exposure draft', in_force: 'In force', partially_in_force: 'Partially in force',
  repealed: 'Repealed',
}

const PROPOSED_STATUSES = new Set([
  'introduced', 'before_house', 'before_parliament', 'passed_one_house', 'passed_both',
  'rejected', 'withdrawn', 'lapsed', 'exposure_draft',
])

/** Only exact official profiles qualify as sameAs; a search does not identify a person. */
function aphProfile(person: PersonSchemaIdentity): string | null {
  if (person.aphProfileUrl) {
    try {
      const url = new URL(person.aphProfileUrl)
      const id = url.searchParams.get('MPID')
      if (url.protocol === 'https:' && /^(?:www\.)?aph\.gov\.au$/.test(url.hostname)
        && url.pathname === '/Senators_and_Members/Parliamentarian' && /^[a-z0-9]+$/i.test(id ?? '')) {
        return `https://www.aph.gov.au/Senators_and_Members/Parliamentarian?MPID=${id}`
      }
    } catch { /* Unknown identity is omitted. */ }
  }
  return /^[a-z0-9]+$/i.test(person.aphMpid ?? '')
    ? `https://www.aph.gov.au/Senators_and_Members/Parliamentarian?MPID=${person.aphMpid}` : null
}

function wikidataId(value: string | null | undefined): string | null {
  return /^(?:https:\/\/www\.wikidata\.org\/wiki\/)?(Q[1-9]\d*)$/.exec(value ?? '')?.[1] ?? null
}

export function personSchemaIdentity(person: PersonSchemaIdentity, origin = 'https://opax.com.au'): SchemaNode {
  const portrait = /^(?:\d+|wd-Q[1-9]\d*)$/.test(person.portraitId ?? '') ? person.portraitId : null
  const qid = wikidataId(person.wikidata) || wikidataId(portrait?.startsWith('wd-') ? portrait.slice(3) : null)
  const profile = aphProfile(person)
  const sameAs = [profile, qid ? `https://www.wikidata.org/wiki/${qid}` : null].filter((url): url is string => !!url)
  return {
    ...(portrait ? { image: `${origin.replace(/\/$/, '')}/photos/${portrait}.webp` } : {}),
    ...(sameAs.length ? { sameAs } : {}),
  }
}

/**
 * Schema.org has no legislationStatus property. A bill's parliamentary stage
 * belongs in creativeWorkStatus (Text); legislationLegalForce has only the
 * InForce/NotInForce/PartiallyInForce enumeration. Passage/assent alone cannot
 * establish commencement, so their legal-force value is deliberately absent.
 * See https://schema.org/Legislation and https://schema.org/LegalForceStatus.
 */
export function legislationSchemaFields(bill: BillSchemaInfo): SchemaNode {
  const status = bill.status?.trim()
  const explicitForce = bill.legalForce && ['InForce', 'NotInForce', 'PartiallyInForce'].includes(bill.legalForce) ? bill.legalForce : null
  const legalForce = explicitForce || (status && PROPOSED_STATUSES.has(status) ? 'NotInForce' : null)
  return {
    ...(bill.identifier?.trim() ? { legislationIdentifier: bill.identifier.trim() } : {}),
    ...(status ? { creativeWorkStatus: STATUS_LABELS[status] || status.replace(/_/g, ' ') } : {}),
    ...(legalForce ? { legislationLegalForce: `https://schema.org/${legalForce}` } : {}),
  }
}

const DIRECTORIES: Record<string, string> = {
  person: 'Parliamentarians', party: 'Parties', electorate: 'Electorates', topic: 'Topics',
  donor: 'Donors', supplier: 'Government suppliers', agency: 'Government agencies', campaigner: 'Campaigners',
}

const SECTION_LABELS: Record<string, string> = {
  reports: 'Reports', money: 'Money', grants: 'Grants', bills: 'Bills', data: 'Data', exports: 'Data exports', sitting: 'Sitting weeks',
}

function pageName(title: string): string {
  return title.replace(/\s*· OPAX$/, '').trim() || 'OPAX'
}

function defaultBreadcrumbs(canonical: URL, title: string): { name: string; url: string }[] {
  const origin = canonical.origin
  const path = canonical.pathname.replace(/\/+$/, '') || '/'
  const items = [{ name: 'OPAX', url: `${origin}/` }]
  if (path === '/') return items
  const parts = path.split('/').filter(Boolean)
  const add = (name: string, pathname: string): void => { items.push({ name, url: `${origin}${pathname}` }) }
  if (parts[0] === 'subject' && DIRECTORIES[parts[1]] && parts.length > 2) {
    add(DIRECTORIES[parts[1]], `/subject/${parts[1]}`)
  } else if (parts[0] === 'bill' || parts[0] === 'division') {
    add('Bills', '/bills')
  } else if (parts[0] === 'money' && parts.length > 1) {
    add('Money', '/money')
    if (parts[1] === 'grants' && parts.length > 2) add('Grants', '/money/grants')
  } else if (parts.length > 1 && SECTION_LABELS[parts[0]]) {
    add(SECTION_LABELS[parts[0]], `/${parts[0]}`)
  }
  items.push({ name: pageName(title), url: canonical.href })
  return items
}

function nodesOf(jsonLd: SchemaNode | null | undefined): SchemaNode[] {
  if (!jsonLd) return []
  const nodes = Array.isArray(jsonLd['@graph']) ? jsonLd['@graph'] : [jsonLd]
  return nodes.filter((node): node is SchemaNode => !!node && typeof node === 'object' && !Array.isArray(node))
    .map(node => {
      const { '@context': _context, ...copy } = node
      return copy
    })
}

function hasType(node: SchemaNode, type: string): boolean {
  return node['@type'] === type || Array.isArray(node['@type']) && node['@type'].includes(type)
}

function datasetFor(options: SchemaGraphOptions, canonical: URL): SchemaNode | null {
  const dataPage = /^\/(?:data|exports)(?:\/|$)/.test(canonical.pathname) || canonical.pathname === '/stats'
  if (!options.dataset && !dataPage) return null
  const info = options.dataset ?? {}
  const distributions = info.distributions ?? (canonical.pathname === '/stats' ? [
    { url: `${canonical.origin}/parliamentarians.json`, encodingFormat: 'application/json' },
    { url: `${canonical.origin}/votes.json`, encodingFormat: 'application/json' },
    { url: `${canonical.origin}/bills/index.json`, encodingFormat: 'application/json' },
    { url: `${canonical.origin}/graph/money.json`, encodingFormat: 'application/json' },
  ] : [])
  return {
    '@type': 'Dataset', '@id': `${canonical.href}#dataset`, name: info.name || pageName(options.title),
    description: info.description || options.description || 'Australian parliamentary records and public disclosure data exported by OPAX.',
    url: canonical.href, publisher: { '@id': `${canonical.origin}/#organization` },
    ...(distributions.length ? { distribution: distributions.filter(d => {
      try { return /^https?:$/.test(new URL(d.url, canonical.origin).protocol) } catch { return false }
    }).map(d => ({
      '@type': 'DataDownload', contentUrl: new URL(d.url, canonical.origin).href,
      ...(d.encodingFormat ? { encodingFormat: d.encodingFormat } : {}),
    })) } : {}),
  }
}

/** Add page navigation and enrich existing route metadata without mutating it. */
export function buildSchemaGraph(options: SchemaGraphOptions): SchemaNode {
  const canonical = new URL(options.canonical)
  const origin = canonical.origin
  const graph = nodesOf(options.jsonLd).filter(node => !hasType(node, 'BreadcrumbList'))
  for (const node of graph) {
    if (hasType(node, 'Person')) {
      const knownLinks = Array.isArray(node.sameAs) ? node.sameAs : typeof node.sameAs === 'string' ? [node.sameAs] : []
      const safeLinks = knownLinks.filter((value): value is string => typeof value === 'string'
        && /^https?:\/\//.test(value) && !value.includes('Parliamentarian_Search_Results'))
      const identity = personSchemaIdentity(options.person ?? {}, origin)
      const sameAs = [...new Set([...safeLinks, ...(identity.sameAs as string[] ?? [])])]
      delete node.sameAs
      Object.assign(node, identity, sameAs.length ? { sameAs } : {})
    }
    if (hasType(node, 'Legislation') && options.bill) Object.assign(node, legislationSchemaFields(options.bill))
  }
  if (!graph.length) graph.push({ '@type': 'WebPage', name: pageName(options.title), url: canonical.href,
    ...(options.description ? { description: options.description } : {}) })
  if (canonical.pathname === '/') {
    graph.push({
      '@type': 'WebSite', '@id': `${origin}/#website`, name: 'OPAX', url: `${origin}/`,
      publisher: { '@id': `${origin}/#organization` },
      potentialAction: {
        '@type': 'SearchAction', target: `${origin}/ask?view=search&q={search_term_string}`,
        'query-input': 'required name=search_term_string',
      },
    })
  }
  graph.push({ '@type': 'Organization', '@id': `${origin}/#organization`, name: 'OPAX', url: `${origin}/`, logo: `${origin}/favicon.svg` })
  const dataset = datasetFor(options, canonical)
  if (dataset) graph.push(dataset)
  const trail = options.breadcrumbs?.length ? options.breadcrumbs : defaultBreadcrumbs(canonical, options.title)
  graph.push({ '@type': 'BreadcrumbList', '@id': `${canonical.href}#breadcrumbs`, itemListElement: trail.map((entry, index) => ({
    '@type': 'ListItem', position: index + 1, name: entry.name, item: new URL(entry.url, origin).href,
  })) })
  return { '@context': 'https://schema.org', '@graph': graph }
}

/** Safe in an HTML script element even when a title/summary contains markup. */
export function serializeSchemaGraph(graph: SchemaNode): string {
  return JSON.stringify(graph).replace(/</g, '\\u003c').replace(/>/g, '\\u003e').replace(/&/g, '\\u0026')
}
