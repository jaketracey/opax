import { SkeletonCrossfade } from '../src/design/states';
import { withNavigationOptions } from './navigation-options';
import { Icon } from '../src/design/icon';
import {
  LatestRow as LatestVoteRow,
  type LatestRecord,
} from '../src/features/your-mp/LatestRows';
import { Link, router } from 'expo-router';
import { act, type ReactElement } from 'react';
import {
  ActionSheetIOS,
  Image,
  Linking,
  Platform,
  RefreshControl,
  Share,
  StyleSheet,
} from 'react-native';
import { track } from '../src/analytics';
import * as recordActions from '../src/features/records/actions';
import TestRenderer from 'react-test-renderer';
import * as c from '../src/api/catalogs';
import { ApiError } from '../src/api/errors';
import {
  portraits as portraitService,
  catalogs as runtime,
} from '../src/api/runtime';
import * as format from '../src/design/format';
import { VoteSplit } from '../src/design/charts';
import {
  Button,
  LinkRow,
  PartyLabel,
  PersonRow,
  SourceLine,
  Text,
} from '../src/design/primitives';
import { minimumTarget } from '../src/design/tokens';
import { RowLink } from '../src/design/row-link';
import * as menus from '../src/design/menu';
import Electorate from '../src/features/Electorate';
import { MemberVoteRow } from '../src/features/people/MemberVoteRow';
import Person from '../src/features/Person';
import {
  forgetChoice,
  loadChoice,
  saveChoice,
  subscribeChoice,
} from '../src/features/your-mp/choice-store';
import { officialPageFor } from '../src/features/your-mp/MemberHeroRow';
import { resetSeatForTests } from '../src/features/your-mp/useSeat';
import YourMP from '../src/features/YourMP';
import { billRoute, seatRoute } from '../src/navigation/routes';
import { grantsRoute } from '../src/navigation/routes/public-money';
import * as external from '../src/navigation/external/sheets';
import { canShare } from '../src/navigation/share';
import { sheetPayload } from '../src/navigation/sheets';
import {
  catalogs,
  files,
  index,
  manifest,
  people,
  pinned,
  roster,
  slugs,
} from './pinned';
import { menuTitle } from '../src/design/menu-title';
jest.mock('../src/analytics', () => ({
  ...jest.requireActual('../src/analytics'),
  track: jest.fn(),
}));
jest.mock('../src/api/runtime', () => ({
  portraits: { get: jest.fn() },
  catalogs: {
    person: jest.fn(),
    profileFor: jest.fn(),
    rosterProfileFor: jest.fn(),
    directory: jest.fn(),
    yourMP: jest.fn(),
    electorateFor: jest.fn(),
  },
}));
jest.mock('../src/features/your-mp/choice-store', () => ({
  loadChoice: jest.fn(),
  saveChoice: jest.fn(),
  forgetChoice: jest.fn(async () => undefined),
  subscribeChoice: jest.fn(() => () => undefined),
}));
jest.mock('../src/api/image-policy', () => ({
  localImageURI: (uri: string) => uri,
}));
const mockParams: { slug?: string; id?: string } = {};
const mockOptions: Record<string, unknown>[] = [];
const mockOpenAsk = jest.fn();
jest.mock('../src/features/ask/open', () => ({
  useOpenAsk: () => mockOpenAsk,
}));
jest.mock('expo-router', () => ({
  useIsPreview: () => false,
  Link: Object.assign(
    ({ children, ...props }: { children: unknown }) =>
      jest
        .requireActual('react')
        .createElement(
          jest.requireActual('react-native').Pressable,
          props,
          children,
        ),
    {
      Trigger: ({ children }: { children: unknown }) => children,
      Preview: () => null,
      Menu: () => null,
      MenuAction: () => null,
    },
  ),
  useSegments: () => [],
  useLocalSearchParams: () => mockParams,
  router: { push: jest.fn(), back: jest.fn(), navigate: jest.fn() },
  Stack: {
    Screen: ({ options }: { options: Record<string, unknown> }) => {
      mockOptions.push(options);
      return null;
    },
  },
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
    r = TestRenderer.create(
      withNavigationOptions(element, (options) => {
        mockOptions.push(options);
      }),
    );
  });
  return r;
}
// Buttons, disclosure rows and link rows: the pressable with the test ID.
const pressable = (r: TestRenderer.ReactTestRenderer, testID: string) =>
  r.root.findAll(
    (n) => n.props.testID === testID && typeof n.props.onPress === 'function',
  )[0]!;
const has = (r: TestRenderer.ReactTestRenderer, testID: string) =>
  r.root.findAll((n) => n.props.testID === testID).length > 0;
const text = (r: TestRenderer.ReactTestRenderer) =>
  r.root
    .findAllByType(Text)
    .flatMap((n) => n.props.children)
    .filter((v) => typeof v === 'string')
    .join(' ')
    .replace(/\s+/g, ' ');
