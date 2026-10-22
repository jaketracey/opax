import {sentenceParts} from './research-claim-audit.mjs'
// Pure answer-shape checks shared by the serving boundary and both evaluation arms.
export const fold = (s) => String(s ?? '').normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/[‘’ʼ`]/g, "'").toLowerCase()
export const plainNumbers = (text) => (String(text ?? '').replace(/https?:\/\/[^\s)]+/g, ' ').replace(/\b((?:19|20)\d{2})-\d{2}-\d{2}\b/g, '$1').replace(/\b((?:19|20)\d{2})[–-]\d{2}\b/g, '$1').replace(/\b\d{1,2}\s+(?:Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:tember)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\s+((?:19|20)\d{2})\b/gi, '$1').replace(/\b\d{1,2}\s+(?:Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:tember)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\b/gi, ' ').replace(/\b(Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:tember)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\s+(\d{1,2}),?\s+((?:19|20)\d{2})\b/gi, '$3').replace(/\b(?:Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:tember)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\s+\d{1,2}\b/gi, ' ').replace(/\[\d+\]/g, ' ').match(/\d[\d,]*(?:\.\d+)?/g) ?? []).map((n) => Number(n.replace(/,/g, '')))
export function amounts(text) {
  const out = []
  for (const m of String(text ?? '').matchAll(/\$\s?(\d[\d,]*(?:\.\d+)?)\s*(billion|bn|million|m\b|k\b|thousand)?/gi)) {
    let v = Number(m[1].replace(/,/g, '')); const u = (m[2] ?? '').toLowerCase()
    if (u === 'billion' || u === 'bn') v *= 1e9; else if (u === 'million' || u === 'm') v *= 1e6; else if (u === 'thousand' || u === 'k') v *= 1e3
    out.push({ v, rounded: Boolean(u) })
  }
  return out
}
const isYear = (n) => Number.isInteger(n) && n >= 1900 && n <= 2035
/** Selected record rows, independent of which comparison arm produced them. */
export function styleRows(ev) {
  const rows=[]
  for(const source of (ev.sources??[]).filter(s=>!['speech','bill'].includes(s.kind)))for(const text of [source.title,source.snippet])if(typeof text==='string')for(const raw of text.split(/\n+/)) {const line=raw.replace(/\*\*/g,'')
    const by=/^(\d[\d,]*) chamber speeches labelled .+? by (.+?)(?: from \d{4}-\d{2}-\d{2}(?: to \d{4}-\d{2}-\d{2})?)?\.?$/.exec(line)
    if(by){rows.push({entity:by[2],value:by[1],text:line});continue}
    const rates=[...line.matchAll(/(?:^|[.\n])\s*[-*]?\s*([^:$;\n.]+):\s*(\$[\d,]+) a year as [^,]+, \d{4}-\d{2}-\d{2} to \d{4}-\d{2}-\d{2}/g)]
    if(rates.length){for(const rate of rates)rows.push({entity:rate[1].trim(),value:rate[2],text:rate[0],salary:true});continue}
    const current=/^(.+?) \([^)]+\), [^:]+: base salary \$[\d,]+ plus a loading of [\d.]+%, (\$[\d,]+) a year/.exec(line)
    if(current){rows.push({entity:current[1],value:current[2],text:line,salary:true});continue}
    const row=/^\s*[-*]?\s*([^:|]{2,120}):\s*(\$?[\d,]+(?:\.\d+)?)/.exec(line)
    if(row&&!/coverage|period|financial years/i.test(row[1]))rows.push({entity:row[1].replace(/\s*\([^)]*\).*$/,'').replace(/\s+(?:received|gave|provided|was awarded|led)\b.*$/i,'').trim(),value:row[2],text:line})
    if(/^\|/.test(line)){const cells=line.split('|').map(x=>x.trim()).filter(Boolean),value=cells.find(x=>/^\$[\d,]+/.test(x)),entity=cells.find(x=>/[a-z]/i.test(x));if(value&&entity)rows.push({entity,value,text:line})}
  }
  return rows.filter((r,i)=>rows.findIndex(x=>x.entity===r.entity&&x.value===r.value)===i)
}
export const styleNormal=s=>fold(s).replace(/[^a-z0-9]+/g,' ').trim()
/** Writing quality is assessed against selected evidence, not fluent-looking prose alone. */
export function answerStyleChecks(question, answer, evidence = {sources:[]}, requirements={}) {
  const plain=String(answer).replace(/\[\d+\]/g,''),sentences=sentenceParts(plain).flatMap(p=>p.text.split(/\n+/)).map(s=>s.replace(/^[-*•]\s*/,'').trim()).filter(Boolean)
  const seen=new Set();let duplicate=false
  for(const sentence of sentences){const k=styleNormal(sentence);if(seen.has(k))duplicate=true;seen.add(k)}
  // Same figure for different people or periods is not a duplicated claim.
  const claims=new Set()
  for(const sentence of sentences)for(const clause of sentence.split(/[,;]?\s+(?:and|while|whereas)\s+(?=(?:the\s+)?(?:\d+(?:st|nd|rd|th)\s+Parliament|[A-Z][\w'’-]*(?:\s+[A-Z][\w'’-]*)*)\s+(?:received|recorded|earned|had|has|was|spoke))/)){
    const entity=/^(?:In \d{4}(?:[–-]\d{2,4})?,?\s+)?(.+?)\s+(?:received|recorded|earned|had|has|was|were|spoke|gave)\b/i.exec(clause)?.[1]
    if(!entity)continue
    const period=(clause.match(/\b(?:19|20)\d{2}(?:[–-]\d{2,4})?\b/g)??[]).join('/')
    const metric=(/salary|pay|earn/i.test(clause)?'salary':/grants?/i.test(clause)?'grants':/contracts?/i.test(clause)?'contracts':/speech|spoke/i.test(clause)?'speeches':/division|vote/i.test(clause)?'votes':'receipts')+'/'+(/housing|gambling|immigration|climate|tax(?:-budget)?|budget/i.exec(clause)?.[0]??'')
    const unit=/per week|weekly/i.test(clause)?'week':/per month|monthly/i.test(clause)?'month':/a year|annual|per year/i.test(clause)?'year':''
    const dated=(clause.match(/\b\d{4}-\d{2}-\d{2}\b|\b\d{1,2} (?:January|February|March|April|May|June|July|August|September|October|November|December)(?: \d{4})?/g)??[]).join('/')
    const values=amounts(clause).length?amounts(clause).map(a=>a.v):plainNumbers(clause).filter(n=>!isYear(n))
    for(const value of values){const signature=styleNormal(entity)+'/'+metric+'/'+unit+'/'+(dated||period)+'/'+value;if(claims.has(signature))duplicate=true;claims.add(signature)}
  }
  const coverage=sentences.filter(s=>/^(?:Coverage:|OPAX.*(?:records|export)|Salary entitlements|These records)|\b(?:exclude[sd]? allowances|not allowances|records start|records cover|coverage (?:is|of))/i.test(s))
  const echo=/Coverage:|\ba year as [^\n]+, \d{4}-\d{2}-\d{2} to \d{4}-\d{2}-\d{2}; base|\|\s*(?:Rank|Parliamentarian|Party|Recipient)\s*\||base \$[\d,]+ plus \d+(?:\.\d+)?%/i.test(answer)
  const first=sentences[0]??'',rows=evidence.ranking_rows?.length?evidence.ranking_rows.map(r=>({entity:r.name,value:r.amount,text:r.name+' '+r.amount})):styleRows(evidence),ranking=/\b(?:highest|lowest|most|least|largest|biggest|top|fewest)\b/i.test(question)
  const limited=/\b(?:cannot|could not|do(?:es)? not|did not) establish\b|\bno (?:reliable|verified|matching)\b|\b(?:records|export).*\b(?:start|does not date)\b|^Please (?:name|give|specify)|^OPAX covers|(?:ranking|total|answer).*cannot be established|no ranking or total can be established|(?:period|records|coverage)[^.]*is not (?:fully )?covered|no [^.]*\b(?:ranking|total|answer)\b[^.]*can be established|private information|no evidence|does not (?:hold|cover)/i.test(first)
  const candidates=ranking&&/\b(?:who|which (?:federal )?(?:politicians?|parliamentarians?|person|party|senators?|MPs|members))\b/i.test(question)?rows.filter(r=>!/^\d{4}$/.test(r.entity)):rows
  const row=ranking&&/paid|salary|pay\b/i.test(question)&&candidates.some(r=>r.salary)?candidates.filter(r=>r.salary).sort((a,b)=>(/lowest|least/i.test(question)?1:-1)*(Number(a.value.replace(/[$,]/g,''))-Number(b.value.replace(/[$,]/g,''))))[0]:candidates[0]
  const speakers=[...new Set((evidence.sources??[]).map(s=>s.speaker).filter(Boolean))]
  const subject=limited||row?limited||styleNormal(first).includes(styleNormal(row.entity)):!speakers.length||speakers.some(n=>styleNormal(first).includes(styleNormal(n)))
  const topic=/\b(mining|gambling|housing|immigration|climate|tax|budget|contracts?|grants?|salary|income)\b/i.exec(question)?.[1]
  const topicalSource=topic&&(evidence.sources??[]).some(s=>s.cited&&s.speaker&&styleNormal(first).includes(styleNormal(s.speaker))&&new RegExp(topic,'i').test([s.title,s.snippet].join(' ')))
  const subjectTopic=limited||!topic||topicalSource||new RegExp(({salary:'salary|paid|pay',grants:'grants?',grant:'grants?',contracts:'contracts?',contract:'contracts?',immigration:'immigration|asylum|migrant|refugee',tax:'tax|GST',housing:'housing|homes?|rent|HAFF'})[topic.toLowerCase()]??topic,'i').test(first)
  const comparative=/compar|versus|\bvs\b|this term.*last term|last term.*this term/i.test(question)||/between/i.test(question)&&/how (?:many|much)|counts?|salary|paid|speeches|contracts?|grants?/i.test(question)
  const relation=limited||(!ranking&&!comparative)||/same|equal|more|fewer|compared|versus|higher|lower|than|highest|lowest|most|least|largest|biggest|top|fewest|led|leader|leads|ahead|ranked|tied/i.test(first)
  const quantitative=ranking||comparative||/how (?:many|much)|salary|paid|contracts?|grants?|median|population/i.test(question)
  const headline=limited||!quantitative||(!row?!amounts(answer).length&&!plainNumbers(answer).some(n=>!isYear(n)):[row.value,...(comparative?[...row.text.matchAll(/([\d.]+)%/g)].map(m=>m[1]):[])].some(v=>plainNumbers(first).includes(Number(v.replace(/[$,]/g,'')))))||!row&&(amounts(first).length>0||plainNumbers(first).some(n=>!isYear(n)))
  const prefix=/^([^.!?]{1,110}):/.exec(first)?.[1],rowLike=!!prefix&&!/\b(?:is|was|are|were|has|have|had|provided|gave|donated|led|recorded|received)\b/i.test(prefix)
  const direct=first.length>12&&first.split(/\s+/).length>=3&&!/^(?:Here|Based on|According to|Coverage:|The (?:data|records|tool|table|figures) show)/i.test(first)&&!/^\|/.test(answer)&&!rowLike&&!/:$/.test(first)&&subject&&subjectTopic&&relation&&headline
  return {no_tool_echo:echo?'fail':'pass',no_duplicates:duplicate||coverage.length>1?'fail':'pass',direct_first_sentence:direct?'pass':'fail'}
}
