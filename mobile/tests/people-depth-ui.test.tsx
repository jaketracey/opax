import { act } from 'react';
import { router } from 'expo-router';
import TestRenderer from 'react-test-renderer';
import { Text as NativeText } from 'react-native';
import { catalogs, peopleDepth } from '../src/api/runtime';
import {
  ActionSection,
  NewsSection,
  PersonTopics,
  RecordSection,
  openRecord,
} from '../src/features/people/Sections';
import { PartyAccess, PartyFunding } from '../src/features/people/PartyDepth';
import ExpenseGlossary from '../src/features/people/ExpenseGlossary';
import { decodeExpenseCategories } from '../src/api/catalog-decoders';
import {
  decodeAccess,
  decodeFunding,
  decodeNews,
} from '../src/features/people/model';
import { pinned } from './pinned';
jest.mock('expo-router', () => ({
  router: { push: jest.fn() },
  Stack: { Screen: () => null },
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
jest.mock('../src/features/follows/FollowToggle', () => ({
  FollowToggle: () => null,
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
    r = TestRenderer.create(node);
  });
  return r;
}
async function press(r: TestRenderer.ReactTestRenderer, id: string) {
  await act(async () => {
    r.root
      .find(
        (n) => n.props?.testID === id && typeof n.props.onPress === 'function',
      )
      .props.onPress();
  });
}
const words = (r: TestRenderer.ReactTestRenderer) =>
  r.root
    .findAllByType(NativeText)
    .map((n) => String(n.props.children))
    .join(' ');
beforeEach(() => {
  jest.clearAllMocks();
  jest.mocked(peopleDepth.access).mockResolvedValue(result(access));
  jest.mocked(peopleDepth.funding).mockResolvedValue(result(funding));
});
test('paid person/party sections mount collapsed with zero reads; first tap loads, hide/show only changes visibility', async () => {
  const load = jest.fn(async () => 'Fixture result');
  const r = await render(
    <ActionSection title="Topics" label="topics" id="fixture" load={load}>
      {(data) => <NativeText>{data}</NativeText>}
    </ActionSection>,
  );
  expect(load).not.toHaveBeenCalled();
  expect(words(r)).not.toContain('Fixture result');
  await press(r, 'fixture-toggle');
  expect(load).toHaveBeenCalledTimes(1);
  expect(words(r)).toContain('Fixture result');
  await press(r, 'fixture-toggle');
  await press(r, 'fixture-toggle');
  expect(load).toHaveBeenCalledTimes(1);
  await act(async () => r.unmount());
  const all = await render(
    <>
      <PersonTopics name="Anthony Albanese" />
      <RecordSection name="Anthony Albanese" kind="speeches" />
      <RecordSection name="Anthony Albanese" kind="mentions" />
      <NewsSection name="Anthony Albanese" />
      <RecordSection name="Labor" kind="party" />
    </>,
  );
  for (const fn of [
    peopleDepth.topics,
    peopleDepth.speeches,
    peopleDepth.mentions,
    peopleDepth.news,
  ])
    expect(fn).not.toHaveBeenCalled();
  await act(async () => all.unmount());
});
test('All, Then and Now switch the loaded profiles without another request', async () => {
  const era = (label: string, n: number) => ({
    label,
    from: 2010,
    to: 2019,
    labelled: 10,
    topics: [{ slug: 'housing', count: n, share: n / 10 }],
  });
  jest.mocked(peopleDepth.topics).mockResolvedValue({
    person: result({
      name: 'Fixture Member',
      indexed: 30,
      profiles: {
        all: era('All years', 5),
        then: era('2010s', 2),
        now: era('2020–26', 8),
      },
      coverage: undefined,
    }),
    baseline: result({
      labelled: 20,
      topics: [{ slug: 'housing', count: 10 }],
    }),
  });
  const r = await render(<PersonTopics name="Fixture Member" />);
  await press(r, 'person-topics-toggle');
  expect(words(r)).toContain('Housing');
  for (const label of ['Then', 'Now', 'All']) {
    await act(async () =>
      r.root
        .find(
          (n) =>
            n.props?.accessibilityLabel === label &&
            typeof n.props.onPress === 'function',
        )
        .props.onPress(),
    );
  }
  expect(peopleDepth.topics).toHaveBeenCalledTimes(1);
  await act(async () => r.unmount());
});
test('news has no In the news heading unless a headline matches', async () => {
  jest.mocked(peopleDepth.news).mockResolvedValue(
    result(
      decodeNews({
        items: [
          {
            title: 'Unrelated headline',
            url: 'https://example.test/news',
            source: 'ABC News',
          },
        ],
      }),
    ),
  );
  const r = await render(<NewsSection name="Anthony Albanese" />);
  await press(r, 'people-news-toggle');
  expect(words(r)).not.toContain('In the news');
  expect(words(r)).toContain(
    "Nothing in today's politics headlines mentions them.",
  );
  await act(async () => r.unmount());
});
test('meetings, attendees, lobbying firms and creditors remain plain text; all 27 receipt years are available', async () => {
  const r = await render(
    <>
      <PartyAccess name="Labor" />
      <PartyFunding name="Labor" />
    </>,
  );
  expect(words(r)).toContain('No disclosed meetings match');
  expect(words(r)).toContain('Message4U Pty Ltd');
  expect(
    r.root.findAll((n) => n.props?.testID === 'party-return-1998-99'),
  ).toHaveLength(0);
  await press(r, 'party-all-years');
  expect(
    r.root.findAll((n) => n.props?.testID === 'party-return-1998-99').length,
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
test('glossary preserves definitions on screen and full notes in info sheets from the web export', async () => {
  const data = decodeExpenseCategories(pinned('/expense-categories.json'));
  jest.mocked(catalogs.expenseCategories).mockResolvedValue(result(data));
  const r = await render(<ExpenseGlossary />);
  const output = words(r);
  for (const c of data.categories) expect(output).toContain(c.text);
  const note = async (label: string, body: string) => {
    await act(async () =>
      r.root
        .find(
          (n) =>
            n.props?.accessibilityLabel === label &&
            typeof n.props.onPress === 'function',
        )
        .props.onPress(),
    );
    expect(words(r)).toContain(body);
    await act(async () =>
      r.root
        .find(
          (n) =>
            n.props?.accessibilityLabel === 'Done' &&
            typeof n.props.onPress === 'function',
        )
        .props.onPress(),
    );
  };
  for (const c of data.categories)
    if (c.note) await note('About ' + c.name.toLowerCase(), c.note);
  for (const g of data.groups) await note(g.title, g.blurb);
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
    'newest 1 shown',
    'registered firms',
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
