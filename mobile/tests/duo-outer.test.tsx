import { act, createRef, type ReactNode } from 'react';
import TestRenderer from 'react-test-renderer';
import {
  Dimensions,
  Platform,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';
import { SafeAreaInsetsContext } from 'react-native-safe-area-context';
import {
  HeaderHeightContext,
  NavigationContext,
  NavigationRouteContext,
} from 'expo-router/react-navigation';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import ts from 'typescript';
import { RootBar } from '../modules/opax-root-bar';
import { OpaxIPad } from '../modules/opax-ipad';
import TabsLayout from '../src/app/(tabs)/_layout';
import {
  resetAdaptiveDeviceForTests,
  setWindowTraitsOverride,
  useLayout,
} from '../src/design/adaptive';
import { emptyReservedRegions, type Rect } from '../src/design/fold';
import { ReservedRegionsProvider } from '../src/design/fold-area';
import { KeyboardStableScreen, Screen } from '../src/design/layout';
import { SheetFrame } from '../src/features/sheets/frame';
import { ConsentSheet } from '../src/features/talk/Consent';
import { talkDockPlacement } from '../src/features/talk/geometry';
import { emptySnapshot } from '../src/features/talk/model';
import TalkScreen from '../src/features/talk/TalkScreen';
import Welcome from '../src/features/welcome/Welcome';
import { splashLayout } from '../src/launch/choreography';
import { LaunchHandoff } from '../src/launch/LaunchHandoff';
import { BarTitle, barTitleWidth } from '../src/navigation/useTitleOnScroll';
import { useRootBarAppearance } from '../src/navigation/useRootBarAppearance';
import { barScrollEdges } from '../src/navigation/chrome';

let mockBarEdge = 'unspecified';
let mockReducedMotion = true;
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
const mockSetOptions = jest.fn();
const mockRoute = { name: 'bills', key: 'outer-bills' };
const mockNavigation = {
  setOptions: mockSetOptions,
  getState: () => ({
    routes: [mockRoute],
    routeNames: ['bills', 'bill/[key]', 'explore/[tool]'],
  }),
  addListener: () => () => {},
  isFocused: () => true,
};
jest.mock('expo-router', () => ({
  useIsPreview: () => false,
  useNavigation: () => mockNavigation,
  useFocusEffect: () => {},
  useSegments: () => ['(tabs)', '(bills)'],
  router: { push: jest.fn(), back: jest.fn() },
  Stack: { Screen: () => null },
}));
jest.mock('expo-router/unstable-native-tabs', () => {
  const { View } = jest.requireActual('react-native');
  return {
    NativeTabs: Object.assign(View, {
      Trigger: Object.assign(() => null, {
        Label: () => null,
        Icon: () => null,
      }),
    }),
  };
});
jest.mock('../src/design/accessibility', () => ({
  ...jest.requireActual('../src/design/accessibility'),
  useReduceMotion: () => true,
  useReduceMotionSetting: () => mockReducedMotion,
}));
jest.mock('../src/design/useHeaderBottom', () => ({
  useHeaderBottom: () => 100,
}));
jest.mock('../src/features/your-mp/useSeat', () => ({
  useSeat: () => ({ status: 'none' }),
}));
jest.mock('../src/onboarding/state', () => ({
  closeWelcome: jest.fn(),
  markWelcomeSeen: jest.fn(),
}));
jest.mock('expo-splash-screen', () => ({
  preventAutoHideAsync: jest.fn(async () => undefined),
  hide: jest.fn(),
}));
jest.mock('../src/features/talk/VoiceOrb', () => ({ VoiceOrb: () => null }));
jest.mock('../src/features/talk/useVoiceLevels', () => ({
  useVoiceLevels: () => ({}),
}));
jest.mock('../src/features/talk/captions-preference', () => ({
  useCaptionsPreference: () => [false, jest.fn()],
}));
jest.mock('../src/features/Person', () => ({ ProfileScreen: () => null }));
jest.mock('../src/features/Electorate', () => ({
  ElectorateScreen: () => null,
}));
jest.mock('../src/features/bills/BillDetail', () => () => null);
jest.mock('../src/features/records/DocumentReader', () => () => null);
jest.mock('../src/features/records/BillTextReader', () => () => null);
const mockCall = {
  snapshot: {
    ...emptySnapshot,
    state: 'live',
    mode: 'listening',
    status: {
      signedIn: true,
      enabled: true,
      remainingSeconds: 480,
      totalSeconds: 600,
    },
  },
  consent: true,
  consentLoaded: true,
  active: true,
  terminal: null,
  error: null,
  busy: false,
  end: jest.fn(),
  mute: jest.fn(),
  send: jest.fn(),
  startConsented: jest.fn(),
};
jest.mock('../src/features/talk/useTalk', () => ({ useTalk: () => mockCall }));

const zero = { top: 0, bottom: 0, left: 0, right: 0 };
const asymmetric = { ...zero, right: 60 };
const outer = { width: 380, height: 560, scale: 3, fontScale: 1 };
const mounted: TestRenderer.ReactTestRenderer[] = [];
function render(
  children: ReactNode,
  insets = asymmetric,
  regions = emptyReservedRegions,
) {
  let tree!: TestRenderer.ReactTestRenderer;
  act(() => {
    tree = TestRenderer.create(
      <SafeAreaInsetsContext.Provider value={insets}>
        <ReservedRegionsProvider value={regions}>
          {children}
        </ReservedRegionsProvider>
      </SafeAreaInsetsContext.Provider>,
    );
  });
  mounted.push(tree);
  return tree;
}
function setWindow(width: number, height: number, inner = false) {
  const window = { ...outer, width, height };
  Dimensions.set({ window, screen: window });
  act(() =>
    setWindowTraitsOverride({
      horizontal: inner ? 'regular' : 'compact',
      vertical: 'regular',
      foldable: true,
    }),
  );
}
const host = (tree: TestRenderer.ReactTestRenderer, id: string) =>
  tree.root.find(
    (node) => node.props.testID === id && typeof node.type === 'string',
  );
const style = (tree: TestRenderer.ReactTestRenderer, id: string) =>
  StyleSheet.flatten(host(tree, id).props.style);
const overlaps = (a: Rect, b: Rect) =>
  a.x < b.x + b.width &&
  a.x + a.width > b.x &&
  a.y < b.y + b.height &&
  a.y + a.height > b.y;
const mark = (square: { x: number; y: number; size: number }): Rect => ({
  ...square,
  width: square.size,
  height: square.size,
});
beforeEach(() => {
  jest.clearAllMocks();
  mockBarEdge = 'unspecified';
  mockReducedMotion = true;
  Object.defineProperty(Platform, 'Version', { value: 27, configurable: true });
  act(() => resetAdaptiveDeviceForTests());
  setWindow(380, 560);
});
afterEach(() => {
  act(() => mounted.splice(0).forEach((tree) => tree.unmount()));
  act(() => {
    setWindowTraitsOverride(undefined);
    resetAdaptiveDeviceForTests();
  });
});

describe('safe launch geometry', () => {
  test('leading and trailing insets have different centres', () => {
    const trailing = splashLayout({ ...outer, safeArea: asymmetric });
    const leading = splashLayout({ ...outer, safeArea: { ...zero, left: 60 } });
    expect(leading.canvas.x - trailing.canvas.x).toBe(60);
  });
  test('inactive regions leave the flat display unchanged', () => {
    const frame = {
      width: 620,
      height: 820,
      fontScale: 1,
      safeArea: asymmetric,
    };
    expect(
      splashLayout({
        ...frame,
        regions: {
          divisions: [{ x: 300, y: 0, width: 0, height: 820, active: false }],
          occlusions: [
            { x: 260, y: 200, width: 80, height: 200, active: false },
          ],
        },
      }),
    ).toEqual(splashLayout(frame));
  });
  test('the unfold crossfades if its travel envelope would meet a camera', () => {
    mockReducedMotion = false;
    const regions = {
      divisions: [],
      occlusions: [{ x: 90, y: 260, width: 20, height: 20, active: true }],
    };
    expect(
      splashLayout({ ...outer, safeArea: asymmetric, regions }).travelClear,
    ).toBe(false);
    const tree = render(
      <LaunchHandoff ready={false} onDone={jest.fn()} />,
      asymmetric,
      regions,
    );
    expect(host(tree, 'launch-handoff-star-settled')).toBeTruthy();
  });
  test.each([
    [380, 560],
    [320, 560],
    [620, 820],
    [820, 620],
  ])('%ix%i centres in each safe side independently', (width, height) => {
    const layout = splashLayout({
      width,
      height,
      fontScale: 1,
      safeArea: asymmetric,
    });
    const centre = (width - asymmetric.right) / 2;
    expect(layout.canvas.x + 100).toBe(centre);
    expect(layout.star.to.x + layout.star.to.size / 2).toBeCloseTo(centre);
    expect(layout.block.left).toBeGreaterThanOrEqual(0);
    expect(layout.block.left + layout.block.width).toBeLessThanOrEqual(
      width - asymmetric.right,
    );
    expect(layout.block.top + layout.block.height).toBeLessThan(height);
    expect(layout.star.to.y).toBeGreaterThanOrEqual(0);
  });
  test.each([
    {
      divisions: [],
      occlusions: [{ x: 120, y: 160, width: 80, height: 150, active: true }],
    },
    {
      divisions: [{ x: 300, y: 0, width: 20, height: 820, active: true }],
      occlusions: [],
    },
    {
      divisions: [{ x: 0, y: 300, width: 820, height: 20, active: true }],
      occlusions: [],
    },
  ])('the mark and settled name clear active regions: %j', (regions) => {
    const layout = splashLayout({
      width: 820,
      height: 820,
      fontScale: 1,
      safeArea: asymmetric,
      regions,
    });
    const name = {
      x: layout.block.left,
      y: layout.block.top,
      width: layout.block.width,
      height: layout.block.height,
    };
    for (const obstacle of [...regions.divisions, ...regions.occlusions])
      for (const rect of [mark(layout.star.from), mark(layout.star.to), name])
        expect(overlaps(rect, obstacle)).toBe(false);
  });
  test('the outer camera displaces the whole native lockup and settled group', () => {
    const camera = { x: 130, y: 170, width: 60, height: 150, active: true };
    const layout = splashLayout({
      ...outer,
      safeArea: asymmetric,
      regions: { divisions: [], occlusions: [camera] },
    });
    expect(overlaps(mark(layout.star.from), camera)).toBe(false);
    expect(overlaps(mark(layout.star.to), camera)).toBe(false);
    expect(layout.star.from.y).toBeGreaterThanOrEqual(0);
    expect(layout.block.top + layout.block.height).toBeLessThanOrEqual(560);
  });
  test('the rendered cover consumes the local camera and asymmetric safe area', () => {
    const camera = { x: 130, y: 170, width: 60, height: 150, active: true };
    const regions = { divisions: [], occlusions: [camera] };
    const tree = render(
      <LaunchHandoff ready={false} onDone={jest.fn()} />,
      asymmetric,
      regions,
    );
    const expected = splashLayout({ ...outer, safeArea: asymmetric, regions });
    expect(style(tree, 'launch-handoff-star')).toMatchObject({
      left: expected.star.from.x,
      top: expected.star.from.y,
    });
  });
  test('an ordinary phone retains the native artwork and existing journey', () => {
    act(() => {
      setWindowTraitsOverride({
        horizontal: 'compact',
        vertical: 'regular',
        foldable: false,
      });
      resetAdaptiveDeviceForTests();
    });
    const phone = { ...outer, width: 390, height: 844 };
    Dimensions.set({ window: phone, screen: phone });
    const tree = render(<LaunchHandoff ready={false} onDone={jest.fn()} />, {
      ...zero,
      top: 59,
      bottom: 34,
    });
    expect(style(tree, 'launch-handoff-star')).toMatchObject({
      left: 165,
      top: 368,
      width: 60,
      height: 60,
    });
    expect(style(tree, 'launch-handoff-wordmark')).toMatchObject({
      left: 95,
      top: 362,
    });
  });
});

describe('compact outer surfaces', () => {
  test('Welcome keeps its content and Continue clear of the trailing bar', () => {
    const tree = render(<Welcome />);
    const scroll = tree.root.findByType(ScrollView);
    expect(
      StyleSheet.flatten(scroll.props.contentContainerStyle),
    ).toMatchObject({ paddingLeft: 16, paddingRight: 76 });
    const footer = host(tree, 'welcome-continue').parent;
    expect(footer).toBeTruthy();
    const padded = tree.root
      .findAllByType(View)
      .map((node) => StyleSheet.flatten(node.props.style))
      .filter((value) => value?.paddingRight === 76);
    expect(padded.length).toBeGreaterThan(0);
    expect(host(tree, 'welcome-continue').props.disabled).not.toBe(true);
  });
  test('Welcome uses the rule on the inner display', () => {
    setWindow(620, 820, true);
    const tree = render(<Welcome />, zero);
    expect(style(tree, 'welcome-mark')).toMatchObject({
      width: 72,
      height: 72,
    });
  });
  test('Talk keeps its controls reachable and reserves room above the camera', () => {
    const camera = { x: 100, y: 470, width: 80, height: 90, active: true };
    const tree = render(<TalkScreen />, asymmetric, {
      divisions: [],
      occlusions: [camera],
    });
    act(() =>
      host(tree, 'talk-sheet').props.onLayout({
        nativeEvent: { layout: { x: 0, y: 0, width: 320, height: 560 } },
      }),
    );
    act(() =>
      host(tree, 'talk-sheet-message').props.onLayout({
        nativeEvent: { layout: { x: 20, y: 448, width: 280, height: 96 } },
      }),
    );
    expect(style(tree, 'talk-sheet').paddingBottom).toBe(90);
    for (const id of ['talk-mute', 'talk-type', 'talk-sources', 'talk-end'])
      expect(host(tree, id)).toBeTruthy();
    const placement = talkDockPlacement(
      { x: 0, y: 0, width: 320, height: 560 },
      { width: 280, height: 96 },
      16,
      20,
      { divisions: [], occlusions: [camera] },
    );
    expect(
      overlaps(
        {
          x: 20 + placement.translateX,
          y: 560 - placement.paddingBottom - 96,
          width: 280,
          height: 96,
        },
        camera,
      ),
    ).toBe(false);
  });
  test('fitted sheets and consent apply left and right independently', () => {
    const fitted = render(
      <SheetFrame title="Source" short testID="outer-sheet">
        <View />
      </SheetFrame>,
    );
    expect(style(fitted, 'outer-sheet')).toMatchObject({
      paddingLeft: 16,
      paddingRight: 76,
    });
    mockBarEdge = 'trailing';
    const consent = render(<ConsentSheet />);
    expect(style(consent, 'talk-consent-sheet')).toMatchObject({
      paddingLeft: 0,
      paddingRight: 60,
      maxHeight: 560,
    });
  });
  test.each([Screen, KeyboardStableScreen])(
    'scroll screens sit in a side safe area and report the usable column',
    (Component) => {
      let width = 0;
      function Probe() {
        width = useLayout().width;
        return <View />;
      }
      const tree = render(
        <Component testID="outer-scroll" keyboardTarget={createRef<View>()}>
          <Probe />
        </Component>,
      );
      // Seen on the iPhone Duo simulator (11 Nov 2026): UIKit's automatic
      // adjustment insets scroll content vertically only, so content ran
      // under a trailing vertical tab bar. SidebarSafe now pads each side by
      // the screen's own insets on an adaptive iPhone, and the scroll view
      // measures the 320pt left inside a 380pt window with a 60pt bar.
      expect(
        tree.root.findAll(
          (node) =>
            Array.isArray(node.props.edges) &&
            node.props.edges.includes('left') &&
            node.props.edges.includes('right') &&
            node.props.mode === 'padding',
        ).length,
      ).toBeGreaterThan(0);
      act(() =>
        host(tree, 'outer-scroll').props.onLayout({
          nativeEvent: { layout: { x: 0, y: 0, width: 320, height: 560 } },
        }),
      );
      expect(width).toBe(288);
      expect(
        host(tree, 'outer-scroll').props.contentInsetAdjustmentBehavior,
      ).toBe('automatic');
      expect(
        StyleSheet.flatten(
          host(tree, 'outer-scroll').props.contentContainerStyle,
        ),
      ).toMatchObject({ paddingHorizontal: 16 });
    },
  );
});

describe('system navigation on both displays', () => {
  test('scroll edge protection follows the actual bar side', () => {
    expect(barScrollEdges('leading')).toMatchObject({
      left: 'hard',
      right: 'soft',
    });
    expect(barScrollEdges('trailing')).toMatchObject({
      left: 'soft',
      right: 'hard',
    });
    expect(barScrollEdges('unspecified')).toEqual({
      top: 'hard',
      bottom: 'soft',
    });
  });
  test.each([false, true])(
    'phone tabs stay system tabs without a sidebar, inner: %s',
    (inner) => {
      setWindow(inner ? 620 : 380, inner ? 820 : 560, inner);
      const tree = render(<TabsLayout />);
      const tabs = tree.root.findByProps({ sidebarAdaptable: false });
      expect(tabs).toBeTruthy();
      expect(OpaxIPad?.configureWordSafeSidebarLabels).not.toHaveBeenCalled();
    },
  );
  test('a vertical root bar uses system appearance and a system title', () => {
    mockBarEdge = 'trailing';
    // A tab root keeps the route title UIKit draws. Pushed pages reveal
    // their bar title on scroll, as on iPhone (duo-single-title, b67).
    function Probe() {
      useRootBarAppearance(mockSetOptions);
      return null;
    }
    render(
      <NavigationContext.Provider value={mockNavigation as never}>
        <NavigationRouteContext.Provider value={mockRoute}>
          <HeaderHeightContext.Provider value={560}>
            <Probe />
          </HeaderHeightContext.Provider>
        </NavigationRouteContext.Provider>
      </NavigationContext.Provider>,
    );
    expect(RootBar?.setSolid).not.toHaveBeenCalled();
    for (const [options] of mockSetOptions.mock.calls)
      expect(options).not.toHaveProperty('headerTitle');
    expect(mockSetOptions).toHaveBeenCalledWith(
      expect.objectContaining({
        headerStyle: {},
        headerTransparent: true,
      }),
    );
  });
  test('custom horizontal titles measure the safe content width', () => {
    const tree = render(<BarTitle title="Public money" shown trailing={1} />);
    expect(style(tree, 'bar-title').maxWidth).toBe(barTitleWidth(320, 1));
  });
  test('current phones with symmetric insets retain their title width', () => {
    act(() => {
      setWindowTraitsOverride({
        horizontal: 'compact',
        vertical: 'regular',
        foldable: false,
      });
      resetAdaptiveDeviceForTests();
    });
    const tree = render(<BarTitle title="Public money" shown trailing={1} />, {
      ...zero,
      left: 47,
      right: 47,
    });
    expect(style(tree, 'bar-title').maxWidth).toBe(barTitleWidth(380, 1));
  });
});

function files(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) =>
    entry.isDirectory()
      ? files(join(directory, entry.name))
      : [join(directory, entry.name)],
  );
}
const owned = [
  'src/navigation',
  'src/launch',
  'src/features/welcome',
  'src/features/talk',
  'src/features/sheets',
]
  .flatMap((path) => files(join(__dirname, '..', path)))
  .concat(join(__dirname, '../src/design/layout.tsx'));
