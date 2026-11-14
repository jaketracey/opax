/** Explicit AEDT instants: a device's local time zone must not change these. */
export const VIC_ELECTION_EARLY_OPEN = '2026-11-18T09:00:00+11:00';
export const VIC_ELECTION_EARLY_CLOSE = '2026-11-27T18:00:00+11:00';
export const VIC_ELECTION_POLLS_OPEN = '2026-11-28T08:00:00+11:00';
export const VIC_ELECTION_POLLS_CLOSE = '2026-11-28T18:00:00+11:00';
export const VIC_ELECTION_INSTANTS = [
  VIC_ELECTION_EARLY_OPEN,
  VIC_ELECTION_EARLY_CLOSE,
  VIC_ELECTION_POLLS_OPEN,
  VIC_ELECTION_POLLS_CLOSE,
] as const;
export const electionStates = [
  'pre_poll',
  'early_voting',
  'election_day',
  'polls_closed',
  'results',
  'results_final',
] as const;
export type ElectionState = (typeof electionStates)[number];
/** Unknown additive states fall back to the clock without losing the page. */
export const decodeElectionState = (v: unknown): ElectionState | undefined =>
  electionStates.includes(v as ElectionState)
    ? (v as ElectionState)
    : undefined;
