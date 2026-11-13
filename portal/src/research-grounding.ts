import {auditPayload,sentenceParts,moneySentenceEdits} from './research-claim-audit.mjs'
import {plainAnswerPayload,rewriteAnswerPayload} from './research-language'
import {ACCOUNTABILITY_QUESTION,attributeSpokenFindings,leadWithAuthority,leadWithFinding} from './research-answer-shape'
import {citationHasSentence,protectedDecision} from './research-coherence.mjs'
import type {WritingInput} from './research-writing'
import type {QualitativeAnswer} from './research-types'
import {sentenceFragment} from './research-claims'
import {passageExcerpt} from './research-evidence'
import {isBillSpeechQuestion} from './ask-scope-intent'
import {readableDate} from './tools/record-common'
import {researchTrace} from './research-trace'
import {repairQuotes} from './research-evidence'
import {distinctSummary} from './research-writing'
import {leadWithWho} from './research-who-lead'
type SelectedSource=WritingInput['facts'][number]['source']
const ORPHAN_LEAD=/^(?:(?:It|They)\s+(?:also\s+|further\s+)?(?=(?:found|formed|made|recommended|concluded|noted|reported|published|stated|determined|considered|identified)\b)|A further\s+(?:(finding|opinion|recommendation)s?\s+(?:was|is|were)\s+that\s+|(opinion|finding)\s+of\s+))/
const BODY_WORDS=/\b(?:Commission|Commissioner|Ombudsman|Inspector|Office|Department|Authority|Tribunal|Court|Committee|Agency)\b/
/** A lead left by a removed sentence ("It also found", "A further opinion of") takes the subject of the
 * record it cites, when that record names an official body; otherwise it is left as written. */
