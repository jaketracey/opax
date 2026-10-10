// Deterministic intent gate: run before record lookup, rewriting or generation.
const POLITICS = /\b(?:politician|politicians|political|politics|parliamentarian|parliamentarians|mp|mps|senator|senators|minister|ministers|premier|president|prime minister|party|parties|candidate|candidates|leader|leaders|government|opposition)\b/i;
const JUDGEMENT = /\b(?:best|worst|greatest|better|worse|most corrupt|least corrupt|more corrupt|most honest|least honest|most dishonest|most trustworthy|least trustworthy|most competent|least competent|most effective|least effective|most ethical|least ethical)\b/i;

export function isEvaluativeQuestion(question, context = []) {
  const text = String(question || '').normalize('NFKC').replace(/[’‘]/g, "'").replace(/\s+/g, ' ').trim();
  if (/\b(?:who|whom|which (?:party|candidate|politician))\b.{0,45}\b(?:should|shall|would you|do you recommend)\b.{0,30}\b(?:vote for|elect|support)\b/i.test(text) ||
      /\b(?:tell me|recommend|advise me)\b.{0,30}\b(?:who|whom)\b.{0,25}\bvote for\b/i.test(text) ||
      /\b(?:who|which candidate|which party) (?:deserves|is worthy of) (?:my|our) vote\b/i.test(text) ||
      /\b(?:should I|would you|should we)\b.{0,40}\bvote (?:for|against)\b/i.test(text)) return true;
  const politicalContext = POLITICS.test(text) || (Array.isArray(context) && context.some(turn => (turn?.role === 'user' || ['USER', 'user', 'question'].includes(turn?.author)) && POLITICS.test(String(turn.text || turn.content || ''))));
  const recordQuestion = /^(?:what (?:did|have|has)\b.{0,80}\b(?:say|said|find|found)|(?:show|find|list|search)\b.{0,40}\b(?:speeches?|debates?|findings|convictions))|\b(?:were convicted|was convicted|court found|tribunal found)\b/i.test(text);
  if (!recordQuestion && JUDGEMENT.test(text) && (politicalContext || /\b(?:who|whom)\b/i.test(text))) return true;
  if (!recordQuestion && POLITICS.test(text) && /^(?:is|are|was|were|do you think|do you consider|would you say|in your opinion)\b.{0,160}\b(?:corrupt|honest|dishonest|competent|good|bad|trustworthy|effective|ethical|unethical)\b/i.test(text)) return true;
  if (POLITICS.test(text) && /\b(?:recommend|endorse)\b.{0,60}\b(?:politician|party|candidate|mp|senator)\b/i.test(text)) return true;
  if (POLITICS.test(text) && /\b(?:can I trust|should I trust|do you trust)\b/i.test(text)) return true;
  return POLITICS.test(text) && /\b(?:rank|rate|judge)\b.{0,60}\b(?:good|bad|better|worse|quality|integrity|honesty|competence|performance)\b|\b(?:good|bad|terrible|corrupt|honest|dishonest|trustworthy)\s+(?:politician|mp|senator|leader|candidate)\b/i.test(text);
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
