// Offline evaluation of real bake-off briefs. Emit only aggregate counts and hashes;
// never emit or persist briefs, candidate terms, speaker metadata or prompt text.
import { createHash } from 'node:crypto'
import { createReadStream, readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { createInterface } from 'node:readline'
import { clip, pickText } from '../src/text.ts'
import { NON_PERSON_TERMS, capitalisedTerms, cleanupSummary, hasNewPersonalName, nameKey, unsupportedHistoricTerms, validateSummary } from '../src/validate.ts'
import roster from '../src/historic-names.json' with { type: 'json' }
import { CATEGORIES, termCategory } from './guard_categories.ts'
import { pilotControls, REVIEW_REFERENCES } from './audit_controls.ts'

const bakeoff = resolve(process.argv[2] ?? '/home/jake/opax-staging/federation/bakeoff')
const pilot = resolve(process.argv[3] ?? '/home/jake/opax-staging/federation/kb-gap/pilot-2000.jsonl')
const output = resolve(process.argv[4] ?? resolve(import.meta.dirname, '../historic-strict-measurements.json'))
// Pin the initial batch: the mutable haiku-200 file now includes lane retries.
const briefFile = 'haiku-initial-200.jsonl'
const bytes = readFileSync(resolve(bakeoff, briefFile), 'utf8')
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
let originalRejected = 0
let originalOccurrences = 0
const originalUnique = new Set<string>()
const rosterKeys = new Set(roster.names.split('\n').map(nameKey))
const originalAllowed = new Set(NON_PERSON_TERMS.map(nameKey))
const categories = Object.fromEntries(CATEGORIES.map(category => [category, { occurrences: 0, unique: 0, briefs: 0 }]))
const categoryUnique = new Map(CATEGORIES.map(category => [category, new Set<string>()]))
let retryPossible = 0
let retryAccepted = 0
let retryNotMeaningful = 0
for (const brief of briefs) {
  if (brief.error || brief.empty || brief.refusal || typeof brief.summary !== 'string' || !brief.summary.trim()) { excluded++; continue }
  const source = sources.get(brief.slug)
  if (source === undefined) { missingSource++; continue }
  tested++
  const summary = cleanupSummary(brief.summary, source)
  const originalTerms = capitalisedTerms(summary, true).filter(term => {
    const key = nameKey(term)
    return !(` ${nameKey(source)} `).includes(` ${key} `) && !rosterKeys.has(key) && !originalAllowed.has(key)
  })
  originalRejected += Number(originalTerms.length > 0)
  originalOccurrences += originalTerms.length
  const affectedCategories = new Set<string>()
  for (const term of originalTerms) {
    const category = termCategory(term, summary)
    categories[category].occurrences++
    categoryUnique.get(category)!.add(nameKey(term))
    originalUnique.add(nameKey(term))
    affectedCategories.add(category)
  }
  for (const category of affectedCategories) categories[category].briefs++
  const offenders = unsupportedHistoricTerms(summary, source)
  if (!offenders.length) continue
  rejected++
  // A deletion is meaningful only when an independent, valid sentence remains;
  // do not pretend an empty or pronoun-dependent fragment is a corrective brief.
  const sentences = summary.match(/[^.!?]+(?:[.!?]+(?=\s|$)|$)/g) ?? []
  const kept = sentences.filter(sentence => unsupportedHistoricTerms(sentence, source).length === 0).map(sentence => sentence.trim())
  const replacement = kept.join(' ')
  const dependent = /^(?:he|she|they|it|this|that|these|those|however|also|but|and|therefore|instead)\b/i.test(replacement)
  if (!replacement || dependent || validateSummary(replacement, { text: clip(source), nameText: source, historic: true }).length) {
    retryNotMeaningful++
  } else {
    retryPossible++
    retryAccepted += Number(!hasNewPersonalName(replacement, source))
  }
}
if (missingSource) throw new Error('Offline brief is missing its full source unit')
if (tested !== 200 || originalRejected !== 69 || originalOccurrences !== 92
  || createHash('sha256').update(bytes).digest('hex') !== 'bbe95d82b5a1c1998967ab45681c16bf39f01aebe3d90a9b066ee061bd2e4f86') {
  throw new Error('Initial comparison sample changed')
}
for (const category of CATEGORIES) categories[category].unique = categoryUnique.get(category)!.size
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
  method: 'Whole-term novelty guard on cleaned initial offline Haiku summaries, with each full staged unit as source support; no model or OPAX network calls. Deterministic category triage of every unsupported round-three term.',
  limitations: 'The 200-unit sample is not random T1. Likely-personal includes conservatively unmatched proper terms; no terms are emitted. Sentence-deletion retries are measured only when an independent valid brief remains. Missing simulations cannot establish an overall terminal rate. Withheld-source controls deliberately test novel additions.',
  inputs: { briefFile, sha256: createHash('sha256').update(bytes).digest('hex'), pilotFile: 'pilot-2000.jsonl', pilotSha256: pilotHash.digest('hex'), pilotUnits, matchedSources: sources.size },
  originalGuard: { ...rate(tested, originalRejected), termOccurrences: originalOccurrences, uniqueTerms: originalUnique.size, categories },
  haiku: { ...rate(tested, rejected), rows: briefs.length, excluded, missingSource, aboveFifteenPercent: rejected / tested > 0.15 },
  simulatedRetry: { eligible: retryPossible, accepted: retryAccepted, rejected: retryPossible - retryAccepted, notMeaningful: retryNotMeaningful, conditionalRate: retryPossible ? (retryPossible - retryAccepted) / retryPossible : null, overallTerminalRate: retryNotMeaningful ? null : (retryPossible - retryAccepted) / tested },
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
