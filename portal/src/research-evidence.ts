import type {NamedScope} from './agentic-ask'
import type {Passage,QualitativeAnswer} from './research-types'
import {isPlaceNameMention} from './ask-person-slot'
import {readableDate} from './tools/record-common'
import {sentenceSpans} from './sentence-bounds.mjs'
import {quotationSpans} from './research-claim-audit.mjs'
export interface AnswerCitation { id:string; quote:string; start:number; end:number }
export interface AnswerDraft { text:string; citations:AnswerCitation[] }
export interface AnswerPoint { claim:string; id?:string; quote?:string }
const normal=(text:string)=>text.normalize('NFC').replace(/\s+/g,' ').trim()
const TITLE=/^(?:Mr|Mrs|Ms|Miss|Dr|Prof|Senator|Minister|Treasurer|Premier|Member|Hon)\.?$/
const STOP = new Set('the and for with from that this these those their there them they then than were what when where which while about after before between during into over under also more most less very would could should will shall have been being said says told such some other only just even much many each every said member members senator minister government opposition australia australian parliament house bill bills people year years time does done record records show shows tell know your there here whom whose speak spoke spoken talk talked'.split(' '))
const stem = (w: string) => w.slice(0, 6)
/** Content words of a text, folded and stemmed, for a topic or support overlap. */
export const contentWords = (text: string) => new Set((text.normalize('NFKC').toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? []).filter(w => w.length >= 4 && !STOP.has(w)).map(stem))
const overlap = (a: Set<string>, b: Set<string>) => [...a].filter(w => b.has(w)).length
const words = (text: string) => [...text.matchAll(/[\p{L}\p{N}]+(?:['’][\p{L}]+)?/gu)].map(m => ({ w: m[0].toLowerCase().replace(/’/g, "'"), start: m.index!, end: m.index! + m[0].length }))
/** The exact passage text for the longest run of the needle's words found in order in the passage (at least
 * `min` words, or every word of a shorter needle); null when no such run exists. Case, punctuation and spacing
 * differences are absorbed; the returned span is always a verbatim substring of the passage. */
export function passageSpan(text: string, needle: string, min = 5): string | null {
  const hay = words(text), want = words(needle).map(x => x.w)
  if (!want.length || !hay.length) return null
  let best = 0, at = 0, prev = new Array(want.length + 1).fill(0)
  for (let i = 1; i <= hay.length; i++) {
    const row = new Array(want.length + 1).fill(0)
    for (let j = 1; j <= want.length; j++) if (hay[i - 1].w === want[j - 1]) { row[j] = prev[j - 1] + 1; if (row[j] > best) { best = row[j]; at = i - best } }
    prev = row
  }
  if (best < Math.min(min, want.length)) return null
  return text.slice(hay[at].start, hay[at + best - 1].end)
}
/** A short verbatim excerpt (at most `max` words) of the passage sentence that best matches the given words. */
export function passageExcerpt(text: string, about: string, max = 25): { text: string; score: number } | null {
  const target = contentWords(about)
  let best: { text: string; score: number } | null = null
  // A decimal point, "s. 44", "Mr." or an initial is not a sentence end ("would build 1.2 million homes" stays whole).
  for (const part of sentenceSpans(text)) {
    const sentence = part.text, list = words(sentence)
    if (list.length < 4) continue
    let from = 0, score = -1
    for (let i = 0; i <= Math.max(0, list.length - max); i++) {
      const n = overlap(contentWords(list.slice(i, i + max).map(x => x.w).join(' ')), target)
      if (n > score) { score = n; from = i }
    }
    const span = list.length <= max ? sentence : sentence.slice(list[from].start, list[Math.min(list.length, from + max) - 1].end)
    if (!best || score > best.score) best = { text: span, score }
  }
  return best
}
const QUOTED = /["“]([^"”\n]+)["”]|‘([^’\n]+)’|(^|[\s(])'([^'\n]+)'(?=$|[\s.,;:!?)])/g
/** Quoted text in a claim stays quoted only when it is verbatim in the cited passage (re-cased to the passage);
 * otherwise its quotation marks go and it stands as paraphrase. Where hearing transcripts are in play the rule is
 * stricter (quotationFails): a research point or a writer sentence whose quotation no source holds word for word
 * is left out whole, so the words do not stay as prose. */
export function repairQuotes(claim: string, evidence: string, note: (label: string) => void): string {
  return claim.replace(QUOTED, (match, dq?: string, sq?: string, lead?: string, aq?: string, offset?: number, whole?: string) => {
    const inner = dq ?? sq ?? aq ?? ''
    // Words the passage holds exactly as quoted (punctuation included) stand unchanged.
    if (inner.trim() && normal(evidence).includes(normal(inner))) return match
    const exact = passageSpan(evidence, inner, Number.MAX_SAFE_INTEGER)
    if (exact && words(exact).length === words(inner).length) {
      if (exact !== inner) note('quote_recased')
      return `${lead ?? ''}“${exact}”`
    }
    note('unquoted')
    // “Words.”. loses its marks without leaving a doubled full stop.
    const next = typeof whole === 'string' && typeof offset === 'number' ? whole[offset + match.length] : undefined
    return `${lead ?? ''}${next === '.' ? inner.replace(/[.!?]+$/, '') : inner}`
  })
}

/** Whether a claim holds a quotation that its evidence does not hold word for word (repairQuotes would take the marks
 * off). The claim is then left out whole: cutting the quoted words out of a sentence would leave a fragment. */
export function quotationFails(claim: string, evidence: string): boolean {
  return failedQuotations(claim, evidence).length > 0
}
/** The quoted words in a claim that its evidence does not hold word for word. */
export function failedQuotations(claim: string, evidence: string): string[] {
  const failed: string[] = []
  claim.replace(QUOTED, (match, dq?: string, sq?: string, _lead?: string, aq?: string) => {
    const inner = dq ?? sq ?? aq ?? ''
    if (repairQuotes(match, evidence, () => {}) !== match && !(inner.trim() && normal(evidence).includes(normal(inner)))) { const exact = passageSpan(evidence, inner, Number.MAX_SAFE_INTEGER); if (!(exact && words(exact).length === words(inner).length)) failed.push(inner) }
    return match
  })
  return failed
}
/** Whether quoted words share a run of at least five words with a text: a loose quotation of it, not of something else. */
export const looseQuotationOf = (inner: string, text: string): boolean => !!passageSpan(text, inner, 5) && words(inner).length >= 5

/** The fixed line an answer is left with when nothing a record supports remains. */
export const NO_SUPPORTED_ANSWER = 'OPAX cannot establish the requested answer from the selected records.'
/** A model's JSON text sometimes arrives over-escaped: a backslash left standing before a quotation mark ("the word
 * used is \"cleared\""). The backslash is decoding residue, not a character the model wrote for the reader. */
export const unescapedQuotes = (text: string): string => text.replace(/\\+(?=["“”‘’'])/g, '')
/** Labels of the writer's or research model's own input that it sometimes echoes into an answer. Only the exact
 * token forms that input uses, each with nothing word-like or hyphenated straight before it:
 *   "[fact 1]", "[facts 1, 2]", "[fact 1 and 2]"          a fact number in square brackets
 *   "fact id 3", "(fact id 3)", "fact ids 3 and 4"         the words "fact id" and a number
 *   "fact id fact-25/turn/1/t/body/0", "(fact id fact-3)"  the words "fact id" and an evidence id
 *   "fact-25/turn/1", "fact-3/t/body/0"                    a bare evidence id with its path
 * Not labels, and left alone: "(fact 7)", "(Facts 2 and 3)", "the fact that", "fact 3 of the report", "[1]",
 * "fact-finding", "post-fact-3 analysis", "fact-3" with no path. */
export const MACHINE_LABELS = [
  /[ \t]*(?<![\p{L}\p{N}-])\[facts? \d+(?:(?:, ?| and )\d+)*\]/giu,
  /[ \t]*(?<![\p{L}\p{N}-])\(?\bfact ids? (?:fact-\d+(?:\/[\w-]+)*|\d+(?:(?:, ?| and )\d+)*)\)?/giu,
  /[ \t]*(?<![\p{L}\p{N}-])\(?\bfact-\d+(?:\/turn\/\d+(?:\/t\/body\/\d+(?:-\d+)?)?|\/t\/body\/\d+(?:-\d+)?)\)?/giu,
]
/** The writer's own "(fact 7)" or "(facts 2 and 3)" at the end of a sentence, where every number is the id of a fact
 * the writer was given in that call: straight after a sentence end or a closing quotation mark, or straight before
 * the sentence's closing full stop ("... in 2023 (fact 3)."). The label goes; the sentence keeps one full stop.
 * The same words in the middle of a sentence, inside a quotation, or with a number the writer was not given, are
 * ordinary prose and stay. */
export function withoutGivenFactLabels(text:string,given:ReadonlySet<number>):string {
  const quoted=quotationSpans(text)
  return text.replace(/(?<=[.!?"”’])[ \t]*\(facts? (\d+(?:(?:, ?| and )\d+)*)\)(\.?)|[ \t]*\(facts? (\d+(?:(?:, ?| and )\d+)*)\)(?=[.!?](?:["”’]?(?:\s|$)))/giu,(all:string,after:string|undefined,stop:string|undefined,before:string|undefined,at:number,whole:string)=>{
    const ids=after??before??''
    if(!(ids.match(/\d+/g)??[]).every(n=>given.has(Number(n))))return all
    // The label's own opening bracket decides: inside a quotation it is the source's words.
    const bracket=at+all.indexOf('(')
    if(quoted.some((q:{at:number;end:number})=>bracket>q.at&&bracket<q.end-1))return all
    if(before!==undefined)return ''
    return /[.!?]["”’]?$/.test(whole.slice(0,at))?'':stop??''
  })
}
/** Whether a sentence is written in another script: outside its quotations, most of its letters are not Latin. A
 * count of characters, never a reading of the words. A verbatim quotation in any script does not count. */
export function otherScript(text:string):boolean {
  let outside=text
  for(const q of [...quotationSpans(text)].reverse())outside=outside.slice(0,q.at)+outside.slice(q.end)
  const letters=outside.match(/\p{L}/gu)??[]
  return letters.length>=4&&letters.filter(c=>!/\p{Script=Latin}/u.test(c)).length*2>letters.length
}
/** A quotation that starts or ends where its excerpt was cut keeps the excerpt's own "...": a model sometimes writes
 * a full stop there, which makes a cut-off passage read as a finished sentence. Only the marks at a cut end change;
 * the words are already checked to be the excerpt's. */
export function withSourceEllipses(sentence:string,excerpts:string[]):string {
  const flat=(s:string)=>s.replace(/\s+/g,' ').trim()
  let out=sentence
  for(const q of [...quotationSpans(sentence)].reverse()){
    const inner=q.value,core=flat(inner.replace(/^[.…\s]+|[.…!?\s]+$/g,''))
    if(core.split(' ').length<2)continue
    let next=inner
    for(const excerpt of excerpts){
      const body=flat(excerpt.replace(/^(?:\.\.\.|…)|(?:\.\.\.|…)$/g,''))
      if(/(?:\.\.\.|…)$/.test(excerpt.trim())&&body.endsWith(core)&&!/(?:\.\.\.|…|-\s?-)\s*$/.test(next))next=next.replace(/[.!?\s]+$/,'')+'...'
      if(/^(?:\.\.\.|…)/.test(excerpt.trim())&&body.startsWith(core)&&!/^\s*(?:\.\.\.|…)/.test(next))next='...'+next.replace(/^[.\s]+/,'')
    }
    if(next!==inner)out=out.slice(0,q.at+1)+next+out.slice(q.end-1)
  }
  return out
}
/** Words that say nothing by themselves: a sentence left with only these once its labels are gone is dropped. */
export const EMPTY_WORDS = /^(?:see|also|and|or|the|a|an|at|in|on|of|for|as|it|is|are|was|were|to|by|with|from|this|that|these|those|recorded|quoted|cited|details?|more|words?|here|there|both)$/i

export interface AnswerTally { points_in:number;points_kept:number;points_uncited:number;repairs:Record<string,number>;drops:Record<string,number>;uncited:Record<string,number>;mode?:'points'|'record_list'|'facts'|'uncited';salvaged?:string }
export const emptyTally=():AnswerTally=>({points_in:0,points_kept:0,points_uncited:0,repairs:{},drops:{},uncited:{}})
export function pointsDraft(points:AnswerPoint[]):AnswerDraft {
 let text='';const citations:AnswerCitation[]=[]
 for(const point of points){if(text)text+='\n';text+='- ';const start=Array.from(text).length;text+=point.claim;if(point.id)citations.push({id:point.id,quote:point.quote??'',start,end:Array.from(text).length})}
 return {text,citations}
}
const sourcesOf=(used:Passage[],cited=true):QualitativeAnswer['sources']=>[...new Map(used.map(p=>[p.resource,{resource:p.resource,slug:p.slug,title:p.title,href:p.url,url:p.url,snippet:p.text,cited,kind:p.kind,...(p.date?{date:p.date}:{}),...(p.speaker?{speaker:p.speaker}:{}),...(p.chamber?{chamber:p.chamber}:{})}])).values()]
/** The same character coverage check is used after a repeated sentence is removed. */
export function answerCitationStatus(text:string,citations:QualitativeAnswer['citations']):QualitativeAnswer['answer_status'] {
 const covered=new Set<number>()
 for(const ranges of Object.values(citations))for(const [a,b] of ranges)for(let i=a;i<b;i++)covered.add(i)
 const uncited=Array.from(text).some((ch,i)=>/[\p{L}\p{N}]/u.test(ch)&&!covered.has(i)&&!/^\s*[-*•]\s*$/.test(ch))
 return !Object.keys(citations).length?'uncited':uncited?'partly_cited':undefined
}
/** Accept draft prose, attaching retrieved citations where available. */
/** The draft is the answer. Its citations attach where they name a retrieved passage and a range inside the text;
 * text without a citation stands, and the answer says how much of it is cited. */
export function verifyResearchAnswer(draft:AnswerDraft,passages:Map<string,Passage>,_question?:string,_named?:NamedScope,_positionQuery?:string,_roster?:unknown,_why?:(reason:string)=>void):QualitativeAnswer {
 const citations:QualitativeAnswer['citations']={},used:Passage[]=[],length=Array.from(draft.text).length
 for(const c of draft.citations??[]){
  const p=passages.get(c?.id)
  if(!p||!Number.isSafeInteger(c.start)||!Number.isSafeInteger(c.end)||c.start<0||c.end<=c.start||c.end>length)continue
  ;(citations[c.id]??=[]).push([c.start,c.end]);used.push(p)
 }
 const status=answerCitationStatus(draft.text,citations)
 return {answer:draft.text,citations,sources:sourcesOf(used),...(status?{answer_status:status}:{}),machine_written:true}
}
export function verifyResearchPoints(points:unknown,passages:Map<string,Passage>,question:string,named:NamedScope,positionQuery?:string,roster?:unknown,why?:(reason:string)=>void,tally:AnswerTally=emptyTally()):(QualitativeAnswer&{dropped:number})|null {
 if(!Array.isArray(points))return null
 const isNamed=(list:string[],speaker?:string)=>!!speaker&&list.some(n=>normal(n).toLowerCase()===normal(speaker).toLowerCase())
  const fullName = (claim: string, speaker?: string) => {
    const full = speaker?.trim() ?? '', surname = full.split(/\s+/).at(-1) ?? ''
    if (!full.includes(' ') || !isNamed(named.people, full)) return claim
    const at = new RegExp(`(?<![\\p{L}])(\\p{Lu}[\\p{L}'’.-]*\\s+)?${surname.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?![\\p{L}])`, 'gu')
    return claim.replace(at, (match, before: string | undefined, offset: number) =>
      isPlaceNameMention(claim,offset,offset+match.length) ? match : !before ? full : TITLE.test(before.trim()) ? full : match)
  }

 const seen=new Set<string>(),kept:AnswerPoint[]=[],references=new Map<string,Set<string>>()
 for(const point of points){
  if(typeof point?.claim!=='string')continue
  // A point written in another script is left out (a count of characters; research-evidence otherScript).
  if(otherScript(point.claim)){tally.drops.other_script=(tally.drops.other_script??0)+1;why?.('a point was not in English and was left out');continue}
  const passage=passages.get(point.id),evidence=passage?.text??''
  const claim=repairQuotes(fullName(unescapedQuotes(point.claim),passage?.speaker),evidence,label=>{tally.repairs[label]=(tally.repairs[label]??0)+1})
  const key=normal(claim).toLowerCase()
  if(passage){const ids=references.get(key)??new Set<string>();ids.add(point.id);references.set(key,ids)}
  // Citation upgrades preserve the first copy's wording, which may already be on screen.
  if(seen.has(key)){const at=kept.findIndex(k=>normal(k.claim).toLowerCase()===key);if(passage&&at>=0&&!passages.get(kept[at].id??'')){kept[at]={...point,claim:kept[at].claim};tally.points_kept++;tally.points_uncited--}continue}
  seen.add(key)
  kept.push({...point,claim})
  if(passage)tally.points_kept++;else tally.points_uncited++
 }
 tally.points_in+=points.length;tally.mode=tally.points_kept?'points':'uncited'
 if(!kept.length)return null
 const draft=pointsDraft(kept)
 let offset=0
 for(const point of kept){
  const start=offset+2,end=start+Array.from(point.claim).length
  for(const id of references.get(normal(point.claim).toLowerCase())??[])if(id!==point.id)draft.citations.push({id,quote:'',start,end})
  offset=end+1
 }
 return {...verifyResearchAnswer(draft,passages,question,named,positionQuery,roster,why),dropped:points.length-kept.length}
}

/** With no model call left (a time, token or spend stop), the passages research already holds answer in their own
 * words: the passage most relevant to the question first, one per record, each a verbatim excerpt with its speaker,
 * date and citation. */
export function passagesAnswer(passages:Map<string,Passage>,question:string,limit=4):QualitativeAnswer|null {
 const topic=contentWords(question)
 const ranked=[...passages.values()].map(p=>{const excerpt=passageExcerpt(p.text,question,40);return {p,excerpt,score:(excerpt?.score??0)+[...contentWords(p.text)].filter(w=>topic.has(w)).length}})
  .filter(c=>c.excerpt&&c.excerpt.text.trim().length>=20).sort((a,b)=>b.score-a.score||String(b.p.date??'').localeCompare(String(a.p.date??'')))
 const chosen:typeof ranked=[]
 for(const c of ranked)if(chosen.length<limit&&!chosen.some(x=>x.p.slug===c.p.slug))chosen.push(c)
 if(!chosen.length)return null
 const points=chosen.map(({p,excerpt})=>{const quote=excerpt!.text.trim(),d=p.date?readableDate(p.date):'',lead=d?(/^\d{4}$/.test(d)?`In ${d}, `:`On ${d}, `):'',who=p.speaker?.trim()
  return {claim:`${lead}${who?`${who} said`:'the record says'} “${quote}”`.replace(/^the/,'The'),id:p.id,quote}})
 return {...verifyResearchAnswer(pointsDraft(points),passages),machine_written:false}
}
