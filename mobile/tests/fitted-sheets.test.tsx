import { act, type ReactElement } from 'react';
import TestRenderer from 'react-test-renderer';
import {
  Dimensions,
  ScrollView,
  StyleSheet,
  type LayoutChangeEvent,
} from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { HeaderHeightContext } from 'expo-router/react-navigation';
import type { NativeStackNavigationOptions } from 'expo-router';
import AskConsent from '../src/features/ask/AskConsent';
import { ConsentSheet } from '../src/features/talk/Consent';
import { SHEET_HEADER } from '../src/features/sheets/fitted';
import { withNavigationOptions } from './navigation-options';

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
});

function render(
  component: ReactElement,
  width: number,
  height: number,
  fontScale: number,
  top = 24,
  header = SHEET_HEADER,
) {
  const size = { width, height, scale: 2, fontScale };
  Dimensions.set({ window: size, screen: size });
  let options: NativeStackNavigationOptions = {};
  let view!: TestRenderer.ReactTestRenderer;
  act(() => {
    view = TestRenderer.create(
      withNavigationOptions(
        <SafeAreaProvider
          initialMetrics={{
            frame: { x: 0, y: 0, width, height },
            insets: { top, bottom: 20, left: 0, right: 0 },
          }}
        >
          <HeaderHeightContext.Provider value={header}>
            {component}
          </HeaderHeightContext.Provider>
        </SafeAreaProvider>,
        (next) => {
          options = next;
        },
      ),
    );
  });
  mounted.push(view);
  return {
    scroll: () => view.root.findByType(ScrollView),
    cap: () =>
      StyleSheet.flatten(view.root.findByType(ScrollView).props.style)
        .maxHeight,
    layout: (sheetHeight: number) => {
      // Delivered by the native modal Screen, outside the unconstrained
      // fitToContents wrapper. Its height includes the sheet's own bar.
      act(() =>
        options.unstable_nativeProps?.onLayout?.({
          nativeEvent: {
            layout: { x: 0, y: 0, width: 540, height: sheetHeight },
          },
        } as LayoutChangeEvent),
      );
    },
  };
}

describe.each(sheets)('$name fitted sheet', ({ component, actions }) => {
  test.each([
    ['iPad form sheet portrait', 1024, 1366, 640, 'unspecified'],
    ['iPad form sheet landscape', 1366, 1024, 540, 'unspecified'],
    ['iPad page sheet portrait', 1024, 1366, 900, 'unspecified'],
    ['iPad page sheet landscape', 1366, 1024, 700, 'unspecified'],
    ['Duo outer', 466, 678, 560, 'trailing'],
    ['Duo inner portrait', 669, 951, 640, 'unspecified'],
    ['Duo inner landscape', 951, 669, 540, 'trailing'],
  ])(
    '%s at AX5 can scroll to both actions',
    (_name, width, height, sheetHeight, bar) => {
      mockVerticalBar = bar;
      const sheet = render(component, width, height, 3.12);
      sheet.layout(sheetHeight);
      const viewport = sheet.cap();
      expect(viewport).toBeLessThanOrEqual(sheetHeight - SHEET_HEADER);
      expect(viewport).toBeGreaterThan(0);

      // Jest has no text layout engine. Supply overflowing native geometry:
      // 1100 pt of content, ending in two 90 pt actions and 36 pt of padding.
      // Both actions must belong to the capped scroll view, with enough range
      // to bring each whole button into the viewport at the bottom.
      const contentHeight = 1100;
      const range = contentHeight - viewport;
      expect(range).toBeGreaterThan(0);
      expect(sheet.scroll().props.scrollEnabled).not.toBe(false);
      for (const [index, id] of actions.entries()) {
        expect(
          sheet.scroll().findAllByProps({ testID: id }).length,
        ).toBeGreaterThan(0);
        const actionTop = contentHeight - 216 + index * 90;
        expect(actionTop - range).toBeGreaterThanOrEqual(0);
        expect(actionTop + 90 - range).toBeLessThanOrEqual(viewport);
      }
    },
  );

  test('tracks shrinking and growing sheet bounds without latching the first height', () => {
    const sheet = render(component, 1024, 1366, 3.12, 24, 64);
    sheet.layout(640);
    expect(sheet.cap()).toBe(576);
    sheet.layout(480);
    expect(sheet.cap()).toBe(416);
    sheet.layout(900);
    expect(sheet.cap()).toBe(836);
    sheet.layout(0);
    expect(sheet.cap()).toBe(836);
  });

  test.each([1, 1.35, 3.12])(
    'phone sizing and content styles stay unchanged at font scale %s',
    (fontScale) => {
      for (const [width, height] of [
        [320, 568],
        [390, 844],
        [430, 932],
        [844, 390],
      ]) {
        const sheet = render(component, width!, height!, fontScale, 47);
        const before = StyleSheet.flatten(
          sheet.scroll().props.contentContainerStyle,
        );
        expect(sheet.cap()).toBe(height! - 47 - SHEET_HEADER);
        sheet.layout(height! - 47);
        expect(sheet.cap()).toBe(height! - 47 - SHEET_HEADER);
        expect(
          StyleSheet.flatten(sheet.scroll().props.contentContainerStyle),
        ).toEqual(before);
        expect(sheet.scroll().props.contentInsetAdjustmentBehavior).toBe(
          'automatic',
        );
        // A short sheet still fits to its intrinsic content plus its own bar.
        sheet.layout(240 + SHEET_HEADER);
        expect(sheet.cap()).toBeGreaterThanOrEqual(240);
        expect(
          StyleSheet.flatten(sheet.scroll().props.style).height,
        ).toBeUndefined();
      }
    },
  );
});
