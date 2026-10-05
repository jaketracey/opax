export type CompletedAnswer = { id: number; text: string };
export type ReportAnswer = (answer: CompletedAnswer) => void;

// The production voice lane supplies the reporting path. No answer is stored
// or sent by this e2e/dev integration point.
export const reportAnswer: ReportAnswer = () => {};
