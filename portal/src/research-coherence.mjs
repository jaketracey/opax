import {sentenceParts} from './research-claim-audit.mjs'
import {answerStyleChecks} from './research-answer-style.mjs'
// Shared, deterministic checks; evidence remains data and the claim audit remains authoritative.
export const danglingOpener = /^(?:[-*•]\s*|\d+[.)]\s*)?(?:other\b|also\b|in addition\b|further(?:more)?\b|however\b|meanwhile\b|additionally\b|moreover\b|and\b|another\b|the runners-up\b)/i
const folded = s => String(s??'').toLowerCase().replace(/[–—]/g,'-').replace(/[^\p{L}\p{N}]+/gu,' ').trim()
/** These decisions are authoritative; retained evidence is not permission to change them. */
export function protectedDecision(payload) {
  if(payload?.answered===false || /^(?:coverage_only|evidence_gap|needs_question|needs_scope|needs_period|clarification|declined|refused|moderated|blocked)$/.test(payload?.answer_status??''))return true
  const first=String(payload?.answer??'').trim().split(/\n\s*\n/)[0].split(/(?<=[.!?])\s+(?=[A-Z])/)[0]
  if(/exhaustive count|complete (?:historical )?total/i.test(first)&&String(payload?.answer??'').includes('\n\n')&&payload?.sources?.some(s=>s.cited&&s.kind==='speech'))return false
  if(/^(?:Please (?:name|specify|clarify|choose|give)|I (?:cannot|can't) help|There is not enough evidence)/i.test(first))return true
  const decline=/(?:cannot|can't|could not|do not|does not) establish|cannot be (?:established|determined|answered)|do not identify|not (?:evidence|proof)|does not prove/i.test(first)
  const decisionSubject=/^(?:OPAX|(?:The|These|This|Selected|Retrieved)\b[^$“”"]{0,180}\b(?:records?|facts|evidence|returns|receipts|selection|passages?|material|coverage|Census)\b|A donation\b)/i.test(first)
  const affirmative=/\b(?:paid|earned|received|gave|donated|provided|recorded|said)\b/i.test(first.split(/\b(?:cannot|do not|does not)\b/i)[0])
  return decline&&!affirmative&&(decisionSubject||/^[^$“”"]+cannot be (?:established|determined|answered)/i.test(first))
}
const partyAliases=[['One Nation',/\b(?:one nation|pauline hanson[’']?s?(?: party)?)\b/i],['Labor',/\b(?:labor|alp)\b/i],['Liberal',/\bliberal(?: party)?\b/i],['Greens',/\bgreens?\b/i],['Nationals',/\b(?:nationals?|national party)\b/i],['LNP',/\b(?:lnp|liberal national party)\b/i]]
const sourceMetadata=source=>{
  let party='',jurisdiction=''
  try{const url=new URL(source.url??source.href,'https://opax.invalid');party=url.searchParams.get('party')??'';jurisdiction=url.searchParams.get('jur')??url.searchParams.get('jurisdiction')??''}catch{}
  return {party,jurisdiction}
}
function rankingScope(question,row) {
  const parties=partyAliases.filter(([,re])=>re.test(question.replace(/\bliberal national party\b/ig,'LNP'))).map(([name])=>name)
  const rowParty=partyAliases.find(([,re])=>re.test(row.party.replace(/\bliberal national party\b/ig,'LNP')))?.[0]
  if(parties.length!==1||!rowParty||!parties.includes(rowParty))return false
  const text=[row.source.title,row.source.snippet].join(' '),meta=sourceMetadata(row.source)
  const state=/\b(queensland|nsw|new south wales|victoria|victorian|tasmania|south australia|western australia|act|northern territory)\b/i.exec(question)?.[0]
  if(state&&(!meta.jurisdiction||meta.jurisdiction==='federal'))return false
  if(state&&meta.jurisdiction&&meta.jurisdiction!=='federal'&&!folded(state).includes(folded(({qld:'Queensland',nsw:'NSW',vic:'Victoria',tas:'Tasmania',sa:'South Australia',wa:'Western Australia',act:'ACT',nt:'Northern Territory'})[meta.jurisdiction]??meta.jurisdiction)))return false
  if(/\bstate (?:returns|disclosures|donations)\b/i.test(question)&&/federal|AEC/i.test(text+' '+meta.jurisdiction))return false
  const years=[...question.matchAll(/\b(?:19|20)\d{2}(?:[–-]\d{2})?\b/g)].map(m=>m[0])
  const period=folded(row.period)
  if(years.length===1 && (!period.startsWith(years[0].slice(0,4))||/\bto\b/.test(period)))return false
  if(years.length>1 && (!period.startsWith(years[0].slice(0,4))||!period.endsWith(folded(years.at(-1)).slice(-2))))return false
  return true
}
function donorRows(question,sources=[],requireRanking=true) {
  sources=Array.isArray(sources)?sources.filter(s=>s&&typeof s==='object'):[]
  if((requireRanking&&!/\b(?:who|which (?:company|donor|organisation|organization))\b.*\b(?:most|largest|biggest)\b|\b(?:top|largest|biggest|leading) (?:\w+ )?donors?\b/i.test(question))||!/donor|donat|giv|gave|funding|take.*money|money.*from/i.test(question)||/\bwhich Smith\b|\b(?:buy|bought|bribe|because|influenc|cause)\w*\b/i.test(question))return []
  const rows=[],coverage=sources.map(s=>s.snippet??'').join('\n')
  for(const source of sources){
    // ranked_money also supplies a native, privacy-filtered Donor table.
    const native=(String(source.snippet??'')+'\n'+String(source.title??'')).replace(/\*\*/g,'')
    if(/^fact-\d+$/.test(source.resource??'')&&source.kind==='record'&&/\/money(?:[/?]|$)/.test(String(source.url??source.href??''))&&/\|\s*Donor\s*\|\s*Disclosed receipts\s*\|/i.test(native)){
      const party=/has the largest disclosed total to (.+?) in this published selection/.exec(native)?.[1]
      const period=/Financial years:\s*([^\n.]+)/i.exec(native)?.[1]?.trim()
      if(party&&period)for(const line of native.split('\n')){
        const row=/^\|\s*(?:\[([^\]]+)\]\([^)]+\)|([^|]+))\s*\|\s*(\$\d(?:[\d,]*\d)?(?:\.\d+)?)\s*\|/.exec(line)
        if(row)rows.push({name:(row[1]??row[2]).trim(),party,amount:row[3],value:Number(row[3].replace(/[$,]/g,'')),period,source})
      }
    }
    if(source.kind==='receipt'&&/^receipt-ranking-\d+$/.test(source.resource??'')&&/grouped by donor/i.test(coverage)){
      const m=/^([^:\n]+): (\$\d(?:[\d,]*\d)?(?:\.\d+)?)/.exec(source.snippet??'')
      const period=/(?:Financial years|Period):\s*([^\n.]+)/i.exec(source.snippet??'')?.[1]
      const explicit=sourceMetadata(source).party
      const party=partyAliases.find(([,re])=>re.test(explicit||[source.title,source.snippet].join(' ')))?.[0]
      if(m&&party)rows.push({name:m[1],party,amount:m[2],value:Number(m[2].replace(/[$,]/g,'')),period,source})
    }
    if(!/^fact-\d+$/.test(source.resource??'')||source.kind!=='export')continue
    for(const line of String(source.snippet??'').split('\n')){
      const m=/^(.+?) gave (.+?) (\$[\d,]+(?:\.\d+)?) \(federal disclosures(?:[^)]*)\)/.exec(line)
      if(!m)continue
      const span=/financial years ((?:19|20)\d{2}[–-]\d{2}(?: to (?:19|20)\d{2}[–-]\d{2})?)/i.exec(line)?.[1]
      // Return-reference years are not the period of an aggregated total.
      const period=span??/financial years ((?:19|20)\d{2}[–-]\d{2} to (?:19|20)\d{2}[–-]\d{2})/i.exec(coverage)?.[1]
      rows.push({name:m[1],party:m[2],amount:m[3],value:Number(m[3].replace(/[$,]/g,'')),period,source})
    }
  }
  return rows.filter(r=>rankingScope(question,r)).filter((r,i)=>rows.findIndex(x=>x.name===r.name&&x.party===r.party&&x.value===r.value)===i).sort((a,b)=>b.value-a.value)
}
export function donorRanking(question,sources=[]){return donorRows(question,sources,true)}
/** Parse only selected donor/recipient relationships, also for an explicit amount lookup. */
export function selectedDonorFacts(question,sources=[]){return donorRows(question,sources,false)}
export function coherenceCheck(question,payload,{direct=answerStyleChecks(question,String(payload.answer??''),{sources:payload.sources??[],ranking_rows:donorRanking(question,payload.sources??[])}).direct_first_sentence==='pass'}={}) {
  const text=String(payload.answer??''),first=sentenceParts(text)[0]?.text.trim().split('\n')[0]??'',chars=Array.from(text)
  const orphan=[]
  for(const [id,ranges]of Object.entries(payload.citations??{})){if(!Array.isArray(ranges)){orphan.push(id);continue}for(const range of ranges)if(!citationHasSentence(text,range))orphan.push(id)}
  const protectedAnswer=protectedDecision(payload)
  if(protectedAnswer)direct=true
  const ranking=protectedAnswer?[]:donorRanking(question,payload.sources),top=ranking[0]
  const citedFirst=Object.values(payload.citations??{}).flat().some(([a,b])=>a< Array.from(first).length&&b>0)
  const rankingLead=!top||folded(first).includes(folded(top.name))&&first.includes(top.amount)&&!!top.period&&folded(first).includes(folded(top.period))&&citedFirst
  const stripped=Number(payload.coherence?.stripped_ratio??0),fallback=payload.coherence?.fallback===true
  const fragment=ranking.length>0&&text.split(/\n+/).some(p=>/^\s*(?:[-*•]\s*)?(?:[A-Z]\.){1,4}\s*$/.test(p)||/^\s*and\s/i.test(p))
  const reasons=[...(fragment?['incomplete donor sentence']:[]),...(!direct?['first sentence does not answer']:[]),...(!rankingLead?['missing selected ranking leader, amount, period or citation']:[]),...(orphan.length?['orphan citation']:[]),...(danglingOpener.test(first)?['dangling opener']:[]),...(/^\s*\[\d+\]\s*$/m.test(text)?['orphan citation marker']:[]),...(stripped>1/3&&!fallback&&!protectedAnswer?['over one third stripped without coherent fallback']:[])]
  return {pass:!reasons.length,reasons,orphan,rankingLead}
}

export function citationHasSentence(text,range) {
  if(!Array.isArray(range)||range.length!==2||!range.every(Number.isSafeInteger))return false
  const [a,b]=range,chars=Array.from(text)
  if(a<0||b<=a||b>chars.length)return false
  return sentenceParts(text).some(p=>{const start=Array.from(text.slice(0,p.at)).length,end=start+Array.from(p.text).length;return a<end&&b>start&&/[\p{L}]/u.test(p.text.replace(/\[\d+\]/g,''))})
}
