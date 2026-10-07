import { act } from 'react';
import TestRenderer from 'react-test-renderer';
import DirectoryScreen from '../src/features/directories/DirectoryScreen';
import { Field } from '../src/design/primitives';
import {
  loadDirectory,
  type DirectoryRecord,
} from '../src/features/directories/data';

const mockParams = { kind: 'person' };
jest.mock('expo-router', () => ({
  useLocalSearchParams: () => mockParams,
  router: { push: jest.fn() },
  Stack: { Screen: () => null },
}));
jest.mock('../src/features/directories/data', () => ({
  loadDirectory: jest.fn(),
}));
jest.mock('../src/features/CachedPortrait', () => ({
  CachedPortrait: () => null,
}));

const empty: DirectoryRecord = {
  people: [],
  parties: [],
  electorates: [],
  facets: [],
  stale: false,
  savedAt: 1,
  partial: false,
  sources: [],
};
test('a directory-kind deep link starts a blank query and waits for that kind’s record', async () => {
  let resolveParty!: (record: DirectoryRecord) => void;
  jest.mocked(loadDirectory).mockImplementation((kind) =>
    kind === 'party'
      ? new Promise((resolve) => {
          resolveParty = resolve;
        })
      : Promise.resolve(empty),
  );
  let renderer!: TestRenderer.ReactTestRenderer;
  await act(async () => {
    renderer = TestRenderer.create(<DirectoryScreen />);
  });
  await act(async () =>
    renderer.root.findByType(Field).props.onChangeText('Anthony Albanese'),
  );
  expect(renderer.root.findByType(Field).props.value).toBe('Anthony Albanese');
  mockParams.kind = 'party';
  await act(async () => renderer.update(<DirectoryScreen />));
  expect(renderer.root.findByType(Field).props.value).toBe('');
  expect(
    renderer.root.findAll((node) => node.props.testID === 'directory-count'),
  ).toHaveLength(0);
  await act(async () =>
    resolveParty({
      ...empty,
      parties: [
        {
          key: 'Labor',
          name: 'Labor',
          speeches: 1,
          members: 1,
          money: {},
          total: 0,
        },
      ],
    }),
  );
  expect(renderer.root.findByType(Field).props.value).toBe('');
  expect(
    renderer.root.findAll(
      (node) => node.props.testID === 'directory-party-labor',
    ).length,
  ).toBeGreaterThan(0);
  await act(async () => renderer.unmount());
});
