import {sourceMetadata} from './research-ranking-scope.mjs'

export const FEDERAL_RECEIPTS_NOTE = 'These federal totals mix donations with other receipts such as loans, so this is not a donation ranking.'
export const RECEIPTS_WRITING_RULE = 'For a federal unclassified receipt figure, use only a direct neutral statement of the cited fact: PARTY disclosed AMOUNT in receipts from SOURCE; PARTY received AMOUNT from SOURCE; or disclosed receipts from SOURCE total AMOUNT. Keep the cited party, source, amount and period. Other financial framing is rejected, not rewritten. '+FEDERAL_RECEIPTS_NOTE
const escape=s=>String(s).replace(/[.*+?^${}()|[\]\\]/g,'\\$&')
const amountRE=/\$[\d,]+(?:\.\d+)?(?:[ \u00a0]*(?:million|billion|thousand|bn|[mkb])\b)?|\bAUD\s+[\d,]+(?:\.\d+)?(?:\s*(?:million|billion|thousand|bn|[mkb])\b)?|\b[\d,]+(?:\.\d+)?\s*(?:million|billion|thousand|bn|[mkb])\b(?: dollars?)?/gi
export const receiptAmounts=text=>[...String(text).normalize('NFKC').matchAll(amountRE)].map(m=>({text:m[0],value:Number(m[0].replace(/[^\d.]/g,''))*(/billion|bn|b$/i.test(m[0])?1e9:/million|m$/i.test(m[0])?1e6:/thousand|k$/i.test(m[0])?1e3:1)}))

/** Read historical evidence fields. This is not a model-prose migration. */
export function federalReceiptFact(text) {
 const old=/^(.+?) gave (.+?) (\$[\d,]+(?:\.\d+)?) \(federal disclosures(?:; financial years ([^)]+))?\)/.exec(text)
 const current=/^(.+?) disclosed (\$[\d,]+(?:\.\d+)?) in receipts from (.+?) \(federal disclosures(?:; financial years ([^)]+))?\)/.exec(text)
 return old?{name:old[1],party:old[2],amount:old[3],period:old[4],end:old[0].length}:current?{name:current[3],party:current[1],amount:current[2],period:current[4],end:current[0].length}:null
}
export function receiptSource(source) {
 if(!source||['speech','bill','pay','grant','contract','count'].includes(source.kind))return false
 return source.kind==='receipt'||/\(federal disclosures|disclosed (?:political |party )?receipts|\|\s*Donor\s*\|\s*Disclosed receipts/i.test(source.snippet??'')
}
export function federalReceiptSource(source) {
 if(!receiptSource(source))return false
 const meta=sourceMetadata(source),jur=String(meta.jurisdiction).toLowerCase()
 // A declared state scope wins over text mentioning other disclosure systems.
 if(jur&&!['federal','commonwealth','aec'].includes(jur))return false
 const path=String(source.url??source.href??'')
 if(/money\.(?:vic|tas|qld)\.json/i.test(path)&&!jur)return false
 return !!jur||/\(federal disclosures|Federal \(AEC\)|\bAEC\b|\bfederal\b/i.test([source.snippet,source.title,source.source].join(' '))||/\/graph\/money\.json(?:$|\?)/.test(path)
}
const partyLabel=s=>String(s??'').replace(/^party:/,'')
/** Only facts belonging to this source may authorise this sentence. */
export function receiptFacts(source) {
 const text=String(source.receipt_original_snippet??source.snippet??''),meta=sourceMetadata(source),facts=[]
 if(Array.isArray(source.receipt_facts))return source.receipt_facts
 const scopedParty=partyLabel(meta.party)||undefined
 const period=/(?:Financial years|Period):\s*([^\n.]+)/i.exec(text)?.[1]?.trim()
 const leadParty=/largest disclosed receipts to (.+?) in this published selection/i.exec(text)?.[1]
 for(const line of text.split('\n')){
  const fact=federalReceiptFact(line)
  if(fact){if(!scopedParty||partyLabel(fact.party).toLowerCase()===scopedParty.toLowerCase())facts.push({...fact,period:fact.period??period});continue}
  const flow=/^Disclosed receipt:\s*(.+?)\s*→\s*(.+?)\s*[—–]\s*(\$[\d,.]+)/.exec(line)
  if(flow){facts.push({name:flow[1],party:flow[2],amount:flow[3],period});continue}
  const total=/^Donor:\s*(.+?)\s*[—–].*?(\$[\d,.]+)/.exec(line)
  if(total){facts.push({name:total[1],party:scopedParty,amount:total[2],period});continue}
  const table=/^\|\s*(?:\[([^\]]+)\]\([^)]+\)|([^|]+))\s*\|\s*(\$[\d,.]+)\s*\|\s*([\d,]+)/.exec(line)
  if(table&&/\|\s*(?:Donor|Receipt source)\s*\|/.test(text)){
   facts.push({name:(table[1]??table[2]).trim(),party:scopedParty??leadParty,amount:table[3],records:Number(table[4].replaceAll(',','')),period});continue
  }
  const row=/^(.+?):\s*(\$[\d,.]+)(?:,\s*([\d,]+) (?:disclosed receipt )?records?)?/.exec(line)
  if(row){const donor=/[?&]focus=donor(?:%3A|:)/i.test(source.url??source.href??'')||/grouped by donor\b/i.test(text);facts.push({name:donor?row[1]:undefined,party:donor?scopedParty:scopedParty===row[1]||/grouped by recipient party/i.test(text)?row[1]:undefined,owner:row[1],amount:row[2],records:row[3]?Number(row[3].replaceAll(',','')):undefined,period})}
 }
 return facts
}

