import { act, fireEvent, render, waitFor } from '@testing-library/react-native';
import { router } from 'expo-router';
import { ApiError } from '../src/api/errors';
import { joinPerson } from '../src/api/person-identity';
import { catalogs } from '../src/api/runtime';
import { InlineError, LinkRow } from '../src/design/primitives';
import { AllResults } from '../src/features/search/AllResults';
import { decodeRecord, decodeRecords } from '../src/features/search/decoders';
import { eligibleRecord } from '../src/features/search/eligibility';
import { defaultSpeechFilters } from '../src/features/search/filters';
import {
  GroupResults,
  type GroupList,
} from '../src/features/search/GroupResults';
import {
  searchInterestRoute,
  searchPathRoute,
} from '../src/features/search/navigation';
import { interestDetail } from '../src/features/search/present';
import { SpeechRow } from '../src/features/search/SpeechResults';
import type { SpeechList } from '../src/features/search/speeches';
import { openSource } from '../src/navigation/external';
import { personRoute } from '../src/navigation/routes/people';
import { docRoute } from '../src/navigation/routes/records';
import { catalogs as pinned, manifest, people, roster, slugs } from './pinned';

jest.mock('../src/api/runtime', () => ({
  catalogs: {
    slugs: jest.fn(),
    interestIndex: jest.fn(),
    manifest: jest.fn(),
    people: jest.fn(),
    person: jest.fn(),
  },
}));
jest.mock('../src/navigation/external', () => ({
  openSource: jest.fn(),
  webPageUrl: (path: string) => `https://opax.com.au${path}`,
}));
jest.mock('expo-router', () => ({
  router: { push: jest.fn() },
  Link: Object.assign(({ children }: { children: unknown }) => children, {
    Trigger: ({ children }: { children: unknown }) => children,
    Preview: () => null,
    Menu: () => null,
    MenuAction: () => null,
  }),
}));

const recover = {
  onAsk: jest.fn(),
  onAll: jest.fn(),
  onClearFilters: jest.fn(),
  onUnquote: jest.fn(),
  onSpeeches: jest.fn(),
};
const result = <T,>(data: T) => ({
  data,
  stale: false,
  savedAt: 0,
  asOf: null,
});
const interest = (name: string, fields = {}) =>
  decodeRecord({
    kind: 'interest',
    title: `${name} \u2014 shareholdings`,
    href: `/subject/person/${encodeURIComponent(name)}#person-interests`,
    snippet: 'Shares held in David Pocock Pty Ltd. unspecified. statement.',
    slug: `catalog-${name}`,
    resource: '',
    source: 'Register of interests',
    url: 'https://www.aph.gov.au/Register',
    ...fields,
  });
const members = ['Barbara Pocock', 'David Pocock'];
const rows = members.map((name) => interest(name));

function speechList(records = rows): SpeechList {
  const data = decodeRecords({
    query: 'Pocock',
    kind: 'all',
    sort: 'relevance',
    page: 1,
    per_page: 20,
    page_count: 1,
    total: records.length,
    count: records.length,
    truncated: false,
    years: {},
    results: records,
  });
  return {
    first: { status: 'ready', result: result(data) },
    rows: data.results,
    total: records.length,
    more: false,
    nextCount: 0,
    next: null,
    pages: 1,
    source: null,
    count: `${records.length} records`,
    load: jest.fn(),
    loadMore: jest.fn(),
    retry: jest.fn(),
  };
}
function groupList(records = rows): GroupList {
  const groupRows = records.map((row) => ({ ...row, href: row.href! }));
  return {
    first: {
      status: 'ready',
      result: result({
        results: groupRows,
        total: records.length,
        page: 1,
        per_page: 20,
        query: 'Pocock',
        warnings: [],
      }),
    },
    rows: groupRows,
    more: false,
    nextCount: 0,
    next: null,
    source: null,
    count: `${records.length} declared interests`,
    load: jest.fn(),
    loadMore: jest.fn(),
    retry: jest.fn(),
  };
}
const expectedRoute = (slug: string) =>
  personRoute(
    joinPerson(slug, slugs, roster, people, manifest).canonicalPersonId!,
    undefined,
    'interests',
  );

beforeEach(() => {
  jest.resetAllMocks();
  jest.mocked(catalogs.slugs).mockResolvedValue(result(slugs));
  jest
    .mocked(catalogs.interestIndex)
    .mockResolvedValue(result(pinned.interestIndex!));
  jest.mocked(catalogs.manifest).mockResolvedValue(result(manifest));
  jest.mocked(catalogs.people).mockResolvedValue(result(people));
  jest
    .mocked(catalogs.person)
    .mockImplementation(async (slug) =>
      result(joinPerson(slug, slugs, roster, people, manifest)),
    );
});

test.each(['All group', 'Declared interests scope'])(
  '%s opens the declaring member at the interests section',
  async (surface) => {
    const view = render(
      surface === 'All group' ? (
        <AllResults
          q="Pocock"
          sources={null}
          roster={roster}
          filters={{ ...defaultSpeechFilters, kind: 'all' }}
          speeches={speechList()}
          onScope={jest.fn()}
          recover={recover}
        />
      ) : (
        <GroupResults
          group="interests"
          q="Pocock"
          list={groupList()}
          recover={recover}
        />
      ),
    );
    for (const [index, name] of members.entries()) {
      const id =
        surface === 'All group'
          ? `records-result-${index}`
          : `results-interests-${index}`;
      await act(async () => fireEvent.press(view.getByTestId(id)));
      expect(router.push).toHaveBeenLastCalledWith(
        expectedRoute(name.toLowerCase().replace(' ', '-')),
      );
    }
    expect(router.push).toHaveBeenCalledTimes(2);
    expect(openSource).not.toHaveBeenCalled();
    const details = view
      .UNSAFE_getAllByType(LinkRow)
      .filter((row) =>
        /^(records-result|results-interests)-/.test(row.props.testID ?? ''),
      )
      .map((row) => row.props.detail);
    expect(details).toEqual([
      'Declared interest · Shares held in David Pocock Pty Ltd',
      'Declared interest · Shares held in David Pocock Pty Ltd',
    ]);
  },
);

