import { jurisdictionName } from '../../design/parliament';

/**
 * A state or territory after "for" or "in" in running copy: the two
 * territories take "the"; the six states take nothing. Alone or after a
 * comma, use jurisdictionName.
 */
export function stateInRunningCopy(code: string | null | undefined): string {
  const name = jurisdictionName(code) ?? '';
  return /Territory$/.test(name) ? `the ${name}` : name;
}

/** "Grayndler, New South Wales". */
export function seatLine(seat: string, code: string | null | undefined) {
  const state = jurisdictionName(code);
  return state ? `${seat}, ${state}` : seat;
}
