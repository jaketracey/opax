jest.mock('../src/api/runtime', () => ({ catalogs: {}, portraits: null }));
jest.mock('expo-router', () => ({ router: { push: jest.fn() } }));

import {
  LATELY_RULE,
  latelyFor,
  latelySource,
  questionType,
  voteAction,
} from '../src/features/your-mp/latest';
import { tenureYear } from '../src/features/your-mp/RepresentativesGroup';
import { stateInRunningCopy } from '../src/features/your-mp/state-names';
import { NO_SEAT_ID } from '../src/features/your-mp/forget';
import { decodeChoice } from '../src/features/your-mp/model';

type Vote = {
  name: string;
  stage: string;
  date: string;
  billKey?: string | null;
  jur?: string;
};
const ready = <T>(data: T, asAt = '2026-09-04') => ({
  status: 'ready' as const,
  data,
  asAt,
  sources: [{ label: 'They Vote For You', url: 'https://theyvoteforyou.org.au/' }],
  stale: false,
  savedAt: null,
});
function profile({
  votesFor = [] as Vote[],
  votesAgainst = [] as Vote[],
  interests = {} as Record<
    string,
    { holder: string; description: string; kind: string; date: string | null }[]
  >,
  failVotes = false,
  failInterests = false,
} = {}) {
  const error = {
    status: 'error' as const,
    data: null,
    asAt: null,
    sources: [],
    stale: false,
    savedAt: null,
  };
  return {
    personId: 'person_aaaaaaaaaaaaaaaaaaaaaaaa',
    slug: 'anthony-albanese',
    blocks: {
      identity: ready({ name: 'Anthony Albanese' }),
      votes: failVotes
        ? error
        : ready({ for: votesFor, against: votesAgainst }),
      interests: failInterests
        ? error
        : ready(
            {
              buckets: Object.fromEntries(
                Object.entries(interests).map(([k, items]) => [k, { items }]),
              ),
            },
            '2026-08-31',
          ),
    },
  } as never;
}

describe('the question rule', () => {
  test.each([
    ['Second Reading', 'Online Safety Bill 2026', 'bill-stage'],
    ['Third Reading', 'Housing Bill 2023', 'bill-stage'],
    ['', 'That the bill be now read a second time', 'bill-stage'],
    ['Passage', 'Climate Bill', 'bill-stage'],
    ['Second Reading Amendment', 'Online Safety Bill 2026', 'amendment'],
    ['Consideration in Detail', 'Online Safety Bill 2026', 'amendment'],
    ['Committee of the Whole', 'Aged Care Bill', 'amendment'],
    ['', 'Limitation of debate', 'procedural'],
    ['', 'Suspension of standing orders', 'procedural'],
    ['', 'That the question be now put', 'procedural'],
    ['', 'Motions; Something else', 'unknown'],
  ])('%s %s is %s', (stage, name, type) => {
    expect(questionType({ stage, name })).toBe(type);
  });
  test('verbs follow the question type, never the bill alone', () => {
    expect(voteAction('bill-stage', 'for')).toBe('Voted for');
    expect(voteAction('bill-stage', 'against')).toBe('Voted against');
    expect(voteAction('amendment', 'for')).toBe('Voted for an amendment');
    expect(voteAction('amendment', 'against')).toBe(
      'Voted against an amendment',
    );
    expect(voteAction('procedural', 'for')).toBeNull();
    expect(voteAction('unknown', 'against')).toBeNull();
  });
});

