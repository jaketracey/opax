/**
 * The people directory's rows are built in slices, so opening Members no
 * longer holds the JS thread in one block (features/directories/model.ts).
 */
import { buildPortraitIndex } from '../src/api/portrait-index';
import {
  PEOPLE_ROWS_SLICE,
  peopleRows,
  peopleRowsAsync,
} from '../src/features/directories/model';
import {
  forgetDirectoryRows,
  loadDirectory,
} from '../src/features/directories/data';
import { catalogs, index, manifest, people, roster, slugs } from './pinned';

const mockCatalogs = {
  directory: jest.fn(),
  votes: jest.fn(),
  photoPeople: jest.fn(),
  photoCredits: jest.fn(),
};
jest.mock('../src/api/runtime', () => ({
  get catalogs() {
    return mockCatalogs;
  },
}));
const record = <T>(data: T) => ({ data, stale: false, savedAt: 1, asOf: null });
const directory = {
  manifest: record(manifest),
  roster: record(roster),
  slugs: record(slugs),
  people: record(people),
  electorates: record(index),
} as never;
const portraits = buildPortraitIndex({
  manifest,
  roster,
  slugs,
  people,
  photoPeople: catalogs.photoPeople!,
  photoCredits: catalogs.photoCredits!,
});

afterEach(() => jest.restoreAllMocks());

test('the sliced rows are the rows built in one go, in the same order', async () => {
  const whole = peopleRows(directory, catalogs.votes!, portraits);
  expect(whole.length).toBeGreaterThan(1000);
  const sliced = await peopleRowsAsync(
    directory,
    catalogs.votes!,
    portraits,
    async () => undefined,
  );
  expect(sliced).toEqual(whole);
});

test('the app gets a turn before the people and after every slice of work', async () => {
  // A clock that moves 1 ms each time it is read: every row costs time.
  let at = 0;
  jest.spyOn(Date, 'now').mockImplementation(() => (at += 1));
  let turns = 0;
  const rows = await peopleRowsAsync(
    directory,
    catalogs.votes!,
    portraits,
    async () => {
      turns++;
    },
  );
  // Two loops over more than a thousand people, a turn each 8 ms of them.
  expect(turns).toBeGreaterThan((rows.length * 2) / PEOPLE_ROWS_SLICE / 2);
  expect(PEOPLE_ROWS_SLICE).toBeLessThanOrEqual(8);
});

test('a fast run still gives one turn, after the joins and before the people', async () => {
  // A clock that never moves: no slice ever fills.
  jest.spyOn(Date, 'now').mockReturnValue(1000);
  let turns = 0;
  await peopleRowsAsync(directory, catalogs.votes!, portraits, async () => {
    turns++;
  });
  expect(turns).toBe(1);
});

test('the directory screen loads its people through the sliced builder', () => {
  const loader = jest
    .requireActual<typeof import('node:fs')>('node:fs')
    .readFileSync(
      require.resolve('../src/features/directories/data.ts'),
      'utf8',
    );
  expect(loader).toMatch(/await peopleRowsAsync\(d, votes\.data, portraits\)/);
  expect(loader).not.toMatch(/= peopleRows\(/);
});

test('the same catalogue snapshots give the same rows without building them again', async () => {
  forgetDirectoryRows();
  const snapshot = {
    manifest: record(manifest),
    roster: record(roster),
    slugs: record(slugs),
    people: record(people),
    electorates: record(index),
  };
  mockCatalogs.directory.mockImplementation(async () => ({ ...snapshot }));
  mockCatalogs.votes.mockResolvedValue(record(catalogs.votes));
  mockCatalogs.photoPeople.mockResolvedValue(record(catalogs.photoPeople));
  mockCatalogs.photoCredits.mockResolvedValue(record(catalogs.photoCredits));
  const first = await loadDirectory('person');
  expect(first.people.length).toBeGreaterThan(1000);
  // A revalidation that found nothing new, or coming back to Members.
  const again = await loadDirectory('person', true);
  expect(again.people).toBe(first.people);
  expect(again.facets).toBe(first.facets);
  // New bytes for any one catalogue (a new snapshot object): built afresh.
  mockCatalogs.votes.mockResolvedValue(record({ ...catalogs.votes! }));
  const changed = await loadDirectory('person', true);
  expect(changed.people).not.toBe(first.people);
  expect(changed.people).toEqual(first.people);
  forgetDirectoryRows();
});
