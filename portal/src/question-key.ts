/**
 * When two questions ask the same thing. A suggestion or follow-up offered
 * after an answer is a different question from the one just asked: it differs
 * in more than case, punctuation, spacing or the period phrase.
 *
 * public/app.js carries a copy of this rule between the `question-key` markers
 * for "Ask something else"; test/ask-money-readings.test.mjs keeps the two identical.
 */
// question-key:begin
// Whitespace is collapsed first, so every pattern matches single spaces.
const QUESTION_YEAR = '(?:19|20)\\d{2}(?: ?[/–—‑-] ?(?:(?:19|20)\\d{2}|\\d{2}))?'
const QUESTION_PREFIX = '(?:fy ?|financial years? )?'
const QUESTION_PERIODS = [
  new RegExp('\\b(?:(?:in|during|for|since|from|after|before|until|through|over|across|between|starting|beginning) )?(?:the )?' + QUESTION_PREFIX + QUESTION_YEAR + '(?: (?:to|and|through|until|or) (?:the )?' + QUESTION_PREFIX + QUESTION_YEAR + ')?(?: (?:onwards?|and later|to date|to now))?', 'gi'),
  /\b(?:(?:in|over|during|for|across) )?(?:the )?(?:last|past|previous|recent) (?:(?:\d{1,2}|one|two|three|four|five|six|seven|eight|nine|ten|few|several|couple of|couple|number of) )?(?:(?:financial|disclosure) )?(?:years?|decade|months?|weeks?|days?)\b/gi,
  /\b(?:(?:in|during|for|over) )?(?:the )?(?:this|current|latest|most recent) (?:financial )?(?:year|decade)\b/gi,
  /\b(?:(?:in|over|across|for) )?(?:all years|all time|recent years|recently|lately|these days|nowadays)\b/gi,
]
export function questionKey(question: string, withoutPeriod = false): string {
  let text = String(question || '').normalize('NFKC').toLowerCase().replace(/[‘’ʼ`]/g, "'").replace(/\s+/g, ' ')
  if (withoutPeriod) for (const period of QUESTION_PERIODS) text = text.replace(period, ' ')
  return text.replace(/^ ?(?:and|so|ok|okay|please) /, '').replace(/[^a-z0-9']+/g, ' ').trim()
}
/** True when `candidate` repeats `asked`, or is `asked` without its period phrase. */
export function sameQuestion(candidate: string, asked: string): boolean {
  const key = questionKey(candidate)
  return !!key && (key === questionKey(asked) || key === questionKey(asked, true))
}
// question-key:end
