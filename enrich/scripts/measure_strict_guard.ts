// Offline evaluation of real bake-off briefs. Emit only aggregate counts and hashes;
// never emit or persist briefs, candidate terms, speaker metadata or prompt text.
import { createHash } from 'node:crypto'
import { createReadStream, readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { createInterface } from 'node:readline'
import { pickText } from '../src/text.ts'
import { cleanupSummary, hasNewPersonalName } from '../src/validate.ts'
import { pilotControls, REVIEW_REFERENCES } from './audit_controls.ts'

const bakeoff = resolve(process.argv[2] ?? '/home/jake/opax-staging/federation/bakeoff')
const pilot = resolve(process.argv[3] ?? '/home/jake/opax-staging/federation/kb-gap/pilot-2000.jsonl')
const output = resolve(process.argv[4] ?? resolve(import.meta.dirname, '../historic-strict-measurements.json'))
const bytes = readFileSync(resolve(bakeoff, 'haiku-200.jsonl'), 'utf8')
const briefs = bytes.trim().split('\n').map(line => JSON.parse(line))
const wanted = new Set<string>(briefs.map(brief => brief.slug))
const sources = new Map<string, string>()
const clean: Array<{ category: string; text: string; source: string }> = []
const replacements: typeof clean = []
let pilotUnits = 0
let malformed = 0
let corrected = 0
const pilotHash = createHash('sha256')
const stream = createReadStream(pilot, { encoding: 'utf8' })
stream.on('data', chunk => pilotHash.update(chunk))
for await (const line of createInterface({ input: stream, crlfDelay: Infinity })) {
  if (!line.trim()) continue
  pilotUnits++
  const unit = JSON.parse(line)
  const source = pickText(Object.fromEntries(Object.entries(unit.texts).map(([key, field]) => [key, { value: field as { body?: string } }])))
  if (wanted.has(unit.slug)) sources.set(unit.slug, source)
  const controls = pilotControls(source)
  malformed += controls.malformed
  corrected += controls.controls.filter(c => c.corrected).length
  clean.push(...controls.controls.map(c => ({ category: c.category, text: c.text, source })))
  replacements.push(...controls.replacements.map(c => ({ category: c.category, text: c.text, source })))
}
// Fixed independent selection from round two, regardless of the guard's outcome.
if (clean.length !== 8126 || replacements.length < 8135 - clean.length) throw new Error('Pilot control population changed')
const controls = [...clean, ...replacements.slice(0, 8135 - clean.length)]
let tested = 0
let rejected = 0
let missingSource = 0
let excluded = 0
for (const brief of briefs) {
  if (brief.error || brief.empty || brief.refusal || typeof brief.summary !== 'string' || !brief.summary.trim()) { excluded++; continue }
  const source = sources.get(brief.slug)
  if (source === undefined) { missingSource++; continue }
  tested++
  rejected += Number(hasNewPersonalName(cleanupSummary(brief.summary, source), source))
}
if (missingSource) throw new Error('Offline brief is missing its full source unit')
const rate = (total: number, fired: number) => ({ tested: total, rejected: fired, rate: total ? fired / total : 0 })
const controlResults = controls.map(c => {
  const summary = `Reported concerns about ${c.text} and the need for better regional services.`
  return { category: c.category, supported: hasNewPersonalName(summary, c.source), withheld: hasNewPersonalName(summary, '') }
})
const references = [...REVIEW_REFERENCES, 'New Caledonia', 'Bureau of Meteorology', 'New Delhi', 'Rio de Janeiro', 'Kings Cross']
const invented = [
  'Thanked Arvella Street for supporting regional housing projects and better local health services.',
  'Thanked River Vaelquist for supporting regional housing projects and better local health services.',
  'Paid tribute to Vaelquist after his work supporting housing projects and better regional health services.',
  'Urged action after Vaelquist died while supporting regional housing projects and better local health services.',
  "Called for an investigation into Vaelquist's conduct during regional housing projects and local health services.",
  'Reported concerns raised by Vaelquist during regional housing projects and local health services.',
  'Reported concerns that Vaelquist would lose support for regional housing projects and local health services.',
  'Thanked Quenwick for supporting regional housing projects and better local health services.',
  'Asked Zelara de la Quenwick to support regional housing projects and better local health services.',
  'Asked ZELARA QUENWICK to support regional housing projects and better local health services.',
  'Asked Dr Zelara Justice to support regional housing projects and better local health services.',
]
const report = {
  schema: 1,
  method: 'Strict capitalised-term novelty guard on cleaned offline Haiku summaries, with each full staged unit as source support; no model or network calls.',
  limitations: 'Observed first-attempt guard failures, not terminal rejection after corrective escalation. The 200-unit bake-off sample is not a random T1 sample. Control references without source support are deliberate novelty failures, not false positives under this rule.',
  inputs: { briefFile: 'haiku-200.jsonl', sha256: createHash('sha256').update(bytes).digest('hex'), pilotFile: 'pilot-2000.jsonl', pilotSha256: pilotHash.digest('hex'), pilotUnits, matchedSources: sources.size },
  haiku: { ...rate(tested, rejected), rows: briefs.length, excluded, missingSource, aboveFifteenPercent: rejected / tested > 0.15 },
  controls: {
    ...rate(controls.length, controlResults.filter(c => c.supported).length), sourceSupport: 'full own unit',
    sourceWithheld: rate(controls.length, controlResults.filter(c => c.withheld).length),
    originalCleanOccurrences: clean.length, malformedReplaced: malformed, correctedSpans: corrected,
    byCategory: Object.fromEntries([...new Set(controlResults.map(c => c.category))].map(category => {
      const sample = controlResults.filter(c => c.category === category)
      return [category, { supported: rate(sample.length, sample.filter(c => c.supported).length), withheld: rate(sample.length, sample.filter(c => c.withheld).length) }]
    })),
  },
  reviewProbes: {
    novelInventedTerms: rate(invented.length, invented.filter(s => hasNewPersonalName(s, '')).length),
    placesAndOrganisationsWithheld: rate(references.length, references.filter(s => hasNewPersonalName(`Reported concerns about ${s} and regional services.`, '')).length),
    placesAndOrganisationsSupported: rate(references.length, references.filter(s => hasNewPersonalName(`Reported concerns about ${s} and regional services.`, `Discussed ${s}.`)).length),
  },
}
writeFileSync(output, JSON.stringify(report, null, 2) + '\n')
console.log(JSON.stringify(report))
