import { router } from 'expo-router';
import { RecordRow } from '../src/features/RecordRow';
import { electorateRoute } from '../src/navigation/routes';
import { KindPicker } from '../src/features/search/KindPicker';
import { act } from 'react';
import TestRenderer from 'react-test-renderer';
import Search from '../src/features/Search';
import { catalogs } from '../src/api/runtime';
import { openSuggestedPerson } from '../src/features/search/navigation';
import {
  Button,
  ErrorState,
  Field,
  OfflineBanner,
  PersonRow,
} from '../src/design/primitives';
import { ApiError } from '../src/api/errors';
import { bills, index, roster, people, manifest, slugs } from './pinned';

jest.mock('../src/api/runtime', () => ({
  catalogs: {
    suggestionSources: jest.fn(),
    suggestionSourcesOnFocus: jest.fn(),
    search: jest.fn(),
  },
}));
jest.mock('../src/features/search/navigation', () => ({
  openSuggestedPerson: jest.fn(),
  openSearchPerson: jest.fn(),
}));
jest.mock('expo-router', () => ({
  router: { push: jest.fn() },
  useFocusEffect: (effect: () => void | (() => void)) =>
    jest
      .requireActual<typeof import('react')>('react')
      .useEffect(effect, [effect]),
}));

beforeEach(() => {
  jest.clearAllMocks();
  const source = { stale: false, savedAt: null, asAt: null, sources: [] };
  jest.mocked(catalogs.suggestionSourcesOnFocus).mockResolvedValue({
    roster,
    people,
    manifest,
    slugs,
    electorates: index,
    bills,
    provenance: { people: source, electorates: source, bills: source },
  } as unknown as Awaited<ReturnType<typeof catalogs.suggestionSources>>);
});
test('Try again repeats the failed suggestion open without submitting a search', async () => {
  jest
    .mocked(openSuggestedPerson)
    .mockRejectedValueOnce(new Error('offline'))
    .mockResolvedValue(undefined);
  let renderer!: TestRenderer.ReactTestRenderer;
  await act(async () => {
    renderer = TestRenderer.create(<Search />);
  });
  await act(async () =>
    renderer.root.findByType(Field).props.onChangeText('Anthony Albanese'),
  );
  await act(async () => renderer.root.findByType(PersonRow).props.onPress());
  expect(openSuggestedPerson).toHaveBeenCalledTimes(1);
  await act(async () => renderer.root.findByType(ErrorState).props.onRetry());
  expect(openSuggestedPerson).toHaveBeenCalledTimes(2);
  expect(openSuggestedPerson).toHaveBeenLastCalledWith('Anthony Albanese');
  expect(catalogs.search).not.toHaveBeenCalled();
  expect(renderer.root.findAllByType(ErrorState)).toHaveLength(0);
  await act(async () => renderer.unmount());
});
test('a failure arriving after the query changes cannot offer an obsolete open', async () => {
  let fail!: (e: Error) => void;
  jest.mocked(openSuggestedPerson).mockImplementationOnce(
    () =>
      new Promise((_, reject) => {
        fail = reject;
      }),
  );
  let renderer!: TestRenderer.ReactTestRenderer;
  await act(async () => {
    renderer = TestRenderer.create(<Search />);
  });
  await act(async () =>
    renderer.root.findByType(Field).props.onChangeText('Anthony Albanese'),
  );
  await act(async () => renderer.root.findByType(PersonRow).props.onPress());
  await act(async () =>
    renderer.root.findByType(Field).props.onChangeText('zzzz'),
  );
  await act(async () => fail(new Error('offline')));
  expect(renderer.root.findAllByType(ErrorState)).toHaveLength(0);
  expect(catalogs.search).not.toHaveBeenCalled();
  await act(async () => renderer.unmount());
});

