import { symbols, type SFSymbol } from '../../../design/symbols';

/**
 * The quiz's marks, from the shared vocabulary.
 */
export const marks = Object.freeze({
  correct: symbols.correct,
  wrong: 'xmark.circle',
  typeGuess: 'keyboard',
} as const satisfies Record<string, SFSymbol>);
