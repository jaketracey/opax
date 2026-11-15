// The Search prompt at accessibility sizes (sweep 1, item 2.5; BACKLOG D5).
// iOS 26's tab bar rests on a fixed 48 pt search pill that draws the prompt
// at the bar's capped size: "People, bills, topics and more" needed 272 pt
// of about 238 pt at AX3 on iOS 26.3 and ended in an ellipsis. The pill is
// UIKit's stand-in, so the field's own placeholder fitting never reaches it.
import { readFileSync } from 'fs';
import { join } from 'path';
import { act } from 'react';
import { Platform } from 'react-native';
import TestRenderer from 'react-test-renderer';
import {
  SEARCH_PLACEHOLDER,
  SEARCH_PLACEHOLDER_SHORT,
  useSearchPlaceholder,
} from '../src/features/search/SearchScreen';

jest.mock('../src/api/runtime', () => ({
  catalogs: {},
  recordSearch: {},
  client: {},
}));
let mockFontScale = 1;
jest.mock('react-native/Libraries/Utilities/useWindowDimensions', () => ({
  __esModule: true,
  default: () => ({
    width: 402,
    height: 874,
    scale: 3,
    fontScale: mockFontScale,
  }),
}));

function placeholderAt(fontScale: number, os: 'ios' | 'android' = 'ios') {
  mockFontScale = fontScale;
  const original = Platform.OS;
  Object.defineProperty(Platform, 'OS', { configurable: true, value: os });
  let seen = '';
  function Probe() {
    seen = useSearchPlaceholder();
    return null;
  }
  let tree!: TestRenderer.ReactTestRenderer;
  act(() => {
    tree = TestRenderer.create(<Probe />);
  });
  act(() => tree.unmount());
  Object.defineProperty(Platform, 'OS', {
    configurable: true,
    value: original,
  });
  return seen;
}

test('the prompt is unchanged at every ordinary text size', () => {
  expect(SEARCH_PLACEHOLDER).toBe('People, bills, topics and more');
  // xSmall to xxxLarge, as React Native reports them on iOS.
  for (const scale of [0.823, 1, 1.118, 1.235, 1.353])
    expect(placeholderAt(scale)).toBe(SEARCH_PLACEHOLDER);
});

test('iOS accessibility sizes take the shorter prompt that fits the pill', () => {
  // AX1, AX3 and AX5.
  for (const scale of [1.786, 2.643, 3.571])
    expect(placeholderAt(scale)).toBe(SEARCH_PLACEHOLDER_SHORT);
  // The same words, cut at a comma: no ellipsis, nothing new to translate.
  expect(SEARCH_PLACEHOLDER.startsWith(SEARCH_PLACEHOLDER_SHORT)).toBe(true);
  // 272 pt at 21 pt for 30 characters; the pill gives about 238 pt.
  expect(
    (272 / SEARCH_PLACEHOLDER.length) * SEARCH_PLACEHOLDER_SHORT.length,
  ).toBeLessThan(238);
});

test('Android keeps its own field and the full prompt', () => {
  expect(placeholderAt(2, 'android')).toBe(SEARCH_PLACEHOLDER);
});

test.each(['SearchScreen.tsx', 'ResultsScreen.tsx'])(
  '%s passes the sized prompt to its fields',
  (file) => {
    const source = readFileSync(
      join(__dirname, '../src/features/search', file),
      'utf8',
    );
    expect(source).toContain('const placeholder = useSearchPlaceholder();');
    expect(source).not.toMatch(/placeholder(:|=\{)\s*SEARCH_PLACEHOLDER/);
  },
);