test('an offline submitted search shows the uncached state while catalog suggestions remain available', async () => {
  jest
    .mocked(catalogs.search)
    .mockRejectedValueOnce(
      new ApiError(
        'offline',
        'This record is not saved on this iPhone yet. It will load when you are back online.',
      ),
    );
  let renderer!: TestRenderer.ReactTestRenderer;
  await act(async () => {
    renderer = TestRenderer.create(<Search />);
  });
  await act(async () =>
    renderer.root.findByType(Field).props.onChangeText('Anthony Albanese'),
  );
  expect(renderer.root.findAllByType(PersonRow)).toHaveLength(1);
  await act(async () =>
    renderer.root
      .findAllByType(Button)
      .find((button) => button.props.testID === 'search-submit')!
      .props.onPress(),
  );
  expect(catalogs.search).toHaveBeenCalledWith('Anthony Albanese', 'person', 1);
  expect(renderer.root.findByType(OfflineBanner).props).toMatchObject({
    cached: false,
    testID: 'search-offline-uncached',
  });
  expect(renderer.root.findByType(ErrorState).props.testID).toBe(
    'search-error',
  );
  expect(renderer.root.findAllByType(PersonRow)).toHaveLength(0);
  await act(async () => renderer.unmount());
});

test('people suggestions include party and place in the whole accessible row', async () => {
  let renderer!: TestRenderer.ReactTestRenderer;
  await act(async () => {
    renderer = TestRenderer.create(<Search />);
  });
  await act(async () =>
    renderer.root.findByType(Field).props.onChangeText('Anthony Albanese'),
  );
  const row = renderer.root.findByType(PersonRow);
  expect(row.props).toMatchObject({ party: 'Labor', partyCurrent: true });
  const label = row.find(
    (n) => typeof n.type !== 'string' && n.props.accessibilityRole === 'button',
  ).props.accessibilityLabel;
  expect(label).toContain('Anthony Albanese, Labor');
  expect(label).toContain('Grayndler');
  expect(label).toContain('House of Representatives');
  await act(async () => renderer.unmount());
});
test('electorate suggestions push the native identifier route', async () => {
  let renderer!: TestRenderer.ReactTestRenderer;
  await act(async () => {
    renderer = TestRenderer.create(<Search />);
  });
  await act(async () =>
    renderer.root.findByType(Field).props.onChangeText('Grayndler'),
  );
  const seat = index.electorates.find((s) => s.name === 'Grayndler')!;
  await act(async () => renderer.root.findByType(RecordRow).props.onPress());
  expect(router.push).toHaveBeenCalledWith(electorateRoute(seat.electorate_id));
  expect(catalogs.search).not.toHaveBeenCalled();
  await act(async () => renderer.unmount());
});
test.each(['person', 'interest', 'pay', 'expense'] as const)(
  'empty %s results offer exactly the other kinds and submit the same query at page one',
  async (kind) => {
    jest.mocked(catalogs.search).mockResolvedValue({
      data: {
        query: 'zzzznevermatchingcatalog',
        results: [],
        warnings: [],
        total: 0,
        page: 1,
        pages: 1,
      },
      stale: false,
      savedAt: 100,
      asOf: null,
    } as unknown as Awaited<ReturnType<typeof catalogs.search>>);
    let renderer!: TestRenderer.ReactTestRenderer;
    await act(async () => {
      renderer = TestRenderer.create(<Search />);
    });
    await act(async () =>
      renderer.root
        .findByType(Field)
        .props.onChangeText('  zzzznevermatchingcatalog  '),
    );
    await act(async () =>
      renderer.root.findByType(KindPicker).props.onChange(kind),
    );
    await act(async () =>
      renderer.root
        .findAllByType(Button)
        .find((b) => b.props.testID === 'search-submit')!
        .props.onPress(),
    );
    const otherKinds = ['person', 'interest', 'pay', 'expense'].filter(
      (k) => k !== kind,
    );
    const actions = renderer.root
      .findAllByType(Button)
      .filter((b) => b.props.testID?.startsWith('search-empty-'));
    expect(actions.map((b) => b.props.testID)).toEqual(
      otherKinds.map((k) => `search-empty-${k}`),
    );
    await act(async () => actions[0]!.props.onPress());
    expect(catalogs.search).toHaveBeenLastCalledWith(
      'zzzznevermatchingcatalog',
      otherKinds[0],
      1,
    );
    expect(renderer.root.findByType(KindPicker).props.value).toBe(
      otherKinds[0],
    );
    await act(async () => renderer.unmount());
  },
);

