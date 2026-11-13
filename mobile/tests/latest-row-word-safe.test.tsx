import { act } from 'react';
import { Dimensions, Platform, StyleSheet } from 'react-native';
import TestRenderer from 'react-test-renderer';
import { LINE_HEIGHT_NUDGE } from '../src/design/text';
import { textStyles } from '../src/design/tokens';
import {
  LatestRow,
  type LatestRecord,
} from '../src/features/your-mp/LatestRows';

jest.mock('../modules/opax-text-metrics', () => ({
  spToDp: (sp: number, fontScale: number) => sp * fontScale,
  dpToSp: (dp: number, fontScale: number) => dp / fontScale,
}));

jest.mock('expo-router', () => {
  const React = jest.requireActual('react');
  const { Pressable } = jest.requireActual('react-native');
  const Link = ({ children, ...props }: { children: unknown }) =>
    React.createElement(Pressable, props, children);
  Link.Trigger = function Trigger({ children }: { children: unknown }) {
    return children;
  };
  Link.Preview = function Preview() {
    return null;
  };
  Link.Menu = function Menu() {
    return null;
  };
  Link.MenuAction = function MenuAction() {
    return null;
  };
  return {
    Link,
    router: { push: jest.fn() },
    useIsPreview: () => false,
    useSegments: () => [],
    useLocalSearchParams: () => ({}),
    Stack: { Screen: () => null },
  };
});
jest.mock('../src/api/runtime', () => ({ catalogs: {} }));
jest.mock('react-native-safe-area-context', () => ({
  ...jest.requireActual('react-native-safe-area-context'),
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

/**
 * Sweep 2, item 11: at AX3 Today's Your MP card printed a Latest bill title
 * as "(Strengthenin / g Enforcement". The title is word-safe; this replays
 * that layout through the row and pins that the title steps its size down
 * when the reported lines break inside a word.
 */
test('a Latest bill title that breaks mid-word at AX3 steps its size down', () => {
  const os = Object.getOwnPropertyDescriptor(Platform, 'OS')!;
  Object.defineProperty(Platform, 'OS', { configurable: true, value: 'ios' });
  const window = Dimensions.get('window');
  const screen = Dimensions.get('screen');
  const ax3 = { ...window, width: 402, fontScale: 2.643 };
  act(() => Dimensions.set({ window: ax3, screen: ax3 }));
  const record = {
    key: 'vote-fixture',
    kind: 'vote',
    date: '2026-09-28',
    action: 'Voted against an amendment',
    title:
      'Online Safety Amendment (Strengthening Enforcement for the Social Media Minimum Age) Bill 2026',
    detail: '',
  } as unknown as LatestRecord;
  let tree!: TestRenderer.ReactTestRenderer;
  try {
    act(() => {
      tree = TestRenderer.create(
        <LatestRow record={record} testID="latest-0" />,
      );
    });
    const title = () =>
      tree.root.findAll(
        (n) =>
          typeof n.type === 'string' && n.props.testID === 'latest-0-title',
      )[0]!;
    const size = () => StyleSheet.flatten(title().props.style).fontSize;
    const full = size();
    // AX3's body ramp (40 / 17), as UIKit lays the serif title out.
    const line =
      (textStyles.rowRecord.lineHeight + LINE_HEIGHT_NUDGE) * (40 / 17);
    const broken = [
      'Online Safety ',
      'Amendment ',
      '(Strengthenin',
      'g Enforcement ',
      'for the Social ',
      'Media Minimum ',
      'Age) Bill 2026',
    ];
    act(() =>
      title().props.onLayout({
        nativeEvent: {
          layout: { x: 0, y: 0, width: 277, height: line * broken.length },
        },
      }),
    );
    act(() =>
      title().props.onTextLayout({
        nativeEvent: {
          lines: broken.map((text) => ({ text, width: 270, height: line })),
        },
      }),
    );
    expect(size()).toBeLessThan(full);
    expect(size()).toBeGreaterThanOrEqual(
      textStyles.rowRecord.fontSize * 0.9 - 0.01,
    );
  } finally {
    act(() => {
      tree?.unmount();
      Dimensions.set({ window, screen });
    });
    Object.defineProperty(Platform, 'OS', os);
  }
});
