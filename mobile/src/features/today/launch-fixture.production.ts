import type { TodayFixture } from './launch-fixture';
export const todayFixture = (): TodayFixture => ({
  seat: null,
  editionCache: null,
  editionAge: null,
  welcomeDeclined: null,
  plateDraw: null,
});
export const fixtureToday = () => null;
export const fixtureDeclinedAt = () => null;
export const resetTodayFixtureForTests = () => undefined;

export function vicElectionFixtureNow(): Date | null {
  return null;
}

export const electionClockSnapshot = () => null;
export const subscribeElectionClock = (_listener: () => void) => () => {};
export const setElectionClock = (_value: string) => {};
