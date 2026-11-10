/** State bill metadata and Federal Register instrument metadata, never held source bodies. */
import { clearedStateBills, type StateBillsHub } from '../state-bills'
import { catalogueComplete, unpack } from '../../public/instruments.js'
import { clip, siteUrl } from './record-common'
import { boundedValue, inWindow, object, publishedResult, records, sourceUrl, validWindow, wordsMatch, type RecordRow } from './published-records'
import { readToolAsset, type ToolDefinition, type ToolEnv } from './types'

async function stateBills(env: ToolEnv, args: RecordRow) {
  const jurisdictions = args.jurisdiction ? [String(args.jurisdiction)] : ['act', 'tas']
  const hubs = await Promise.all(jurisdictions.map(async j => {
    const raw = await readToolAsset(env, `/bills-${j}/data.json`)
    if (!raw) throw new Error('State bill snapshot unavailable')
    return raw as StateBillsHub
  }))
  const all = hubs.flatMap(clearedStateBills).filter(b => (!args.record_id || args.record_id === b.key) &&
    (!args.query || wordsMatch(args.query, [b.title, b.key, b.sponsor_name])) && (!args.sponsor || wordsMatch(args.sponsor, [b.sponsor_name])) &&
    (!args.status || args.status === b.status) && inWindow(b.introduced_date, args))
    .sort((a, b) => String(b.introduced_date ?? '').localeCompare(String(a.introduced_date ?? '')) || a.key.localeCompare(b.key))
  const offset = Number(args.offset) || 0
  const rows = all.slice(offset, offset + (Number(args.limit) || 5)).map(b => {
    const source_url = sourceUrl(b.source_url)!
    return { record_id: b.key, kind: 'state_bill', title: b.title, jurisdiction: b.jurisdiction, sponsor: b.sponsor_name,
      introduced_date: b.introduced_date, status: b.status, status_as_of: b.status_as_of, stage: b.stage,
      source_url, full_record_url: siteUrl(env, '/register/state-bills?' + new URLSearchParams({ bill: b.key })),
      follow_up: { kind: 'state_bill', record_id: b.key, jurisdiction: b.jurisdiction },
      ...(args.record_id ? { parliament: b.parliament, source_id: b.source_id, introduction_basis: b.introduction_basis,
        events: boundedValue(b.events), events_total: b.events.length, events_truncated: b.events.length > 20,
        documents: boundedValue(b.sources), documents_total: b.sources.length, documents_truncated: b.sources.length > 20,
        source_notes: boundedValue(b.source_notes ?? []), licence: { name: b.licence.name, text_allowed: false, hold_reason: b.licence.hold_reason } } : {}) }
  })
  const citations = rows.flatMap(row => [{ kind: 'record' as const, url: row.source_url,
    text: `${row.title} (${row.jurisdiction}): introduced ${row.introduced_date ?? 'date not published'}; sponsor ${row.sponsor ?? 'not published'}; status ${row.status} as at ${row.status_as_of}.` },
    ...(args.record_id ? records(row.events).map(event => ({ kind: 'record' as const, url: sourceUrl(event.source_url) ?? row.source_url,
      text: clip(`${row.title}: ${event.stage}, ${event.date ?? 'undated'}, ${event.house ?? 'house not published'}.`, 500) })) : [])])
  return publishedResult(rows, citations, {
    notes: ['ACT Assemblies 10 and 11; Tasmania Parliaments 51 and 52 (2024-2026 indexes). Metadata only: bill text and explanatory bodies are held and not reproduced.',
      'Passed, royal assent and commencement are distinct. Status as-of dates are not event dates; undated flags establish no date.',
      ...(all.length ? [] : ['No published state bill matches these filters.'])],
    total: all.length, offset, next_offset: offset + rows.length < all.length ? offset + rows.length : null,
    truncated: offset + rows.length < all.length, snapshots: hubs.map(h => ({ jurisdiction: h.jurisdiction, snapshot: h.generated_at })),
  })
}

