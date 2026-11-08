import type { SFSymbol } from '../../../design/symbols';

/**
 * The quiz's marks, from the shared vocabulary. Correct is an interim plain
 * checkmark until the vocabulary has checkmark.circle.fill.
 */
export const marks = Object.freeze({
  correct: 'checkmark',
  wrong: 'xmark.circle',
  typeGuess: 'keyboard',
} as const satisfies Record<string, SFSymbol>);
