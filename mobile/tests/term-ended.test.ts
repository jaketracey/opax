import { decodeElectorateIndex } from '../src/api/catalogs';
import { manifest, pinned } from './pinned';
import {
  councilEndsWithAssembly,
  endedParliaments,
  endedTermLine,
  lastMemberFor,
  termEndedFor,
} from '../src/features/your-mp/term-ended';

const row = (
  jurisdiction: string,
  chamber: string,
  dissolved_for?: string | null,
) => ({ jurisdiction, chamber, state_code: jurisdiction, dissolved_for });

describe('a parliament whose term has ended for an election', () => {
  const index = [
    row('federal', 'representatives'),
    row('vic', 'vic_la', '2026-11-28'),
    row('vic', 'vic_lc'),
    row('nsw', 'nsw_la', '2027-03-27'),
    row('nsw', 'nsw_lc'),
    row('qld', 'qld_la', null),
  ];
  const ended = endedParliaments(index);

  test('is read from the lower house rows of the electorates index', () => {
    expect([...ended.keys()].sort()).toEqual(['nsw', 'vic']);
    expect(ended.get('vic')).toEqual({
      electionDay: '2026-11-28',
      stateCode: 'vic',
    });
    expect(
      endedParliaments(index.map((r) => ({ ...r, dissolved_for: null }))),
    ).toEqual(new Map());
    expect(
      endedParliaments(index.map((r) => ({ ...r, dissolved_for: undefined }))),
    ).toEqual(new Map());
  });

  test('covers the Assembly seat, and the Council seat in Victoria only (s 28(2))', () => {
    expect(councilEndsWithAssembly('vic')).toBe(true);
    expect(councilEndsWithAssembly('nsw')).toBe(false);
    expect(termEndedFor(row('vic', 'vic_la'), ended)?.electionDay).toBe(
      '2026-11-28',
    );
    expect(termEndedFor(row('vic', 'vic_lc'), ended)?.electionDay).toBe(
      '2026-11-28',
    );
    expect(termEndedFor(row('nsw', 'nsw_la'), ended)?.electionDay).toBe(
      '2027-03-27',
    );
    expect(termEndedFor(row('nsw', 'nsw_lc'), ended)).toBeNull();
    expect(termEndedFor(row('qld', 'qld_la'), ended)).toBeNull();
    expect(termEndedFor(row('federal', 'representatives'), ended)).toBeNull();
    expect(termEndedFor(row('federal', 'senate'), ended)).toBeNull();
  });

  test('is said in Today’s words, and nobody is called a member', () => {
    expect(endedTermLine(ended.get('vic')!)).toBe(
      'Parliament’s term ended on 3 November for the 28 November election',
    );
    expect(lastMemberFor('Essendon')).toBe('Last member for Essendon');
  });
});

describe('the electorates index field this build first shipped without', () => {
  const raw = pinned(manifest.index_url) as {
    electorates: Record<string, unknown>[];
  };
  const id = raw.electorates.find(
    (row) => row.chamber === 'vic_la',
  )!.electorate_id;
  const decoded = (value: unknown) =>
    decodeElectorateIndex({
      ...raw,
      electorates: raw.electorates.map((row) =>
        row.electorate_id === id ? { ...row, dissolved_for: value } : row,
      ),
    });
  const field = (value: unknown) =>
    decoded(value).electorates.find((s) => s.electorate_id === id)!
      .dissolved_for;

  test('decodes a day, null, or absent', () => {
    expect(field('2026-11-28')).toBe('2026-11-28');
    expect(field(null)).toBeNull();
    expect(
      decodeElectorateIndex(raw).electorates.find(
        (s) => s.electorate_id === id,
      )!.dissolved_for,
    ).toBeUndefined();
  });

  test('a value it cannot read says nothing, and the row is kept', () => {
    for (const value of ['soon', 20261128, {}, '']) {
      expect(field(value)).toBeUndefined();
      expect(decoded(value).electorates.length).toBe(
        decodeElectorateIndex(raw).electorates.length,
      );
    }
  });

  test('the live shape (every Assembly row dated) gives one ended parliament', () => {
    const index = decodeElectorateIndex({
      ...raw,
      electorates: raw.electorates.map((row) =>
        row.chamber === 'vic_la'
          ? { ...row, dissolved_for: '2026-11-28' }
          : row,
      ),
    });
    expect([...endedParliaments(index.electorates)]).toEqual([
      ['vic', { electionDay: '2026-11-28', stateCode: 'vic' }],
    ]);
  });
});
