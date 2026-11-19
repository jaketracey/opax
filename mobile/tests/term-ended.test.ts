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
