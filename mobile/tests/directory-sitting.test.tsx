// TestFlight build 32 (10 Oct): the Parliamentarians list's party labels
// (AILRB_Cd), its order (ACzcQOFB) and a sitting-only filter (ALUtpHq6).
import { act } from 'react';
import TestRenderer from 'react-test-renderer';
import DirectoryFilters from '../src/features/directories/DirectoryFilters';
import DirectoryScreen from '../src/features/directories/DirectoryScreen';
import { directoryStore } from '../src/features/directories/store';
import { peopleFacets, peopleRows } from '../src/features/directories/model';
import {
  loadDirectory,
  type DirectoryRecord,
} from '../src/features/directories/data';
import { buildPortraitIndex } from '../src/api/portrait-index';
import {
  Field,
  LinkRow,
  PartyLabel,
  PersonRow,
  SwitchRow,
  Text,
} from '../src/design/primitives';
import { catalogs, index, manifest, people, roster, slugs } from './pinned';

jest.mock('expo-router', () => ({
  useLocalSearchParams: () => ({ kind: 'person' }),
  router: { push: jest.fn() },
  Stack: { Screen: () => null },
}));
jest.mock('../src/features/directories/data', () => ({
  loadDirectory: jest.fn(),
}));
jest.mock('../src/features/CachedPortrait', () => ({
  CachedPortrait: () => null,
}));
jest.mock('../src/features/split/RecordDetail', () => ({
  RecordDetail: () => null,
  RecordShare: () => null,
}));
const record = <T,>(data: T) => ({ data, stale: false, savedAt: 1, asOf: null });
const persons = peopleRows(
  {
    manifest: record(manifest),
    roster: record(roster),
    people: record(people),
    slugs: record(slugs),
    electorates: record(index),
  },
  catalogs.votes!,
  buildPortraitIndex({
    ...catalogs,
    photoPeople: catalogs.photoPeople!,
    photoCredits: catalogs.photoCredits!,
  }),
);
const strings = (node: TestRenderer.ReactTestInstance) =>
  node
    .findAllByType(Text)
    .flatMap((n) => [n.props.children].flat())
    .filter((v) => typeof v === 'string')
    .join(' ');

afterEach(() => directoryStore.set('person', {}));

test('Filters and sort offers Sitting members only and names the order', async () => {
  directoryStore.facets('person', peopleFacets(persons));
  let r!: TestRenderer.ReactTestRenderer;
  await act(async () => {
    r = TestRenderer.create(<DirectoryFilters />);
  });
  const toggles = r.root.findAllByType(SwitchRow).map((n) => n.props.label);
  expect(toggles).toEqual([
    'Sitting members only',
    'Voting record',
    'Portrait',
  ]);
  const sort = r.root
    .findAllByType(LinkRow)
    .find((n) => n.props.testID === 'directory-filter-sort')!;
  expect(sort.props.title).toBe('Sitting first, then most speeches');
  await act(async () =>
    r.root
      .findAllByType(SwitchRow)
      .find((n) => n.props.label === 'Sitting members only')!
      .props.onValueChange(),
  );
  expect(directoryStore.get('person').filters.sitting).toBe('1');
  await act(async () => r.unmount());
});

test('former members read their party plainly, with their years, and sitting members lead', async () => {
  const facets = peopleFacets(persons);
  jest.mocked(loadDirectory).mockResolvedValue({
    people: persons,
    parties: [],
    electorates: [],
    facets,
    stale: false,
    savedAt: 1,
    partial: false,
    sources: [],
  } as DirectoryRecord);
  let r!: TestRenderer.ReactTestRenderer;
  await act(async () => {
    r = TestRenderer.create(<DirectoryScreen />);
  });
  const count = r.root.find(
    (n) => n.props.testID === 'directory-count' && n.props.variant,
  );
  expect(strings(count)).toContain('Sitting first, then most speeches');
  const rows = r.root.findAllByType(PersonRow);
  expect(rows[0]!.props.partyStatus).toBe('current');
  // Abbott read "Formerly LIB" and Hockey "LIB": both now read the party
  // they sat for, with their years; no "Formerly" unless they changed party.
  for (const [name, party] of [
    ['Tony Abbott', 'Liberal'],
    ['Joe Hockey', 'Liberal'],
    ['Bill Shorten', 'Labor'],
  ]) {
    await act(async () =>
      r.root.findByType(Field).props.onChangeText(name),
    );
    // The query settles after a short debounce.
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 200));
    });
    const row = r.root
      .findAllByType(PersonRow)
      .find((n) => n.props.name === name)!;
    expect(row.props.partyStatus).toBe('former');
    expect(strings(row.findByType(PartyLabel))).toBe(party);
    expect(row.props.statusShown).toBe(true);
    expect(strings(row)).toMatch(/\d{4} to \d{4}/);
    expect(strings(row)).not.toContain('Former member');
  }
  await act(async () => r.unmount());
});
