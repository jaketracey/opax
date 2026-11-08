import fs from 'node:fs';
import path from 'node:path';
import {
  changesFor,
  changeText,
  currentKeys,
  declarationAction,
  moreChangesText,
  questionType,
  todayChanges,
  voteAction,
  type FollowRecord,
} from '../src/features/follows/changes';
import {
  followState,
  type FollowSources,
} from '../src/features/follows/markers';
import type { Fingerprint, Follow } from '../src/features/follows/store';
import { catalogs, index } from './pinned';

const sources = (over: Partial<FollowSources> = {}): FollowSources => ({
  manifest: catalogs.manifest,
  roster: catalogs.roster,
  slugs: catalogs.slugs,
  people: catalogs.people,
  electorates: index,
  bills: catalogs.bills!,
  votes: catalogs.votes!,
  interestIndex: catalogs.interestIndex!,
  pay: catalogs.pay!,
  expenses: catalogs.expenses!,
  money: null,
  stale: false,
  savedAt: 1,
  error: null,
  ...over,
});
const vote: FollowRecord = {
  key: 'division:old',
  kind: 'vote',
  title: 'Housing Bill',
  date: '2026-08-19',
  stage: 'Second reading',
  question_type: 'bill-stage',
  position: 'for',
  billKey: 'au-federal-r7549',
  divisionKey: 'old',
};
const baseline = (
  kind: Follow['kind'] = 'person',
  seen: Fingerprint = {},
): Pick<Follow, 'kind' | 'seen' | 'seenKeys'> => ({ kind, seen, seenKeys: [] });
const reading = (
  value: string | number | null,
  words?: string,
  asAt: string | null = '2026-09-02',
) => ({ value, words, asAt });

