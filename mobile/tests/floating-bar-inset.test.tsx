import { act, type ReactNode } from 'react';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { Platform, StyleSheet, Text } from 'react-native';
import TestRenderer from 'react-test-renderer';
import {
  NavigationContext,
  NavigationRouteContext,
} from 'expo-router/react-navigation';
import { KeyboardStableScreen, Screen } from '../src/design/layout';
import { rhythm } from '../src/design/tokens';
import {
  floatingBarClearance,
  useFloatingBarFoot,
} from '../src/navigation/floating-bar';

let mockBarEdge = 'unspecified';
jest.mock('../modules/opax-root-bar', () => ({
  RootBar: { setSolid: jest.fn(), remove: jest.fn() },
  useVerticalBarEdge: () => mockBarEdge,
}));
jest.mock('../modules/opax-duo', () => ({
  OpaxDuo: null,
  ReservedRegionView: null,
}));
jest.mock('../modules/opax-ipad', () => ({
  OpaxIPad: { configureWordSafeSidebarLabels: jest.fn() },
  PointerHoverView: null,
}));
jest.mock(
  'react-native-safe-area-context',
  () => jest.requireActual('react-native-safe-area-context/jest/mock').default,
);
jest.mock('../src/design/useHeaderBottom', () => ({
  useHeaderBottom: () => 100,
}));
let mockPad = false;
jest.mock('../src/design/adaptive', () => {
  // A live getter: isPad is a module constant, read at each call.
  return Object.defineProperty(
    { ...jest.requireActual('../src/design/adaptive'), __esModule: true },
    'isPad',
    { enumerable: true, get: () => mockPad },
  );
});
let mockPane: object | null = null;
jest.mock('../src/design/split', () => ({
  ...jest.requireActual('../src/design/split'),
  useSplitPane: () => mockPane,
}));

const tabRoutes = ['index', 'edition', 'bill/[key]', 'explore/[tool]'];
let mockRouteNames = tabRoutes;
const mockRoute = { name: 'edition', key: 'edition-1' };
let mockRoot = false;
const mockNavigation = {
  setOptions: jest.fn(),
  getState: () => ({
    // A pushed page sits above its tab's root; a root is first.
    routes: mockRoot
      ? [mockRoute]
      : [{ name: 'index', key: 'today' }, mockRoute],
    routeNames: mockRouteNames,
  }),
  addListener: () => () => {},
  isFocused: () => true,
};
jest.mock('expo-router', () => ({
  useIsPreview: () => false,
  useNavigation: () => mockNavigation,
  useFocusEffect: () => {},
  useSegments: () => ['(tabs)', '(today)'],
  router: { push: jest.fn(), back: jest.fn() },
  Stack: { Screen: () => null },
}));

const version = Object.getOwnPropertyDescriptor(Platform, 'Version')!;
const os = Object.getOwnPropertyDescriptor(Platform, 'OS')!;
function setPlatform(name: 'ios' | 'android', v: number) {
  Object.defineProperty(Platform, 'OS', { configurable: true, value: name });
  Object.defineProperty(Platform, 'Version', { configurable: true, value: v });
}
afterEach(() => {
  Object.defineProperty(Platform, 'Version', version);
  Object.defineProperty(Platform, 'OS', os);
  mockRouteNames = tabRoutes;
  mockBarEdge = 'unspecified';
  mockRoot = false;
  mockPad = false;
  mockPane = null;
});

function InRoute({ children }: { children: ReactNode }) {
  return (
    <NavigationContext.Provider value={mockNavigation as never}>
      <NavigationRouteContext.Provider value={mockRoute as never}>
        {children}
      </NavigationRouteContext.Provider>
    </NavigationContext.Provider>
  );
}

function footOf(element: ReactNode, testID: string): number {
  let tree!: TestRenderer.ReactTestRenderer;
  act(() => {
    tree = TestRenderer.create(<InRoute>{element}</InRoute>);
  });
  const scroll = tree.root.findAll(
    (node) =>
      node.props.testID === testID &&
      node.props.contentContainerStyle !== undefined,
  )[0]!;
  const bottom = StyleSheet.flatten(scroll.props.contentContainerStyle)
    .paddingBottom as number;
  act(() => tree.unmount());
  return bottom;
}

const page = (
  <Screen testID="page">
    <Text>Last card</Text>
  </Screen>
);

