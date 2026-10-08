import {
  portraits as portraitService,
  catalogs as runtime,
} from '../src/api/runtime';
import * as format from '../src/design/format';
import { act, type ReactElement } from 'react';
import TestRenderer from 'react-test-renderer';
import { Image, RefreshControl } from 'react-native';
import { router } from 'expo-router';
import * as c from '../src/api/catalogs';
import { ApiError } from '../src/api/errors';
import {
  catalogs,
  index,
  manifest,
  people,
  roster,
  slugs,
  pinned,
} from './pinned';
import Person from '../src/features/Person';
import YourMP from '../src/features/YourMP';
import Electorate from '../src/features/Electorate';
import { VoteSide } from '../src/features/your-mp/VoteSide';
import { billRoute } from '../src/navigation/routes';
import {
  PersonRow,
  PartyLabel,
  Text,
  Button,
  LinkRow,
  OpaxWebLink,
} from '../src/design/primitives';
import { loadChoice, saveChoice } from '../src/features/your-mp/choice-store';
jest.mock('../src/api/runtime', () => ({
  portraits: { get: jest.fn() },
  catalogs: {
    person: jest.fn(),
    profileFor: jest.fn(),
    directory: jest.fn(),
    yourMP: jest.fn(),
    electorateFor: jest.fn(),
  },
}));
jest.mock('../src/features/your-mp/choice-store', () => ({
  loadChoice: jest.fn(),
  saveChoice: jest.fn(),
}));
jest.mock('../src/api/image-policy', () => ({
  localImageURI: (uri: string) => uri,
}));
const mockParams: { slug?: string; id?: string } = {};
jest.mock('expo-router', () => ({
  useLocalSearchParams: () => mockParams,
  router: { push: jest.fn() },
  Stack: { Screen: () => null },
}));
const result = <T,>(data: T) => ({
  data,
  stale: false,
  savedAt: 1,
  asOf: null,
});
const directory = {
  manifest: result(manifest),
  people: result(people),
  roster: result(roster),
  slugs: result(slugs),
  electorates: result(index),
};
const mock = runtime as jest.Mocked<typeof runtime>;
async function render(element: ReactElement) {
  let r!: TestRenderer.ReactTestRenderer;
  await act(async () => {
    r = TestRenderer.create(element);
  });
  return r;
}
// Buttons, disclosure rows and link rows: the pressable with the test ID.
const pressable = (r: TestRenderer.ReactTestRenderer, testID: string) =>
  r.root.findAll(
    (n) => n.props.testID === testID && typeof n.props.onPress === 'function',
  )[0]!;
const text = (r: TestRenderer.ReactTestRenderer) =>
  r.root
    .findAllByType(Text)
    .flatMap((n) => n.props.children)
    .filter((v) => typeof v === 'string')
    .join(' ')
    .replace(/\s+/g, ' ');
