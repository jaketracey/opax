import type { ReactNode } from 'react';

/** U+00A0: the line may not break here. */
export const NO_BREAK_SPACE = ' ';

/**
 * The roles a record's title is drawn in (and the legacy title roles that
 * share them). iOS's `lineBreakStrategyIOS="push-out"` does not move a word
 * down for Latin text, so these bind their last word instead.
 */
export const recordTitleRoles: readonly string[] = [
  'recordTitle',
  'recordHeading',
  'title',
  'padTitle',
];

/** The pair stays short enough to fit an AX5 line on the narrowest phone. */
const MAX_BOUND = 16;

/**
 * Binds a short last word to the word before it with a no-break space, so a
 * record title never ends on a lone "2026", "Bill" or other word of four
 * characters or fewer: "… Recovery Levy) Bill 2026" wraps as "Bill 2026".
 * Titles of one or two words, and pairs too long to share a line at the
 * largest text sizes, are left as they are.
 */
export function bindShortLastWord(text: string): string {
  const match = /^([\s\S]*\S)[ \t]+(\S+)[ \t]+(\S+?)(\s*)$/.exec(text);
  if (!match) return text;
  const [, head, before, last, trailing] = match;
  const short =
    /^\d{4}\W*$/.test(last!) || /^Bill\W*$/.test(last!) || last!.length <= 4;
  if (!short || before!.length + 1 + last!.length > MAX_BOUND) return text;
  return `${head} ${before}${NO_BREAK_SPACE}${last}${trailing}`;
}

/**
 * The same, for a Text's children: a string, or the last string of an array
 * of runs (nested Text runs are left alone).
 */
export function bindRecordTitle(children: ReactNode): ReactNode {
  if (typeof children === 'string') return bindShortLastWord(children);
  if (Array.isArray(children)) {
    const index = children.length - 1;
    const last: unknown = children[index];
    if (typeof last === 'string')
      return [...children.slice(0, index), bindShortLastWord(last)];
  }
  return children;
}
