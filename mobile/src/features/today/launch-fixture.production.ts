import type { TodayFixture } from './launch-fixture';
export const todayFixture = (): TodayFixture => ({
  seat: null,
  editionCache: null,
  editionAge: null,
  welcomeDeclined: null,
});
export const fixtureToday = () => null;
export const fixtureDeclinedAt = () => null;
export const resetTodayFixtureForTests = () => undefined;