beforeEach(() => {
  jest.clearAllMocks();
  Object.values(mock).forEach((fn) => fn.mockReset());
  mockParams.slug = 'anthony-albanese';
  mockParams.id = index.electorates.find(
    (s) => s.name === 'Grayndler',
  )!.electorate_id;
  mock.directory.mockResolvedValue(directory);
});
test('profile failure in expenses preserves votes, pay and identity; absent local image keeps fallback', async () => {
  mockParams.slug = 'penny-wong';
  const person = c.joinPerson('penny-wong', slugs, roster, people, manifest);
  const p = c.profileFor(person.canonicalPersonId!, {
    ...catalogs,
    interest: c.decodeInterest(pinned('/interests/10678.json')),
  });
  p.blocks.expenses = {
    ...p.blocks.expenses,
    data: null,
    status: 'error',
    error: new ApiError('server', 'Unavailable'),
  };
  mock.person.mockResolvedValue(result(person));
  mock.profileFor.mockResolvedValue(p);
  const r = await render(<Person />);
  expect(text(r)).toContain('Penny Wong');
  expect(text(r)).toContain('These are entitlements set by instrument');
  expect(
    r.root.findAll((n) => n.props.testID === 'person-expenses-error').length,
  ).toBeGreaterThan(0);
  expect(r.root.findAllByType(Image)).toHaveLength(0);
  expect(text(r)).not.toContain('Portrait display permission needs review');
  expect(text(r)).toContain('Record date not published');
  expect(text(r)).toContain('Real estate');
  expect(text(r)).not.toContain('real_estate');
  await act(async () => r.unmount());
});
test('former roster identity never masquerades as a current affiliation', async () => {
  mockParams.slug = 'julia-gillard';
  mock.person.mockResolvedValue(
    result(c.joinPerson('julia-gillard', slugs, roster, people, manifest)),
  );
  const former = c.joinPerson('julia-gillard', slugs, roster, people, manifest);
  mock.profileFor.mockResolvedValue(
    c.profileFor(former.canonicalPersonId!, catalogs),
  );
  const r = await render(<Person />);
  expect(r.root.findByType(PartyLabel).props.status).toBe('former');
  expect(text(r)).toContain('Formerly Labor');
  expect(text(r)).toContain('Historical entitlements are listed below');
  await act(async () => r.unmount());
});
test('chooser saves identifiers only after an explicit seat selection', async () => {
  (loadChoice as jest.Mock).mockResolvedValue(null);
  (saveChoice as jest.Mock).mockResolvedValue(undefined);
  const seat = index.electorates.find((s) => s.name === 'Grayndler')!;
  mock.yourMP.mockResolvedValue(
    c.yourMPFor(seat.electorate_id, index, manifest),
  );
  mock.profileFor.mockResolvedValue(
    c.profileFor(seat.representatives[0]!.person_id, catalogs),
  );
  const r = await render(<YourMP />);
  await act(async () => {
    r.root
      .find(
        (n) =>
          n.props.testID === 'seat-search' &&
          typeof n.props.onChangeText === 'function',
      )
      .props.onChangeText('Albanese');
  });
  expect(saveChoice).not.toHaveBeenCalled();
  await act(async () => {
    r.root
      .find(
        (n) =>
          n.props.testID === `seat-choice-${seat.slug}` &&
          typeof n.props.onPress === 'function',
      )
      .props.onPress();
  });
  expect(saveChoice).toHaveBeenCalledWith({
    version: 1,
    seatId: seat.electorate_id,
    stateSeatIds: [],
  });
  expect(text(r)).toContain('verified roster of');
  expect(
    r.root
      .findAllByType(PersonRow)
      .some((n) => n.props.name === 'Anthony Albanese'),
  ).toBe(true);
  await act(async () => r.unmount());
});
test('refresh completes while no seat has been chosen', async () => {
  (loadChoice as jest.Mock).mockResolvedValue(null);
  const r = await render(<YourMP />);
  const control = () =>
    r.root.find((n) => n.props.testID === 'your-mp-screen').props
      .refreshControl as ReactElement<{
      refreshing: boolean;
      onRefresh: () => void;
    }>;
  expect(control().type).toBe(RefreshControl);
  await act(async () => control().props.onRefresh());
  expect(control().props.refreshing).toBe(false);
  expect(text(r)).toContain(
    'Your choice is saved on this device. Device backups may include it.',
  );
  await act(async () => r.unmount());
});
test('electorate preserves Census vintage and renders candidates as plain public-record text', async () => {
  const seat = index.electorates.find((s) => s.name === 'Grayndler')!;
  mock.electorateFor.mockResolvedValue(
    result(c.electorateFor(c.decodeElectorate(pinned(seat.detail_url)))),
  );
  const r = await render(<Electorate />);
  expect(text(r)).toContain('2021 Census geography');
  expect(text(r)).toContain('Updated 2021');
  expect(text(r)).not.toContain('1 January 2021');
  expect(text(r)).toContain('not been redistributed');
  // The representation caveat is behind the block's ⓘ, in full.
  await act(async () =>
    pressable(r, 'electorate-representatives-info').props.onPress(),
  );
  expect(text(r)).toContain(
    'Election winners and present-day representation can differ',
  );
  await act(async () => {
    r.root
      .find(
        (n) =>
          n.props.testID === 'election-expand-0' &&
          typeof n.props.onPress === 'function',
      )
      .props.onPress();
  });
  expect(text(r)).toContain('Rodney Smith');
  expect(
    r.root
      .findAllByType(PersonRow)
      .some((n) => n.props.name === 'Rodney Smith'),
  ).toBe(false);
  await act(async () => r.unmount());
});

