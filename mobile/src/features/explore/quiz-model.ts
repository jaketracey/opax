import {
  counted,
  formatCount,
  formatMoney,
  formatMoneyCompact,
  formatMoneyWords,
} from '../../design/format';
import { topicNames } from '../reports/model';

export type QuizKind =
  | 'mc'
  | 'tf'
  | 'higher-lower'
  | 'portrait'
  | 'order'
  | 'slider'
  | 'year';
export type Deck = 'money' | 'words' | 'mixed';

/** One question as the web's question engine (portal/public/quiz.js) writes it. */
export interface Question {
  /** Stable hash of template and prompt (engine change E4; `quizId` until then). */
  id?: string;
  /** Who produced the fact (E4); `quizPublisher` applies the same table. */
  publisher?: string;
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
  scale?: string;
  format?: string;
  comparison?: {
    shownLabel: string;
    shownValue?: number;
    shownDisplay: string;
    hiddenLabel: string;
    hiddenValue?: number;
    hiddenDisplay: string;
  };
}
/** A front-page question always carries its id: `/explore/quiz?q=<id>`. */
export type FrontPageQuestion = Question & { id: string };

/**
 * A figure or year guess. A typed value is kept exactly as typed; only a
 * slider drag rounds (`roundGuess`), so `typed` says which one it was.
 */
export interface Guess {
  value: number;
  typed: boolean;
}
/** A chosen row index, the ranked labels, or a guess. */
export type Answer = number | string[] | Guess;

/** What the reader answered and what it scored, kept for the review. */
export interface QuizResponse {
  answer: Answer;
  correct: boolean;
  grade: string;
  gained: number;
  multiplier: number;
}

export const isGuessKind = (q: Pick<Question, 'kind'>) =>
  q.kind === 'slider' || q.kind === 'year';
export const answerValue = (answer: Answer): number | string[] =>
  typeof answer === 'object' && !Array.isArray(answer) ? answer.value : answer;

/** Grades as the web engine scores them. Grade strings have no full stop. */
export function grade(q: Question, answer: Answer) {
  const value = answerValue(answer);
  if (q.kind === 'order') {
    const expected = q.answer as string[];
    const correct =
      Array.isArray(value) &&
      value.length === expected.length &&
      value.every((label, i) => label === expected[i]);
    return {
      correct,
      base: correct ? 100 : 0,
      grade: correct ? 'Correct order' : 'Not quite in order',
    };
  }
  if (q.kind === 'year') {
    const distance = Math.abs(Math.round(Number(value)) - Number(q.answer));
    return {
      correct: distance === 0,
      base:
        distance === 0 ? 100 : distance === 1 ? 50 : distance === 2 ? 25 : 0,
      grade:
        distance === 0
          ? 'Right on the year'
          : `Off by ${distance} ${distance === 1 ? 'year' : 'years'}`,
    };
  }
  if (q.kind === 'slider') {
    const error = Math.abs(Number(value) - Number(q.answer)) / Number(q.answer);
    const pct = Math.round(error * 100);
    return {
      correct: error <= 0.25,
      base: error <= 0.1 ? 100 : error <= 0.25 ? 75 : error <= 0.5 ? 40 : 10,
      grade:
        pct === 0
          ? 'Exactly right'
          : `${pct}% away${error <= 0.25 ? ', close enough' : ''}`,
    };
  }
  const correct = !!q.options?.[Number(value)]?.correct;
  return {
    correct,
    base: correct ? 100 : 0,
    grade: correct ? 'Correct' : 'Not this time',
  };
}

/** The web's streak scoring: a run of right answers multiplies, up to 4. */
export function scoreAnswer(q: Question, answer: Answer, streak: number) {
  const result = grade(q, answer);
  const multiplier = result.correct ? Math.min(streak + 1, 4) : 1;
  const response: QuizResponse = {
    answer,
    correct: result.correct,
    grade: result.grade,
    gained: result.base * multiplier,
    multiplier,
  };
  return { response, streak: result.correct ? streak + 1 : 0 };
}
/** "+200 points · streak ×2"; the multiplier only when it is above 1. */
export function pointsLine(
  response: Pick<QuizResponse, 'gained' | 'multiplier'>,
) {
  return `+${formatCount(response.gained)} points${response.multiplier > 1 ? ` · streak ×${response.multiplier}` : ''}`;
}
export function progressLine(index: number, total: number, points: number) {
  return `${index + 1} of ${total} · ${counted(points, 'point', 'points')}`;
}
export function resultLine(correct: number, total: number, best: number) {
  return `${correct} of ${total} right · best streak ${best}`;
}
export const resumeLabel = (index: number, total = 8) =>
  `Resume question ${index + 1} of ${total}`;
