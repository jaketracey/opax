import { act } from 'react';
import { Text, useWindowDimensions } from 'react-native';
import TestRenderer, { type ReactTestInstance } from 'react-test-renderer';
import { Catalogs } from '../src/api/catalogs';
import * as d from '../src/api/catalogs';
import { catalogs as runtime } from '../src/api/runtime';
import { PartyLabel, PersonRow, Portrait } from '../src/design/people';
import BillDetail from '../src/features/bills/BillDetail';
import { RecordedParty } from '../src/features/bills/parts';
import { sponsorRows } from '../src/features/bills/sponsors';
import { CachedPortrait } from '../src/features/CachedPortrait';
import { personRoute } from '../src/navigation/routes';
import {
  bills,
  index,
  manifest,
  people,
  pinned,
  replaceAt,
  roster,
  slugs,
} from './pinned';

const mockParams: { key: string } = { key: 'au-federal-r6850' };
const mockPush = jest.fn();
jest.mock('expo-router', () => ({
  useSegments: () => [],
  useLocalSearchParams: () => mockParams,
  router: { push: (...args: unknown[]) => mockPush(...args) },
  Stack: { Screen: () => null },
}));
jest.mock('../src/api/runtime', () => ({
  catalogs: { billFor: jest.fn(), directory: jest.fn() },
}));
jest.mock('../src/features/follows/FollowToggle', () => ({
  FollowToggle: () => null,
}));
jest.mock('react-native/Libraries/Utilities/useWindowDimensions', () => ({
  __esModule: true,
  default: jest.fn(),
}));

const directory = { roster, slugs, people, manifest, electorates: index };
const bill = (key: string) =>
  d.billFor(d.decodeBill(pinned(`/bills/${key}.json`)), bills).identity.data!;
const one = (name: string) => [{ name, suffix: '' }];

describe('sponsor rows', () => {
  test('a linked sponsor carries the seats-first seat line and party', () => {
    const wilkie = bill('au-federal-r6850');
    expect(
      sponsorRows(
        wilkie.sponsorMembers,
        wilkie.sponsorParty,
        wilkie.sponsorPersonId,
        directory,
      ),
    ).toEqual([
      {
        name: 'Andrew Wilkie',
        slug: 'andrew-wilkie',
        party: { party: 'Independent', status: 'current', formerly: null },
        place: 'Member for Clark · Tasmania',
      },
    ]);
    const cash = bill('au-federal-s1500');
    expect(
      sponsorRows(
        cash.sponsorMembers,
        cash.sponsorParty,
        cash.sponsorPersonId,
        directory,
      )[0],
    ).toMatchObject({
      slug: 'michaelia-cash',
      party: { party: 'Liberal', status: 'current' },
      place: 'Senator for Western Australia',
    });
  });

  test('a sponsor the roster cannot place is a plain row with the bill party', () => {
    // The full-name roster row has no ID and the ID-bearing row is a surname
    // stub, so the link guard refuses it.
    const faruqi = bill('au-federal-s1479');
    expect(
      sponsorRows(
        faruqi.sponsorMembers,
        faruqi.sponsorParty,
        faruqi.sponsorPersonId,
        directory,
      ),
    ).toEqual([
      {
        name: 'Mehreen Faruqi',
        slug: null,
        party: { party: 'Greens', status: 'unknown', formerly: null },
      },
    ]);
    // A surname alone never links.
    expect(sponsorRows(one('Wilkie'), null, null, directory)).toEqual([
      { name: 'Wilkie', slug: null },
    ]);
    // Without the directory every row is plain.
    expect(
      sponsorRows(one('Andrew Wilkie'), 'Independent', null, null),
    ).toEqual([
      {
        name: 'Andrew Wilkie',
        slug: null,
        party: { party: 'Independent', status: 'unknown', formerly: null },
      },
    ]);
  });

  test("the bill's party wins over the profile's, undated", () => {
    const [row] = sponsorRows(one('Andrew Wilkie'), 'Labor', null, directory);
    expect(row).toMatchObject({
      slug: 'andrew-wilkie',
      party: { party: 'Labor', status: 'unknown', formerly: null },
      place: 'Member for Clark · Tasmania',
    });
    // The register's "xx" placeholder is not a party.
    const ruston = bill('au-federal-s1496');
    expect(ruston.sponsorParty).toBe('xx');
    expect(
      sponsorRows(
        ruston.sponsorMembers,
        ruston.sponsorParty,
        ruston.sponsorPersonId,
        directory,
      )[0]!.party,
    ).toEqual({ party: 'Liberal', status: 'current', formerly: null });
  });

  test('a former member reads "Formerly", with their last dated seat', () => {
    expect(sponsorRows(one('Sussan Ley'), 'Liberal', null, directory)).toEqual([
      {
        name: 'Sussan Ley',
        slug: 'sussan-ley',
        party: { party: 'Liberal', status: 'former', formerly: null },
        place: 'Formerly member for Farrer · New South Wales',
      },
    ]);
    // Still former when the bill records another party.
    expect(
      sponsorRows(one('Sussan Ley'), 'Nationals', null, directory)[0]!.party,
    ).toEqual({ party: 'Nationals', status: 'former', formerly: null });
  });

  test('several sponsors stack, each with its own profile party', () => {
    const rows = sponsorRows(
      [
        { name: 'Adam Bandt', suffix: 'MP' },
        { name: 'Andrew Wilkie', suffix: 'MP' },
      ],
      'Greens',
      null,
      directory,
    );
    expect(rows.map((r) => [r.name, r.party?.party, r.place])).toEqual([
      ['Adam Bandt', 'Greens', 'Formerly member for Melbourne · Victoria'],
      ['Andrew Wilkie', 'Independent', 'Member for Clark · Tasmania'],
    ]);
  });
});

