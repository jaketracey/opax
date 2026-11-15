// The data guard: an app build's own decoders over every published file
// the app reads. It fails when any file is refused, loses a row or is read
// leniently, and names the build, the file and the path inside it.
//
// The data: portal/public beside this tree, or OPAX_PUBLISHED_DIR.
// The decoders: this tree's, or a pinned build's `mobile/src`
// (OPAX_DECODERS_SRC, named by OPAX_DECODERS_LABEL), because published
// data must decode under the strictest build still on readers' phones.
import {
  buildLabel,
  buildReads,
  checkFamily,
  decodersRoot,
  families,
  problemsIn,
  publishedRoot,
} from './published-data';

const SHOWN = 40;
const build = buildLabel() || 'this tree';
const checked = families.filter((family) => family.decode);

// A dropped row also warns in development; the guard reports it itself.
beforeAll(() => {
  jest.spyOn(console, 'warn').mockImplementation(() => undefined);
});
afterAll(() => jest.restoreAllMocks());

describe(`published data under ${publishedRoot()}, read by ${build} (${decodersRoot()})`, () => {
  const counts: Record<string, number> = {};
  test.each(checked.map((family) => [family.name, family] as const))(
    '%s: every file decodes whole',
    (name, family) => {
      const { files, problems } = checkFamily(family);
      counts[name] = files;
      // The first problems in full; the count says how many more.
      expect({
        problems: problems.length,
        first: problems.slice(0, SHOWN),
      }).toEqual({ problems: 0, first: [] });
    },
  );

  // A folder that moved, or a pattern that matches nothing, must not pass.
  // Families the app branch's own copy of the data does not carry are
  // required only where the data is given (OPAX_PUBLISHED_DIR: main's).
  const onlyOnMain = ['on this day', 'sitting days', 'recent divisions'];
  const least: Record<string, number> = {
    bills: 1000,
    electorates: 100,
    interests: 100,
    'on this day': 366,
  };
  test.each(checked.map((family) => family.name))(
    '%s: the files are there',
    (name) => {
      if (!process.env.OPAX_PUBLISHED_DIR && onlyOnMain.includes(name)) return;
      // Not published anywhere yet (api/policy.ts: "Absent until it ships");
      // the app reads its absence as no recent votes. Checked once it exists.
      if (name === 'recent divisions' && !counts[name]) return;
      expect(counts[name]).toBeGreaterThanOrEqual(least[name] ?? 1);
    },
  );

  // A family this build has no decoder for is named, never silently left
  // out. If the build's own allow-list lets it read the family's path, the
  // decoder is missing here by mistake (a renamed export, a moved file):
  // that fails. Otherwise the build never reads the family, and says so.
  const unchecked = families.filter((family) => !family.decode);
  const missing = unchecked.filter(
    (family) => buildReads(family.path) !== false,
  );
  const unread = unchecked.filter(
    (family) => buildReads(family.path) === false,
  );
  if (unread.length)
    test.skip.each(unread.map((family) => [family.name, family.path]))(
      `%s: not read by ${build} (its allow-list refuses %s, and it has no decoder)`,
      () => undefined,
    );
  test('every family this build may read has its decoder here', () => {
    expect(
      missing.map(
        (family) =>
          `${family.name}: ${build} may read ${family.path}, but its decoder was not found`,
      ),
    ).toEqual([]);
  });

  test('this build reads the bills: a tree with no decoders must not pass', () => {
    const names = checked.map((family) => family.name);
    expect(names).toEqual(
      expect.arrayContaining(['bills index', 'bills', 'roster', 'votes']),
    );
  });
});

describe(`what the guard catches in ${build}`, () => {
  // An invented bill, written here so the guard needs nothing but the
  // decoders and the published folder (CI runs it from an exported tree).
  const division = (n: number) => ({
    key: `federal-representatives-${n}`,
    date: '2026-03-0' + n,
    house: 'representatives',
    question: 'That the bill be read a second time.',
    stage: 'Second reading',
    ayes: 80,
    noes: 60,
    outcome: 'affirmative',
    party_splits: {},
    party_coverage: {},
    paired: 0,
    url: `https://theyvoteforyou.org.au/divisions/representatives/2026-03-0${n}/1`,
  });
  const bill = () => ({
    key: 'au-federal-r1' as unknown,
    title: 'Invented Lighthouses Bill 2026',
    short_title: null,
    jurisdiction: 'federal',
    parliament: 48,
    introduced: '2026-03-01',
    originating_house: 'representatives',
    status: 'before_parliament',
    status_as_of: '2026-03-02',
    sponsor: null,
    sponsor_party: null,
    portfolio: null,
    sponsor_person_id: null,
    key_dates: [],
    sources: [],
    summary: null,
    divisions: [division(1), division(2)] as Record<string, unknown>[],
    speeches: [
      {
        slug: 'speech-1',
        speaker: 'Invented Speaker',
        party: null,
        state: 'federal',
        date: '2026-03-02',
        stage_hint: null,
        brief: null,
      },
    ] as Record<string, unknown>[],
    acts: [],
  });
  const decodeBill = families.find(
    (family) => family.name === 'bills',
  )!.decode!;

  test('the invented bill is whole', () => {
    expect(problemsIn(bill(), decodeBill)).toEqual([]);
  });

  // Whether a build refuses the file, drops the row or reads it leniently,
  // the guard names the field. A strict build names no row number.
  test('a null question (15 Nov 2026: 75 divisions in 64 bill files)', () => {
    const data = bill();
    data.divisions[1]!.question = null;
    const found = problemsIn(data, decodeBill);
    expect(found).toHaveLength(1);
    expect(found[0]).toMatch(/^divisions(\[1\])?\.question: /);
    expect(found[0]).toMatch(/\((file refused|row dropped|tolerated)\)$/);
  });

  test('a malformed division', () => {
    const data = bill();
    data.divisions[0]!.ayes = 'many';
    const found = problemsIn(data, decodeBill);
    expect(found).toHaveLength(1);
    expect(found[0]).toMatch(/^divisions(\[0\])?\.ayes: /);
    expect(found[0]).toMatch(/\((file refused|row dropped)\)$/);
  });

  test('a bill with no key, which every build refuses', () => {
    const data = bill();
    data.key = null;
    expect(problemsIn(data, decodeBill)).toEqual([
      'key: The catalog response could not be read. (file refused)',
    ]);
  });
});
