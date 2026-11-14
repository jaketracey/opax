import {ASK_ATTRIBUTION_RULE,ASK_EVIDENCE_RULES} from './ask-writing-rules'
import {RECEIPTS_WRITING_RULE,industryModifier} from './receipt-copy'
/** Tools supply evidence; only checked, newly written prose reaches an Ask reader. */
import type { Fact, Period } from './agentic-ask'
import { atomsFromText, claimIdentity, claimClauses, normalClaim, numberValue, metricAt, proseClaimKeys, censusField, sentenceFragment, type ClaimAtom } from './research-claims'
import { withoutSaPlaceholder } from '../public/sa-hansard.js'
import { partyReturns } from '../public/donor-disclosure.js'
import type { QualitativeAnswer, ReceiptFact } from './research-types'
import { plainAnswerPayload, rewriteAnswerPayload } from './research-language'
import { repairDonorRanking,selectedDonorFacts,answerDecision,donorRankingAsked } from './research-coherence.mjs'
import {auditPayload,sentenceParts} from './research-claim-audit.mjs'
import {rankingCoverageMatches,rankingScopeGaps,partyNamed,sourceMetadata,resolvedRankingScope,jurisdictionNames} from './research-ranking-scope.mjs'
import {questionIndustry} from './research-ranking-repair.mjs'
import {donationCoverageLimit} from './research-coverage'
import {UNCONFIRMED_PERIOD} from './ask-constraints'
import {recordAnswerLines,recordEvidenceText,divisionVoteSource} from './research-record-answer'
import {decodeHTMLStrict} from 'entities'
import {moneyWritingInput,moneyWritingLines,moneyEvidenceRows} from './research-money-writing'
import {inferPeriod} from './ask-period'
import { transcriptTurns, shortTranscriptQuote, TRANSCRIPT_LABEL, TRANSCRIPT_NOTE, type TranscriptTurn } from './transcript-answer'
import {dedupeAnswer,sameStatement,statementSource} from './research-dedupe'
import {isRecordCountQuestion} from './ask-scope-intent'
import {researchSentences} from './research-sentences'

export const ANSWER_WRITING_VERSION = 'written-answer-28-dedupe'
export interface WritingFact { evidenceId?: string; id: number; text: string; source: QualitativeAnswer['sources'][number]; coverage?: boolean; metadata?: boolean; atoms?: ClaimAtom[]; transcript?: TranscriptTurn }
export interface WritingInput { question: string; period: Period; facts: WritingFact[]; constraints?: QualitativeAnswer['answer_scope'] }
export interface WrittenSentence { text: string; facts: number[]; coverage?: boolean }
const clean = (s: string) => s.replace(/\*\*/g, '').replace(/\s+/g, ' ').trim()
const key = (s: string) => clean(s).toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim()
const signedKey = (s: string) => clean(s).toLowerCase().replace(/[^\p{L}\p{N}−+-]+/gu, ' ').trim()
/** Remove repeated sentences at composition and public boundaries, preserving
 * original code-point citation ranges through every deletion. */
export function distinctSummary<T extends Record<string, unknown>>(payload:T):T {
  return rewriteAnswerPayload(dedupeAnswer(payload),replace=>{
    // Some register exports list a company once by name and again with its
    // business details. Keep the fuller item without repeating the name.
    replace(/:\s*[^:\n]+;[^\n]+/g,list=>{
      const prefix=/^:\s*/.exec(list)![0],items=list.slice(prefix.length).replace(/\.$/,'').split(/;\s*|\s+and\s+(?=[A-Z])/)
      const kept=items.filter((item,i)=>!items.some((other,j)=>i!==j&&key(other).startsWith(key(item)+' ')&&other.startsWith(item+',')))
      return kept.length===items.length?list:prefix+kept.join('; ')+'.'
    })
    replace(/(^|\n)[ \t]*What the records do show:[ \t]*(?:\n\s*)?$/gi,'')
    replace(/\n{3,}/g,'\n\n')
    replace(/^\s+|\s+$/g,'')
  })
}
export const isCoverage = (s: string) => /^.*requested period.*(?:not fully covered|unknown)|^The requested period|^Coverage:|^Salary entitlements|^Federal parliament only|^\*?\*?Salaries as at|^These records|^Party and chamber labels|^Committee chair loadings|^Opax added|^This selection covers|^It excludes|^Amounts are|^Based on AEC/i.test(s)
export const tokens = (s: string) => (s.match(/\d[\d,]*(?:\.\d+)?%?|\b(?:zero|one|two|three|four|five|six|seven|eight|nine|ten|hundred|thousand|million|billion|twice|half)\b/gi) ?? []).map(n => n.toLowerCase().replace(/,/g, '').replace(/\.0+(?=%?$)/, ''))
const dateWords = (s: string) => s.replace(/\b\d{4}-\d{2}-\d{2}\b/g, iso => `${iso} ${new Date(iso+'T00:00:00Z').toLocaleDateString('en-AU', {day:'numeric',month:'long',year:'numeric',timeZone:'UTC'})}`)
export const rawToolEcho = (s: string) => /\btranscript page \S+ \(PDF page \d+\)|©|licensed under CC BY|(?:^|\n)\s*(?:[-*]\s*)?(?:Coverage|Disclosed receipt|Donor|Grant|Register|Supplier):|\bCampaign advertising expenditure \(source reporting period retained; no category sum\)|\bAggregated connection, not an individual gift\b|\ba year as [^\n]+, \d{4}-\d{2}-\d{2} to \d{4}-\d{2}-\d{2}; base|\|\s*(?:Rank|Parliamentarian|Party|Recipient)\s*\||\b(?:base \$[\d,]+ plus \d+(?:\.\d+)?%)/i.test(s)

