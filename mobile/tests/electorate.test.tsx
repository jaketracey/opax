import { act, type ReactElement } from 'react';
import TestRenderer from 'react-test-renderer';
import { catalogs as runtime } from '../src/api/runtime';
import * as c from '../src/api/catalogs';
import { ApiError } from '../src/api/errors';
import { index, manifest, people, roster, slugs, pinned } from './pinned';
import Electorate, { identityLine } from '../src/features/Electorate';
import Election from '../src/features/your-mp/Election';
import { chooseElectorateDate } from '../src/features/directories/ElectorateDateSheet';
import { termSpan } from '../src/features/directories/ElectorateHistory';
import { sinceLine } from '../src/features/your-mp/RepresentativeRows';
import { loadChoice } from '../src/features/your-mp/choice-store';
import { resetSeatForTests } from '../src/features/your-mp/useSeat';

jest.mock('../src/api/runtime', () => ({
  portraits: { get: jest.fn(async () => null) },
  catalogs: { directory: jest.fn(), electorateFor: jest.fn() },
}));
jest.mock('../src/features/your-mp/choice-store', () => ({
  loadChoice: jest.fn(async () => null),
  saveChoice: jest.fn(),
  subscribeChoice: jest.fn(() => () => undefined),
}));
const mockFollow = { follows: [] as unknown[], states: new Map() };
jest.mock('../src/features/follows/useFollowStates', () => ({
  useFollowStates: () => mockFollow,
}));
jest.mock('../src/features/follows/AddedSinceGroup', () => ({
  AddedSinceGroup: (props: { testID: string }) => {
    const { View } = jest.requireActual('react-native');
    return <View testID={props.testID} />;
  },
}));
const mockOpenAsk = jest.fn();
jest.mock('../src/features/ask/open', () => ({
  useOpenAsk: () => mockOpenAsk,
}));
const mockParams: Record<string, string | undefined> = {};
const mockOptions: Record<string, unknown>[] = [];
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
const seat = (name: string, jurisdiction = 'federal') =>
  index.electorates.find(
    (s) => s.name === name && s.jurisdiction === jurisdiction,
  )!;
function load(name: string, jurisdiction?: string) {
  const s = seat(name, jurisdiction);
  mock.electorateFor.mockResolvedValue(
    result(c.electorateFor(c.decodeElectorate(pinned(s.detail_url)))),
  );
  mockParams.id = s.electorate_id;
}
async function render(element: ReactElement) {
  let r!: TestRenderer.ReactTestRenderer;
  await act(async () => {
    r = TestRenderer.create(element);
  });
  return r;
}
const text = (r: TestRenderer.ReactTestRenderer) =>
  r.root
    .findAll((n) => n.type === 'Text')
    .flatMap((n) => n.props.children)
    .filter((v) => typeof v === 'string')
    .join(' ')
    .replace(/\s+/g, ' ');
const unavailable = (r: TestRenderer.ReactTestRenderer, id: string) =>
  r.root.findAll((n) => n.props.testID === id && !!n.props.title)[0]?.props
    .title as string | undefined;
const has = (r: TestRenderer.ReactTestRenderer, id: string) =>
  r.root.findAll((n) => n.props.testID === id).length > 0;
const order = (r: TestRenderer.ReactTestRenderer, ids: string[]) => {
  const seen: string[] = [];
  r.root.findAll((n) => {
    const id = n.props.testID as string | undefined;
    if (id && ids.includes(id) && !seen.includes(id)) seen.push(id);
    return false;
  });
  return seen;
};
const menuItems = () => {
  const withItems = mockOptions
    .filter((o) => o.unstable_headerRightItems)
    .at(-1)!;
  const items = (
    withItems.unstable_headerRightItems as () => {
      type: string;
      label: string;
      menu?: { items: { label: string; onPress: () => void }[] };
    }[]
  )();
  return items;
};

beforeEach(() => {
  jest.clearAllMocks();
  resetSeatForTests();
  mockOptions.length = 0;
  mockFollow.follows = [];
  mockFollow.states = new Map();
  for (const key of Object.keys(mockParams)) delete mockParams[key];
  mock.directory.mockResolvedValue(directory as never);
});

