/**
 * Machine briefs of speech turns under this many words had a 12% serious
 * error rate, and the turn is short enough to read whole. Mirrors
 * SHORT_TURN_WORDS in portal/src/index.ts (and the web's app.js and
 * timemachine.js), which withhold such a turn's brief on the record page.
 */
export const SHORT_TURN_WORDS = 80;

/** The search-row fields the rule reads; `word_count` is absent on older servers. */
export type BriefCandidate = {
  kind?: string;
  word_count?: number | null;
};

/**
 * A speech turn known to be under SHORT_TURN_WORDS words: the app shows its
 * own text, never a machine brief. Speech only; press releases, reports and
 * the rest keep their briefs at any length. An unknown length (absent, null,
 * or not a positive finite number) is not short, so the brief stays (fail
 * open, as on the web).
 */
export function isShortSpeechTurn(row: BriefCandidate): boolean {
  const words = row.word_count;
  return (
    row.kind === 'speech' &&
    typeof words === 'number' &&
    Number.isFinite(words) &&
    words > 0 &&
    words < SHORT_TURN_WORDS
  );
}

/**
 * The resource ids a row list may ask /api/brief about: valid 32-hex ids,
 * deduplicated in order, without known short speech turns.
 */
export function briefRids(
  rows: readonly (BriefCandidate & { resource?: string })[],
): string[] {
  return [
    ...new Set(
      rows
        .filter((r) => !isShortSpeechTurn(r))
        .map((r) => r.resource)
        .filter((r): r is string => !!r && /^[a-f0-9]{32}$/.test(r)),
    ),
  ];
}
