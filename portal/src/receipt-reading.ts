import {financialYear} from './receipt-period'
import {questionSpaces} from './question-text.mjs'

/**
 * Turns the period a reader typed into an explicit financial-year window.
 *
 * Receipt records are grouped by financial year (keyed by the year it
 * starts). Readers say "since 2023", "the last few years" or "January 2021".
 * Each of those has a natural reading: this module picks it, rewrites the
 * question to an explicit window the calculator already understands
 * ("from 2022 to 2024", "in 2024"), and returns a one-line statement of the
 * reading plus the other readings as one-tap options. The calculator then
 * answers with figures every time.
 */
export type PeriodOption = {label:string; from:number|null; to:number|null}
export type PeriodReading = {query:string; reading?:string; options:PeriodOption[]}

type YearGraph = {meta?:Record<string,unknown>; edges:{byYear?:Record<string,unknown>; by_type_year?:Record<string,unknown>; flow?:string; grant?:boolean}[]}

/** The latest financial year the graph publishes, by its starting year. */
export function latestReceiptYear(graph:YearGraph):number|undefined {
  const typed=graph.meta?.receipt_types as {available?:boolean;annual_financial_years?:unknown[]}|undefined
  const annual=typed?.available&&Array.isArray(typed.annual_financial_years)?typed.annual_financial_years.map(y=>Number(String(y).slice(0,4))).filter(Number.isFinite):[]
  if(annual.length)return Math.max(...annual)
  let latest=-Infinity
  for(const edge of graph.edges) {
    if(edge.flow||edge.grant)continue
    for(const key of Object.keys(edge.byYear||{})){const y=Number(key);if(Number.isFinite(y))latest=Math.max(latest,y)}
    // Typed cells are keyed by financial year ("2024-25").
    for(const key of Object.keys(edge.by_type_year||{})){const m=/^((?:19|20)\d{2})-\d{2}$/.exec(key);if(m)latest=Math.max(latest,Number(m[1]))}
  }
  return Number.isFinite(latest)?latest:undefined
}

/** The earliest financial year the graph publishes, by its starting year. */
export function earliestReceiptYear(graph:YearGraph):number|undefined {
  const typed=graph.meta?.receipt_types as {available?:boolean;annual_financial_years?:unknown[]}|undefined
  const annual=typed?.available&&Array.isArray(typed.annual_financial_years)?typed.annual_financial_years.map(y=>Number(String(y).slice(0,4))).filter(Number.isFinite):[]
  if(annual.length)return Math.min(...annual)
  let earliest=Infinity
  for(const edge of graph.edges) {
    if(edge.flow||edge.grant)continue
    for(const key of Object.keys(edge.byYear||{})){const y=Number(key);if(Number.isFinite(y))earliest=Math.min(earliest,y)}
    for(const key of Object.keys(edge.by_type_year||{})){const m=/^((?:19|20)\d{2})-\d{2}$/.exec(key);if(m)earliest=Math.min(earliest,Number(m[1]))}
  }
  return Number.isFinite(earliest)?earliest:undefined
}

const span=(from:number,to:number)=>from===to?financialYear(from):`${financialYear(from)} to ${financialYear(to)}`
const explicit=(from:number,to:number)=>from===to?`in ${from}`:`from ${from} to ${to}`
const MONTHS=['january','february','march','april','may','june','july','august','september','october','november','december']
const MONTH_RE='(?:jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|june?|july?|aug(?:ust)?|sept?(?:ember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)'
const monthIndex=(word:string)=>MONTHS.findIndex(m=>m.startsWith(word.toLowerCase().slice(0,3)))
/** The financial year (by starting year) that contains a calendar month. */
const fyOf=(year:number,month:number)=>month>=6?year:year-1
const WORD_NUMBERS:Record<string,number>={one:1,two:2,three:3,four:4,five:5,six:6,seven:7,eight:8,nine:9,ten:10,few:3,several:3,couple:2,'couple of':2,'number of':3}
const countWord=(n:number)=>['','one','two','three','four','five','six','seven','eight','nine','ten'][n]??String(n)
const YEAR='(?:19|20)\\d{2}'
const LEAD='(?:\\b(?:in|during|for|over|across|on|between|from|to|and|of) )?(?:the )?'

function tidy(text:string) {
  return questionSpaces(text).replace(/ ([?!.,])/g,'$1')
}
/** Put the window where the question's period was, or at the end before its punctuation. */
function place(text:string, window:string, at?:number) {
  if(at!==undefined)return tidy(text.slice(0,at)+' '+window+' '+text.slice(at))
  let end=text.length
  while(end&&'?!. '.includes(text[end-1]))end--
  return tidy(text.slice(0,end)+' '+window+text.slice(end))
}

