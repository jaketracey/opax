/** Explicit financial-year labels use the graph's starting-year key. */
export function receiptPeriodQuery(input: string): {query:string; error?:string} {
  input=input.replace(/\bFY(?=(?:19|20)\d{2})/gi, 'FY ')
  let error: string | undefined
  const clarify = 'Use a financial year such as 2020–21, or a range such as 2020 to 2022 (financial years starting in those years).'
  if (/\b(?:19|20)\d{2}[-/.]\d{1,2}[-/.]\d{1,2}\b|\b\d{1,2}[-/.]\d{1,2}[-/.](?:19|20)\d{2}\b|\b(?:calendar|January|February|March|April|May|June|July|August|September|October|November|December|Jan|Feb|Mar|Apr|Jun|Jul|Aug|Sep|Sept|Oct|Nov|Dec|quarters?|Q[1-4]|H[12]|months?|weeks?|days?|(?:first|second|1st|2nd) half)\b/i.test(input)) return {query:input,error:'These records are grouped by financial year, so I cannot calculate that shorter or calendar-year period. '+clarify}
  input=input.replace(/\b(?:financial[ -]year|FY)\s+(?:ending|ended)\s+((?:19|20)\d{2})\b/gi, (_, end) => String(Number(end)-1))
  if (/\b(?:ending|ended)\b/i.test(input)) return {query:input,error:clarify}
  const labelled = /\b(?:FY|financial[ -]years?)\s*/i.test(input)
  // A slash or short ending identifies one FY. A full dashed pair without
  // an FY label could be a range: ask, rather than silently pooling years.
  const query = input.replace(/\b((?:19|20)\d{2})\s*([/–—‑-])\s*((?:19|20)\d{2}|\d{2})\b/g, (match, startText, separator, endText) => {
    const start = Number(startText), end = Number(endText)
    const consecutive = endText.length === 2 ? (start + 1) % 100 === end : start + 1 === end
    if (!consecutive || !(separator === '/' || endText.length === 2 || labelled)) { error = clarify; return match }
    return startText
  }).replace(/\bFY\s*(?=(?:19|20)\d{2}\b)/gi, '')
    .replace(/\bfinancial[ -]years?\s*/gi, '')
  return {query, ...(error ? {error} : {})}
}

export const financialYear = (year:number) => `${year}–${String(year + 1).slice(-2)}`

export const separateReceiptYears = (query:string) => [...query.matchAll(/\b(?:19|20)\d{2}\b/g)].length===2
  && !/\bbetween\s+(?:19|20)\d{2}\s+and\s+(?:19|20)\d{2}\b|\b(?:19|20)\d{2}\s+(?:to|through|until)\s+(?:19|20)\d{2}\b/i.test(query)