// The screen over the pinned files, decoded without a cache.
const fixture = new Catalogs({
  get: async (path, decode) => ({
    data: decode(path === '/api/person-slugs' ? slugs : pinned(path)),
    stale: false,
    savedAt: 1000,
    asOf: null,
  }),
});
const mock = jest.mocked(runtime);
beforeEach(() => {
  jest.clearAllMocks();
  jest
    .mocked(useWindowDimensions)
    .mockReturnValue({ width: 390, height: 844, scale: 3, fontScale: 1 });
  mock.billFor.mockImplementation((key, refresh) =>
    fixture.billFor(key, refresh),
  );
  mock.directory.mockImplementation(() => fixture.directory());
});
async function render(key: string) {
  mockParams.key = key;
  let renderer!: TestRenderer.ReactTestRenderer;
  await act(async () => {
    renderer = TestRenderer.create(<BillDetail />);
  });
  return renderer;
}
const block = (root: ReactTestInstance) =>
  root.find(
    (node) =>
      typeof node.type === 'string' && node.props.testID === 'bill-sponsor',
  );
const native = (root: ReactTestInstance, testID: string) =>
  root.find(
    (node) => typeof node.type === 'string' && node.props.testID === testID,
  );

test('a linked sponsor is the standard people row with one spoken label, opening the profile', async () => {
  const r = await render('au-federal-r6850');
  const sponsor = block(r.root);
  const [row] = sponsor.findAllByType(PersonRow);
  expect(row!.props).toMatchObject({
    name: 'Andrew Wilkie',
    party: 'Independent',
    partyStatus: 'current',
    place: 'Member for Clark · Tasmania',
    testID: 'bill-sponsor-andrew-wilkie',
  });
  expect(row!.findByType(CachedPortrait).props.slug).toBe('andrew-wilkie');
  const button = native(r.root, 'bill-sponsor-andrew-wilkie');
  expect(button.props.accessibilityRole).toBe('button');
  expect(button.props.accessibilityLabel).toBe(
    'Andrew Wilkie, Member for Clark · Tasmania, Independent, profile',
  );
  expect(
    sponsor.findAll((node) => node.props.name === 'chevron.right').length,
  ).toBeGreaterThan(0);
  // The party travels on the row; no separate dot line.
  expect(sponsor.findAllByType(RecordedParty)).toHaveLength(0);
  await act(async () => {
    row!.props.onPress();
  });
  expect(mockPush).toHaveBeenCalledWith(personRoute('andrew-wilkie'));
  act(() => r.unmount());
});