beforeEach(() => {
  jest.clearAllMocks();
  resetSeatForTests();
  Object.values(mock).forEach((fn) => fn.mockReset());
  mockParams.slug = 'anthony-albanese';
  mockParams.id = index.electorates.find(
    (s) => s.name === 'Grayndler',
  )!.electorate_id;
  mock.directory.mockResolvedValue(directory);
  // As the runtime does: a second pass with the register file, when pinned.
  mock.rosterProfileFor.mockImplementation(async (identity) => {
    const key = c.rosterProfileFor(identity, catalogs).interestKey;
    const path = `/interests/${key}.json`;
    return c.rosterProfileFor(identity, {
      ...catalogs,
      ...(key && files[path]
        ? { interest: c.decodeInterest(pinned(path)) }
        : {}),
    });
  });
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
  expect(r.root.findByType(SkeletonCrossfade).props).toMatchObject({
    loading: false,
    ready: true,
    fill: true,
  });
  expect(text(r)).toContain('Penny Wong');
  expect(text(r)).toContain('Entitlements set by instrument, not payslips.');
  expect(
    r.root.findAll((n) => n.props.testID === 'person-expenses-error').length,
  ).toBeGreaterThan(0);
  expect(r.root.findAllByType(Image)).toHaveLength(0);
  expect(text(r)).not.toContain('Portrait display permission needs review');
  // Tile labels fit one line at Large (sweep 1, item 9).
  expect(text(r)).toContain(
    '1,998 divisions 37 interests $448,631 a year in pay',
  );
  // An undated votes file is dated by the newest listed bill vote, never
  // left undated or given another file's date (sweep 1, item 9).
  expect(text(r)).toContain('Latest bill vote 20 Jan 2026 · They Vote For You');
  expect(text(r)).not.toContain('Date not published · They Vote For You');
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
  expect(has(r, 'person-former')).toBe(true);
  // The label is the party she sat for; the header says she left.
  expect(text(r)).not.toContain('Formerly Labor');
  expect(text(r)).toContain('Former member');
  expect(text(r)).toContain('No current pay. Past entitlements below.');
  await act(async () => r.unmount());
});
test('electorate preserves Census vintage and renders candidates as plain public-record text', async () => {
  const seat = index.electorates.find((s) => s.name === 'Grayndler')!;
  mock.electorateFor.mockResolvedValue(
    result(c.electorateFor(c.decodeElectorate(pinned(seat.detail_url)))),
  );
  const r = await render(<Electorate />);
  // One Census heading and its caveat, without the vintage said twice
  // (pass 5, P2-7).
  expect(text(r)).toContain('Census 2021');
  expect(text(r)).not.toContain('2021 Census geography');
  expect(text(r)).toContain('Updated 2021');
  expect(text(r)).not.toContain('1 January 2021');
  expect(text(r)).toContain(
    'Not adjusted for boundary changes since the Census.',
  );
  // The representation caveat is in the block's source sheet, in full.
  await act(async () =>
    pressable(r, 'electorate-representatives-source').props.onPress(),
  );
  const { params: sourceParams } = jest
    .mocked(router.push)
    .mock.calls.at(-1)![0] as { params: { key: string } };
  expect(
    sheetPayload(sourceParams.key, 'source')?.details.notes?.join(' '),
  ).toContain('Election winners and present-day representation can differ');
  // The newest election row links to its own screen; nothing expands here.
  const link = r.root.findAll(
    (n) => n.props.href?.pathname === '/election' && n.props.asChild,
  )[0]!;
  const firstRow = r.root.find(
    (n) => typeof n.type === 'string' && n.props.testID === 'election-row-0',
  );
  expect(firstRow.findAll((n) => n === link)).toHaveLength(1);
  expect(
    r.root.findAll((n) => n.props.testID === 'election-expand-0'),
  ).toHaveLength(0);
  const electionParams = link.props.href.params;
  await act(async () => r.unmount());
  // A candidate who never sat is public-record text: a row with no link.
  Object.assign(mockParams, electionParams);
  const Election = jest.requireActual('../src/features/your-mp/Election')
    .default as () => ReactElement;
  const e = await render(<Election />);
  expect(text(e)).toContain('Rodney Smith');
  const candidate = e.root
    .findAllByType(PersonRow)
    .find((n) => n.props.name === 'Rodney Smith')!;
  expect(candidate.props.href).toBeUndefined();
  expect(candidate.props.menu).toEqual([]);
  await act(async () => e.unmount());
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
  expect(text(r)).toContain('Census 2021');
  expect(text(r)).toContain(`${official.boundaries[0]!.vintage} boundary`);
  expect(text(r)).not.toContain('Source geometry');
  await act(async () => r.unmount());
  mock.electorateFor.mockResolvedValue(
    result(
      c.electorateFor(c.decodeElectorate(broken(['official', 'statistical']))),
    ),
  );
  r = await render(<Electorate />);
  expect(text(r)).toContain('Census 2021');
  // With no outline left the header drops; the title block leads.
  expect(
    r.root.findAll((n) => n.props.testID === 'electorate-map'),
  ).toHaveLength(0);
  expect(
    r.root.findAll((n) => n.props.testID === 'electorate-name').length,
  ).toBeGreaterThan(0);
  await act(async () => r.unmount());
  warn.mockRestore();
});

