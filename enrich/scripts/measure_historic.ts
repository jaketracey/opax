// Offline only. Reads staged payloads, emits aggregates; no KB, AI, D1 or network calls.
// Never persist speech text, titles, speaker metadata, name candidates or prompt contents.
import { createHash } from 'node:crypto'
import { createReadStream, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { createInterface } from 'node:readline'
import { neuronsFor } from '../src/budget.ts'
import { HISTORIC_MIN_CHARS, isHistoricSpeech, skipHistoricShort, summaryCharacters } from '../src/historic.ts'
import { buildRecordMessage, buildSystemPrompt, type PromptRecord } from '../src/prompts.ts'
import { clip, pickText, wordCount } from '../src/text.ts'
import { NAMES_PROBLEM, hasNewPersonalName } from '../src/validate.ts'
import {pilotControls, REVIEW_REFERENCES} from './audit_controls.ts'

const auditOnly = process.argv.includes('--pilot-audit')
const directory = resolve(process.argv.slice(2).find((a: string) => a !== '--pilot-audit') ?? '/home/jake/opax-staging/federation/kb-gap')
const config = JSON.parse(readFileSync(resolve(import.meta.dirname, '../wrangler.jsonc'), 'utf8').replace(/^\s*\/\/.*$/gm, ''))
const dailyBudget = Number(config.vars.DAILY_NEURON_BUDGET)
const primaryModel = config.vars.PRIMARY_MODEL
const escalationModel = config.vars.ESCALATION_MODEL
const completionTokens = 620 // Existing qwen bake-off mean, including thinking: src/generate.ts.
const combinedSystem = buildSystemPrompt(['summary', 'topics'], true)
const summarySystem = buildSystemPrompt(['summary'], true)
const retryComplaint = '\n\nThe previous attempt failed these checks. Rewrite every value and return the complete object:\n- summary: ' + NAMES_PROBLEM

type Count = { total: number; short: number; share: number }
type Counts = { total: number; short: number; share: number; byYear: Record<string, Count>; byChamber: Record<string, Count>; byKind: Record<string, Count>; strata: Record<string, Count> }
const counts = (): Counts => ({ total: 0, short: 0, share: 0, byYear: {}, byChamber: {}, byKind: {}, strata: {} })
function add(out: Counts, year: string, chamber: string, kind: string, short: boolean): void {
  const bump = (c: Count): void => { c.total++; c.short += Number(short); c.share = c.short / c.total }
  bump(out)
  for (const [group, key] of [[out.byYear, year], [out.byChamber, chamber], [out.byKind, kind], [out.strata, `${year}/${chamber}/${kind}`]] as const) bump(group[key] ??= { total: 0, short: 0, share: 0 })
}

// Independently select known legitimate references from pilot text. These are tested with
// source support removed, so the source-text exemption cannot make the controls tautological.
// The controls cover place/electorate names, party names, ministerial titles and law titles;
// they are an offline specificity audit, not labelled model-output precision/recall.
const controls: Record<string, { references: number; fired: number; rate: number; affectedUnits: number }> = Object.fromEntries(['placesElectorates','parties','titles','laws','organisations'].map((k) => [k, { references: 0, fired: 0, rate: 0, affectedUnits: 0 }]))
let malformedControls = 0
let correctedControls = 0
const cleanPool: Array<{category: string; text: string; unit: number}> = []
const replacementPool: Array<{category: string; text: string; unit: number}> = []
let pilotFired = 0
let pilotClippedFired = 0
let pilotTested = 0
let controlUnitsFired = 0
let briefable = 0
let noText = 0
let clippedUnits = 0
let promptCharsTotal = 0
let primaryNeurons = 0
let nameEscalationNeurons = 0
let primaryAtMaxTokens = 0
const pilot = counts()
const t1 = counts()
const allJsonl = counts()
const files: Array<Record<string, unknown>> = []
const manifest = JSON.parse(readFileSync(resolve(directory, 'manifest.json'), 'utf8'))
const t1Files = new Set<string>(manifest.outputs.map((f: { path: string }) => f.path.split('/').at(-1)))
const actualT1 = readdirSync(directory).filter((f) => f.endsWith('.jsonl') && f !== 'pilot-2000.jsonl')
if (actualT1.length !== t1Files.size || actualT1.some((f) => !t1Files.has(f))) throw new Error('T1 file set differs from manifest')

for (const file of ['pilot-2000.jsonl', ...(auditOnly ? [] : actualT1.sort())]) {
  const isPilot = file === 'pilot-2000.jsonl'
  const fileCounts = counts()
  const hash = createHash('sha256')
  const stream = createReadStream(resolve(directory, file), { encoding: 'utf8' })
  stream.on('data', (chunk) => hash.update(chunk))
  for await (const line of createInterface({ input: stream, crlfDelay: Infinity })) {
    if (!line.trim()) continue
    const unit = JSON.parse(line)
    if (!isHistoricSpeech(unit)) throw new Error('Staged unit lacks historic speech labels')
    // Staged KB write payloads use texts.<field>.body; GET values wrap it in value.
    const text = pickText(Object.fromEntries(Object.entries(unit.texts).map(([key, field]) => [key, { value: field as { body?: string } }])))
    const metadata = unit.extra.metadata
    const year = String(metadata.date).slice(0, 4)
    const tag = (labelset: string): string | null => unit.usermetadata.classifications.find((c: { labelset: string }) => c.labelset === labelset)?.label ?? null
    const chamber = tag('chamber') ?? 'unknown'
    const kind = metadata.unit_kind ?? 'unknown'
    const short = skipHistoricShort(true, text)
    add(fileCounts, year, chamber, kind, short)
    add(isPilot ? pilot : t1, year, chamber, kind, short)
    add(allJsonl, year, chamber, kind, short)
    if (isPilot) {
      pilotTested++
      pilotFired += Number(hasNewPersonalName(text, text))
      pilotClippedFired += Number(hasNewPersonalName(clip(text), text))
      const selected = pilotControls(text)
      malformedControls += selected.malformed
      correctedControls += selected.controls.filter(c=>c.corrected).length
      cleanPool.push(...selected.controls.map(c=>({...c, unit:pilotTested})))
      replacementPool.push(...selected.replacements.map(c=>({...c, unit:pilotTested})))
    } else if (!short) {
      const words = wordCount(text)
      if (words < 3) { noText++; continue }
      briefable++
      const clipped = clip(text)
      clippedUnits += Number(summaryCharacters(text) < Array.from(text.split(/\s+/).filter(Boolean).join(' ')).length)
      const record: PromptRecord = { rid: '0'.repeat(32), slug: unit.slug, title: unit.title ?? '', kind: 'speech', state: tag('state'), party: tag('party'), words, text: clipped, historic: true }
      const user = buildRecordMessage(record)
      const chars = combinedSystem.length + user.length
      promptCharsTotal += chars
      const cost = (model: string, inputChars: number, outputTokens: number): number => neuronsFor(model, { promptTokens: inputChars / 3.5, completionTokens: outputTokens, neurons: null }).neurons
      primaryNeurons += cost(primaryModel, chars, completionTokens)
      nameEscalationNeurons += cost(escalationModel, summarySystem.length + user.length + retryComplaint.length, completionTokens)
      primaryAtMaxTokens += cost(primaryModel, chars, Number(config.vars.MAX_TOKENS))
    }
  }
  const expected = isPilot ? manifest.pilot.units : manifest.outputs.find((f: { path: string }) => f.path.split('/').at(-1) === file).units
  if (fileCounts.total !== expected) throw new Error('Unit count differs from manifest')
  files.push({ file, sha256: hash.digest('hex'), bytes: statSync(resolve(directory, file)).size, ...fileCounts })
  console.log(JSON.stringify({ file, total: fileCounts.total, short: fileCounts.short }))
}
// Keep the review's 8,135-control sample size. Malformed person fragments are
// replaced deterministically with source-derived controls, irrespective of guard results.
const targetControls = 8135
if (!cleanPool.length || cleanPool.length > targetControls) throw new Error('Unexpected pilot control pool')
const sample = [...cleanPool]
if (replacementPool.length < targetControls - sample.length) throw new Error('Insufficient independent replacement controls')
for (let i=0; sample.length<targetControls; i++) sample.push(replacementPool[i])
const affected = new Set<number>()
const byCategory = new Map<string,Set<number>>()
for (const control of sample) {
  const fire = hasNewPersonalName(`Reported concerns about ${control.text} and the need for better regional services.`, '')
  controls[control.category].references++
  controls[control.category].fired += Number(fire)
  if (fire) { affected.add(control.unit); const units=byCategory.get(control.category)??new Set<number>(); units.add(control.unit); byCategory.set(control.category,units) }
}
controlUnitsFired=affected.size
for (const [category,units] of byCategory) controls[category].affectedUnits=units.size
const reviewFired = REVIEW_REFERENCES.filter(reference=>hasNewPersonalName(`Reported concerns about ${reference} and regional services.`, '')).length
for (const control of Object.values(controls)) control.rate = control.references ? control.fired / control.references : 0
const controlTotals = Object.values(controls).reduce((a, c) => ({ references: a.references + c.references, fired: a.fired + c.fired }), { references: 0, fired: 0 })
const scenario = (neurons: number) => ({ neurons, budgetDays: neurons / dailyBudget, wholeBudgetDays: Math.ceil(neurons / dailyBudget) })
const report = {
  schema: 1,
  characterRule: `pickText(longest non-summary body), text.clip (whitespace squash/head-tail), Unicode code points; short < ${HISTORIC_MIN_CHARS}`,
  t1Definition: 'Manifest outputs; excludes the duplicate pilot sample. allJsonl includes the pilot for literal glob totals.',
  pilot, t1, allJsonl, files,
  guardAudit: {
    method: 'Existing prompt text is retained for live sources. No model is called: test full pilot text and clipped model input against each unit own full text, and independently selected non-person reference spans with source support withheld.',
    limitation: 'Text-only specificity checks; no generated summaries or labelled personal-name recall. The own-text control necessarily passes supported references and is not a model-output precision estimate.',
    promptSha256: createHash('sha256').update(buildSystemPrompt(['summary', 'topics'])).digest('hex'),
    unitsTested: pilotTested, ownTextFired: pilotFired, ownTextRate: pilotFired / pilotTested, clippedTextFired: pilotClippedFired,
    nonPersonControls: { ...controlTotals, originalCleanOccurrences: cleanPool.length, correctedSpans: correctedControls, malformedOrAmbiguousFragmentsReplaced: malformedControls, replacementMethod: 'Replace malformed fragments with the first independently selected additional gazetteer/organisation occurrences in pilot order; no guard-dependent filtering.', rate: controlTotals.fired / controlTotals.references, affectedUnits: controlUnitsFired, byCategory: controls },
    reviewExamples: { references: REVIEW_REFERENCES.length, fired: reviewFired, rate: reviewFired / REVIEW_REFERENCES.length },
  },
  neurons: {
    method: 'src/budget.ts neuronsFor, prompt input estimated at 3.5 JS characters/token; actual clipped text and historic combined system/record messages; one shared primary call for summary+topics.',
    assumptions: 'All non-short T1 units lack briefs/topics; 620 output tokens including thinking (existing bake-off mean), 32-character KB rid. Tokenizer/schema framing and live daily spend excluded. Escalation scenarios assume the same output-token mean, not a measured escalation rate.',
    briefableUnits: briefable, additionalNoTextUnits: noText, clippedUnits, totalPromptChars: promptCharsTotal,
    primaryModel, escalationModel, meanCompletionTokens: completionTokens, dailyNeuronBudget: dailyBudget,
    primaryOneCall: scenario(primaryNeurons),
    onePercentNameEscalation: scenario(primaryNeurons + nameEscalationNeurons * 0.01),
    fivePercentNameEscalation: scenario(primaryNeurons + nameEscalationNeurons * 0.05),
    everyUnitNameEscalated: scenario(primaryNeurons + nameEscalationNeurons),
    primaryAtMaxOutputTokens: { outputTokens: Number(config.vars.MAX_TOKENS), ...scenario(primaryAtMaxTokens) },
  },
}
const out = resolve(directory, 'short-units.json')
if (auditOnly) console.log(JSON.stringify(report.guardAudit))
else {
  writeFileSync(out, JSON.stringify(report, null, 2) + '\n')
  console.log(JSON.stringify({ output: out, pilot: { total: pilot.total, short: pilot.short, share: pilot.share }, t1: { total: t1.total, short: t1.short, share: t1.share }, guardAudit: report.guardAudit, neurons: report.neurons }))
}
