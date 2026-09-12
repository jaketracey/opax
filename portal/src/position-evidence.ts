import { evidenceExcerpt, guardPositionAnswer, EVIDENCE_GAP_ANSWER } from './ask-evidence'

export const isPositionDurationQuestion = (question:string):boolean => /^(?:and\s+)?how\s+long\b|\b(?:duration|how many (?:days|weeks|months|years))\b/i.test(question.trim())
export const isPositionEligibilityQuestion = (question:string):boolean => /\b(?:eligible|eligibility|qualify|qualifies)\b/i.test(question)
export const isPositionCostQuestion = (question:string):boolean => /\b(?:cost|costing|price)\b|^(?:and\s+)?how\s+much\b/i.test(question)
const eligibilityTerms = /\b(?:eligible|eligibility|qualifying|qualify|qualifies)\b/i
const deferredEligibility = (text:string) => text.split(/(?<=[.!?])\s+/).filter(sentence=>/\b(?:eligibility|incomes?|thresholds?)\b.*\b(?:regulations|to be (?:set|specified|determined))\b/i.test(sentence))

/** Separate verbatim excerpts keep an eligibility statement and any deferred
 * threshold visible without pretending intervening text was contiguous. */
export function positionEligibilityQuotes(text:string,query:string):string[] {
  const turn=firstSpeechTurn(text).replace(/\s+/g,' ').trim()
  const sentences=turn.split(/(?<=[.!?])\s+(?=[\p{Lu}“‘"'])/u)
  const quote=sentences.find(sentence=>sentence.length>=45&&sentence.length<=700&&eligibilityTerms.test(sentence)&&positionEvidence(turn.slice(Math.max(0,turn.indexOf(sentence)-300),turn.indexOf(sentence)+sentence.length+300),query))
  if(!quote)return []
  const condition=deferredEligibility(turn).find(sentence=>sentence!==quote&&sentence.length<=700)
  return condition?[quote,condition]:[quote]
}

/** Keep a proposal and its explicitly linked cost in one contiguous excerpt.
 * An opponent's budget or a cost elsewhere in the speech cannot fill the gap. */
export function positionCostQuote(text:string,query:string):string {
  const topic=query.replace(/\b(?:cost|costing|price)\b/gi,'').trim()
  if(!topic)return ''
  const turn=firstSpeechTurn(text).replace(/\s+/g,' ').trim()
  const proposal=positionProposalQuote(turn,topic)
  if(!proposal)return ''
  const following=turn.slice(turn.indexOf(proposal)+proposal.length).trim().split(/(?<=[.!?])\s+(?=[\p{Lu}“‘"'])/u)
  let quote=proposal
  for(const sentence of following.slice(0,3)) {
    if(quote.length+sentence.length+1>1400)return ''
    if(!/^(?:This|It|Our)\b/.test(sentence)||/\b(?:another|different|separate|alternative|instead)\b/i.test(sentence))return ''
    if(/\b(?:Labor|Liberal|Greens|Nationals|Coalition|opposition)\b|\bgovernment['’]s\b/i.test(sentence))return ''
    quote+=' '+sentence
    if(/^(?:This|Our)\s+(?:plan|proposal|policy|measure|scheme|programme?|moratorium)\s+(?:will|would|is expected to)\s+cost\s+\$\d/i.test(sentence))return quote
    if(!/^This (?:(?:will|would)\b|(?:policy|proposal|measure|moratorium) is part of our plan\b)/.test(sentence))return ''
    if(/\b(?:propos(?:e|es|ed)|announc(?:e|es|ed)|new (?:plan|policy|scheme)|cost|costs|budget|fund)\b/i.test(sentence))return ''
  }
  return ''
}

/** Match time attached to a measure, not an estimate's costing horizon or an
 * unrelated date in the speech. Deliberately conservative, not an NLP parser. */
function proposalDurations(text:string):string[] {
  const words=['one','two','three','four','five','six','seven','eight','nine','ten','eleven','twelve']
  const amount=`(?:\\d+(?:\\.\\d+)?|${words.join('|')})`, unit='(?:day|week|month|year)', measure='(?:moratorium|freeze|ban|exemption|trial|scheme|programme?|policy|measure|proposal|amendment)'
  const value=text.toLowerCase().replace(/[–—‑]/g,'-'),found:string[]=[]
  const patterns=[
    new RegExp(`\\b(${amount})[ -](${unit})s?[ -](?:(?:gst|tax|housing|rental|income tax|stamp duty)[ -])?${measure}\\b`,'g'),
    new RegExp(`\\b(?:${measure}|it)\\s+(?:(?:would|will|shall)\\s+)?(?:last|lasts|lasted|run|runs|ran|apply|applies|remain in (?:place|effect))\\s+(?:for\\s+)?(${amount})\\s+(${unit})s?\\b`,'g'),
    new RegExp(`\\b${measure}\\s+(?:for|lasting)\\s+(${amount})\\s+(${unit})s?\\b`,'g'),
  ]
  for(const pattern of patterns)for(const m of value.matchAll(pattern))found.push(`${words.includes(m[1])?words.indexOf(m[1])+1:Number(m[1])}:${m[2]}`)
  return found
}

/** Older imports can contain several speakers under the first speaker's name.
 * Stop conservatively at the first turn boundary; never attribute later turns
 * from the document title alone. This does not repair the underlying record.
 */
export function firstSpeechTurn(text: string): string {
  const value = text.replace(/\r\n?/g, '\n').trim()
    .replace(/^\d{1,2}[:.]\d{2}\s*(?:am|pm)\s*\n+/i, '')
  const boundary = /\(Time expired\)|\n\s*\n\s*(?:\d{1,2}[:.]\d{2}\s*(?:am|pm)\b|(?:I|We) thank (?:Senator|the (?:member|minister))\b|(?:Senator|Mr|Ms|Mrs|Dr)\s+[A-Z][\p{L}'’-]+(?:\s+[A-Z][\p{L}'’-]+){0,3}\s*[:,]|The (?:PRESIDENT|SPEAKER|DEPUTY SPEAKER)\b)/iu.exec(value)
  return value.slice(0, boundary?.index ?? value.length).trim()
}

/** Only the matching person's original first turn can feed a position summary. */
export function positionEvidence(text: string, query: string): string {
  if (!text || text.length > 500_000) return ''
  const turn = firstSpeechTurn(text)
  // Reuse the same conservative topic check before paying for generation.
  const guarded = guardPositionAnswer({answer:'candidate',retrieval_results:{resources:{source:{fields:{body:{paragraphs:{'source/t/body':{text:turn}}}}}}}},
    {query,prompt:{system:'You explain Australian politicians’ documented positions from primary records.'}})
  if (guarded.answer === EVIDENCE_GAP_ANSWER) return ''
  if (turn.length <= 5600) return turn.length >= 45 ? turn : ''
  // A long introduction can outscore the actual proposal on topic mentions.
  // Start near an explicit proposal, retaining context and its following terms.
  const proposal = /\b(?:I (?:propose|proposed|recommend|recommended)|My (?:proposed (?:law|bill|legislation)|(?:first |second )?amendment)|This (?:bill|legislation) will)\b/i.exec(turn)
  if (proposal) {
    const start = Math.max(0, proposal.index - 400)
    const candidate = turn.slice(start ? turn.indexOf(' ', start) + 1 : 0)
    const window = evidenceExcerpt(candidate, '', 5600).text
    const relevant = guardPositionAnswer({answer:'candidate',retrieval_results:{resources:{source:{fields:{body:{paragraphs:{'source/t/body':{text:window}}}}}}}},
      {query,prompt:{system:'You explain Australian politicians’ documented positions from primary records.'}})
    if (relevant.answer !== EVIDENCE_GAP_ANSWER) return (start ? '… ' : '') + window
  }
  const excerpt = evidenceExcerpt(turn, query+' proposed propose require obligation definition', 5600)
  return excerpt.text.length >= 45 ? excerpt.text : ''
}

/** A useful verbatim fallback, limited to an explicit, on-topic proposal.
 * Do not use procedural openings or an arbitrary top-ranked passage.
 */
export function positionProposalQuote(text: string, query: string, question = ''): string {
  const sentences = firstSpeechTurn(text).replace(/\s+/g, ' ').trim().split(/(?<=[.!?])\s+(?=[\p{Lu}“‘"'])/u)
  const proposal = /\b(?:I|we)\s+(?:propose|proposed|recommend|recommended)|\b(?:my|our)\s+propos(?:al|ed)|\bthis\s+(?:bill|legislation)\s+(?:will|would)|\b(?:announces?|announced)\s+a\s+policy|\bpolicy\s+is\s+to\b|\b(?:moratorium|amendment)\b/i
  const at = sentences.findIndex(sentence => sentence.length >= 45 && sentence.length <= 700 &&
    proposal.test(sentence) && positionEvidence(sentence, query) &&
    (!isPositionDurationQuestion(question) || proposalDurations(sentence).length>0))
  if (at < 0) return ''
  let quote = sentences[at]
  // Preserve immediately following qualifications such as a cap increasing
  // when capacity permits. Keep the quotation contiguous and bounded.
  for (const next of sentences.slice(at + 1, at + 3)) {
    if (!/^(?:When|If|Provided|Subject to|Unless)\b/i.test(next) || quote.length + next.length + 1 > 700) break
    quote += ' ' + next
  }
  return quote
}

/** A number elsewhere in a long speech cannot support a different quoted claim.
 * This conservative check is not semantic entailment; rejected drafts can still
 * use the verified proposal quotation without another model call. */
export function positionPointSupported(text: string, evidence: string, question: string, date = ''): boolean {
  // Eligible groups are easy to expand accidentally in a paraphrase. These
  // detail answers use the separate original eligibility excerpts instead.
  if(isPositionEligibilityQuestion(question))return false
  const words = ['zero','one','two','three','four','five','six','seven','eight','nine','ten','eleven','twelve','thirteen','fourteen','fifteen','sixteen','seventeen','eighteen','nineteen']
  const numbers = (value: string) => value.toLowerCase()
    .replace(new RegExp(`\\b(${words.join('|')})\\b`, 'g'), word => String(words.indexOf(word)))
    .match(/\d+(?:[,.]\d+)*|\b(?:twenty|thirty|forty|fifty|sixty|seventy|eighty|ninety|hundred|thousand|million|billion)\b/g)
    ?.map(number => /^\d/.test(number) ? String(Number(number.replaceAll(',', ''))) : number) || []
  // Only numbers in the quoted excerpt count: a neighbouring sentence's figure
  // cannot support a different claim (the prompt asks the model to quote every
  // number it states, so "after 2030" belongs inside the excerpt).
  const allowed = new Set(numbers(evidence))
  // A source's August date is not evidence for an eight-year policy. Permit
  // its year only as a date phrase ("in 2014", "the 2014 budget"), never as a
  // policy quantity ("2025 per year").
  const year = /^\d{4}/.exec(date)?.[0]
  const claim = year ? text.replace(new RegExp(`\\b(?:in|from|the|his|her|their|of|since|before|after|during|by|until|a)\\s+(?:(?:his|her|their|the)\\s+)?${year}\\b`, 'gi'), '') : text
  if (numbers(claim).some(number => !allowed.has(number))) return false
  if (isPositionDurationQuestion(question)) {
    const durations=proposalDurations(text),supported=new Set(proposalDurations(evidence))
    if(!durations.length || durations.some(duration=>!supported.has(duration)))return false
  }
  if (/\b(?:cap|limit)\b/i.test(question) && [text,evidence].some(value => !/\b(?:cap(?:ped|ping)?|limit(?:ed)?|maximum|up to)\b/i.test(value))) return false
  if (/\b(?:whichever|if that is|if this is)\s+lower\b/i.test(evidence) && !/\blower\b/i.test(text)) return false
  return true
}

/** Repair a missing root brace and source whitespace only, never wording or IDs.
 * Imported HTML sometimes joins link text to its next word ("GSTbeing").
 * Restore the exact original excerpt before the normal citation validator runs.
 */
export function normalizePositionDraft(answer: string, sources: {id:string;snippet:string}[]): string {
  const value = answer.trim().replace(/^```(?:json)?\s*/i,'').replace(/\s*```$/,'')
  let draft: {points?: {citations?: {id?:string;quote?:string}[]}[]}
  try { draft = JSON.parse(value) }
  catch { try { draft = JSON.parse(value.endsWith(']') ? value+'}' : value) } catch { return answer } }
  const normal = (s:string) => s.normalize('NFKC').replace(/[‘’]/g,"'").replace(/[“”]/g,'"')
  for (const point of Array.isArray(draft?.points) ? draft.points : []) {
    for (const citation of Array.isArray(point?.citations) ? point.citations : []) {
      const source = sources.find(s => s.id === citation?.id)
      if (!source || typeof citation.quote !== 'string' || citation.quote.length > 700) continue
      let compact = '', offset = 0
      const spans: {start:number;end:number}[] = []
      for (const char of source.snippet) {
        for (const folded of normal(char)) if (!/\s/u.test(folded)) {
          compact += folded
          // indexOf offsets are UTF-16; keep both halves mapped for astral chars.
          for (let i=0;i<folded.length;i++) spans.push({start:offset,end:offset+char.length})
        }
        offset += char.length
      }
      const quote = normal(citation.quote).replace(/\s/gu,'')
      const at = quote ? compact.indexOf(quote) : -1
      if (at >= 0) citation.quote = source.snippet.slice(spans[at].start,spans[at+quote.length-1].end)
    }
  }
  return JSON.stringify(draft)
}
