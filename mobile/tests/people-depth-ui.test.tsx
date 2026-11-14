import { withNavigationOptions } from './navigation-options';
import { router } from 'expo-router';
import { act } from 'react';
import { Text as NativeText } from 'react-native';
import TestRenderer from 'react-test-renderer';
import { decodeExpenseCategories } from '../src/api/catalog-decoders';
import type { PersonProfile } from '../src/api/person-identity';
import { catalogs, peopleDepth } from '../src/api/runtime';
import { BarSeries } from '../src/design/charts';
import { SegmentedPicker } from '../src/design/controls';
import { LinkRow } from '../src/design/rows';
import ExpenseGlossary, {
  categoryKey,
} from '../src/features/people/ExpenseGlossary';
import {
  decodeAccess,
  decodeFunding,
  receiptsSeries,
} from '../src/features/people/model';
import {
  PartyAccess,
  PartyDebts,
  PartyReturns,
  usePartyFunding,
} from '../src/features/people/PartyDepth';
import {
  MoreFromRecord,
  PersonDiary,
  Topics,
  openRecord,
} from '../src/features/people/Sections';
import { recordListRoute } from '../src/navigation/routes';
import { sheetPayload } from '../src/navigation/sheets';
import { pinned } from './pinned';
const mockParams: Record<string, string | undefined> = {};
const mockOptions: { current?: Record<string, unknown> } = {};
jest.mock('@shopify/react-native-skia', () => ({
  // eslint-disable-next-line @typescript-eslint/no-require-imports -- inert host view
  Canvas: require('react-native').View,
  // eslint-disable-next-line @typescript-eslint/no-require-imports -- inert host element
  Rect: (props: object) => require('react').createElement('Rect', props),
}));
jest.mock('expo-router', () => ({
  useIsPreview: () => false,
  Link: Object.assign(({ children }: { children?: unknown }) => children, {
    Trigger: ({ children }: { children?: unknown }) => children,
    Preview: () => null,
    Menu: () => null,
    MenuAction: () => null,
  }),
  router: { push: jest.fn() },
  useLocalSearchParams: () => mockParams,
  Stack: {
    Screen: ({ options }: { options?: Record<string, unknown> }) => {
      mockOptions.current = options;
      return null;
    },
  },
}));
jest.mock('../src/api/runtime', () => ({
  catalogs: { expenseCategories: jest.fn() },
  peopleDepth: {
    access: jest.fn(),
    funding: jest.fn(),
    topics: jest.fn(),
    speeches: jest.fn(),
    mentions: jest.fn(),
    news: jest.fn(),
  },
}));
jest.mock('../src/navigation/external', () => ({
  openOnWeb: jest.fn(),
  openSource: jest.fn(),
  sourceUrl: (s: string) => s,
}));
const result = <T,>(data: T) => ({
  data,
  stale: false,
  savedAt: 1,
  asOf: '2026-09-21',
});
const access = decodeAccess(pinned('/access.json')),
  funding = decodeFunding(pinned('/graph/aec-extras.json'));
async function render(node: React.ReactNode) {
  let r!: TestRenderer.ReactTestRenderer;
  await act(async () => {
    r = TestRenderer.create(
      withNavigationOptions(node, (options) => {
        mockOptions.current = options;
      }),
    );
  });
  return r;
}
const words = (r: TestRenderer.ReactTestRenderer) =>
  r.root
    .findAllByType(NativeText)
    .map((n) => String(n.props.children))
    .join(' ');
beforeEach(() => {
  jest.clearAllMocks();
  for (const key of Object.keys(mockParams)) delete mockParams[key];
  jest.mocked(peopleDepth.access).mockResolvedValue(result(access));
  jest.mocked(peopleDepth.funding).mockResolvedValue(result(funding));
});
const ids = (r: TestRenderer.ReactTestRenderer) =>
  r.root
    .findAll((n) => typeof n.props?.testID === 'string')
    .map((n) => n.props.testID as string);
const row = (r: TestRenderer.ReactTestRenderer, testID: string) =>
  r.root.findAllByType(LinkRow).find((n) => n.props.testID === testID);

type Era = { from: number; to: number; share: number };
function topics(eras: { all: Era; then: Era; now: Era }) {
  const era = (label: string, e: Era) => ({
    label,
    from: e.from,
    to: e.to,
    labelled: 10,
    topics: [{ slug: 'housing', count: e.share * 10, share: e.share }],
  });
  return {
    person: result({
      name: 'Fixture Member',
      indexed: 30,
      profiles: {
        all: era('All years', eras.all),
        then: era('Then', eras.then),
        now: era('Now', eras.now),
      },
      coverage: undefined,
    }),
    baseline: result({
      labelled: 20,
      topics: [{ slug: 'housing', count: 10 }],
    }),
  };
}