test('a malformed outline drops only itself: the Electorate screen still reads', async () => {
  const seat = index.electorates.find((s) => s.name === 'Grayndler')!;
  const raw = pinned(seat.detail_url) as {
    boundaries: { geometry_kind: string }[];
  };
  // An unclosed ring in the named outlines; the rest of the file is pinned.
  const broken = (kinds: string[]) => ({
    ...raw,
    boundaries: raw.boundaries.map((b) =>
      kinds.includes(b.geometry_kind)
        ? {
            ...b,
            geometry: {
              type: 'Polygon',
              coordinates: [
                [
                  [151, -33],
                  [151.1, -33],
                  [151.1, -33.1],
                ],
              ],
            },
          }
        : b,
    ),
  });
  const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
  const official = c.decodeElectorate(broken(['official']));
  expect(official.boundaries.map((b) => b.geometry_kind)).toEqual([
    'statistical',
  ]);
  expect(warn).toHaveBeenCalledWith(
    `Skipped a malformed display outline for ${seat.electorate_id}`,
  );
  mock.electorateFor.mockResolvedValue(result(c.electorateFor(official)));
  let r = await render(<Electorate />);
  expect(text(r)).toContain('2021 Census geography');
  expect(text(r)).toContain(
    `Display outline · ${official.boundaries[0]!.vintage}`,
  );
  expect(text(r)).not.toContain('Source geometry');
  await act(async () => r.unmount());
  mock.electorateFor.mockResolvedValue(
    result(
      c.electorateFor(c.decodeElectorate(broken(['official', 'statistical']))),
    ),
  );
  r = await render(<Electorate />);
  expect(text(r)).toContain('2021 Census geography');
  expect(
    r.root.findAll((n) => n.props.testID === 'outline-unavailable').length,
  ).toBeGreaterThan(0);
  await act(async () => r.unmount());
  warn.mockRestore();
});

test('roster-only member shows limited coverage without fabricating figures', async () => {
  mockParams.slug = 'tony-abbott';
  mock.person.mockResolvedValue(
    result(c.joinPerson('tony-abbott', slugs, roster, people, manifest)),
  );
  const r = await render(<Person />);
  expect(text(r)).toContain('Only the public directory identity');
  expect(mock.profileFor).not.toHaveBeenCalled();
  // No dated seat joins and the roster has no status: the party reads plainly.
  expect(r.root.findByType(PartyLabel).props.status).toBe('unknown');
  expect(text(r)).not.toContain('Formerly');
  await act(async () => r.unmount());
});
test('unverified private identity is refused before any name or profile blocks render', async () => {
  mockParams.slug = 'synthetic-witness';
  mock.person.mockResolvedValue(
    result({
      ...c.joinPerson('tony-abbott', slugs, roster, people, manifest),
      name: 'Synthetic witness',
      rosterPersonId: undefined,
    }),
  );
  const r = await render(<Person />);
  expect(text(r)).not.toContain('Synthetic witness');
  expect(mock.profileFor).not.toHaveBeenCalled();
  expect(
    r.root.findAll((n) => n.props.testID === 'person-no-native-profile').length,
  ).toBeGreaterThan(0);
  expect(
    r.root.findAllByType(Button).some((n) => n.props.label === 'Try again'),
  ).toBe(false);
  await act(async () => r.unmount());
});

