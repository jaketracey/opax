// The Receipts source sheet's clamping note describes the party on screen,
// not whichever party happens to come first in the AEC file.
import { fundingNotes, type Funding } from '../src/features/people/PartyDepth';

jest.mock('../src/api/runtime', () => ({ peopleDepth: {} }));

const year = (receipts: number, donations: number) => ({
  year: '2024-25',
  receipts,
  donations,
  other: 0,
});
const record = {
  data: {
    parties: {
      'Fixture First Party': { returns: [year(100, 50)] },
      'Fixture Clamped Party': { returns: [year(100, 150)] },
    },
  },
} as unknown as Funding;
const clamped = (notes: string[]) => notes.some((n) => /clamped/.test(n));

test('the clamping note follows the named party', () => {
  expect(clamped(fundingNotes(record, 'Fixture Clamped Party'))).toBe(true);
  expect(clamped(fundingNotes(record, 'Fixture First Party'))).toBe(false);
  expect(clamped(fundingNotes(record, 'Fixture Missing Party'))).toBe(false);
});
