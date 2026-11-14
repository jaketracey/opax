import { act, type ReactElement } from 'react';
import TestRenderer from 'react-test-renderer';
import {
  Dimensions,
  Platform,
  ScrollView,
  StyleSheet,
  type LayoutChangeEvent,
} from 'react-native';
import {
  SafeAreaProvider,
  SafeAreaInsetsContext,
} from 'react-native-safe-area-context';
import {
  HeaderHeightContext,
  NavigationRouteContext,
} from 'expo-router/react-navigation';
import { DescriptorsContext } from 'expo-router/build/fork/native-stack/descriptors-context';
import type { WindowTraits } from '../src/design/adaptive';
import type { NativeStackNavigationOptions } from 'expo-router';
import AskConsent from '../src/features/ask/AskConsent';
import { ConsentSheet } from '../src/features/talk/Consent';
import { SHEET_HEADER } from '../src/features/sheets/fitted';
import { withNavigationOptions } from './navigation-options';

jest.mock('react-native', () => {
  const actual = jest.requireActual('react-native');
  return Object.defineProperties(Object.create(actual), {
    Platform: {
      value: {
        ...actual.Platform,
        isPad: false,
      },
    },
  });
});
jest.mock('../src/design/adaptive', () => ({
  ...jest.requireActual('../src/design/adaptive'),
  useWindowTraits: () => mockTraits,
}));
let mockTraits: WindowTraits | null = null;

jest.mock('expo-router', () => ({
  useIsPreview: () => false,
  router: { back: jest.fn(), canGoBack: () => true },
}));
jest.mock('../src/features/ask/session', () => ({
  askSession: { release: jest.fn() },
  continueHeld: jest.fn(),
}));
jest.mock('../src/features/ask/AnswerView', () => ({
  machineNote: { title: 'Machine-written', body: ['Check the records.'] },
}));
jest.mock('../src/features/talk/bridge', () => ({ setConsent: jest.fn() }));
jest.mock('../src/features/talk/measure', () => ({
  trackTalkConsent: jest.fn(),
}));
jest.mock('../src/navigation/external', () => ({ openOnWeb: jest.fn() }));
jest.mock('../modules/opax-root-bar', () => ({
  useVerticalBarEdge: () => mockVerticalBar,
}));
let mockVerticalBar = 'unspecified';

const sheets = [
  {
    name: 'Ask',
    component: <AskConsent />,
    actions: ['ask-consent-continue', 'ask-consent-not-now'],
  },
  {
    name: 'Talk',
    component: <ConsentSheet />,
    actions: ['talk-agree', 'talk-not-now'],
  },
];
const originalWindow = Dimensions.get('window');
const originalScreen = Dimensions.get('screen');
const mounted: TestRenderer.ReactTestRenderer[] = [];
afterEach(() => {
  act(() => {
    mounted.splice(0).forEach((view) => view.unmount());
    Dimensions.set({ window: originalWindow, screen: originalScreen });
  });
  mockVerticalBar = 'unspecified';
  Object.assign(Platform, { isPad: false });
  mockTraits = null;
});

interface Pose {
  width: number;
  height: number;
  isPad?: boolean;
  traits?: WindowTraits | null;
  top?: number;
  bottom?: number;
  header?: number;
  fontScale?: number;
  nativeProps?: NativeStackNavigationOptions['unstable_nativeProps'];
}
const regular: WindowTraits = {
  horizontal: 'regular',
  vertical: 'regular',
  foldable: false,
};
const compact: WindowTraits = { ...regular, horizontal: 'compact' };

