import {trimQuestionEnd, questionSpaces} from './question-text.mjs'
import type { RecordQuestion } from './ask-records'
import { receiptPeriodQuery } from './receipt-period'
import { latestReceiptYear, readReceiptPeriod, type PeriodOption } from './receipt-reading'
import { receiptAnswer, receiptDonorChoices, unmatchedReceiptRankingScope, type ReceiptGraph } from './voice-money'

export const fundingContinuation = (question:string) => /^(?:and\b|what about\b|how about\b)/i.test(question.trim())
export const fundingUserTurns = (input:RecordQuestion) => Array.isArray(input.context)
  ? input.context.filter(t => (t?.author === 'user' || t?.author === 'question') && typeof t.text === 'string')
    .slice(-12).map(t => t.text!.slice(0,2000)) : []

export type FundingSelection = {
  party?:string; industry?:string; donor?:string
  compareParties?:[string,string]
  from:number|null; to:number|null; mode:'donors'|'parties'|'connections'
}
type Clarification = {money_question?:string; answer:string; answer_status:'needs_scope'; money_ranking:true; citations:Record<string,never>; sources:never[]}
const normalName = (s:string) => s.toLowerCase().replace(/[^a-z0-9]+/g,' ').trim()
const clarify = (answer:string):Clarification =>
  ({answer,answer_status:'needs_scope',money_ranking:true,citations:{},sources:[]})
/** A resolved request plus the reading taken and the other readings to offer. */
export type ReadQuestion = {question:string; reading?:string; options?:{label:string;question:string}[]}
// Only a date correction may carry the previous selection through clarification.
const periodOnly = (fragment:string) => !fragment.replace(/\b(?:and|in|during|for|the|since|from|before|after|until|through|between|to|of|financial|fiscal|fy|year|years|ending|ended|last|past|recent|recently|latest|this|decade|january|february|march|april|may|june|july|august|september|october|november|december)\b/gi,'').replace(/[\d\s–—.,/\-]+/g,'')
const comparisonPeriodOnly = (fragment:string) => periodOnly(receiptPeriodQuery(fragment).query.replace(/‑/g,'-').replace(/\b(?:all|time|lifetime|over|calendar|quarter)\b/gi,''))
// Both initial answers and history reconstruction must reject a separate or
// unspecified time baseline before treating a comparison as one shared period.
export const samePeriodFundingComparison = (query:string) =>
  !/\b(?:increase\w*|decrease\w*|growth|change\w*|than (?:before|after|in)|compared (?:with|to) (?:19|20)\d{2})\b/i.test(query) &&
  !/\b(?:19|20)\d{2}\s+(?:vs|versus)\s+(?:19|20)\d{2}\b/i.test(query) &&
  [...query.matchAll(/\bin\s+(?:19|20)\d{2}\b/gi)].length<=1
const unknown = () => clarify('Please name one donor, industry or recipient party from the [money map](https://opax.com.au/money), and the financial year if you want to change it. I could not resolve the whole follow-up, so I have not calculated a partial total.')

export function fundingScopeQuestion(s:FundingSelection,jurisdiction:string):string {
  const stem=s.party ? 'Who has the most disclosed receipts' : s.mode==='donors' ? 'Who are the top donors by disclosed receipts' : s.mode==='connections' ? 'Which source has the largest disclosed receipts to which party' : 'Who receives the most disclosed receipts'
  const donor=s.donor || (s.industry ? s.industry.replaceAll('_',' ')+' donors' : '')
  // An open start is written as a labelled financial year so it reads back as that year.
  const period=s.from===s.to&&s.from!==null?` in ${s.from}`:s.from!==null&&s.to!==null?` from ${s.from} to ${s.to}`:s.from!==null?` since ${s.from}–${String(s.from+1).slice(-2)}`:s.to!==null?` through ${s.to}`:''
  const region=({federal:'federal',qld:'Queensland',vic:'Victoria',tas:'Tasmania'} as Record<string,string>)[jurisdiction]
  if(s.compareParties) return `Who receives more disclosed receipts${donor?' from '+donor:''}, ${s.compareParties.join(' or ')}${region?' in '+region+' records':''}${period}?`
  return `${stem}${s.party?' to '+s.party:''}${donor?' from '+donor:''}${!s.party&&!donor?' in all receipts':''}${region?' in '+region+' records':''}${period}?`
}

/** A partial organisation name is read as the matching organisation with the
 * most disclosed receipts. Each choice replaces only the unresolved phrase and
 * validates the whole resulting request, including current controls; the
 * other matches come back as one-tap options. A comparison, or a question that
 * names several organisations, keeps its own wording with the name replaced,
 * because the one-organisation ranking question cannot carry it. A second
 * organisation counts only when the question lists it (`several`). Words in
 * `pending` (another short name still to be read) may remain unresolved. */
