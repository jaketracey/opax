import { useSyncExternalStore } from 'react';
import type { Deck, Question, QuizResponse } from './quiz-model';

/**
 * The round being played, in memory for this session only: never written to
 * disk. Back leaves a round here, and the hub tile and the intro offer to
 * resume it. Today's question never reads or writes it, except to ask
 * `inProgress()`.
 */
export interface QuizRound {
  deck: Deck;
  round: readonly Question[];
  /** The current question. Past the last one, the round is finished. */
  index: number;
  /** One per checked question; one more than `index` while its reveal shows. */
  answers: readonly QuizResponse[];
  points: number;
  correct: number;
  streak: number;
  /** The best streak, this round's or the saved one's. */
  best: number;
}

let current: QuizRound | null = null;
let progress: { index: number } | null = null;
const listeners = new Set<() => void>();
function set(next: QuizRound | null) {
  current = next;
  progress =
    next && next.index < next.round.length ? { index: next.index } : null;
  for (const listener of listeners) listener();
}

export const quizSession = {
  current: (): QuizRound | null => current,
  /** Starting a round replaces any round in progress. */
  begin(deck: Deck, round: readonly Question[], best: number): QuizRound {
    set({
      deck,
      round,
      index: 0,
      answers: [],
      points: 0,
      correct: 0,
      streak: 0,
      best,
    });
    return current!;
  },
  update(next: QuizRound) {
    set(next);
  },
  /** Cleared when a round finishes, or before another starts. */
  clear() {
    set(null);
  },
  /** The question to resume on, or null when no round is in progress. */
  inProgress: (): { index: number } | null => progress,
  subscribe(listener: () => void) {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  },
};

export function useQuizSession(): QuizRound | null {
  return useSyncExternalStore(
    quizSession.subscribe,
    quizSession.current,
    quizSession.current,
  );
}
export function useQuizInProgress(): { index: number } | null {
  return useSyncExternalStore(
    quizSession.subscribe,
    quizSession.inProgress,
    quizSession.inProgress,
  );
}
