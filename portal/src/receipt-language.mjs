/** The export has no gift/loan breakdown. Never infer one from an entity name. */
export const FEDERAL_RECEIPTS_NOTE = 'These federal totals mix donations with other receipts such as loans, so this is not a donation ranking.'
export const RECEIPTS_WRITING_RULE = 'Describe unclassified political amounts as disclosed receipts or amounts received, never as gave, donated, gifts, donations, funded or funding. For a federal receipt ranking, state: '+FEDERAL_RECEIPTS_NOTE

/** Old saved facts remain readable; only the neutral form is emitted now. */
export function federalReceiptFact(text) {
 const old=/^(.+?) gave (.+?) (\$[\d,]+(?:\.\d+)?) \(federal disclosures(?:; financial years ([^)]+))?\)/.exec(text)
 const current=/^(.+?) disclosed (\$[\d,]+(?:\.\d+)?) in receipts from (.+?) \(federal disclosures(?:; financial years ([^)]+))?\)/.exec(text)
 return old?{name:old[1],party:old[2],amount:old[3],period:old[4],end:old[0].length}:current?{name:current[3],party:current[1],amount:current[2],period:current[4],end:current[0].length}:null
}

/** Reject positive gift/lending claims, while allowing the explicit limitation. */
export function unsafeReceiptWording(text) {
 const prose=String(text).replaceAll(FEDERAL_RECEIPTS_NOTE,'')
 return /\b(?:gave|gives?|giving|given|donat(?:e[ds]?|ing)|fund(?:ed|ing|s)|lent|lending)\b/i.test(prose)
  || /(?:\$\d[\d,]*(?:\.\d+)?[^.!?\n]{0,60}\b(?:gifts?|donations?)\b|\b(?:gifts?|donations?)\b[^.!?\n]{0,60}\$\d[\d,]*(?:\.\d+)?)/i.test(prose)
}

export function receiptSource(source) {
 if(!source||['speech','bill','pay','grant','contract','count'].includes(source.kind))return false
 return source.kind==='receipt'||/\(federal disclosures|disclosed (?:political |party )?receipts|\|\s*Donor\s*\|\s*Disclosed receipts/i.test(source.snippet??'')
}

export function receiptSourceNames(sources) {
 const names=[]
 for(const source of sources.filter(receiptSource))for(const line of String(source.snippet??'').split('\n')){
  const fact=federalReceiptFact(line),record=/^Disclosed receipt:\s*(.+?)\s*→/.exec(line),total=/^Donor:\s*(.+?)\s*[—–]/.exec(line)
  if(fact)names.push(fact.name)
  if(record||total)names.push((record??total)[1])
  if(/\|\s*Donor\s*\|/.test(source.snippet??'')){
   const row=/^\|\s*(?:\[([^\]]+)\]\([^)]+\)|([^|]+))\s*\|\s*\$/.exec(line)
   if(row)names.push((row[1]??row[2]).trim())
  }
 }
 return [...new Set(names)]
}

export function receiptDirectionMistakes(text,names) {
 return names.filter(name=>new RegExp(name.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')+'[”"\\\']?\\s+(?:received|receives|got)\\b','i').test(text))
}

/** Only wording changes: preserve literal amounts, owners, periods and negations. */
export function neutralReceiptSentence(text) {
 if(text.includes(FEDERAL_RECEIPTS_NOTE))return text.split(FEDERAL_RECEIPTS_NOTE).map(neutralReceiptSentence).join(FEDERAL_RECEIPTS_NOTE)
 const fact=federalReceiptFact(text)
 if(fact)return `${fact.party} disclosed ${fact.amount} in receipts from ${fact.name} (federal disclosures${fact.period?'; financial years '+fact.period:''})`+text.slice(fact.end)
 const neutral=text
  .replace(/provided the most disclosed funding/g,'was the source of the largest disclosed receipts')
  .replace(/provided disclosed funding/g,'was the source of disclosed receipts')
  .replace(/received (?:the most )?disclosed funding/g,m=>m.replace('funding','receipts'))
  .replace(/^(.+?) (?:gave|donated|contributed) (\$\d[\d,]*(?:\.\d+)?) to (.+?)([.!]|$)/,(_,name,amount,party,end)=>`${party} disclosed ${amount} in receipts from ${name}${end}`)
  .replace(/^(.+?) (?:gave|donated|funded|lent) (?!\$)(.+?) (?:with )?(\$\d[\d,]*(?:\.\d+)?(?:\s*(?:million|billion|bn|m))?)(.*)$/,(_,name,party,amount,tail)=>`${party.replace(/\s+recorded$/,'')} disclosed ${amount} in receipts from ${name}${tail}`)
  .replace(/^(.+?) (?:gave|donated) (\$\d[\d,]*(?:\.\d+)?) in disclosed (?:political )?receipts/,(_,name,amount)=>`${name} was the source of ${amount} in disclosed receipts`)
  .replace(/^(.+?) (?:gave|donated|contributed) (\$\d[\d,]*(?:\.\d+)?)/,(_,name,amount)=>`${name} was the source of ${amount} in disclosed receipts`)
  .replace(/whether giving occurred/g,'whether receipts occurred')
  .replace(/which parties received the funding/g,'which parties received the receipts')
  .replace(/(\$\d[\d,]*(?:\.\d+)?(?:\s+(?:million|billion))?)\s+in\s+(?:gifts?|donations?)/gi,'$1 in disclosed receipts')
  .replace(/\b(?:gifts?|donations?) of (\$\d[\d,]*(?:\.\d+)?)/gi,'disclosed receipts of $1')
  .replace(/\bwas given\b/gi,'received')
  .replace(/\b(?:gave|donated|funded) the most\b/gi,'was the source of the largest disclosed receipts')
 if(!unsafeReceiptWording(neutral))return neutral
 return neutral.replace(/\b(?:gave|gives|donated|donates|funded|funds|lent)\b/gi,'was the source of disclosed receipts to')
  .replace(/\b(?:giving|funding|lending)\b/g,'disclosed receipts')
  .replace(/\b(?:gifts?|donations?)\b/g,'disclosed receipts')
}