test('All keeps interest records eligible for its results group', () => {
  for (const row of rows) expect(eligibleRecord(row, roster)).toBe(true);
});

test('the verified catalogue person slug opens with the existing section key', async () => {
  const row = { ...interest('Barbara Pocock'), personSlug: 'barbara-pocock' };
  await expect(searchInterestRoute(row)).resolves.toEqual(
    expectedRoute('barbara-pocock'),
  );
  expect(catalogs.interestIndex).not.toHaveBeenCalled();
});

test.each([
  '/subject/person/Antony%20Pasin#person-interests',
  '/declared?person=Antony%20Pasin',
])('formal register spelling uses its identity bridge: %s', async (href) => {
  await expect(
    searchInterestRoute(interest('Antony Pasin', { href })),
  ).resolves.toEqual(expectedRoute('tony-pasin'));
});

test('an indexed interest without a person href resolves its named member', async () => {
  await expect(
    searchInterestRoute(
      interest('David Pocock', {
        href: '/doc/speech-828012',
        speaker: 'David Pocock',
      }),
    ),
  ).resolves.toEqual(expectedRoute('david-pocock'));
});

test.each(['Unresolved Member', 'Chris Minns', 'Watt'])(
  'an unresolved or conflicting member retains the catalogue destination: %s',
  async (name) => {
    const row = interest(name, {
      href: `/declared?person=${encodeURIComponent(name)}`,
    });
    const view = render(
      <GroupResults
        group="interests"
        q={name}
        list={groupList([row])}
        recover={recover}
      />,
    );
    await act(async () =>
      fireEvent.press(view.getByTestId('results-interests-0')),
    );
    const route = searchPathRoute(row.href!);
    if (route) expect(router.push).toHaveBeenCalledWith(route);
    else
      expect(openSource).toHaveBeenCalledWith(
        `https://opax.com.au${row.href}`,
        row.title,
      );
    expect(router.push).not.toHaveBeenCalledWith(
      expect.objectContaining({
        pathname: '/person/[slug]',
        params: expect.objectContaining({ section: 'interests' }),
      }),
    );
  },
);

test.each(['reader', 'source'])(
  'an unresolved All interest retains its %s destination',
  async (fallback) => {
    const row = interest(
      'Unresolved Member',
      fallback === 'reader'
        ? { href: '/doc/speech-828012', slug: 'speech-828012' }
        : {},
    );
    const view = render(<SpeechRow row={row} q="shares" index={0} />);
    await act(async () =>
      fireEvent.press(view.getByTestId('records-result-0')),
    );
    if (fallback === 'reader')
      expect(router.push).toHaveBeenCalledWith(
        docRoute('speech-828012', undefined, { q: 'shares' }),
      );
    else expect(openSource).toHaveBeenCalledWith(row.url, row.source);
  },
);

test('a catalogue outage offers retry without redirecting a resolvable member', async () => {
  jest
    .mocked(catalogs.person)
    .mockRejectedValueOnce(new ApiError('offline', 'Offline'));
  const view = render(<SpeechRow row={rows[0]!} q="Pocock" index={0} />);
  await act(async () => fireEvent.press(view.getByTestId('records-result-0')));
  expect(router.push).not.toHaveBeenCalled();
  expect(openSource).not.toHaveBeenCalled();
  const retry = view.UNSAFE_getByType(InlineError).props.onRetry;
  await act(async () => retry());
  await waitFor(() =>
    expect(router.push).toHaveBeenCalledWith(expectedRoute('barbara-pocock')),
  );
});

test.each([
  ['Shares held. unspecified. statement.', 'Shares held'],
  ['Shares held. unspecified. deletion.', 'Shares held · Removed'],
  ['Shares held. unspecified. addition.', 'Shares held · Added'],
  ['Shares held. self. deletion.', 'Shares held · Member · Removed'],
  ['Shares held. spouse. statement.', 'Shares held · Spouse or partner'],
  [
    'Shares held. children. addition.',
    'Shares held · Dependent children · Added',
  ],
  ['Shares held. . statement.', 'Shares held'],
  ['Shares held.. unspecified. statement.', 'Shares held.'],
  ['The annual statement.', 'The annual statement.'],
  [
    'Terms unspecified. Statement retained.',
    'Terms unspecified. Statement retained.',
  ],
])('register detail cleans only metadata cells: %s', (snippet, expected) => {
  expect(interestDetail({ title: 'Barbara Pocock', snippet })).toBe(expected);
});

test('an alteration keeps its action even when its description is long', () => {
  const detail = interestDetail({
    title: 'David Pocock \u2014 deletion',
    snippet: 'Shares held in a private company. '.repeat(12),
  });
  expect(detail).toMatch(/^Shares held in a private company/);
  expect(detail).toMatch(/ · Removed$/);
});
