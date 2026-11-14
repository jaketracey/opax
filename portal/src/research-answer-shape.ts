import {donorRanking} from './research-coherence.mjs'
import {answerStyleChecks,styleRows} from './research-answer-style.mjs'
import {sentenceParts} from './research-claim-audit.mjs'
import {plainAnswerPayload,rewriteAnswerPayload} from './research-language'
import {recordedChamber} from './ask-chamber-phrases'
import {readableDate} from './tools/record-common'

/** Lead with a checked answer; repair a supported ranking clause before moving it. */
export function leadWithFinding<T extends Record<string,unknown>>(payload:T,question?:string,fixedPrefix=''):T {
  if(typeof payload.answer!=='string')return payload
  if(fixedPrefix&&payload.answer.startsWith(fixedPrefix))return payload
  // Repair an existing supported ranking sentence, preserving its other clauses and anchors.
  if(question&&/most|highest|top/i.test(question)&&/speeches|spoke/i.test(question)){
    const sources=(Array.isArray(payload.sources)?payload.sources:[]) as {kind?:string}[]
    const rows=styleRows({sources:sources.filter(s=>s.kind==='count')}).filter(r=>!/^\d{4}$/.test(r.entity)&&/:\s*[\d,]+\s+(?:chamber\s+)?speeches\b/i.test(r.text)).sort((a,b)=>Number(b.value.replace(/[$,]/g,''))-Number(a.value.replace(/[$,]/g,'')))
    const top=rows[0]
    if(top){
      const escaped=String(top.entity).replace(/[.*+?^${}()|[\]\\]/g,'\\$&'),verb=new RegExp('^(?:Further down,\\s*)?'+escaped+' recorded '+String(top.value).replace(/[$,]/g,''),'i')
      const finding=sentenceParts(payload.answer).find(p=>verb.test(p.text))
      if(finding){
        let repaired=finding.text.replace(/^Further down,\s*/,'').replace(new RegExp(escaped+' recorded ','i'),top.entity+' led the selected ranking with ')
        const period=/ from \d{4}-\d{2}-\d{2}(?: to \d{4}-\d{2}-\d{2})?/.exec(top.text)?.[0]
        if(period&&!repaired.includes(period.trim()))repaired=repaired.replace(/,\s+(?:while|and|whereas)\s+|[.!?]$/,match=>period+(/,$/.test(match.trim())?'':/\b(?:while|and|whereas)\b/.test(match)?'. ':match))
        payload=rewriteAnswerPayload(payload,replace=>replace(new RegExp(finding.text.replace(/[.*+?^${}()|[\]\\]/g,'\\$&'),'g'),repaired))
      }
    }
  }
  const answer=String(payload.answer),parts=sentenceParts(answer)
  const limitation=(text:string)=>/^(?:(?:The|These|This) [^.!?]{0,100}\b(?:records?|passages?|evidence|material|selection)(?: (?:here|therefore|currently|retrieved|available))*|OPAX) (?:do(?:es)? not|cannot|can't)\b/i.test(text)
  const direct=(text:string)=>answerStyleChecks(question??'',text,{sources:payload.sources??[],ranking_rows:donorRanking(question??'',(payload.sources??[]) as [])}).direct_first_sentence==='pass'
  if(!parts.length||(question?direct(parts[0].text):!limitation(parts[0].text)))return payload
  const entries=Object.entries(payload.citations??{})
  const cp=(n:number)=>Array.from(answer.slice(0,n)).length
  // The model's own uncited lead is its answer (who was responsible, what was found): it stays first. Only a cited
  // lead that misses the question, or a limitation, gives way to the finding.
  const leadCited=entries.some(([,ranges])=>Array.isArray(ranges)&&ranges.some(r=>Array.isArray(r)&&r[0]<cp(parts[0].at+parts[0].text.length)&&r[1]>cp(parts[0].at)))
  if(question&&!leadCited&&!limitation(parts[0].text))return payload
  // A caveat is never promoted to lead: it qualifies the answer, whatever it happens to look like.
  const caveat=(p:{at:number;text:string})=>{const from=cp(p.at),until=cp(p.at+p.text.length),cited=entries.filter(([,ranges])=>Array.isArray(ranges)&&ranges.some(r=>Array.isArray(r)&&r[0]<until&&r[1]>from)).map(([id])=>id),records=((Array.isArray(payload.sources)?payload.sources:[]) as {resource?:string;coverage?:boolean}[]);return cited.length>0&&cited.every(id=>/^coverage(?:-|\/|$)/.test(id)||records.some(s=>s.coverage&&(id===s.resource||id.startsWith(s.resource+'/'))))}
  const finding=question?parts.slice(1).find(p=>direct(p.text)&&!caveat(p)):parts.slice(1).find(p=>!limitation(p.text)&&/\$|[“”]|\b\d[\d,]* (?:speeches|votes|divisions|contracts|grants)\b/.test(p.text)&&entries.some(([,ranges])=>Array.isArray(ranges)&&ranges.some(r=>Array.isArray(r)&&r[0]<cp(p.at+p.text.length)&&r[1]>cp(p.at))))
  if(!finding)return payload
  const chars=Array.from(answer),from=cp(finding.at),until=cp(finding.at+finding.text.length)
  // A permutation of original characters keeps short legacy evidence anchors just as precisely as full spans.
  const segments=[[from,until],[0,from],[until,chars.length]],citations:Record<string,[number,number][]>={}
  let written=''
  for(let [a,b]of segments){
    while(a<b&&/\s/.test(chars[a]))a++
    while(b>a&&/\s/.test(chars[b-1]))b--
    if(a===b)continue
    if(written)written+='\n\n'
    const offset=Array.from(written).length
    written+=chars.slice(a,b).join('')
    for(const [id,ranges]of entries)if(Array.isArray(ranges))for(const range of ranges){
      if(!Array.isArray(range)||range.length!==2||!range.every(Number.isSafeInteger))continue
      const start=Math.max(a,range[0]),end=Math.min(b,range[1])
      if(start<end)(citations[id]??=[]).push([offset+start-a,offset+end-a])
    }
  }
  return plainAnswerPayload(rewriteAnswerPayload({...payload,answer:written,citations},replace=>replace(/^Another (?=(?:says|said|reports|describes)\b)/g,'A selected passage ')))
}

const QUANTITATIVE_QUESTION=/\bhow (?:many|much)\b|\b(?:most|highest|lowest|least|largest|biggest|top|total|fewest|ranked?)\b/i
// The kind of inquiry a record opening names ("The Royal Commission into the Robodebt Scheme" is a royal commission).
const INQUIRY_KIND=/\b(?:commission|inquiry|review|audit|investigation|report)\b/i
const escapeRegExp=(text:string)=>text.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')
/** How a sentence refers to the inquiry a record opening is about: by its name before "into …" or as "the <kind>"
 * ("Royal Commission", "the commission"). `mentions` finds it anywhere; `opens` finds a sentence that has it as its
 * subject and describes it ("The commission was established …"), which restates the record's opening. Null when the
 * opening is not about an inquiry. */
function inquiryReference(subject:string):{mentions:RegExp;opens:RegExp}|null {
  const head=subject.replace(/\s+(?:into|of|on|for)\b.*$/i,'').replace(/^the\s+/i,'').trim()
  if(!head||!INQUIRY_KIND.test(head))return null
  const name=`(?:${escapeRegExp(head)}|${escapeRegExp(head.split(/\s+/).pop()!)})`
  return {mentions:new RegExp(`\\b${escapeRegExp(head)}|\\bthe ${name}(?![a-z])`,'i'),
    opens:new RegExp(`^(?:[-*]\\s*)?(?:the\\s+)?${name}(?![a-z])(?:\\s+(?:into|of|on|for)\\s[^,.]*?)?(?:,\\s|\\s+(?:is|was|are|were)\\s)`,'i')}
}
const firstSentence=(text:string)=>sentenceParts(text)[0]?.text??''
const subjectOf=(sentence:string)=>{const m=/^(?:[-*]\s*)?((?:[A-Z][\w’'-]*|of|into|the|for|on|and)(?:\s+(?:[A-Z][\w’'-]*|of|into|the|for|on|and)){1,9})(?=,\s|\s+(?:is|was|are|were)\s)/.exec(sentence);return m?m[1]:''}
/** The second sentence of an opening says again who or what the first is: the same subject, then "is", "was" or an
 * apposition (a role, an office, establishment details). */
