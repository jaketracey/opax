import {auditPayload,sentenceParts,moneySentenceEdits,quotationSpans,unclosedQuoteOffset} from './research-claim-audit.mjs'
import {plainAnswerPayload,rewriteAnswerPayload} from './research-language'
import {ACCOUNTABILITY_QUESTION,attributeSpokenFindings,leadWithFinding} from './research-answer-shape'
import {citationHasSentence,protectedDecision} from './research-coherence.mjs'
import type {WritingInput} from './research-writing'
import type {QualitativeAnswer} from './research-types'
import {sentenceFragment} from './research-claims'
import {passageExcerpt} from './research-evidence'
import {isBillSpeechQuestion} from './ask-scope-intent'
import {readableDate} from './tools/record-common'
import {researchTrace} from './research-trace'
import {repairQuotes,MACHINE_LABELS,EMPTY_WORDS,holdsQuotation,looseQuotationOf,NO_SUPPORTED_ANSWER} from './research-evidence'
import {TRANSCRIPT_LABEL,transcriptTurns} from './transcript-answer'
export {NO_SUPPORTED_ANSWER}
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
export function groundAnswerPayload(payload:Record<string,unknown>,question:string,fixedPrefix='',partial=false):Record<string,unknown> {
  // Recovery runs every normal shape check. A necessary correction uses retry, never a prefix exemption.
  if((payload.research as {answer_stats?:{salvaged?:unknown}}|undefined)?.answer_stats?.salvaged)fixedPrefix=''
  let out=withoutMachineLabels(plainAnswerPayload(payload))
  const audit=auditPayload(question,out)
  researchTrace('grounding.audit',{question,counts:audit.counts,findings:audit.findings})
  const edits=moneySentenceEdits(out)
  if(edits.length)researchTrace('grounding.money',{question,edits})
  out=rewriteAnswerPayload(out,replace=>{
    for(const edit of edits)replace(new RegExp(`(?<=^[\\s\\S]{${edit.at}})[\\s\\S]{${edit.text.length}}`,'g'),edit.replacement)
    if(edits.some(edit=>!edit.replacement))replace(/[ \t]{2,}/g,' ')
  })
  out=withCheckedQuotes(out,partial)
  // A typed limitation, refusal or clarification (a lookup correction, a scope decline) keeps its own order.
  // The who shape selects supported subjects first; its authority fallback handles unnamed findings.
  // A body's finding cited only to one member's speech is that member's claim, and says so (ASK_ATTRIBUTION_RULE).
  out=attributeSpokenFindings(out)
  // The research loop's own point answer keeps the order the model wrote: its instructions put the direct answer first,
  // and moving a later finding ahead of it would reorder model prose (and move text a stream had already shown). A
  // written record answer (pre_writer_sources) keeps its lead shaping.
  const origin=payload.research as {mode?:string;pre_writer_sources?:unknown}|undefined
  const loopPoints=origin?.mode==='loop'&&!origin.pre_writer_sources
  out=distinctSummary(cleanAnswerShape(protectedDecision(out)||ACCOUNTABILITY_QUESTION.test(question)||loopPoints?out:leadWithFinding(leadWithFinding(out,undefined,fixedPrefix),question,fixedPrefix)))
  // The who lead has no released-prefix exemption: the stream releases a who answer only once this lead is decided
  // (research-sentence-stream.ts), and a final order that would still move released text takes the response's retry
  // path rather than keeping a lead this order would not choose. A checked prefix records whether its lead is a sentence
  // the answer already holds (kept or moved) or new text (a recovered source sentence, a rewrite or the "do not name"
  // line), which a later point can still change.
  if(!protectedDecision(out)){
    const written=partial&&ACCOUNTABILITY_QUESTION.test(question)?sentenceParts(String(out.answer??'')).map(p=>p.text):undefined
    out=leadWithWho(out,question)
    if(written){const lead=sentenceParts(String(out.answer??''))[0]?.text;out={...out,research:{...(out.research as object|undefined),who_lead_written:!!lead&&written.includes(lead)}}}
  }
  if(!partial)out=completePersonOverview(payload,out,question)
  const research=out.research&&typeof out.research==='object'?out.research as Record<string,unknown>:undefined
  return {...out,...(research?{research:{...research,claim_audit:audit.counts}}:{})}
}
/** An answer with the model's echoed input labels taken out (research-evidence.ts MACHINE_LABELS), citations kept in
 * step. A sentence that held a label and is left with no word that says anything ("See also and.") goes whole. For
 * every answer on its way out, whichever engine wrote it. */
