import { act, isValidElement, type ReactElement, type ReactNode } from 'react';
import TestRenderer from 'react-test-renderer';
import { Dimensions, Text, View } from 'react-native';
import {
  HeaderHeightContext,
  NavigationContext,
  NavigationRouteContext,
} from 'expo-router/react-navigation';
import { SafeAreaInsetsContext } from 'react-native-safe-area-context';
import {
  resetAdaptiveDeviceForTests,
  setWindowTraitsOverride,
  type WindowTraits,
} from '../src/design/adaptive';
import { Screen } from '../src/design/layout';
import { Heading } from '../src/design/text';
import { BarTitle } from '../src/navigation/useTitleOnScroll';

/**
 * b67, Jake on the iPhone Duo: "can we not show the double title on all
 * these pages, just show the big one". On the side rail the bar title used
 * to be set as a plain string the moment a page mounted, so the small title
 * sat in the bar above the page's own large heading. It now reveals as on
 * iPhone: hidden while the heading is on screen, faded in once it has gone
 * under the bar. Staged as tests/duo-audit-widths does it, through the real
 * Screen with its heading anchored by TitleAnchor.
 */

jest.mock('react-native', () => {
  const actual = jest.requireActual('react-native');
  return Object.defineProperties(Object.create(actual), {
    Platform: { value: { ...actual.Platform, OS: 'ios', isPad: false } },
  });
});
let mockBarEdge: 'unspecified' | 'leading' | 'trailing' = 'unspecified';
jest.mock('../modules/opax-root-bar', () => ({
  RootBar: { setSolid: jest.fn(), remove: jest.fn() },
  useVerticalBarEdge: () => mockBarEdge,
}));
jest.mock('../modules/opax-duo', () => ({
  OpaxDuo: null,
  ReservedRegionView: null,
}));
jest.mock('expo-router', () => {
  const React = jest.requireActual('react');
  const { View: NativeView } = jest.requireActual('react-native');
  const Wrap = (props: object) => React.createElement(NativeView, props);
  return {
    Link: Object.assign(Wrap, {
      Trigger: Wrap,
      Preview: () => null,
      Menu: Wrap,
      MenuAction: Wrap,
    }),
    Redirect: () => null,
    useIsPreview: () => false,
    useRouter: () => ({ push: jest.fn() }),
    useNavigation: () => ({ setOptions: jest.fn(), setParams: jest.fn() }),
    useFocusEffect: () => {},
    useSegments: () => [],
    useLocalSearchParams: () => ({}),
    router: { push: jest.fn(), setParams: jest.fn(), dismissTo: jest.fn() },
    Stack: { Screen: () => null },
  };
});

interface Device {
  name: string;
  window: { width: number; height: number };
  traits: WindowTraits | null;
  edge: typeof mockBarEdge;
  insets: { top: number; right: number; bottom: number; left: number };
  /** The native header's bottom edge, in window points. */
  header: number;
}
// The outer display, folded: the bar spans 24 to 82 pt with no large title
// (measured on the simulator in b65), and the rail takes the trailing 80 pt.
const duo: Device = {
  name: 'iPhone Duo, side rail',
  window: { width: 466, height: 678 },
  traits: {
    horizontal: 'compact',
    vertical: 'regular',
    foldable: true,
    verticalBars: true,
  },
  edge: 'trailing',
  insets: { top: 0, right: 80, bottom: 0, left: 0 },
  header: 82,
};
const iPhone: Device = {
  name: 'iPhone 17 Pro',
  window: { width: 402, height: 874 },
  traits: { horizontal: 'compact', vertical: 'regular', foldable: false },
  edge: 'unspecified',
  insets: { top: 62, right: 0, bottom: 34, left: 0 },
  header: 116,
};

// An invented subject: fixtures never name a real donor.
const subject = 'Example Holdings Pty Ltd';
const route = { key: 'money-record-test', name: 'money-record' };
const setOptions = jest.fn();
const navigation = {
  setOptions,
  getState: () => ({
    index: 1,
    routes: [{ key: 'money-root', name: 'money' }, route],
    routeNames: ['money', 'money-record'],
  }),
  addListener: () => () => {},
  isFocused: () => true,
};

// The heading's window frame, as UIKit would report it to measure().
let heading = { pageY: 0, height: 40 };
const nodeMock = () => ({
  measure: (
    callback: (
      x: number,
      y: number,
      width: number,
      height: number,
      pageX: number,
      pageY: number,
    ) => void,
  ) => callback(0, 0, 354, heading.height, 16, heading.pageY),
  measureLayout: (
    _relative: unknown,
    callback: (x: number, y: number, width: number, height: number) => void,
  ) => callback(0, 16, 354, heading.height),
  measureInWindow: (
    callback: (x: number, y: number, width: number, height: number) => void,
  ) => callback(16, heading.pageY, 354, heading.height),
});

const mounted: TestRenderer.ReactTestRenderer[] = [];
afterEach(() => {
  act(() => mounted.splice(0).forEach((tree) => tree.unmount()));
  act(() => {
    setWindowTraitsOverride(null);
    resetAdaptiveDeviceForTests();
  });
  mockBarEdge = 'unspecified';
  setOptions.mockClear();
});