function render(component: ReactElement, pose: Pose) {
  const {
    width,
    height,
    top = 24,
    bottom = 20,
    header = SHEET_HEADER,
    fontScale = 3.12,
  } = pose;
  Object.assign(Platform, { isPad: pose.isPad ?? false });
  mockTraits = pose.traits ?? null;
  act(() => {
    const size = { width, height, scale: 2, fontScale };
    Dimensions.set({ window: size, screen: size });
  });
  let options: NativeStackNavigationOptions = {};
  const route = { key: 'current', name: 'consent' };
  const descriptors = {
    current: { options: { unstable_nativeProps: pose.nativeProps } },
  };
  let view!: TestRenderer.ReactTestRenderer;
  let currentTop = top;
  let currentHeader = header;
  const tree = () =>
    withNavigationOptions(
      <NavigationRouteContext.Provider value={route}>
        <DescriptorsContext.Provider value={descriptors as never}>
          <SafeAreaProvider
            initialMetrics={{
              frame: { x: 0, y: 0, width, height },
              insets: { top, bottom, left: 0, right: 0 },
            }}
          >
            <SafeAreaInsetsContext.Provider
              value={{ top: currentTop, bottom, left: 0, right: 0 }}
            >
              <HeaderHeightContext.Provider value={currentHeader}>
                {component}
              </HeaderHeightContext.Provider>
            </SafeAreaInsetsContext.Provider>
          </SafeAreaProvider>
        </DescriptorsContext.Provider>
      </NavigationRouteContext.Provider>,
      (next) => {
        options = next;
      },
    );
  act(() => {
    view = TestRenderer.create(tree());
  });
  mounted.push(view);
  return {
    scroll: () => view.root.findByType(ScrollView),
    cap: (): number =>
      StyleSheet.flatten(view.root.findByType(ScrollView).props.style)
        .maxHeight,
    options: () => options,
    resize: (
      width: number,
      height: number,
      nextTop = top,
      nextHeader = header,
    ) =>
      act(() => {
        currentTop = nextTop;
        currentHeader = nextHeader;
        const size = { width, height, scale: 2, fontScale };
        Dimensions.set({ window: size, screen: size });
        view.update(tree());
      }),
    layout: (sheetHeight: number) =>
      act(() =>
        options.unstable_nativeProps?.onLayout?.({
          nativeEvent: {
            layout: { x: 0, y: 0, width: 540, height: sheetHeight },
          },
        } as LayoutChangeEvent),
      ),
  };
}

