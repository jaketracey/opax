export function isEvaluativeQuestion(question: string): boolean;
export function mightBeEvaluative(question: string, scope?: { speaker?: string; party?: string }): boolean;
export function neutralEvaluativeAnswer(): {
  answer: string;
  answer_status: 'neutral';
  citations: Record<string, never>;
  sources: never[];
  record_retry: { label: string };
  comparison_chips: { label: string; question: string }[];
};