describe('Lately', () => {
  test('loading before the profile, error when every source fails', () => {
    expect(latelyFor(null, null)).toEqual({ status: 'loading' });
    expect(
      latelyFor(profile({ failVotes: true, failInterests: true }), null),
    ).toEqual({ status: 'error' });
    expect(latelyFor(profile(), null, { failed: true })).toEqual({
      status: 'error',
    });
  });
  test('empty after success is empty, never an error', () => {
    expect(latelyFor(profile(), null)).toEqual({ status: 'empty' });
  });
  test('amendments say so; procedural and unknown divisions are left out', () => {
    const state = latelyFor(
      profile({
        votesAgainst: [
          {
            name: 'Online Safety Amendment (Social Media Minimum Age) Bill 2026',
            stage: 'Second Reading Amendment',
            date: '2026-07-01',
            billKey: 'r7284',
          },
          { name: 'Limitation of debate', stage: '', date: '2026-07-02' },
          { name: 'Business of the House', stage: '', date: '2026-07-03' },
        ],
      }),
      null,
    );
    expect(state.status).toBe('ready');
    if (state.status !== 'ready') return;
    expect(state.records).toHaveLength(1);
    expect(state.records[0]!.action).toBe('Voted against an amendment');
    expect(state.records[0]!.detail).toBe('Second Reading Amendment');
  });
  test('newest first; ties by kind (vote, register, bill) then title; limit', () => {
    const votes = Array.from({ length: 6 }, (_, i) => ({
      name: `Bill ${i}`,
      stage: 'Second Reading',
      date: `2026-07-0${i + 1}`,
      billKey: `r${i}`,
    }));
    const state = latelyFor(
      profile({
        votesFor: votes,
        interests: {
          gifts: [
            {
              holder: 'self',
              description: 'Two theatre tickets',
              kind: 'addition',
              date: '2026-07-06',
            },
          ],
        },
      }),
      null,
    );
    if (state.status !== 'ready') throw new Error(state.status);
    expect(state.records).toHaveLength(5);
    expect(state.records.map((r) => r.date)).toEqual([
      '2026-07-06',
      '2026-07-06',
      '2026-07-05',
      '2026-07-04',
      '2026-07-03',
    ]);
    // Same day: the vote before the register change.
    expect(state.records[0]!.kind).toBe('vote');
    expect(state.records[1]!.action).toBe('Declared a gift');
  });
  test('statement rows and undated register rows never enter', () => {
    const state = latelyFor(
      profile({
        interests: {
          gifts: [
            {
              holder: 'self',
              description: 'In the statement',
              kind: 'statement',
              date: '2025-08-04',
            },
            {
              holder: 'self',
              description: 'No date',
              kind: 'addition',
              date: null,
            },
            {
              holder: 'self',
              description: 'Season tickets',
              kind: 'deletion',
              date: '2026-08-31',
            },
          ],
        },
      }),
      null,
    );
    if (state.status !== 'ready') throw new Error(state.status);
    expect(state.records.map((r) => r.action)).toEqual([
      'Gift removed from the register',
    ]);
  });
  test('vote rows open the division on its bill page, else the section', () => {
    const state = latelyFor(
      profile({
        votesFor: [
          {
            name: 'Housing Bill',
            stage: 'Third Reading',
            date: '2026-06-01',
            billKey: 'r1',
          },
        ],
      }),
      null,
    );
    if (state.status !== 'ready') throw new Error(state.status);
    expect(state.records[0]!.href).toMatchObject({
      pathname: '/bill/[key]',
      params: { key: 'r1', section: 'divisions' },
    });
  });
  test('the source sheet says the rule and names a failed source', () => {
    const source = latelySource(profile({ failInterests: true }), null);
    expect(source.notes[0]).toBe(LATELY_RULE);
    expect(source.notes[1]).toMatch(/Register of interests/);
    expect(source.asOf).toBe('2026-09-04');
  });
});

describe('tenure', () => {
  const term = (start: string | null, precision: string, end: string | null = null) => ({
    person_id: 'person_a',
    start,
    end,
    start_precision: precision,
    end_precision: end ? 'day' : 'open',
    observed_through: '2026-09-09',
    sources: [],
    source_party_label: null,
    party_periods: [],
  });
  test('the current term start, at year precision or better', () => {
    expect(tenureYear('person_a', [term('1996-03-02', 'day')] as never)).toBe(
      1996,
    );
    expect(
      tenureYear('person_a', [
        term('1989-08-29', 'day', '1993-03-13'),
        term('1996-03-02', 'day'),
      ] as never),
    ).toBe(1996);
  });
  test('approximate starts and closed terms print nothing', () => {
    expect(
      tenureYear('person_a', [term('1996-01-01', 'approximate')] as never),
    ).toBeNull();
    expect(
      tenureYear('person_a', [
        term('1994-03-26', 'day', '2019-05-18'),
      ] as never),
    ).toBeNull();
    expect(tenureYear('person_a', null)).toBeNull();
  });
});

test('territories take "the" in running copy; states do not', () => {
  expect(`2 senators for ${stateInRunningCopy('act')}`).toBe(
    '2 senators for the Australian Capital Territory',
  );
  expect(`Senators for ${stateInRunningCopy('nt')}`).toBe(
    'Senators for the Northern Territory',
  );
  expect(stateInRunningCopy('nsw')).toBe('New South Wales');
});

test('a forgotten seat still decodes, so the older slot never returns', () => {
  expect(
    decodeChoice({ version: 1, seatId: NO_SEAT_ID, stateSeatIds: [] }),
  ).toEqual({ version: 1, seatId: NO_SEAT_ID, stateSeatIds: [] });
});
