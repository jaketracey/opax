import { saveChoice } from './choice-store';

/**
 * A seat ID in the saved format that names no electorate. `choice-store.ts`
 * has no clear: a malformed copy would be skipped for the older slot, which
 * would bring the old seat back. This one decodes, matches no seat, and
 * `useSeat` reads it as no seat at all.
 */
export const NO_SEAT_ID = `el_${'0'.repeat(24)}`;

/** "Forget my electorate": Your MP and Today return to the invitation. */
export function forgetSeat(): Promise<void> {
  return saveChoice({ version: 1, seatId: NO_SEAT_ID, stateSeatIds: [] });
}
