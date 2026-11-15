/* global jest */
// On this day (features/bills/on-this-day.ts) reads the Sydney calendar day,
// so the Bills list would gain or lose a row with the date a suite runs on.
// Every suite sees 1 January 2026, a date with no earlier bill in the pinned
// register, so the row is absent unless a suite mocks this module itself
// (tests/bills-on-this-day.test.tsx does).
jest.mock('../src/features/bills/sydney-day', () => ({
  useSydneyDay: () => '2026-01-01',
}));