/** Closed grammar, not a synonym denylist. The whole financial sentence must
 * match, and every slot comes from the SAME cited fact. No output is rewritten. */
export function allowedReceiptSentence(text,fact) {
 const values=receiptAmounts(text),amount=receiptAmounts(fact.amount)[0]?.value
 if(values.length!==1||values[0].value!==amount)return false
 let form=String(text).trim().replace(/^[-*]\s+/,'').replace(/\*\*/g,'').replace(/[.]$/,'')
 // Entity quotation is accepted only around an exact evidence name. Quotes in
 // the predicate or around a monetary claim are never stripped or interpreted.
 const replaceName=(name,slot)=>{
  if(!name)return
  const quoted=new RegExp('[“"‘]'+escape(name)+'[”"’]','gi')
  form=form.replace(quoted,slot).replace(new RegExp('(?<![\\p{L}])'+escape(name)+'(?![\\p{L}])','giu'),slot)
 }
 replaceName(fact.name,'S');replaceName(fact.party,'P')
 if(fact.owner&&fact.owner!==fact.name&&fact.owner!==fact.party)replaceName(fact.owner,'O')
 form=form.replace(new RegExp(escape(values[0].text),'g'),'A')
 if(fact.period){
  const period=escape(fact.period).replace(/[–-]/g,'[–-]')
  form=form.replace(new RegExp('^Across disclosed returns from '+period+' in OPAX[’\']s published selection, ','i'),'')
  form=form.replace(new RegExp('(?: \\(financial years '+period+'\\)| (?:in|for)(?: the financial years)? '+period+')$','i'),'')
 }
 if(fact.records!==undefined)form=form.replace(new RegExp(',? (?:across|from) '+escape(Number(fact.records).toLocaleString('en-AU'))+' (?:disclosed receipt )?(?:records?|receipts?)$','i'),'')
 form=form.replace(/^In the published selection, /i,'').replace(/ in this published selection/gi,'').replace(/^the P\b/i,'P')
 const grammars=[
  /^P (?:received|disclosed|recorded) A(?: in (?:disclosed (?:party |political )?)?receipts)? from S$/i,
  /^P (?:received|disclosed|recorded) A in (?:disclosed (?:party |political )?)?receipts$/i,
  /^P (?:received|disclosed|recorded) A$/i,
  /^S (?:disclosed|recorded) A in (?:disclosed (?:party |political )?)?receipts to P$/i,
  /^(?:S|O) (?:disclosed|recorded) A(?: in (?:disclosed (?:party |political )?)?receipts)?$/i,
  /^(?:The )?(?:largest |most )?disclosed receipts(?: to P)? (?:came|are|were) from S: A$/i,
  /^(?:The )?(?:disclosed )?receipts(?: to P)? from S total A$/i,
  /^(?:The )?(?:disclosed )?(?:receipt |receipts )?total for (?:S|P|O) is A$/i,
  /^A in (?:disclosed )?receipts (?:was|were) (?:received|disclosed|recorded) by P from S$/i,
 ]
 return grammars.some(rule=>rule.test(form))
}
export function hasReceiptFigure(text) {
 const clean=String(text).normalize('NFKC')
 return receiptAmounts(clean).length>0||/(?:\$|\bAUD\b|\bdollars?\b)/i.test(clean)&&/\b(?:one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|twenty|thirty|forty|fifty|sixty|seventy|eighty|ninety|hundred|thousand|million|billion)\b/i.test(clean)
}
/** A cited amount is still a receipt figure when its currency marker is absent.
 * This scopes deletion only; it never supplies evidence for replacement prose. */
export function statesReceiptFigure(text,sources) {
 if(hasReceiptFigure(text))return true
 const values=(String(text).normalize('NFKC').match(/\b\d[\d,]*(?:\.\d+)?\b/g)??[]).map(n=>Number(n.replaceAll(',','')))
 return sources.filter(federalReceiptSource).some(s=>receiptFacts(s).some(f=>receiptAmounts(f.amount).some(a=>values.includes(a.value))))
}
export function receiptSentenceCheck(text,sources) {
 const federal=sources.filter(federalReceiptSource)
 if(!federal.length||!statesReceiptFigure(text,federal))return {scoped:false,allowed:true}
 return {scoped:true,allowed:federal.some(source=>receiptFacts(source).some(fact=>allowedReceiptSentence(text,fact)))}
}

export function receiptSentenceProof(text,sources) {
 for(const source of sources.filter(federalReceiptSource))for(const fact of receiptFacts(source))if(allowedReceiptSentence(text,fact))return {source,fact}
 return null
}
