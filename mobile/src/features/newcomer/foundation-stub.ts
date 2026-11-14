import { useSyncExternalStore } from 'react';

/**
 * TEMPORARY. A stand-in for ad-learn-guide's foundation commit, so this lane
 * builds before that commit merges: `openTerm` (features/learn/open-term.ts),
 * the "Explain terms" setting and the glossary's one-line meanings. Delete
 * this file when the foundation merges and import the real ones.
 *
 * The lines below are glossary.json's `short` wording at content SHA
 * 39d9d33bc, copied unchanged for the few terms this lane uses.
 */
export const stubGlossary: Record<string, { word: string; short: string }> = {
  bill: {
    word: 'bill',
    short:
      'A written plan for a new law, or for a change to a law we already have.',
  },
  division: {
    word: 'division',
    short:
      'A formal vote in Parliament where each member’s name and vote is recorded.',
  },
  'register-of-interests': {
    word: 'register of interests',
    short: 'A list where MPs and senators record their interests.',
  },
  government: {
    word: 'government',
    short:
      'The party, or group of parties, with the support of most members of the House.',
  },
  crossbench: {
    word: 'crossbench',
    short:
      'MPs and senators from minor parties, and independents who belong to no party.',
  },
};

export function openTerm(_termId: string): void {}

let explain: boolean | null = null;
const listeners = new Set<() => void>();
const read = () => explain ?? false;
export function useExplainTerms(): boolean {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    read,
    read,
  );
}
export async function setExplainTerms(on: boolean): Promise<void> {
  explain = on;
  listeners.forEach((listener) => listener());
}
/** Tests only. */
export function resetExplainTermsForTests() {
  explain = null;
}