test('More from the record: Topics inline, then rows that push the record lists; nothing else loads in place', async () => {
  jest.mocked(peopleDepth.topics).mockResolvedValue(
    topics({
      all: { from: 2010, to: 2026, share: 0.5 },
      then: { from: 2010, to: 2019, share: 0.2 },
      now: { from: 2020, to: 2026, share: 0.8 },
    }),
  );
  const r = await render(
    <>
      <MoreFromRecord
        subject={{ person: 'anthony-albanese', name: 'Anthony Albanese' }}
        kinds={['mentions']}
        topics
        testID="person-more"
      />
      <MoreFromRecord
        subject={{ party: 'labor', name: 'Labor' }}
        kinds={['mentions']}
        testID="party-more"
      />
    </>,
  );
  // One section each, never a section per row (pass 5, P2-1).
  expect(words(r).match(/More from the record/g)).toHaveLength(2);
  expect(peopleDepth.topics).toHaveBeenCalledTimes(1);
  expect(peopleDepth.topics).toHaveBeenCalledWith(
    'Anthony Albanese',
    expect.any(AbortSignal),
  );
  for (const fn of [
    peopleDepth.speeches,
    peopleDepth.mentions,
    peopleDepth.news,
  ])
    expect(fn).not.toHaveBeenCalled();
  expect(words(r)).toContain('Housing');
  expect(row(r, 'person-mentions')!.props.href).toEqual(
    recordListRoute(
      { person: 'anthony-albanese', kind: 'mentions' },
      'Anthony Albanese',
    ),
  );
  expect(row(r, 'party-mentions')!.props.href).toEqual(
    recordListRoute({ party: 'labor', kind: 'mentions' }, 'Labor'),
  );
  expect(row(r, 'person-mentions')!.props.title).toBe('Mentions in parliament');
  // News ships only with a stated selection rule: no row (people.md 2.1).
  expect(row(r, 'person-news')).toBeUndefined();
  // The party has no Topics.
  expect(
    r.root.findAll(
      (n) => n.props?.testID === 'person-topics' && typeof n.type === 'string',
    ),
  ).toHaveLength(1);
  // Nothing on the old in-place pattern survives.
  expect(words(r)).not.toMatch(/\bShow (topics|speeches|news|mentions)\b/);
  expect(ids(r).some((id) => id.endsWith('-toggle'))).toBe(false);
  await act(async () => r.unmount());
});

test('a failed Topics read draws its own Try again, which reads Topics again', async () => {
  jest
    .mocked(peopleDepth.topics)
    .mockRejectedValueOnce(new Error('offline'))
    .mockResolvedValueOnce(
      topics({
        all: { from: 2010, to: 2026, share: 0.5 },
        then: { from: 2010, to: 2019, share: 0.2 },
        now: { from: 2020, to: 2026, share: 0.8 },
      }),
    );
  const r = await render(<Topics name="Fixture Member" />);
  expect(ids(r)).toContain('person-topics-error');
  expect(words(r)).toContain('Topics couldn’t be loaded.');
  await act(async () => {
    r.root
      .find((n) => n.props?.testID === 'person-topics-error')
      .find(
        (n) =>
          typeof n.props?.onPress === 'function' &&
          n.props.accessibilityRole === 'button',
      )
      .props.onPress();
  });
  expect(peopleDepth.topics).toHaveBeenCalledTimes(2);
  expect(words(r)).toContain('Housing');
  await act(async () => r.unmount());
});

test('the Topics era switch is labelled from the data’s bounds and switches without another request', async () => {
  jest.mocked(peopleDepth.topics).mockResolvedValue(
    topics({
      all: { from: 2010, to: 2026, share: 0.5 },
      then: { from: 2010, to: 2019, share: 0.2 },
      now: { from: 2020, to: 2026, share: 0.8 },
    }),
  );
  const r = await render(<Topics name="Fixture Member" />);
  const picker = r.root.findByType(SegmentedPicker);
  expect(
    (picker.props.options as { label: string }[]).map((o) => o.label),
  ).toEqual(['All', '2010 to 2019', 'Since 2020']);
  expect(words(r)).toContain('50%');
  await act(async () => picker.props.onChange('now'));
  expect(words(r)).toContain('80%');
  await act(async () => picker.props.onChange('then'));
  expect(words(r)).toContain('20%');
  expect(peopleDepth.topics).toHaveBeenCalledTimes(1);
  // "Then", "Now" and "labelled speeches so far" are gone.
  expect(words(r)).not.toMatch(/\bThen\b|\bNow\b|so far/);
  await act(async () => r.unmount());
});

