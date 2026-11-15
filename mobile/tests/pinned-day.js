/* global jest */
// On this day (features/bills/on-this-day.ts) reads the Sydney calendar day,
// so the Bills list would gain or lose rows with the date a suite runs on.
// Every suite sees 1 January 2026, a date with no earlier bill in the pinned
// register, and no dated index for it, so the rows are absent unless a suite
// mocks these modules itself (the bills-on-this-day suites do).
jest.mock('../src/features/bills/sydney-day', () => ({
  currentSydneyDay: () => '2026-01-01',
}));
jest.mock('../src/features/bills/on-this-day-data', () => ({
  ON_THIS_DAY_GRACE_MS: 100,
  readOnThisDay: async () => null,
  onThisDayInTime: (read) => read,
}));
