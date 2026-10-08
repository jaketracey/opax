export interface Question {
  template: string;
  deck: string;
  kind: string;
  prompt: string;
  fact: string;
  explanation: string;
  source: string;
  link: { href: string; label: string };
  options?: {
    label: string;
    correct?: boolean;
    value?: number;
    photo?: string;
  }[];
  answer?: number | string[];
  min?: number;
  max?: number;
  format?: string;
  comparison?: {
    shownLabel: string;
    shownDisplay: string;
    hiddenLabel: string;
    hiddenDisplay: string;
  };
}
export type Answer = number | string[];
export function grade(q: Question, value: Answer) {
  if (q.kind === 'order') {
    const correct =
      Array.isArray(value) &&
      value.length === (q.answer as string[]).length &&
      value.every((label, i) => label === (q.answer as string[])[i]);
    return {
      correct,
      base: correct ? 100 : 0,
      detail: correct ? 'Correct order.' : 'Not quite in order.',
    };
  }
  if (q.kind === 'year') {
    const distance = Math.abs(Math.round(Number(value)) - Number(q.answer));
    return {
      correct: distance === 0,
      base:
        distance === 0 ? 100 : distance === 1 ? 50 : distance === 2 ? 25 : 0,
      detail:
        distance === 0
          ? 'Right on the year.'
          : `Off by ${distance}${distance === 1 ? ' year.' : ' years.'}`,
    };
  }
  if (q.kind === 'slider') {
    const error = Math.abs(Number(value) - Number(q.answer)) / Number(q.answer);
    const pct = Math.round(error * 100);
    return {
      correct: error <= 0.25,
      base: error <= 0.1 ? 100 : error <= 0.25 ? 75 : error <= 0.5 ? 40 : 10,
      detail:
        pct === 0
          ? 'Exactly right.'
          : `${pct}% away${error <= 0.25 ? ' — close enough.' : '.'}`,
    };
  }
  const correct = !!q.options?.[Number(value)]?.correct;
  return {
    correct,
    base: correct ? 100 : 0,
    detail: correct ? 'Correct.' : 'Not this time.',
  };
}
export function rankFor(score: number, total: number) {
  const pct = total ? score / total : 0;
  if (pct >= 1)
    return {
      name: 'Speaker of the House',
      blurb: 'Order! Total command of the record.',
    };
  if (pct >= 0.85)
    return { name: 'Deputy Speaker', blurb: 'Almost nothing gets past you.' };
  if (pct >= 0.6)
    return { name: 'Committee Chair', blurb: 'You run a tight inquiry.' };
  if (pct >= 0.35)
    return {
      name: 'Committee Member',
      blurb: "You're asking the right questions.",
    };
  return {
    name: 'Backbencher',
    blurb: 'Everyone starts somewhere on the back bench.',
  };
}
export interface QuizRecord {
  version: 1;
  bestStreak: number;
  lastPoints: number;
  lastCorrect: number;
}
export function decodeQuizRecord(raw: unknown): QuizRecord | null {
  if (!raw || typeof raw !== 'object') return null;
  const v = raw as QuizRecord;
  return v.version === 1 &&
    [v.bestStreak, v.lastPoints, v.lastCorrect].every(
      (n) => Number.isSafeInteger(n) && n >= 0,
    ) &&
    v.lastCorrect <= 8
    ? {
        version: 1,
        bestStreak: v.bestStreak,
        lastPoints: v.lastPoints,
        lastCorrect: v.lastCorrect,
      }
    : null;
}
