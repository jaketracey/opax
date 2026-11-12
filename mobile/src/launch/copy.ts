/**
 * The launch splash's words (shell.md 3). The full name is written as the
 * README and opax.com.au write it, "eXchange", because the X of the wordmark
 * is the X inside that word: each line of the name carries one letter of
 * OPAX. The About page and the App Store listing write "Exchange"; which
 * form is canonical is Jake's call, and this file is the one place to change.
 */
export const splashCopy = {
  /** The wordmark the native splash shows. */
  wordmark: 'OPAX',
  /** The full name, one word a line, in order. */
  words: ['Open', 'Parliamentary', 'Accountability', 'eXchange'],
  /** Spoken once by VoiceOver as the name unfolds; focus then moves to the app. */
  announcement: 'OPAX, Open Parliamentary Accountability eXchange',
} as const;
