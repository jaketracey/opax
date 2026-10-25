import {receiptPeriodQuery} from './receipt-period'

/** Closed question grammar. It reads user intent, never answer prose or citations. */
const parties:[string,string[]][]=[
 ['Labor',['australian labor party','labor party','labor','alp']],
 ['Liberal',['liberal party of australia','liberal party','liberals','liberal']],
 ['Greens',['australian greens','greens']],['Nationals',['national party of australia','national party','nationals']],
 ['One Nation',["pauline hanson's one nation","pauline hanson's party",'pauline hansons party','one nation','phon']],
 ['LNP',['liberal national party','lnp']],['Country Liberal Party',['country liberal party']],
 ['United Australia Party',['united australia party']],['Family First',['family first']],
 ["Katter's Australian Party",["katter's australian party"]],['Centre Alliance',['centre alliance']],
]
// Inflection and aspect belong to the question grammar, not separate routes.
const verbs='(?:giv(?:e[sn]?|ing)|gave|donat(?:e[sd]?|ing)|fund(?:s|ed|ing)?|bankroll(?:s|ed|ing)?|back(?:s|ed|ing)?|support(?:s|ed|ing)?|prop(?:s|ped|ping)? up|contribut(?:e[sd]?|ing))'
const auxiliaries='(?:(?:(?:has|have|had)(?: been)?|(?:is|are|was|were)(?: being)?|does|did|will|would|can|could) )?'
const actions=auxiliaries+verbs
const roles='(?:(?:financial|political) )?(?:donors?|backers?|supporters?|benefactors?|funders?|contributors?)'
const fixedTypos:Record<string,string>={teh:'the',hte:'the',waht:'what',moeny:'money',donatoins:'donations',dontes:'donates'}
const normal=(q:string)=>q.normalize('NFKC').toLowerCase().replace(/[’‘]/g,"'").replace(/\s+/g,' ').trim().replace(/[?!.]+$/,'').replace(/^please /,'').replace(/ please$/,'').replace(/^and /,'').replace(/\b(?:teh|hte|waht|moeny|donatoins|dontes)\b/g,word=>fixedTypos[word]).replace(/\b([a-z]+s)'(?=\s|$)/g,"$1's").replace(/^who've /,'who have ')
const escape=(s:string)=>s.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')
function exactRankingQuestion(q:string):string|null {
 // An explicit state jurisdiction never enters this federal route.
 if(/\b(?:queensland|qld|victoria|victorian|vic|tasmania|tasmanian|tas|new south wales|nsw|south australia|western australia|northern territory|act disclosures|state records|state disclosures)\b/.test(q))return null
 let target:string|undefined
 const active=new RegExp('^who '+actions+' (?:(?:the )?most(?: (?:money|disclosed funding|funding|receipts))?(?: to| for)? |(?:money |donations? |receipts? )?to )?(.+)$').exec(q)
 const separable=new RegExp('^who '+auxiliaries+'prop(?:s|ped|ping)? (.+?) up(.*)$').exec(q)
 const copula='(?:is|are|was|were|has been|have been|had been)'
 const nouns=new RegExp('^(?:(?:who '+copula+'|show(?: me)?|list)(?: the)? |the )?(?:biggest|top|largest|major|main) '+roles+' (?:to|for|of) (.+)$').exec(q)
 const taking=/^who (?:does|did|will|would|can|could) (.+?) take (?:the )?most money from(.*)$/.exec(q)
   ??/^who (?:has|had) (.+?) taken (?:the )?most money from(.*)$/.exec(q)
   ??/^who (?:is|was) (.+?) taking (?:the )?most money from(.*)$/.exec(q)
 const neutral=/^who has the most disclosed receipts to (.+)$/.exec(q)
 const possessive=new RegExp('^(?:who '+copula+' )?(.+?)(?:\'s) (?:biggest|top|largest|major|main) '+roles+'(.*)$').exec(q)
 target=active?.[1]??nouns?.[1]??neutral?.[1]??(taking?taking[1]+taking[2]:undefined)??(possessive?possessive[1]+possessive[2]:undefined)??(separable?separable[1]+separable[2]:undefined)
 if(!target)return null
 target=target.replace(/^the /,'')
 for(const {party,name}of aliases){
  const match=new RegExp('^'+escape(name)+'(?=$| )').exec(target)
  if(!match)continue
  const tail=target.slice(match[0].length).trim().replace(/^(?:the )?most(?: money)?(?: |$)/,'').replace(/ (?:the )?most(?: money)?$/,'')
  const withoutRegion=tail.replace(/\b(?:in |from )?(?:federal|aec)(?: (?:records|disclosures|returns))?\b/g,'').trim()
  const period=receiptPeriodQuery(withoutRegion.replace(/^(?:over |across |for )?(?:all time|all years|the whole record)$/,''))
  // Continuous financial-year scope only; comparisons, causal questions,
  // donor lookups and extra clauses retain their existing path.
  const ordinaryPeriod=!period.error&&(!period.query||/^(?:(?:in|during|for|since|from|before|after|until|through|between) )?(?:19|20)\d{2}(?: (?:to|through|until|and) (?:19|20)\d{2})?$/.test(period.query.trim()))
  const needsPeriod=/^(?:(?:in|during|for|since|from|before|after|until|through|between|around|over) )?(?:[0-9\s–—/.,-]+|(?:the )?(?:last|past|this|current|latest|recent)(?: [0-9]+)? (?:financial )?(?:year|years|decade)|(?:january|february|march|april|may|june|july|august|september|october|november|december)(?: [0-9 ,]+)?|back then)$/.test(withoutRegion)
  if(!ordinaryPeriod&&!needsPeriod)return null
  const scope=ordinaryPeriod?period.query.trim():withoutRegion
  return `Who has the most disclosed receipts to ${party}${scope?' '+scope:''}?`
 }
 return null
}

export type FederalPartyRankingIntent={parties:string[];question?:string;uncertain:boolean}
const jurisdiction=/\b(?:queensland|qld|victoria|victorian|vic|tasmania|tasmanian|tas|new south wales|nsw|south australia|western australia|northern territory|act disclosures|state records|state disclosures)\b/
const rankingCue=/\b(?:most|top|biggest|largest)\b/
const moneyCue=(q:string)=>/\b(?:money|donations?|donors?|funding|funds|receipts)\b/.test(q)||/\b(?:gave|gives|given)\b/.test(q)&&/\b(?:amounts?|dollars?)\b/.test(q)
// A clarification may contain only this incomplete financial-question grammar.
// Unknown words (including policy/bill topics or misspelled verbs) take the
// ordinary route; exact cues alone do not establish financial ranking intent.
const clarificationWords=new Set(('who is are was were has have had been being does did do will would can could the a an to for of from by and up which show me list most top biggest largest financial political money donation donations donor donors funding funds receipts receipt amount amounts dollar dollars give gives gave given giving donate donates donated donating fund funded funder funders back backs backed backing backer backers support supports supported supporting supporter supporters bankroll bankrolls bankrolled bankrolling benefactor benefactors contribute contributes contributed contributing contributor contributors partytarget').split(' '))
const aliases=parties.flatMap(([party,names])=>names.map(name=>({party,name}))).sort((a,b)=>b.name.length-a.name.length)
function variants(question:string):string[]{
 const q=normal(question)
 return /^who(?:'s|s) /.test(q)?[q.replace(/^who(?:'s|s) /,'who is '),q.replace(/^who(?:'s|s) /,'who has ')]:[q]
}

/** Exact aliases only; longest aliases mask their nested shorter party names. */
function partySpans(q:string){
 const spans:{start:number;end:number;party:string}[]=[]
 for(const {party,name}of aliases){
  const re=new RegExp('(^| )'+escape(name)+"(?=$| |'s)",'g')
  for(const m of q.matchAll(re)){
   const start=m.index!+m[1].length,end=m.index!+m[0].length
   if(!spans.some(s=>start<s.end&&end>s.start))spans.push({start,end,party})
  }
 }
 return spans
}

/** Only fixed normalisation is applied; entities and verbs are never guessed. */
export function federalPartyRankingIntent(question:string):FederalPartyRankingIntent|null {
 const inputs=variants(question)
 for(const q of inputs){const exact=exactRankingQuestion(q);if(exact){const party=parties.find(([p])=>exact.startsWith(`Who has the most disclosed receipts to ${p}`))![0];return {parties:[party],question:exact,uncertain:false}}}
 for(const q of inputs){
  if(jurisdiction.test(q)||!rankingCue.test(q)||!moneyCue(q))continue
  const spans=partySpans(q)
  if(spans.length!==1)continue
  const span=spans[0]
  const frame=(q.slice(0,span.start)+'partytarget'+q.slice(span.end)).replace(/\bpartytarget's\b/g,'partytarget')
  // Require a listing question, not a title or a fragment about a bill.
  if(!/^(?:who |show |list )/.test(frame))continue
  if(!frame.split(' ').every(word=>clarificationWords.has(word)))continue
  return {parties:[span.party],uncertain:true}
 }
 return null
}
export function federalPartyRankingQuestion(question:string):string|null {
 const intent=federalPartyRankingIntent(question)
 return intent&&!intent.uncertain?intent.question??null:null
}
export function federalPartyRankingClarification(intent:FederalPartyRankingIntent){
 const answer=intent.parties.length===1?`Do you mean the largest disclosed receipts to ${intent.parties[0]}?`:`Which party do you mean: ${intent.parties.join(' or ')}? I can rank their largest disclosed receipts.`
 return {answer,answer_status:'needs_scope' as const,money_ranking:true as const,citations:{},sources:[]}
}