test('Grayndler reads in the stated order with no pipeline words', async () => {
  load('Grayndler');
  const r = await render(<Electorate />);
  expect(
    order(r, [
      'electorate-name',
      'electorate-follow',
      'electorate-members',
      'electorate-elections',
      'electorate-census',
      'electorate-end',
    ]),
  ).toEqual([
    'electorate-name',
    'electorate-follow',
    'electorate-members',
    'electorate-elections',
    'electorate-census',
    'electorate-end',
  ]);
  const words = text(r);
  expect(words).toContain('House of Representatives, New South Wales');
  expect(words.match(/House of Representatives/g)).toHaveLength(1);
  expect(words).toContain('Since 2 Mar 1996');
  expect(words).toContain('2025 federal election');
  expect(words).toContain('Census 2021');
  expect(words).toContain(
    'Not adjusted for boundary changes since the Census.',
  );
  expect(words).toContain('Past members');
  for (const banned of [
    'verified',
    'release',
    'observation',
    'service periods',
    'Latest check',
    'Start precision',
    'general',
    'by_election',
    'Related constituencies',
    'Local context',
  ])
    expect(words).not.toContain(banned);
  expect(has(r, 'electorate-region')).toBe(false);
  expect(has(r, 'electorate-authorisation')).toBe(false);
  expect(has(r, 'election-expand-0')).toBe(false);
  expect(has(r, 'electorate-representatives-source')).toBe(true);
  expect(has(r, 'electorate-added-since')).toBe(false);
  await act(async () => r.unmount());
});

test('election rows push the election screen, newest first', async () => {
  load('Grayndler');
  const r = await render(<Electorate />);
  // On iOS the row is a Link trigger: the link carries the route.
  const links = r.root.findAll(
    (n) => n.props.href?.pathname === '/election' && n.props.asChild,
  );
  expect(links.length).toBeGreaterThan(0);
  expect(links[0]!.props.href.params.seat).toBe(
    seat('Grayndler').electorate_id,
  );
  const firstRow = r.root.find(
    (n) => typeof n.type === 'string' && n.props.testID === 'election-row-0',
  );
  expect(firstRow.findAll((n) => n === links[0])).toHaveLength(1);
  expect(has(r, 'election-expand-0')).toBe(false);
  await act(async () => r.unmount());
});

test('the bar menu: no Set as my electorate is ever disabled; Ask drafts without sending', async () => {
  load('Grayndler');
  const r = await render(<Electorate />);
  const items = menuItems();
  const menu = items.find((i) => i.type === 'menu')!;
  const labels = menu.menu!.items.map((i) => i.label);
  expect(labels).toEqual([
    'Set Grayndler as my electorate',
    'View on a date',
    'Ask about Grayndler',
    'Copy link',
    'Open on opax.com.au',
  ]);
  await act(async () =>
    menu.menu!.items.find((i) => i.label === 'Ask about Grayndler')!.onPress(),
  );
  expect(mockOpenAsk).toHaveBeenCalledWith({
    question: 'What has parliament said about Grayndler?',
  });
  await act(async () => r.unmount());
});

test("no Set as my electorate when it is already the reader's seat", async () => {
  load('Grayndler');
  (loadChoice as jest.Mock).mockResolvedValueOnce({
    version: 1,
    seatId: seat('Grayndler').electorate_id,
    stateSeatIds: [],
  });
  const r = await render(<Electorate />);
  const menu = menuItems().find((i) => i.type === 'menu')!;
  expect(menu.menu!.items.map((i) => i.label)).toEqual([
    'View on a date',
    'Ask about Grayndler',
    'Copy link',
    'Open on opax.com.au',
  ]);
  // No disabled item anywhere in the menu.
  expect(
    menu.menu!.items.filter((i) => (i as { disabled?: boolean }).disabled),
  ).toEqual([]);
  await act(async () => r.unmount());
});

test('a chosen date shows the members on that date and Back to today', async () => {
  load('Grayndler');
  const r = await render(<Electorate />);
  await act(async () =>
    chooseElectorateDate(seat('Grayndler').electorate_id, '1994-06-01'),
  );
  expect(text(r)).toContain('Member on 1 June 1994');
  expect(has(r, 'electorate-date-latest')).toBe(true);
  const back = r.root.findAll(
    (n) =>
      n.props.testID === 'electorate-date-latest' &&
      typeof n.props.onPress === 'function',
  )[0]!;
  await act(async () => back.props.onPress());
  expect(text(r)).not.toContain('Member on');
  await act(async () => r.unmount());
});

test('a changed followed electorate shows its Added since group after the title block', async () => {
  load('Grayndler');
  const id = seat('Grayndler').electorate_id;
  const follow = { kind: 'electorate', id, title: 'Grayndler', followedAt: 1 };
  mockFollow.follows = [follow];
  mockFollow.states = new Map([
    [
      `electorate:${id}`,
      {
        status: 'ready',
        title: 'Grayndler',
        current: {},
        keys: [],
        changes: [
          {
            marker: 'election',
            text: 'Election result added',
            citation: 'AEC',
            asAt: '2025-05-03',
          },
        ],
      },
    ],
  ]);
  const r = await render(<Electorate />);
  expect(
    order(r, [
      'electorate-follow',
      'electorate-added-since',
      'electorate-members',
    ]),
  ).toEqual([
    'electorate-follow',
    'electorate-added-since',
    'electorate-members',
  ]);
  await act(async () => r.unmount());
});

