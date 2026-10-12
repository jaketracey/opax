// Offline estimate for OA backfill payloads, using the EXISTING Worker prompts,
// clipping and neuron accounting. No SDK, network, model, queue or KB writes.
import { createReadStream, readFileSync, writeFileSync } from 'node:fs'
import { createInterface } from 'node:readline'
import { resolve } from 'node:path'
import { neuronsFor } from '../src/budget.ts'
import { buildSystemPrompt, buildRecordMessage } from '../src/prompts.ts'
import { clip, wordCount } from '../src/text.ts'

const stage = resolve(process.argv[2] ?? '')
if (!process.argv[2]) throw new Error('Provide the backfill stage directory')
const config = JSON.parse(readFileSync(resolve(import.meta.dirname, '../wrangler.jsonc'), 'utf8').replace(/^\s*\/\/.*$/gm, ''))
const primary = config.vars.PRIMARY_MODEL
const escalation = config.vars.ESCALATION_MODEL
const system = buildSystemPrompt(['summary', 'topics'])
let documents = 0, promptChars = 0, primaryNeurons = 0, escalationNeurons = 0, cappedNeurons = 0, clipped = 0
for await (const line of createInterface({ input: createReadStream(resolve(stage, 'kb-payloads.jsonl')), crlfDelay: Infinity })) {
  if (!line.trim()) continue
  const doc = JSON.parse(line)
  const label = (name: string) => doc.usermetadata.classifications.find((c: {labelset: string}) => c.labelset === name)?.label ?? null
  if (label('source') !== 'openaustralia') throw new Error('Expected OpenAustralia payload')
  const text = String(doc.texts.body.body)
  const body = clip(text)
  clipped += Number(body.includes(' [...] '))
  const record = { rid: '0'.repeat(32), slug: doc.slug, title: doc.title, kind: 'speech', state: label('state'), party: label('party'), words: wordCount(text), text: body }
  const chars = system.length + buildRecordMessage(record).length
  const cost = (model: string, tokens: number) => neuronsFor(model, { promptTokens: chars / 3.5, completionTokens: tokens, neurons: null }).neurons
  documents++; promptChars += chars
  primaryNeurons += cost(primary, 620)
  escalationNeurons += cost(escalation, 620)
  cappedNeurons += cost(primary, Number(config.vars.MAX_TOKENS))
}
const scenario = (neurons: number) => ({ neurons, usd: neurons * 0.011 / 1000 })
const report = {
  path: 'opax-enrich: enrich/src/discover.ts → enrich/src/tick.ts → enrich/src/generate.ts → enrich/src/write.ts',
  documents, summaries: documents, topic_labels: documents, queue_rows_if_released: documents * 2,
  model_calls_first_pass: documents, primary_model: primary, escalation_model: escalation,
  prompt_characters: promptChars, clipped_documents: clipped, mean_output_tokens: 620,
  first_pass: scenario(primaryNeurons),
  five_percent_primary_retry_plus_one_percent_escalation: scenario(primaryNeurons * 1.05 + escalationNeurons * 0.01),
  primary_max_output_every_call: scenario(cappedNeurons),
  method: 'Actual combined Worker system/record messages and clip(); estimated input tokens = JS characters / 3.5; 620 output tokens (existing Qwen bake-off mean, includes thinking); neuronsFor() prices. One call supplies both summary and topics.',
  limitations: 'Gross marginal USD before shared daily free allowance. Retry rates are scenarios, not measured for this corpus; excludes platform, D1 and KB costs. No generation or queueing performed. OA source does not trigger the separate hansard_hist hold.',
  pricing_source: 'https://developers.cloudflare.com/workers-ai/platform/pricing/',
  priced_at: '2026-10-13',
}
writeFileSync(resolve(stage, 'enrichment-cost.json'), JSON.stringify(report, null, 2) + '\n')
console.log(JSON.stringify(report))
