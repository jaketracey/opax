/** Where an Ask answer says a cited speaker spoke ("In the House", "told the Senate", "in the Legislative Council"),
 * it names the chamber recorded on the passage that sentence cites. A wrong chamber is rewritten to the recorded one;
 * a passage with no recorded chamber loses the phrase. This only corrects wording: it never drops a sentence or an
 * answer. Words inside quotation marks are source text and stay as written. */
import {canonicalChamber} from './ask-chamber'
import {quotationSpans,sentenceParts} from './research-claim-audit.mjs'
import {rewriteAnswerPayload} from './research-language'

/** A cited passage's recorded chamber (null when it records none) and speaker. Undefined for a citation that is not a
 * passage, such as a record fact or a coverage note: those sentences are left alone. */
export type CitedChamber = {chamber: string | null; speaker?: string}
export type ChamberOf = (citationId: string) => CitedChamber | undefined

interface Recorded { label: string; state?: string; house: 'upper' | 'lower' | 'committee'; kind: string }
const STATE_LABEL: Record<string, string> = {nsw:'NSW',vic:'Victorian',qld:'Queensland',sa:'SA',wa:'WA',tas:'Tasmanian',act:'ACT',nt:'NT'}
const STATE_CHAMBER: Record<string, string> = {la:'Legislative Assembly',lc:'Legislative Council',ha:'House of Assembly'}
const COMMITTEE: Record<string, string> = {senate:'Senate committee',joint:'joint committee',house:'House committee'}

/** The chamber a corpus key names; undefined for a key this pass does not know, which it leaves alone. */
export function recordedChamber(key: string): Recorded | undefined {
  const k = canonicalChamber(key.trim().toLowerCase())
  if (k === 'senate') return {label:'Senate',state:'federal',house:'upper',kind:'senate'}
  if (k === 'federation') return {label:'Federation Chamber',state:'federal',house:'lower',kind:'federation'}
  if (k === 'representatives') return {label:'House of Representatives',state:'federal',house:'lower',kind:'representatives'}
  const committee = /^(senate|joint|house)_committee$/.exec(k)
  if (committee) return {label:COMMITTEE[committee[1]],state:'federal',house:'committee',kind:'committee'}
  const state = /^(nsw|vic|qld|sa|wa|tas|act|nt)_(la|lc|ha)$/.exec(k)
  if (state) return {label:`${STATE_LABEL[state[1]]} ${STATE_CHAMBER[state[2]]}`,state:state[1],house:state[2]==='lc'?'upper':'lower',kind:state[2]}
  if (k === 'legislative_council') return {label:'Legislative Council',house:'upper',kind:'lc'}
  if (k === 'legislative_assembly') return {label:'Legislative Assembly',house:'lower',kind:'la'}
}