test('the profile shows the portrait without credit or licence text, and drops a failed image', async () => {
  mockParams.slug = 'sheena-watt';
  const identity = c.joinPerson('sheena-watt', slugs, roster, people, manifest);
  mock.person.mockResolvedValue(result(identity));
  mock.profileFor.mockResolvedValue(
    c.profileFor(identity.canonicalPersonId!, catalogs),
  );
  jest.mocked(portraitService.get).mockResolvedValueOnce({
    info: c.portraitFor(
      ['Sheena Watt'],
      catalogs.photoPeople!,
      catalogs.photoCredits!,
    )!,
    localURI: 'file:///cache/wd-Q100327610.webp',
  });
  const r = await render(<Person />);
  expect(r.root.findByType(Image).props.source.uri).toContain(
    'wd-Q100327610.webp',
  );
  expect(text(r)).not.toContain('Gabagool2005');
  await act(async () => r.root.findByType(Image).props.onLoad());
  // Credits and licences live on Sources and licences (tests/sources-screen).
  expect(text(r)).not.toContain('Gabagool2005');
  expect(text(r)).not.toContain('CC0');
  await act(async () => r.root.findByType(Image).props.onError());
  expect(r.root.findAllByType(Image)).toHaveLength(0);
  expect(text(r)).not.toContain('Gabagool2005');
  expect(text(r)).not.toContain('CC0');
  await act(async () => r.unmount());
});

test('a crossed electorate detail is rejected before names or figures render', async () => {
  const other = index.electorates.find((s) => s.name === 'Brisbane')!;
  mock.electorateFor.mockResolvedValue(
    result(c.electorateFor(c.decodeElectorate(pinned(other.detail_url)))),
  );
  const r = await render(<Electorate />);
  expect(text(r)).not.toContain('Brisbane');
  expect(text(r)).toContain('does not match the selected seat');
  await act(async () => r.unmount());
});

test.each([
  ['anthony-albanese', '43%', '160%'],
  ['penny-wong', '52%', '87.5%'],
])(
  'pinned %s percentages preserve their source precision',
  async (slug, aye, loading) => {
    mockParams.slug = slug;
    const identity = c.joinPerson(slug, slugs, roster, people, manifest);
    mock.person.mockResolvedValue(result(identity));
    const profile = c.profileFor(identity.canonicalPersonId!, catalogs);
    mock.profileFor.mockResolvedValue(profile);
    const r = await render(<Person />);
    expect(text(r)).toContain(`${aye} ayes`);
    expect(text(r)).toContain(`${loading} loading`);
    expect(text(r)).not.toContain('43.0%');
    expect(text(r)).not.toContain('52.0%');
    expect(text(r)).not.toContain('160.0%');
    await act(async () => pressable(r, 'person-pay-posts').props.onPress());
    expect(text(r)).toContain(`${loading} loading at the end`);
    expect(text(r)).not.toContain('160.0%');
    await act(async () => r.unmount());
  },
);

