import type { TermId } from './glossary';

/**
 * Where the app's own wording meets the guide's glossary: which term a
 * line holds, and the words that carry it. One term per line; the first
 * rule that matches wins. Only glossary terms: a word the guide doesn't
 * explain ("portfolio", "backbencher") is never marked.
 */
export interface TermMatch {
  term: TermId;
  /** The words to mark; the term's own word when absent. */
  phrase?: string;
}
type Rule = readonly [RegExp, TermId, string?];

function first(text: string | null | undefined, rules: readonly Rule[]) {
  if (!text) return null;
  for (const [pattern, term, phrase] of rules)
    if (pattern.test(text)) return phrase ? { term, phrase } : { term };
  return null;
}

/** A division's stage: "Second reading · House · 19 Aug". */
export const stageTerm = (text: string | null | undefined) =>
  first(text, [
    [/\bsecond reading\b/i, 'second-reading'],
    [/\bthird reading\b/i, 'third-reading'],
    [/\bfirst reading\b/i, 'first-reading'],
    [/\bconsideration in detail\b/i, 'consideration-in-detail'],
  ]);

/** A chamber named in full: a bill's "Introduced … · House of Representatives". */
export const chamberTerm = (text: string | null | undefined) =>
  first(text, [
    [/\bHouse of Representatives\b/, 'house-of-representatives'],
    [/\bFederation Chamber\b/, 'federation-chamber'],
    [/\bSenate\b/, 'senate'],
  ]);

/** A profile's role line: "Prime Minister", "Minister for Health and 1 more". */
export const roleTerm = (text: string | null | undefined) =>
  text && /^Former\b/.test(text)
    ? null
    : first(text, [
        [/\bPrime Minister\b/, 'prime-minister'],
        [/\bShadow Minister\b/i, 'shadow-minister', 'Shadow Minister'],
        [/\bMinister\b/, 'minister', 'Minister'],
        [/\bSenator for\b/, 'senator', 'Senator'],
        [/\bMember for\b/, 'member-of-parliament', 'Member'],
      ]);

/** Today's sitting line: "The Senate is sitting today", "Parliament next sits …". */
export const sittingTerm = (text: string | null | undefined) =>
  first(text, [
    [/\bSenate\b/, 'senate'],
    [/\bHouse\b/, 'house-of-representatives', 'House'],
    [/\bsitting\b/, 'sitting-week', 'sitting'],
  ]);

/** An Ask starter: the one glossary word it leans on, if any. */
export const starterTerm = (text: string | null | undefined) =>
  first(text, [
    [/\bsenators\b/i, 'senator'],
    [/\bbills\b/i, 'bill'],
    [/\bgifts\b/i, 'gift'],
  ]);
