/** Record counts and comparisons do not ask for a documented political stance. */
export function isRecordCountQuestion(question: string): boolean {
  const records='(?:speech(?:es|se)?|divisions?|bills?|grants?|contracts?|receipts?)'
  const modifiers='(?:(?:all|the|federal|Commonwealth|parliamentary|chamber|Senate|House|labelled|recorded|published)\\s+){0,3}'
  if (/\b(?:show|give|find|read|quote)\b.{0,20}\bmore\s+speech/i.test(question)) return false
  return new RegExp(`\\b(?:how many|number of|counts?(?: of)?|total(?: (?:number|value) of)?|more|fewer|most|least|fewest)\\s+${modifiers}${records}\\b`,'i').test(question) ||
    /\b(?:speech|division|bill|grant|contract|receipt) counts?\b/i.test(question)
}

/** Decline clear requests outside the public record before topic retrieval can
 * turn an incidental Hansard mention into medical advice or a sports result. */
export function offScopeQuestion(question: string): boolean {
  const q = question.toLowerCase()
  const publicRecord = /\b(?:parliament(?:ary)?|hansard|senat(?:e|or|ors)|mps?|ministers?|government|opposition|politic\w*|part(?:y|ies)|bills?|legislation|votes?|voted|funding|spending|grants?|contracts?|budget|policy|policies|positions?|propos\w*|said|debated|speeches|register|disclos\w*)\b/
  if (publicRecord.test(q)) return false
  const clinical = /\b(?:best|recommend\w*|should i|how (?:do|can|should) i)\b/.test(q) &&
    /\b(?:treat\w*|medicin\w*|medicat\w*|diagnos\w*|symptoms?|cure\w*)\b/.test(q)
  const sport = /\b(?:won|win|winner|score|result)\b/.test(q) &&
    /\b(?:afl|nrl|soccer|football|cricket|tennis|rugby|grand final|world cup|premiership|olympics)\b/.test(q)
  return clinical || sport
}
