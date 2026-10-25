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
const normal=(q:string)=>q.normalize('NFKC').toLowerCase().replace(/[’‘]/g,"'").replace(/\s+/g,' ').trim().replace(/[?!.]+$/,'').replace(/^please /,'').replace(/ please$/,'').replace(/^and /,'').replace(/\bteh\b/g,'the').replace(/\b([a-z]+s)'(?=\s|$)/g,"$1's").replace(/^who've /,'who have ')
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

export type FederalPartyRankingIntent={parties:string[];question?:string;uncertain:boolean}
const jurisdiction=/\b(?:queensland|qld|victoria|victorian|vic|tasmania|tasmanian|tas|new south wales|nsw|south australia|western australia|northern territory|act disclosures|state records|state disclosures)\b/
const rankingWords=new Set('most top biggest largest major main leading highest'.split(' '))
const moneyWords=new Set(('give gives gave given giving donate donates donated donating donation donations donor donors fund funds funded funding funder funders back backs backed backing backer backers support supports supported supporting supporter supporters bankroll bankrolls bankrolled bankrolling benefactor benefactors contribute contributes contributed contributing contributor contributors money receipts receipt').split(' '))
const keywords=[...new Set([...rankingWords,...moneyWords])]
// Grammar scaffolding must not be spelling-corrected into financial keywords.
const joiners=new Set('who is are was were has have had been being does did do will would can could the a an to for of from in on by with at and or as up which show me list all time years year financial fiscal fy during since before after until through between over across federal aec records record disclosures returns disclosed total totals amount amounts largest party parties please'.split(' '))

/** Damerau-Levenshtein: adjacent keyboard transpositions count as one edit. */
export function receiptKeywordDistance(a:string,b:string):number {
 const d=Array.from({length:a.length+1},()=>Array<number>(b.length+1).fill(0))
 for(let i=0;i<=a.length;i++)d[i][0]=i
 for(let j=0;j<=b.length;j++)d[0][j]=j
 for(let i=1;i<=a.length;i++)for(let j=1;j<=b.length;j++){
  d[i][j]=Math.min(d[i-1][j]+1,d[i][j-1]+1,d[i-1][j-1]+(a[i-1]===b[j-1]?0:1))
  if(i>1&&j>1&&a[i-1]===b[j-2]&&a[i-2]===b[j-1])d[i][j]=Math.min(d[i][j],d[i-2][j-2]+1)
 }
 return d[a.length][b.length]
}
function editCost(word:string,target:string):number {
 const max=target.length>=7?2:1
 if(Math.abs(word.length-target.length)>max)return Infinity
 const distance=receiptKeywordDistance(word,target)
 return distance<=max?distance:Infinity
}
const aliases=parties.flatMap(([party,names])=>names.map(name=>({party,words:name.split(' '),max:name.length>=7?2:1})))
function variants(question:string):string[]{
 const q=normal(question)
 return /^who(?:'s|s) /.test(q)?[q.replace(/^who(?:'s|s) /,'who is '),q.replace(/^who(?:'s|s) /,'who has ')]:[q]
}

/** Only question text is normalised. Ambiguous intent never enters a writer. */
export function federalPartyRankingIntent(question:string):FederalPartyRankingIntent|null {
 const inputs=variants(question)
 for(const q of inputs){const exact=exactRankingQuestion(q);if(exact){const party=parties.find(([p])=>exact.startsWith(`Who has the most disclosed receipts to ${p}`))![0];return {parties:[party],question:exact,uncertain:false}}}
 for(const q of inputs){
  if(jurisdiction.test(q))continue
  const words=[...q.matchAll(/[a-z]+(?:'[a-z]+)?|\d+(?:[–/-]\d+)*/g)].map(m=>({text:m[0],at:m.index!,end:m.index!+m[0].length}))
  const spans:{start:number;length:number;parties:string[];suffix:string;cost:number}[]=[]
  for(let i=0;i<words.length;i++){
   if(joiners.has(words[i].text))continue
   const hits:{party:string;length:number;cost:number;suffix:string}[]=[]
   for(const alias of aliases){
    if(i+alias.words.length>words.length)continue
    let cost=0,suffix=''
    for(let j=0;j<alias.words.length;j++){
     let word=words[i+j].text
     if(j===alias.words.length-1&&word.endsWith("'s")&&!alias.words[j].endsWith("'s")){word=word.slice(0,-2);suffix="'s"}
     cost+=editCost(word,alias.words[j])
    }
    if(cost<=alias.max)hits.push({party:alias.party,length:alias.words.length,cost,suffix})
   }
   hits.sort((a,b)=>b.length-a.length||a.cost-b.cost)
   if(!hits.length)continue
   const best=hits.filter(h=>h.length===hits[0].length&&h.cost===hits[0].cost)
   spans.push({start:i,length:best[0].length,parties:[...new Set(best.map(h=>h.party))],suffix:best[0].suffix,cost:best[0].cost});i+=best[0].length-1
  }
  // Multiple explicit parties are comparisons, outside this single-party family.
  if(spans.length!==1)continue
  const span=spans[0],replacements=new Map<number,string>();let ambiguous=false,money=false,ranking=false,corrected=false,headUnknown=false
  for(let i=0;i<words.length;i++){
   if(i>=span.start&&i<span.start+span.length)continue
   const word=words[i].text
   if(joiners.has(word)||/^\d/.test(word)){if(rankingWords.has(word))ranking=true;continue}
   let choices=keywords.includes(word)?[word]:[]
   if(!choices.length){
    const scores=keywords.map(k=>({k,cost:editCost(word,k)})).filter(c=>Number.isFinite(c.cost)).sort((a,b)=>a.cost-b.cost)
    if(scores.length)choices=scores.filter(c=>c.cost===scores[0].cost).map(c=>c.k)
   }
   if(!choices.length){if(i<span.start)headUnknown=true;continue}
   money||=choices.some(c=>moneyWords.has(c));ranking||=choices.some(c=>rankingWords.has(c))
   if(choices.length===1){replacements.set(i,choices[0]);corrected||=choices[0]!==word}else ambiguous=true
  }
  if(!money)continue
  const candidates:string[]=[]
  for(const party of span.parties){
   let fixed='',end=0
   for(let i=0;i<words.length;i++){
    fixed+=q.slice(end,words[i].at)
    if(i===span.start){fixed+=party.toLowerCase()+span.suffix;end=words[i+span.length-1].end;i+=span.length-1}
    else {fixed+=replacements.get(i)??words[i].text;end=words[i].end}
   }
   fixed+=q.slice(end)
   const match=exactRankingQuestion(fixed);if(match)candidates.push(match)
  }
  const unique=[...new Set(candidates)]
  if(unique.length===1&&span.parties.length===1&&!ambiguous)return {parties:span.parties,question:unique[0],uncertain:false}
  // Topic questions, named-sender filters and comparisons are different intents.
  // Unknown wording in an otherwise financial ranking instead needs confirmation.
  const otherIntent=/\b(?:lend|lends|lending|lent|loan|loans|loaned|loaning|borrow|borrows|borrowed|borrowing|owe|owes|owed|owing|debt|debts|pay|salary|salaries|income|entitlements|expenses|mps|senators|politicians|personal|personally|grants?|contracts?|more|less|higher|lower|compare|versus|vs|or|else|usually|when|evidence|polic(?:y|ies)|priorities|manifesto|popular|appealing|blood|organ|charity|conference|polls?|parliament|why|excluding|except|without|influence|speeches?|say|says|said|votes?|voting)\b/.test(q)
  const suffix=q.slice(words[span.start+span.length-1].end)
  const existingPeriod=!headUnknown&&!corrected&&!ambiguous&&span.cost===0&&/\b(?:in|during|for|since|from|before|after|until|through|between|around|recently|back then)\b/.test(suffix)
  const senderFilter=words.some((w,i)=>w.text==='from'&&i+1<words.length&&!/^(?:19|20)\d/.test(words[i+1].text)&&!['federal','aec'].includes(words[i+1].text))
  const listing=/^(?:who\b|show\b|list\b|the\b)/.test(q)||rankingWords.has(words[0]?.text)||span.start===0
  if(!otherIntent&&!existingPeriod&&!senderFilter&&listing&&(ranking||/^who\b/.test(q)))return {parties:span.parties,uncertain:true}
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
