import { TwoSlotStore } from '../../storage/two-slot';
import { decodeQuizRecord, type QuizRecord } from './quiz-model';
export const quizStore = new TwoSlotStore<QuizRecord>(
  ['opax-quiz-v1.json', 'opax-quiz-v1.b.json'],
  decodeQuizRecord,
  (v) => v,
);
