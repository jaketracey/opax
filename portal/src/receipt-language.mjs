/** The export has no gift/loan breakdown. Never infer one from an entity name. */
export const FEDERAL_RECEIPTS_NOTE = 'These federal totals mix donations with other receipts such as loans, so this is not a donation ranking.'
export const RECEIPTS_WRITING_RULE = 'Describe unclassified political amounts as disclosed receipts or amounts received, never use donor, donation, gave/given/giving, donate, fund/funder/funding, bankroll, backer, contributor/contribution, gift or sponsor framing. For a federal receipt ranking, state: '+FEDERAL_RECEIPTS_NOTE

/** Old saved facts remain readable; only the neutral form is emitted now. */
export function federalReceiptFact(text) {
 const old=/^(.+?) gave (.+?) (\$[\d,]+(?:\.\d+)?) \(federal disclosures(?:; financial years ([^)]+))?\)/.exec(text)
 const current=/^(.+?) disclosed (\$[\d,]+(?:\.\d+)?) in receipts from (.+?) \(federal disclosures(?:; financial years ([^)]+))?\)/.exec(text)
 return old?{name:old[1],party:old[2],amount:old[3],period:old[4],end:old[0].length}:current?{name:current[3],party:current[1],amount:current[2],period:current[4],end:current[0].length}:null
}

/** All gift framing is unsafe for an unclassified receipt, including superlatives.
 * Only these explicit limitations are exempt; an adjacent positive claim is still checked. */
