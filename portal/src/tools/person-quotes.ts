/** Stateless public member excerpts. Ask adds its answer-specific citation verification around this data capability. */
import { tool as corpus } from './corpus-records'
import { validWindow } from './published-records'
import { clip } from './record-common'
import type { ToolDefinition } from './types'

export const tool: ToolDefinition = {
  name: 'person_quotes', evidenceKind: 'passages',
  description: 'Read one parliamentarian\'s own verified Hansard excerpts about a subject, newest first within the retrieved sample, one per speech. Uses the shared original corpus reader and the member\'s first speaking turn. These are matched source excerpts; complete counts come from the speech-count tools. Use corpus_records with returned record_id to read more or search official releases.',
  inputSchema: { type: 'object', additionalProperties: false, properties: {
    person: { type: 'string', minLength: 2, maxLength: 120 }, topic: { type: 'string', minLength: 2, maxLength: 200 },
    limit: { type: 'integer', minimum: 1, maximum: 8 }, since: { type: 'string', pattern: '^\\d{4}-\\d{2}-\\d{2}$' }, until: { type: 'string', pattern: '^\\d{4}-\\d{2}-\\d{2}$' },
    jurisdiction: { type: 'string', enum: ['federal', 'nsw', 'vic', 'qld', 'sa', 'act'] },
  }, required: ['person', 'topic'], examples: [{ person: 'Andrew Wilkie', topic: 'housing' }] },
  identifierFields: ['person'], validate: validWindow,
  stepLabel: args => ({ label: 'Reading their speeches', arg: clip(args.person, 40) }),
  async handler(env, args) {
    const data = await corpus.handler(env, { kind: 'speech', speaker: args.person, query: args.topic, limit: Math.min(Number(args.limit) || 5, 5),
      ...(args.since ? { since: args.since } : {}), ...(args.until ? { until: args.until } : {}), ...(args.jurisdiction ? { jurisdiction: args.jurisdiction } : {}) })
    const rows = (data.rows as Record<string, unknown>[]).sort((a, b) => String(b.date ?? '').localeCompare(String(a.date ?? '')))
    return { ...data, rows, person: rows[0]?.speaker ?? args.person, topic: args.topic,
      passages: rows.map(r => ({ ...r, slug: r.record_id, text: r.excerpt, opax_url: r.url })),
      notes: [...data.notes, 'Newest first within the retrieved sample, one excerpt per speech.'] }
  },
}
