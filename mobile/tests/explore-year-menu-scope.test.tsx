import { act } from 'react';
import TestRenderer from 'react-test-renderer';
import { router } from 'expo-router';
import TimeMachine from '../src/features/explore/TimeMachine';
import { YearHeader } from '../src/features/explore/YearHeader';
import { YearSheet } from '../src/features/explore/YearMenu';

let mockParams: Record<string, string> = {};
jest.mock('expo-router', () => ({
  router: { push: jest.fn(), back: jest.fn() },
  useSegments: () => [],
  useLocalSearchParams: () => mockParams,
  Link: Object.assign(({ children }: { children: unknown }) => children, {
    Trigger: ({ children }: { children: unknown }) => children,
    Preview: () => null,
    Menu: () => null,
    MenuAction: () => null,
  }),
}));
jest.mock('../src/api/useRead', () => ({
  useRead: () => ({ record: null, error: null, retry: jest.fn() }),
}));
jest.mock('../src/api/runtime', () => ({ catalogs: {} }));
jest.mock('../src/features/explore/runtime', () => ({ explore: {} }));
jest.mock('../src/features/explore/parts', () => ({
  ExploreChrome: () => null,
}));
jest.mock('../src/features/explore/repository', () => ({
  readExploreChoices: async () => ({}),
  saveExploreChoice: jest.fn(),
}));

async function mount(element: React.ReactElement) {
  let view!: TestRenderer.ReactTestRenderer;
  await act(async () => {
    view = TestRenderer.create(element);
  });
  return view;
}
function press(view: TestRenderer.ReactTestRenderer, id: string) {
  act(() =>
    view.root
      .find(
        (node) =>
          node.props.testID === id && typeof node.props.onPress === 'function',
      )
      .props.onPress(),
  );
}
async function openSheet(view: TestRenderer.ReactTestRenderer) {
  press(view, 'tm-year-menu');
  mockParams = (
    jest.mocked(router.push).mock.calls.at(-1)![0] as {
      params: Record<string, string>;
    }
  ).params;
  return mount(<YearSheet year={Number(mockParams.year)} />);
}

test('a year sheet changes only the Time machine that opened it across tabs', async () => {
  mockParams = { year: '2010' };
  const today = await mount(<TimeMachine />);
  mockParams = { year: '2020' };
  const search = await mount(<TimeMachine />);
  const sheet = await openSheet(today);
  press(sheet, 'tm-years-2001');
  expect(today.root.findByType(YearHeader).props.year).toBe(2001);
  expect(search.root.findByType(YearHeader).props.year).toBe(2020);
  expect(router.back).toHaveBeenCalled();
});

test('a sheet whose opener unmounted cannot change another Time machine', async () => {
  mockParams = { year: '2010' };
  const today = await mount(<TimeMachine />);
  mockParams = { year: '2020' };
  const search = await mount(<TimeMachine />);
  const sheet = await openSheet(today);
  act(() => today.unmount());
  press(sheet, 'tm-years-2002');
  expect(search.root.findByType(YearHeader).props.year).toBe(2020);
});