test.each([
  ['tony-abbott', 1392, 10, 3737187],
  ['bill-shorten', 2302, 12, 13744241],
  ['joe-hockey', 1093, 8, -645],
  ['jenny-macklin', 1797, 9, 1140235],
])(
  'pinned records for %s never become false absence claims',
  async (slug, divisions, spells, expenses) => {
    mockParams.slug = String(slug);
    const identity = c.joinPerson(
      String(slug),
      slugs,
      roster,
      people,
      manifest,
    );
    const legacy = String(identity.legacyPersonId);
    expect(identity.canonicalPersonId).toBeUndefined();
    expect(catalogs.votes!.records[legacy]!.divisions_total).toBe(divisions);
    expect(
      Object.values(catalogs.pay!.people).find((p) => p.pid === legacy)!.spells,
    ).toHaveLength(Number(spells));
    expect(catalogs.expenses!.people[legacy]!.total).toBe(expenses);
    mock.person.mockResolvedValue(result(identity));
    const r = await render(<Person />);
    for (const id of ['votes', 'pay', 'expenses', 'interests', 'ties'])
      expect(
        r.root.findAll((n) => n.props.testID === `person-${id}-unlinked`)
          .length,
      ).toBeGreaterThan(0);
    expect(text(r)).not.toMatch(
      /No (voting summary|covered federal salary|expense summary|register file) is held/,
    );
    expect(text(r)).toContain('This release does not link');
    expect(text(r)).toContain("party receipts for this person's party");
    expect(text(r)).not.toContain("this person's party receipts");
    expect(
      r.root
        .findAllByType(OpaxWebLink)
        .some((n) => n.props.path === `/subject/person/${slug}`),
    ).toBe(true);
    expect(mock.profileFor).not.toHaveBeenCalled();
    await act(async () => r.unmount());
  },
);

test('Windsor has a profile even without a representation row', async () => {
  mockParams.slug = 'antony-windsor';
  const identity = c.joinPerson(
    mockParams.slug,
    slugs,
    roster,
    people,
    manifest,
  );
  mock.person.mockResolvedValue(result(identity));
  const r = await render(<Person />);
  expect(text(r)).toContain('Antony Windsor');
  expect(r.root.findByType(PartyLabel).props.status).toBe('unknown');
  expect(text(r)).not.toContain('Formerly');
  expect(text(r)).toContain('does not link');
  expect(
    r.root.findAllByType(Button).some((n) => n.props.label === 'Try again'),
  ).toBe(false);
  await act(async () => r.unmount());
});

test.each(['brown', 'james', 'cook'])(
  'deep-linked roster stub %s gets no native profile or retry action',
  async (slug) => {
    mockParams.slug = slug;
    mock.person.mockResolvedValue(
      result(c.joinPerson(slug, slugs, roster, people, manifest)),
    );
    const r = await render(<Person />);
    expect(text(r)).toContain('No native profile yet');
    expect(r.root.findAllByType(PartyLabel)).toHaveLength(0);
    expect(
      r.root.findAll((n) => n.props.testID === 'person-votes'),
    ).toHaveLength(0);
    expect(
      r.root.findAllByType(Button).some((n) => n.props.label === 'Try again'),
    ).toBe(false);
    expect(mock.profileFor).not.toHaveBeenCalled();
    await act(async () => r.unmount());
  },
);

test('a saved abolished seat is identified and can be changed', async () => {
  const seat = index.electorates.find((s) => s.name === 'Higgins')!;
  (loadChoice as jest.Mock).mockResolvedValue({
    version: 1,
    seatId: seat.electorate_id,
    stateSeatIds: [],
  });
  mock.yourMP.mockResolvedValue(
    c.yourMPFor(seat.electorate_id, index, manifest),
  );
  const r = await render(<YourMP />);
  expect(text(r)).toContain('Abolished; not a current seat');
  expect(text(r)).not.toContain('does not establish a vacancy');
  expect(
    r.root.findAllByType(Button).some((n) => n.props.testID === 'change-seat'),
  ).toBe(true);
  expect(r.root.findAll((n) => n.props.testID === 'your-state')).toHaveLength(
    0,
  );
  await act(async () => r.unmount());
});

test('historical electorate records retain the abolished notice', async () => {
  const seat = index.electorates.find((s) => s.name === 'Higgins')!;
  mockParams.id = seat.electorate_id;
  mock.electorateFor.mockResolvedValue(
    result(c.electorateFor(c.decodeElectorate(pinned(seat.detail_url)))),
  );
  const r = await render(<Electorate />);
  expect(text(r)).toContain('Abolished; not a current seat');
  expect(text(r)).not.toContain('does not establish a vacancy');
  expect(text(r)).toContain('Past winners are listed under Elections');
  expect(text(r)).not.toContain('Historical representation is shown');
  await act(async () => r.unmount());
});

