import { act } from 'react';
import TestRenderer from 'react-test-renderer';
import TimeMachine from '../src/features/explore/TimeMachine';
import { ExploreChrome } from '../src/features/explore/parts';

jest.mock('../src/api/useRead', () => ({
  useRead: () => ({ record: null, error: null, retry: jest.fn() }),
}));
jest.mock('../src/api/runtime', () => ({ catalogs: {} }));
jest.mock('../src/features/explore/runtime', () => ({ explore: {} }));
jest.mock('../src/features/explore/repository', () => ({
  readExploreChoices: async () => ({}),
  saveExploreChoice: jest.fn(),
}));
jest.mock('../src/features/explore/parts', () => ({
  ExploreChrome: jest.fn(() => null),
}));
jest.mock('expo-router', () => ({
  router: { push: jest.fn() },
  useSegments: () => [],
  useLocalSearchParams: () => ({ year: '2010' }),
  Link: Object.assign(({ children }: { children: unknown }) => children, {
    Trigger: ({ children }: { children: unknown }) => children,
    Preview: () => null,
    Menu: () => null,
    MenuAction: () => null,
  }),
}));

test('Time machine shares the year it shows', async () => {
  await act(async () => {
    TestRenderer.create(<TimeMachine />);
  });
  expect(jest.mocked(ExploreChrome).mock.calls.at(-1)![0]).toMatchObject({
    game: 'tm',
    params: { year: '2010' },
  });
});