/** Calendar dates, months, quarters and halves read as the financial years that contain them. */
function calendarPeriod(text:string):{text:string;years:number[];at:number}|null {
  const years:number[]=[]
  let at:number|undefined
  const cut=(re:RegExp,fy:(m:RegExpExecArray)=>number[])=>{
    text=text.replace(re,(...args)=>{
      const m=args.slice(0,-2) as unknown as RegExpExecArray,offset=args[args.length-2] as number
      years.push(...fy(m));at=at===undefined?offset:Math.min(at,offset);return ' '
    })
  }
  // Year-first and day-first dates.
  cut(new RegExp(LEAD+'\\b('+YEAR+')[-/.](\\d{1,2})[-/.](\\d{1,2})\\b','gi'),m=>[fyOf(Number(m[1]),Number(m[2])-1)])
  cut(new RegExp(LEAD+'\\b(\\d{1,2})[-/.](\\d{1,2})[-/.]('+YEAR+')\\b','gi'),m=>[fyOf(Number(m[3]),Number(m[2])-1)])
  // "year ending June 2021" is the year that contains that June.
  text=text.replace(/\b(?:(?:the )?(?:financial |fiscal )?year )?(?:ending|ended) (?=(?:\d{1,2} )?(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec))/gi,' ')
  // "January to June 2020", "March 2021", "1 July 2022".
  cut(new RegExp(LEAD+'\\b(?:\\d{1,2} )?('+MONTH_RE+')\\b(?: \\d{1,2}(?:st|nd|rd|th)?)?(?: ?(?:to|until|through|and|-|–) ?(?:\\d{1,2} )?('+MONTH_RE+')\\b)?,? ('+YEAR+')\\b','gi'),m=>{
    const y=Number(m[3]),first=fyOf(y,monthIndex(m[1]))
    return m[2]?[first,fyOf(y,monthIndex(m[2]))]:[first]
  })
  cut(new RegExp(LEAD+'\\bcalendar(?: year)? ('+YEAR+')\\b','gi'),m=>[Number(m[1])-1,Number(m[1])])
  cut(new RegExp(LEAD+'\\b(Q[1-4]|H[12]|(?:the )?(?:first|second|1st|2nd) half(?: of)?) ('+YEAR+')\\b','gi'),m=>{
    const y=Number(m[2]),early=/^(?:q[12]|h1|(?:the )?(?:first|1st))/i.test(m[1])
    return [early?y-1:y]
  })
  if(!years.length)return null
  return {text,years,at:at!}
}

/**
 * Read the period in a question. `latest` is the latest published financial
 * year (starting year). A question that already names an explicit window
 * returns unchanged, so this can run more than once.
 */