export function fundingNameChoice(graph:ReceiptGraph,fragment:string,jurisdiction:string,questionFor:(label:string)=>string,filters:RecordQuestion,shown=fragment,read:{keep?:boolean;pending?:string;several?:boolean}={}):ReadQuestion|null {
  const pending=new Set((read.pending??'').toLowerCase().split(/\s+/).filter(Boolean))
  const choices=receiptDonorChoices(graph,fragment).flatMap(node=>{
    const question=questionFor(node.label)
    const result=receiptAnswer(graph,question,jurisdiction,'https://opax.com.au',filters)
    if(!result || 'needs_scope' in result || result.selected_industries.length>1 || !result.selected_donors.includes(node.label))return []
    if(result.selected_donors.length>1&&!read.several)return []
    // Another selected name inside the chosen one is part of it, not a second organisation.
    const label=normalName(node.label)
    if(result.selected_donors.some(other=>other!==node.label&&` ${label} `.includes(` ${normalName(other)} `)))return []
    const keep=read.keep||result.selected_donors.length>1||pending.size>0
    if(!read.keep&&result.selected_parties.length>1)return []
    if(unmatchedReceiptRankingScope(graph,receiptPeriodQuery(question).query,result,filters.party).split(' ').some(word=>word&&!pending.has(word)))return []
    const canonical=keep?question:fundingScopeQuestion({party:result.selected_parties[0],donor:result.selected_donors[0],...result.requested_years,mode:result.selected_parties.length?'donors':'parties'},jurisdiction)
    return [{label:node.label.replace(/[\[\]\n\r*]/g,' ').replace(/\s+/g,' ').trim(),question:canonical,total:result.total_aud}]
  }).sort((a,b)=>b.total-a.total||a.label.localeCompare(b.label,'en-AU'))
  if(!choices.length)return null
  const [best,...others]=choices
  const said=shown.replace(/[\[\]\n\r*]/g,' ').replace(/\s+/g,' ').trim()
  const reading=others.length?`“${said}” matches ${choices.length} organisations in this map; this answer is for ${best.label}, the one with the most disclosed receipts.`
    :`Reading “${said}” as ${best.label}.`
  return {question:best.question,reading,options:others.map(({label,question})=>({label,question}))}
}

/** Offer each period option as a complete question for the same selection. */
export function periodChoices(selected:FundingSelection,options:PeriodOption[],jurisdiction:string) {
  return options.map(option=>({label:option.label,question:fundingScopeQuestion({...selected,from:option.from,to:option.to},jurisdiction)}))
}

/** Reconstruct scope from user questions only. Answers and client amounts are
 * never used. Explicit controls are applied later by the receipt calculator. */