test('a followed electorate with no change draws no Added since group', async () => {
  load('Grayndler');
  const id = seat('Grayndler').electorate_id;
  mockFollow.follows = [
    { kind: 'electorate', id, title: 'Grayndler', followedAt: 1 },
  ];
  mockFollow.states = new Map([
    [
      `electorate:${id}`,
      {
        status: 'ready',
        title: 'Grayndler',
        current: {},
        keys: [],
        changes: [],
      },
    ],
  ]);
  const r = await render(<Electorate />);
  expect(has(r, 'electorate-follow')).toBe(true);
  expect(has(r, 'electorate-added-since')).toBe(false);
  await act(async () => r.unmount());
});

test('a Victorian district shows its region row and the authorisation foot, and no grants', async () => {
  load('Richmond', 'vic');
  const r = await render(<Electorate />);
  expect(text(r)).toContain('Legislative Assembly district, Victoria');
  expect(text(r)).toContain('In Northern Metropolitan');
  expect(has(r, 'electorate-authorisation')).toBe(true);
  expect(has(r, 'seat-grants')).toBe(false);
  const labels = menuItems()
    .find((i) => i.type === 'menu')!
    .menu!.items.map((i) => i.label);
  expect(labels).not.toContain('Set Richmond as my electorate');
  await act(async () => r.unmount());
});

test('a Senate seat lists six members then one face-stack row to the members list', async () => {
  load('New South Wales');
  const r = await render(<Electorate />);
  expect(text(r)).toContain('Senate, New South Wales');
  expect(has(r, 'electorate-members-all')).toBe(true);
  expect(text(r)).toContain('Members');
  await act(async () => r.unmount());
});

test('not found and failure states', async () => {
  mockParams.id = 'el_000000000000000000000000';
  let r = await render(<Electorate />);
  expect(unavailable(r, 'electorate-error')).toBe(
    "We couldn't find this electorate.",
  );
  await act(async () => r.unmount());
  mockParams.id = seat('Grayndler').electorate_id;
  mock.electorateFor.mockRejectedValue(new ApiError('http', 'nope'));
  r = await render(<Electorate />);
  expect(unavailable(r, 'electorate-error')).toBe(
    "This electorate couldn't be loaded.",
  );
  expect(has(r, 'electorate-retry')).toBe(true);
  await act(async () => r.unmount());
});

test('loading draws a skeleton, never empty copy', async () => {
  load('Grayndler');
  mock.directory.mockReturnValue(new Promise(() => undefined) as never);
  const r = await render(<Electorate />);
  expect(has(r, 'electorate-loading')).toBe(true);
  expect(text(r)).not.toMatch(/No member|couldn't/);
  await act(async () => r.unmount());
});

test('the election screen orders candidates and marks the winner Elected', async () => {
  load('Grayndler');
  const detail = c.decodeElectorate(pinned(seat('Grayndler').detail_url));
  const newest = [...detail.elections].sort((a, b) =>
    b.election.poll_date.localeCompare(a.election.poll_date),
  )[0]!;
  mockParams.seat = seat('Grayndler').electorate_id;
  mockParams.key = newest.election_id;
  const r = await render(<Election />);
  const words = text(r);
  expect(words).toContain('2025 federal election');
  expect(words).toContain('Grayndler, 3 May 2025');
  expect(words).toContain('First preferences');
  expect(has(r, 'election-candidate-0-elected')).toBe(true);
  expect(has(r, 'election-source')).toBe(true);
  mockParams.key = 'missing';
  await act(async () => r.unmount());
  const missing = await render(<Election />);
  expect(unavailable(missing, 'election-missing')).toBe(
    "This election couldn't be found.",
  );
  await act(async () => missing.unmount());
});

test('dates at their stated precision', () => {
  expect(
    termSpan({
      start: '1993-03-13',
      start_precision: 'day',
      end: '1996-01-29',
      end_precision: 'day',
    }),
  ).toBe('13 Mar 1993 to 29 Jan 1996');
  expect(
    termSpan({
      start: '1993-01-01',
      start_precision: 'year',
      end: '1996-01-29',
      end_precision: 'day',
    }),
  ).toBe('From 1993 to 29 Jan 1996');
  const terms = [
    {
      person_id: 'p',
      start: '1996-03-02',
      start_precision: 'day',
      end: null,
      end_precision: 'open',
    },
  ];
  expect(sinceLine(terms, 'p')).toBe('Since 2 Mar 1996');
  expect(
    sinceLine([{ ...terms[0]!, start_precision: 'approximate' }], 'p'),
  ).toBeNull();
  expect(
    identityLine({ chamber: 'vic_lc', jurisdiction: 'vic', state: 'vic' }),
  ).toBe('Legislative Council region, Victoria');
});