export function readReceiptPeriod(question:string, latest:number|undefined, options:{compare?:boolean}={}):PeriodReading {
  if(latest===undefined)return {query:question,options:[]}
  // One space between words, so every pattern below matches single spaces (no backtracking runs).
  let text=questionSpaces(question).replace(/\bFY(?=(?:19|20)\d{2})/gi,'FY ')
  const allYears:PeriodOption={label:'All years',from:null,to:null}
  const latestOnly:PeriodOption={label:`${financialYear(latest)} only`,from:latest,to:latest}
  const clamp=(y:number)=>Math.min(y,latest)

  // 1. Calendar dates, months, quarters and halves.
  const calendar=calendarPeriod(text)
  if(calendar) {
    const from=clamp(Math.min(...calendar.years)),to=clamp(Math.max(...calendar.years))
    return {query:place(calendar.text,explicit(from,to),calendar.at),
      reading:`These records are grouped by financial year, so this reads the period as ${span(from,to)}, the financial ${from===to?'year that contains':'years that contain'} it.`,
      options:[allYears,...(from!==to?[{label:`${financialYear(to)} only`,from:to,to}]:[]),...(to!==latest?[latestOnly]:[])]}
  }

  // 2. Dashed year pairs that are not a single labelled financial year.
  const labelled=/\b(?:FY|financial[ -]years?)\b/i.test(text)
  const pairReadings:string[]=[],pairOptions:PeriodOption[]=[]
  // A leading preposition is replaced along with the label, so the window reads cleanly.
  text=text.replace(new RegExp('(\\b(?:in|during|for|over|across) (?:the )?)?\\b('+YEAR+') ?([/–—‑-]) ?('+YEAR+'|\\d{2})\\b','gi'),(whole,lead,a,sep,b)=>{
    const match=whole.slice((lead??'').length)
    const start=Number(a),end=b.length===2?Math.floor(start/100)*100+Number(b)+(Number(b)<start%100?100:0):Number(b)
    if(end===start+1&&(sep==='/'||b.length===2||labelled))return whole
    if(end===start+1||end===start){
      pairReadings.push(`Reading ${match} as the ${financialYear(start)} financial year.`)
      if(end>start)pairOptions.push({label:`${financialYear(start)} and ${financialYear(end)}`,from:start,to:end})
      return `in ${start}`
    }
    if(end>start+1){
      pairReadings.push(`Reading ${match} as the ${span(start,end-1)} financial years.`)
      pairOptions.push({label:`${span(start,end)}`,from:start,to:end})
      return `from ${start} to ${end-1}`
    }
    return whole
  })
  if(pairReadings.length)return {query:tidy(text),reading:pairReadings.join(' '),options:[allYears,...pairOptions]}

  // 3. Relative periods. Remove the phrase; an explicit year elsewhere in the
  // question takes precedence over it.
  let relative:{from:number;to:number;reading:string;options:PeriodOption[]}|undefined
  const relativeRead=(re:RegExp,read:(m:RegExpExecArray)=>{from:number;to:number;reading:string;options:PeriodOption[]})=>{
    text=text.replace(re,(...args)=>{const m=args.slice(0,-2) as unknown as RegExpExecArray;relative??=read(m);return ' '})
  }
  const lastN=(n:number,phrase:string)=>{
    n=Math.max(1,Math.min(n,40))
    const from=latest-n+1
    return {from,to:latest,reading:n===1?`Reading ${phrase} as ${financialYear(latest)}, the latest published disclosure year.`
      :`Reading ${phrase} as the last ${countWord(n)} published disclosure years, ${span(from,latest)}.`,
      options:[allYears,...(n!==1?[latestOnly]:[]),...(n!==5?[{label:'Last five years',from:latest-4,to:latest}]:[])]}
  }
  const quote=(s:string)=>'“'+s.trim().replace(/\s+/g,' ')+'”'
  relativeRead(new RegExp(LEAD+'\\b(?:last|past|previous|recent) (\\d{1,2}|one|two|three|four|five|six|seven|eight|nine|ten|few|several|couple(?: of)?|number of) (?:financial |disclosure )?years\\b','gi'),
    m=>lastN(/^\d/.test(m[1])?Number(m[1]):WORD_NUMBERS[m[1].toLowerCase().replace(/\s+/g,' ')]??3,quote(m[0])))
  relativeRead(new RegExp(LEAD+'\\bthis decade\\b','gi'),m=>({from:Math.min(2020,latest),to:latest,reading:`Reading ${quote(m[0])} as ${span(Math.min(2020,latest),latest)}, the disclosure years since 1 July 2020.`,options:[allYears,latestOnly]}))
  relativeRead(new RegExp(LEAD+'\\b(?:last|past|previous) decade\\b','gi'),m=>lastN(10,quote(m[0])))
  relativeRead(new RegExp(LEAD+'\\b(?:last|past|previous|this|current|latest|most recent) (?:financial |disclosure |fiscal )?year\\b','gi'),m=>lastN(1,quote(m[0])))
  relativeRead(new RegExp(LEAD+'\\b(?:last|past|previous) (?:\\d{1,2} |few |several |couple of )?(?:months?|weeks?|days?|quarters?)\\b','gi'),m=>lastN(1,quote(m[0])))
  relativeRead(new RegExp(LEAD+'\\b(?:recent(?:ly| years| times)?|lately|of late|these days|nowadays)\\b','gi'),m=>lastN(3,quote(m[0])))
  relativeRead(new RegExp(LEAD+'\\b(?:last|past|latest|previous)\\b(?! (?:'+YEAR+'))','gi'),m=>lastN(3,quote(m[0])))

  // 4. Open-ended starts: "since 2023", "from 2023", "2023 onwards", "after 2022".
  // A calendar year starts at the financial year that contains 1 January of
  // it; a labelled financial year ("since 2023–24") starts at that year.
  let since:{from:number;reading:string;options:PeriodOption[];at:number}|undefined
  const startRe=new RegExp('\\b(since|from|after|starting(?: (?:in|from))?|beginning(?: (?:in|from))?) (?:the )?(?:(FY|financial years?) ?)?('+YEAR+')( ?[/–—‑-] ?(?:'+YEAR+'|\\d{2}))?(?: (?:onwards?|and later|to date|to now|to the present))?\\b(?! ?[/–—‑-] ?\\d| ?(?:to|through|until|and|or|vs|versus|than) (?:the )?(?:FY ?)?'+YEAR+')','gi')
  const onwardsRe=new RegExp('\\b(?:(FY|financial years?) ?)?('+YEAR+')( ?[/–—‑-] ?(?:'+YEAR+'|\\d{2}))? (?:onwards?|and later|and after|to date|to now)\\b','gi')
  const startRead=(word:string,label:string|undefined,yearText:string,suffix:string|undefined,offset:number)=>{
    const year=Number(yearText),fy=!!(label||suffix)
    const after=/^after/i.test(word)
    const from=clamp(fy?year+(after?1:0):after?year:year-1)
    const phrase=quote(`${word} ${label?label+' ':''}${yearText}${suffix??''}`)
    // A calendar year starts at the financial year that includes its January.
    const reading=`Reading ${phrase} as the ${span(from,latest)} disclosure years.`
    // The other start is offered only when it differs from the reading taken.
    const alt=!fy&&year<=latest&&year!==from?[{label:`${financialYear(year)} onwards`,from:year,to:latest}]:[]
    since??={from,at:offset,reading,options:[...alt,allYears,...(from!==latest?[latestOnly]:[])]}
  }
  text=text.replace(startRe,(_match,word,label,yearText,suffix,offset)=>{startRead(word,label,yearText,suffix,offset);return '\u0000'})
  text=text.replace(onwardsRe,(_match,label,yearText,suffix,offset)=>{startRead('from',label,yearText,suffix,offset);return '\u0000'})
  if(since) {
    const window=explicit(since.from,latest)
    const placed=text.replace('\u0000',window).replace(/\u0000/g,' ')
    return {query:tidy(placed),reading:since.reading,options:since.options}
  }

  // Labelled financial years ("2020–21") count once, by their starting year.
  const collapsed=text.replace(new RegExp('\\b('+YEAR+') ?[/–—‑-] ?(?:'+YEAR+'|\\d{2})\\b','g'),'$1')
  const years=[...collapsed.matchAll(new RegExp('\\b'+YEAR+'\\b','g'))].map(m=>Number(m[0]))
  if(relative&&!years.length) {
    const r=relative as {from:number;to:number;reading:string;options:PeriodOption[]}
    return {query:place(text,explicit(r.from,r.to)),reading:r.reading,options:r.options}
  }
  if(relative)text=tidy(text)

  // 5. More than two years, or two separate years outside a comparison:
  // read the continuous span they mark out.
  const ranged=new RegExp('\\bbetween (?:FY ?)?'+YEAR+' and (?:FY ?)?'+YEAR+'\\b|\\b'+YEAR+' (?:to|through|until) (?:FY ?)?'+YEAR+'\\b','i').test(collapsed)
  // A comparison keeps its years separate; the comparison reads them.
  if(!options.compare&&(years.length>2||(years.length===2&&!ranged))) {
    const from=Math.min(...years),to=Math.max(...years)
    let first=-1
    const stripped=collapsed.replace(new RegExp('(?:\\b(?:in|during|for|and|or|from|to|between|,) )*\\b'+YEAR+'\\b','gi'),(m,offset:number)=>{if(first<0)first=offset;return ' '})
    return {query:place(stripped,explicit(from,to),first),
      reading:`Reading the years ${years.map(y=>financialYear(y)).join(', ').replace(/, ([^,]*)$/,' and $1')} as the continuous span ${span(from,to)}, including the years between.`,
      options:[allYears,...[...new Set(years)].sort((a,b)=>a-b).map(y=>({label:`${financialYear(y)} only`,from:y,to:y}))]}
  }
  return {query:relative?text:question,options:[]}
}

/**
 * Split a trailing period phrase off a name ("Santos last year" → "Santos",
 * "last year"), so the name is matched on its own and the period is read.
 */
const PERIOD_START=new RegExp('\\b(?:(?:in|during|for|over|across|since|from|after|before|until|through|between|starting|beginning) )?(?:the )?(?:(?:last|past|previous|recent|current|latest|most recent) |this (?:year|decade|financial year)\\b|recently\\b|lately\\b|these days\\b|nowadays\\b|(?:fy ?|financial years? )?'+YEAR+'\\b)','i')
export function splitPeriod(text:string):{text:string;period:string} {
  const spaced=questionSpaces(text),m=PERIOD_START.exec(spaced)
  return m?{text:spaced.slice(0,m.index).trim(),period:spaced.slice(m.index).trim()}:{text:spaced,period:''}
}
