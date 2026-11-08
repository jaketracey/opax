import { Settings } from 'react-native';
import { isE2E } from '../../design/environment';
import type { CachedEdition } from './order';
import { addDays, type SydneyDate } from './rules';

/**
 * E2E captures only: Today's launch arguments, read from the argument
 * domain Maestro's `arguments:` fill on iOS. Release builds read nothing
 * (`isE2E` is false there), so every value is null.
 *
 * - `OPAXSeat`: `none` | `federal` (Grayndler) | `federal+state`
 *   (Melbourne and a Victorian district).
 * - `OPAXEditionCache`: `none` (first install, case C) | `present` (the
 *   edition is read before the order is decided, as if it were saved).
 * - `OPAXEditionAge`: `fresh` | `recent` | `old`: Today's date is set that
 *   many days after the fixture edition's date (1, 7 or 30), so the tiers
 *   and the daily rules are pinned.
 * - `OPAXWelcomeDeclined`: `none` | `today` | `{n}d` (n days ago).
 */
export interface TodayFixture {
  seat: 'none' | 'federal' | 'federal+state' | null;
  editionCache: 'none' | 'present' | null;
  editionAge: 'fresh' | 'recent' | 'old' | null;
  welcomeDeclined: string | null;
}

const none: TodayFixture = {
  seat: null,
  editionCache: null,
  editionAge: null,
  welcomeDeclined: null,
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
    seat: oneOf(arg('OPAXSeat'), ['none', 'federal', 'federal+state']),
    editionCache: oneOf(arg('OPAXEditionCache'), ['none', 'present']),
    editionAge: oneOf(arg('OPAXEditionAge'), ['fresh', 'recent', 'old']),
    welcomeDeclined: arg('OPAXWelcomeDeclined'),
  };
  return read;
}

/** Days after the edition's date that each age pins Today to. */
export const AGE_DAYS = { fresh: 1, recent: 7, old: 30 } as const;

/** The pinned Sydney date for an edition age, or null. */
export function fixtureToday(
  fixture: TodayFixture,
  edition: CachedEdition,
): SydneyDate | null {
  if (!fixture.editionAge || !edition || edition === 'missing') return null;
  return addDays(edition.date, AGE_DAYS[fixture.editionAge]);
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