test('submitted people rows retain the selector party, place and complete accessible label', async () => {
  jest.mocked(catalogs.search).mockResolvedValue({
    data: {
      query: 'Anthony Albanese',
      results: [
        {
          slug: 'catalog-1',
          title: 'Anthony Albanese',
          personSlug: 'anthony-albanese',
          snippet: '',
          href: '/subject/person/anthony-albanese',
        },
      ],
      warnings: [],
      total: 1,
      page: 1,
      pages: 1,
    },
    stale: false,
    savedAt: 100,
    asOf: null,
  } as unknown as Awaited<ReturnType<typeof catalogs.search>>);
  let renderer!: TestRenderer.ReactTestRenderer;
  await act(async () => {
    renderer = TestRenderer.create(<Search />);
  });
  await act(async () =>
    renderer.root.findByType(Field).props.onChangeText('Anthony Albanese'),
  );
  await act(async () =>
    renderer.root
      .findAllByType(Button)
      .find((b) => b.props.testID === 'search-submit')!
      .props.onPress(),
  );
  const row = renderer.root.findByType(PersonRow);
  expect(row.props).toMatchObject({
    party: 'Labor',
    partyCurrent: true,
    testID: 'search-result-anthony-albanese',
  });
  const label = row.find(
    (n) => typeof n.type !== 'string' && n.props.accessibilityRole === 'button',
  ).props.accessibilityLabel;
  expect(label).toContain('Anthony Albanese, Labor');
  expect(label).toContain('Grayndler');
  expect(label).toContain('House of Representatives');
  expect(label).toContain('New South Wales');
  await act(async () => renderer.unmount());
});

test.each([
  {
    title: 'Antony Pasin',
    profileName: 'Tony Pasin',
    slug: 'tony-pasin',
    party: 'Liberal',
    seat: 'Barker',
  },
  {
    title: 'Robert Katter',
    profileName: 'Bob Katter',
    slug: 'bob-katter',
    party: "Katter's Australian Party",
    seat: 'Kennedy',
  },
])(
  'a mapped register name $title keeps its source spelling and roster details',
  async ({ title, profileName, slug, party, seat }) => {
    jest.mocked(catalogs.search).mockResolvedValue({
      data: {
        query: title,
        results: [
          {
            slug: 'catalog-1',
            title,
            profileName,
            personSlug: slug,
            snippet: '',
            href: `/declared?person=${encodeURIComponent(title)}`,
          },
        ],
        warnings: [],
        total: 1,
        page: 1,
        pages: 1,
      },
      stale: false,
      savedAt: 100,
      asOf: null,
    } as unknown as Awaited<ReturnType<typeof catalogs.search>>);
    let renderer!: TestRenderer.ReactTestRenderer;
    await act(async () => {
      renderer = TestRenderer.create(<Search />);
    });
    await act(async () =>
      renderer.root.findByType(Field).props.onChangeText(title),
    );
    await act(async () =>
      renderer.root
        .findAllByType(Button)
        .find((b) => b.props.testID === 'search-submit')!
        .props.onPress(),
    );
    const row = renderer.root.findByType(PersonRow);
    expect(row.props).toMatchObject({ name: title, party, partyCurrent: true });
    expect(row.props.place).toContain(seat);
    const label = row.find(
      (n) =>
        typeof n.type !== 'string' && n.props.accessibilityRole === 'button',
    ).props.accessibilityLabel;
    expect(label).toContain(title);
    expect(label).toContain(party);
    expect(label).toContain(seat);
    await act(async () => renderer.unmount());
  },
);
