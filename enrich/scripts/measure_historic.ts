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
import roster from '../src/historic-names.json' with { type: 'json' }

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
const escape = (s: string): string => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
const places = [...roster.electorates.split('\n'), 'New South Wales', 'New Zealand', 'Papua New Guinea', 'East Timor', 'South Africa', 'United States', 'United Kingdom', 'Northern Territory', 'Australian Capital Territory', 'Western Australia', 'South Australia', 'Hong Kong', 'Sri Lanka', 'Port Moresby', 'Torres Strait', 'Cape York']
const controlPatterns: Record<string, RegExp> = {
  placesElectorates: new RegExp(`\\b(?:${places.sort((a, b) => b.length - a.length).map(escape).join('|')})\\b`, 'gi'),
  parties: /\b(?:Australian Labor Party|Labor Party|Liberal Party|National Party|Country Party|Australian Democrats|Australian Greens|One Nation|Liberal National Party)\b/g,
  titles: /\b(?:Mr (?:Deputy )?Speaker|Mr (?:Deputy )?President|Madam Speaker|Madam President|(?:Deputy )?Prime Minister|the Treasurer|Minister for (?:[A-Z][a-z-]+(?: (?:and|the))? ?){1,5})\b/g,
  laws: /\b[A-Z][a-z-]+(?: (?:[A-Z][a-z-]+|and|of|the|for)| \([A-Za-z ]+\)){0,10} (?:Act|Bill)\b/g,
}
const controls: Record<string, { references: number; fired: number; rate: number; affectedUnits: number }> = Object.fromEntries(Object.keys(controlPatterns).map((k) => [k, { references: 0, fired: 0, rate: 0, affectedUnits: 0 }]))
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
      let anyControlFired = false
      for (const [category, pattern] of Object.entries(controlPatterns)) {
        let categoryFired = false
        for (const match of text.matchAll(pattern)) {
          const fire = hasNewPersonalName(`Reported concerns about ${match[0]} and the need for better regional services.`, '')
          controls[category].references++
          controls[category].fired += Number(fire)
          categoryFired ||= fire
          anyControlFired ||= fire
        }
        controls[category].affectedUnits += Number(categoryFired)
      }
      controlUnitsFired += Number(anyControlFired)
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
    nonPersonControls: { ...controlTotals, rate: controlTotals.fired / controlTotals.references, affectedUnits: controlUnitsFired, byCategory: controls },
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
