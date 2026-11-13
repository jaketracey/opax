import { HeaderHeightContext } from 'expo-router/react-navigation';
import { act } from 'react';
import {
  ScrollView,
  StyleSheet,
  Text as NativeText,
  useWindowDimensions,
} from 'react-native';
import TestRenderer from 'react-test-renderer';
import { router } from 'expo-router';
import { Icon } from '../src/design/icon';
import { symbols } from '../src/design/symbols';
import TimeMachine from '../src/features/explore/TimeMachine';
import { YearHeader } from '../src/features/explore/YearHeader';
import { YearSheet } from '../src/features/explore/YearMenu';

jest.mock('react-native/Libraries/Utilities/useWindowDimensions', () => ({
  __esModule: true,
  default: jest.fn(),
}));
beforeEach(() => {
  jest.mocked(useWindowDimensions).mockReturnValue({
    width: 320,
    height: 568,
    scale: 3,
    fontScale: 1,
  });
});

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

test.each([1, 3.571])(
  'the year and chevron stay inline before measurement and after switching at font scale %s',
  async (fontScale) => {
    jest.mocked(useWindowDimensions).mockReturnValue({
      width: 320,
      height: 568,
      scale: 3,
      fontScale,
    });
    const view = await mount(<YearHeader year={2022} onYear={jest.fn()} />);
    const check = (year: number) => {
      const button = view.root.find(
        (node) => node.type === 'View' && node.props.testID === 'tm-year-menu',
      );
      expect(StyleSheet.flatten(button.props.style)).toMatchObject({
        flexDirection: 'row',
        flexWrap: 'nowrap',
        alignItems: 'center',
      });
      expect(button.findByType(Icon).props.name).toBe(symbols.menu);
      const label = button.findByType(NativeText);
      expect(label.props.children).toBe(String(year));
      expect(label.props.numberOfLines).toBe(1);
      expect(label.props.adjustsFontSizeToFit).toBe(true);
      expect(label.props.allowFontScaling).toBe(true);
      expect(StyleSheet.flatten(label.props.style).flexShrink).toBe(0);
      let column = label.parent!;
      while (column.type !== 'View') column = column.parent!;
      expect(StyleSheet.flatten(column.props.style)).toMatchObject({
        flexShrink: 1,
        minWidth: 0,
      });
    };
    check(2022);
    const button = view.root.find(
      (node) => node.type === 'View' && node.props.testID === 'tm-year-menu',
    );
    act(() =>
      button.props.onLayout({
        nativeEvent: { layout: { width: 288, height: 70 } },
      }),
    );
    check(2022);
    act(() => view.update(<YearHeader year={2023} onYear={jest.fn()} />));
    check(2023);
  },
);

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

test('a new year starts at its resting top, below the pushed opaque bar', async () => {
  // Pushed like the quiz: react-native-screens lays the page out below the
  // stack's opaque bar, so its scroll view starts at the header's bottom and
  // rests at 0. -116 left a band the header's height above the year.
  mockParams = { year: '2010' };
  const measure = jest
    .spyOn(
      ScrollView.prototype as unknown as {
        measureInWindow: (callback: (x: number, y: number) => void) => void;
      },
      'measureInWindow',
    )
    .mockImplementation((callback) => callback(0, 116));
  const scrollTo = jest
    .spyOn(
      ScrollView.prototype as unknown as { scrollTo: () => void },
      'scrollTo',
    )
    .mockImplementation(() => undefined);
  try {
    const view = await mount(
      <HeaderHeightContext.Provider value={116}>
        <TimeMachine />
      </HeaderHeightContext.Provider>,
    );
    // The prototype mock keeps earlier tests' calls.
    scrollTo.mockClear();
    act(() => view.root.findByType(YearHeader).props.onYear(2001));
    expect(view.root.findByType(YearHeader).props.year).toBe(2001);
    expect(scrollTo).toHaveBeenCalledTimes(1);
    expect(scrollTo).toHaveBeenLastCalledWith({ y: 0, animated: false });
  } finally {
    measure.mockRestore();
    scrollTo.mockRestore();
  }
});
