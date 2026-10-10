// Deterministic intent gate: run before record lookup, rewriting or generation.
const SUBJECT = String.raw`(?:politicians?|parliamentarians?|mps?|senators?|ministers?|prime ministers?|pms?|premiers?|presidents?|political part(?:y|ies)|part(?:y|ies)|candidates?|leaders?|governments?|opposition|Labor|Labour|Coalition|Liberals?|Greens|ALP|LNP|Libs|Nats)`;
const POLITICS = new RegExp(String.raw`\b(?:${SUBJECT}|political|politics)\b`, 'i');
const QUALITY = String.raw`(?:best|worst|greatest|better|worse|good|bad|terrible|corrupt|crooked|honest|dishonest|competent|incompetent|trustworthy|untrustworthy|effective|ineffective|ethical|unethical|lazy|laziest|reliable|unreliable|capable|incapable)`;
const MODIFIERS = String.raw`(?:(?:the|a|an|most|least|more|less|really|actually|very|so)\s+)*`;
// Keep the predicate next to its subject. A policy, bill title or speech topic
// containing a quality word is not a judgement about the person or party.
const SUBJECT_PHRASE = String.raw`${SUBJECT}(?:\s+[AB])?(?:\s+(?:or|and|versus|vs\.?)\s+(?:the\s+)?${SUBJECT})?`;
const SUBJECT_JUDGEMENT = new RegExp(String.raw`\b${SUBJECT_PHRASE}\s+(?:(?:is|are|was|were|would be|has been|have been)\s+)${MODIFIERS}${QUALITY}\b`, 'i');
const INVERTED_JUDGEMENT = new RegExp(String.raw`^(?:is|are|was|were|would|do you think|do you consider|would you say|in your opinion)\b.{0,60}\b${SUBJECT_PHRASE}\s+(?:be\s+)?${MODIFIERS}${QUALITY}\b`, 'i');
const QUALITY_SUBJECT = new RegExp(String.raw`\b${MODIFIERS}${QUALITY}\s+(?:(?:Australian|federal|state|political|opposition)\s+)*${SUBJECT}\b`, 'i');
const RECOMMEND_SUBJECT = new RegExp(String.raw`\b(?:recommend|endorse)\b.{0,50}\b${SUBJECT}\b|\b${SUBJECT}\b.{0,30}\b(?:do|would|can) you (?:recommend|endorse)\b|\bpreferred\s+${SUBJECT}\b`, 'i');
const RECORD_QUERY = new RegExp(String.raw`^(?:who|which\s+${SUBJECT})\s+(?:(?:has|have|had)\s+)?(?:spoke|voted|discussed|quoted|introduced|advocated|proposed|recommended)\b|^how (?:often|many times)\b.{0,50}\bphrase\b`, 'i');

export function isEvaluativeQuestion(question, context = []) {
  const text = String(question || '').normalize('NFKC').replace(/[’‘]/g, "'").replace(/\bwho's\b/gi, 'who is').replace(/\s+/g, ' ').trim();
  // Reported statements and findings remain factual, even if they quote advice
  // or discuss a judgement. Do not confuse a request for the record with one.
  if (RECORD_QUERY.test(text) || /^(?:what (?:did|have|has)\b.{0,80}\b(?:say|said|find|found)|(?:show|find|list|search)\b.{0,40}\b(?:speeches?|debates?|findings|convictions))|\b(?:were convicted|was convicted|court found|tribunal found)\b/i.test(text)) return false;
  if (/\b(?:who|whom)\s+(?:(?:should|shall|do|would|can|could|will)\s+(?:I|we|you)\s+|to\s+)(?:vote for|elect)\b/i.test(text) ||
      /\b(?:who|whom)\s+do you recommend\b.{0,20}\bvote for\b/i.test(text) ||
      /\b(?:tell me|recommend|advise me)\b.{0,20}\b(?:who|whom|which candidate|which party)\b.{0,20}\bvote for\b/i.test(text) ||
      /\b(?:should I|should we|would you)\b.{0,30}\b(?:vote (?:for|against)|elect)\b/i.test(text) ||
      /\b(?:who|which (?:party|candidate|politician|mp|senator))\b.{0,30}\b(?:should (?:get|receive)|deserves|is worthy of)\s+(?:my|our) vote\b/i.test(text) ||
      /\bwhich (?:party|candidate|politician|mp|senator)\b.{0,20}\bshould (?:I|we) (?:support|choose|elect|vote for)\b/i.test(text) ||
      /\b(?:who|which candidate|which party)\b.{0,40}\b(?:put|place|preference)\b.{0,20}\bfirst\b.{0,20}\bballot\b/i.test(text)) return true;
  if (RECOMMEND_SUBJECT.test(text) || SUBJECT_JUDGEMENT.test(text) || INVERTED_JUDGEMENT.test(text) || QUALITY_SUBJECT.test(text)) return true;
  // "Who is most honest?" has a person as its subject; "who spoke about the
  // worst floods?" does not. Restrict the predicate rather than scanning topics.
  if (new RegExp(String.raw`^who (?:is|are|was|would be) ${MODIFIERS}${QUALITY}(?:[?!.]|$|\s+(?:${SUBJECT}|Australian|choice|on|at|for|based|according|than)\b)`, 'i').test(text)) return true;
  if (POLITICS.test(text) && /\b(?:can I trust|should I trust|do you trust|can (?:I|we) trust)\b|\bwhich\b.{0,30}\bcan I trust\b/i.test(text)) return true;
  if (POLITICS.test(text) && /\b(?:rank|rate|judge)\b.{0,60}\b(?:best|worst|good|bad|better|worse|quality|integrity|honesty|competence|performance)\b/i.test(text)) return true;
  const politicalContext = Array.isArray(context) && context.some(turn => (turn?.role === 'user' || ['USER', 'user', 'question'].includes(turn?.author)) && POLITICS.test(String(turn.text || turn.content || '')));
  return politicalContext && new RegExp(String.raw`^(?:which|who) (?:is|are) ${MODIFIERS}${QUALITY}[?!.]?$`, 'i').test(text);
}

export function neutralEvaluativeAnswer() {
  return {
    answer: "OPAX doesn't rank or judge politicians, or recommend who you should vote for. You can compare their public records on a specific topic and make your own judgement.",
    answer_status: 'neutral', citations: {}, sources: [],
    comparison_chips: [
      { label: 'Votes on a topic', question: 'How did MPs vote on housing?' },
      { label: 'Attendance at divisions', question: 'Show attendance at parliamentary divisions.' },
      { label: 'Speeches on a topic', question: 'What have MPs said about housing?' },
      { label: 'Declared interests', question: 'Show MPs’ declared interests.' },
      { label: 'Pay', question: 'What are MPs paid?' },
    ],
  };
}