const QUALIFIERS: [RegExp, string][] = [[/^(?:federal|Commonwealth|Australian)$/,'federal'],[/^(?:NSW|New South Wales)$/,'nsw'],[/^Victorian$/,'vic'],[/^Queensland$/,'qld'],[/^(?:SA|South Australian)$/,'sa'],[/^(?:WA|Western Australian)$/,'wa'],[/^Tasmanian$/,'tas'],[/^ACT$/,'act'],[/^(?:NT|Northern Territory)$/,'nt']]
const QUALIFIER = String.raw`(?:(?:federal|Commonwealth|Australian|NSW|New South Wales|Victorian|Queensland|South Australian|SA|Western Australian|WA|Tasmanian|ACT|NT|Northern Territory)\s+)?`
const NAME = String.raw`House of Representatives|House of Assembly|Legislative Council|Legislative Assembly|Senate|House(?!\s+of\b)|[Uu]pper [Hh]ouse|[Ll]ower [Hh]ouse`
// "the Senate Economics Legislation Committee", "Senate estimates", "the Senate's vote" and "the Senate inquiry" are
// not the chamber floor.
const NOT_FLOOR = String.raw`(?![\p{L}\p{N}'’-])(?!(?:\s+[\p{Lu}][\p{L}-]*)*\s+(?:[Cc]ommittees?|[Ee]stimates|[Ii]nquir(?:y|ies)|[Hh]earings?|[Cc]hamber)\b)`
const PHRASE = new RegExp(String.raw`\b(?<lead>[Ss]peaking in|[Ii]n|told)\s+the\s+(?<qual>${QUALIFIER})(?<name>${NAME})${NOT_FLOOR}`, 'gu')
// A chamber named for a bill, a vote, numbers or an office ("introduced in the House", "Leader of the Government in
// the Senate") is not where the cited words were spoken.
const NOT_SPEECH_BEFORE = /\b(?:introduced|reintroduced|passed|passes|passing|passage|tabled|tabling|presented|read|debated|moved|amended|considered|referred|returned|sent|defeated|voted|vote|votes|voting|carried|rejected|lodged|sits|sat|sitting|seats?|elected|majority|minority|numbers|crossbench|leaders?|leads|manager|whip|president|deputy|clerk|government|opposition|business|party|parties|bills?|motions?|amendments?|divisions?|legislation|laws?|Act|members?|role|position|served|serves|serving|term)(?:\s+[\p{L}\p{N}’'-]+){0,3}\s*$/iu
const SPEECH = /\b(?:said|says|say|told|tells|argued|argues|stated|states|explained|explains|noted|notes|warned|warns|described|describes|called|calls|asked|asks|urged|urges|claimed|claims|declared|declares|acknowledged|acknowledges|emphasi[sz]ed|insisted|highlighted|remarked|contended|observed|stressed|added|reminded|spoke|speaks|speaking|raised|defended|criticised|criticized|questioned|welcomed|conceded|maintained|suggested|pointed out|labelled|characterised|outlined|set out|announced|recalled|accused)\b/i

const STATE_OF = (qual: string) => QUALIFIERS.find(([pattern]) => pattern.test(qual.trim()))?.[1]
/** Whether the phrase already names the recorded chamber. "The House" is any lower house; "upper house" any upper. */
function agrees(name: string, qual: string, recorded: Recorded): boolean {
  if (recorded.house === 'committee') return false
  const state = qual.trim() ? STATE_OF(qual) : undefined
  if (state && recorded.state && state !== recorded.state) return false
  if (name === 'Senate') return recorded.kind === 'senate'
  if (name === 'House of Representatives') return recorded.kind === 'representatives'
  if (/^lower house$/i.test(name) || name === 'House') return recorded.house === 'lower'
  if (/^upper house$/i.test(name)) return recorded.house === 'upper'
  if (name === 'Legislative Council') return recorded.kind === 'lc'
  if (name === 'Legislative Assembly') return recorded.kind === 'la'
  if (name === 'House of Assembly') return recorded.kind === 'ha'
  return true
}
const surname = (speaker?: string) => speaker?.trim().split(/\s+/).at(-1)?.replace(/[^\p{L}'’-]/gu, '') ?? ''
const escape = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
/** The sentence is about the cited speaker: it names them, or a pronoun says or tells. */
const attributes = (sentence: string, speakers: (string | undefined)[]) =>
  speakers.some(s => { const name = surname(s); return name.length > 1 && new RegExp(`(?<![\\p{L}])${escape(name)}(?![\\p{L}])`, 'u').test(sentence) }) ||
  /\b(?:[Hh]e|[Ss]he|[Tt]hey)\s+(?:also\s+|later\s+|then\s+)?(?:told|said)\b/.test(sentence)

interface Edit { at: number; length: number; replacement: string }
type Payload = {answer?: unknown; citations?: unknown; sources?: unknown}

/** The cited passages a phrase belongs to: those whose citation covers the phrase (else the sentence), keeping the
 * narrowest, so a phrase inside one passage's clause sits with that passage. */
function citedPassages(citations: Record<string, unknown>, from: number, until: number, sentence: [number, number], chamberOf: ChamberOf): CitedChamber[] {
  const covering = (a: number, b: number) => Object.entries(citations).flatMap(([id, ranges]) => {
    if (!Array.isArray(ranges)) return []
    const spans = ranges.filter((r): r is [number, number] => Array.isArray(r) && r.length === 2 && r.every(Number.isSafeInteger) && r[0] < b && r[1] > a).map(r => r[1] - r[0])
    const passage = spans.length ? chamberOf(id) : undefined
    return passage ? [{passage, span: Math.min(...spans)}] : []
  })
  const own = covering(from, until), found = own.length ? own : covering(sentence[0], sentence[1])
  const narrowest = Math.min(...found.map(f => f.span))
  return found.filter(f => f.span === narrowest).map(f => f.passage)
}

/** Rewrite each speaker-chamber phrase to the chamber its cited passage records; remove it where none is recorded. */
export function withRecordedChambers<T extends Payload>(payload: T, chamberOf: ChamberOf = sourceChambers(payload)): T {
  if (typeof payload.answer !== 'string' || !payload.citations || typeof payload.citations !== 'object') return payload
  const text = payload.answer, citations = payload.citations as Record<string, unknown>, quotes = quotationSpans(text)
  const cp = (n: number) => Array.from(text.slice(0, n)).length
  const edits: Edit[] = []
  for (const part of sentenceParts(text)) {
    for (const m of part.text.matchAll(PHRASE)) {
      const {lead, qual, name} = m.groups as {lead: string; qual: string; name: string}
      const at = part.at + m.index!, end = at + m[0].length
      if (quotes.some(q => at < q.end && end > q.at)) continue
      const before = part.text.slice(0, m.index!)
      if (lead !== 'told' && (NOT_SPEECH_BEFORE.test(before) || !SPEECH.test(part.text))) continue
      const cited = citedPassages(citations, cp(at), cp(end), [cp(part.at), cp(part.at + part.text.length)], chamberOf)
      if (!cited.length || new Set(cited.map(c => c.chamber)).size !== 1 || !attributes(part.text, cited.map(c => c.speaker))) continue
      const key = cited[0].chamber
      if (key === null) { edits.push(removal(text, part, at, end, lead)); continue }
      const recorded = recordedChamber(key)
      if (!recorded || agrees(name, qual, recorded)) continue
      edits.push({at, length: end - at, replacement: rewrite(lead, recorded)})
    }
  }
  if (!edits.length) return payload
  // Right to left, so each edit's offset still holds; an edit overlapping the one after it is skipped.
  const ordered: Edit[] = []
  for (const edit of edits.sort((a, b) => b.at - a.at)) if (!ordered.length || edit.at + edit.length <= ordered[ordered.length - 1].at) ordered.push(edit)
  return rewriteAnswerPayload(payload, replace => {
    for (const edit of ordered) replace(new RegExp(`(?<=^[\\s\\S]{${edit.at}})[\\s\\S]{${edit.length}}`, 'g'), edit.replacement)
  })
}
function rewrite(lead: string, recorded: Recorded): string {
  if (recorded.house !== 'committee') return `${lead} the ${recorded.label}`
  if (lead === 'told') return `told a ${recorded.label}`
  const at = /^[Ss]peaking/.test(lead) ? lead.replace(/in$/, 'at') : lead[0] === 'I' ? 'At' : 'at'
  return `${at} a ${recorded.label} hearing`
}
/** "told the House that" becomes "said that"; "In the House on 5 May, X said" becomes "On 5 May, X said";
 * "X, speaking in the House, said" becomes "X said"; "X said in the House that" becomes "X said that". */
function removal(text: string, part: {at: number; text: string}, at: number, end: number, lead: string): Edit {
  if (lead === 'told') return {at, length: end - at, replacement: 'said'}
  if (at === part.at) {
    const rest = /^,?\s*(\S)?/u.exec(text.slice(end))!
    return {at, length: end - at + rest[0].length, replacement: (rest[1] ?? '').toUpperCase()}
  }
  const opening = /,\s*$/.exec(text.slice(part.at, at))
  if (opening && text[end] === ',') return {at: at - opening[0].length, length: end + 1 - at + opening[0].length, replacement: ''}
  // "was speaking in the House when" keeps "speaking"; elsewhere the phrase and the space before it go.
  const from = /^[Ss]peaking/.test(lead) ? at + 'speaking'.length : at - (/\s+$/.exec(text.slice(part.at, at))?.[0].length ?? 0)
  return {at: from, length: end - from, replacement: ''}
}

/** The default reader: a source that carries a recorded chamber. Sources without one are left alone, since only the
 * research loop knows which of its citations are passages. */
export function sourceChambers(payload: Payload): ChamberOf {
  const sources = (Array.isArray(payload.sources) ? payload.sources : []) as {resource?: unknown; chamber?: unknown; speaker?: unknown}[]
  return id => {
    const source = sources.find(s => typeof s?.resource === 'string' && (id === s.resource || id.startsWith(s.resource + '/')))
    return source && typeof source.chamber === 'string' && source.chamber.trim() ? {chamber: source.chamber, ...(typeof source.speaker === 'string' ? {speaker: source.speaker} : {})} : undefined
  }
}