/** Split calculator blocks into data atoms. Overlapping calculator/record calls share atoms. */
export function writingFacts(answer: QualitativeAnswer | undefined, facts: Fact[] = [], notes: string[] = []): WritingFact[] {
  const out: WritingFact[] = [], seen = new Set<string>()
  const add = (text: string, source: WritingFact['source'], coverage = false, transcript?: TranscriptTurn) => {
    const turns = transcript ? [] : transcriptTurns(text)
    if (turns.length) {
      for (const [i, turn] of turns.entries()) {
        const resource = `${source.resource.replace(/\/turn\/\d+$/, '')}/turn/${i + 1}`
        const line = `${turn.speaker} said at ${text.split(',')[0]}${turn.day ? ` on hearing day ${turn.day}` : ''}${turn.date ? ` (${turn.date})` : ''}, transcript page ${turn.page}: "${turn.excerpt}". ${TRANSCRIPT_LABEL}.`
        const before = out.length
        add(line, { ...source, resource, speaker: turn.speaker, snippet: source.snippet + '\n' + line }, coverage, turn)
        if (out.length > before) out[out.length - 1].transcript = turn
      }
      return
    }
    const record=source.kind==='record'&&/\/(?:bill\/|doc\/division-)/.test(source.url)
    text = clean(record?decodeHTMLStrict(text):text).replace(/^[-*•]\s*/, '')
    if(record)source={...source,snippet:recordEvidenceText(source.snippet,source.url)}
    if (!/[\p{L}]/u.test(text) || /^\|?\s*[-: ]+(?:\|[-: ]+)*\|?$/.test(text)) return
    const k = statementSource(source)+'|'+signedKey(text)
    if (seen.has(k)) {if(coverage){const prior=out.find(f=>statementSource(f.source)+'|'+signedKey(f.text)===k);if(prior)prior.coverage=true}return}
    const metadata=/^(?:Period|Financial years):/i.test(text)
    const evidenceId=source.resource+'/t/body/0'
    let atoms=atomsFromText(text,evidenceId,source)
    if (source.member && /^.+?: [\d,]+ (?:chamber speeches|speeches and committee turns|committee-hearing turns)\b/.test(text)) {
      const projected = text.replace(/^.+?: /, source.member.name + ': ')
      source = {...source, snippet:[...new Set([source.snippet,projected])].join('\n'), entities:[...new Set([...(source.entities??[]),'person:'+source.member.name])]}
      atoms = atomsFromText(projected,evidenceId,source)
    }
    // A labelled copy keeps a tool's explicit owner/amount association readable by the final claim audit.
    const partyTotal=/^(.+?) received (\$[\d,.]+ in federal disclosed receipts[\s\S]*)$/.exec(text)
    if(partyTotal)source={...source,snippet:source.snippet+'\n'+partyTotal[1]+': '+partyTotal[2]}
    const moneyRows=moneyEvidenceRows(text,source.url)
    if(moneyRows.length){source={...source,snippet:[...new Set([source.snippet,...moneyRows])].join('\n')};atoms=moneyRows.flatMap(row=>atomsFromText(row,evidenceId,source))}
    // The tool's own owner/amount/period association, never read back out of its wording.
    // An example annual-return reference is not the period or unit of its aggregate.
    const receipt=source.receipt
    if(receipt){
      const amount=dollars(receipt.amount)
      atoms=[receipt.source,receipt.party].map(entity=>({entity,metric:'receipts',value:String(receipt.amount),unit:'AUD',chamber:'federal',period:{label:receipt.period},evidenceId}))
      source={...source,snippet:source.snippet+`\nDonor: ${receipt.source} — ${amount}. Financial years: ${receipt.period}.`}
    }
    const connection=/^Disclosed receipt:\s*(.+?)\s*→\s*(.+?)\s*—\s*(\$[\d,.]+) in disclosed political receipts/.exec(text)
    const donorTotal=/^Donor:\s*(.+?)\s*—[\s\S]*?(\$[\d,.]+) in disclosed political receipts/.exec(text)
    if(source.kind==='record'&&(connection||donorTotal)){
      const row=connection?`${connection[2]}: ${connection[3]} in disclosed political receipts from ${connection[1]}.`:`${donorTotal![1]}: ${donorTotal![2]} in disclosed political receipts.`
      source={...source,snippet:source.snippet+'\n'+row};atoms=atomsFromText(row,evidenceId,source)
    }
    seen.add(k); out.push({ id: out.length+1, text, source, evidenceId, atoms, ...(transcript ? { transcript } : {}), ...(metadata?{metadata:true}:coverage ? { coverage: true } : {}) })
  }
  if (answer) for (const source of answer.sources.filter(s => s.cited)) {
    // The selected claim, not unrelated parts of a larger original record, is the authority here.
    const ranges = Object.entries(answer.citations).filter(([id]) => id === source.resource || id.startsWith(source.resource+'/')).flatMap(([,ranges]) => ranges)
    const text = ranges.length && ranges.every(([a,b])=>b-a>3) ? ranges.map(([a,b]) => Array.from(answer.answer).slice(a,b).join('')).join('\n') : source.snippet
    for (const part of text.split(/\n+|(?<=[.!?])\s+(?=(?:Coverage:|This selection|It excludes|Amounts are|Period:|Based on AEC|Opax added))/)) {
      const before=out.length;add(part, source, !!source.coverage || isCoverage(part) || source.resource==='coverage' || /^(?:Coverage of|Basis and coverage)/i.test(source.title))
      if(out.length>before){const f=out[out.length-1];if(!f.transcript)f.evidenceId=Object.keys(answer.citations).find(id=>id===source.resource || id.startsWith(source.resource+'/'))??f.evidenceId;f.atoms=f.atoms?.map(a=>({...a,evidenceId:f.evidenceId!}))??atomsFromText(f.text,f.evidenceId!,source)}
    }
  }
  for (const fact of facts) {
    const source = {resource:`fact-${fact.id}`, slug:'', title:fact.cite.label, href:fact.cite.url, url:fact.cite.url, snippet:fact.text, cited:true, kind:fact.cite.kind, ...(fact.cite.remuneration?{remuneration:fact.cite.remuneration}:{}), ...(fact.receipt?{receipt:fact.receipt}:{}), ...(fact.entities?.length?{entities:fact.entities}:{}), ...(fact.member?{member:fact.member}:{})}
    for (const part of fact.text.split(/\n+/)) add(part, source, isCoverage(part))
  }
  const source = out[0]?.source
  if (source) for (const note of notes) add(note, {...source,resource:'coverage-'+stableEvidenceKey(note),title:'Coverage of the selected records',snippet:note}, true)
  return dedupeWritingFacts(out).slice(0, 80)
}
/** Tool retries and selected points can describe the same record twice. Keep one writer fact per statement. */
export function dedupeWritingFacts(facts:WritingFact[]):WritingFact[] {
  const out:WritingFact[]=[]
  // Structured record labels can wrap the claim in a report title and page reference.
  const core=(f:WritingFact)=>f.text===f.source.title&&/own words:|:\s*"/.test(f.text)?/"([^"]+)"/.exec(f.text)?.[1]??f.text:f.text
  const contains=(a:string,b:string)=>signedKey(b).length>=20&&(' '+signedKey(a)+' ').includes(' '+signedKey(b)+' ')&&tokens(b).every(n=>tokens(a).includes(n))
  for(const fact of facts){
    const prior=out.find(f=>statementSource(f.source)===statementSource(fact.source)&&!!f.coverage===!!fact.coverage&&(sameStatement(f.text,fact.text)||contains(core(f),core(fact))||contains(core(fact),core(f))))
    if(prior){
      // The fuller statement keeps every additional figure and claim from this same record.
      if(contains(core(fact),core(prior))&&!sameStatement(fact.text,prior.text)){
        prior.text=fact.text
        prior.atoms=fact.atoms?.map(a=>({...a,evidenceId:prior.evidenceId??a.evidenceId}))
      }
      prior.source={...prior.source,snippet:[...new Set([prior.source.snippet,fact.source.snippet,fact.text])].join('\n')}
      continue
    }
    out.push({...fact,source:{...fact.source}})
  }
  return out
}
const dollars=(amount:number)=>'$'+amount.toLocaleString('en-AU')
function stableEvidenceKey(text:string):string {let n=2166136261;for(const c of text)n=Math.imul(n^c.charCodeAt(0),16777619);return (n>>>0).toString(16)}
function assemble(lines: WrittenSentence[], input: WritingInput, preserveCoverage=false): QualitativeAnswer {
  let answer = ''; const citations: QualitativeAnswer['citations'] = {}, sources = new Map<string, WritingFact['source']>()
  const hasAnswer=!preserveCoverage&&lines.some(line=>!line.coverage&&line.text.trim()&&!/^What the records do show:$/i.test(line.text))
  const notes:string[]=[]
  for (const line of lines) {
    if(hasAnswer&&line.coverage){
      if(coverageApplies(line.text,input)&&!notes.some(note=>key(note)===key(line.text))){
        notes.push(line.text)
        for(const id of line.facts){const fact=input.facts.find(f=>f.id===id);if(fact&&!sources.has(fact.source.resource))sources.set(fact.source.resource,{...fact.source,coverage:true,cited:false})}
      }
      continue
    }
    if (answer) answer += '\n\n'
    const start = Array.from(answer).length; answer += line.text
    const citedClaims=new Set<string>()
    for (const id of new Set(line.facts)) {
      const fact = input.facts.find(f => f.id === id)
      if (!fact) continue
      const source = fact.source
      // A selected period fact is associated only with the other facts cited by this sentence.
      // Preserve that verified association for the independent final audit; never infer it globally.
      const metadata=line.facts.map(id=>input.facts.find(f=>f.id===id)).filter((f):f is WritingFact=>!!f&&/^(?:Period|Financial years):/i.test(f.text))
      const atomPeriod=metadata.length===1?metadata[0]:undefined
      const atoms=(fact.atoms??atomsFromText(fact.text,fact.evidenceId??source.resource+'/t/body/0',source)).map(atom=>
        atomPeriod&&!atom.period.since&&!atom.period.until&&!atom.period.label?{...atom,period:{label:atomPeriod.text.replace(/^(?:Period|Financial years):\s*/i,'').replace(/\.$/,'')},periodEvidenceId:atomPeriod.evidenceId??atomPeriod.source.resource+'/t/body/0'}:atom)
      // Equal figures for different counterparties or awards are separate claims.
      const identity=(source.receipt?JSON.stringify(source.receipt):key(fact.text))+'|'+(fact.evidenceId??source.resource)
      if(identity&&citedClaims.has(identity))continue
      if(identity)citedClaims.add(identity)
      const previous=sources.get(source.resource)
      sources.set(source.resource, previous ? {...previous,cited:true,coverage:source.coverage,snippet:[...new Set([previous.snippet,fact.text])].join('\n'),claim_atoms:[...(previous.claim_atoms??[]),...atoms]} : {...source,snippet:[...new Set([source.snippet,fact.text])].join('\n'),claim_atoms:atoms})
      const evidenceId = fact.evidenceId ?? (source.resource.includes('/t/') ? source.resource : source.resource+'/t/body/0')
      const ranges=citations[evidenceId]??=[]
      if(!ranges.some(([a,b])=>a===start&&b===Array.from(answer).length))ranges.push([start,Array.from(answer).length])
      if (source.member) {
        const resource = 'member-' + source.resource, url = new URL('/parliamentarians.json', source.url).href
        const snippet = `${source.member.name} (${source.member.parliaments.join('; ')}). Indexed speaker: ${fact.text.split(':')[0]}.`
        sources.set(resource, {resource, slug:'', title:'OPAX member record: '+source.member.name, href:url, url, snippet, cited:true, kind:'record'})
        const key = resource + '/t/body/0', memberRanges = citations[key] ??= []
        if (!memberRanges.some(([a,b])=>a===start&&b===Array.from(answer).length)) memberRanges.push([start,Array.from(answer).length])
      }
    }
  }
  return distinctSummary(plainAnswerPayload({ answer, answer_decision:lines.length&&lines.every(l=>l.coverage)?'limitation' as const:'answer' as const, ...(notes.length?{coverage:{note:notes.join(' ')}}:{}), ...(input.constraints?{answer_scope:input.constraints}:{}), citations, sources:[...sources.values()] }))
}
const finish = (s: string) => /[.!?]["”’')\]]*$/.test(s) ? s : s+'.'
export const payRate = (s: string) => /^(.+?): (\$\d(?:[\d,]*\d)?(?:\.\d+)?) a year as (.+?), (\d{4}-\d{2}-\d{2}) to (\d{4}-\d{2}-\d{2});/.exec(s)
const day = (s: string) => new Date(s+'T00:00:00Z').toLocaleDateString('en-AU',{day:'numeric',month:'long',year:'numeric',timeZone:'UTC'})
function coverageApplies(text:string,input:WritingInput):boolean {
  if(/complete historical total/i.test(text))return totalsAsked(input)
  if (/^Title selection:|^Industry totals cover classified sources/i.test(text)) return true
  const tally=input.facts.some(f=>!f.coverage&&/\bin ([\d,]+) divisions\b/i.test(f.text)&&Number(/\bin ([\d,]+) divisions\b/i.exec(f.text)![1].replaceAll(',',''))>1)
  const divisionCount=tally||/\b(?:how many|count|number|total|most|all|every)\b/i.test(input.question)&&/\b(?:votes?|divisions?)\b/i.test(input.question)
  const speechCount=input.facts.some(f=>!f.coverage&&f.source.kind==='count')
  if(/Exact count of the full published/i.test(text))return /\b(?:how many|number of|count|more|fewer|rate|trend)\b/i.test(input.question)
  if(/divisions are matched by (?:a word|words)/i.test(text))return divisionCount
  if(/recorded vote (?:is not a statement of reasons|does not establish why)/i.test(text))return /\b(?:why|reasons?)\b/i.test(input.question)
  if(/ranked (?:sample|matching)|topic|Hansard|committee|labelled speeches/i.test(text))return speechCount
  return true
}
const totalsAsked=(input:WritingInput)=>isRecordCountQuestion(input.question)||!!input.constraints?.recordCountKind||!!input.constraints?.speechRankingGrain||!!input.constraints?.industryRanking||!!input.constraints?.grantRecipient||/\b(?:how many|how much|number of|count|total|totals)\b/i.test(input.question)||
  /\b(?:most|top|biggest|largest|so much)\b/i.test(input.question)&&(/\b(?:money|donations?|donors?|receipts?|funding|gifts?|payments?|dollars?)\b/i.test(input.question)||input.facts.some(f=>f.source.receipt))
function coverageSentence(input: WritingInput): WrittenSentence | undefined {
  const all = input.facts.filter(f => f.coverage && !/^(?:Period|Financial years):/i.test(f.text)&&coverageApplies(f.text,input))
  const basis=basisSentence(all,totalsAsked(input)),unconfirmed=all.filter(f=>f.text.includes(UNCONFIRMED_PERIOD))
  // The period caveat sits beside the record's own caveat, never instead of it.
  if(unconfirmed.length)return {text:[UNCONFIRMED_PERIOD,basis?.text].filter(Boolean).join(' '),facts:[...new Set([...unconfirmed.map(f=>f.id),...basis?.facts??[]])],coverage:true}
  return basis
}
function basisSentence(all:WritingFact[],totals:boolean):WrittenSentence|undefined {
  const text=all.map(f=>f.text.replace(UNCONFIRMED_PERIOD,'')).join(' ').trim()
  if(!text)return
  // These aggregates declare their exact selection and exclusions. Do not replace them with a generic caveat.
  if (/^Title selection:|^Industry totals cover classified sources/i.test(text)) return {text,facts:all.map(f=>f.id),coverage:true}
  if (/salary|pay records/i.test(text)) {
    const from = /(?:start on|cover) (\d{4}-\d{2}-\d{2}|\d+ \w+ \d{4})/.exec(text)?.[1]
    return {text:`OPAX's federal pay records${from ? ' start on '+from+' and' : ''} cover salary entitlements and exclude allowances, expenses, superannuation and outside income.`, facts:all.map(f=>f.id), coverage:true}
  }
  const ids=all.map(f=>f.id)
  if(/Party aggregates cover all cleaned rows/i.test(text))return {text:'Party totals cover all cleaned receipts assigned to each party, including internal party transfers, and exclude identified public electoral funding. Disclosed receipts include more than gifts.',facts:ids,coverage:true}
  if(/Exact count of the full published/i.test(text)) {
    const snapshot=/Published snapshot build date: ([\dT:Z.-]+)/i.exec(text)?.[1]?.replace(/\.$/,'')
    const latest=/Latest indexed (?:introduced|date) date: (\d{4}-\d{2}-\d{2})/i.exec(text)?.[1]
    return {text:`Counts cover OPAX's published records, which may not include complete parliamentary history.${snapshot?` The snapshot was built on ${snapshot}.`:' The snapshot build date is not published.'}${latest?` The latest indexed record is dated ${latest}.`:''}`,facts:ids,coverage:true}
  }
  if(/party receipts|donation|AEC|disclosed receipt|published map|published selection|industry total/i.test(text))return {text:'Disclosed party receipts can include loans and other non-gift amounts. These totals cover the published selection and are lower bounds because undisclosed receipts below the disclosure threshold are excluded.',facts:ids,coverage:true}
  if(/divisions are matched by (?:a word|words)|recorded vote (?:is not a statement of reasons|does not establish why)/i.test(text))return {text:[/divisions are matched/i.test(text)?'Divisions are matched by words in their titles; divisions filed under other titles may be missed.':'',/recorded vote/i.test(text)?'A recorded vote does not establish why a member voted that way.':''].filter(Boolean).join(' '),facts:ids,coverage:true}
  if(/contract/i.test(text))return {text:'These are published contract values, including amendments, rather than payments.',facts:ids,coverage:true}
  if(/topic|Hansard|committee|labelled speeches/i.test(text))return {text:'Topic-labelled speech records are incomplete, with older years and known Hansard gaps undercounted'+(/committee.*exclud|exclud.*committee/i.test(text)?' and committee-hearing turns excluded':'')+'.',facts:ids,coverage:true}
  if(totals&&/unknown|unavailable|cannot establish|not.*covered/i.test(text))return {text:'Some selected records lack verified coverage for the requested scope, so they cannot establish a complete historical total.',facts:ids,coverage:true}
  const relevant=all.find(f=>/^It excludes/i.test(f.text))?.text
  return relevant ? {text:finish(clean(relevant.replace(/^It excludes/i,'These records exclude')).split(/(?<=[.!?])\s+/)[0]),facts:ids,coverage:true} : undefined

}
/** A known jurisdiction boundary is itself the useful answer, including if writing fails. */
function statePayCoverage(input:WritingInput):WrittenSentence|undefined {
 if(!input.facts.some(f=>/federal.*(?:only|cannot).*state.*(?:pay|salary)/i.test(f.text)))return
 const jurisdiction=/\b(Victorian|Queensland|Tasmanian|South Australian|Western Australian|NSW|New South Wales|ACT|Northern Territory)\b/i.exec(input.question)?.[0]
 const year=input.period.since?.slice(0,4)??/\b(?:19|20)\d{2}\b/.exec(input.question)?.[0]
 return {text:`The highest-paid ${jurisdiction?jurisdiction+' ':''}state politician${year?' in '+year:''} is not identified by OPAX's pay records: they cover federal parliamentarians, with state parliamentary salaries outside their coverage.`,facts:input.facts.map(f=>f.id),coverage:true}
}
/** Record kinds that can stand as found. Speech, committee, press and transcript text needs its speaker, so it is never rendered raw. */
const RENDERED_KINDS=new Set(['count','export','record','receipt','pay','grant','contract'])
export const renderedKind=(kind:unknown)=>RENDERED_KINDS.has(String(kind))
export const usableFact=(f:WritingFact)=>!f.coverage&&!f.metadata&&!/^USER_CONTEXT_/i.test(f.source.resource)&&renderedKind(f.source.kind)&&withoutSaPlaceholder(f.text)===f.text&&(/\$\d/.test(f.text)||!/\bcannot\b|not fully covered|does not date|no matching/i.test(f.text))
export const RANKING_WORDS=/\b(?:most|largest|biggest|highest|top)\b/i
const yearsIn=(text:string)=>[...text.matchAll(/\b(?:19|20)\d{2}\b/g)].map(m=>Number(m[0]))
/** The first and last year a fact's own dates reach: a financial year ends in the next calendar year. */
function factYears(fact:WritingFact):[number,number]|undefined {
  const labels=[fact.source.receipt?.period,...(fact.atoms??[]).flatMap(a=>[a.period.since,a.period.until,a.period.label]),...fact.text.match(/\b(?:19|20)\d{2}(?:-\d{2}-\d{2}|[–-]\d{2})\b/g)??[]].filter((label):label is string=>!!label)
  const years=labels.flatMap(yearsIn)
  if(!years.length)return
  return [Math.min(...years),Math.max(...years)+(labels.some(label=>/\d{4}[–-]\d{2}(?!-)/.test(label))?1:0)]
}
const requested=(input:WritingInput)=>input.constraints?.period?.since||input.constraints?.period?.until?input.constraints.period:input.period
/** Known dates that miss the request entirely. An open end stays open, and undated facts are not known to be wrong. */
export function outsideRequest(fact:WritingFact,input:WritingInput):boolean {
  const years=factYears(fact),{since,until}=requested(input)
  if (fact.source.kind === 'count' && /bill records by introduction date|bills? (?:was|were) introduced/.test(fact.text)) {
    const month = /\bin (\d{4})-(0[1-9]|1[0-2])[.]?$/.exec(fact.text)
    const counted = month ? { since: `${month[1]}-${month[2]}-01`, until: new Date(Date.UTC(Number(month[1]), Number(month[2]), 0)).toISOString().slice(0, 10) } : inferPeriod(fact.text)
    // A calendar month in a count is not a financial year extending into the next year.
    if (counted.since && counted.until && (since && counted.since !== since || until && counted.until !== until)) return true
  }
  return !!years&&(!!until&&years[0]>Number(until.slice(0,4))||!!since&&years[1]<Number(since.slice(0,4)))
}
/** A fact about some other subject than the one the question names is not found evidence for it. */
function onTopic(fact:WritingFact,input:WritingInput):boolean {
  const scope=resolvedRankingScope(input.question,input.constraints),receipt=fact.source.receipt,entities=fact.source.entities??[]
  const parties=[receipt?.party,...entities.filter(e=>e.startsWith('party:')).map(e=>e.slice(6))].filter(Boolean)
  if(scope.party&&!['conflict','unknown'].includes(scope.party)&&parties.length&&!parties.some(p=>partyNamed(p)===scope.party))return false
  const people=entities.filter(e=>e.startsWith('person:')).map(e=>e.slice(7)),asked=input.constraints?.people??[]
  if(asked.length&&people.length&&!people.some(p=>asked.includes(p)))return false
  // A named person: a fact that carries no entity must at least name them.
  if(asked.length&&!people.length&&!receipt&&!asked.some(p=>fact.text.toLowerCase().includes(p.toLowerCase())))return false
  const named=input.facts.filter(f=>f.source.receipt&&input.question.toLowerCase().includes(f.source.receipt.source.toLowerCase()))
  if(receipt&&named.length)return named.includes(fact)
  const industry=questionIndustry(input.question),held=receipt?.filter??receipt?.industry
  return !(industry&&receipt&&held&&held!==industry)
}
/** What was found that can stand as an answer to this question, whatever its wording. */
export const foundFacts=(input:WritingInput)=>input.facts.filter(f=>usableFact(f)&&onTopic(f,input)&&!outsideRequest(f,input))
const receiptLine=(r:ReceiptFact)=>{
  if(r.aside)return finish(r.aside)
  const place=jurisdictionNames[r.jurisdiction??''],span=yearsIn(r.period).length?'financial years '+r.period:''
  return `${r.party} disclosed ${dollars(r.amount)} in ${r.measure==='donations'?'donations':'receipts'} from ${r.source} (${[place&&place+' disclosures',span].filter(Boolean).join('; ')}).`
}
function factLine(text:string):string {
  text=clean(text).replace(/\s+[—–]\s+[^—–]*https?:\/\/\S*\s*$/,'').replace(/https?:\/\/\S+/g,'').trim()
  const receipt=/^Disclosed receipt:\s*(.+?)\s*→\s*(.+?)\s*[—–]\s*(\$[\d,.]+) in disclosed political receipts/i.exec(text)
  if(receipt)return `${receipt[2]} disclosed ${receipt[3]} in receipts from ${receipt[1]}.`
  const donor=/^Donor:\s*(.+?)\s*[—–]\s*.*?(\$[\d,.]+) in disclosed political receipts/i.exec(text)
  if(donor)return `${donor[1]} provided ${donor[2]} in disclosed political receipts.`
  if(text.startsWith('|')){
    const cells=text.split('|').map(clean).filter(Boolean),amount=cells.find(c=>/^\$\d/.test(c)),name=cells.find(c=>/[a-z]/i.test(c))
    if(!cells.some(c=>/\d/.test(c)))return ''
    text=amount&&name?`${name}: ${amount}`:cells.join(', ')
  }
  if(rawToolEcho(text))return ''
  return text&&finish(text.replace(/[:;,\s]+$/,''))
}
function transcriptLines(input: WritingInput): WrittenSentence[] | null {
  const turns = input.facts.filter(f => f.transcript && !f.coverage)
  if (!turns.length) return null
  const seen = new Set<string>()
  const lines = turns.filter(f => { const t = f.transcript!, id = t.speaker + ':' + t.excerpt; if (seen.has(id)) return false; seen.add(id); return true }).slice(0, 4).map(f => {
    const t = f.transcript!, verb = /\?\s*$/.test(t.excerpt) ? 'asked' : 'said'
    return { text: `${t.speaker} ${verb}${t.day ? ` on hearing day ${t.day}` : ''}${t.date ? ` (${t.date})` : ''}: “${shortTranscriptQuote(t.excerpt, input.question)}”`, facts: [f.id] }
  })
  return [...lines, { text: TRANSCRIPT_NOTE, facts: turns.map(f => f.id) }]
}
/** Final-boundary and provider-failure fallbacks also accept unsplit record facts. Keep the same
 * attributed-turn representation there, rather than rendering the original tool block as a record. */
function transcriptWritingInput(input: WritingInput): WritingInput {
  if (!input.facts.some(f => !f.transcript && transcriptTurns(f.text).length)) return input
  const facts = input.facts.flatMap(f => f.transcript || !transcriptTurns(f.text).length ? [f] :
    writingFacts({ answer: '', citations: {}, sources: [{ ...f.source, snippet: f.text, cited: true, ...(f.coverage ? { coverage: true } : {}) }] }))
  return { ...input, facts: facts.map((f, i) => ({ ...f, id: i + 1 })) }
}
function writingClaimIdentity(atom:ClaimAtom,fact:WritingFact):string {
  const receipt=fact.source.receipt
  const relation=receipt?key(receipt.source+' to '+receipt.party):[...fact.text.matchAll(/\b(from|to) ([\p{L}][^.;]+?)(?=\s+(?:in|across|during) (?:financial years? )?\d{4}|[.;]|$)/giu)].map(m=>key(m[0])).join('|')
  const award=/\b(?:contracts?|grants?)\b/i.test(fact.text)?key(fact.text):''
  return claimIdentity(atom)+'|'+relation+'|'+award
}
/** The last resort: the found facts themselves, each with its own dates. No parser stands between them and the reader. */
export function renderFacts(input:WritingInput,bullets=false):WrittenSentence[] {
  input=transcriptWritingInput(moneyWritingInput(input))
  const transcript = transcriptLines(input)
  if (transcript) return transcript
  const money=moneyWritingLines(input,foundFacts(input))
  if(money)return money.map((line,i)=>bullets&&!i?{...line,text:'- '+line.text}:line)
  const limit=/each year|by year|year-by-year|trend|over time/i.test(input.question)?30:Math.min(30,Number(/top (\d+)/i.exec(input.question)?.[1])||8),seen=new Set<string>(),lines:WrittenSentence[]=[]
  for(const fact of foundFacts(input))for(const part of fact.source.receipt?[receiptLine(fact.source.receipt)]:fact.text.split(/\n+/)){
    const text=factLine(part),signature=statementSource(fact.source)+'|'+key(text??'')
    if(!text||seen.has(signature)||lines.length>=limit||/^(?:Period|Financial years):/i.test(clean(part)))continue
    seen.add(signature);lines.push({text:(lines.length||bullets?'- ':'')+text,facts:[fact.id]})
  }
  const period=lines.length?input.facts.find(f=>/^(?:Period|Financial years):\s*\D*\d{4}/i.test(f.text)):undefined
  if(period&&!foundFacts(input).some(f=>f.source.receipt))lines.push({text:finish('These figures cover '+clean(period.text).replace(/^(?:Period|Financial years):\s*/i,'').replace(/\.$/,'')),facts:[period.id]})
  return lines
}
/** A plain note is a selected fact of its own, so it is cited and checked like any other. */
function withNotes(input:WritingInput,notes:string[]):{input:WritingInput;lines:WrittenSentence[]} {
  const base=input.facts.find(f=>f.coverage)?.source??input.facts[0]?.source,start=Math.max(0,...input.facts.map(f=>f.id))+1
  if(!base)return {input,lines:[]}
  const facts=notes.map((text,i)=>({id:start+i,text,coverage:true,source:{resource:'coverage-'+stableEvidenceKey(text),slug:'',title:'Coverage of the selected records',href:base.href,url:base.url,snippet:text,cited:true,kind:'record'}}))
  return {input:{...input,facts:[...input.facts,...facts]},lines:facts.map(f=>({text:f.text,facts:[f.id],coverage:true}))}
}
function askedPeriod(input:WritingInput):string {
  const {since,until}=requested(input),from=since?.slice(0,4),to=until?.slice(0,4)
  return from&&from===to?from:from&&to?`${from} to ${to}`:from?`since ${from}`:`up to ${to}`
}
/** Why these rows are a list and not the thing asked for, in the reader's terms. */
function scopeGaps(input:WritingInput):string[] {
  const row=foundFacts(input).find(f=>f.source.receipt)?.source
  const receipt=row?.receipt
  if(!row||!receipt)return []
  const notes:string[]=[],{since,until}=requested(input),span=yearsIn(receipt.period)
  if((since||until)&&span.length&&(!!since&&Math.min(...span)<Number(since.slice(0,4))||!!until&&Math.min(...span)>Number(until.slice(0,4))||!!until&&Math.max(...span)>Number(until.slice(0,4)))){
    const asked=askedPeriod(input)
    notes.push(`These are totals across ${receipt.period}, not ${/^\d{4}$/.test(asked)?asked+' amounts':'amounts for '+asked}.`)
  }
  if(receipt.filter&&!questionIndustry(input.question))notes.push(`These rows cover ${industryModifier(receipt.filter)} sources only.`)
  for(const gap of rankingScopeGaps(input.question,{source:row,party:receipt.party,period:receipt.period,entity_type:sourceMetadata(row).entity_type??'donor'},input.constraints??{})){
    const wanted=jurisdictionNames[String(gap.wanted)],have=jurisdictionNames[String(gap.have)]
    if(gap.dimension==='jurisdiction')notes.push(wanted&&have?`These are ${have} records, not ${wanted} records.`:'OPAX could not confirm which jurisdiction these records cover.')
    if(gap.dimension==='chamber')notes.push('These records are not split by chamber.')
    if(gap.dimension==='entity_type')notes.push('These records do not say what kind of source each one is.')
  }
  return notes
}
const scopeNotes=(input:WritingInput)=>{const gaps=scopeGaps(input);return gaps.length||!RANKING_WORDS.test(input.question)?gaps:['This is a list of what OPAX found, not a ranking.']}
/** The found facts as a plain list: no superlative, no requested period, each row's own dates, the reason it is only a list, and the record's caveat. */
function factList(input:WritingInput,note?:string,leads:string[]=[]):QualitativeAnswer|null {
  const found=renderFacts(input,!!leads.length)
  if(!found.length)return null
  const noted=withNotes(input,note?[note]:scopeNotes(input)),coverage=coverageSentence(input)
  return assemble([...leads.map(text=>({text,facts:[]})),...found,...noted.lines,...(coverage?[coverage]:[])],noted.input)
}
/** The system's own empty sentences, as opposed to a limit that says something. */
const EMPTY_ANSWERS=new Set(['OPAX cannot establish the requested answer from the selected records.','The selected evidence does not establish the requested answer.','The selected evidence does not establish the requested financial answer.','The selected records do not establish the requested answer.','The available records do not establish an answer to this question.'])
export const emptyAnswer=(answer:string)=>!answer.trim()||EMPTY_ANSWERS.has(answer.trim())
/** Never return the original block, even when the provider is unavailable or the wall cap is spent. */
export function proseFallback(input: WritingInput): QualitativeAnswer {
  input=transcriptWritingInput(moneyWritingInput(input))
  // Context records are retrieval aids, never selected calculation facts.
  input={...input,facts:input.facts.filter(f=>!/^USER_CONTEXT_/i.test(f.source.resource))}
  input={...input,facts:input.facts.filter(f=>f.coverage||f.metadata||!outsideRequest(f,input))}
  // A lending question's note and declared debts (party_receipts lending) come first, before any receipt figure.
  const lending=input.facts.filter(f=>f.source.receipt?.measure==='declared_debts')
  if(lending.length)input={...input,facts:[...lending,...input.facts.filter(f=>!lending.includes(f))]}
  const transcript = transcriptLines(input)
  if (transcript) return { ...assemble(transcript, input), answer_decision: 'answer' }
  // A page pointer under an order is not a listing or a quotation to paste into prose.
  const restricted = input.facts.filter(f => f.text.includes(TRANSCRIPT_LABEL) && /Not quoted:/i.test(f.text))
  if (restricted.length) return { ...assemble([{ text: 'The matching hearing transcript pages are not quoted because the published transcript records a non-publication order, a direction not to publish or a pseudonymous witness.', facts: restricted.map(f => f.id) }], input), answer_decision: 'limitation' }
  const recordLines=recordAnswerLines(input)
  if(recordLines){const coverage=coverageSentence(input);return assemble([...recordLines,...(coverage?[coverage]:[])],input)}
  const money=moneyWritingLines(input,foundFacts(input))
  if(money){const coverage=coverageSentence(input);return assemble([...money,...(coverage?[coverage]:[])],input)}
  const coverageLimit=donationCoverageLimit(input.question,input.facts.map(f=>f.text).join('\n'))
  if(coverageLimit&&input.facts.some(f=>f.coverage&&/The requested period|cannot establish|donation records start/i.test(f.text))) {
    const fact=input.facts.find(f=>donationCoverageLimit(input.question,f.text))!
    const request=input.facts.find(f=>f.coverage&&/^The requested period/i.test(f.text))
    // The date limit is a note under the facts found, never in their place.
    return assemble([...renderFacts(input),{text:coverageLimit,facts:[...new Set([fact.id,...(request?[request.id]:[])])],coverage:true}],input)
  }
  // The count tool also emits count-first rows; serialize the same owner/value
  // relationship in the labelled form understood by writing and the claim audit.
  input={...input,facts:input.facts.map(f=>{
    const m=f.source.kind==='count'?/^(\d[\d,]*) (chamber speeches labelled .+?) by (.+?)( from \d{4}-\d{2}-\d{2}(?: to \d{4}-\d{2}-\d{2})?)?[.]?$/.exec(f.text):null
    if(!m)return f
    const text=`${m[3]}: ${m[1]} ${m[2]}${m[4]??''}.`,source={...f.source,snippet:[...new Set([f.source.snippet,text])].join('\n')}
    return {...f,text,source,atoms:atomsFromText(text,f.evidenceId??source.resource+'/t/body/0',source)}
  }).filter((f,i,all)=>all.findIndex(other=>other.source.resource===f.source.resource&&key(other.text)===key(f.text))===i)}
  if(/\b(?:which|what) parties\b/i.test(input.question)){
    const matchesOwner=(name:string)=>key(input.question).includes(key(name))||name.split(/\s+/)[0].length>=4&&key(input.question).split(' ').includes(key(name.split(/\s+/)[0]))
    const flows=input.facts.flatMap(f=>{const m=f.source.kind==='record'?/^Disclosed receipt:\s*(.+?)\s*→\s*(.+?)\s*—\s*(\$[\d,.]+) in disclosed political receipts/.exec(f.text):null;return m&&matchesOwner(m[1])?[{f,m}]:[]})
    if(flows.length&&new Set(flows.map(r=>r.m[1])).size===1){
      const parties=[...new Set(flows.map(r=>r.m[2]))],lead=`${parties.join(', ').replace(/, ([^,]+)$/,' and $1')} received disclosed funding from ${flows[0].m[1]} in the published selection.`
      const lines:WrittenSentence[]=[{text:lead,facts:flows.map(r=>r.f.id)},...flows.map(({f,m})=>({text:`- ${m[2]} received ${m[3]} in disclosed political receipts from ${m[1]}.`,facts:[f.id]})),{text:'These are selected party receipts, not personal payments or individual gifts.',facts:flows.map(r=>r.f.id),coverage:true}]
      const total=input.facts.flatMap(f=>{const m=f.source.kind==='record'?/^Donor:\s*(.+?)\s*—[\s\S]*?(\$[\d,.]+) in disclosed political receipts/.exec(f.text):null;return m&&m[1]===flows[0].m[1]?[{f,m}]:[]})[0]
      if(total)lines.splice(1,0,{text:`${total.m[1]} gave ${total.m[2]} in disclosed political receipts overall in this published selection.`,facts:[total.f.id]})
      return assemble(lines,input)
    }
    const total=input.facts.flatMap(f=>{const m=f.source.kind==='record'?/^Donor:\s*(.+?)\s*—[\s\S]*?(\$[\d,.]+) in disclosed political receipts/.exec(f.text):null;return m&&matchesOwner(m[1])?[{f,m}]:[]})[0]
    if(total)return assemble([{text:`${total.m[1]} gave ${total.m[2]} in disclosed political receipts in this published selection, but these selected facts do not name which parties received the funding.`,facts:[total.f.id]}],input)
  }
  const donors=repairDonorRanking(input.question,input.facts.map(f=>f.source),input.constraints)
  const donorEvidence=input.facts.some(f=>f.source.receipt)
  // Labelled lines beside a donations ranking (party_receipts): receipts the AEC does not class as
  // donations, and public funding. Said in their own words after the ranking, never ranked.
  const asides=(party?:string,source?:string)=>input.facts.filter(f=>f.source.receipt?.aside&&(!party||key(f.source.receipt.party)===key(party))&&(!source||key(f.source.receipt.source)===key(source)))
  const asideLines=(facts:WritingFact[])=>facts.slice(0,6).map(f=>({text:finish(f.source.receipt!.aside!),facts:[f.id]}))
  // Dates that could not be confirmed cannot carry a ranking or the requested period.
  if(input.facts.some(f=>f.text.includes(UNCONFIRMED_PERIOD))){const list=factList(input);if(list)return list}
  // Parties ranked on one industry's total: the tool's own ranking, read from its rows.
  const totals=input.facts.flatMap(f=>f.source.receipt?.aggregate?[{f,r:f.source.receipt}]:[]).filter(({f},i,all)=>all.findIndex(x=>x.f.source.resource===f.source.resource)===i).sort((a,b)=>b.r.amount-a.r.amount)
  if(totals.length>1&&RANKING_WORDS.test(input.question)&&totals[0].r.filter===questionIndustry(input.question)&&!scopeGaps(input).length){
    const [top,...rest]=totals,coverage=coverageSentence(input)
    return assemble([{text:`${top.r.party} received the most ${top.r.measure==='donations'?'donations':'disclosed receipts'} from ${top.r.source}, with ${dollars(top.r.amount)} across financial years ${top.r.period} in OPAX’s published selection.`,facts:[top.f.id]},...rest.slice(0,7).map(({f,r})=>({text:`- ${r.party} received ${dollars(r.amount)}.`,facts:[f.id]})),...(coverage?[coverage]:[])],input)
  }
  // A ranking we cannot stand behind is withheld, not the receipts: show them as found and say why.
  const unranked=(text?:string)=>{
    const coverage=input.facts.filter(f=>f.coverage),limit=text??'The selected disclosed receipts do not establish a donor ranking for the requested party, period and jurisdiction.'
    return (coverageLimit?null:factList(input,text))??assemble([{text:coverageLimit??limit,facts:(coverage.length?coverage:input.facts.slice(0,1)).map(f=>f.id),coverage:true}],input)
  }
  const mostYears=/\bmost years\b/i.test(input.question)
  if(donorEvidence&&(donorRankingAsked(input.question)||mostYears)&&!donors.length)return unranked(mostYears?'The selected aggregate disclosed receipts do not establish whether giving occurred in most years.':undefined)
  if(/\bhow much\b/i.test(input.question)&&!/\bmost years\b/i.test(input.question)){
    const selected=selectedDonorFacts(input.question,input.facts.map(f=>f.source),input.constraints)
    const named=selected.filter(r=>{const first=r.name.split(/\s+/)[0];return key(input.question).includes(key(r.name))||first.length>=4&&new RegExp('\\b'+first.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')+'\\b','i').test(input.question)&&selected.filter(x=>x.name.split(/\s+/)[0].toLowerCase()===first.toLowerCase()).length===1})
    if(named.length===1&&named[0].period){
      const row=named[0],given=row.measure==='donations'?`gave ${row.amount} in donations`:`provided ${row.amount} in disclosed funding`
      const text=`${row.name}${row.associated?` (${row.associated})`:''} ${given} to ${row.party} across financial years ${row.period} in OPAX’s published selection.`,line={text,facts:input.facts.filter(f=>f.source.resource===row.source.resource).map(f=>f.id)},coverage=coverageSentence(input)
      return assemble([line,...asideLines(asides(row.party,row.name)),...(coverage?[coverage]:[])],input)
    }
    // A named source that gave no donations in the selection, only receipts of another type: say so, then what it gave.
    const namedAside=asides().filter(f=>f.source.receipt!.measure==='other_receipts'&&key(input.question).includes(key(f.source.receipt!.source)))
    if(!named.length&&namedAside.length===1){
      const r=namedAside[0].source.receipt!,coverage=coverageSentence(input)
      const [first,last]=r.period.split(' to ')
      return assemble([{text:`${partyReturns(r.party)} list no donations from ${r.source} in ${!last||first===last?'financial year '+first:'financial years '+r.period}.`,facts:[namedAside[0].id]},...asideLines(namedAside),...(coverage?[coverage]:[])],input)
    }
    // How much, with no one source named: the figures found, largest first, never a sum OPAX did not publish.
    const listed=selected.filter(r=>r.period)
    if(listed.length){
      const lines:WrittenSentence[]=listed.slice(0,8).map((r,i)=>({text:`${i?'- ':''}${r.party} disclosed ${r.amount} in ${r.measure==='donations'?'donations':'receipts'} from ${r.name}${r.associated?` (${r.associated})`:''}${i===0?' across financial years '+r.period+' in OPAX’s published selection':''}.`,facts:input.facts.filter(f=>f.source.resource===r.source.resource).map(f=>f.id)}))
      if(listed.length>1)lines.push({text:'OPAX lists the sources it found here rather than one combined total.',facts:listed.flatMap(r=>input.facts.filter(f=>f.source.resource===r.source.resource).map(f=>f.id))})
      const coverage=coverageSentence(input);if(coverage)lines.push(coverage)
      return assemble(lines,input)
    }
  }
  if(donors.length && donors.every(r=>r.period)) {
    const resources=new Set(donors.map(row=>row.source.resource))
    // A donations ranking (party_receipts measure=donations) says so, and is followed by its labelled asides.
    // A lending question's note and declared debts (measure declared_debts) lead, whatever the ranking counts.
    const lendingAsides=asides(donors[0].party).filter(f=>f.source.receipt!.measure==='declared_debts')
    const donated=donors.every(r=>r.measure==='donations'),beside=[...lendingAsides,...(donated?asides(donors[0].party).filter(f=>!lendingAsides.includes(f)):[])]
    input={...input,facts:input.facts.filter(f=>resources.has(f.source.resource)||beside.includes(f)||f.coverage&&rankingCoverageMatches(input.question,f.source,donors,input.constraints))}
    const lead=(r:typeof donors[number])=>donated?'gave the most in donations':'provided the most disclosed funding'
    const lines:WrittenSentence[]=donors.slice(0,5).map((r,i)=>({text:`${i===0?'':'- '}${/\.(?=\s+[A-Z])|\b[A-Z]\.[A-Z]\./.test(r.name)?'“'+r.name+'”':r.name}${r.associated?` (${r.associated})`:''} ${i===0?lead(r)+(new RegExp('\\b'+r.party+'\\b','i').test(r.source.snippet??'')?' to '+r.party:''):donated?'gave donations':'provided disclosed funding'}: ${r.amount}${i===0?' across financial years '+r.period+' in OPAX’s published selection':''}.`,facts:input.facts.filter(f=>f.source.resource===r.source.resource).map(f=>f.id)}))
    lines.push(...asideLines(beside.filter(f=>!lendingAsides.includes(f))))
    if(lendingAsides.length)lines.unshift(...asideLines(lendingAsides))
    const coverage=coverageSentence(input);if(coverage)lines.push(coverage)
    return assemble(lines,input)
  }
  // Typed receipts need no prose parsing below, and carry their own reason for being only a list.
  if(donorEvidence){const list=factList(input);if(list)return list}
  const stateCoverage=statePayCoverage(input);if(stateCoverage)return assemble([stateCoverage],input)
  const lines: WrittenSentence[] = [], rates = input.facts.flatMap(f => {const r=payRate(f.text);return r?[{f,r}]:[]})
  const year=input.period.since?.slice(0,4)
  if (rates.length) {
    const ranking=/highest|most|top/i.test(input.question), named=rates.filter(x=>input.question.toLowerCase().includes(x.r[1].toLowerCase()))
    const selected=ranking ? rates.filter(x=>!rates.some(y=>Number(y.r[2].replace(/[^0-9.]/g,''))>Number(x.r[2].replace(/[^0-9.]/g,'')) && y.r[4]<=x.r[5] && y.r[5]>=x.r[4])) : named.length ? named : rates.filter(x=>x.r[1]===rates[0].r[1])
    const offices=[...new Set(selected.map(x=>x.r[3]+'\0'+x.r[1]))].sort((a,b)=>Math.max(...selected.filter(x=>x.r[3]+'\0'+x.r[1]===b).map(x=>Number(x.r[2].replace(/[^0-9.]/g,''))))-Math.max(...selected.filter(x=>x.r[3]+'\0'+x.r[1]===a).map(x=>Number(x.r[2].replace(/[^0-9.]/g,'')))))
    for(const officeKey of offices) {
      const [office,name]=officeKey.split('\0')
      const group=selected.filter(x=>x.r[3]===office&&x.r[1]===name), names=[...new Set(group.map(x=>x.r[1]))], amounts=new Map<string,{since:string;until:string}>()
      for(const {r} of group){const previous=amounts.get(r[2]);amounts.set(r[2],{since:previous&&previous.since<r[4]?previous.since:r[4],until:previous&&previous.until>r[5]?previous.until:r[5]})}
      const text=`${year?'In '+year+', ':''}${names.join(' and ')} ${names.length===1?'was':'were'} ${ranking?'the highest-paid federal parliamentarian'+(names.length>1?'s':'')+', ':''}${office}, with annual salary ${amounts.size>1?'rates':'entitlements'} of `+
        [...amounts].map(([amount,g])=>`${amount} from ${day(g.since)} to ${day(g.until)}`).join(' and ')+'.'
      lines.push({text,facts:group.map(x=>x.f.id)})
    }
  }
  const currentPay=input.facts.flatMap(f=>{const m=/^(.+?) \(([^)]+)\), (.+?): base salary \$[\d,]+ plus a loading of [\d.]+%, (\$[\d,]+) a year/.exec(f.text);return m?[{f,m}]:[]})
  if(!rates.length && currentPay.length) {
    const comparison=/Labor.*Liberal|Liberal.*Labor/i.test(input.question)
    const selected=comparison ? [currentPay.find(x=>x.m[2]==='Labor'),currentPay.find(x=>x.m[2]==='Liberal')].filter((x): x is typeof currentPay[number]=>!!x) : currentPay.slice(0,1)
    for(const {f,m} of selected)lines.push({text:/highest|most|top/i.test(input.question)?`${m[1]} (${m[2]}) is the highest-paid ${comparison?m[2]+' ': 'federal '}parliamentarian, with an annual salary entitlement of ${m[4]} as ${m[3]}.`:`${m[1]} (${m[2]}) has an annual salary entitlement of ${m[4]} as ${m[3]}.`,facts:[f.id]})
  }
  const periodFact=input.facts.find(f=>/^(?:Period|Financial years):/i.test(f.text))
  const selectedPeriod=periodFact ? /^(?:Period|Financial years):\s*((?:19|20)\d{2}(?:[–-]\d{2}(?:\d{2})?)?(?:\s+to\s+(?:19|20)\d{2}(?:[–-]\d{2}(?:\d{2})?)?)?)(?=[.\s]|$)/i.exec(periodFact.text)?.[1] : undefined
  const period=selectedPeriod ?? (input.period.since ? input.period.since.slice(0,4)+(input.period.until&&input.period.until.slice(0,4)!==input.period.since.slice(0,4)?'–'+input.period.until.slice(0,4):'') : '')
  if(!rates.length && !currentPay.length) {
    const personRanking=/\b(?:who|which (?:federal )?(?:politicians?|parliamentarians?|person|party|senators?|MPs|members))\b/i.test(input.question)&&/most|highest|largest|top|biggest/i.test(input.question)
    const available=input.facts.filter(f=>!f.coverage && !f.metadata).sort((a,b)=>personRanking?Number(/^\d{4}:/.test(a.text))-Number(/^\d{4}:/.test(b.text)):0), rows:{name:string;amount:string;tail:string;f:WritingFact}[]=[]
    // Tables and labelled record rows are data, never text to copy into the answer.
    for(const f of available) {
      if(/^\|/.test(f.text)) {
        const cells=f.text.split('|').map(clean).filter(Boolean), amount=cells.find(c=>/^\$\d[\d,]*(?:\.\d+)?$/.test(c))
        const name=cells.find(c=>/[a-z]/i.test(c))
        if(amount&&name)rows.push({name,amount,tail:'',f})
      } else {
        const row=/^([^:]{2,110}): (\$\d(?:[\d,]*\d)?(?:\.\d+)?)(.*)/.exec(f.text)
        if(row && !/[.!?]|received the most|Financial years|requested period/i.test(row[1].replace(/\b(?:Pty|Ltd|Inc)\./g,'')))rows.push({name:row[1],amount:row[2],tail:row[3],f})
      }
    }
    if(!rows.length)for(const f of available) {
      const row=/^(.+?) (gave|received|was awarded) ([^$]*)(\$\d(?:[\d,]*\d)?(?:\.\d+)?)/.exec(f.text)
      if(row)rows.push({name:row[1],amount:row[4],tail:'',f})
    }
    const eligible=/suppliers?/i.test(input.question)&&rows.some(r=>/\/supplier\//.test(r.f.source.url))?rows.filter(r=>/\/supplier\//.test(r.f.source.url)):rows
    const unique=eligible.filter((row,i)=>eligible.findIndex(x=>key(x.name)===key(row.name)&&x.amount===row.amount)===i).slice(0,8)
    if(unique.length) {
      const ranking=/most|highest|largest|top|biggest/i.test(input.question), industry=/\b(mining|gambling|property|finance|unions|fossil fuels)\b/i.exec(input.question)?.[1]
      // Donor evidence cannot regain ranking permission through the generic money renderer.
      const leader=unique[0], giving=/\b(?:gave|donated|provided)\b/i.test(input.question),target=giving?/\bto (Labor|Liberal|Greens|Nationals)\b/i.exec(input.question)?.[1]:undefined, subject=industry?industry+' funding':/contract/i.test(input.question)?'contract value':/grant/i.test(input.question)?'grant funding':'disclosed funding'
      // A money total states its period as its record does ("financial year 2022-23"): the cited record must hold the
      // period the sentence gives, or the money check removes the sentence and the ranking loses its leader.
      const recorded=/\bin financial years? ((?:19|20)\d{2}[-–]\d{2}(?: to (?:19|20)\d{2}[-–]\d{2})?)\b/.exec(leader.f.text)?.[1]
      const when=recorded?` in financial year${/ to /.test(recorded)?'s':''} ${recorded}`:period?' in '+period:''
      if(!ranking){for(const row of unique)lines.push({text:`${row===leader&&period?'In '+period+', ':''}${row.name} recorded ${row.amount}${row.tail?' '+clean(row.tail).replace(/[.;]+$/,''):''}.`,facts:[row.f.id]})}
      else {lines.push({text:ranking?`${leader.name} ${giving?'provided':'received'} the most ${subject}${target?' to '+target:''}${when}, with ${leader.amount}.`:`${period?'In '+period+', ':''}${leader.name} recorded ${leader.amount}.`,facts:[leader.f.id,...(periodFact?[periodFact.id]:[])]})
      if(unique.length>1)lines.push({text:(ranking?unique.length>2?'The runners-up were ':'The runner-up was ':unique.length>2?'The other records were ':'The other record was ')+unique.slice(1).map(r=>`${r.name} with ${r.amount}`).join(', ')+'.',facts:unique.slice(1).map(r=>r.f.id)})}
      for(const row of rows.filter(r=>!eligible.includes(r)))lines.push({text:`${row.name} recorded ${row.amount}${row.tail?' '+clean(row.tail).replace(/[.;]+$/,''):''}.`,facts:[row.f.id]})
    }
    if(!rows.length)for(const f of available.slice(0,/each year|by year|year-by-year|trend|over time/i.test(input.question)?30:Math.min(30,Number(/top (\d+)/i.exec(input.question)?.[1])||8))) {
      const count=/^([^:]+): (\d[\d,]*)(.*)/.exec(f.text), total=/^(\d[\d,]*) (.+)/.exec(f.text)
      const cohort=/^(\d[\d,]*) bill records in the introduction cohort (.+?); (\d[\d,]*) have snapshot status (\w+) \(([\d.]+)%\)/.exec(f.text)
      if(cohort&&available.some(other=>other!==f&&other.text.startsWith(cohort[3]+' '+cohort[4]+' bill records'))){lines.push({text:`The introduction cohort contained ${cohort[1]} bill records ${cohort[2]}; ${cohort[5]}% had snapshot status ${cohort[4]}.`,facts:[f.id]})}
      else if(count){const who=count[1], detail=count[3].replace(/^([^()]*)/,part=>/^\d{4}$/.test(who)?part.replace(/\s+from \d{4}-\d{2}-\d{2}(?: to \d{4}-\d{2}-\d{2})?/,''):part).replace(/\s*\([^)]*\)/g,'').replace(/[.;]+$/,'');lines.push({text:/^\d{4}$/.test(who)?`In ${who}, there were ${count[2]}${detail}.`:`${who} ${lines.length===0&&/most|highest|top|largest/i.test(input.question)?'led the selected ranking with':'recorded'} ${count[2]}${detail}.`,facts:[f.id]})}
      else if(total)lines.push({text:`There were ${total[1]} ${total[2].replace(/[.;]+$/,'')}.`,facts:[f.id]})
      else if(/\b(?:divisions|all aye|all no)\b/.test(f.text) && !rawToolEcho(f.text))lines.push({text:finish(f.text),facts:[f.id]})
    }
  }
  if(/compar|between|versus|\bvs\b|this term.*last term|last term.*this term/i.test(input.question)) {
    const counts=input.facts.filter(f=>!f.coverage).flatMap(f=>{const m=/^([^:]+): (\d[\d,]*)([^.(]*)/.exec(f.text);return m&&!/^\d{4}$/.test(m[1])?[{f,m}]:[]})
    if(counts.length===2){const [a,b]=counts,shares=counts.map(c=>/\(([\d.]+)% of/.exec(c.f.text)?.[1]);lines.splice(0,lines.length,{text:`${a.m[1]} recorded ${a.m[2]}${a.m[3].trimEnd()}, compared with ${b.m[2]} for ${b.m[1]}.`,facts:[a.f.id,b.f.id]});if(shares[0]&&shares[0]===shares[1])lines.unshift({text:`${a.m[1]} and ${b.m[1]} had the same share of ${shares[0]}% for ${/labelled ([\w-]+)/.exec(a.f.text)?.[1]??'the topic'} among topic-labelled speeches.`,facts:[a.f.id,b.f.id]})}
  }
  if(!lines.length)for(const f of input.facts.filter(f=>!f.coverage)) {
    const census=censusField(f.text)
    if(census)lines.push({text:`${census[1]} has ${/lowest|youngest|fewest/i.test(input.question)?'the lowest ':/highest|oldest|most/i.test(input.question)?'the highest ':''}${census[2]} of ${census[3]}${census[4].trim()?' '+census[4].trim():''}, according to the 2021 Census (ABS).`,facts:[f.id]})
  }
  const coverage=coverageSentence(input)
  if(!lines.length) {
    // Nothing above recognised these facts, which says nothing about whether they answer the question.
    const list=factList(input);if(list)return list
    // The facts as recorded, never a limitation in their place.
    const rendered=renderFacts(input,true);if(rendered.length)return assemble(rendered,input)
    const limit=input.facts.find(f=>/cannot|not fully covered|does not date|not.*available|not.*held|not.*sitting|not.*provide|no matching/i.test(f.text))
    const span=input.period.since ? ' for '+input.period.since+(input.period.until?' to '+input.period.until:'') : ''
    const reason=limit && /does not date|chamber changes|affiliations.*not dated/i.test(limit.text) ? ' because this export does not date historical party or chamber changes' : ' from the selected records'
    const requestedStart=input.period.since??/requested period (\d{4}-\d{2}-\d{2})/.exec(input.facts.map(f=>f.text).join(' '))?.[1]??/\b(?:19|20)\d{2}\b/.exec(input.question)?.[0]
    const boundary=/(?:cover|start(?: on| in)?) (1999-12-07|7 December 1999|December 1999)/i.exec(input.facts.map(f=>f.text).join(' '))
    const censusLimit=input.facts.find(f=>/2021 Census/i.test(f.text)&&/cannot establish/i.test(f.text))
    if(censusLimit)return assemble([{text:`The 2021 Census covers 2021-01-01 to 2021-12-31 and cannot establish the requested answer${span}.`,facts:[censusLimit.id],coverage:true}],input)
    return assemble([{text:boundary&&requestedStart&&requestedStart<'1999-12-07'?`OPAX's federal pay records start in December 1999, so they cannot establish the requested salary answer${span}.`:`OPAX cannot establish the requested answer${span}${reason}.`,facts:(boundary?input.facts:limit?[limit]:input.facts.slice(0,1)).map(f=>f.id),coverage:true}],input)
  }
  if(coverage && !lines.some(l=>key(l.text)===key(coverage.text)))lines.push(coverage)
  return assemble(lines,input)
}
/** The writer's raw sentences, assembled as written. */
export function draftWrittenAnswer(raw:unknown,input:WritingInput):QualitativeAnswer|null {
  if(!raw||typeof raw!=='object'||!Array.isArray((raw as {sentences?:unknown}).sentences))return null
  const obj=raw as {sentences:WrittenSentence[]},lines=obj.sentences.slice(0,16).filter(s=>s&&typeof s.text==='string').map(s=>({...s,facts:Array.isArray(s.facts)?s.facts:[]}))
  const decision=answerDecision(raw)
  return {...assemble(lines,input,!!decision&&decision!=='answer'),...(decision?{answer_decision:decision}:{})}
}
/** The writer's sentences are the answer. Each cites the facts it lists; the writer may format, reorder the headline
 * first and move one record limitation to the coverage note, and never swaps the answer for a limitation. Raw tool rows
 * and repeated sentences are left out. Null only when nothing was written. */
export function verifyWrittenAnswer(raw: unknown, input: WritingInput): QualitativeAnswer | null {
  const obj=raw && typeof raw==='object' ? raw as {sentences?:unknown;answer_decision?:unknown} : {}
  if (!Array.isArray(obj.sentences)) return null
  const declared=answerDecision(obj)
  const lines: WrittenSentence[]=[], seen=new Map<string,WrittenSentence>(), claims=new Set<string>(),figuresSeen=new Set<string>(); let coverage=false
  for (const value of obj.sentences.slice(0,16)) {
    const line=value as WrittenSentence
    if (typeof line?.text!=='string' || !line.text.trim() || rawToolEcho(line.text)) continue
    const ids=[...new Set(Array.isArray(line.facts)?line.facts:[])].filter(id=>Number.isInteger(id) && input.facts.some(f=>f.id===id))
    const facts=ids.map(id=>input.facts.find(f=>f.id===id)!)
    const metadata=(f:WritingFact)=>f.metadata||/^(?:Period|Financial years):/i.test(f.text)
    const isLimit=line.coverage===true || facts.length>0 && facts.every(f=>f.coverage&&!metadata(f))
    if (isLimit && coverage) continue
    const text=isLimit?researchSentences(clean(line.text))[0]?.text??'':clean(line.text)
    if (isLimit) coverage=true
    for (const {text:sentence} of researchSentences(text)) {
      // A sentence repeating the same figures for the same owners as one already written adds nothing.
      const provenance=[...new Set(facts.map(f=>statementSource(f.source)))].sort().join('|')
      const k=provenance+'|'+key(sentence), identities=facts.flatMap(f=>(f.atoms??atomsFromText(f.text,f.evidenceId??f.source.resource,f.source)).filter(a=>tokens(sentence).includes(a.value)&&(!a.entity||sentence.includes(a.entity))).map(a=>provenance+'|'+writingClaimIdentity(a,f)))
      if(!key(sentence))continue
      const prior=seen.get(k)
      if(prior){prior.facts=[...new Set([...prior.facts,...ids])];continue}
      if(identities.length>0&&identities.every(id=>claims.has(id))&&tokens(sentence).every(n=>figuresSeen.has(n)))continue
      const kept={text:finish(sentence),facts:ids,coverage:isLimit}
      seen.set(k,kept); identities.forEach(id=>claims.add(id));tokens(sentence).forEach(n=>figuresSeen.add(n))
      lines.push(kept)
    }
  }
  if (!lines.length) return null
  // The headline figure leads when the writer put it further down.
  const quantitative=/\b(?:highest|lowest|most|least|largest|biggest|top|paid|salary|pay|cost|worth|contracts?|grants?)\b|\bhow (?:many|much)\b/i.test(input.question)
  const candidates=/suppliers?/i.test(input.question)&&input.facts.some(f=>/\/supplier\//.test(f.source.url))?input.facts.filter(f=>/\/supplier\//.test(f.source.url)):input.facts
  const primaries=quantitative?candidates.filter(f=>!f.coverage&&!f.metadata).flatMap(f=>(f.atoms??atomsFromText(f.text,f.evidenceId??f.source.resource,f.source)).filter(a=>a.unit.startsWith('AUD')&&a.metric!=='base_salary'||a.unit==='count'&&/^(?:speeches|divisions)/.test(a.metric)).map(atom=>({fact:f,atom}))):[]
  const headlineCandidates=/\b(?:who|which (?:federal )?(?:politicians?|parliamentarians?|person|party|senators?|MPs|members))\b/i.test(input.question)?primaries.filter(p=>p.atom.entity&&!/^\d{4}$/.test(p.atom.entity)):primaries
  const primary=/highest|most.*paid|paid.*most/i.test(input.question)&&headlineCandidates.some(p=>p.atom.metric==='salary')?headlineCandidates.filter(p=>p.atom.metric==='salary').sort((a,b)=>Number(b.atom.value)-Number(a.atom.value))[0]:headlineCandidates[0]
  const containsHeadline=(line:WrittenSentence)=>!!primary&&!line.coverage&&tokens(line.text).includes(primary.atom.value)&&(!primary.atom.entity||line.text.includes(primary.atom.entity))
  if(primary&&!containsHeadline(lines[0])){const found=lines.findIndex(containsHeadline);if(found>0)lines.unshift(...lines.splice(found,1))}
  if(input.facts.some(f=>/2021 Census \(ABS\)/.test(f.text))&&!lines.some(l=>l.text.includes('2021 Census (ABS)')))lines.push({text:'The figures come from the 2021 Census (ABS).',facts:input.facts.filter(f=>/2021 Census \(ABS\)/.test(f.text)).map(f=>f.id)})
  if (!coverage) {const limit=coverageSentence(input);if(limit)lines.push(limit)}
  return {...assemble(lines,input),answer_decision:declared??'answer'}
}
export function writingPrompt(input: WritingInput): string {
  return JSON.stringify({question:input.question,period:input.period,facts:input.facts.map(f=>({...f,source:undefined,speaker:f.source.speaker,...(f.source.chamber?{chamber:f.source.chamber}:{}),...(f.source.receipt?{receipt:f.source.receipt}:{}),atoms:f.atoms??atomsFromText(f.text,f.evidenceId??f.source.resource,f.source)})),contract: ASK_EVIDENCE_RULES + RECEIPTS_WRITING_RULE + ' ' +
    'Answer the question directly and fully from these facts, and use general knowledge for context. The first sentence must answer the question with the requested name, figure, date or outcome. Answer the exact question in your first sentence. For a who question, name the people and their roles first, then what the inquiry or record found about each; for why, give the reason; for what happened, give the outcome. Then the supporting detail. Say each point once. Describe sources as the public record describes them (\"the Royal Commission\'s report found …\"), never how OPAX loaded or stored them. ' + ASK_ATTRIBUTION_RULE + 'Name the chamber a fact records in its chamber field (senate is the Senate, representatives the House of Representatives). Describe a money record by the name on the record ("a donor named X gave $5,600 in 2021-22"), and link it to a politician only when the record itself says it is them. Use complete sentences in your own words. For counts, start with the count, what was counted, chamber and period. For comparisons, retain every side, named term, value and supported direction. Keep every requested year or month group and its count; record totals retain their snapshot date. Each claim keeps its structured entity, metric, unit, chamber, period and supporting fact id together. Equal values belonging to different entities remain distinct claims. ' +
    'Receipt aggregates use their stated financial-year coverage once in the lead. Annual-return references are example sources within that coverage. Describe uncertainty and the measure in plain language. Give supported figures first, then one necessary scope sentence flagged coverage:true. A record limitation goes in one short coverage sentence after the answer, never in its place. ' +
    'Hearing excerpts name the recorded speaker and hearing day/date, with a short literal quotation and fact id. A question by counsel or a commissioner is a question; identify each witness answer explicitly. Use recorded names and roles. Identify the material once as hearing evidence; licence details belong in the source card. ' +
    'For division outcomes, state whether the motion passed or was defeated and its ayes/noes first, then the requested person or party vote. For floor crossers lead with the recorded names. Retain party labels and partial member-list qualifications. Bill passage uses its separately documented lifecycle result. ' +
    'State each fact once across the answer and selected points. Each figure has one supporting fact id. Keep salary components for questions asking for them. Quote literal source text. Relevant coverage belongs once in coverage.note after the answer. Return a JSON object with answer_decision answer and sentences: {"answer_decision":"answer","sentences":[{"text":"One complete sentence.","facts":[1],"coverage":false}]}. A sentence of context from general knowledge may use an empty facts list. Use plain sentence text, under 180 words unless a requested annual or monthly series needs more.' })
}

/** Keep already checked passage points (including loose uncited survivors) beside the written record answer. */
export function appendWrittenPoints(written: QualitativeAnswer, points: QualitativeAnswer): QualitativeAnswer {
  const emptyRecordRefusal=!!written.answer.trim()&&emptyAnswer(written.answer)&&points.answer.trim()&&points.sources.some(s=>s.cited&&s.kind==='speech')
  let answer=emptyRecordRefusal?'':written.answer
  const citations=emptyRecordRefusal?{}:{...written.citations},seen=new Set<string>(),claims=new Set<string>()
  // A sourced division title is one record, even when its procedural suffix
  // repeats another title. Deduplicate the complete vote line, never its title clauses.
  const divisionLine=(payload:QualitativeAnswer,line:string,from:number,until:number)=>{
    const source=divisionVoteSource(payload,line,from,until)
    return source?'division:'+source.url+':'+key(line.replace(/^[-*]\s*/,'')):null
  }
  for(const part of answer.matchAll(/[^\n]+/g)){
    const from=Array.from(answer.slice(0,part.index)).length,id=divisionLine(written,part[0],from,from+Array.from(part[0]).length)
    if(id)seen.add(id)
  }
  // Canonical record atoms disambiguate equal amounts, shared figures and period aliases.
  const identities=(payload:QualitativeAnswer,text:string,from:number,until:number)=>{
    const ids=Object.entries(payload.citations).filter(([,ranges])=>ranges.some(([a,b])=>a<until&&b>from)).map(([id])=>id)
    const sources=payload.sources.filter(s=>ids.some(id=>id===s.resource||id.startsWith(s.resource+'/')))
    if(sources.some(s=>['speech','bill'].includes(s.kind)))return [] // preserve the existing loose passage points
    const selected=sources.flatMap(s=>s.snippet.split(/\n+/).flatMap(t=>(payRate(t)||/base salary.* a year/.test(t)?[t]:claimClauses(t).map(c=>c.text)).flatMap(text=>atomsFromText(text,s.resource,s).map(atom=>({atom,fact:{id:0,text,source:s}})))))
    const atoms=selected.map(item=>item.atom)
    const owners=[...new Set(atoms.map(a=>a.entity).filter(e=>e&&text.toLowerCase().includes(e.toLowerCase())))]
    const keys=selected.filter(({atom:a})=>tokens(text).includes(a.value)&&(!owners.length||owners.includes(a.entity))).map(({atom,fact})=>writingClaimIdentity(atom,fact))
    if(/\b(?:highest|lowest|most|least|led|leader|ranked)\b/i.test(text))keys.push(...selected.filter(({atom:a})=>(!owners.length||owners.includes(a.entity))&&(a.metric==='salary'||a.metric.startsWith('speeches')||a.metric==='receipts')).map(({atom,fact})=>writingClaimIdentity({...atom,value:'ranking'},fact)))
    const provenance=[...new Set(sources.map(statementSource))].sort().join('|')
    return (keys.length?[...new Set(keys)]:proseClaimKeys(text)).map(k=>provenance+'|'+k)
  }
  const signature=(payload:QualitativeAnswer,text:string,from:number,until:number)=>{
    const ids=Object.entries(payload.citations).filter(([,ranges])=>ranges.some(([a,b])=>a<until&&b>from)).map(([id])=>id)
    const provenance=[...new Set(payload.sources.filter(s=>ids.some(id=>id===s.resource||id.startsWith(s.resource+'/'))).map(statementSource))].sort().join('|')
    return provenance+'|'+key(text.replace(/^[-*]\s*/,''))
  }
  for(const clause of claimClauses(answer)){
    const from=Array.from(answer.slice(0,clause.start)).length,until=from+Array.from(clause.text).length
    seen.add(signature(written,clause.text,from,until));identities(written,clause.text,from,until).forEach(id=>claims.add(id))
  }
  const append=(text:string,from:number,until:number)=>{
    if(answer)answer+='\n\n';const offset=Array.from(answer).length;answer+=text
    for(const [id,ranges] of Object.entries(points.citations))for(const [a,b] of ranges)if(a<until&&b>from)(citations[id]??=[]).push([offset+Math.max(a,from)-from,offset+Math.min(b,until)-from])
  }
  for(const part of points.answer.matchAll(/[^\n]+/g)) {
    const from=Array.from(points.answer.slice(0,part.index)).length,until=from+Array.from(part[0]).length,division=divisionLine(points,part[0],from,until)
    if(division){if(!seen.has(division)){seen.add(division);append(part[0],from,until)}continue}
    const line=part[0],base=part.index!,all=claimClauses(line),kept:typeof all=[]
    for(const clause of all){
      const from=Array.from(points.answer.slice(0,base+clause.start)).length,until=from+Array.from(clause.text).length
      const normal=signature(points,clause.text,from,until),keys=identities(points,clause.text,from,until)
      if(seen.has(normal)||keys.length>0&&keys.every(id=>claims.has(id))&&tokens(clause.text).every(n=>tokens(answer).includes(n)))continue
      seen.add(normal);keys.forEach(id=>claims.add(id));kept.push(clause)
    }
    if(kept.length===all.length&&kept.length){const from=Array.from(points.answer.slice(0,base)).length;append(line,from,from+Array.from(line).length)}
    else for(const clause of kept){const from=Array.from(points.answer.slice(0,base+clause.start)).length;append(clause.text,from,from+Array.from(clause.text).length)}
  }
  const used=points.sources.filter(s=>Object.keys(citations).some(id=>id===s.resource||id.startsWith(s.resource+'/'))),sources=new Map<string,WritingFact['source']>()
  for(const source of [...written.sources,...used]){const prior=sources.get(source.resource);sources.set(source.resource,{...(prior??source),cited:Object.keys(citations).some(id=>id===source.resource||id.startsWith(source.resource+'/')),snippet:[...new Set([prior?.snippet,source.snippet].filter(Boolean))].join('\n')})}
  return distinctSummary({...written,...(emptyRecordRefusal?{answer_decision:'answer' as const}:{}),answer,citations,sources:[...sources.values()],...(points.answer_status?{answer_status:written.sources.length?'partly_cited' as const:points.answer_status}:{})})
}