test('owned surfaces never collapse the safe-area sides into one inset', () => {
  const offenders = owned.filter((file) =>
    /insets\.left\s*\*\s*2|2\s*\*\s*insets\.left|Math\.max\(\s*insets\.left\s*,\s*insets\.right|paddingHorizontal:\s*[^,\n]*insets\.(left|right)/.test(
      readFileSync(file, 'utf8'),
    ),
  );
  expect(offenders).toEqual([]);
});
test('every owned native toolbar symbol has a label that Expo maps to its UIKit title', () => {
  const offenders: string[] = [];
  for (const file of owned.filter((path) => /\.tsx?$/.test(path))) {
    const source = ts.createSourceFile(
      file,
      readFileSync(file, 'utf8'),
      ts.ScriptTarget.Latest,
      true,
      file.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
    );
    function visit(node: ts.Node) {
      if (ts.isObjectLiteralExpression(node)) {
        const props = node.properties.filter(ts.isPropertyAssignment);
        const prop = (name: string) =>
          props.find((item) => item.name.getText(source) === name)?.initializer;
        const type = prop('type');
        if (
          prop('icon') &&
          type &&
          ts.isStringLiteral(type) &&
          ['button', 'menu', 'action', 'submenu'].includes(type.text) &&
          !prop('label')
        )
          offenders.push(
            `${file}:${source.getLineAndCharacterOfPosition(node.getStart()).line + 1}`,
          );
      }
      ts.forEachChild(node, visit);
    }
    visit(source);
  }
  expect(offenders).toEqual([]);
});
test('all native modules use their own screen and the root bar guards 27.1 APIs', () => {
  expect(
    files(join(__dirname, '../modules')).filter((file) =>
      readFileSync(file, 'utf8').includes('UIScreen.main'),
    ),
  ).toEqual([]);
  const native = readFileSync(
    join(__dirname, '../modules/opax-root-bar/ios/VerticalBarObserver.swift'),
    'utf8',
  );
  expect(native).toContain('#if OPAX_VERTICAL_BARS');
  expect(native).toContain('if #available(iOS 27.1, *)');
  expect(native).toContain('systemTraitsAffectingVerticalBarEdge');
  expect(native).toContain('traitCollection.verticalBarEdge');
});
