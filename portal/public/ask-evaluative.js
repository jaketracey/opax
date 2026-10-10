// High-precision fast path only. All other intent is classified by the existing
// standalone-question model call; these patterns never scan quoted record text.
export function isEvaluativeQuestion(question) {
  const text = String(question || '').normalize('NFKC').replace(/[’‘]/g, "'").replace(/\bwho's\b/gi, 'who is').replace(/\s+/g, ' ').trim();
  return /^(?:who should I vote for|which (?:party|candidate) should I vote for|who is (?:the )?(?:best|worst) (?:politician|MP|senator|PM|prime minister))[?!.]*$/i.test(text);
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