test('without era bounds Topics draws no switch', async () => {
  jest.mocked(peopleDepth.topics).mockResolvedValue(
    topics({
      all: { from: 0, to: 0, share: 0.5 },
      then: { from: 0, to: 0, share: 0.2 },
      now: { from: 0, to: 0, share: 0.8 },
    }),
  );
  const r = await render(<Topics name="Fixture Member" />);
  expect(r.root.findAllByType(SegmentedPicker)).toHaveLength(0);
  expect(words(r)).toContain('Housing');
  await act(async () => r.unmount());
});

const identity = (name: string, jurisdiction: string) =>
  ({
    slug: 'fixture',
    name,
    seats: [{ jurisdiction }],
    rosterRow: undefined,
  }) as unknown as PersonProfile;

test('the ministerial diary is drawn only for a member it covers', async () => {
  const federal = await render(
    <PersonDiary identity={identity('Fixture Member', 'federal')} />,
  );
  expect(federal.toJSON()).toBeNull();
  expect(peopleDepth.access).not.toHaveBeenCalled();
  await act(async () => federal.unmount());

  const [, minister] = Object.entries(access.ministers).find(
    ([, m]) => m.jurisdiction === 'nsw' || m.jurisdiction === 'qld',
  )!;
  const covered = await render(
    <PersonDiary identity={identity(minister.name, minister.jurisdiction)} />,
  );
  expect(ids(covered)).toContain('person-diary');
  expect(words(covered)).toContain('Meetings disclosed');
  expect(ids(covered)).toContain('person-diary-source');
  await act(async () => covered.unmount());

  // Eligible but not in the diary: the section collapses after its read.
  const absent = await render(
    <PersonDiary identity={identity('Nobody Fixture', 'nsw')} />,
  );
  expect(ids(absent)).not.toContain('person-diary');
  await act(async () => absent.unmount());

  jest.mocked(peopleDepth.access).mockRejectedValueOnce(new Error('offline'));
  const failed = await render(
    <PersonDiary identity={identity('Nobody Fixture', 'qld')} />,
  );
  expect(ids(failed)).toContain('person-diary-error');
  expect(words(failed)).toContain('Ministerial diary couldn’t be loaded.');
  await act(async () => failed.unmount());
});

function Funding({ name }: { name: string }) {
  const { read } = usePartyFunding();
  return read.status === 'ready' ? (
    <>
      <PartyReturns record={read.value} name={name} />
      <PartyDebts record={read.value} name={name} />
    </>
  ) : null;
}
test('meetings, attendees, lobbying firms and creditors remain plain text; the chart holds every return year', async () => {
  const r = await render(
    <>
      <PartyAccess name="Labor" />
      <Funding name="Labor" />
    </>,
  );
  // Empty halves collapse: no "no meetings" sentence is drawn.
  expect(words(r)).not.toContain('No disclosed meetings match');
  expect(words(r)).toContain('Message4U Pty Ltd');
  const years = receiptsSeries(funding.parties.Labor!.returns);
  const chart = r.root.findByType(BarSeries);
  expect(chart.props.data).toHaveLength(years.length);
  expect(chart.props.data[0].label).toBe('1998–99');
  expect(
    r.root.findAll((n) => n.props?.testID === 'party-returns-latest').length,
  ).toBeGreaterThan(0);
  expect(
    r.root.findAll(
      (n) =>
        n.props?.accessibilityLabel?.includes('Message4U') &&
        typeof n.props.onPress === 'function',
    ),
  ).toHaveLength(0);
  await act(async () => r.unmount());
});
test('Expense categories: one name, Done only, definitions and notes, the originals in one source sheet', async () => {
  const data = decodeExpenseCategories(pinned('/expense-categories.json'));
  jest.mocked(catalogs.expenseCategories).mockResolvedValue(result(data));
  const r = await render(<ExpenseGlossary />);
  expect(mockOptions.current?.title).toBe('Expense categories');
  const output = words(r);
  expect(output).not.toMatch(/glossary/i);
  for (const c of data.categories) {
    expect(output).toContain(c.text);
    if (c.note) expect(output).toContain(c.note);
    expect(ids(r)).toContain(`expense-category-${categoryKey(c.name)}`);
  }
  for (const g of data.groups) if (g.blurb) expect(output).toContain(g.blurb);
  // Nothing names a member when the sheet is opened on its own.
  expect(ids(r)).not.toContain('expense-glossary-own');
  // No ⓘ per group or category: one source line opens the definitions' links.
  expect(
    r.root.findAll(
      (n) =>
        typeof n.props?.accessibilityLabel === 'string' &&
        n.props.accessibilityLabel.startsWith('About ') &&
        typeof n.props.onPress === 'function',
    ),
  ).toHaveLength(0);
  await act(async () =>
    r.root
      .find(
        (n) =>
          n.props?.testID === 'expense-glossary-source' &&
          typeof n.props.onPress === 'function',
      )
      .props.onPress(),
  );
  // Each definition link once (several categories share a page).
  const urls = new Set(
    data.categories.flatMap((c) =>
      c.url?.startsWith('https://') ? [c.url] : [],
    ),
  );
  expect(urls.size).toBeGreaterThan(0);
  const { params: sourceParams } = jest
    .mocked(router.push)
    .mock.calls.at(-1)![0] as { params: { key: string } };
  const originals =
    sheetPayload(sourceParams.key, 'source')?.details.originals ?? [];
  expect(new Set(originals.map((original) => original.url)).size).toBe(
    urls.size,
  );
  await act(async () => r.unmount());
});

