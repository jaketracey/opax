import { Settings } from 'react-native';
import { isE2E } from '../../design/environment';
import { addDays, type SydneyDate } from './rules';

/**
 * E2E captures only: Today's launch arguments, read from the argument
 * domain Maestro's `arguments:` fill on iOS. Release builds read nothing
 * (`isE2E` is false there), so every value is null.
 *
 * - `OPAXSeat`: `none` | `federal` (Grayndler) | `federal+state`
 *   (Melbourne and a Victorian district) | `legacy-senate-nsw` (a 1.0 choice
 *   of the New South Wales Senate "seat", saved as 1.0 saved it).
 * - `OPAXEditionCache`: `none` (first install, case C) | `present` (the
 *   edition is read before the order is decided, as if it were saved).
 * - `OPAXEditionAge`: `fresh` | `recent` | `old`: Today's date is set that
 *   many days after the fixture edition's date (1, 7 or 30), so the tiers
 *   and the daily rules are pinned.
 * - `OPAXWelcomeDeclined`: `none` | `today` | `{n}d` (n days ago).
 * - `OPAXPlateDraw`: `on` lets the bill plate's timeline draw (sweep 3,
 *   item 8). Without it e2e builds show the finished timeline, so no
 *   screenshot catches it half drawn; a motion clip passes it.
 */
export interface TodayFixture {
  seat: 'none' | 'federal' | 'federal+state' | 'legacy-senate-nsw' | null;
  editionCache: 'none' | 'present' | null;
  editionAge: 'fresh' | 'recent' | 'old' | null;
  welcomeDeclined: string | null;
  plateDraw: 'on' | null;
}

const none: TodayFixture = {
  seat: null,
  editionCache: null,
  editionAge: null,
  welcomeDeclined: null,
  plateDraw: null,
};

const arg = (key: string) => {
  try {
    const value = Settings.get(key);
    return typeof value === 'string' && value ? value : null;
  } catch {
    return null;
  }
};

const oneOf = <T extends string>(
  value: string | null,
  allowed: readonly T[],
) =>
  value && (allowed as readonly string[]).includes(value) ? (value as T) : null;

let read: TodayFixture | null = null;
export function todayFixture(): TodayFixture {
  if (!isE2E) return none;
  read ??= {
    seat: oneOf(arg('OPAXSeat'), [
      'none',
      'federal',
      'federal+state',
      'legacy-senate-nsw',
    ]),
    editionCache: oneOf(arg('OPAXEditionCache'), ['none', 'present']),
    editionAge: oneOf(arg('OPAXEditionAge'), ['fresh', 'recent', 'old']),
    welcomeDeclined: arg('OPAXWelcomeDeclined'),
    plateDraw: oneOf(arg('OPAXPlateDraw'), ['on']),
  };
  return read;
}

/** Days after the edition's date that each age pins Today to. */
export const AGE_DAYS = { fresh: 1, recent: 7, old: 30 } as const;

/** The pinned Sydney date for an edition age, from the edition's date. */
export function fixtureToday(
  fixture: TodayFixture,
  editionDate: string | null,
): SydneyDate | null {
  if (!fixture.editionAge || !editionDate) return null;
  return addDays(editionDate.slice(0, 10), AGE_DAYS[fixture.editionAge]);
}

/** The welcome's "Not now" day the fixture sets, or undefined to leave it. */
export function fixtureDeclinedAt(
  fixture: TodayFixture,
  today: SydneyDate,
): SydneyDate | null | undefined {
  const value = fixture.welcomeDeclined;
  if (value === null) return undefined;
  if (value === 'none') return null;
  if (value === 'today') return today;
  const days = /^(\d+)d$/.exec(value);
  return days ? addDays(today, -Number(days[1])) : undefined;
}

/** Tests only. */
export function resetTodayFixtureForTests() {
  read = null;
}

/** Election-only clock, independent of the edition fixture's date. */
export function vicElectionFixtureNow(): Date | null {
  if (!isE2E) return null;
  const value = arg('OPAXVicElection') ?? electionClock;
  const instant =
    value === 'ahead'
      ? '2026-11-20T10:00:00+11:00'
      : value === 'today'
        ? '2026-11-28T10:00:00+11:00'
        : value === 'closed'
          ? '2026-11-28T19:00:00+11:00'
          : null;
  return instant ? new Date(instant) : null;
}

// Android QA links supply the same election-only clock as iOS launch arguments.
let electionClock: string | null = null;
const electionClockListeners = new Set<() => void>();
export const electionClockSnapshot = () => electionClock;
export const subscribeElectionClock = (listener: () => void) => {
  electionClockListeners.add(listener);
  return () => {
    electionClockListeners.delete(listener);
  };
};
export function setElectionClock(value: string) {
  if (
    !isE2E ||
    !['ahead', 'today', 'closed'].includes(value) ||
    electionClock === value
  )
    return;
  electionClock = value;
  electionClockListeners.forEach((listener) => listener());
}
