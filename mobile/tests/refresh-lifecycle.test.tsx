import { act, type ReactElement } from 'react';
import { RefreshControl } from 'react-native';
import TestRenderer from 'react-test-renderer';
import { catalogs as runtime } from '../src/api/runtime';
import { Catalogs } from '../src/api/catalogs';
import type { ApiClient, RecordResult } from '../src/api/client';
import { dataAsOf } from '../src/api/client';
import { LoadingState, Screen } from '../src/design/primitives';
import About from '../src/features/About';
import Electorate from '../src/features/Electorate';
import Person from '../src/features/Person';
import Search from '../src/features/Search';
import { pinned, slugs } from './pinned';

jest.mock('../src/api/runtime', () => ({
  catalogs: {
    suggestionSources: jest.fn(),
    about: jest.fn(),
    person: jest.fn(),
    profileFor: jest.fn(),
    directory: jest.fn(),
    electorateFor: jest.fn(),
  },
}));
const mockParams: { slug?: string; id?: string } = {};
jest.mock('expo-router', () => ({
  useLocalSearchParams: () => mockParams,
  router: { push: jest.fn() },
  Stack: { Screen: () => null },
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
      mock.suggestionSources
        .mockReturnValueOnce(initial.promise)
        .mockReturnValueOnce(refreshed.promise);
      element = <Search />;
      finishInitial = () => initial.resolve(ready);
      finishRefresh = () => refreshed.resolve(ready);
    } else if (name === 'About') {
      const ready = await fixture.about();
      const initial = deferred<typeof ready>();
      const refreshed = deferred<typeof ready>();
      mock.about
        .mockReturnValueOnce(initial.promise)
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
    expect(renderer.root.findAllByType(LoadingState)).toHaveLength(1);
    await act(async () => finishInitial());
    expect(control().props.refreshing).toBe(false);
    expect(renderer.root.findAllByType(LoadingState)).toHaveLength(0);
    await act(async () => control().props.onRefresh());
    expect(control().props.refreshing).toBe(true);
    if (name === 'Search')
      expect(mock.suggestionSources).toHaveBeenLastCalledWith(true);
    else if (name === 'About')
      expect(mock.about).toHaveBeenLastCalledWith(true);
    else if (name === 'Person') expect(mock.person).toHaveBeenCalledTimes(2);
    else expect(mock.directory).toHaveBeenCalledTimes(2);
    await act(async () => finishRefresh());
    expect(control().props.refreshing).toBe(false);
    await act(async () => renderer.unmount());
  },
);