test('late publication compares identities, carries its own date and never borrows the last-look date', () => {
  const current = { divisions: { ...reading(1), records: [vote] } };
  const changes = changesFor(baseline(), current);
  expect(changeText(changes[0]!, 2026)).toBe('Voted for a bill · 19 Aug');
  expect(changes[0]!.record?.date).toBe('2026-08-19');
  expect(
    changesFor({ ...baseline(), seenKeys: ['division:old'] }, current),
  ).toEqual([]);
  expect(
    changesFor({ kind: 'person', seen: {}, seenKeys: undefined }, current),
  ).toEqual([]);
  expect(currentKeys(current)).toEqual(['division:old']);
});
test.each([
  ['Second Reading', 'bill-stage'],
  ['Third Reading', 'bill-stage'],
  ['Passage', 'bill-stage'],
  ['Agree to the bill', 'bill-stage'],
  ['That the bill be now read a second time', 'bill-stage'],
  ['Second Reading Amendment', 'amendment'],
  ['Consideration in Detail', 'amendment'],
  ['Committee of the Whole', 'amendment'],
  ['Amendment', 'amendment'],
  ['Limitation of debate', 'procedural'],
  ['Closure', 'procedural'],
  ['Suspension of standing orders', 'procedural'],
  ['Adjournment', 'procedural'],
  ['That the question be now put', 'procedural'],
  ['An unclassified question', 'unknown'],
] as const)('question rule: %s is %s', (name, expected) =>
  expect(questionType({ name })).toBe(expected),
);
test('published question type wins; amendment verbs cannot describe the bill itself', () => {
  expect(
    questionType({ name: 'Second Reading', question_type: 'amendment' }),
  ).toBe('amendment');
  expect(voteAction('amendment', 'against')).toBe('Voted against an amendment');
  expect(voteAction('unknown', 'for')).toBeNull();
  expect(voteAction('procedural', 'against')).toBeNull();
});
test('a legacy follow baselines all markers silently on its first check', () => {
  expect(
    changesFor(
      { kind: 'person', seen: { party: reading('old', 'Labor') } },
      {
        party: reading('new', 'Independent'),
        divisions: { ...reading(2), records: [vote] },
      },
    ).map((c) => changeText(c, 2026)),
  ).toEqual([]);
});
test('person markers use the neutral words, exclude pay and keep expenses off Today', () => {
  const before = {
    party: reading('Labor', 'Labor'),
    seat: reading('old', 'Grayndler'),
    pay: reading('old'),
    expenses: reading('2026Q01|1'),
  };
  const current = {
    party: reading('Independent', 'Independent'),
    seat: reading('new', 'Sydney'),
    pay: reading('new'),
    expenses: reading('2026Q02|2', undefined, '2026-09-14'),
    declarations: {
      ...reading(1),
      records: [
        {
          ...vote,
          key: 'gift',
          kind: 'register' as const,
          category: 'gifts',
          date: '2026-08-31',
        },
      ],
    },
    introduced: {
      ...reading(1),
      records: [
        { ...vote, key: 'bill', kind: 'bill' as const, date: '2026-08-12' },
      ],
    },
  };
  const changes = changesFor(baseline('person', before), current);
  expect(changes.map((c) => changeText(c, 2026))).toEqual(
    expect.arrayContaining([
      'Now Independent; was Labor · 2 Sep',
      'Now Member for Sydney; was Grayndler · 2 Sep',
      'Declared a gift · 31 Aug',
      'Introduced a bill · 12 Aug',
      'Expenses to June 2026 published · 14 Sep',
    ]),
  );
  expect(changes.some((c) => c.marker === 'pay')).toBe(false);
  expect(todayChanges(changes).some((c) => c.marker === 'expenses')).toBe(
    false,
  );
  expect(
    changesFor(baseline('person', { seat: reading('old', 'Grayndler') }), {
      seat: reading('', ''),
    })[0]!.text,
  ).toBe('No longer in parliament');
  expect(declarationAction('gifts', 'deletion')).toBe(
    'Gift removed from the register',
  );
  expect(declarationAction('sponsored_travel')).toBe(
    'Declared sponsored travel',
  );
  expect(declarationAction('shareholdings')).toBe('Updated shareholdings');
});
test('party revisions are quiet; new financial years and members are named', () => {
  const member = {
    ...vote,
    key: 'person:jane',
    kind: 'member' as const,
    name: 'Jane Doe',
    title: 'Jane Doe',
    date: '2026-09-02',
    slug: 'jane-doe',
  };
  const before = {
    receipts: reading(1),
    donations: reading(1),
    returns: { ...reading('2025'), records: [] },
    members: { ...reading(''), records: [] },
  };
  const after = {
    receipts: reading(2000),
    donations: reading(500),
    returns: {
      ...reading('2026'),
      records: [
        {
          ...vote,
          key: 'return:2026',
          kind: 'return' as const,
          title: '2025–26',
          date: '2026-02-02',
        },
      ],
    },
    members: { ...reading('jane'), records: [member] },
  };
  expect(
    changesFor(baseline('party', before), after).map((c) =>
      changeText(c, 2026),
    ),
  ).toEqual([
    'Now includes Jane Doe · 2 Sep',
    '2025–26 donations return published · 2 Feb',
  ]);
  expect(
    changesFor(baseline('party', after), {
      ...after,
      members: { ...reading(''), records: [] },
    }).map((c) => changeText(c, 2026)),
  ).toContain('No longer includes Jane Doe · 2 Sep');
});
test('bill stage fallback, status wording, rich divisions, speeches and duplicate events', () => {
  const seen = {
    status: reading('before', 'before parliament'),
    moved: reading('old'),
  };
  const current = {
    status: reading('before', 'before parliament'),
    moved: reading('new'),
  };
  expect(
    changeText(changesFor(baseline('bill', seen), current)[0]!, 2026),
  ).toBe('Moved to a new stage · 2 Sep');
  for (const [status, expected] of [
    ['passed', 'Passed'],
    ['lapsed', 'Lapsed'],
    ['royal_assent', 'Royal Assent'],
  ])
    expect(
      changesFor(baseline('bill', seen), {
        status: reading(status!, status),
      })[0]!.text,
    ).toBe(expected);
  const stage = {
    ...vote,
    key: 'stage',
    kind: 'stage' as const,
    stage: 'Second reading',
    chamber: 'Senate',
  };
  const division = {
    ...stage,
    key: 'division',
    kind: 'division' as const,
    outcome: 'agreed to',
  };
  const speech = {
    ...vote,
    key: 'speech',
    kind: 'speech' as const,
    name: 'Jane Doe',
  };
  const changes = changesFor(baseline('bill', seen), {
    moved: { ...reading('new'), records: [stage] },
    divisions: { ...reading(1), records: [division] },
    speeches: { ...reading(1), records: [speech] },
  });
  expect(changes.map((c) => changeText(c, 2026))).toEqual([
    'Second reading agreed to · Senate · 19 Aug',
    'Speech by Jane Doe · 19 Aug',
  ]);
});
test('electorate changes and missing dates use their published dates or the explicit flag', () => {
  const changes = changesFor(
    baseline('electorate', {
      representatives: reading('old', 'Y'),
      election: reading('2022-05-21|1'),
      status: reading('current'),
    }),
    {
      representatives: reading('new', 'X'),
      election: reading('2025-05-03|2', undefined, '2025-05-03'),
      status: reading('historical', undefined, '2025-06-30'),
    },
  );
  expect(changes.map((c) => changeText(c, 2026))).toEqual([
    'Now represented by X; was Y · 2 Sep',
    'Abolished · 30 Jun 2025',
    'Election result added · 3 May 2025',
  ]);
  const undated = changesFor(
    baseline('person', { party: reading('old', 'Labor') }),
    { party: reading('new', 'Independent', null) },
  );
  expect(undated[0]).toMatchObject({ dateNotPublished: true });
});
test('dated line invariant and noun-free remainder', () => {
  const changes = changesFor(baseline(), {
    divisions: {
      ...reading(1),
      records: [
        vote,
        {
          ...vote,
          key: 'amendment',
          question_type: 'amendment',
          position: 'against',
        },
      ],
    },
  });
  for (const change of changes)
    expect(changeText(change, 2026)).toMatch(
      /· \d{1,2} [A-Z][a-z]{2}( \d{4})?$/,
    );
  expect(moreChangesText(3)).toBe('and 3 more');
});
test('real shared catalogs supply vote identities; counts alone never invent records', () => {
  const state = followState(
    {
      kind: 'person',
      id: 'person_2b850aa643795ce8902f754b',
      seen: {},
      seenKeys: [],
    },
    sources(),
  );
  expect(state.status).toBe('ready');
  if (state.status !== 'ready') throw new Error('Missing fixture');
  expect(state.keys.length).toBeGreaterThan(0);
  expect(state.changes.some((c) => c.marker === 'divisions')).toBe(true);
  expect(state.changes.some((c) => c.marker === 'declarations')).toBe(false);
  expect(
    followState(
      { kind: 'bill', id: 'au-federal-r7549', seen: null },
      sources({ bills: null }),
    ).status,
  ).toBe('unavailable');
});
test('neutrality lint covers the entire follows feature', () => {
  const never =
    /\b(bought|corrupt|rort|scandal|secret|exposed|influence|linked to|disclosed|negatived)\b/i;
  const folder = path.join(__dirname, '../src/features/follows');
  for (const file of fs
    .readdirSync(folder)
    .filter((name) => /\.(tsx?|md)$/.test(name)))
    expect({
      file,
      violation: fs
        .readFileSync(path.join(folder, file), 'utf8')
        .match(never)?.[0],
    }).toEqual({ file, violation: undefined });
});

test('richer fields are detected on existing catalogs without another data read', () => {
  const bills = structuredClone(catalogs.bills!);
  const bill = bills.bills.find((b) => b.key === 'au-federal-r7549')!;
  Object.assign(bill, {
    latest_stage: {
      stage: 'Second reading',
      chamber: 'Senate',
      date: '2026-08-19',
    },
    latest_division: {
      key: 'division:rich',
      stage: 'Second reading',
      chamber: 'Senate',
      date: '2026-08-19',
      outcome: 'agreed to',
    },
    latest_speech: {
      key: 'speech:rich',
      speaker_name: 'Jane Doe',
      date: '2026-08-18',
    },
  });
  const state = followState(
    { kind: 'bill', id: bill.key, seen: {}, seenKeys: [] },
    sources({ bills }),
  );
  expect(state.status).toBe('ready');
  if (state.status !== 'ready') throw new Error('Missing fixture');
  expect(state.changes.map((c) => changeText(c, 2026))).toEqual([
    'Second reading agreed to · Senate · 19 Aug',
    'Speech by Jane Doe · 18 Aug',
  ]);
  expect(state.keys).toEqual(
    expect.arrayContaining(['division:rich', 'speech:rich']),
  );
});
