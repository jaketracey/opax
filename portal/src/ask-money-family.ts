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
const normal=(q:string)=>q.normalize('NFKC').toLowerCase().replace(/[’‘]/g,"'").replace(/\s+/g,' ').trim().replace(/[?!.]+$/,'').replace(/^please /,'').replace(/ please$/,'').replace(/^and /,'').replace(/^who's /,'who is ')
const escape=(s:string)=>s.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')
export function federalPartyRankingQuestion(question:string):string|null {
 const q=normal(question)
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
 for(const [party,names]of parties)for(const name of names){
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
