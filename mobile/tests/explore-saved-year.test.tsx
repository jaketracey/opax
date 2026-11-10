import { act } from 'react';
import TestRenderer from 'react-test-renderer';
import { catalogs } from '../src/api/runtime';
import TimeMachine, { defaultYear } from '../src/features/explore/TimeMachine';
import { readExploreChoices } from '../src/features/explore/repository';
import { explore } from '../src/features/explore/runtime';

let mockParams: Record<string, string> = {};
jest.mock('expo-router', () => ({
  router: { push: jest.fn() },
  useSegments: () => [],
  useLocalSearchParams: () => mockParams,
  Link: Object.assign(({ children }: { children: unknown }) => children, {
    Trigger: ({ children }: { children: unknown }) => children,
    Preview: () => null,
    Menu: () => null,
    MenuAction: () => null,
  }),
}));
jest.mock('../src/api/runtime', () => ({
  catalogs: { bills: jest.fn(), roster: jest.fn(), slugs: jest.fn() },
}));
jest.mock('../src/features/explore/runtime', () => ({
  explore: { year: jest.fn(), pictures: jest.fn() },
}));
jest.mock('../src/features/explore/parts', () => ({
  ExploreChrome: () => null,
}));
jest.mock('../src/features/explore/repository', () => ({
  readExploreChoices: jest.fn(),
  saveExploreChoice: jest.fn(),
}));

let finishChoices: (choices: { year?: number }) => void;
beforeEach(() => {
  jest.clearAllMocks();
  mockParams = {};
  jest.mocked(readExploreChoices).mockReturnValue(
    new Promise((resolve) => {
      finishChoices = resolve;
    }),
  );
  // Keep catalog reads pending so the test observes which year starts loading.
  for (const load of [
    explore.year,
    explore.pictures,
    catalogs.bills,
    catalogs.roster,
    catalogs.slugs,
  ])
    jest.mocked(load).mockReturnValue(new Promise(() => {}));
});
async function mount() {
  let view!: TestRenderer.ReactTestRenderer;
  await act(async () => {
    view = TestRenderer.create(<TimeMachine />);
  });
  return view;
}

test('saved year resolves before any year or shared catalogue starts loading', async () => {
  const view = await mount();
  expect(explore.year).not.toHaveBeenCalled();
  expect(catalogs.bills).not.toHaveBeenCalled();
  expect(
    view.root.findAll((node) => node.props.testID === 'tm-choice-loading'),
  ).not.toHaveLength(0);
  await act(async () => finishChoices({ year: 2008 }));
  expect(explore.year).toHaveBeenCalledTimes(1);
  expect(explore.year).toHaveBeenCalledWith(2008);
});

test('no saved choice loads the default year once after reading the device store', async () => {
  await mount();
  expect(explore.year).not.toHaveBeenCalled();
  await act(async () => finishChoices({}));
  expect(explore.year).toHaveBeenCalledTimes(1);
  expect(explore.year).toHaveBeenCalledWith(defaultYear());
});

test('a linked year takes precedence and starts without waiting for saved choices', async () => {
  mockParams = { year: '2011' };
  await mount();
  expect(readExploreChoices).not.toHaveBeenCalled();
  expect(explore.year).toHaveBeenCalledTimes(1);
  expect(explore.year).toHaveBeenCalledWith(2011);
});

test('leaving before saved choices arrive starts no year read', async () => {
  const view = await mount();
  await act(async () => view.unmount());
  await act(async () => finishChoices({ year: 2008 }));
  expect(explore.year).not.toHaveBeenCalled();
});
