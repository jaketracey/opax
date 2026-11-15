// RT27-title: with Reduce Transparency or Increase Contrast on, the Bills
// tab's bar takes its solid ground only once the list has scrolled under
// it. The list is not a Screen, so it reports that itself, and only then.
import { act } from 'react';
import { FlatList, Platform, useWindowDimensions } from 'react-native';
import TestRenderer from 'react-test-renderer';
import { Catalogs } from '../src/api/catalogs';
import { catalogs as runtime } from '../src/api/runtime';
import BillsList, { PushedBillsList } from '../src/features/bills/BillsList';
import { useRootBarUnderBar } from '../src/navigation/useRootBarAppearance';
import { pinned, slugs } from './pinned';

jest.mock('expo-router', () => ({
  useIsPreview: () => false,
  useSegments: () => [],
  useLocalSearchParams: () => ({}),
  router: { push: jest.fn() },
  useNavigation: () => ({ setParams: jest.fn() }),
  useIsFocused: () => true,
  Stack: {
    Screen: () => null,
    Toolbar: Object.assign(() => null, {
      Button: () => null,
      Spacer: () => null,
    }),
  },
  Link: Object.assign(({ children }: { children?: unknown }) => children, {
    Trigger: ({ children }: { children?: unknown }) => children,
    Preview: () => null,
    Menu: () => null,
    MenuAction: () => null,
  }),
}));
jest.mock('../src/api/runtime', () => ({
  catalogs: {
    bills: jest.fn(),
    billFor: jest.fn(),
    billIndexRow: () => null,
    roster: jest.fn(),
    slugs: jest.fn(),
  },
}));
jest.mock('react-native/Libraries/Utilities/useWindowDimensions', () => ({
  __esModule: true,
  default: jest.fn(),
}));
let mockSolidBar = false;
jest.mock('../src/design/accessibility', () => ({
  ...jest.requireActual('../src/design/accessibility'),
  useSolidBar: () => mockSolidBar,
}));
jest.mock('../src/navigation/useRootBarAppearance', () => ({
  ...jest.requireActual('../src/navigation/useRootBarAppearance'),
  useRootBarUnderBar: jest.fn(),
}));

const mock = jest.mocked(runtime);
const fixture = new Catalogs({
  get: async (path, decode) => ({
    data: decode(path === '/api/person-slugs' ? slugs : pinned(path)),
    stale: false,
    savedAt: 1000,
    asOf: null,
  }),
});
const os = Platform.OS;
beforeEach(() => {
  jest.clearAllMocks();
  mockSolidBar = false;
  Platform.OS = 'ios';
  jest
    .mocked(useWindowDimensions)
    .mockReturnValue({ width: 390, height: 844, scale: 3, fontScale: 1 });
  mock.bills.mockImplementation((refresh) => fixture.bills(refresh));
  mock.billFor.mockImplementation((key, refresh) =>
    fixture.billFor(key, refresh),
  );
  mock.roster.mockImplementation(() => fixture.roster());
  mock.slugs.mockImplementation(() => fixture.slugs());
});
afterEach(() => {
  Platform.OS = os;
});
async function render(element: React.ReactElement) {
  let renderer!: TestRenderer.ReactTestRenderer;
  await act(async () => {
    renderer = TestRenderer.create(element);
  });
  return renderer;
}
const report = () => jest.mocked(useRootBarUnderBar).mock.calls.at(-1);
const scroll = (renderer: TestRenderer.ReactTestRenderer, y: number) =>
  act(() =>
    renderer.root
      .findByType(FlatList)
      .props.onScroll({ nativeEvent: { contentOffset: { y } } }),
  );

test('with neither legibility setting on, the list attaches no scroll handler and reports nothing', async () => {
  const renderer = await render(<BillsList />);
  expect(renderer.root.findByType(FlatList).props.onScroll).toBeUndefined();
  expect(report()!.slice(0, 2)).toEqual([false, false]);
  await act(async () => renderer.unmount());
});

test('with a solid bar, the list reports when it has scrolled under the bar and when it is back at rest', async () => {
  mockSolidBar = true;
  const renderer = await render(<BillsList />);
  // At rest: reporting, and not under the bar, so the large title shows.
  expect(report()!.slice(0, 2)).toEqual([false, true]);
  expect(renderer.root.findByType(FlatList).props.scrollEventThrottle).toBe(16);
  scroll(renderer, 400);
  expect(report()!.slice(0, 2)).toEqual([true, true]);
  // Back above the bar's foot (the list's own top inset): at rest again.
  scroll(renderer, -400);
  expect(report()!.slice(0, 2)).toEqual([false, true]);
  await act(async () => renderer.unmount());
});

test('a pushed bill list is not the tab’s root and reports nothing', async () => {
  mockSolidBar = true;
  const renderer = await render(<PushedBillsList />);
  expect(renderer.root.findByType(FlatList).props.onScroll).toBeUndefined();
  expect(report()!.slice(0, 2)).toEqual([false, false]);
  await act(async () => renderer.unmount());
});

test('a setting that turns on with the list already scrolled makes the bar solid at once, with no scroll', async () => {
  const version = Object.getOwnPropertyDescriptor(Platform, 'Version')!;
  Object.defineProperty(Platform, 'Version', { configurable: true, value: 26 });
  try {
    const renderer = await render(<BillsList />);
    const list = () => renderer.root.findByType(FlatList);
    // Under a clear bar the list hears its scroll for the fade; where it
    // does not, the list is unheard until the setting is on.
    const heard = typeof list().props.onScroll === 'function';
    if (heard) scroll(renderer, 400);
    mockSolidBar = true;
    await act(async () => renderer.update(<BillsList />));
    const [underBar, enabled] = report()!;
    if (heard) {
      // Solid at once: the page is known to be under the bar.
      expect([underBar, enabled]).toEqual([true, true]);
    } else {
      // Not known: unreported, so the bar keeps its solid ground.
      expect(enabled).toBe(false);
      scroll(renderer, 400);
      expect(report()!.slice(0, 2)).toEqual([true, true]);
    }
    await act(async () => renderer.unmount());
  } finally {
    Object.defineProperty(Platform, 'Version', version);
  }
});
