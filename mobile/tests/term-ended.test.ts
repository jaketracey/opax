import {
  councilEndsWithAssembly,
  endedParliaments,
  endedTermLine,
  isCouncil,
  lastMemberFor,
  termEndedFor,
} from '../src/features/your-mp/term-ended';
import { sameLoaded } from '../src/features/people/profile-memo';

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

describe('a district whose own row says its result is loaded', () => {
  const seat = (
    id: string,
    chamber: string,
    dissolved_for?: string | null,
    jurisdiction = 'vic',
  ) => ({
    electorate_id: id,
    jurisdiction,
    chamber,
    state_code: jurisdiction,
    dissolved_for,
  });
  // Results declared seat by seat: Essendon's row is null, the rest dated.
  const mixed = [
    seat('essendon', 'vic_la', null),
    seat('burwood', 'vic_la', '2026-11-28'),
    seat('melton', 'vic_la', '2026-11-28'),
    seat('northern-metro', 'vic_lc'),
    seat('grayndler', 'representatives', undefined, 'federal'),
  ];
  const ended = endedParliaments(mixed);
  // A people-catalogue seat: no field of its own, its index row by ID.
  const held = (id: string, chamber = 'vic_la') => ({
    electorate_id: id,
    jurisdiction: 'vic',
    chamber,
  });

  test('has a member again while the other districts are still ended', () => {
    expect([...ended.keys()]).toEqual(['vic']);
    expect([...ended.resumed!]).toEqual(['essendon']);
    // The index row answers for itself.
    expect(termEndedFor(mixed[0]!, ended)).toBeNull();
    expect(termEndedFor(mixed[1]!, ended)?.electionDay).toBe('2026-11-28');
    // A people-catalogue seat is looked up by its row's ID.
    expect(termEndedFor(held('essendon'), ended)).toBeNull();
    expect(termEndedFor(held('burwood'), ended)?.electionDay).toBe(
      '2026-11-28',
    );
    // A seat the index does not hold borrows the parliament's answer.
    expect(termEndedFor(held('not-in-the-index'), ended)).not.toBeNull();
    // The Council has no field: it ends with the Assembly until every
    // district has cleared.
    expect(termEndedFor(mixed[3]!, ended)).not.toBeNull();
    expect(
      termEndedFor(held('northern-metro', 'vic_lc'), ended),
    ).not.toBeNull();
  });

  test('a Council row that carries null still borrows the Assembly’s answer (s 28(2))', () => {
    const rows = [...mixed.slice(0, 3), seat('northern-metro', 'vic_lc', null)];
    const terms = endedParliaments(rows);
    expect(termEndedFor(rows[3]!, terms)).not.toBeNull();
    expect([...terms.resumed!]).toEqual(['essendon']);
    // NSW's Council does not end with its Assembly: its null is its own.
    const nsw = [
      seat('a', 'nsw_la', '2027-03-27', 'nsw'),
      seat('c', 'nsw_lc', null, 'nsw'),
    ];
    expect(termEndedFor(nsw[1]!, endedParliaments(nsw))).toBeNull();
  });

  test('an index whose rows all agree answers exactly as before', () => {
    const answers = (value: string | null | undefined) => {
      const rows = mixed.map((r) =>
        r.chamber === 'vic_la' ? { ...r, dissolved_for: value } : r,
      );
      const terms = endedParliaments(rows);
      return {
        terms,
        byRow: rows.map((r) => termEndedFor(r, terms)),
        byId: rows.map((r) =>
          termEndedFor(
            {
              electorate_id: r.electorate_id,
              jurisdiction: r.jurisdiction,
              chamber: r.chamber,
            },
            terms,
          ),
        ),
      };
    };
    const term = { electionDay: '2026-11-28', stateCode: 'vic' };
    const dated = answers('2026-11-28');
    expect(dated.terms.resumed!.size).toBe(0);
    expect(dated.byRow).toEqual([term, term, term, term, null]);
    expect(dated.byId).toEqual(dated.byRow);
    // The parliament's own entry, not a copy.
    expect(dated.byRow[0]).toBe(dated.terms.get('vic'));
    for (const value of [null, undefined]) {
      const none = answers(value);
      expect(none.terms.size).toBe(0);
      expect(none.byRow).toEqual([null, null, null, null, null]);
      expect(none.byId).toEqual(none.byRow);
    }
  });
});

test('isCouncil knows every state upper house by its chamber code, and no lower house', () => {
  for (const code of ['nsw_lc', 'vic_lc', 'wa_lc', 'sa_lc', 'tas_lc'])
    expect(isCouncil(code)).toBe(true);
  for (const code of [
    'nsw_la',
    'vic_la',
    'qld_la',
    'wa_la',
    'sa_ha',
    'tas_ha',
    'act_la',
    'nt_la',
    'representatives',
    'senate',
  ])
    expect(isCouncil(code)).toBe(false);
});

describe('a remembered person page (profile-memo)', () => {
  const vic = (dissolved_for: string | null, id = 'essendon') => ({
    electorate_id: id,
    jurisdiction: 'vic',
    chamber: 'vic_la',
    state_code: 'vic',
    dissolved_for,
  });
  const loaded = (ended?: ReturnType<typeof endedParliaments>) =>
    ({ profile: { name: 'Same' }, official: null, seat: null, ended }) as never;

  test('is redrawn when Victoria’s term ends or resumes, and kept otherwise', () => {
    const withVictoria = endedParliaments([vic('2026-11-28')]);
    const without = endedParliaments([vic(null)]);
    expect(sameLoaded(loaded(withVictoria), loaded(without))).toBe(false);
    expect(sameLoaded(loaded(without), loaded(withVictoria))).toBe(false);
    expect(sameLoaded(loaded(withVictoria), loaded(undefined))).toBe(false);
    expect(
      sameLoaded(
        loaded(withVictoria),
        loaded(endedParliaments([vic('2026-11-28')])),
      ),
    ).toBe(true);
    expect(sameLoaded(loaded(without), loaded(undefined))).toBe(true);
  });

  test('is redrawn when one district’s own row clears ahead of the rest', () => {
    const all = endedParliaments([
      vic('2026-11-28'),
      vic('2026-11-28', 'burwood'),
    ]);
    const one = endedParliaments([vic(null), vic('2026-11-28', 'burwood')]);
    expect(sameLoaded(loaded(all), loaded(one))).toBe(false);
  });
});
