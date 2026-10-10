export function isEvaluativeQuestion(question: string, context?: { author?: string; role?: string; text?: string; content?: string }[]): boolean;
export function neutralEvaluativeAnswer(): {
  answer: string;
  answer_status: 'neutral';
  citations: Record<string, never>;
  sources: never[];
  comparison_chips: { label: string; question: string }[];
};