test('an unlinked sponsor gets the same row with a blank portrait and no chevron', async () => {
  const r = await render('au-federal-s1479');
  const sponsor = block(r.root);
  const [row] = sponsor.findAllByType(PersonRow);
  expect(row!.props.onPress).toBeUndefined();
  expect(row!.props.party).toBe('Greens');
  expect(row!.findAllByType(CachedPortrait)).toHaveLength(0);
  expect(row!.findByType(Portrait).props.loading).toBe(false);
  expect(
    sponsor.findAll((node) => node.props.name === 'chevron.right'),
  ).toHaveLength(0);
  const plain = native(r.root, 'bill-sponsor-unlinked-0');
  expect(plain.props.accessible).toBe(true);
  expect(plain.props.accessibilityRole).toBeUndefined();
  expect(plain.props.accessibilityLabel).toBe('Mehreen Faruqi, Greens');
  act(() => r.unmount());
});

test('an unreadable directory leaves every sponsor plain, never a guessed link', async () => {
  mock.directory.mockRejectedValue(new Error('offline'));
  const r = await render('au-federal-r6850');
  const [row] = block(r.root).findAllByType(PersonRow);
  expect(row!.props).toMatchObject({
    name: 'Andrew Wilkie',
    onPress: undefined,
    party: 'Independent',
    partyStatus: 'unknown',
  });
  expect(row!.findByType(Portrait).props.loading).toBe(false);
  act(() => r.unmount());
});

test('bills without a sponsor keep their words and never load the directory', async () => {
  const r = await render('au-federal-r7501');
  expect(block(r.root).findAllByType(PersonRow)).toHaveLength(0);
  expect(
    block(r.root).findAll(
      (node) => node.props.children === 'Sponsor not recorded',
    ).length,
  ).toBeGreaterThan(0);
  expect(mock.directory).not.toHaveBeenCalled();
  act(() => r.unmount());
});

test('a former sponsor reads "Formerly" on the chip and the seat line', async () => {
  // The pinned Wilkie bill, its sponsor fields pointed at a member the dated
  // release records as former.
  let raw = pinned('/bills/au-federal-r6850.json');
  for (const [field, value] of [
    ['sponsor', 'LEY, Sussan, MP'],
    ['sponsor_party', 'Liberal Party of Australia'],
    ['sponsor_person_id', null],
  ] as const)
    raw = replaceAt(raw, [field], value);
  const swapped = new Catalogs({
    get: async (path, decode) => ({
      data: decode(
        path === '/api/person-slugs'
          ? slugs
          : path === '/bills/au-federal-r6850.json'
            ? raw
            : pinned(path),
      ),
      stale: false,
      savedAt: 1000,
      asOf: null,
    }),
  });
  mock.billFor.mockImplementation((key, refresh) =>
    swapped.billFor(key, refresh),
  );
  const r = await render('au-federal-r6850');
  const [row] = block(r.root).findAllByType(PersonRow);
  expect(row!.props).toMatchObject({
    name: 'Sussan Ley',
    party: 'Liberal',
    partyStatus: 'former',
    place: 'Formerly member for Farrer · New South Wales',
  });
  // A person row names the party in full (short labels are for tables).
  expect(row!.findByType(PartyLabel).findByType(Text).props.children).toContain(
    'Formerly Liberal',
  );
  expect(
    native(r.root, 'bill-sponsor-sussan-ley').props.accessibilityLabel,
  ).toBe(
    'Sussan Ley, Formerly member for Farrer · New South Wales, Formerly Liberal, profile',
  );
  act(() => r.unmount());
});