export function unsafeReceiptWording(text,names=[]) {
 let masked=String(text)
 for(const name of names)masked=masked.replaceAll(name,'ReceiptSource')
 const prose=masked.replaceAll(FEDERAL_RECEIPTS_NOTE,'').replace(/\]\([^)]+\)/g,']').replace(/^\|\s*Donor\s*\|/gm,'| Source |')
  .replace(/\bgive (?:the person's full name|the full name|a full name|your full name)\b/gi,'')
  .replace(/(?:including|include) more than gifts|not all receipts (?:are|being) gifts|not every receipt is a gift|not personal payments or individual gifts|not donations-only|without a gift-only breakdown|a donation is not evidence that it influenced a vote or speech|excludes? government funding/gi,'')
 return /\b(?:donors?|donations?|gave|gives?|given|giving|donat(?:e[ds]?|ing)|fund(?:ed|s|ing|ers?)?|bankroll(?:s|ed|ing)?|backers?|contributors?|contributed|contribut(?:es?|ing|ions?)|gifts?|sponsors?(?:ed|ing)?|lent|lends?|lending)\b/i.test(prose)
}

export function receiptSource(source) {
 if(!source||['speech','bill','pay','grant','contract','count'].includes(source.kind))return false
 return source.kind==='receipt'||/\(federal disclosures|disclosed (?:political |party )?receipts|\|\s*Donor\s*\|\s*Disclosed receipts/i.test(source.snippet??'')
}

export function receiptSourceNames(sources) {
 const names=[]
 for(const source of sources.filter(receiptSource))for(const line of String(source.snippet??'').split('\n')){
  const plain=/^(.+?):\s*\$/.exec(line)
  if(plain&&/[?&]focus=donor(?:%3A|:)/i.test(source.href??source.url??''))names.push(plain[1])
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

/** Whole-sentence templates preserve complete amount literals. Unknown syntax is
 * dropped by the boundary, never patched with a verb-sized substitution. */
export function neutralReceiptSentence(text) {
 if(text.includes(FEDERAL_RECEIPTS_NOTE))return text.split(FEDERAL_RECEIPTS_NOTE).map(neutralReceiptSentence).join(FEDERAL_RECEIPTS_NOTE)
 const garbled=/^(.+?) was the source of disclosed receipts to the most money to (.+)$/.exec(text)
 if(garbled)return `${garbled[1]} was the source of the largest disclosed receipts to ${garbled[2]}`
 const split=/^(.+?) was the source of (\$[\d,]+(?:\.\d+)?) in disclosed receipts (million|billion|thousand|bn|m)(.*)$/.exec(text)
 if(split)return `${split[1]} was the source of ${split[2]} ${split[3]} in disclosed receipts${split[4]}`
 const fact=federalReceiptFact(text)
 if(fact)return `${fact.party} disclosed ${fact.amount} in receipts from ${fact.name} (federal disclosures${fact.period?'; financial years '+fact.period:''})`+text.slice(fact.end)
 if(!unsafeReceiptWording(text))return text
 const intro=/^(In the published federal records, )(.+)$/.exec(text)
 if(intro){const body=neutralReceiptSentence(intro[2]);return body?intro[1]+body.replace(/^The /,'the '):''}
 const amount='\\$[\\d,]+(?:\\.\\d+)?(?:[ \u00a0]*(?:million|billion|thousand|bn|[mkb])\\b)?'
 const action='(?:has |had |have |is |was |are |were )?(?:gave|gives?|given|giving|donat(?:e[ds]?|ing)|fund(?:ed|s|ing)?|bankroll(?:s|ed|ing)?|contributed|contributes?|sponsored|sponsors?|lent)'
 let out=text
 // Source and scope nouns have a precise neutral equivalent, without changing a verb's grammar.
  .replace(/mining-donor receipts/g,'mining-sector receipts')
  .replace(/the next largest (?:disclosed )?donors (?:are|were)/gi,'The next largest disclosed receipts came from')
  .replace(/named donors include/gi,'Named receipt sources include')
  .replace(/\bdonors?\b/gi,m=>m.toLowerCase()==='donors'?'receipt sources':'receipt source')
  .replace(/a donation is not evidence that it influenced a vote or speech/gi,'a recorded receipt is not evidence that it influenced a vote or speech')
  .replace(/AEC donation returns/g,'AEC disclosure returns')
  .replace(/not donations-only or personal payments/g,'without a gift-only breakdown or personal payments')
  .replace(/which parties received the funding/g,'which parties received the receipts')
  .replace(/whether giving occurred/g,'whether receipts occurred')
 out=out.replace(/^(.+?) provided (the most )?disclosed funding(.*)$/i,(_,name,most,tail)=>`${name} was the source of ${most?'the largest ':''}disclosed receipts${tail}`)
 out=out.replace(/^(.+?) received (the most )?(.+? )?funding(.*)$/i,(_,party,most,scope,tail)=>`${party} received ${most??''}${scope??''}receipts${tail}`)
 out=out.replace(/\bdisclosed funding\b/gi,'disclosed receipts')
 if(!unsafeReceiptWording(out))return out
 // These are complete predicate templates, with the amount and scope retained as a unit.
 out=out.replace(new RegExp('^(.+?) '+action+' the most(?: money)? to (.+?)(?= in this |,|\\.|$)(.*)$','i'),(_,name,party,tail)=>`${name} was the source of the largest disclosed receipts to ${party}${tail}`)
 out=out.replace(new RegExp('^(.+?) '+action+' ('+amount+') to (.+?)([.!]|$)$','i'),(_,name,sum,party,end)=>`${party} disclosed ${sum} in receipts from ${name}${end}`)
 out=out.replace(new RegExp('^(.+?) '+action+' (?!\\$)(.+?) (?:with )?('+amount+')(.*)$','i'),(_,name,party,sum,tail)=>`${party.replace(/\s+recorded$/,'')} disclosed ${sum} in receipts from ${name}${tail}`)
 out=out.replace(new RegExp('^(.+?) '+action+' ('+amount+')(.*)$','i'),(_,name,sum,tail)=>`${name} was the source of ${sum} in disclosed receipts${tail.replace(/^ in disclosed (?:political )?receipts/,'')}`)
 out=out.replace(/^No, (.+?) gave to (.+?) in only some years\.$/i,(_,name,party)=>`No, ${party} disclosed receipts from ${name} in only some years.`)
 return unsafeReceiptWording(out)?'':out.replace(/^the /,'The ')
}

/** Mechanical checks used by the complete saved-payload replay. */
export function receiptGrammarFindings(text) {
 const rules=[/receipts to the most/i,/\$[\d,]+(?:\.\d+)?\s+in disclosed receipts\s+(?:million|billion|thousand|bn)\b/i,/^to [^\n]+: disclosed/m,/(?:^|\n)and [^\n]+\$/i,/,,/,/(?:^|\n)the (?:Greens|Nationals) received/,/\breceipts receipts\b/i]
 return rules.filter(rule=>rule.test(text)).map(String)
}