export function withoutMachineLabels<T extends Record<string,unknown>>(payload:T):T {
  const text=typeof payload.answer==='string'?payload.answer:''
  if(!/\bfact ids?\b|\[facts? \d|\bfact-\d+\//i.test(text))return payload
  const labelled=(part:string)=>MACHINE_LABELS.some(label=>{label.lastIndex=0;return label.test(part)})
  const bare=(part:string)=>MACHINE_LABELS.reduce((rest,label)=>rest.replace(label,''),part)
  const cleaned=(dropEmpty:boolean)=>rewriteAnswerPayload(payload,replace=>{
    if(dropEmpty)for(const part of sentenceParts(text).reverse()){
      if(!labelled(part.text))continue
      const words=bare(part.text).match(/[\p{L}\p{N}]+/gu)??[]
      if(words.every(word=>EMPTY_WORDS.test(word))){
        const line=text.lastIndexOf('\n',part.at-1)+1,led=/^\s*(?:[-*]\s*)?$/.test(text.slice(line,part.at))
        let start=led?line:part.at,end=part.at+part.text.length
        while(text[end]===' '||text[end]==='\t')end++
        if(led&&text[end]==='\n')end++
        else if(!led&&(end===text.length||text[end]==='\n'))while(start>line&&/[ \t]/.test(text[start-1]))start--
        replace(new RegExp(`(?<=^[\\s\\S]{${start}})[\\s\\S]{${end-start}}`,'g'),'')
      }
    }
    for(const label of MACHINE_LABELS)replace(label,'')
    replace(/ +[.,;:]/g,found=>found.trim());replace(/\n{3,}/g,'\n\n');replace(/\s+$/g,'')
  })
  // Never an empty answer: if dropping such sentences would leave nothing, only the labels go.
  const out=cleaned(true)
  return /[\p{L}\p{N}]/u.test(String(out.answer??''))?out:cleaned(false)
}
/** A source row that is a hearing transcript's text. A listing or count row carries the label and holds no evidence. */
const hearingTranscript=(s:SelectedSource)=>(s as {kind?:unknown}).kind!=='count'&&`${String(s.snippet??'')} ${String((s as {title?:unknown}).title??'')}`.includes(TRANSCRIPT_LABEL)
/** The words of the hearing transcript excerpts among some source rows: only what the transcript prints, not the row's
 * header, date or label. */
const excerptWords=(rows:SelectedSource[])=>rows.filter(hearingTranscript).flatMap(s=>[s.snippet,(s as {title?:unknown}).title]).flatMap(v=>String(v??'').split('\n')).flatMap(line=>transcriptTurns(line).map(turn=>turn.excerpt)).join('\n')
/** Quotation marks that do not pair ("... ”, or “ ... " with no closing curly mark before the paragraph ends) are
 * read as a pair, so one stray mark does not make the rest of the answer one sentence. Same length as the text. */
function pairedMarks(text:string):string {
  const out=text.split('')
  for(let i=0;i<out.length;i++){
    if(out[i]!=='"'&&out[i]!=='“')continue
    const stop=(()=>{const end=text.indexOf('\n\n',i);return end<0?text.length:end})()
    if(out[i]==='"'){
      const straight=text.indexOf('"',i+1),curly=text.indexOf('”',i+1)
      if(curly>=0&&curly<stop&&(straight<0||curly<straight)){out[i]='“';i=curly;continue}
      if(straight>=0)i=straight
      continue
    }
    const curly=text.indexOf('”',i+1)
    if(curly>=0&&curly<stop){i=curly;continue}
    const straight=text.indexOf('"',i+1)
    if(straight>=0&&straight<stop){out[straight]='”';i=straight}
  }
  return out.join('')
}
/** The final check on quotations, for every answer on its way out (written, the research model's own, salvaged, and
 * each streamed preview before it is shown).
 * - A sentence that cites a hearing transcript and holds a quotation its cited sources do not hold word for word, or a
 *   quotation mark that is never closed, is removed, words and all. Taking only the marks off would leave the words,
 *   and any name in them, standing as the answer's own prose. Every form of quotation is read (quotationSpans: single
 *   marks around an apostrophe, a quotation over a line break, marks inside marks). A sentence citing a transcript
 *   and another record is checked this way too.
 * - A sentence that cites no hearing transcript (it cites nothing, or another record) is removed only when a
 *   quotation it holds fails against what it is checked with AND shares a run of five or more words with a hearing
 *   transcript excerpt held for this answer: a loose quotation of the hearing under another citation or none. The
 *   excerpts are those of the answer's sources and of the facts given to the writer (research.pre_writer_sources),
 *   a set that is fixed for the run, so a sentence shown in a stream is never removed later because a later sentence
 *   added a source.
 * - Anything else keeps the rule of 13 November 2026, exactly as on main: quoted words stay quoted only when a source
 *   the sentence cites (or, for an uncited sentence, any source of the answer) holds them verbatim; otherwise the
 *   marks come off and the words stand as paraphrase. Hansard, committee Hansard and every other record are here.
 * If nothing is left, the answer is the fixed line NO_SUPPORTED_ANSWER, as a limitation with nothing cited; a streamed
 * preview is left empty instead, so the fixed line is never shown and then replaced. */
function withCheckedQuotes(payload:Record<string,unknown>,partial=false):Record<string,unknown> {
  const text=String(payload.answer??''),sources=(Array.isArray(payload.sources)?payload.sources:[]) as SelectedSource[]
  const given=(payload.research as {pre_writer_sources?:unknown}|undefined)?.pre_writer_sources
  const heard=excerptWords([...sources,...(Array.isArray(given)?given as SelectedSource[]:[])])
  // With no hearing transcript in play nothing here differs from main: the text is read as it stands.
  const hearing=!!heard||sources.some(hearingTranscript)
  const read=hearing?pairedMarks(text):text
  let removed=0
  const out=rewriteAnswerPayload(payload,replace=>{
    for(const part of sentenceParts(read).reverse()){
      // A mark that is never closed makes the rest of the answer one part: only its own line is judged.
      const open=hearing&&unclosedQuoteOffset(part.text)>=0,cut=open?part.text.indexOf('\n'):-1
      const sentence=cut>=0?part.text.slice(0,cut).trimEnd():part.text
      const from=Array.from(text.slice(0,part.at)).length,until=from+Array.from(sentence).length
      const ids=Object.entries(payload.citations??{}).filter(([,ranges])=>Array.isArray(ranges)&&ranges.some(r=>Array.isArray(r)&&r[0]<until&&r[1]>from)).map(([id])=>id)
      const cited=sources.filter(s=>ids.some(id=>id===s.resource||id.startsWith(s.resource+'/')))
      const against=cited.length?cited:sources
      const evidence=against.map(s=>String(s.snippet??'')).join('\n')
      // The title is read for a transcript row only: its header can hold the quoted words (a commission's name).
      const held=evidence+'\n'+against.filter(hearingTranscript).map(s=>String((s as {title?:unknown}).title??'')).join('\n')
      // A transcript's own words often hold quotation marks (reported speech), paired or not. So the whole stretch
      // from the sentence's first opening mark to its last closing mark (to the sentence's end when none closes it)
      // is read first: when what the sentence cites holds that stretch word for word, the quotation is verbatim, and
      // the marks inside it are the source's. The sentence is kept as it stands.
      const opens=sentence.search(/["“‘]/),closes=Math.max(sentence.lastIndexOf('"'),sentence.lastIndexOf('”'),sentence.lastIndexOf('’'))
      const stretch=opens<0?'':sentence.slice(opens+1,closes>opens?closes:sentence.length)
      if(hearing&&cited.some(hearingTranscript)&&/[\p{L}\p{N}]/u.test(stretch)&&holdsQuotation(stretch,held))continue
      const failed=quotationSpans(sentence).map(q=>q.value).filter(inner=>/[\p{L}\p{N}]/u.test(inner)&&!holdsQuotation(inner,held))
      const goes=!hearing?false:cited.some(hearingTranscript)?failed.length>0||open:!!heard&&failed.some(inner=>looseQuotationOf(inner,heard))
      if(goes){
        // The sentence goes with the list marker and spacing that led it, and its line when it was alone on one.
        const line=text.lastIndexOf('\n',part.at-1)+1,led=/^\s*(?:[-*]\s*)?$/.test(text.slice(line,part.at))
        let start=led?line:part.at,end=part.at+sentence.length
        while(text[end]===' '||text[end]==='\t')end++
        if(led&&text[end]==='\n')end++
        else if(!led&&(end===text.length||text[end]==='\n'))while(start>line&&/[ \t]/.test(text[start-1]))start--
        replace(new RegExp(`(?<=^[\\s\\S]{${start}})[\\s\\S]{${end-start}}`,'g'),'')
        removed++
        continue
      }
      const original=text.slice(part.at,part.at+part.text.length)
      const checked=repairQuotes(original,evidence,()=>{})
      if(checked!==original)replace(new RegExp(`(?<=^[\\s\\S]{${part.at}})[\\s\\S]{${part.text.length}}`,'g'),checked)
    }
  })
  if(!removed)return out
  researchTrace('grounding.transcript_quote_removed',{removed})
  // Removing the line of a mark that was never closed can free the sentences after it: they are checked in their turn.
  const again=(next:Record<string,unknown>)=>unclosedQuoteOffset(read)>=0&&String(next.answer??'')!==text?withCheckedQuotes(next,partial):next
  // Blank lines and trailing space left where a sentence stood are closed up, with the citations kept in step.
  if(/[\p{L}\p{N}]/u.test(String(out.answer??'')))return again(rewriteAnswerPayload(out,replace=>{replace(/\n{3,}/g,'\n\n');replace(/\s+$/g,'')}))
  const uncited=sources.map(s=>(s as {cited?:unknown}).cited===true?{...s,cited:false}:s)
  // A preview with nothing left shows nothing yet.
  if(partial)return {...out,answer:'',citations:{},sources:uncited}
  // Nothing is left: the fixed line, written by code, as a limitation with nothing cited. Never an empty answer, and no
  // second attempt into the same shape.
  return {...out,answer:NO_SUPPORTED_ANSWER,answer_decision:'limitation',machine_written:false,citations:{},sources:uncited}
}
