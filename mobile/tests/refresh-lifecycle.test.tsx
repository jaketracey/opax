import { withNavigationOptions } from './navigation-options';
import { act, type ReactElement } from 'react';
import { RefreshControl } from 'react-native';
import TestRenderer from 'react-test-renderer';
import { apiClient, catalogs as runtime } from '../src/api/runtime';
import { decodeCorpus } from '../src/api/catalog-decoders';
import { Catalogs } from '../src/api/catalogs';
import type { ApiClient, RecordResult } from '../src/api/client';
import { dataAsOf } from '../src/api/client';
import { Screen, SuggestionRow } from '../src/design/primitives';
import { Skeleton } from '../src/design/states';
import About from '../src/features/About';
import Electorate from '../src/features/Electorate';
import Person from '../src/features/Person';
import Search from '../src/features/Search';
import { pinned, slugs } from './pinned';

jest.mock('../src/api/runtime', () => ({
  apiClient: { get: jest.fn() },
  catalogs: {
    suggestionSources: jest.fn(),
    suggestionSourcesOnFocus: jest.fn(),
    about: jest.fn(),
    person: jest.fn(),
    profileFor: jest.fn(),
    directory: jest.fn(),
    electorateFor: jest.fn(),
  },
}));
// The Electorate menu reads the saved seat; keep its directory read out of
// the refresh counts below.
jest.mock('../src/features/your-mp/useSeat', () => ({
  ...jest.requireActual('../src/features/your-mp/useSeat'),
  useSeat: () => ({ status: 'none' }),
  savedSeatDirectory: () => null,
}));
const mockParams: { slug?: string; id?: string } = {};
// Search's field is the native bar search: its options are captured here.
const mockOptions: { current?: Record<string, any> } = {};
const mockFocus: {
  effect?: () => void | (() => void);
  cleanup?: void | (() => void);
} = {};
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
  router: { push: jest.fn() },
  Stack: {
    Screen: ({ options }: { options?: Record<string, any> }) => {
      if (options?.headerSearchBarOptions) mockOptions.current = options;
      return null;
    },
  },
  useFocusEffect: (effect: () => void | (() => void)) => {
    jest.requireActual<typeof import('react')>('react').useEffect(() => {
      mockFocus.effect = effect;
      mockFocus.cleanup = effect();
      return () => {
        mockFocus.cleanup?.();
        mockFocus.effect = undefined;
        mockFocus.cleanup = undefined;
      };
    }, [effect]);
  },
}));
const client: Pick<ApiClient, 'get'> = {
  async get<T>(
    path: string,
    decode: (input: unknown) => T,
  ): Promise<RecordResult<T>> {
    const raw = path === '/api/person-slugs' ? slugs : pinned(path);
    return {
      data: decode(raw),
      asOf: dataAsOf(raw),
      stale: false,
      savedAt: 200,
    };
  },
};
const fixture = new Catalogs(client);
const mock = jest.mocked(runtime);
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => (resolve = done));
  return { promise, resolve: (value: T) => resolve(value) };
}
beforeEach(() => {
  Object.values(mock).forEach((fn) => fn.mockReset());
  mockParams.slug = 'anthony-albanese';
});