test('state district correction and removal retain the federal choice', async () => {
  const find = (name: string) =>
    index.electorates.find((s) => s.name === name)!;
  const seat = find('Ballarat'),
    district = find('Wendouree'),
    replacement = find('Eureka'),
    region = find('Northern Metropolitan');
  (loadChoice as jest.Mock).mockResolvedValue({
    version: 1,
    seatId: seat.electorate_id,
    stateSeatIds: [district.electorate_id, region.electorate_id],
  });
  (saveChoice as jest.Mock).mockResolvedValue(undefined);
  mock.yourMP.mockImplementation(async (id, chosen) =>
    c.yourMPFor(id, index, manifest, chosen),
  );
  mock.profileFor.mockImplementation(async (id) => c.profileFor(id, catalogs));
  const r = await render(<YourMP />);
  const press = async (id: string) =>
    act(async () => pressable(r, id).props.onPress());
  await press('choose-state-seat');
  await act(async () =>
    r.root
      .find(
        (n) =>
          n.props.testID === 'seat-search' &&
          typeof n.props.onChangeText === 'function',
      )
      .props.onChangeText('Eureka'),
  );
  await press(`seat-choice-${replacement.slug}`);
  expect(saveChoice).toHaveBeenLastCalledWith({
    version: 1,
    seatId: seat.electorate_id,
    stateSeatIds: [region.electorate_id, replacement.electorate_id],
  });
  await press(`remove-state-seat-${region.electorate_id}`);
  expect(saveChoice).toHaveBeenLastCalledWith({
    version: 1,
    seatId: seat.electorate_id,
    stateSeatIds: [replacement.electorate_id],
  });
  await act(async () => r.unmount());
});

test('Your MP register disclosure is lazy and renders plain category/change labels', async () => {
  const seat = index.electorates.find((s) => s.name === 'Ballarat')!;
  (loadChoice as jest.Mock).mockResolvedValue({
    version: 1,
    seatId: seat.electorate_id,
    stateSeatIds: [],
  });
  mock.yourMP.mockResolvedValue(
    c.yourMPFor(seat.electorate_id, index, manifest),
  );
  mock.profileFor.mockImplementation(async (id, options) =>
    c.profileFor(id, {
      ...catalogs,
      ...(options?.includeInterests
        ? { interest: c.decodeInterest(pinned('/interests/10368.json')) }
        : {}),
    }),
  );
  const r = await render(<YourMP />);
  expect(mock.profileFor).toHaveBeenLastCalledWith(
    seat.representatives[0]!.person_id,
    { includeInterests: false },
  );
  // Closed: the disclosure row only; no register block is drawn or loaded.
  expect(
    r.root.findAll((n) => n.props.testID === 'your-register-heading'),
  ).toHaveLength(0);
  await act(async () => pressable(r, 'your-register-toggle').props.onPress());
  expect(mock.profileFor).toHaveBeenLastCalledWith(
    seat.representatives[0]!.person_id,
    { includeInterests: true },
  );
  expect(text(r)).toContain('Gifts · added');
  expect(text(r)).toContain('Gifts · deleted');
  expect(text(r)).not.toContain('real_estate');
  expect(text(r)).not.toContain('addition');
  const toggle = () => pressable(r, 'your-register-toggle').props.onPress();
  await act(async () => toggle());
  let finish!: (value: Awaited<ReturnType<typeof mock.profileFor>>) => void;
  const pending = new Promise<Awaited<ReturnType<typeof mock.profileFor>>>(
    (resolve) => {
      finish = resolve;
    },
  );
  mock.profileFor.mockReturnValueOnce(pending);
  await act(async () => toggle());
  expect(text(r)).not.toContain('No register file is held');
  expect(
    r.root.findAll((n) => n.props.testID === 'your-register-missing'),
  ).toHaveLength(0);
  await act(async () =>
    finish(
      c.profileFor(seat.representatives[0]!.person_id, {
        ...catalogs,
        interest: c.decodeInterest(pinned('/interests/10368.json')),
      }),
    ),
  );
  expect(text(r)).toContain('Gifts · added');
  await act(async () => r.unmount());
});