describe.each(sheets)('$name fitted sheet', ({ component, actions }) => {
  test.each([
    ['form sheet portrait', 1024, 1366, 640],
    ['form sheet landscape', 1366, 1024, 540],
    ['page sheet portrait', 1024, 1366, 900],
    ['page sheet landscape', 1366, 1024, 700],
  ])(
    'iPad %s at AX5 keeps overflowing content and its last action in the scroll range',
    (_name, width, height, sheetHeight) => {
      const sheet = render(component, {
        width,
        height,
        isPad: true,
        traits: regular,
      });
      sheet.layout(sheetHeight);
      const viewport = sheet.cap();
      expect(viewport).toBe(sheetHeight - SHEET_HEADER);
      // Synthetic native AX5 layout. Actions end inside the content container,
      // after the privacy row, with the existing 36 pt of bottom padding.
      const content = {
        height: 1100,
        actions: [
          { y: 884, height: 90 },
          { y: 974, height: 90 },
        ],
      };
      expect(content.height).toBeGreaterThan(viewport);
      expect(sheet.scroll().props.scrollEnabled).not.toBe(false);
      for (const id of actions) {
        expect(
          sheet.scroll().findAllByProps({ testID: id }).length,
        ).toBeGreaterThan(0);
      }
      const last = content.actions.at(-1)!;
      expect(last.y + last.height).toBeLessThanOrEqual(content.height);
      expect(content.height - (last.y + last.height)).toBe(36);
      const scrollEnd = content.height - viewport;
      expect(last.y + last.height - scrollEnd).toBeLessThanOrEqual(viewport);
      const ids = sheet
        .scroll()
        .findAll((node) => typeof node.type === 'string' && !!node.props.testID)
        .map((node) => node.props.testID);
      expect(ids.indexOf(actions[1])).toBeGreaterThan(ids.indexOf(actions[0]));
    },
  );

  test('fixed iPad bounds can shrink and grow, ignoring zero measurements', () => {
    const sheet = render(component, {
      width: 1024,
      height: 1366,
      isPad: true,
      traits: regular,
      header: 64,
    });
    expect(sheet.cap()).toBe(1278);
    for (const [height, expected] of [
      [640, 576],
      [480, 416],
      [900, 836],
      [0, 836],
    ] as const) {
      sheet.layout(height);
      expect(sheet.cap()).toBe(expected);
    }
  });

  test.each([
    ['phone', false, null, 'unspecified'],
    ['compact iPad', true, compact, 'unspecified'],
    ['Duo outer trailing', false, compact, 'trailing'],
    ['Duo outer leading', false, compact, 'leading'],
    ['Duo inner', false, regular, 'unspecified'],
  ] as const)(
    '%s regrows in one portrait/landscape/portrait cycle',
    (_name, isPad, traits, bar) => {
      for (const bottom of [0, 34]) {
        mockVerticalBar = bar;
        const sheet = render(component, {
          width: 375,
          height: 667,
          top: 20,
          bottom,
          isPad,
          traits,
        });
        const barHeight = bar === 'unspecified' ? SHEET_HEADER : 0;
        const portraitCap = 667 - 20 - barHeight;
        for (let round = 0; round < 3; round++) {
          // Model fitToContents feeding the capped content and inset back into
          // the native sheet measurement, including the zero-inset SE case.
          sheet.layout(sheet.cap() + barHeight + bottom);
          sheet.resize(667, 375, 0, 32);
          const landscapeBar = bar === 'unspecified' ? 32 : 0;
          sheet.layout(sheet.cap() + landscapeBar + bottom);
          expect(sheet.cap()).toBe(375 - landscapeBar);
          sheet.resize(375, 667, 20, SHEET_HEADER);
          sheet.layout(sheet.cap() + barHeight + bottom);
          expect(sheet.cap()).toBe(portraitCap);
        }
      }
    },
  );

  test.each([1, 1.35, 3.12])(
    'realistic phone sheet measurements preserve the original cap and spacing at scale %s',
    (fontScale) => {
      for (const [width, height, top] of [
        [320, 568, 20],
        [393, 852, 59],
        [430, 932, 59],
        [852, 393, 0],
      ] as const) {
        const sheet = render(component, {
          width,
          height,
          top,
          bottom: 34,
          fontScale,
        });
        const before = StyleSheet.flatten(
          sheet.scroll().props.contentContainerStyle,
        );
        const originalCap = height - top - SHEET_HEADER;
        // A full-height phone sheet stops 10 pt below the top safe area.
        sheet.layout(height - top - 10);
        expect(sheet.cap()).toBe(originalCap);
        expect(
          StyleSheet.flatten(sheet.scroll().props.contentContainerStyle),
        ).toEqual(before);
        sheet.layout(240 + SHEET_HEADER);
        expect(sheet.cap()).toBe(originalCap);
        expect(sheet.scroll().props.contentInsetAdjustmentBehavior).toBe(
          'automatic',
        );
      }
    },
  );

  test('the same bar rule applies to fixed iPad measurements and the window fallback', () => {
    mockVerticalBar = 'trailing';
    const sheet = render(component, {
      width: 1024,
      height: 1366,
      isPad: true,
      traits: regular,
    });
    expect(sheet.cap()).toBe(1342);
    sheet.layout(640);
    expect(sheet.cap()).toBe(640);
  });

  test('keeps existing native props and forwards the existing layout handler once', () => {
    const previous = jest.fn();
    const appear = jest.fn();
    const sheet = render(component, {
      width: 1024,
      height: 1366,
      isPad: true,
      traits: regular,
      nativeProps: {
        testID: 'native-consent',
        onLayout: previous,
        onAppear: appear,
      },
    });
    expect(sheet.options().unstable_nativeProps).toMatchObject({
      testID: 'native-consent',
      onAppear: appear,
    });
    sheet.layout(640);
    sheet.layout(540);
    expect(previous).toHaveBeenCalledTimes(2);
    expect(sheet.cap()).toBe(484);
  });

  test('a remounted sheet forwards to the original handler, not its own earlier one', () => {
    const previous = jest.fn();
    const first = render(component, {
      width: 1024,
      height: 1366,
      isPad: true,
      traits: regular,
      nativeProps: { onLayout: previous },
    });
    const stale = first.options().unstable_nativeProps;
    const second = render(component, {
      width: 1024,
      height: 1366,
      isPad: true,
      traits: regular,
      nativeProps: stale,
    });
    expect(second.options().unstable_nativeProps?.onLayout).not.toBe(
      stale?.onLayout,
    );
    second.layout(640);
    expect(previous).toHaveBeenCalledTimes(1);
    expect(second.cap()).toBe(584);
    // The earlier instance is no longer in the chain.
    expect(first.cap()).toBe(1366 - 24 - SHEET_HEADER);
  });
});
