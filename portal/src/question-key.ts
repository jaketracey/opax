/**
 * When two questions ask the same thing. A suggestion or follow-up offered
 * after an answer is a different question from the one just asked: it differs
 * in more than case, punctuation, spacing or the period phrase.
 *
 * public/app.js carries a copy of this rule between the `question-key` markers
 * for "Ask something else"; test/question-key.test.mjs keeps the two identical.
 */
// question-key:begin
const QUESTION_YEAR = '(?:19|20)\\d{2}(?:\\s*[/–—‑-]\\s*(?:(?:19|20)\\d{2}|\\d{2}))?'
const QUESTION_PERIODS = [
  new RegExp('\\b(?:in|during|for|since|from|after|before|until|through|over|across|between|starting|beginning)?\\s*(?:the\\s+)?(?:fy\\s*|financial\\s+years?\\s+)?' + QUESTION_YEAR + '(?:\\s*(?:to|and|through|until|or|-|–)\\s*(?:the\\s+)?(?:fy\\s*|financial\\s+years?\\s+)?' + QUESTION_YEAR + ')?(?:\\s+(?:onwards?|and\\s+later|to\\s+date|to\\s+now))?', 'gi'),
  /\b(?:in|over|during|for|across)?\s*(?:the\s+)?(?:last|past|previous|recent)\s+(?:\d{1,2}|one|two|three|four|five|six|seven|eight|nine|ten|few|several|couple(?:\s+of)?|number\s+of)?\s*(?:financial\s+|disclosure\s+)?(?:years?|decade|months?|weeks?|days?)\b/gi,
  /\b(?:in|during|for|over)?\s*(?:the\s+)?(?:this|current|latest|most\s+recent)\s+(?:financial\s+)?(?:year|decade)\b/gi,
  /\b(?:in|over|across|for)?\s*(?:all\s+years|all\s+time|recent\s+years|recently|lately|these\s+days|nowadays)\b/gi,
]
export function questionKey(question: string, withoutPeriod = false): string {
  let text = String(question || '').normalize('NFKC').toLowerCase().replace(/[‘’ʼ`]/g, "'")
  if (withoutPeriod) for (const period of QUESTION_PERIODS) text = text.replace(period, ' ')
  return text.replace(/^\s*(?:and|so|ok|okay|please)\s+/, '').replace(/[^a-z0-9']+/g, ' ').replace(/\s+/g, ' ').trim()
}
/** True when `candidate` repeats `asked`, or is `asked` without its period phrase. */
export function sameQuestion(candidate: string, asked: string): boolean {
  const key = questionKey(candidate)
  return !!key && (key === questionKey(asked) || key === questionKey(asked, true))
}
// question-key:end