export function restatesOpening(first:string,second:string):boolean {
  const a=subjectOf(first),b=subjectOf(second)
  if(!a||a.split(/\s+/).length<2||a.toLowerCase()!==b.toLowerCase())return false
  const rest=(s:string,subject:string)=>s.replace(/^(?:[-*]\s*)?/,'').slice(subject.length)
  const described=(tail:string)=>/^,\s|^\s+(?:is|was|are|were)\s/i.test(tail)
  return described(rest(first,a))&&described(rest(second,b))
}
/** Merge a restated identity sentence into the opening: "X is a Victorian Labor politician who represents Y" after
 * "X is the Victorian Premier…" keeps only what it adds ("As a Victorian Labor politician, X represents Y"). Null when
 * the sentence has no such shape. */
function mergedRestatement(first:string,second:string):string|null {
  const subject=subjectOf(second),m=new RegExp('^'+subject.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')+'\\s+(?:is|was)\\s+(?:a|an|the)\\s+([^,;.]+?)\\s+(?:who|that)\\s+(.+)$').exec(second)
  if(!subject||!m)return null
  const known=new Set(first.toLowerCase().match(/[a-z’'-]+/g)??[]),generic=/^(?:politician|person|member|parliamentarian|mp|figure)$/
  const adds=(m[1].toLowerCase().match(/[a-z’'-]+/g)??[]).some(w=>!known.has(w)&&!generic.test(w))
  return adds?`As ${/^[aeiou]/i.test(m[1])?'an':'a'} ${m[1]}, ${subject} ${m[2]}`:`${subject} ${m[2]}`
}

/** The model's direct answer leads an answer that also carries record facts or written record prose; the record prose
 * follows as context, then the model's other points. The lead is the model's first point; when the record opens with
 * an inquiry, it is the model's first point reporting that inquiry, if there is one. Lines that continue the lead from
 * the same source stay with it. The record's opening is said once: a model point restating it goes, unless it is the cited
 * lead, when the record sentence keeps only what it adds. A count or money question keeps its calculated record lead. Every
 * kept line moves with its citations. */
export function leadWithModelAnswer<T extends Record<string,unknown>>(payload:T,points:{answer?:unknown;citations?:unknown}|undefined,question=''):T {
  if(typeof payload.answer!=='string'||typeof points?.answer!=='string')return payload
  const answer=payload.answer,pointText=points.answer
  const chars=Array.from(answer),entries=Object.entries(payload.citations??{}) as [string,unknown][]
  const cites=(a:number,b:number)=>entries.filter(([,ranges])=>Array.isArray(ranges)&&ranges.some(r=>Array.isArray(r)&&r[0]<b&&r[1]>a)).map(([id])=>id)
  // Record facts and their coverage are cited as fact-N or coverage; the model's points cite passages, or nothing.
  const recordId=(id:string)=>/^(?:fact-\d+|coverage)(?:\/|$)/.test(id)
  // Lines of the composed answer, in code points. A line is the model's point when it cites only passages (the writer
  // may have worded a passage line itself) or, uncited, is one of the model's own lines; anything else is record prose.
  type Line={i:number;a:number;b:number;text:string;point:boolean;ids:string[]}
  const lines:Line[]=[]
  for(const m of answer.matchAll(/[^\n]+/g)){
    const text=m[0].trim();if(!text)continue
    const a=Array.from(answer.slice(0,m.index)).length+Array.from(m[0]).length-Array.from(m[0].trimStart()).length,b=a+Array.from(text).length,ids=cites(a,b)
    lines.push({i:lines.length,a,b,text,ids,point:ids.length?ids.every(id=>!recordId(id)):pointText.includes(text.replace(/^[-*]\s*/,''))})
  }
  const firstPoint=lines.findIndex(l=>l.point)
  // Nothing to lead past: no record prose before the points.
  if(firstPoint<=0)return payload
  const lastPoint=lines.length-1-[...lines].reverse().findIndex(l=>l.point)
  const record=lines.filter(l=>!l.point&&l.i<lastPoint),modelLines=lines.filter(l=>l.point)
  if(QUANTITATIVE_QUESTION.test(question)&&/\$?\d/.test(firstSentence(record[0].text)))return payload
  const sourcesOf=(l:Line)=>new Set(l.ids.map(id=>id.split('/')[0]))
  // The record's opening (an inquiry's dates and commissioner, a person's seat) is said once: a model point that
  // restates it goes when uncited or when the record sentence carries the citation; a cited lead keeps only what it adds.
  const recordOpening=firstSentence(record[0].text),recordCited=record[0].ids.length>0
  const inquiry=inquiryReference(subjectOf(recordOpening))
  const restating=new Set(modelLines.filter(l=>restatesOpening(firstSentence(l.text),recordOpening)||!!inquiry?.opens.test(firstSentence(l.text))))
  const candidates=modelLines.filter(l=>!restating.has(l)||l.ids.length>0)
  if(!candidates.length)return payload
  // The model's first point leads, unless the record opens with an inquiry: then the first of its points that reports
  // that inquiry (its findings, its report, its commissioner) leads, so another body's view never comes first.
  const lead=(inquiry&&candidates.find(l=>!restating.has(l)&&inquiry.mentions.test(l.text)))||candidates[0]
  let rewrite:string|null=null
  if(restating.has(lead)){const merged=mergedRestatement(firstSentence(lead.text),recordOpening);if(merged)rewrite=merged}
  const dropped=new Set([...restating].filter(l=>l!==lead&&(!l.ids.length||recordCited)))
  // Lines after the lead that continue it from the same source ("The same speech records…") stay with it.
  const block=[lead]
  for(let i=lead.i+1;i<lines.length;i++){const l=lines[i],own=sourcesOf(lead),next=sourcesOf(l);if(!l.point||!next.size||![...next].every(id=>own.has(id)))break;block.push(l)}
  const moved=new Set([...block,...dropped])
  // Record prose keeps its own line breaks where its lines were adjacent (a fact list stays a list); the points
  // around it are paragraphs. Record lines after the last point (coverage notes) stay last.
  const runs=(group:Line[])=>{const out:[number,number][]=[];let prev:Line|undefined;for(const l of group){if(prev&&prev.i===l.i-1&&out.length)out[out.length-1][1]=l.b;else out.push([l.a,l.b]);prev=l}return out}
  const pieces:[number,number][]=[[block[0].a,block[block.length-1].b],...runs(record),...modelLines.filter(l=>!moved.has(l)).map(l=>[l.a,l.b] as [number,number]),...runs(lines.filter(l=>!l.point&&l.i>lastPoint))]
  const citations:Record<string,[number,number][]>={}
  let written=''
  for(const [a,b] of pieces){
    if(written)written+='\n\n'
    const offset=Array.from(written).length
    written+=chars.slice(a,b).join('')
    for(const [id,ranges]of entries)if(Array.isArray(ranges))for(const range of ranges){
      if(!Array.isArray(range)||range.length!==2||!range.every(Number.isSafeInteger))continue
      const start=Math.max(a,range[0]),end=Math.min(b,range[1])
      if(start<end)(citations[id]??=[]).push([offset+start-a,offset+end-a])
    }
  }
  let out={...payload,answer:written,citations} as T
  if(rewrite){const merged=rewrite;let once=false;out=rewriteAnswerPayload(out,replace=>replace(new RegExp(recordOpening.replace(/[.*+?^${}()|[\]\\]/g,'\\$&'),'g'),match=>once?match:(once=true,merged)))}
  return out
}

/** "Who was responsible for …", "who is to blame for …", "who decided …": questions answered by findings first. */
export const ACCOUNTABILITY_QUESTION=/\bwho\b[^?]{0,40}?\b(?:(?:was|were|is|are)\s+(?:(?:most|ultimately|really|mainly|primarily|personally|held)\s+)?(?:responsible|accountable|culpable|at fault|to blame)|(?:to\s+)?blame[sd]?\b|decided|approved|authori[sz]ed|signed off|ordered|made the (?:decision|call))/i
// An official body as the subject of a finding: "The commission found …", "The NACC's Operation Myrtleford report
// found …", "The Royal Commission into X, led by Y, concluded …". The words before the verb never report a speaker.
const BODY=String.raw`(?:royal commission(?:er)?|commission(?:er)?|inquiry|committee|report|review|auditor-general|ANAO|ombudsman|court|NACC|IBAC|ICAC|CCC|tribunal|coroner|investigation)`
const FINDING=new RegExp(String.raw`^[^.;:]{0,140}?\b${BODY}(?:['’]s)?\b[^.;:]{0,100}?\b(?:found|finds|concluded|determined|ruled|described|held that|reported that|recorded that|criticised|rejected|made (?:adverse )?findings)\b`,'i')
const SPEAKER_VERB=/\b(?:told|said|says|claimed|claims|argued|alleged|accused|stated|asked|according to)\b/i
// A line that leans on the line before it cannot open the answer.
const ANAPHORIC=/^(?:The same|That|This|These|Those|It|Its|He|She|They|His|Her|Their|Also|However|But|And|In that|In the same|With respect)\b/
const OFFICIAL_RECORD=/\b(?:royal commission|commission|inquiry|committee|auditor-general|ombudsman|court|tribunal|coroner|report|review|investigation|department|minister|government)\b/i
type SourceRow={resource?:string;kind?:string;title?:string;coverage?:boolean}
// Facts about an inquiry rather than what it found: when it was set up, its dates, its commissioner, its counts.
const ABOUT_BODY=new RegExp(String.raw`^[^.;:]{0,60}?\b${BODY}\b`,'i')
const METADATA=/\b(?:established|Letters Patent|dated|final report|interim report|reported on|delivered|tabled|commissioners?|chaired|led by|recommendations|hearing transcripts?|hearings? (?:were|was) held)\b/i
const authorityTopic=(question:string)=>(question.toLowerCase().match(/\p{L}{4,}/gu)??[]).filter(w=>!/^(?:who|what|which|were|responsible|accountable|culpable|fault|blame[sd]?|decided|approved|authori[sz]ed|signed|ordered|made|decision|call|most|ultimately|really|mainly|primarily|personally|affair|scandal|scheme|the)$/.test(w)).map(w=>w.slice(0,6))
type SpokenSource=SourceRow&{speaker?:string;date?:string;chamber?:string}
/** An official body's finding stated as fact ("The NACC found two officials corrupt …") whose only support is one
 * member's speech is that member's claim: the line becomes "Avery Quinlan told the House on 4 March 2026 that the NACC
 * found …", with the speaker, chamber and date the cited passage records. Findings cited to the body's own record
 * (a royal commission report, a committee report, a court record) stay the body's findings. A line already naming the
 * speaker, or resting on several speakers or on a passage with no recorded speaker, is left as written. Only the
 * opening words change; every citation keeps its text. */
export function attributeSpokenFindings<T extends Record<string,unknown>>(payload:T,fixedPrefix=''):T {
  if(typeof payload.answer!=='string')return payload
  const answer=payload.answer,sources=(Array.isArray(payload.sources)?payload.sources:[]) as SpokenSource[]
  const entries=Object.entries(payload.citations??{}) as [string,unknown][]
  const sourceOf=(id:string)=>sources.find(s=>s.resource&&(id===s.resource||id.startsWith(s.resource+'/')))
  const edits:{at:number;word:string;replacement:string}[]=[]
  for(const m of answer.matchAll(/[^\n]+/g)){
    // A later duplicate may upgrade an already checked background point's citations.
    if(answer.startsWith(fixedPrefix)&&m.index!<fixedPrefix.length)continue
    const lead=/^[ \t]*(?:[-*•][ \t]+)?/.exec(m[0])![0],text=m[0].slice(lead.length).trimEnd()
    const found=FINDING.exec(text)
    if(!text||!found||SPEAKER_VERB.test(found[0]))continue
    const a=Array.from(answer.slice(0,m.index!+lead.length)).length,b=a+Array.from(text).length
    const cited=entries.filter(([,ranges])=>Array.isArray(ranges)&&ranges.some(r=>Array.isArray(r)&&r[0]<b&&r[1]>a)).map(([id])=>sourceOf(id))
    if(!cited.length||cited.some(s=>!s||s.kind!=='speech'))continue
    const speakers=[...new Set(cited.map(s=>s!.speaker?.trim()).filter(Boolean))]
    if(speakers.length!==1||cited.some(s=>!s!.speaker?.trim()))continue
    const speaker=speakers[0]!,surname=speaker.split(/\s+/).at(-1)!
    if(new RegExp(`(?<![\\p{L}])${surname.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')}(?![\\p{L}])`,'u').test(text))continue
    const dates=[...new Set(cited.map(s=>readableDate(s!.date)).filter(Boolean))],chambers=[...new Set(cited.map(s=>s!.chamber?.trim()).filter(Boolean))]
    const house=chambers.length===1?recordedChamber(chambers[0]!):undefined
    const where=!house?'':house.kind==='representatives'?' the House':house.kind==='senate'?' the Senate':house.house==='committee'?` a ${house.label}`:` the ${house.label}`
    const when=dates.length===1?` on ${dates[0]}`:''
    const word=/^\S+/.exec(text)![0],opening=/^(?:The|A|An|In|On|At|After|Before|During|When|Its|Their|Both|Two|Three|Four|Five|Six|Seven|Eight|Nine|Ten)$/.test(word)?word.toLowerCase():word
    edits.push({at:m.index!+lead.length,word,replacement:`${speaker} ${where?`told${where}`:'said'}${when} that ${opening}`})
  }
  if(!edits.length)return payload
  return rewriteAnswerPayload(payload,replace=>{
    for(const edit of edits.reverse())replace(new RegExp(`(?<=^[\\s\\S]{${edit.at}})${edit.word.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')}`,'g'),edit.replacement)
  })
}
/** For an accountability question, an answer opens on what an inquiry, court or official body found. When the first
 * line is a member's claim in debate, or a fact about the inquiry itself (its establishment, dates, commissioner or
 * counts), the first line that reports a finding moves to the front: one with the body as its subject ("The commission
 * found …") first, else a member reporting the body's finding ("X told the House the royal commission concluded …").
 * With no finding held, a member's claim gives way to an official record or a release, as before, and a metadata
 * line stays. Every other line keeps its place; nothing is removed or reworded, and any other lead stays. */
export function leadWithAuthority<T extends Record<string,unknown>>(payload:T,question='',fixedPrefix=''):T {
  if(typeof payload.answer!=='string'||!ACCOUNTABILITY_QUESTION.test(question))return payload
  if(fixedPrefix&&payload.answer.startsWith(fixedPrefix))return payload
  const sources=(Array.isArray(payload.sources)?payload.sources:[]) as SourceRow[]
  const entries=Object.entries(payload.citations??{}) as [string,unknown][]
  const sourceOf=(id:string)=>sources.find(s=>s.resource&&(id===s.resource||id.startsWith(s.resource+'/')))
  const answer=payload.answer
  type Line={a:number;b:number;text:string;sources:SourceRow[];ids:string[]}
  const lines:Line[]=[]
  for(const m of answer.matchAll(/[^\n]+/g)){
    const text=m[0].trim();if(!text)continue
    const a=Array.from(answer.slice(0,m.index)).length+Array.from(m[0]).length-Array.from(m[0].trimStart()).length,b=a+Array.from(text).length
    const ids=entries.filter(([,ranges])=>Array.isArray(ranges)&&ranges.some(r=>Array.isArray(r)&&r[0]<b&&r[1]>a)).map(([id])=>id)
    lines.push({a,b,text,ids,sources:ids.map(sourceOf).filter((s):s is SourceRow=>!!s)})
  }
  const speechOnly=(l:Line)=>l.sources.length>0&&l.sources.every(s=>s.kind==='speech')
  const finding=(l:Line)=>{const m=FINDING.exec(l.text);return !!m&&!SPEAKER_VERB.test(m[0])}
  // A member reporting the body's finding: the finding verb follows the body, after a speaker's verb.
  const relayed=(l:Line)=>{const m=FINDING.exec(l.text);return !!m&&SPEAKER_VERB.test(m[0])}
  // A member's claim: a line resting only on debate passages, or one that opens on a named person telling a chamber.
  const memberClaim=(l:Line)=>!finding(l)&&(speechOnly(l)||/^(?:\p{Lu}[\p{L}’'-]+\s+){1,3}(?:told|said|claimed|argued|alleged|accused)\b/u.test(l.text))
  const coverageOnly=(l:Line)=>l.ids.length>0&&l.ids.every(id=>/^coverage(?:-|\/|$)/.test(id)||sourceOf(id)?.coverage)
  const official=(l:Line)=>l.sources.some(s=>s.kind==='press_release'||s.kind==='record'&&!s.coverage&&OFFICIAL_RECORD.test(s.title??''))
  // A fact about the inquiry itself, cited to records only.
  const metadata=(l:Line)=>!finding(l)&&!relayed(l)&&l.sources.every(s=>s.kind!=='speech')&&!memberClaim(l)&&ABOUT_BODY.test(l.text)&&METADATA.test(l.text)
  // A line that can open the answer: not a coverage note, not leaning on the line before.
  const placed=(l:Line)=>!coverageOnly(l)&&!ANAPHORIC.test(l.text)
  // A finding about what was asked ("robodebt") comes before one about something else (another body's referral).
  const topic=authorityTopic(question)
  const onTopic=(l:Line)=>topic.some(w=>l.text.toLowerCase().includes(w))
  const best=(test:(l:Line)=>boolean)=>lines.find(l=>placed(l)&&test(l)&&onTopic(l))??lines.find(l=>placed(l)&&test(l))
  const first=lines[0]
  let lead:Line|undefined
  if(first&&(memberClaim(first)||metadata(first))){
    lead=best(finding)
    if(!lead&&!relayed(first))lead=best(relayed)
    if(!lead&&memberClaim(first))lead=lines.find(l=>placed(l)&&!memberClaim(l)&&official(l))
  }
  if(!lead||lead===first)return payload
  // The chosen line goes first; the rest keep their order. A paragraph answer stays paragraphs, a list stays a list.
  const chars=Array.from(answer),sep=lines.slice(1).some((l,i)=>chars.slice(lines[i].b,l.a).filter(c=>c==='\n').length>1)?'\n\n':'\n'
  const order=[lead,...lines.filter(l=>l!==lead)],pieces:[number,number,string][]=order.map((l,i)=>[l.a,l.b,i<order.length-1?sep:''])
  const citations:Record<string,[number,number][]>={}
  let written=''
  for(const [a,b,after] of pieces){
    const offset=Array.from(written).length
    written+=chars.slice(a,b).join('')+after
    for(const [id,ranges]of entries)if(Array.isArray(ranges))for(const range of ranges){
      if(!Array.isArray(range)||range.length!==2||!range.every(Number.isSafeInteger))continue
      const start=Math.max(a,range[0]),end=Math.min(b,range[1])
      if(start<end)(citations[id]??=[]).push([offset+start-a,offset+end-a])
    }
  }
  return {...payload,answer:written,citations}
}

/** Whether a later finding can still displace this lead. Shared with the incremental response boundary. */
export function authorityLeadMayMove(payload:{answer?:unknown;sources?:unknown;citations?:unknown}):boolean {
  const text=String(payload.answer??'').split('\n').find(line=>line.trim())?.trim()??''
  const finding=FINDING.exec(text)
  if(finding&&!SPEAKER_VERB.test(finding[0]))return false
  const sources=(payload.sources??[]) as SourceRow[],entries=Object.entries(payload.citations??{}) as [string,unknown][]
  const end=Array.from(text).length
  const cited=entries.filter(([,ranges])=>Array.isArray(ranges)&&ranges.some(r=>Array.isArray(r)&&r[0]<end)).flatMap(([id])=>sources.filter(s=>s.resource&&(id===s.resource||id.startsWith(s.resource+'/'))))
  return cited.length>0&&cited.every(s=>s.kind==='speech') || /^(?:\p{Lu}[\p{L}’'-]+\s+){1,3}(?:told|said|claimed|argued|alleged|accused)\b/u.test(text) || ABOUT_BODY.test(text)&&METADATA.test(text)
}

/** Once the first on-topic finding has arrived, later lines cannot outrank it. Earlier context stays in the tail. */
export function settledAuthorityFinding(payload:Record<string,unknown>,question:string):boolean {
  const first=String(payload.answer??'').split('\n').find(line=>line.trim())?.trim()??''
  return authorityFindingLead(payload)&&authorityTopic(question).some(word=>first.toLowerCase().includes(word))
}
export function authorityFindingLead(payload:Record<string,unknown>):boolean {
  const first=String(payload.answer??'').split('\n').find(line=>line.trim())?.trim()??''
  const finding=FINDING.exec(first)
  return !!finding&&!SPEAKER_VERB.test(finding[0])
}
