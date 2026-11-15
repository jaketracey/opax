// The data guard: the app's own decoders over every published file the app
// reads. It fails when any file is refused, loses a row or is read
// leniently, and names the file and the path inside it. It reads
// portal/public beside this tree, or OPAX_PUBLISHED_DIR.
import { join } from 'path';
import { decodeBill } from '../src/api/catalog-decoders';
import {
  checkFamily,
  families,
  problemsIn,
  publishedRoot,
} from './published-data';

const SHOWN = 40;

// A dropped row also warns in development; the guard reports it itself.
beforeAll(() => {
  jest.spyOn(console, 'warn').mockImplementation(() => undefined);
});
afterAll(() => jest.restoreAllMocks());

describe(`published data under ${publishedRoot()}`, () => {
  const counts: Record<string, number> = {};
  test.each(families.map((family) => [family.name, family] as const))(
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
  // Families the app branch's own copy of the data does not carry yet are
  // required only where the data is given (OPAX_PUBLISHED_DIR: main's).
  const onlyOnMain = ['on this day', 'sitting days', 'recent divisions'];
  const least: Record<string, number> = {
    bills: 1000,
    electorates: 100,
    interests: 100,
    'on this day': 366,
  };
  test.each(families.map((family) => family.name))(
    '%s: the files are there',
    (name) => {
      if (!process.env.OPAX_PUBLISHED_DIR && onlyOnMain.includes(name)) return;
      // Not published anywhere yet (api/policy.ts: "Absent until it ships");
      // the app reads its absence as no recent votes. Checked once it exists.
      if (name === 'recent divisions' && !counts[name]) return;
      // Not published yet: the portal adds people/firsts.json later, and
      // the app reads its absence as no firsts. Skipped until the file
      // exists; from then on it must decode whole, as every family must.
      if (name === 'people firsts' && !counts[name]) {
        process.stdout.write(
          'published data: people/firsts.json is not published yet, skipped\n',
        );
        return;
      }
      expect(counts[name]).toBeGreaterThanOrEqual(least[name] ?? 1);
    },
  );
});

describe('people firsts, from a folder named by OPAX_PUBLISHED_DIR', () => {
  const firsts = families.find((family) => family.name === 'people firsts')!;
  // The family as the guard runs it over the named folder.
  const check = (fixture: string) => {
    const before = process.env.OPAX_PUBLISHED_DIR;
    process.env.OPAX_PUBLISHED_DIR = join(
      __dirname,
      'fixtures',
      'published-firsts',
      fixture,
    );
    try {
      const { files, problems } = checkFamily(firsts);
      return { files, problems };
    } finally {
      if (before === undefined) delete process.env.OPAX_PUBLISHED_DIR;
      else process.env.OPAX_PUBLISHED_DIR = before;
    }
  };

  test('a whole file decodes with no problems', () => {
    expect(check('whole')).toEqual({ files: 1, problems: [] });
  });

  test('a folder without the file has nothing to check: not published yet', () => {
    expect(check('absent')).toEqual({ files: 0, problems: [] });
  });

  test('a division with no source, which the app leaves out without a word, fails the family', () => {
    expect(check('malformed')).toEqual({
      files: 1,
      problems: [
        'people/firsts.json by_pid.90002.first_division: Could not be read, left out of the person’s firsts (tolerated)',
      ],
    });
  });

  test('a file in another shape (rows, and no meta) is refused', () => {
    const { files, problems } = check('seed');
    expect(files).toBe(1);
    expect(problems).toHaveLength(1);
    expect(problems[0]).toMatch(/^people\/firsts\.json .*\(file refused\)$/);
  });
});

describe('what the guard catches', () => {
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

  test('the invented bill is whole', () => {
    expect(bill().divisions.length).toBeGreaterThan(1);
    expect(problemsIn(bill(), decodeBill)).toEqual([]);
  });

  test('a null question, which this version reads as none and older versions refuse', () => {
    const data = bill();
    data.divisions[1]!.question = null;
    expect(problemsIn(data, decodeBill)).toEqual([
      'divisions[1].question: Null or absent, read as no question (tolerated)',
    ]);
  });

  test('a malformed division, which this version drops', () => {
    const data = bill();
    data.divisions[0]!.ayes = 'many';
    expect(problemsIn(data, decodeBill)).toEqual([
      'divisions[0].ayes: The catalog response could not be read. (row dropped)',
    ]);
  });

  test('a bill with no key, which every version refuses', () => {
    const data = bill();
    data.key = null;
    expect(problemsIn(data, decodeBill)).toEqual([
      'key: The catalog response could not be read. (file refused)',
    ]);
  });

  test('several problems in one file are all named', () => {
    const data = bill();
    data.divisions[0]!.question = null;
    data.divisions[1]!.date = 'yesterday';
    data.speeches[0]!.speaker = '';
    expect(problemsIn(data, decodeBill)).toEqual([
      'divisions[0].question: Null or absent, read as no question (tolerated)',
      'divisions[1].date: The catalog response could not be read. (row dropped)',
      'speeches[0].speaker: The catalog response could not be read. (row dropped)',
    ]);
  });
});