function stage(device: Device, children: ReactNode, barTitle?: string) {
  act(() => {
    const size = { ...device.window, scale: 3, fontScale: 1 };
    Dimensions.set({ window: size, screen: size });
    setWindowTraitsOverride(device.traits);
  });
  mockBarEdge = device.edge;
  let tree!: TestRenderer.ReactTestRenderer;
  act(() => {
    tree = TestRenderer.create(
      <NavigationContext.Provider value={navigation as never}>
        <NavigationRouteContext.Provider value={route}>
          <SafeAreaInsetsContext.Provider value={device.insets}>
            <HeaderHeightContext.Provider value={device.header}>
              <Screen testID="page" barTitle={barTitle}>
                {children}
              </Screen>
            </HeaderHeightContext.Provider>
          </SafeAreaInsetsContext.Provider>
        </NavigationRouteContext.Provider>
      </NavigationContext.Provider>,
    );
  });
  mounted.push(tree);
  // Jest's View hands refs an instance whose measure() never answers. Give
  // the heading's anchor (Screen's TitleAnchor) the window frame UIKit would.
  const anchors = tree.root.findAll(
    (node) =>
      node.type === View &&
      node.props.collapsable === false &&
      node.findAll((child) => child.type === Heading).length > 0,
  );
  const anchor = anchors.at(-1);
  if (anchor) Object.assign(anchor.instance as object, nodeMock());
  const scroll = tree.root.find(
    (node) =>
      typeof node.type !== 'string' &&
      node.props.testID === 'page' &&
      typeof node.props.onLayout === 'function',
  );
  // The scroll view's layout fires again once the window settles.
  const layout = {
    nativeEvent: {
      layout: {
        x: 0,
        y: 0,
        width: device.window.width - device.insets.right,
        height: device.window.height,
      },
    },
  };
  act(() => scroll.props.onLayout(layout));
  act(() => scroll.props.onLayout(layout));
  return {
    tree,
    scrollTo(y: number) {
      act(() =>
        scroll.props.onScroll({
          nativeEvent: {
            contentOffset: { x: 0, y },
            contentInset: { top: 0, left: 0, bottom: 0, right: 0 },
            contentSize: { width: 386, height: 2000 },
            layoutMeasurement: { width: 386, height: 678 },
          },
        }),
      );
    },
  };
}

/** The bar title the stack would draw now: every option set, last wins. */
function barTitle() {
  const resolved = Object.assign(
    {},
    ...setOptions.mock.calls.map(([options]) => options),
  ) as { headerTitle?: unknown; title?: string };
  return resolved;
}
function drawn() {
  const { headerTitle } = barTitle();
  if (typeof headerTitle === 'string') return { kind: 'string' as const };
  if (typeof headerTitle !== 'function') return { kind: 'none' as const };
  const element = (headerTitle as () => ReactElement)();
  expect(isValidElement(element)).toBe(true);
  expect(element.type).toBe(BarTitle);
  return {
    kind: 'reveal' as const,
    props: element.props as {
      title: string;
      shown: boolean;
      trailingWidth?: number;
    },
  };
}

// Direct children, as pages pass them: Screen anchors a level 1 Heading it
// finds among its children (not inside a fragment).
function page() {
  return [
    <Heading key="h1" level={1}>
      {subject}
    </Heading>,
    <Text key="lede">Donations disclosed to the AEC.</Text>,
    <View key="rest" style={{ height: 1600 }} />,
  ];
}

describe.each([duo, iPhone])('$name', (device) => {
  test('shows only the large title at the top, and the bar title once it has scrolled off', () => {
    // At rest the heading sits just under the bar.
    heading = { pageY: device.header + 16, height: 40 };
    const view = stage(device, page(), subject);
    expect(barTitle().title).toBe(subject);
    const top = drawn();
    expect(top.kind).toBe('reveal');
    expect(top.kind === 'reveal' && top.props.shown).toBe(false);

    // A small scroll that leaves most of the heading in view keeps it hidden.
    heading = { pageY: device.header - 10, height: 40 };
    view.scrollTo(26);
    const partly = drawn();
    expect(partly.kind === 'reveal' && partly.props.shown).toBe(false);

    // Scrolled: the heading's midpoint has gone under the bar.
    heading = { pageY: device.header - 60, height: 40 };
    view.scrollTo(160);
    const scrolled = drawn();
    expect(scrolled.kind).toBe('reveal');
    expect(scrolled.kind === 'reveal' && scrolled.props).toMatchObject({
      title: subject,
      shown: true,
    });

    // Back to the top: the bar title fades out again.
    heading = { pageY: device.header + 16, height: 40 };
    view.scrollTo(0);
    const back = drawn();
    expect(back.kind === 'reveal' && back.props.shown).toBe(false);
  });

  test('a page with no large title keeps its stack title', () => {
    heading = { pageY: device.header + 16, height: 40 };
    stage(device, [
      <Text key="lede">Results without a page heading.</Text>,
      <View key="rest" style={{ height: 1600 }} />,
    ]);
    expect(drawn().kind).toBe('none');
  });
});

test('on the rail the bar title keeps no room for items, which sit on the rail', () => {
  heading = { pageY: duo.header - 60, height: 40 };
  const rail = stage(duo, page(), subject);
  rail.scrollTo(160);
  const onRail = drawn();
  expect(onRail.kind === 'reveal' && onRail.props.trailingWidth).toBe(0);
  act(() => rail.tree.unmount());
  mounted.splice(0);
  setOptions.mockClear();
  const phone = stage(iPhone, page(), subject);
  phone.scrollTo(160);
  const onPhone = drawn();
  expect(onPhone.kind === 'reveal' && onPhone.props.trailingWidth).toBe(
    undefined,
  );
});
