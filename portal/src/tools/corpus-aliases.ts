/** Stateless retrieval aliases shared by Ask and the public MCP. */
import { tool as corpus } from './corpus-records'
import { tool as personQuotes } from './person-quotes'
import { findPeople } from './speech-data'
import { tool as sponsoredBills } from './sponsored-bills'
import { readToolAsset, type ToolDefinition } from './types'
import { validWindow } from './published-records'
import { clip } from './record-common'

export const search: ToolDefinition = {
  name: 'search', evidenceKind: 'passages',
  description: 'Search verified original Hansard excerpts. Compatibility entry for corpus_records with kind speech; prefer corpus_records for speech and release search, original detail and paging. Use complete scoped counting tools for counts and whole-period absence. Ask adds its question scope and citation IDs around the same retrieval capability.',
  inputSchema: { type: 'object', additionalProperties: false, properties: {
    query: { type: 'string', minLength: 2, maxLength: 300 }, limit: { type: 'integer', minimum: 1, maximum: 8 },
    party: { type: 'string', minLength: 2, maxLength: 60 },
    since: { type: 'string', pattern: '^\\d{4}-\\d{2}-\\d{2}$' }, until: { type: 'string', pattern: '^\\d{4}-\\d{2}-\\d{2}$' },
  }, required: ['query'], examples: [{ query: 'housing affordability', party: 'Labor' }] },
  validate: validWindow, stepLabel: args => ({ label: 'Searching the record', arg: clip(args.query, 40) }),
  handler: (env, args) => corpus.handler(env, { ...args, kind: 'speech', limit: Math.min(Number(args.limit) || 4, 5) }),
}
export const readPassage: ToolDefinition = {
  name: 'read_passage', evidenceKind: 'passages',
  description: 'Read an original source excerpt by the public speech or press record ID and optional text_offset returned by corpus_records. Prefer corpus_records for full filters. Ask can also recheck a citation id from the current question, which is request state rather than a public record identifier.',
  inputSchema: { type: 'object', additionalProperties: false, properties: {
    record_id: corpus.inputSchema.properties!.record_id,
    text_offset: { type: 'integer', minimum: 0, maximum: 500000 },
  }, required: ['record_id'], examples: [{ record_id: 'speech-123' }] },
  stepLabel: args => ({ label: 'Reading a passage', arg: clip(args.record_id, 40) }),
  handler: (env, args) => corpus.handler(env, { ...args, kind: String(args.record_id).startsWith('press-') ? 'press_release' : 'speech' }),
}
export const personOverview: ToolDefinition = {
  name: 'person_overview',
  description: 'Read a parliamentarian identity, sampled recent Hansard excerpts and attributable sponsored bills together. A public data overview, not an inferred position or a complete career history. For historical questions use dated corpus_records or member_divisions; for their words use person_quotes. Ask also has an answer-pack formatter for this data.',
  inputSchema: { type: 'object', additionalProperties: false, properties: { person: { type: 'string', minLength: 2, maxLength: 120 } }, required: ['person'], examples: [{ person: 'David Pocock' }] },
  identifierFields: ['person'], stepLabel: args => ({ label: 'Reading member records', arg: clip(args.person, 40) }),
  async handler(env, args) {
    const identity = await findPeople({ asset: p => readToolAsset(env, p), kb: env.kb ?? (async () => { throw new Error('Corpus unavailable') }), origin: env.origin, signal: env.signal }, { name: String(args.person) })
    const person = (identity.data?.people as { name: string }[] | undefined)?.[0]?.name
    if (!person) return { rows: [], citations: [], notes: identity.notes, candidates: identity.data?.candidates }
    const [speeches, bills] = await Promise.all([personQuotes.handler(env, { person, topic: '*', limit: 3 }), sponsoredBills.handler(env, { person, limit: 3 })])
    return { rows: identity.data?.people as unknown[], person, speeches: speeches.rows, bills: bills.rows,
      citations: [...identity.cite.map(c => ({ kind: 'record' as const, text: c.label, url: c.url })), ...speeches.citations, ...bills.citations],
      notes: [...identity.notes, ...speeches.notes, ...bills.notes] }
  },
}