/** The shared sentence; the URL travels with it. The prompts are not shared. */
export function quizShareText(points: number, correct: number, total = 8) {
  return `I scored ${formatCount(points)} in The record quiz on OPAX: ${correct} of ${total} right.`;
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
      blurb: 'You’re asking the right questions.',
    };
  return {
    name: 'Backbencher',
    blurb: 'Everyone starts somewhere on the back bench.',
  };
}

// The slider. Money and counts run on a log scale (the engine's `scale:
// "log"`): the native slider runs 0 to 1 and maps to min * (max / min)^t.
// Years are linear whole years.
const isLog = (q: Question) => q.kind === 'slider' && q.scale !== 'linear';
const bounds = (q: Question) => ({ min: Number(q.min), max: Number(q.max) });
const clamp = (q: Question, value: number) => {
  const { min, max } = bounds(q);
  return Math.min(max, Math.max(min, value));
};
/** The native slider's own range: 0 to 1 on a log scale, else the years. */
export function sliderRange(q: Question): {
  min: number;
  max: number;
  step?: number;
} {
  return isLog(q) ? { min: 0, max: 1 } : { ...bounds(q), step: 1 };
}
/** A value as a slider position. */
export function toSlider(q: Question, value: number): number {
  const { min, max } = bounds(q);
  if (!isLog(q)) return clamp(q, value);
  if (max <= min) return 0;
  return Math.log(clamp(q, value) / min) / Math.log(max / min);
}
/** A slider position as a value, unrounded. */
export function fromSlider(q: Question, t: number): number {
  const { min, max } = bounds(q);
  if (!isLog(q)) return clamp(q, t);
  return min * (max / min) ** Math.min(1, Math.max(0, t));
}
/** Drag values only: two significant figures (whole years), within range. */
export function roundGuess(q: Question, value: number): number {
  if (!isLog(q)) return clamp(q, Math.round(value));
  if (value <= 0) return clamp(q, value);
  const magnitude = 10 ** (Math.floor(Math.log10(value)) - 1);
  return clamp(q, Math.round(value / magnitude) * magnitude);
}
/** Where the slider starts: the geometric midpoint, or the middle year. */
export function sliderStart(q: Question): number {
  return roundGuess(q, fromSlider(q, isLog(q) ? 0.5 : (q.min! + q.max!) / 2));
}
/** "speeches" where the prompt counts speeches. */
export function guessUnit(q: Question): string {
  return q.format === 'count' && /\bspeech(es)?\b/i.test(q.prompt)
    ? 'speeches'
    : '';
}
/** The readout: "$930,000", "24,000 speeches", "2013". */
export function formatGuess(q: Question, value: number): string {
  if (q.format === 'money') return formatMoney(value);
  if (q.format === 'count' || q.kind === 'slider') {
    const unit = guessUnit(q);
    return `${formatCount(Math.round(value))}${unit ? ` ${unit}` : ''}`;
  }
  return String(Math.round(value));
}
/** The labels under the slider's ends: "$22,000" and "$1.7m". */
export function rangeLabels(q: Question): [string, string] {
  const { min, max } = bounds(q);
  if (q.format === 'money')
    return [
      formatMoney(min),
      max >= 1_000_000 ? formatMoneyCompact(max) : formatMoney(max),
    ];
  if (q.kind === 'slider') return [formatCount(min), formatCount(max)];
  return [String(min), String(max)];
}
/** A typed value, read leniently: "$929,297" and "929297" are the same. */
export function parseGuess(text: string): number | null {
  const cleaned = text.replace(/[$,\s]/g, '');
  if (!/^\d+(\.\d+)?$/.test(cleaned)) return null;
  return Number(cleaned);
}
/** The typed field's error, or null when the value is in range. */
export function guessError(q: Question, value: number | null): string | null {
  const { min, max } = bounds(q);
  if (value !== null && value >= min && value <= max) return null;
  if (q.kind === 'year') return `Enter a year from ${min} to ${max}.`;
  if (q.format === 'money')
    return `Enter a figure from ${formatMoney(min)} to ${formatMoney(max)}.`;
  return `Enter a number from ${formatCount(min)} to ${formatCount(max)}.`;
}
/** Whether an answer is complete enough to check. */
export function answerComplete(q: Question, answer: Answer | undefined) {
  if (answer === undefined) return false;
  if (q.kind === 'order')
    return Array.isArray(answer) && answer.length === q.options?.length;
  if (isGuessKind(q)) {
    const value = answerValue(answer);
    return (
      typeof value === 'number' &&
      Number.isFinite(value) &&
      value >= q.min! &&
      value <= q.max!
    );
  }
  return typeof answer === 'number';
}
/** An order row's own value, as the fact writes such figures. */
export function optionValueText(q: Question, value: number): string {
  return q.template.startsWith('money-')
    ? formatMoneyWords(value)
    : `${counted(value, 'speech', 'speeches')}`;
}
export function ordinal(n: number) {
  const tens = n % 100;
  const suffix =
    tens >= 11 && tens <= 13
      ? 'th'
      : (({ 1: 'st', 2: 'nd', 3: 'rd' } as Record<number, string>)[n % 10] ??
        'th');
  return `${n}${suffix}`;
}
/** "Your answer: $1,100,000", as the reader saw it. */
export function answerText(q: Question, answer: Answer): string {
  const value = answerValue(answer);
  if (Array.isArray(value)) return value.join(', ');
  if (isGuessKind(q)) return formatGuess(q, value);
  return q.options?.[value]?.label ?? '';
}
export function correctText(q: Question): string | null {
  if (q.kind === 'order') return (q.answer as string[]).join(', ');
  if (isGuessKind(q)) return null;
  return q.options?.find((option) => option.correct)?.label ?? null;
}

