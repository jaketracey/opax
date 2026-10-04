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
import { bills, index, roster } from './pinned';

jest.mock('../src/api/runtime', () => ({
  catalogs: { suggestionSources: jest.fn(), search: jest.fn() },
}));
jest.mock('../src/features/search/navigation', () => ({
  openSuggestedPerson: jest.fn(),
  openSearchPerson: jest.fn(),
}));
jest.mock('expo-router', () => ({ router: { push: jest.fn() } }));

beforeEach(() => {
  jest.clearAllMocks();
  const source = { stale: false, savedAt: null, asAt: null, sources: [] };
  jest.mocked(catalogs.suggestionSources).mockResolvedValue({
    roster,
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