test('opened from a profile, Expense categories names the member’s own amount at that category', async () => {
  const data = decodeExpenseCategories(pinned('/expense-categories.json'));
  jest.mocked(catalogs.expenseCategories).mockResolvedValue(result(data));
  const category = data.categories[1]!;
  Object.assign(mockParams, {
    category: category.name,
    person: 'Anthony Albanese',
    amount: '1204330',
    years: '2017 to 2026',
  });
  const r = await render(<ExpenseGlossary />);
  const own = r.root.findAll((n) => n.props?.testID === 'expense-glossary-own');
  expect(own.length).toBeGreaterThan(0);
  expect(words(r)).toContain(
    'Anthony Albanese claimed $1,204,330, 2017 to 2026',
  );
  // The line sits inside that category's block, and only there.
  const block = r.root.find(
    (n) =>
      n.props?.testID === `expense-category-${categoryKey(category.name)}` &&
      typeof n.type === 'string',
  );
  expect(
    block.findAll((n) => n.props?.testID === 'expense-glossary-own').length,
  ).toBeGreaterThan(0);
  await act(async () => r.unmount());
});

test('a populated access match shows its disclosure wording without linking meeting attendees or firms', async () => {
  jest.mocked(peopleDepth.access).mockResolvedValue(
    result(
      decodeAccess({
        ...access,
        donors: {
          'Fixture Party': {
            meetings: [
              {
                minister: 'Fixture Attendee',
                jurisdiction: 'NSW',
                date: '2026-01-02',
                purpose: 'Fixture meeting purpose',
                page: 'fixture-attendee',
              },
            ],
            meetings_total: 4,
            lobbyists: [
              {
                firm: 'Fixture Lobbying Firm',
                jurisdiction: 'NSW',
                registered: '2025-02-01',
                ceased: true,
              },
            ],
            lobbyists_total: 2,
          },
        },
      }),
    ),
  );
  const r = await render(<PartyAccess name="Fixture Party" />);
  const output = words(r);
  for (const value of [
    'Fixture Attendee',
    'Fixture meeting purpose',
    'Fixture Lobbying Firm',
    'ceased',
    '1 of 4 shown, newest first.',
    '1 of 2 shown.',
  ])
    expect(output).toContain(value);
  expect(
    r.root.findAll(
      (n) =>
        (n.props?.accessibilityLabel?.includes('Fixture Attendee') ||
          n.props?.accessibilityLabel?.includes('Fixture Lobbying Firm')) &&
        typeof n.props?.onPress === 'function',
    ),
  ).toHaveLength(0);
  await act(async () => r.unmount());
});

// The records lane owns the reader; both speech and mention rows use its resolver.
test('speech and mention rows open the existing native document reader', () => {
  openRecord({ slug: 'speech-1199549' } as Parameters<typeof openRecord>[0]);
  expect(router.push).toHaveBeenCalledWith({
    pathname: '/doc/[slug]',
    params: { slug: 'speech-1199549' },
  });
});