test.each(['Search', 'About', 'Person', 'Electorate'] as const)(
  '%s initial loading leaves native refresh idle; user refresh starts and settles it',
  async (name) => {
    let element: ReactElement;
    let finishInitial!: () => void;
    let finishRefresh!: () => void;
    if (name === 'Search') {
      const ready = await fixture.suggestionSources();
      const initial = deferred<typeof ready>();
      const refreshed = deferred<typeof ready>();
      mock.suggestionSourcesOnFocus.mockReturnValueOnce(initial.promise);
      mock.suggestionSources.mockReturnValueOnce(refreshed.promise);
      element = <Search />;
      finishInitial = () => initial.resolve(ready);
      finishRefresh = () => refreshed.resolve(ready);
    } else if (name === 'About') {
      const ready = await client.get('/corpus.json', decodeCorpus);
      const initial = deferred<typeof ready>();
      const refreshed = deferred<typeof ready>();
      jest
        .mocked(apiClient.get)
        .mockReturnValueOnce(initial.promise as never)
        .mockReturnValueOnce(refreshed.promise);
      element = <About />;
      finishInitial = () => initial.resolve(ready);
      finishRefresh = () => refreshed.resolve(ready);
    } else if (name === 'Person') {
      const ready = await fixture.person(mockParams.slug!);
      mock.profileFor.mockResolvedValue(
        await fixture.profileFor(ready.data.canonicalPersonId!),
      );
      const initial = deferred<typeof ready>();
      const refreshed = deferred<typeof ready>();
      mock.person
        .mockReturnValueOnce(initial.promise)
        .mockReturnValueOnce(refreshed.promise);
      element = <Person />;
      finishInitial = () => initial.resolve(ready);
      finishRefresh = () => refreshed.resolve(ready);
    } else {
      const ready = await fixture.directory();
      const seat = ready.electorates.data.electorates.find(
        (row) => row.name === 'Grayndler',
      )!;
      mockParams.id = seat.electorate_id;
      mock.electorateFor.mockResolvedValue(
        await fixture.electorateFor(seat.detail_url),
      );
      const initial = deferred<typeof ready>();
      const refreshed = deferred<typeof ready>();
      mock.directory
        .mockReturnValueOnce(initial.promise)
        .mockReturnValueOnce(refreshed.promise);
      element = <Electorate />;
      finishInitial = () => initial.resolve(ready);
      finishRefresh = () => refreshed.resolve(ready);
    }
    let renderer!: TestRenderer.ReactTestRenderer;
    await act(async () => {
      renderer = TestRenderer.create(element);
    });
    const control = () =>
      renderer.root.findByType(Screen).props.refreshControl as ReactElement<{
        refreshing: boolean;
        onRefresh: () => void;
      }>;
    expect(control().type).toBe(RefreshControl);
    expect(control().props.refreshing).toBe(false);
    // Idle Search draws no suggestions, so no placeholder stands in for them
    // while they load (TestFlight build 32); the other screens show one.
    // LoadingState draws a Skeleton, and the Electorate and About pages load
    // behind their own skeletons.
    const loading = () => renderer.root.findAllByType(Skeleton).length;
    expect(loading() > 0).toBe(name !== 'Search');
    await act(async () => finishInitial());
    expect(control().props.refreshing).toBe(false);
    expect(loading()).toBe(0);
    await act(async () => control().props.onRefresh());
    expect(control().props.refreshing).toBe(true);
    if (name === 'Search')
      expect(mock.suggestionSources).toHaveBeenLastCalledWith(true);
    else if (name === 'About')
      expect(apiClient.get).toHaveBeenLastCalledWith(
        '/corpus.json',
        decodeCorpus,
        true,
        { signal: expect.any(AbortSignal) },
      );
    else if (name === 'Person') expect(mock.person).toHaveBeenCalledTimes(2);
    else expect(mock.directory).toHaveBeenCalledTimes(2);
    await act(async () => finishRefresh());
    expect(control().props.refreshing).toBe(false);
    await act(async () => renderer.unmount());
  },
);
test('a later Search focus restores identity context without native refreshing', async () => {
  const ready = await fixture.suggestionSources();
  const recovered = deferred<typeof ready>();
  mock.suggestionSourcesOnFocus
    .mockResolvedValueOnce({ ...ready, slugs: undefined, people: undefined })
    .mockReturnValueOnce(recovered.promise);
  let renderer!: TestRenderer.ReactTestRenderer;
  await act(async () => {
    renderer = TestRenderer.create(
      withNavigationOptions(<Search />, (options) => {
        if (options.headerSearchBarOptions) mockOptions.current = options;
      }),
    );
  });
  await act(async () =>
    mockOptions.current!.headerSearchBarOptions.onChangeText({
      nativeEvent: { text: 'Anthony Albanese' },
    }),
  );
  const albanese = () =>
    renderer.root
      .findAllByType(SuggestionRow)
      .find((row) => row.props.name === 'Anthony Albanese')!.props;
  expect(albanese().secondary ?? '').not.toContain('Labor');
  const control = () => renderer.root.findByType(Screen).props.refreshControl;
  await act(async () => {
    mockFocus.cleanup?.();
    mockFocus.cleanup = mockFocus.effect!();
  });
  expect(mock.suggestionSourcesOnFocus).toHaveBeenCalledTimes(2);
  expect(control().props.refreshing).toBe(false);
  expect(albanese().secondary ?? '').not.toContain('Labor');
  await act(async () => recovered.resolve(ready));
  expect(albanese().secondary).toBe(
    'Labor · Member for Grayndler, New South Wales',
  );
  expect(control().props.refreshing).toBe(false);
  expect(mock.suggestionSources).not.toHaveBeenCalled();
  await act(async () => renderer.unmount());
});
