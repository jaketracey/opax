import fs from 'node:fs';
import path from 'node:path';
import {
  changesFor,
  changeText,
  currentKeys,
  seenKeysForChanges,
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
import {
  follow,
  followKey,
  loadFollows,
  markSeen,
  resetFollowsForTests,
  type Fingerprint,
  type Follow,
} from '../src/features/follows/store';
import { decodeMoney } from '../src/api/catalogs';
import { partyMembers } from '../src/api/party-page';
import { catalogs, index } from './pinned';

const mockDisk = new Map<string, string>();
jest.mock('expo-file-system', () => ({
  Paths: { document: 'documents' },
  File: class {
    name: string;
    constructor(_directory: unknown, name: string) {
      this.name = name;
    }
    get exists() {
      return mockDisk.has(this.name);
    }
    async text() {
      return mockDisk.get(this.name)!;
    }
    write(body: string) {
      mockDisk.set(this.name, body);
    }
  },
}));
beforeEach(() => {
  mockDisk.clear();
  resetFollowsForTests();
});
const ready = (state: ReturnType<typeof followState>) => {
  if (state.status !== 'ready') throw new Error(`Unexpected ${state.status}`);
  return state;
};
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
  seen: Fingerprint = { divisions: { value: 0, asAt: null, records: [] } },
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
    declarations: { ...reading(0), records: [] },
    introduced: { ...reading(0), records: [] },
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
    members: { ...reading('person:jane'), records: [member] },
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
    divisions: { ...reading(0), records: [] },
    speeches: { ...reading(0), records: [] },
  };
  const current = {
    status: reading('before', 'before parliament'),
    moved: reading('new'),
  };
  expect(
    changeText(changesFor(baseline('bill', seen), current)[0]!, 2026),
  ).toBe('Moved to a new stage · 2 Sep');
  for (const [status, expected] of [
    ['passed', 'Now passed; was before parliament'],
    ['lapsed', 'Now lapsed; was before parliament'],
    ['royal_assent', 'Received Royal Assent; was before parliament'],
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
    'Second reading agreed · Senate · 19 Aug',
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
      seen: { divisions: { ...reading(0), records: [] } },
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
    /\b(bought|corrupt|rort|scandal|secret|exposed|influence|linked to|disclosed|negatived|defected|switched sides|bumper)\b/i;
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
    {
      kind: 'bill',
      id: bill.key,
      seen: {
        moved: { ...reading('old'), records: [] },
        divisions: { ...reading(0), records: [] },
        speeches: { ...reading(0), records: [] },
      },
      seenKeys: [],
    },
    sources({ bills }),
  );
  expect(state.status).toBe('ready');
  if (state.status !== 'ready') throw new Error('Missing fixture');
  expect(state.changes.map((c) => changeText(c, 2026))).toEqual([
    'Second reading agreed · Senate · 19 Aug',
    'Speech by Jane Doe · 18 Aug',
  ]);
  expect(state.keys).toEqual(
    expect.arrayContaining(['division:rich', 'speech:rich']),
  );
});

test('60 introduced bills, 30 register entries and existing votes fit the seen-key budget', async () => {
  const bills = structuredClone(catalogs.bills!);
  bills.bills = Array.from({ length: 60 }, (_, i) => ({
    ...bills.bills[0]!,
    key: `au-federal-r${9000 + i}` as (typeof bills.bills)[number]['key'],
    sponsor: 'Anthony Albanese',
    introduced: new Date(Date.UTC(2026, 0, i + 1)).toISOString().slice(0, 10),
  }));
  bills.count = bills.bills.length;
  const interestIndex = structuredClone(catalogs.interestIndex!);
  const register = Object.values(interestIndex.people).find(
    (r) => r.name === 'Anthony Albanese',
  )!;
  Object.assign(register, {
    latest: Array.from({ length: 30 }, (_, i) => ({
      key: `register:${i}`,
      category: 'gifts',
      description: `Gift ${i}`,
      date: new Date(Date.UTC(2026, 0, i + 1)).toISOString().slice(0, 10),
    })),
  });
  const data = sources({ bills, interestIndex });
  await follow({
    kind: 'person',
    id: 'person_2b850aa643795ce8902f754b',
    title: 'Anthony Albanese',
  });
  const person = (await loadFollows())[0]!;
  const initial = ready(followState(person, data));
  expect(initial.current.introduced!.records).toHaveLength(10);
  expect(initial.current.introduced!.records!.map((r) => r.key)).toEqual(
    bills.bills
      .slice(-10)
      .reverse()
      .map((b) => b.key),
  );
  expect(initial.current.declarations!.records).toHaveLength(20);
  expect(initial.current.declarations!.records![0]!.key).toBe('register:29');
  expect(initial.keys.length).toBeLessThanOrEqual(50);
  await markSeen(followKey(person), initial.current, initial.keys);
  expect(ready(followState((await loadFollows())[0]!, data)).changes).toEqual(
    [],
  );
  resetFollowsForTests();
  expect(ready(followState((await loadFollows())[0]!, data)).changes).toEqual(
    [],
  );
});