describe('floating Today and Search buttons', () => {
  it('a pushed tab page ends above the floating buttons on iOS 26', () => {
    setPlatform('ios', 26);
    // The buttons are 44pt; the last card keeps a full section gap above them.
    expect(floatingBarClearance).toBeGreaterThanOrEqual(44);
    expect(footOf(page, 'page')).toBe(rhythm.section + floatingBarClearance);
  });

  it('the keyboard screen gets the same clearance', () => {
    setPlatform('ios', 26);
    const keyboardPage = (
      <KeyboardStableScreen testID="form" keyboardTarget={{ current: null }}>
        <Text>Form</Text>
      </KeyboardStableScreen>
    );
    expect(footOf(keyboardPage, 'form')).toBe(
      rhythm.section + floatingBarClearance,
    );
  });

  it('keeps the plain foot where nothing floats over the page', () => {
    // Before iOS 26 the tab bar is solid and UIKit insets for it.
    setPlatform('ios', 18);
    expect(footOf(page, 'page')).toBe(rhythm.section);
    // Android draws its own tab bar below the content.
    setPlatform('android', 35);
    expect(footOf(page, 'page')).toBe(rhythm.section);
    // A sheet's stack (account, sources) has no tab bar.
    setPlatform('ios', 26);
    mockRouteNames = ['index', 'delete'];
    expect(footOf(page, 'page')).toBe(rhythm.section);
    // A vertical Duo bar sits beside the content, not over its end.
    mockRouteNames = tabRoutes;
    mockBarEdge = 'trailing';
    expect(footOf(page, 'page')).toBe(rhythm.section);
  });

  it('a tab root gets no foot: UIKit already insets it for the full bar', () => {
    setPlatform('ios', 26);
    mockRoot = true;
    expect(footOf(page, 'page')).toBe(rhythm.section);
  });

  it('iPad and split panes get no foot', () => {
    setPlatform('ios', 26);
    const foot = () => {
      const seen: ReturnType<typeof useFloatingBarFoot>[] = [];
      function Probe() {
        seen.push(useFloatingBarFoot());
        return null;
      }
      let tree!: TestRenderer.ReactTestRenderer;
      act(() => {
        tree = TestRenderer.create(
          <InRoute>
            <Probe />
          </InRoute>,
        );
      });
      act(() => tree.unmount());
      return seen.at(-1);
    };
    // The same pushed page on a phone does get it.
    expect(foot()).toEqual({
      paddingBottom: rhythm.section + floatingBarClearance,
    });
    // iPad draws its tab bar at the top.
    mockPad = true;
    expect(foot()).toBeNull();
    mockPad = false;
    // A split pane's detail column has no floating buttons over it.
    mockPane = { selection: null };
    expect(foot()).toBeNull();
  });

  it('list pages add the clearance to their own foot', () => {
    setPlatform('ios', 26);
    const seen: ReturnType<typeof useFloatingBarFoot>[] = [];
    function Probe() {
      seen.push(useFloatingBarFoot(rhythm.section * 2));
      return null;
    }
    let tree!: TestRenderer.ReactTestRenderer;
    act(() => {
      tree = TestRenderer.create(
        <InRoute>
          <Probe />
        </InRoute>,
      );
    });
    act(() => tree.unmount());
    expect(seen.at(-1)).toEqual({
      paddingBottom: rhythm.section * 2 + floatingBarClearance,
    });
  });

  it('every tab page that draws its own list uses the clearance', () => {
    const pages = [
      'features/vic-election/shared.tsx',
      'features/people/PartySources.tsx',
      'features/people/PersonLists.tsx',
      'features/people/RecordList.tsx',
      'features/records/ReaderList.tsx',
      'features/declarations/Declarations.tsx',
      'features/sources/PortraitsList.tsx',
      'features/directories/DirectoryScreen.tsx',
      'features/money-public/parts.tsx',
      'features/directories/DivisionHistory.tsx',
      'features/explore/PhotoCredits.tsx',
      'features/records/BillTextContents.tsx',
    ];
    for (const file of pages) {
      const source = readFileSync(join(__dirname, '../src', file), 'utf8');
      expect([file, /useFloatingBarFoot\(/.test(source)]).toEqual([file, true]);
      expect([
        file,
        /contentContainerStyle=\{(?:\[[^\]]*)?\bfoot\b/.test(source),
      ]).toEqual([file, true]);
    }
  });
});