test('picker passes distinct chamber hints for repeated seat names', async () => {
  (loadChoice as jest.Mock).mockResolvedValue(null);
  const r = await render(<YourMP />);
  await act(async () =>
    r.root
      .find(
        (n) =>
          n.props.testID === 'seat-search' &&
          typeof n.props.onChangeText === 'function',
      )
      .props.onChangeText('Melbourne'),
  );
  const buttons = r.root
    .findAllByType(LinkRow)
    .filter((n) => n.props.title === 'Melbourne');
  expect(buttons.map((n) => n.props.accessibilityHint)).toEqual(
    expect.arrayContaining([
      'House of Representatives · Victoria',
      'Victorian Legislative Assembly · Victoria',
    ]),
  );
  await act(async () => r.unmount());
});

test('Your MP shows six recorded bill votes in each direction', async () => {
  const seat = index.electorates.find((s) => s.name === 'Grayndler')!;
  (loadChoice as jest.Mock).mockResolvedValue({
    version: 1,
    seatId: seat.electorate_id,
    stateSeatIds: [],
  });
  mock.yourMP.mockResolvedValue(
    c.yourMPFor(seat.electorate_id, index, manifest),
  );
  const profile = c.profileFor(seat.representatives[0]!.person_id, catalogs);
  expect(profile.blocks.votes.data!.for.length).toBeGreaterThanOrEqual(6);
  expect(profile.blocks.votes.data!.against.length).toBeGreaterThanOrEqual(6);
  mock.profileFor.mockResolvedValue(profile);
  const r = await render(<YourMP />);
  const sides = r.root.findAllByType(VoteSide).map((n) => n.props.side);
  expect(sides.filter((side) => side === 'for')).toHaveLength(6);
  expect(sides.filter((side) => side === 'against')).toHaveLength(6);
  const matched = [
    ...profile.blocks.votes.data!.for.slice(0, 6),
    ...profile.blocks.votes.data!.against.slice(0, 6),
  ].filter((row) => row.billKey);
  const links = r.root
    .findAllByType(LinkRow)
    .filter((n) => n.props.testID?.startsWith('your-mp-bill-'));
  expect(links).toHaveLength(matched.length);
  expect(matched.length).toBeGreaterThan(0);
  const first = links[0]!;
  const key = first.props.testID.replace('your-mp-bill-', '');
  await act(async () => first.props.onPress());
  expect(router.push).toHaveBeenCalledWith(billRoute(key));
  expect(
    r.root
      .findAllByType(OpaxWebLink)
      .some((n) => n.props.path.startsWith('/bill/')),
  ).toBe(false);
  await act(async () => r.unmount());
});

test('profile bill votes push the matched native bill route and keep unmatched votes as text', async () => {
  const identity = c.joinPerson(
    'anthony-albanese',
    slugs,
    roster,
    people,
    manifest,
  );
  const profile = c.profileFor(identity.canonicalPersonId!, catalogs);
  mock.person.mockResolvedValue(result(identity));
  mock.profileFor.mockResolvedValue(profile);
  const r = await render(<Person />);
  await act(async () => pressable(r, 'person-bill-votes').props.onPress());
  const votes = profile.blocks.votes.data!;
  const links = r.root
    .findAllByType(LinkRow)
    .filter((n) => n.props.testID?.startsWith('person-bill-'));
  expect(links).toHaveLength(
    [...votes.for, ...votes.against].filter((row) => row.billKey).length,
  );
  const first = links[0]!;
  const [, , side, index] = first.props.testID.split('-');
  const row = votes[side as 'for' | 'against'][Number(index)]!;
  await act(async () => first.props.onPress());
  expect(router.push).toHaveBeenCalledWith(billRoute(row.billKey!));
  expect(text(r)).toContain('Not matched to a bill record');
  expect(text(r)).not.toContain('Bill record on opax.com.au');
  expect(
    r.root
      .findAllByType(OpaxWebLink)
      .some((n) => n.props.path.startsWith('/bill/')),
  ).toBe(false);
  await act(async () => r.unmount());
});