function partySources(memberNumbers: number[]): FollowSources {
  const person = catalogs.people.people.find(
    (p) => p.person_id === 'person_2b850aa643795ce8902f754b',
  )!;
  const roster = catalogs.roster.people.find(
    (p) => p.name === 'Anthony Albanese',
  )!;
  const members = memberNumbers.map((n) => ({
    name: `Member ${String(n).padStart(3, '0')}`,
    slug: `member-${n}`,
    id: `person_${n.toString(16).padStart(24, '0')}` as typeof person.person_id,
    seat: `el_${n.toString(16).padStart(24, '0')}` as (typeof person.electorates)[number]['electorate_id'],
    pid: String(20000 + n) as NonNullable<typeof roster.pid>,
  }));
  return sources({
    people: {
      ...catalogs.people,
      people: members.map((m) => ({
        ...person,
        person_id: m.id,
        legacy_person_id: m.pid,
        name: m.name,
        aliases: [],
        electorates: [
          {
            ...person.electorates.find((s) => s.current)!,
            electorate_id: m.seat,
            name: `Seat ${m.slug}`,
            party: 'Labor',
            current: true,
            periods: undefined,
          },
        ],
      })),
    },
    roster: {
      ...catalogs.roster,
      people: members.map((m) => ({
        ...roster,
        pid: m.pid,
        name: m.name,
        party: 'Labor',
        party_now: 'Labor',
        current: true,
        representation: [
          {
            jurisdiction: 'federal',
            chamber: 'representatives',
            electorate: `Seat ${m.slug}`,
          },
        ],
      })),
    },
    slugs: {
      ...catalogs.slugs,
      slugs: Object.fromEntries(members.map((m) => [m.slug, m.name])),
    },
    money: decodeMoney({
      meta: {
        generated: '2026-09-02',
        source: 'AEC',
        coverage: 'Annual returns',
        methodology: 'Published returns',
        exclusions: [],
        party_totals_note: 'Annual returns',
      },
      nodes: [
        {
          id: 'party:labor',
          label: 'Labor',
          kind: 'party',
          total: 0,
          count: 0,
          byYear: Object.fromEntries(
            Array.from({ length: 30 }, (_, i) => [String(1997 + i), [0, 0]]),
          ),
        },
      ],
      edges: [],
    }),
  });
}

test('120 current party members baseline as a set without consuming seen keys', async () => {
  const data = partySources(Array.from({ length: 120 }, (_, i) => i + 1));
  await follow({ kind: 'party', id: 'labor', title: 'Labor' });
  const party = (await loadFollows())[0]!;
  const initial = ready(followState(party, data));
  expect(initial.current.members!.records).toHaveLength(120);
  expect(initial.current.members!.records!.map((m) => m.slug).sort()).toEqual(
    [
      ...new Set(
        partyMembers(
          'Labor',
          data.roster!,
          data.people!,
          data.slugs!,
          data.manifest!,
        ).current.map((m) => m.slug),
      ),
    ].sort(),
  );
  expect(initial.current.returns!.records).toHaveLength(1);
  expect(initial.keys).toEqual(['return:2026']);
  expect(
    seenKeysForChanges([
      {
        marker: 'members',
        key: 'member:1',
        text: 'Now includes Jane Doe',
        asAt: null,
        citation: 'Roster',
      },
    ]),
  ).toEqual([]);
  await markSeen(followKey(party), initial.current, initial.keys);
  const saved = (await loadFollows())[0]!;
  expect(ready(followState(saved, data)).changes).toEqual([]);
  expect(saved.seenKeys!.length).toBeLessThanOrEqual(50);
  await markSeen(
    followKey(party),
    initial.current,
    initial.current.members!.records!.map((m) => m.key),
  );
  expect((await loadFollows())[0]!.seenKeys).toEqual(['return:2026']);
  const changed = ready(
    followState(
      saved,
      partySources(Array.from({ length: 120 }, (_, i) => i + 2)),
    ),
  );
  expect(changed.changes.map((c) => c.text).sort()).toEqual([
    'No longer includes Member 001',
    'Now includes Member 121',
  ]);
  await markSeen(followKey(party), changed.current, changed.keys);
  expect(
    ready(
      followState(
        (await loadFollows())[0]!,
        partySources(Array.from({ length: 120 }, (_, i) => i + 2)),
      ),
    ).changes,
  ).toEqual([]);
});

test('return revisions and older years never become changes', () => {
  const data = partySources([]);
  const initial = ready(
    followState({ kind: 'party', id: 'labor', seen: null }, data),
  );
  const party = {
    kind: 'party' as const,
    id: 'labor',
    seen: initial.current,
    seenKeys: initial.keys,
  };
  const money = structuredClone(data.money!);
  money.nodes[0]!.byYear['1900'] = [100, 1];
  money.nodes[0]!.total = 100;
  expect(ready(followState(party, { ...data, money })).changes).toEqual([]);
  money.nodes[0]!.byYear['2027'] = [0, 0];
  expect(
    ready(followState(party, { ...data, money })).changes.map((c) => c.text),
  ).toEqual(['2026–27 donations return published']);
});

test.each(['introduced', 'divisions', 'declarations'])(
  'an absent %s record marker stays quiet until its first baseline is saved',
  (marker) => {
    const record = {
      ...vote,
      kind:
        marker === 'introduced'
          ? ('bill' as const)
          : marker === 'declarations'
            ? ('register' as const)
            : ('vote' as const),
    };
    const current = { [marker]: { ...reading(1), records: [record] } };
    expect(changesFor(baseline('person', {}), current)).toEqual([]);
    const seen = { ...baseline('person', current), seenKeys: [record.key] };
    const next = {
      [marker]: {
        ...reading(2),
        records: [record, { ...record, key: 'new-record' }],
      },
    };
    expect(changesFor(seen, next).map((c) => c.key)).toEqual(['new-record']);
  },
);
