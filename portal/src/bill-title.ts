const normal = (value: unknown) => String(value ?? '').normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim()
export const normalBillTitle = (value: unknown): string => normal(String(value ?? '').replace(/\s*\[(?:19|20)\d{2}\]\s*$/, ''))
export function billTitleMatches(recorded: unknown, requested: string): boolean {
  const title = normalBillTitle(requested), candidate = normalBillTitle(recorded)
  return candidate === title || !/\d{4}$/.test(requested) && candidate.replace(/ (?:19|20)\d{2}(?: \d{2,4})?$/, '') === title
}

/** Only explicit title slots establish a missing bill, never a bag of subject words. */
export function requestedBillTitle(question: string): string | null {
  const prefix = /\b(?:who\s+(?:introduc\w*|sponsor\w*|wrote)|(?:status|sponsor|portfolio|text|history|details)\s+of|why\s+was|when\s+was|what\s+(?:happened|became)\s+(?:to|of)|tell me about|(?:vot(?:e|ed|ing)|said|say|debate[ds]?)\s+(?:on|for|against|about))\s+(?:the\s+)?(.+?\bBill(?:\s+\(No\.\s*\d+\))?(?:\s+(?:19|20)\d{2}(?:[-–]\d{2,4})?)?)(?=\s|[?.!,]|$)/i.exec(question)
  const arrival = /\bwhen\s+did\s+(?:the\s+)?(.+?\bBill(?:\s+\(No\.\s*\d+\))?(?:\s+(?:19|20)\d{2}(?:[-–]\d{2,4})?)?)\s+(?:first\s+)?(?:come|enter)\b/i.exec(question)
  const title = (prefix ?? arrival)?.[1]?.replace(/^(?:(?:for|or|against|on|about|the)\s+)+/i, '').trim()
  return title && title.length <= 220 && !/[?!]/.test(title) ? title : null
}