test('missing register ties do not refer to an existing file; expense copy uses about without a chart metaphor', async () => {
  mockParams.slug = 'sheena-watt';
  const identity = c.joinPerson(
    mockParams.slug,
    slugs,
    roster,
    people,
    manifest,
  );
  mock.person.mockResolvedValue(result(identity));
  mock.profileFor.mockResolvedValue(
    c.profileFor(identity.canonicalPersonId!, catalogs),
  );
  const r = await render(<Person />);
  expect(text(r)).toContain(
    'No linked register file is available for declared organisation ties',
  );
  expect(text(r)).not.toContain('in this register file');
  await act(async () => r.unmount());
  mockParams.slug = 'anthony-albanese';
  const albanese = c.joinPerson(
    mockParams.slug,
    slugs,
    roster,
    people,
    manifest,
  );
  mock.person.mockResolvedValue(result(albanese));
  mock.profileFor.mockResolvedValue(
    c.profileFor(albanese.canonicalPersonId!, catalogs),
  );
  const a = await render(<Person />);
  expect(text(a)).toContain('about $2,440,277');
  expect(text(a)).not.toContain('A bar past its tick');
  // The benchmark method is behind the section's ⓘ, in full.
  await act(async () => pressable(a, 'person-expenses-info').props.onPress());
  expect(text(a)).toContain('divided by its covered calendar years');
  await act(async () => a.unmount());
});

test('closed salary disclosure does no row formatting; opening renders every retained year', async () => {
  const person = c.joinPerson(
    'anthony-albanese',
    slugs,
    roster,
    people,
    manifest,
  );
  const profile = c.profileFor(person.canonicalPersonId!, catalogs);
  mock.person.mockResolvedValue(result(person));
  mock.profileFor.mockResolvedValue(profile);
  const years = jest.spyOn(format, 'formatFinancialYear');
  let r: TestRenderer.ReactTestRenderer | undefined;
  try {
    r = await render(<Person />);
    expect(years).not.toHaveBeenCalled();
    const toggle = () => pressable(r!, 'person-pay-years').props.onPress();
    await act(async () => toggle());
    expect(years).toHaveBeenCalledTimes(
      profile.blocks.pay.data!.person.by_year.length,
    );
    expect(text(r)).toContain(
      format.formatFinancialYear(
        profile.blocks.pay.data!.person.by_year[0]![0],
      ),
    );
    years.mockClear();
    await act(async () => toggle());
    expect(years).not.toHaveBeenCalled();
  } finally {
    if (r) await act(async () => r!.unmount());
    years.mockRestore();
  }
});

test('a surname profile retains its short route for portrait refusal after canonical profile resolution', async () => {
  mockParams.slug = 'walsh';
  const identity = c.joinPerson('walsh', slugs, roster, people, manifest);
  mock.person.mockResolvedValue(result(identity));
  mock.profileFor.mockResolvedValue(
    c.profileFor(identity.canonicalPersonId!, catalogs),
  );
  jest.mocked(portraitService.get).mockResolvedValue(null);
  const r = await render(<Person />);
  expect(portraitService.get).toHaveBeenCalledWith({
    name: 'Jess Walsh',
    slug: 'walsh',
    refresh: false,
  });
  expect(r.root.findAllByType(Image)).toHaveLength(0);
  await act(async () => r.unmount());
});
