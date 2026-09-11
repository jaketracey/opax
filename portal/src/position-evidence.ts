import { evidenceExcerpt, guardPositionAnswer, EVIDENCE_GAP_ANSWER } from './ask-evidence'

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
