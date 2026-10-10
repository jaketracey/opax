// High-precision fast path only. All other intent is classified by the existing
// standalone-question model call when needed; these patterns never scan quoted record text.
export function isEvaluativeQuestion(question) {
  const text = String(question || '').normalize('NFKC').replace(/[’‘]/g, "'").replace(/\bwho's\b/gi, 'who is').replace(/\s+/g, ' ').trim();
  return /^(?:who should I vote for|which (?:party|candidate) should I vote for|who is (?:the )?(?:best|worst) (?:politician|MP|senator|PM|prime minister))[?!.]*$/i.test(text);
}

// This is a call-cost filter, not an intent decision. Ambiguous record queries
// may pass it; only the model can then choose a neutral reply.
export function mightBeEvaluative(question, scope = {}) {
  const text = String(question || '').normalize('NFKC').toLowerCase().replace(/[’‘]/g, "'");
  const words = text.match(/[\p{L}\p{N}]+/gu) || [];
  const judgement = /^(?:best|worst|better|worse|honest|dishonest|corrupt|crooked|crooks?|dodgy|lazy|laziest|competent|incompetent|incompetant|good|bad|rank|rate|grade|judge|recommend\w*|elect|preferred|trust\w*|ethical|integrity|effective|ineffective|useless|brilliant|greatest|leader|backing)$/;
  const subject = /^(?:politicians?|candidates?|mps?|senators?|ministers?|party|parties|pm|premier|government|labor|labour|coalition|liberals?|libs|greens|nationals?|nats)$/;
  // A personal voting choice supplies its own political subject, including
  // an informal or misspelt first question with no party or candidate named.
  if (/\b(?:vote for|(?:get|deserves?|receive) my vote|my ballot|ballot paper|(?:federal|next) election)\b/.test(text)) return true;
  const predicates = words.flatMap((word, i) => judgement.test(word) || word === 'should' && /^(?:i|we)$/.test(words[i + 1] || '') ? [i] : []);
  if (!predicates.length) return false;
  if (scope.speaker || scope.party) return true;
  return words.some((word, i) => subject.test(word) && predicates.some(at => Math.abs(at - i) <= 12));
}

export function neutralEvaluativeAnswer() {
  return {
    answer: "OPAX doesn't rank or judge politicians, or recommend who you should vote for. You can compare their public records on a specific topic and make your own judgement.",
    answer_status: 'neutral', citations: {}, sources: [],
    record_retry: { label: 'Ask for the record instead' },
    comparison_chips: [
      { label: 'Votes on a topic', question: 'How did MPs vote on housing?' },
      { label: 'Attendance at divisions', question: 'Show attendance at parliamentary divisions.' },
      { label: 'Speeches on a topic', question: 'What have MPs said about housing?' },
      { label: 'Declared interests', question: 'Show MPs’ declared interests.' },
      { label: 'Pay', question: 'What are MPs paid?' },
    ],
  };
}
