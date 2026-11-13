/** The requested unit of an answer, independent of the model's choice of lookup. */
export function speechRankingGrain(question: string): 'speaker' | 'party' | undefined {
  if (!/\b(?:spoken?|speaks?|speeches|speaking|talked|debated)\b/i.test(question) || !/\b(?:most|least|fewest|top|highest|lowest)\b/i.test(question)) return
  if (/\b(?:which|what)\s+(?:\w+\s+){0,2}part(?:y|ies)\b|\b(?:rank|ranking)\s+(?:the\s+)?parties\b/i.test(question)) return 'party'
  if (/\bwho\b|\b(?:members?|mps?|senators?|people|speakers?|politicians?|parliamentarians?)\b/i.test(question)) return 'speaker'
}

export function broadTopicOverview(question: string): boolean {
  return /^what\s+(?:has|have|did)\s+(?:the\s+)?(?:(?:Australian|federal|state)\s+)?(?:parliament|senate|house|parliamentarians|members|MPs|senators)\s+(?:said|say|spoken)\s+(?:about|on)\s+/i.test(question)
}

export function partyPolicyTopic(question: string): string | undefined {
  // A specific bill, division or date retains exact lookup semantics.
  if (/\b(?:19|20)\d{2}\b|\b(?:this|that|the) (?:bill|division|motion)\b/i.test(question)) return
  return /\b(?:voted?|voting)\s+on\s+(?:the\s+)?(.+?)\s+(?:bills|legislation|motions)\s*[?.!]*$/i.exec(question)?.[1]?.trim()
}

/** These are discovery hints, never permission to widen the question's final scope. */
export const overviewContextOnly = (text: string): boolean => /\b(?:was first introduced|received royal assent|passed both houses|recorded sponsor|recorded sponsors|has recorded status)\b/i.test(text)

/** Retrieval terms, never answering facts. Explicit periods and state scopes take precedence. */
export function overviewSearchPlan(question: string, dated = false, jurisdiction?: string): {query:string;since:string;until?:string;jurisdiction:string}[] {
  if (!broadTopicOverview(question) || dated || jurisdiction && jurisdiction !== 'federal' || !/murray\s*[–-]?\s*darling\s+basin/i.test(question)) return []
  return [
    {query:'Murray-Darling Basin Water Act 2007',since:'2006-01-01',until:'2010-12-31',jurisdiction:'federal'},
    {query:'Basin Plan water buybacks recovery Restoring Our Rivers',since:'2013-01-01',jurisdiction:'federal'},
    {query:'Murray-Darling Basin Plan sustainable diversion limits',since:'2011-01-01',until:'2013-12-31',jurisdiction:'federal'},
  ]
}

export function personOverviewHint(question: string, people: readonly string[], billSpeech = false): string {
  return people.length === 1 && !billSpeech && /^what\b.*\b(?:said|say|spoken)\b/i.test(question)
    ? 'For this named-person topic overview give 4 to 6 dated points from different verified speeches when available. Name the speaker and anchor each point in a short verbatim phrase. Keep each point under 40 words and omit details absent from its own passage. ' : ''
}

export function overviewResearchHint(question: string, dated = false): string {
  if (!broadTopicOverview(question)) return ''
  const subject = question.replace(/^.*?\b(?:about|on)\s+/i, '').replace(/[?!.]+$/, '')
  return `This is a broad topic overview. Gather distinct records across years and kinds before answering. Start independent corpus_records searches for ${JSON.stringify(subject)}, plus find_records with kind bill and kind report using the core subject words. ${dated ? '' : 'Run one speech query with until 2012-12-31 and another with since 2013-01-01, in parallel, to avoid one era dominating.'} Read committee passages where available. Refine with the bill/report titles and policy threads found, using since/until rather than repeating the same ranked sample. Aim for 4 to 8 short cited points on substantive policy threads: the framework, proposed changes, implementation and disputes, with dates and attribution. Bill introduction, sponsor and status dates are research context, not standalone answers to what parliament said. Once four relevant records span different years and threads, answer after at most two discovery rounds; use at most eight lookups for the overview. Name the source speaker and date in each point, anchor the policy argument in a short verbatim quotation, and keep it under 40 words. Use policy names present in each point’s cited passage. Prefer substantive mechanisms and implementation concerns over generic geography or party praise. Choose a clean passage or paraphrase with the subject's spelling. Titles and quoted words retain their source punctuation. Stop within the existing call, time and cost budget.`
}