test('roster-only member says how its records are linked, without fabricating figures', async () => {
  mockParams.slug = 'tony-abbott';
  const identity = c.joinPerson('tony-abbott', slugs, roster, people, manifest);
  mock.person.mockResolvedValue(result(identity));
  const r = await render(<Person />);
  // How its records are linked is a note in the strip's source sheet.
  expect(
    r.root
      .findAllByType(SourceLine)
      .find((n) => n.props.testID === 'person-figures-source')!
      .props.notes.join(' '),
  ).toContain('matched by the parliamentary roster’s ID and name');
  expect(has(r, 'person-web-foot')).toBe(true);
  expect(mock.profileFor).not.toHaveBeenCalled();
  expect(mock.rosterProfileFor).toHaveBeenCalledWith(identity);
  // The dated Warringah term establishes status without expanding identity coverage.
  expect(has(r, 'person-former')).toBe(true);
  expect(text(r)).toContain('Former member');
  expect(text(r)).not.toContain('Formerly Liberal');
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
    r.root.findAll((n) => n.props.testID === 'person-not-found').length,
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
  expect(
    r.root.findAll(
      (n) =>
        n.props.testID === 'electorate-error' &&
        n.props.title === 'This electorate couldn’t be loaded.',
    ).length,
  ).toBeGreaterThan(0);
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
    // No ayes percentage on the page (people.md 2.1); the loading is in
    // Pay's source sheet, at its source precision.
    expect(text(r)).not.toContain(`${aye} ayes`);
    const notes = r.root
      .findAllByType(SourceLine)
      .find((n) => n.props.testID === 'person-pay-source')!
      .props.notes.join(' ');
    expect(notes).toContain(`plus a ${loading} loading`);
    expect(text(r) + notes).not.toContain('43.0%');
    expect(text(r) + notes).not.toContain('52.0%');
    expect(text(r) + notes).not.toContain('160.0%');
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
    // TestFlight build 32: these records are held by roster ID, so they link.
    for (const id of ['votes', 'pay', 'expenses'])
      expect(
        r.root.findAll((n) => n.props.testID === `person-${id}-unlinked`),
      ).toHaveLength(0);
    // Nothing held elsewhere is claimed absent: an empty block is unlinked.
    expect(text(r)).not.toMatch(
      /No (voting summary|covered federal salary|expense summary|register file) is held/,
    );
    expect(text(r)).not.toContain("party receipts for this person's party");
    expect(has(r, 'person-web-foot')).toBe(true);
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
  // No dated seat links him (the release names Antony Harold Curties
  // Windsor), but no sitting federal member is a Windsor: former, 9 Oct.
  expect(has(r, 'person-former')).toBe(true);
  expect(text(r)).toContain('Former member');
  // No whole-page retry (Topics keeps its own; its read is not mocked here).
  expect(has(r, 'person-error')).toBe(false);
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
    expect(has(r, 'person-not-found')).toBe(true);
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

test('historical electorate records retain the abolished notice', async () => {
  const seat = index.electorates.find((s) => s.name === 'Higgins')!;
  mockParams.id = seat.electorate_id;
  mock.electorateFor.mockResolvedValue(
    result(c.electorateFor(c.decodeElectorate(pinned(seat.detail_url)))),
  );
  const r = await render(<Electorate />);
  // The title block says it once; the members section reads as history.
  expect(text(r)).toContain('Abolished.');
  expect(text(r)).not.toContain('Abolished; not a current seat');
  expect(
    r.root.findAll(
      (n) =>
        n.props.testID === 'electorate-members-heading' &&
        n.props.children === 'Past members',
    ).length,
  ).toBeGreaterThan(0);
  expect(text(r)).not.toContain('does not establish a vacancy');
  expect(text(r)).not.toContain('Historical representation is shown');
  await act(async () => r.unmount());
});

test.each(['anthony-albanese', 'julia-gillard'])(
  '%s keeps the division summary and source totals without a profile vote split',
  async (slug) => {
    mockParams.slug = slug;
    const identity = c.joinPerson(slug, slugs, roster, people, manifest);
    const profile = c.profileFor(identity.canonicalPersonId!, catalogs);
    mock.person.mockResolvedValue(result(identity));
    mock.profileFor.mockResolvedValue(profile);
    const r = await render(<Person />);
    const votes = profile.blocks.votes.data!;
    expect(votes.total).toBeGreaterThan(0);
    expect(text(r)).toContain(
      `Voted in ${format.formatCount(votes.total)} divisions`,
    );
    expect(r.root.findAllByType(VoteSplit)).toHaveLength(0);
    await act(async () => pressable(r, 'person-votes-source').props.onPress());
    const { params } = jest.mocked(router.push).mock.calls.at(-1)![0] as {
      params: { key: string };
    };
    expect(sheetPayload(params.key, 'source')?.details.notes).toContain(
      `Of these divisions, voted for ${format.formatCount(votes.ayes)} and voted against ${format.formatCount(votes.noes)}. Most divisions are on procedural motions and amendments.`,
    );
    await act(async () => r.unmount());
  },
);

test('profile bill votes keep the matched native bill route and chevron', async () => {
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
  await act(async () => pressable(r, 'person-votes-all').props.onPress());
  const votes = profile.blocks.votes.data!;
  const rows = r.root.findAllByType(MemberVoteRow);
  expect(rows).toHaveLength(votes.for.length + votes.against.length);
  const links = rows.filter((n) => n.props.href);
  expect(links).toHaveLength(
    [...votes.for, ...votes.against].filter((row) => row.billKey).length,
  );
  const first = links[0]!;
  const row = [...votes.for, ...votes.against].find(
    (v) => v.name === first.props.name && v.stage === first.props.stage,
  )!;
  // Each vote opens the division on its bill's page.
  expect(first.props.href).toMatchObject(
    billRoute(row.billKey!, undefined, { section: 'divisions' }),
  );
  expect(first.findAllByType(Icon).map((n) => n.props.name)).toContain(
    'chevron.right',
  );
  expect(text(r)).not.toContain('Not matched to a bill record');
  expect(text(r)).not.toContain('Bill record on opax.com.au');
  await act(async () => r.unmount());
});

test.each([
  undefined,
  'https://theyvoteforyou.org.au/divisions/representatives/2026-06-04/1',
])(
  'an unmatched profile vote opens its source, with original URL %s',
  async (url) => {
    const identity = c.joinPerson(
      'anthony-albanese',
      slugs,
      roster,
      people,
      manifest,
    );
    const profile = c.profileFor(identity.canonicalPersonId!, catalogs);
    const votes = profile.blocks.votes.data!;
    votes.for = [
      Object.assign({}, votes.for[0]!, {
        name: 'Two bills & a motion',
        stage: 'Second reading',
        date: '2026-06-04',
        billKey: null,
        url,
      }),
    ];
    votes.against = [];
    mock.person.mockResolvedValue(result(identity));
    mock.profileFor.mockResolvedValue(profile);
    const open = jest.spyOn(external, 'openSource').mockResolvedValue();
    const r = await render(<Person />);
    try {
      const row = r.root.findByType(MemberVoteRow);
      const destination =
        url ??
        'https://theyvoteforyou.org.au/search?query=Two%20bills%20%26%20a%20motion';
      expect(row.findAllByType(Icon).map((n) => n.props.name)).toEqual([
        'arrow.up.right.square',
      ]);
      expect(row.findByType(RowLink).props.preview).toBe(false);
      const link = row.find(
        (n) => typeof n.type === 'string' && n.props.testID === 'person-vote-0',
      );
      expect(link.props.accessibilityHint).toBe('Opens in the in-app browser');
      await act(async () =>
        row.findByType(Link).props.onPress!({
          preventDefault: jest.fn(),
        } as never),
      );
      expect(open).toHaveBeenCalledWith(destination, 'Two bills & a motion');
    } finally {
      open.mockRestore();
      await act(async () => r.unmount());
    }
  },
);

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
  // Ties sit inside Declared interests (pass 5, P3-4): with no register
  // file, that block's one sentence says so for both.
  // With no register file the block collapses: nothing claims absence.
  expect(text(r)).not.toContain('No register file is held');
  expect(text(r)).not.toContain('in this register file');
  expect(text(r)).not.toContain('Declared ties');
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
  expect(text(a)).toContain('Average a year');
  expect(text(a)).toContain('$2,440,277');
  expect(text(a)).not.toContain('about $2,440,277');
  expect(text(a)).not.toContain('A bar past its tick');
  // The benchmark method is in the block's source sheet, in full.
  await act(async () => pressable(a, 'person-expenses-source').props.onPress());
  const { params: sourceParams } = jest
    .mocked(router.push)
    .mock.calls.at(-1)![0] as { params: { key: string } };
  expect(
    sheetPayload(sourceParams.key, 'source')?.details.notes?.join(' '),
  ).toContain('For reference, the median a year across all parliamentarians');
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

test.each(['federal', 'state'])(
  '%s electorate fine print uses the unchanged authorisation and corrections link',
  async (kind) => {
    const seat = index.electorates.find((s) =>
      kind === 'federal'
        ? s.jurisdiction === 'federal'
        : s.jurisdiction !== 'federal' && !!files[s.detail_url],
    )!;
    mockParams.id = seat.electorate_id;
    mock.electorateFor.mockResolvedValue(
      result(c.electorateFor(c.decodeElectorate(pinned(seat.detail_url)))),
    );
    const r = await render(<Electorate />);
    if (kind === 'state') {
      const { AUTHORISATION_LINE, CORRECTION_CONTACT } = jest.requireActual(
        '../src/design/authorisation',
      );
      expect(text(r)).toContain(AUTHORISATION_LINE);
      expect(text(r)).toContain('We aim to respond within 2 business days.');
      // The page foot's correction link, inside the authorisation wrapper.
      const correction = r.root
        .findByProps({ testID: 'electorate-authorisation' })
        .findAll(
          (n) =>
            n.props.accessibilityLabel ===
              'Report a correction by email to corrections@opax.com.au' &&
            typeof n.props.onPress === 'function',
        )[0]!;
      expect(correction.props.accessibilityRole).toBe('link');
      expect(correction.props.accessibilityLabel).toBe(
        'Report a correction by email to corrections@opax.com.au',
      );
      expect(
        StyleSheet.flatten(correction.props.style({ pressed: false })),
      ).toMatchObject({
        minHeight: minimumTarget,
        justifyContent: 'center',
      });
      // The page foot draws the link in the link tint.
      const [label, address] = correction.findAllByType(Text);
      expect(label!.props).toMatchObject({
        variant: 'footnote',
        tone: 'navy',
      });
      expect(label!.props.children).toBe('Report a correction:');
      expect(address!.props).toMatchObject({
        variant: 'footnote',
        tone: 'navy',
        children: 'corrections@opax.com.au',
        numberOfLines: 1,
        adjustsFontSizeToFit: true,
        minimumFontScale: 0.5,
      });
      const open = jest.spyOn(Linking, 'openURL').mockResolvedValue(undefined);
      await act(async () => correction.props.onPress());
      expect(open).toHaveBeenCalledWith(CORRECTION_CONTACT);
      open.mockRestore();
    } else {
      expect(
        r.root.findAllByProps({ testID: 'electorate-authorisation' }),
      ).toHaveLength(0);
    }
    await act(async () => r.unmount());
  },
);

describe('Your MP tab', () => {
  const seatNamed = (name: string) =>
    index.electorates.find((s) => s.name === name)!;
  const choose = (seatId: string, stateSeatIds: string[] = []) =>
    (loadChoice as jest.Mock).mockResolvedValue({
      version: 1,
      seatId,
      stateSeatIds,
    });
  const withRegister = () =>
    mock.profileFor.mockImplementation(async (id, options) =>
      c.profileFor(id, {
        ...catalogs,
        ...(options?.includeInterests
          ? { interest: c.decodeInterest(pinned('/interests/10368.json')) }
          : {}),
      }),
    );
  const ids = (r: TestRenderer.ReactTestRenderer, prefix: string) =>
    r.root.findAll(
      (n) =>
        typeof n.props.testID === 'string' &&
        n.props.testID.startsWith(prefix) &&
        typeof n.type !== 'string',
    );
  /** The records Lately draws, in order, from each row's props. */
  const latest = (r: TestRenderer.ReactTestRenderer) =>
    r.root
      .findAll(
        (n) =>
          /^your-latest-\d+$/.test(n.props.testID ?? '') && !!n.props.record,
      )
      .map((n) => n.props.record as { href: unknown; key: string });
  const has = (r: TestRenderer.ReactTestRenderer, testID: string) =>
    r.root.findAll((n) => n.props.testID === testID).length > 0;
  /** Every menu item, however the sections nest. */
  const menuItems = (
    menu: unknown,
  ): { title: string; onPress?: () => void }[] =>
    Array.isArray(menu)
      ? menu.flatMap(menuItems)
      : menu && typeof menu === 'object'
        ? 'items' in menu
          ? menuItems((menu as { items: unknown }).items)
          : 'title' in menu
            ? [menu as { title: string; onPress?: () => void }]
            : []
        : [];

  test('with no seat, the invitation opens the chooser and saves nothing', async () => {
    (loadChoice as jest.Mock).mockResolvedValue(null);
    mock.yourMP.mockResolvedValue(
      c.yourMPFor(seatNamed('Grayndler').electorate_id, index, manifest),
    );
    const r = await render(<YourMP />);
    expect(has(r, 'your-invitation')).toBe(true);
    expect(text(r)).toContain('Who represents you?');
    // The privacy line lives in About › Privacy, not on the tab.
    expect(text(r)).not.toContain('Device backups may include it.');
    await act(async () => pressable(r, 'your-invitation-find').props.onPress());
    expect(router.push).toHaveBeenCalledWith(seatRoute());
    await act(async () =>
      pressable(r, 'your-invitation-location').props.onPress(),
    );
    expect(router.push).toHaveBeenLastCalledWith(seatRoute(undefined, true));
    expect(saveChoice).not.toHaveBeenCalled();
    expect(mock.profileFor).not.toHaveBeenCalled();
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
    await act(async () => r.unmount());
  });

  test('a saved abolished seat says so and returns to the invitation', async () => {
    const seat = seatNamed('Higgins');
    choose(seat.electorate_id);
    mock.yourMP.mockResolvedValue(
      c.yourMPFor(seat.electorate_id, index, manifest),
    );
    const r = await render(<YourMP />);
    expect(text(r)).toContain('Higgins is no longer an electorate.');
    expect(has(r, 'your-invitation-find')).toBe(true);
    expect(has(r, 'your-seat-name')).toBe(false);
    expect(has(r, 'your-state')).toBe(false);
    await act(async () => r.unmount());
  });

  test('the member, profile rows and senators draw for a chosen seat', async () => {
    const seat = seatNamed('Grayndler');
    choose(seat.electorate_id);
    mock.yourMP.mockResolvedValue(
      c.yourMPFor(seat.electorate_id, index, manifest),
    );
    mock.profileFor.mockImplementation(async (id) =>
      c.profileFor(id, catalogs),
    );
    const r = await render(<YourMP />);
    expect(text(r)).toContain('Grayndler, New South Wales');
    expect(has(r, 'your-member-anthony-albanese')).toBe(true);
    for (const row of ['votes', 'interests', 'pay'])
      expect(has(r, `your-profile-${row}`)).toBe(true);
    expect(has(r, 'your-senators')).toBe(true);
    // No Victorian section, so no authorisation line.
    expect(has(r, 'your-state')).toBe(false);
    expect(has(r, 'your-mp-end')).toBe(true);
    await act(async () => r.unmount());
  });

  test.each(['Grayndler', 'Ballarat'])(
    'Your MP links to grants in %s',
    async (name) => {
      const seat = seatNamed(name);
      choose(seat.electorate_id);
      mock.yourMP.mockResolvedValue(
        c.yourMPFor(seat.electorate_id, index, manifest),
      );
      mock.profileFor.mockImplementation(async (id) =>
        c.profileFor(id, catalogs),
      );
      const r = await render(<YourMP />);
      const link = r.root
        .findAllByType(LinkRow)
        .find((n) => n.props.testID === 'seat-grants-all');
      expect(link?.props.title).toBe(`Grants in ${name}`);
      expect(link?.props.href).toEqual(
        grantsRoute({ jur: 'federal', seat: name, state: seat.state_code }),
      );
      await act(async () => r.unmount());
    },
  );

  test('Lately loads the register with the profile and lists at most five records', async () => {
    const seat = seatNamed('Ballarat');
    choose(seat.electorate_id);
    mock.yourMP.mockResolvedValue(
      c.yourMPFor(seat.electorate_id, index, manifest),
    );
    withRegister();
    const r = await render(<YourMP />);
    expect(mock.profileFor).toHaveBeenLastCalledWith(
      seat.representatives[0]!.person_id,
      { includeInterests: true },
    );
    const rows = latest(r);
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.length).toBeLessThanOrEqual(5);
    expect(has(r, 'your-latest-source')).toBe(true);
    // Plain labels, never the register's keys.
    expect(text(r)).not.toContain('real_estate');
    expect(text(r)).not.toMatch(/\baddition\b/);
    // One heading for the section.
    expect(
      r.root.findAllByType(Text).filter((n) => n.props.children === 'Lately'),
    ).toHaveLength(1);
    await act(async () => r.unmount());
  });

  test('a vote in Lately opens its bill page at the division or the divisions section', async () => {
    const seat = seatNamed('Grayndler');
    choose(seat.electorate_id);
    mock.yourMP.mockResolvedValue(
      c.yourMPFor(seat.electorate_id, index, manifest),
    );
    mock.profileFor.mockImplementation(async (id) =>
      c.profileFor(id, catalogs),
    );
    const r = await render(<YourMP />);
    const bills = latest(r)
      .map((row) => row.href as { pathname: string; params: object })
      .filter((href) => href?.pathname === '/bill/[key]');
    expect(bills.length).toBeGreaterThan(0);
    for (const href of bills)
      expect(
        'division' in href.params ||
          (href.params as { section?: string }).section === 'divisions',
      ).toBe(true);
    // No vote split or score reads in Lately.
    expect(text(r)).not.toMatch(/\d+ ?(–|-|to) ?\d+/);
    await act(async () => r.unmount());
  });

  test('a saved state seat no longer in the release does not hold the others on a skeleton', async () => {
    const district = seatNamed('Wendouree');
    choose(district.electorate_id, ['fixture-removed-region']);
    const r = await render(<YourMP />);
    expect(has(r, 'your-state')).toBe(true);
    expect(ids(r, 'your-state-member-')).not.toHaveLength(0);
    await act(async () => r.unmount());
  });

  test('state electorate: add opens the Victorian chooser; removal keeps the federal choice', async () => {
    const seat = seatNamed('Ballarat'),
      district = seatNamed('Wendouree'),
      region = seatNamed('Northern Metropolitan');
    (saveChoice as jest.Mock).mockResolvedValue(undefined);
    mock.yourMP.mockImplementation(async (id, chosen) =>
      c.yourMPFor(id, index, manifest, chosen),
    );
    mock.profileFor.mockImplementation(async (id) =>
      c.profileFor(id, catalogs),
    );
    choose(seat.electorate_id);
    let r = await render(<YourMP />);
    expect(text(r)).toContain('Victorian Parliament');
    expect(
      r.root
        .findAllByType(LinkRow)
        .find((n) => n.props.testID === 'choose-state-seat')!.props.href,
    ).toEqual(seatRoute('vic'));
    await act(async () => r.unmount());

    resetSeatForTests();
    choose(seat.electorate_id, [district.electorate_id, region.electorate_id]);
    r = await render(<YourMP />);
    // The region row carries the same state menu, Remove last.
    const regionRow = r.root
      .findAllByType(LinkRow)
      .find((n) => n.props.testID === 'your-state-region')!;
    expect(menuItems(regionRow.props.menu).map((i) => i.title)).toEqual([
      'Change state electorate',
      'Remove state electorate',
    ]);
    const row = ids(r, 'your-state-member-')[0]!;
    const items = menuItems(row.props.menu);
    // Remove is the last item, in its own section.
    expect(items.at(-1)!.title).toBe('Remove state electorate');
    await act(async () => items.at(-1)!.onPress!());
    expect(saveChoice).toHaveBeenLastCalledWith({
      version: 1,
      seatId: seat.electorate_id,
      stateSeatIds: [],
    });
    await act(async () => r.unmount());
  });

  test('the bar menu: change, location, Ask, official page, Share, then Forget alone and the public site last', async () => {
    const seat = seatNamed('Grayndler');
    choose(seat.electorate_id);
    mock.yourMP.mockResolvedValue(
      c.yourMPFor(seat.electorate_id, index, manifest),
    );
    mock.profileFor.mockImplementation(async (id) =>
      c.profileFor(id, catalogs),
    );
    // The store publishes what is saved, as choice-store does.
    (saveChoice as jest.Mock).mockImplementation(async (choice) =>
      (subscribeChoice as jest.Mock).mock.calls.at(-1)?.[0](choice),
    );
    jest
      .mocked(forgetChoice)
      .mockImplementation(async () =>
        (subscribeChoice as jest.Mock).mock.calls.at(-1)?.[0](null),
      );
    const sheet = jest
      .spyOn(ActionSheetIOS, 'showActionSheetWithOptions')
      .mockImplementation((_options, done) => done(0));
    mockOptions.length = 0;
    const r = await render(<YourMP />);
    type Row = {
      type: string;
      label: string;
      inline?: boolean;
      destructive?: boolean;
      items?: Row[];
      onPress?: () => void;
    };
    const header = mockOptions
      .filter((o) => o.unstable_headerRightItems)
      .at(-1)!.unstable_headerRightItems as () => {
      type: string;
      menu?: { items: Row[] };
    }[];
    const rows = header().find((i) => i.type === 'menu')!.menu!.items;
    const name = 'Anthony Albanese';
    const person = people.people.find(
      (p) => p.person_id === seat.representatives[0]!.person_id,
    );
    const official = officialPageFor(person?.source_url, 'federal');
    expect(rows.map((row) => row.label)).toEqual([
      'Change electorate',
      'Use my location',
      `Ask about ${name}`,
      ...(official ? ['Parliament of Australia page'] : []),
      ...(canShare ? ['Share'] : []),
      '',
      menuTitle('Open on opax.com.au'),
    ]);
    const last = rows.find(
      (row) =>
        row.type === 'submenu' &&
        row.items?.some((item) => item.label === 'Forget my electorate'),
    )!;
    expect(last).toMatchObject({ type: 'submenu', inline: true });
    expect(last.items!.map((i) => [i.label, i.destructive])).toEqual([
      ['Forget my electorate', true],
    ]);
    await act(async () =>
      rows.find((row) => row.label === `Ask about ${name}`)!.onPress!(),
    );
    expect(mockOpenAsk).toHaveBeenCalledTimes(1);
    expect(mockOpenAsk).toHaveBeenCalledWith({
      question: `What has ${name} said in parliament this year?`,
      speaker: name,
      kind: 'speech',
    });
    expect(has(r, 'your-member-anthony-albanese')).toBe(true);
    await act(async () => last.items![0]!.onPress!());
    expect(sheet).toHaveBeenCalledTimes(1);
    expect(sheet.mock.calls[0]![0]).toMatchObject({
      title: 'Forget your electorate?',
      message: 'Today and Your MP stop showing your representatives.',
      options: ['Forget', 'Cancel'],
      destructiveButtonIndex: 0,
      cancelButtonIndex: 1,
    });
    expect(has(r, 'your-invitation')).toBe(true);
    expect(ids(r, 'your-member-')).toHaveLength(0);
    sheet.mockRestore();
    await act(async () => r.unmount());
  });

  test('Android keeps the forget consequence and waits for confirmation before clearing the seat', async () => {
    const platform = Object.getOwnPropertyDescriptor(Platform, 'OS')!;
    Object.defineProperty(Platform, 'OS', {
      configurable: true,
      value: 'android',
    });
    const confirm = jest
      .spyOn(menus, 'confirmAction')
      .mockImplementation(() => {});
    const seat = seatNamed('Grayndler');
    choose(seat.electorate_id);
    mock.yourMP.mockResolvedValue(
      c.yourMPFor(seat.electorate_id, index, manifest),
    );
    mock.profileFor.mockImplementation(async (id) =>
      c.profileFor(id, catalogs),
    );
    jest
      .mocked(forgetChoice)
      .mockImplementation(async () =>
        (subscribeChoice as jest.Mock).mock.calls.at(-1)?.[0](null),
      );
    let r: TestRenderer.ReactTestRenderer | undefined;
    try {
      r = await render(<YourMP />);
      type Menu = {
        type: string;
        menu?: { items: { items?: { onPress: () => void }[] }[] };
      };
      const header = mockOptions
        .filter((o) => o.unstable_headerRightItems)
        .at(-1)!.unstable_headerRightItems as () => Menu[];
      const forget = header()
        .find((item) => item.type === 'menu')!
        .menu!.items.find(
          (row) =>
            row.type === 'submenu' &&
            row.items?.some((item) => item.label === 'Forget my electorate'),
        )!.items![0]!;
      act(() => forget.onPress());
      expect(confirm).toHaveBeenCalledWith(
        'Forget your electorate?',
        [
          expect.objectContaining({
            title: 'Forget',
            destructive: true,
            onPress: expect.any(Function),
          }),
        ],
        undefined,
        'Today and Your MP stop showing your representatives.',
      );
      expect(forgetChoice).not.toHaveBeenCalled();
      expect(has(r, 'your-member-anthony-albanese')).toBe(true);
      await act(async () => confirm.mock.calls[0]![1][0]!.onPress());
      expect(forgetChoice).toHaveBeenCalledTimes(1);
      expect(has(r, 'your-invitation')).toBe(true);
    } finally {
      if (r) await act(async () => r!.unmount());
      confirm.mockRestore();
      Object.defineProperty(Platform, 'OS', platform);
    }
  });

  test('Forget waits for a state removal still being written', async () => {
    const seat = seatNamed('Ballarat'),
      district = seatNamed('Wendouree');
    mock.yourMP.mockImplementation(async (id, chosen) =>
      c.yourMPFor(id, index, manifest, chosen),
    );
    mock.profileFor.mockImplementation(async (id) =>
      c.profileFor(id, catalogs),
    );
    let written!: () => void;
    (saveChoice as jest.Mock).mockImplementation(
      () => new Promise<void>((resolve) => (written = resolve)),
    );
    jest.mocked(forgetChoice).mockClear();
    const sheet = jest
      .spyOn(ActionSheetIOS, 'showActionSheetWithOptions')
      .mockImplementation((_options, done) => done(0));
    choose(seat.electorate_id, [district.electorate_id]);
    mockOptions.length = 0;
    const r = await render(<YourMP />);
    const row = ids(r, 'your-state-member-')[0]!;
    await act(async () => menuItems(row.props.menu).at(-1)!.onPress!());
    expect(saveChoice).toHaveBeenCalledTimes(1);
    type Row = { type: string; items?: Row[]; onPress?: () => void };
    const header = mockOptions
      .filter((o) => o.unstable_headerRightItems)
      .at(-1)!.unstable_headerRightItems as () => {
      type: string;
      menu?: { items: Row[] };
    }[];
    const rows = header().find((i) => i.type === 'menu')!.menu!.items;
    await act(async () =>
      rows.find(
        (row) =>
          row.type === 'submenu' &&
          row.items?.some((item) => item.label === 'Forget my electorate'),
      )!.items![0]!.onPress!(),
    );
    // The forget is queued behind the removal, so it lands last.
    expect(forgetChoice).not.toHaveBeenCalled();
    await act(async () => written());
    expect(forgetChoice).toHaveBeenCalledTimes(1);
    sheet.mockRestore();
    await act(async () => r.unmount());
  });

  test('a skeleton while the seat loads, then an error, never the chooser', async () => {
    let fail!: (e: Error) => void;
    (loadChoice as jest.Mock).mockResolvedValue(null);
    mock.directory.mockImplementationOnce(
      () =>
        new Promise((_, reject) => {
          fail = reject;
        }),
    );
    const r = await render(<YourMP />);
    expect(
      r.root.findAllByProps({ label: 'Loading your MP' }).length,
    ).toBeGreaterThan(0);
    expect(has(r, 'your-invitation')).toBe(false);
    await act(async () => fail(new Error('Offline')));
    expect(has(r, 'your-mp-error')).toBe(true);
    expect(has(r, 'seat-search')).toBe(false);
    // Try again reads the directory again; the page recovers.
    const error = r.root.find(
      (n) => n.props.testID === 'your-mp-error' && !!n.props.onRetry,
    );
    await act(async () => error.props.onRetry());
    expect(has(r, 'your-mp-error')).toBe(false);
    expect(has(r, 'your-invitation')).toBe(true);
    await act(async () => r.unmount());
  });
});

test.each(['vote', 'division'] as const)(
  'a Lately %s without a bill route has an external accessory and opens the original',
  async (kind) => {
    let r!: TestRenderer.ReactTestRenderer;
    const record: LatestRecord = {
      key: 'combined-vote',
      kind,
      title: 'Two bills',
      date: '2026-06-04',
      action: 'Voted for',
      detail: 'Second reading',
      url: 'https://example.test/division',
    };
    const open = jest.spyOn(external, 'openSource').mockResolvedValue();
    await act(async () => {
      r = TestRenderer.create(
        <LatestVoteRow record={record} testID="latest-external" />,
      );
    });
    try {
      const icons = r.root.findAllByType(Icon).map((node) => node.props.name);
      expect(icons).toContain('arrow.up.right.square');
      expect(icons).not.toContain('chevron.right');
      const row = r.root.find(
        (n) =>
          typeof n.type === 'string' && n.props.testID === 'latest-external',
      );
      expect(row.props.accessibilityHint).toBe('Opens in the in-app browser');
      await act(async () =>
        r.root.findByType(Link).props.onPress!({
          preventDefault: jest.fn(),
        } as never),
      );
      expect(open).toHaveBeenCalledWith(record.url, record.title);
      open.mockClear();
      await act(async () => r.root.findByType(RowLink).props.select());
      expect(open).toHaveBeenCalledWith(record.url, record.title);
    } finally {
      open.mockRestore();
      await act(async () => r.unmount());
    }
  },
);

test('sharing or copying a Lately original sends opax_share as an "other" record, never its link', async () => {
  let r!: TestRenderer.ReactTestRenderer;
  const record: LatestRecord = {
    key: 'external-vote',
    kind: 'vote',
    title: 'Jane Citizen on the Example Bill 2031',
    date: '2026-06-04',
    action: 'Voted for',
    detail: 'Second reading',
    // Another site's /bill/ path is still not an OPAX bill.
    url: 'https://example.test/bill/example-2031',
  };
  const share = jest.spyOn(Share, 'share').mockResolvedValue({
    action: 'sharedAction',
  });
  const copy = jest.spyOn(recordActions, 'copyText').mockResolvedValue(true);
  jest.mocked(track).mockClear();
  await act(async () => {
    r = TestRenderer.create(
      <LatestVoteRow record={record} testID="latest-external" />,
    );
  });
  try {
    const item = (title: string) =>
      (
        r.root.findByType(RowLink).props.menu as {
          title: string;
          onPress: () => void;
        }[]
      ).find((m) => m.title === title)!;
    await act(async () => item('Share').onPress());
    expect(share).toHaveBeenCalledTimes(1);
    await act(async () => item('Copy link').onPress());
    expect(copy).toHaveBeenCalledWith(record.url);
    expect(jest.mocked(track).mock.calls).toEqual([
      ['opax_share', { kind: 'record', record_type: 'other' }],
      ['opax_share', { kind: 'copy_link', record_type: 'other' }],
    ]);
    // A copy that fails sends nothing.
    copy.mockResolvedValueOnce(false);
    await act(async () => item('Copy link').onPress());
    expect(track).toHaveBeenCalledTimes(2);
    expect(JSON.stringify(jest.mocked(track).mock.calls)).not.toMatch(
      /example|Jane|2031/,
    );
  } finally {
    share.mockRestore();
    copy.mockRestore();
    await act(async () => r.unmount());
  }
});
