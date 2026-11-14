import type { AskFailure } from './stream';

/**
 * A failed turn's one sentence (journeys/ask.md 4.14). The Worker's own
 * error text is never shown: each failure maps by its code.
 */
export const askErrors = {
  offline: 'OPAX couldn’t be reached. Check your connection.',
  timeout: 'This answer took too long.',
  partial: 'This answer stopped partway.',
  'rate-limited': 'OPAX is busy right now.',
  blocked: 'This question couldn’t be sent.',
  invalid: 'The answer couldn’t be read.',
  empty: 'No written answer came back. The records found are listed below.',
  emptyNone: 'No written answer came back.',
} as const;
export { busyWait } from './stream';
export function askErrorCopy(failure: Pick<AskFailure, 'code'>): {
  message: string;
  retry: boolean;
} | null {
  switch (failure.code) {
    case 'cancelled':
      return null;
    case 'blocked':
      // Ask has no explicit content-rejection flag. A transport block does
      // not establish that the reader's wording caused it.
      return {
        message: askErrors.blocked,
        retry: false,
      };
    case 'empty':
      return { message: askErrors.empty, retry: false };
    case 'offline':
    case 'timeout':
    case 'partial':
    case 'rate-limited':
    case 'invalid':
      return { message: askErrors[failure.code], retry: true };
  }
}
export const clarifyCopy = 'Name a person, party, bill or topic.';
export const stopCopy = {
  restored: 'Stopped. Your question is back in the box.',
  kept: 'Stopped.',
} as const;

const pronouns =
  /\b(he|she|they|them|their|theirs|his|her|hers|him|it|its|this|that|these|those)\b/i;
const parties =
  /\b(labor|liberals?|nationals?|greens|one nation|coalition|teals?|independents?|katter|lambie)\b/i;
const years = /\b(18|19|20)\d\d\b/g;
const fold = (text: string) =>
  text
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
/**
 * "Answered as" shows only when the rewrite changed the meaning (journeys/
 * ask.md 4.5): a short reply expanded, a pronoun or "this" resolved, or a
 * person, party, year or topic added that the question lacks. Case,
 * punctuation and a name the question already used are not a change.
 * `rewrite_kind` from the Worker settles it when sent.
 */
export function showAnsweredAs(
  question: string,
  askedAs: string | undefined,
  {
    rewriteKind,
    names = [],
    topics = [],
  }: {
    rewriteKind?: string;
    names?: readonly string[];
    topics?: readonly string[];
  } = {},
): boolean {
  if (!askedAs?.trim()) return false;
  const q = fold(question);
  const a = fold(askedAs);
  if (q === a) return false;
  if (rewriteKind) return rewriteKind === 'meaning';
  if (q.split(' ').filter(Boolean).length <= 3) return true;
  // "This year" names a period, not something said earlier.
  if (
    pronouns.test(
      question.replace(
        /\bthis (year|week|month|term|session|parliament)\b/gi,
        '',
      ),
    )
  )
    return true;
  const qYears = new Set(question.match(years) ?? []);
  if ((askedAs.match(years) ?? []).some((y) => !qYears.has(y))) return true;
  const party = askedAs.match(parties)?.[0];
  if (party && !q.includes(fold(party))) return true;
  const added = (term: string) => {
    const t = fold(term);
    return !!t && a.includes(t) && !q.includes(t);
  };
  if (topics.some(added)) return true;
  // A person added: their surname is new to the question. A longer form of
  // a name the reader used ("Albanese" to "Anthony Albanese") is not.
  return names.some((name) => {
    const surname = fold(name).split(' ').at(-1) ?? '';
    return surname.length > 2 && added(surname);
  });
}