function orphanLead(payload:Record<string,unknown>):Record<string,unknown> {
  const text=String(payload.answer??''),m=ORPHAN_LEAD.exec(text)
  if(!m)return payload
  const end=Array.from(text.slice(0,(/[.!?](?:\s|$)/.exec(text)?.index??text.length)+1)).length
  const sources=(Array.isArray(payload.sources)?payload.sources:[]) as SelectedSource[]
  const cited=Object.entries((payload.citations??{}) as Record<string,unknown>).filter(([,ranges])=>Array.isArray(ranges)&&ranges.some(r=>Array.isArray(r)&&Number(r[0])<end)).flatMap(([id])=>sources.filter(s=>id===s.resource||id.startsWith(s.resource+'/')))
  const name=cited.map(s=>/^(?:OPAX holds .*? from the )?([A-Z][\p{L}'’ -]{2,80}?)\s*\(/u.exec(String(s.snippet??''))?.[1]).find(n=>!!n&&BODY_WORDS.test(n))
  if(!name)return payload
  const subject=/^The\b/.test(name)?name:'The '+name
  const lead=m[1]?`${subject} ${({finding:'found',opinion:'formed the opinion',recommendation:'recommended'} as Record<string,string>)[m[1]]} that `:m[2]?`${subject} ${m[2]==='opinion'?'formed an opinion':'made a finding'} of `:subject+' '
  return rewriteAnswerPayload(payload,replace=>replace(new RegExp(`^[\\s\\S]{${m[0].length}}`,'g'),lead))
}

/** Remove empty paragraphs before remapping anchors; punctuation alone cannot carry a citation. */
export function cleanAnswerShape(payload:Record<string,unknown>):Record<string,unknown> {
  const original=(Array.isArray(payload.sources)?payload.sources:[]) as SelectedSource[]
  const selected=original.map(source=>typeof source.title==='string'&&/\(\s*to\s*\)/i.test(source.title)?{...source,title:source.title.replace(/\s*\(\s*to\s*\)/gi,'')}:source)
  if(selected.some((source,i)=>source!==original[i]))payload={...payload,sources:selected}
  const cleaned=rewriteAnswerPayload(payload,replace=>{
    replace(/^(?:[ \t]*(?:\[\d+\]|[.!?,;:—–-]))+[ \t]*(?:\n|$)/gm,'')
    // A list marker with nothing after it, and spaces left at a line's end, are not answer text.
    replace(/^[ \t]*(?:[-*+•]|\d+[.)])[ \t]*(?:\[\d+\][ \t]*)*(?:\n|$)/gm,'')
    replace(/[ \t]+$/gm,'')
    replace(/^(?:What the records? say(?:s)?|Answer|Overview|Summary):[ \t]*\n/gi,'')
    replace(/^(?:Other large donors include|Other donors include|Smaller amounts included)\s+/gi,'')
    replace(/^Further down[, ]+/gi,'')
    replace(/^(?:Also|In addition|Furthermore|Further|However|Meanwhile|Additionally|Moreover|And)[, ]+([a-z]?)/gi,match=>match.replace(/^[A-Za-z]+(?: addition)?[, ]+/,'').replace(/^./,c=>c.toUpperCase()))
    replace(/^Other\s+/gi,'')
    replace(/^Another passage\b/gi,'A selected passage')
    replace(/\n{3,}/g,'\n\n')
    replace(/^\s+|\s+$/g,'')
  })
  const led=orphanLead(cleaned)
  if(led!==cleaned)return cleanAnswerShape(led)
  const citations=Object.fromEntries(Object.entries(cleaned.citations??{}).flatMap(([id,ranges])=>{if(/^USER_CONTEXT_/i.test(id))return [];const kept=Array.isArray(ranges)?ranges.filter(range=>citationHasSentence(String(cleaned.answer??''),range)):[];return kept.length?[[id,kept]]:[]}))
  if(JSON.stringify(citations)===JSON.stringify(cleaned.citations??{}))return cleaned
  const sources=Array.isArray(cleaned.sources)?cleaned.sources.map(s=>s&&typeof s==='object'?{...s,cited:s.cited===true&&Object.keys(citations).some(id=>id===s.resource||id.startsWith(s.resource+'/'))}:s):[]
  return {...cleaned,citations,sources}
}
/** Keep source sentences intact rather than finishing a truncated word window with punctuation. */
function overviewSentence(text:string,question:string){
  return (text.match(/[^.!?]+[.!?]/g)??[]).flatMap(part=>{
    const sentence=part.trim(),candidate=passageExcerpt(sentence,question,40)
    return candidate?.text===sentence&&candidate.score&&/^[\p{Lu}\p{N}]/u.test(sentence)&&!sentenceFragment(sentence)&&!/["“”—]/.test(sentence)?[candidate]:[]
  }).sort((a,b)=>b.score-a.score)[0]
}
/** A checked person overview can lose a verbose paraphrase while still holding that person's verified words.
 * Keep the surviving points and add short literal excerpts, with a fresh audit for every addition. */
function completePersonOverview(original:Record<string,unknown>,result:Record<string,unknown>,question:string):Record<string,unknown> {
  if(protectedDecision(result))return result
  const scope=original.answer_scope as WritingInput['constraints'],people=scope?.people??[]
  if((original.research as {mode?:string}|undefined)?.mode!=='loop'||people.length!==1||isBillSpeechQuestion(question)||!/^what\b.*\b(?:said|say|spoken)\b/i.test(question))return result
  const same=(s:SelectedSource)=>s.kind==='speech'&&s.speaker===people[0]&&/^speech-\d+$/.test(s.slug)&&!!s.date&&/^\d{4}-\d{2}-\d{2}$/.test(s.date)&&
    (!scope?.dated||(!scope.period?.since||s.date>=scope.period.since)&&(!scope.period?.until||s.date<=scope.period.until))&&!/excerpt omitted/i.test(s.snippet)
  let out=result
  const used=()=>new Set(((out.sources??[]) as SelectedSource[]).filter(s=>s.cited&&same(s)).map(s=>s.resource))
  for(const source of (original.sources??[]) as SelectedSource[]){
    if(used().size>=4)break
    if(!same(source)||used().has(source.resource))continue
    const excerpt=overviewSentence(source.snippet,question)
    if(!excerpt)continue
    let answer=String(out.answer??'').trim()
    answer+=(answer?'\n':'')+'- '
    const from=Array.from(answer).length
    const date=new Date(source.date+'T00:00:00Z').toLocaleDateString('en-AU',{day:'numeric',month:'long',year:'numeric',timeZone:'UTC'})
    answer+=`On ${date}, ${source.speaker} said “${excerpt.text}”${/[.!?]$/.test(excerpt.text)?'':'.'}`
    const candidate={...out,answer,citations:{...((out.citations??{}) as QualitativeAnswer['citations']),[source.resource+'/t/body/0']:[[from,Array.from(answer).length]]},sources:[...((out.sources??[]) as SelectedSource[]).filter(s=>s.resource!==source.resource),{...source,cited:true}]}
    out=candidate
  }
  return out
}

/** The final boundary tidies; it never replaces the answer. The claim audit is log output only. Two rules touch text:
 * quotation marks come off words no cited source holds (the sentence stays as paraphrase), and a dollar figure given
 * to the wrong party or period in its cited money record is corrected from that record, or else that sentence goes. */
export function groundAnswerPayload(payload:Record<string,unknown>,question:string):Record<string,unknown> {
  let out=plainAnswerPayload(payload)
  const audit=auditPayload(question,out)
  researchTrace('grounding.audit',{question,counts:audit.counts,findings:audit.findings})
  const edits=moneySentenceEdits(out)
  if(edits.length)researchTrace('grounding.money',{question,edits})
  out=rewriteAnswerPayload(out,replace=>{
    for(const edit of edits)replace(new RegExp(`(?<=^[\\s\\S]{${edit.at}})[\\s\\S]{${edit.text.length}}`,'g'),edit.replacement)
    if(edits.some(edit=>!edit.replacement))replace(/[ \t]{2,}/g,' ')
  })
  out=withCheckedQuotes(out)
  // A typed limitation, refusal or clarification (a lookup correction, a scope decline) keeps its own order.
  // An accountability question opens on a finding or an official record, not a member's claim in debate.
  // A body's finding cited only to one member's speech is that member's claim, and says so (ASK_ATTRIBUTION_RULE).
  out=attributeSpokenFindings(out)
  out=distinctSummary(cleanAnswerShape(protectedDecision(out)?out:ACCOUNTABILITY_QUESTION.test(question)?leadWithAuthority(out,question):leadWithFinding(leadWithFinding(out),question)))
  if(!protectedDecision(out))out=leadWithWho(out,question)
  out=completePersonOverview(payload,out,question)
  const research=out.research&&typeof out.research==='object'?out.research as Record<string,unknown>:undefined
  return {...out,...(research?{research:{...research,claim_audit:audit.counts}}:{})}
}
/** Quoted words stay quoted only when a source the sentence cites (or, for an uncited sentence, any source of the
 * answer) holds them verbatim; otherwise the marks come off and the words stand as paraphrase. */
function withCheckedQuotes(payload:Record<string,unknown>):Record<string,unknown> {
  const text=String(payload.answer??''),sources=(Array.isArray(payload.sources)?payload.sources:[]) as SelectedSource[]
  return rewriteAnswerPayload(payload,replace=>{
    for(const part of sentenceParts(text).reverse()){
      const from=Array.from(text.slice(0,part.at)).length,until=from+Array.from(part.text).length
      const ids=Object.entries(payload.citations??{}).filter(([,ranges])=>Array.isArray(ranges)&&ranges.some(r=>Array.isArray(r)&&r[0]<until&&r[1]>from)).map(([id])=>id)
      const cited=sources.filter(s=>ids.some(id=>id===s.resource||id.startsWith(s.resource+'/')))
      const evidence=(cited.length?cited:sources).map(s=>String(s.snippet??'')).join('\n')
      const checked=repairQuotes(part.text,evidence,()=>{})
      if(checked!==part.text)replace(new RegExp(`(?<=^[\\s\\S]{${part.at}})[\\s\\S]{${part.text.length}}`,'g'),checked)
    }
  })
}
