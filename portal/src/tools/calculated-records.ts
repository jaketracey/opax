/** Public deterministic calculators. Ask supplies its original question and conversation scope separately. */
import { calculatedLookup } from '../research-calculated'
import { readToolAsset, type ToolDefinition } from './types'
import { clip } from './record-common'

export const calculatedRecordTools: ToolDefinition[] = ['paid_answer', 'ranked_money'].map(name => ({
  name,
  description: name === 'paid_answer'
    ? 'Calculate a complete federal pay answer, ranking or comparison: parliamentarians for the requested year/date, and current Tribunal rates for departmental secretaries and agency heads. Pass the full question. The calculator supplies every figure. Use parliamentary_pay for individual dated office or member rows.'
    : 'Calculate rankings of individual published money records, state disclosure comparisons or public money overviews from a full question. Preserves donor identity gates and financial-year semantics. Federal mixed receipts are not donation or influence evidence. Use money_totals for summed receipts and contracts or grants for individual awards. No generation or writes.',
  inputSchema: { type: 'object', additionalProperties: false, properties: {
    question: { type: 'string', minLength: 5, maxLength: 2000 },
    from: { type: 'string', pattern: '^\\d{4}$' }, to: { type: 'string', pattern: '^\\d{4}$' },
    since: { type: 'string', pattern: '^\\d{4}-\\d{2}-\\d{2}$' }, until: { type: 'string', pattern: '^\\d{4}-\\d{2}-\\d{2}$' },
    state: { type: 'string', enum: ['federal', 'nsw', 'vic', 'qld', 'sa', 'wa', 'tas', 'act', 'nt'] },
    party: { type: 'string', minLength: 2, maxLength: 120 }, chamber: { type: 'string', maxLength: 60 },
  }, required: ['question'], examples: [{ question: name === 'paid_answer' ? 'What is the federal parliamentary base salary in 2025?' : 'Which federal parties have the largest disclosed receipt totals in 2024-25?' }] },
  stepLabel: args => ({ label: name === 'paid_answer' ? 'Calculating pay' : 'Checking published money records', arg: clip(args.from ?? args.since ?? '', 40) }),
  async handler(env, args) {
    const { question, ...filters } = args
    const r = await calculatedLookup(name, filters, { question: String(question) }, { asset: path => readToolAsset(env, path), kb: env.kb ?? (async () => { throw new Error('Corpus unavailable') }), origin: env.origin, signal: env.signal, toolEnv: env })
    return { ...r.data, rows: r.data?.calculated_answer ? (r.data.payload as { sources?: unknown[] }).sources ?? [] : [],
      citations: r.cite.map(c => ({ kind: 'record' as const, text: c.label, url: c.url })), notes: r.notes,
      ...(r.error ? { error: r.error } : {}), ...(r.coverage ? { coverage: r.coverage } : {}) }
  },
}))
