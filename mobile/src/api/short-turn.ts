import { serverPassage } from './passage-text';

/**
 * Machine briefs of speech turns under this many words had a 12% serious
 * error rate, and the turn is short enough to read whole. Mirrors
 * SHORT_TURN_WORDS in portal/src/index.ts (and the web's app.js and
 * timemachine.js), which withhold such a turn's brief on the record page.
 */
export const SHORT_TURN_WORDS = 80;

/**
 * A search row's `word_count`: a finite number, else unknown. It only
 * decides whether to ask for a brief, so a malformed value reads as
 * unknown and never fails the row, let alone its list.
 */
export const wordCount = (v: unknown): number | undefined =>
  typeof v === 'number' && Number.isFinite(v) ? v : undefined;

/** The search-row fields the rule reads; `word_count` is absent on older servers. */
export type BriefCandidate = {
  kind?: string;
  word_count?: number | null;
  snippet?: string;
};

/** The text a row shows when it has no brief. */
export type ShownPassage = (snippet: string | undefined) => string;
const shownByDefault: ShownPassage = (snippet) => serverPassage(snippet);

/**
 * A speech turn known to be under SHORT_TURN_WORDS words: the app shows its
 * own text, never a machine brief. Speech only; press releases, reports and
 * the rest keep their briefs at any length. An unknown length (absent, null,
 * or not a positive finite number) is not short, so the brief stays (fail
 * open, as on the web). Nor is a turn with no passage to show in the
 * brief's place: its brief is still asked for, so no row is left bare.
 * `passage` is the text the row would show (the plain server passage by
 * default).
 */
export function isShortSpeechTurn(
  row: BriefCandidate,
  passage: ShownPassage = shownByDefault,
): boolean {
  const words = row.word_count;
  return (
    row.kind === 'speech' &&
    typeof words === 'number' &&
    Number.isFinite(words) &&
    words > 0 &&
    words < SHORT_TURN_WORDS &&
    passage(row.snippet).trim() !== ''
  );
}

/**
 * The resource ids a row list may ask /api/brief about: valid 32-hex ids,
 * deduplicated in order, without known short speech turns.
 */
export function briefRids(
  rows: readonly (BriefCandidate & { resource?: string })[],
  passage?: ShownPassage,
): string[] {
  return [
    ...new Set(
      rows
        .filter((r) => !isShortSpeechTurn(r, passage))
        .map((r) => r.resource)
        .filter((r): r is string => !!r && /^[a-f0-9]{32}$/.test(r)),
    ),
  ];
}
