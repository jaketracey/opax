// The data guard: an app build's own decoders over every published file
// the app reads. It fails when any file is refused, loses a row or is read
// leniently, and names the build, the file and the path inside it.
//
// The data: portal/public beside this tree, or OPAX_PUBLISHED_DIR.
// The decoders: this tree's, or a pinned build's `mobile/src`
// (OPAX_DECODERS_SRC, named by OPAX_DECODERS_LABEL), because published
// data must decode under the strictest build still on readers' phones.
import { readFileSync } from 'fs';
import { join } from 'path';
import {
  buildLabel,
  buildReads,
  checkFamily,
  decodersRoot,
  decodeFirstsWhole,
  families,
  firstsPath,
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

// The firsts family's own cases, for a build that reads the file. A build
// without its decoder is named above as not reading it, and has no cases
// here: it is never checked with another build's decoder.
const firsts = families.find((family) => family.name === 'people firsts')!;
if (firsts.decode)
  describe(`people firsts in ${build}, from a folder named by OPAX_PUBLISHED_DIR`, () => {
    const named = buildLabel() ? `[${buildLabel()}] ` : '';
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

    // The portal's seed (its firsts export branch, people/firsts.json, byte
    // for byte): the file as it is first published, before any refresh.
    test('the portal’s seed, with no people yet, decodes whole', () => {
      expect(check('seed')).toEqual({ files: 1, problems: [] });
    });

    test('a folder without the file has nothing to check: not published yet', () => {
      expect(check('absent')).toEqual({ files: 0, problems: [] });
    });

    test('a division with no source, which the app leaves out without a word, fails the family', () => {
      expect(check('malformed')).toEqual({
        files: 1,
        problems: [
          `${named}people/firsts.json by_pid.90002.first_division: Could not be read, left out of the person’s firsts (tolerated)`,
        ],
      });
    });

    test('a division whose source the file does not name, which decodes and is never drawn, fails the family by name', () => {
      expect(check('unnamed-source')).toEqual({
        files: 1,
        problems: [
          `${named}people/firsts.json by_name.Casey Specimen.first_division.source: "vic_hansard_pdf" names no publisher in meta.sources.divisions, never shown (tolerated)`,
        ],
      });
    });

    test('a division whose source is named with an empty publisher, which the page also hides, fails the family by name', () => {
      expect(check('empty-publisher')).toEqual({
        files: 1,
        problems: [
          `${named}people/firsts.json by_name.Casey Specimen.first_division.source: "theyvoteforyou" names no publisher in meta.sources.divisions, never shown (tolerated)`,
        ],
      });
    });

    test('the family reads the path the app reads', () => {
      expect(firstsPath).toBe('/people/firsts.json');
      expect(
        firsts.files(join(__dirname, 'fixtures/published-firsts/whole')),
      ).toEqual([firstsPath.slice(1)]);
    });

    test('the portal export’s own sample is whole: a fact left out by design (no coverage year) is not a problem', () => {
      const sample = JSON.parse(
        readFileSync(
          join(__dirname, 'fixtures', 'people-firsts.sample.json'),
          'utf8',
        ),
      );
      expect(problemsIn(sample, decodeFirstsWhole!)).toEqual([]);
    });

    test('a file in another shape (rows, and no meta) is refused', () => {
      const { files, problems } = check('other-shape');
      expect(files).toBe(1);
      expect(problems).toHaveLength(1);
      expect(problems[0]).toContain('people/firsts.json ');
      expect(problems[0]).toMatch(/\(file refused\)$/);
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

  // The exact words of this tree's own decoders. A pinned build is
  // stricter and says other things, so these are for this tree alone.
  if (!process.env.OPAX_DECODERS_SRC) {
    test('this tree reads a null question as none, and says so', () => {
      const data = bill();
      data.divisions[1]!.question = null;
      expect(problemsIn(data, decodeBill)).toEqual([
        'divisions[1].question: Null or absent, read as no question (tolerated)',
      ]);
    });

    test('this tree drops a malformed division, and names it', () => {
      const data = bill();
      data.divisions[0]!.ayes = 'many';
      expect(problemsIn(data, decodeBill)).toEqual([
        'divisions[0].ayes: The catalog response could not be read. (row dropped)',
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
  }
});
