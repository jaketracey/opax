import { withNavigationOptions } from './navigation-options';
// TestFlight build 32 (10 Oct): the Parliamentarians list's party labels
// (AILRB_Cd), its order (ACzcQOFB) and a sitting-only filter (ALUtpHq6).
// people.md 2.3 and 2.6: sticky sections, place lines, the shared sheet.
import { act } from 'react';
import TestRenderer from 'react-test-renderer';
import DirectoryScreen from '../src/features/directories/DirectoryScreen';
import { peopleFacets, peopleRows } from '../src/features/directories/model';
import {
  loadDirectory,
  type DirectoryRecord,
} from '../src/features/directories/data';
import { filterStore } from '../src/features/sheets/filter-model';
import { buildPortraitIndex } from '../src/api/portrait-index';
import { PartyLabel, PersonRow, Text } from '../src/design/primitives';
import { catalogs, index, manifest, people, roster, slugs } from './pinned';

const mockParams: Record<string, string> = { kind: 'person' };
const mockScreen: { options?: Record<string, unknown> } = {};
jest.mock('expo-router', () => {
  const React = jest.requireActual('react');
  const Link = ({ children }: { children: unknown }) =>
    React.createElement(React.Fragment, null, children);
  Link.Trigger = function Trigger({ children }: { children: unknown }) {
    return children;
  };
  Link.Preview = function Preview() {
    return null;
  };
  Link.Menu = function Menu() {
    return null;
  };
  Link.MenuAction = function MenuAction() {
    return null;
  };
  return {
    useLocalSearchParams: () => mockParams,
    router: { push: jest.fn(), setParams: jest.fn() },
    Stack: {
      Screen: ({ options }: { options: Record<string, unknown> }) => {
        mockScreen.options = options;
        return null;
      },
    },
    Link,
  };
});
jest.mock('../src/api/runtime', () => ({ catalogs: {} }));
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
const record = <T,>(data: T) => ({
  data,
  stale: false,
  savedAt: 1,
  asOf: null,
});
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
const directory: DirectoryRecord = {
  people: persons,
  parties: [],
  electorates: [],
  facets: peopleFacets(persons),
  stale: false,
  savedAt: 1,
  partial: false,
  sources: [],
};
async function open() {
  jest.mocked(loadDirectory).mockResolvedValue(directory);
  let r!: TestRenderer.ReactTestRenderer;
  await act(async () => {
    r = TestRenderer.create(
      withNavigationOptions(<DirectoryScreen />, (options) => {
        mockScreen.options = options;
      }),
    );
  });
  return r;
}
async function search(text: string) {
  await act(async () =>
    (
      mockScreen.options!.headerSearchBarOptions as {
        onChangeText: (e: { nativeEvent: { text: string } }) => void;
      }
    ).onChangeText({ nativeEvent: { text } }),
  );
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 200));
  });
}
afterEach(() => {
  act(() => filterStore('directory', 'person')?.set({}));
  for (const key of Object.keys(mockParams))
    if (key !== 'kind') delete mockParams[key];
});

test('the filter sheet offers plain switches, full party names and a Name sort', async () => {
  const r = await open();
  const model = filterStore('directory', 'person')!.model;
  expect(model.rows.map((row) => row.title)).toEqual([
    'Party',
    'Parliament',
    'Chamber',
    'State',
    'Sort',
  ]);
  expect(model.toggles!.map((t) => t.label)).toEqual([
    'Sitting members only',
    'Has a voting record',
  ]);
  const state = filterStore('directory', 'person')!.get();
  expect(model.rows.find((row) => row.key === 'sort')!.value(state)).toBe(
    'name',
  );
  const party = model.rows
    .find((row) => row.key === 'party')!
    .choices(state)
    .map((c) => c.label);
  expect(party[0]).toBe('All parties');
  expect(party).toContain('Independent');
  expect(party).toContain('Liberal National Party of Queensland');
  expect(party).not.toContain('LNP');
  await act(async () => r.unmount());
});

test('the party page arrives filtered to its sitting members, said in one line', async () => {
  mockParams.party = 'Labor';
  mockParams.sitting = '1';
  const r = await open();
  expect(filterStore('directory', 'person')!.get()).toMatchObject({
    party: 'Labor',
    sitting: '1',
  });
  const rows = r.root.findAllByType(PersonRow);
  expect(rows.length).toBeGreaterThan(0);
  expect(
    rows.every((row) => row.props.partyStatus === 'current' && row.props.party),
  ).toBe(true);
  const line = r.root.find(
    (n) => n.props.testID === 'directory-filter-line' && n.props.variant,
  );
  expect(strings(line)).toMatch(
    /^Labor · Sitting members only · \d+ parliamentarians$/,
  );
  // Clear leaves the sort alone and lists everyone again.
  await act(async () =>
    r.root
      .find(
        (n) =>
          n.props.testID === 'directory-filter-clear' &&
          typeof n.type !== 'string',
      )
      .props.onPress(),
  );
  expect(filterStore('directory', 'person')!.get()).toMatchObject({
    party: '',
    sitting: '',
    sort: 'name',
  });
  await act(async () => r.unmount());
});

test('sitting members lead under sticky sections; rows say party then place', async () => {
  const r = await open();
  const list = r.root.find(
    (n) => n.props.testID === 'directory-person-screen' && n.props.sections,
  );
  expect(list.props.sections.map((s: { title: string }) => s.title)).toEqual([
    'Sitting members',
    'Status not confirmed',
    'Former members',
  ]);
  const rows = r.root.findAllByType(PersonRow);
  expect(rows[0]!.props.partyStatus).toBe('current');
  // Abbott read "Formerly LIB" and Hockey "LIB": both now read the party
  // they sat for; no "Formerly" unless they changed party, and no counts.
  for (const [name, party, place] of [
    ['Tony Abbott', 'Liberal', 'Former member for Warringah, New South Wales'],
    ['Joe Hockey', 'Liberal', null],
    ['Bill Shorten', 'Labor', 'Former member for Maribyrnong, Victoria'],
    ['Anthony Albanese', 'Labor', 'Member for Grayndler, New South Wales'],
  ] as const) {
    await search(name);
    const row = r.root
      .findAllByType(PersonRow)
      .find((n) => n.props.name === name)!;
    expect(strings(row.findByType(PartyLabel))).toBe(party);
    expect(row.props.statusShown).toBe(true);
    if (place) expect(row.props.place).toBe(place);
    expect(row.props.detail).toBeUndefined();
    expect(strings(row)).not.toMatch(/speeches|divisions|Former member$/);
  }
  await act(async () => r.unmount());
});