export function fundingFollowUp(input:RecordQuestion,graph:ReceiptGraph,jurisdiction:string,isRanking:(input:RecordQuestion)=>boolean): ReadQuestion|Clarification|null {
  let selected:FundingSelection|undefined
  const latest=latestReceiptYear(graph)
  const turns=[...fundingUserTurns(input),input.question||'']
  for(let i=0;i<turns.length;i++) {
    const original=turns[i], last=i===turns.length-1
    if(isRanking({question:original})) {
      const result=receiptAnswer(graph,original,jurisdiction,'https://opax.com.au')
      // A same-period, two-party comparison may change its dates without
      // discarding either party. Other comparison shapes keep their own rules.
      const pair=result && !('needs_scope' in result) && !('needs_period' in result) &&
        result.selected_parties.length===2 && result.selected_industries.length<=1 &&
        (result.selected_industries.length>0 || result.selected_donors.length<=1) &&
        /\b(?:compare|more|less|higher|lower|versus|vs)\b/i.test(original) &&
        samePeriodFundingComparison(receiptPeriodQuery(original).query) &&
        !/\b(?:change\w*|increase\w*|decrease\w*|growth|grew|rose|fell)\b/i.test(original)
      if(!result || 'needs_scope' in result ||
        (!pair && result.selected_parties.length>1) || result.selected_industries.length>1 ||
        (!result.selected_industries.length&&result.selected_donors.length>1) ||
        unmatchedReceiptRankingScope(graph,receiptPeriodQuery(original).query,result) ||
        (!pair && /\b(?:compare|more|less|higher|lower|versus|vs|change\w*|increase\w*|decrease\w*)\b/i.test(original))) {
        selected=undefined
        continue
      }
      const donorIntent=!/\b(?:receiv\w*|takes?|gets?)\b/i.test(original) &&
        (/\b(?:biggest|largest|top)\b[^?.]{0,60}\bdonors?\b/i.test(original) || (/^who\s+donat\w*\b/i.test(original)&&!/\bto who(?:m)?\b/i.test(original)))
      selected={...(pair?{compareParties:result.selected_parties as [string,string]}:{party:result.selected_parties[0]}),industry:result.selected_industries[0],
        donor:result.selected_industries.length?undefined:result.selected_donors[0],
        ...result.requested_years,mode:result.selected_parties.length||donorIntent?'donors':result.selected_industries.length||result.selected_donors.length?'parties':'connections'}
      continue
    }
    if(!selected || !fundingContinuation(original)) { selected=undefined;continue }
    let fragment=trimQuestionEnd(questionSpaces(original).replace(/^(?:and )?(?:(?:what|how) about )/i,'').replace(/^and /i,''),'?').replace(/ please$/i,'').trim()
    // This bounded continuation changes only a shared period, never one side
    // of a pair or an unrecognised qualifier.
    if(selected.compareParties && !comparisonPeriodOnly(fragment)) { selected=undefined;continue }
    // Questions about speech, influence, grants, etc. return to ordinary Ask.
    if(!isRanking({question:`Who gets the most funding from ${fragment}`})) { selected=undefined;continue }
    // The follow-up's period is read the same way as a whole question's.
    const read=readReceiptPeriod(fragment,latest,{compare:!!selected.compareParties})
    let reading=read.reading,periodOptions=read.options
    let normalized=receiptPeriodQuery(read.query)
    let changed=false
    if(normalized.error) {
      // A period these records cannot place: keep the selection across all years and say so.
      if(!(selected.compareParties?comparisonPeriodOnly(fragment):periodOnly(fragment))) { selected=undefined;continue }
      normalized={query:''}
      selected={...selected,from:null,to:null};changed=true
      reading='Reading this across all published financial years, because these records are grouped by financial year.'
      periodOptions=[]
    }
    fragment=normalized.query.trim()
    if(/\b(?:all years|all time|lifetime)\b$/i.test(fragment)) {
      fragment=fragment.replace(/(?:\b(?:in|over|for)\s+)?\b(?:all years|all time|lifetime)\b$/i,'').trim()
      selected={...selected,from:null,to:null};changed=true
    } else {
      const period=/(?:\b(?:in|during|since|from|before|after|until|through|between)\s+(?:the\s+)?)?\b(?:19|20)\d{2}(?:\s+(?:to|through|until|and)\s+(?:19|20)\d{2})?$/i.exec(fragment)
      if(period) {
        const parsed=receiptAnswer(graph,`Who receives the most money from all receipts ${period[0].replace(/\bthe\s+/gi,'')}`,jurisdiction,'https://opax.com.au')
        if(!parsed || 'needs_scope' in parsed) { selected=undefined;continue }
        reading??=parsed.period_reading;if(!periodOptions.length)periodOptions=parsed.period_options
        selected={...selected,...parsed.requested_years};fragment=fragment.slice(0,period.index).trim();changed=true
      }
    }
    if(fragment) {
      if(selected.compareParties) { selected=undefined;continue }
      const name=fragment.replace(/^(?:from|to|for)\s+/i,'').replace(/^the\s+/i,'')
      if(/^(?:all (?:donors|industries|sectors))$/i.test(name)) { selected={...selected,donor:undefined,industry:undefined};changed=true }
      else if(/^all (?:parties|recipients)$/i.test(name)) { selected={...selected,party:undefined,mode:'parties'};changed=true }
      else {
        const query=`Who has the most disclosed receipts to ${name}`
        const match=receiptAnswer(graph,query,jurisdiction,'https://opax.com.au')
        if(!match || 'needs_scope' in match || unmatchedReceiptRankingScope(graph,query,match) ||
          match.selected_parties.length>1 || match.selected_industries.length>1 ||
          (!match.selected_industries.length&&match.selected_donors.length>1) ||
          (!match.selected_parties.length&&!match.selected_industries.length&&!match.selected_donors.length)) {
          if(last)return fundingNameChoice(graph,name,jurisdiction,label=>fundingScopeQuestion({...selected!,donor:label,industry:undefined},jurisdiction),input) || (match&&'needs_scope' in match?clarify(match.answer):unknown())
          selected=undefined;continue
        }
        if(match.selected_parties.length) selected={...selected,party:match.selected_parties[0],mode:'donors'}
        if(match.selected_industries.length) selected={...selected,industry:match.selected_industries[0],donor:undefined}
        else if(match.selected_donors.length) selected={...selected,donor:match.selected_donors[0],industry:undefined}
        changed=true
      }
    }
    if(last) return changed?{question:fundingScopeQuestion(selected,jurisdiction),...(reading?{reading,options:periodChoices(selected,periodOptions,jurisdiction)}:{})}:unknown()
  }
  return null
}