async function instruments(env: ToolEnv, args: RecordRow) {
  const raw = await readToolAsset(env, '/instruments/manifest.json')
  if (!catalogueComplete(raw)) throw new Error('Instrument manifest unavailable')
  const manifest = raw as { generated_at: string; schemas: string[][]; strings: string[]; lookup: Record<string, number>; chunks: { path: string }[]; limitations: string[]; unresolved_gap: number }
  let selected: RecordRow[] = [], total = 0
  if (args.record_id) {
    const chunk = manifest.lookup[String(args.record_id)]
    if (Number.isInteger(chunk)) {
      const path = manifest.chunks[chunk]?.path
      if (!path || !/^\/instruments\/catalogue-[a-z0-9-]+\.json$/.test(path)) throw new Error('Invalid instrument chunk')
      const data = object(await readToolAsset(env, path))
      selected = (Array.isArray(data.records) ? data.records : []).map(value => object(unpack(value, manifest.schemas, manifest.strings)))
        .filter(record => object(record.source).id === args.record_id)
      total = selected.length
    }
  } else {
    const index = object(await readToolAsset(env, '/instruments/index.json'))
    if (!Array.isArray(index.records)) throw new Error('Instrument index unavailable')
    const registered = args.since || args.until ? object(await readToolAsset(env, '/instruments/registered.json')) : {}
    const matched = (index.records as unknown[][]).filter(row => (!args.query || wordsMatch(args.query, [row[0], row[1]])) &&
      (!args.portfolio || wordsMatch(args.portfolio, [row[2]])) && (!args.status || args.status === row[5]) && inWindow(registered[String(row[0])], args))
    total = matched.length
    selected = matched.slice(Number(args.offset) || 0, (Number(args.offset) || 0) + (Number(args.limit) || 5)).map(row => ({
      source: { id: row[0], name: row[1], portfolios: row[2], type: row[3], commencementDate: row[4], status: row[5] },
      opax: { canonical_url: `https://www.legislation.gov.au/${row[0]}/latest` },
    }))
  }
  const rows = selected.map(record => {
    const source = object(record.source), id = String(source.id)
    const source_url = sourceUrl(object(record.opax).canonical_url)!
    return { record_id: id, kind: 'instrument', title: source.name, status: source.status, source_url,
      full_record_url: siteUrl(env, '/instrument/' + id), follow_up: { kind: 'instrument', record_id: id },
      metadata: boundedValue(source), metadata_only: true }
  })
  const offset = args.record_id ? 0 : Number(args.offset) || 0
  return publishedResult(rows, rows.map(row => ({ kind: 'record', url: row.source_url, text: clip(`${row.title} (${row.record_id}), ${row.status}. ` +
    Object.entries(object(row.metadata)).filter(([key]) => ['makingDate', 'asMadeRegisteredAt', 'commencementDate', 'portfolios', 'administeringDepartments', 'publishComments'].includes(key))
      .map(([key, value]) => `${key}: ${typeof value === 'object' ? JSON.stringify(value) : value ?? 'not supplied'}`).join('; '), 1800) })), {
    notes: ['In-force federal legislative instrument metadata only; authoritative legal text is on the Federal Register. In force can include instruments not yet commenced. Versions are bounded source metadata, not a complete history.',
      ...(manifest.unresolved_gap ? [`${manifest.unresolved_gap} titles in the source listing could not be acquired.`] : []), ...(total ? [] : ['No published instrument matches these filters.'])],
    total, snapshot: manifest.generated_at, offset, truncated: offset + rows.length < total, next_offset: offset + rows.length < total ? offset + rows.length : null,
  })
}

export const tool: ToolDefinition = {
  name: 'legislation',
  description: 'Search or open ACT and Tasmania state bills, or federal legislative instruments. State bills return sponsors, introduction, status as-of and, with record_id, published dated stages and original version/explanatory links. Instruments return Federal Register metadata, making/registration/commencement dates and bounded version details. Use kind, query words or record_id copied from a prior row. since/until filter bill introduction or instrument as-made registration dates. offset pages search results. Metadata only: held state bill bodies and instrument legal text are read at the original source. Federal bills remain in find_records(kind=bill).',
  inputSchema: { type: 'object', additionalProperties: false, properties: {
    kind: { type: 'string', enum: ['state_bill', 'instrument'] }, query: { type: 'string', minLength: 2, maxLength: 200 },
    record_id: { type: 'string', pattern: '^(?:au-(?:act|tas)-[a-z0-9-]{1,100}|[CF][0-9]{4}[A-Z][0-9]{5})$' },
    jurisdiction: { type: 'string', enum: ['act', 'tas'] }, sponsor: { type: 'string', minLength: 2, maxLength: 160 },
    portfolio: { type: 'string', minLength: 2, maxLength: 160 }, status: { type: 'string', minLength: 2, maxLength: 80 },
    since: { type: 'string', pattern: '^\\d{4}-\\d{2}-\\d{2}$' }, until: { type: 'string', pattern: '^\\d{4}-\\d{2}-\\d{2}$' },
    limit: { type: 'integer', minimum: 1, maximum: 8 }, offset: { type: 'integer', minimum: 0, maximum: 100000 },
  }, required: ['kind'], examples: [{ kind: 'state_bill', jurisdiction: 'tas', query: 'Conversion Practices' }, { kind: 'instrument', query: 'Housing Australia' }] },
  validate: args => validWindow(args) && (args.kind !== 'instrument' || !args.jurisdiction && !args.sponsor) && (args.kind !== 'state_bill' || !args.portfolio) &&
    (!args.record_id || (args.kind === 'state_bill' ? /^au-(?:act|tas)-/.test(String(args.record_id)) && (!args.jurisdiction || String(args.record_id).startsWith('au-' + args.jurisdiction + '-')) : /^[CF]/.test(String(args.record_id)))) &&
    (!args.record_id || !['query', 'sponsor', 'portfolio', 'status', 'since', 'until', 'offset'].some(k => args[k] !== undefined)),
  stepLabel: args => ({ label: 'Reading legislation', arg: clip(args.query ?? args.record_id ?? args.kind, 40) }),
  handler: (env, args) => args.kind === 'state_bill' ? stateBills(env, args) : instruments(env, args),
}