/**
 * Stable id for a question without one (engine change E4): FNV-1a over
 * template and prompt, as hex. The front-page deck writes the same ids.
 */
export function quizId(q: Pick<Question, 'template' | 'prompt' | 'id'>) {
  if (q.id) return q.id;
  const text = `${q.template}\n${q.prompt}`;
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return `q${hash.toString(16).padStart(8, '0')}`;
}

/**
 * Topic and industry names the quiz writes with "&" (explore spec 1.5, E1).
 * On screen they read "and"; organisation and donor names are proper names
 * and keep their "&" as written. The report topics come from `topicNames`;
 * "Climate & Energy" is the quiz's speech topic, which has no report name.
 */
export const quizAmpersandNames: readonly string[] = Object.freeze([
  ...new Set(
    [
      ...Object.values(topicNames).filter((name) => name.includes(' & ')),
      'Climate & Energy',
      'Property & Construction',
      'Pharmacies & Medicines',
      'Farming & Agriculture',
      'Finance & Banking',
      'Pubs & Clubs',
    ].map((name) => name.toLowerCase()),
  ),
]);
const escape = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const ampersandNames = new RegExp(
  `\\b(?:${quizAmpersandNames
    .map((name) => name.split(' & ').map(escape).join('\\s*&\\s*'))
    .join('|')})\\b`,
  'gi',
);

// Until the engine's E1 lands: no em dash and no "&" in a topic or industry
// name reaches the screen or the share text. "False {em dash} 691,104 are
// collected" reads "False, 691,104 are collected"; "climate & energy" reads
// "climate and energy", in the source's case.
const plain = (text: string) =>
  text
    .replace(/\s*\u2014\s*/g, ', ')
    .replace(ampersandNames, (match: string) =>
      match.replace(/\s*&\s*/, ' and '),
    );
/** The question as the app shows it: the engine's words, punctuation fixed. */
export function plainQuestion<Q extends Question>(q: Q): Q {
  return {
    ...q,
    prompt: plain(q.prompt),
    fact: plain(q.fact),
    explanation: plain(q.explanation),
    link: { ...q.link, label: plain(q.link.label) },
    ...(q.options
      ? {
          options: q.options.map((option) => ({
            ...option,
            label: plain(option.label),
          })),
        }
      : {}),
    // An order question's answer is its option labels, so it changes with them.
    ...(Array.isArray(q.answer) ? { answer: q.answer.map(plain) } : {}),
    ...(q.comparison
      ? {
          comparison: {
            ...q.comparison,
            shownLabel: plain(q.comparison.shownLabel),
            shownDisplay: plain(q.comparison.shownDisplay),
            hiddenLabel: plain(q.comparison.hiddenLabel),
            hiddenDisplay: plain(q.comparison.hiddenDisplay),
          },
        }
      : {}),
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
