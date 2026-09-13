import type { RecordQuestion } from './ask-records'
import { receiptPeriodQuery } from './receipt-period'
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
type Clarification = {money_question?:string; answer:string; answer_status:'needs_scope'|'needs_period'; money_ranking:true; citations:Record<string,never>; sources:never[]}
const clarify = (answer:string, answer_status:Clarification['answer_status']='needs_scope'):Clarification =>
  ({answer,answer_status,money_ranking:true,citations:{},sources:[]})
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
  const stem=s.party || s.mode==='donors' ? 'Who donates the most' : s.mode==='connections' ? 'Who donates the most to whom' : 'Who receives the most funding'
  const donor=s.donor || (s.industry ? s.industry.replaceAll('_',' ')+' donors' : '')
  const period=s.from===s.to&&s.from!==null?` in ${s.from}`:s.from!==null&&s.to!==null?` from ${s.from} to ${s.to}`:s.from!==null?` since ${s.from}`:s.to!==null?` through ${s.to}`:''
  const region=({federal:'federal',qld:'Queensland',vic:'Victoria',tas:'Tasmania'} as Record<string,string>)[jurisdiction]
  if(s.compareParties) return `Who gets more funding${donor?' from '+donor:''}, ${s.compareParties.join(' or ')}${region?' in '+region+' records':''}${period}?`
  return `${stem}${s.party?' to '+s.party:''}${donor?' from '+donor:''}${!s.party&&!donor?' in all receipts':''}${region?' in '+region+' records':''}${period}?`
}

/** A choice replaces only the unresolved donor phrase and validates the whole
 * resulting request, including current controls, before offering a link. */
export function fundingNameChoice(graph:ReceiptGraph,fragment:string,jurisdiction:string,questionFor:(label:string)=>string,filters:RecordQuestion):Clarification|null {
  const choices=receiptDonorChoices(graph,fragment).flatMap(node=>{
    const question=questionFor(node.label)
    const result=receiptAnswer(graph,question,jurisdiction,'https://opax.com.au',filters)
    if(!result || 'needs_scope' in result || 'needs_period' in result || result.selected_parties.length>1 || result.selected_industries.length>1 || result.selected_donors.length!==1 || unmatchedReceiptRankingScope(graph,receiptPeriodQuery(question).query,result,filters.party))return []
    const canonical=fundingScopeQuestion({party:result.selected_parties[0],donor:result.selected_donors[0],...result.requested_years,mode:result.selected_parties.length?'donors':'parties'},jurisdiction)
    return [{label:node.label.replace(/[\[\]\n\r*]/g,' '),question:canonical}]
  })
  if(!choices.length)return null
  const intro=choices.length===1?'Did you mean this organisation?':'Which organisation do you mean? These are separate records in this map.'
  return clarify(intro+'\n\n'+choices.map(c=>`- [${c.label}](/ask?q=${encodeURIComponent(c.question).replace(/\(/g,'%28').replace(/\)/g,'%29')})`).join('\n')+'\n\nChoose a name to see its figures. No total has been calculated for this question yet.')
}

/** Reconstruct scope from user questions only. Answers and client amounts are
 * never used. Explicit controls are applied later by the receipt calculator. */
export function fundingFollowUp(input:RecordQuestion,graph:ReceiptGraph,jurisdiction:string,isRanking:(input:RecordQuestion)=>boolean): {question:string}|Clarification|null {
  let selected:FundingSelection|undefined
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
      if(!result || 'needs_scope' in result || 'needs_period' in result ||
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
    let fragment=original.trim().replace(/^(?:and\s+)?(?:(?:what|how)\s+about\s+)/i,'').replace(/^and\s+/i,'').replace(/[?]+$/,'').replace(/\s+please$/i,'').trim()
    // This bounded continuation changes only a shared period, never one side
    // of a pair or an unrecognised qualifier.
    if(selected.compareParties && !comparisonPeriodOnly(fragment)) { selected=undefined;continue }
    // Questions about speech, influence, grants, etc. return to ordinary Ask.
    if(!isRanking({question:`Who gets the most funding from ${fragment}`})) { selected=undefined;continue }
    const periodProblem=(answer:string):Clarification => ({...clarify(answer,'needs_period'),...((selected!.compareParties?comparisonPeriodOnly(fragment):periodOnly(fragment))?{money_question:fundingScopeQuestion(selected!,jurisdiction)}:{})})
    const normalized=receiptPeriodQuery(fragment)
    if(normalized.error) { const result=periodProblem(normalized.error);if(last)return result;if(!result.money_question)selected=undefined;continue }
    fragment=normalized.query.trim()
    if(/\b(?:last|past|recent|recently|latest|this year|decade)\b/i.test(fragment)) {
      const result=periodProblem('Choose an explicit financial year, such as 2021–22, so the follow-up uses the right period.')
      if(last)return result
      if(!result.money_question)selected=undefined;continue
    }
    let changed=false
    if(/\b(?:all years|all time|lifetime)\b$/i.test(fragment)) {
      fragment=fragment.replace(/(?:\b(?:in|over|for)\s+)?\b(?:all years|all time|lifetime)\b$/i,'').trim()
      selected={...selected,from:null,to:null};changed=true
    } else {
      const period=/(?:\b(?:in|during|since|from|before|after|until|through|between)\s+(?:the\s+)?)?\b(?:19|20)\d{2}(?:\s+(?:to|through|until|and)\s+(?:19|20)\d{2})?$/i.exec(fragment)
      if(period) {
        const parsed=receiptAnswer(graph,`Who receives the most money from all receipts ${period[0].replace(/\bthe\s+/gi,'')}`,jurisdiction,'https://opax.com.au')
        if(!parsed || 'needs_scope' in parsed || 'needs_period' in parsed) {
          const result=periodProblem(parsed&&'answer' in parsed?parsed.answer:'Choose one financial year or a continuous year range.')
          if(last)return result
          if(!result.money_question)selected=undefined;continue
        }
        selected={...selected,...parsed.requested_years};fragment=fragment.slice(0,period.index).trim();changed=true
      }
    }
    if(fragment) {
      if(selected.compareParties) { selected=undefined;continue }
      const name=fragment.replace(/^(?:from|to|for)\s+/i,'').replace(/^the\s+/i,'')
      if(/^(?:all (?:donors|industries|sectors))$/i.test(name)) { selected={...selected,donor:undefined,industry:undefined};changed=true }
      else if(/^all (?:parties|recipients)$/i.test(name)) { selected={...selected,party:undefined,mode:'parties'};changed=true }
      else {
        const query=`Who donates the most to ${name}`
        const match=receiptAnswer(graph,query,jurisdiction,'https://opax.com.au')
        if(!match || 'needs_scope' in match || 'needs_period' in match || unmatchedReceiptRankingScope(graph,query,match) ||
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
    if(last) return changed?{question:fundingScopeQuestion(selected,jurisdiction)}:unknown()
  }
  return null
}
