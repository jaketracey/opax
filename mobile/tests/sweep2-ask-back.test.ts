import { Dimensions, Platform } from 'react-native';
import {
  askBackItem as backItem,
  askBackLabelled,
} from '../src/navigation/chrome';
import { setAskReturn, shortReturnName } from '../src/features/ask/return';

/**
 * Sweep 2 item 9: Ask's back item says where it goes ("‹ Bill",
 * "‹ Today") when the bar has room, as the system back button does, and is
 * the chevron alone at accessibility sizes and on a window of 380 or less.
 * What it does and when it shows are row 97's (ask-entry-navigation).
 */
/** The item as a button (it is always one). */
const askBackItem = (props: Parameters<typeof backItem>[0]) =>
  backItem(props) as {
    label: string;
    accessibilityLabel?: string;
    icon?: unknown;
  };
const os = Object.getOwnPropertyDescriptor(Platform, 'OS')!;
const onPress = () => undefined;
const bill = 'Example Amendment (Placeholder Measures) Bill 2026';
const iPhone = { width: 402, height: 874, scale: 3, fontScale: 1 };
beforeEach(() => {
  jest.spyOn(Dimensions, 'get').mockReturnValue(iPhone);
});
afterEach(() => {
  jest.restoreAllMocks();
  Object.defineProperty(Platform, 'OS', os);
  setAskReturn(null);
});
const on = (value: 'ios' | 'android') =>
  Object.defineProperty(Platform, 'OS', { configurable: true, value });

test.each([
  ['a 402 pt window at the default size', 402, 1, true],
  ['Large', 402, 1.235, true],
  ['AX1', 402, 1.786, false],
  ['AX3', 402, 2.643, false],
  ['a 380 pt window', 380, 1, false],
  ['a 381 pt window', 381, 1, true],
] as const)('iOS on %s: labelled %s', (_name, width, fontScale, labelled) => {
  on('ios');
  expect(askBackLabelled({ width, fontScale })).toBe(labelled);
});

test('Android keeps Material’s navigation icon', () => {
  on('android');
  expect(askBackLabelled({ width: 412, fontScale: 1 })).toBe(false);
  const item = askBackItem({ name: bill, short: 'Bill', onPress });
  expect(item).toMatchObject({
    label: bill,
    icon: { type: 'sfSymbol', name: 'arrow.left' },
  });
});

test('the item reads its kind, never the long name; VoiceOver keeps the name', () => {
  on('ios');
  const item = askBackItem({ name: bill, short: 'Bill', onPress });
  expect(item.accessibilityLabel).toBe(`Back to ${bill}`);
  expect(item.label).toBe('‹ Bill');
  expect(item).not.toHaveProperty('icon');
  // At AX3 the chevron alone; the long name is the item's title, which
  // UIKit shows only on a vertical bar and in the Large Content Viewer.
  jest.mocked(Dimensions.get).mockReturnValue({ ...iPhone, fontScale: 2.643 });
  const ax3 = askBackItem({ name: bill, short: 'Bill', onPress });
  expect(ax3.label).toBe(bill);
  expect(ax3.accessibilityLabel).toBe(`Back to ${bill}`);
  expect(ax3.icon).toEqual({ type: 'sfSymbol', name: 'chevron.backward' });
});

test('without a short word passed, the way back’s own is used (AskScreen passes the name only)', () => {
  on('ios');
  setAskReturn({ tab: '(today)', name: bill, short: 'Bill' });
  expect(askBackItem({ name: bill, onPress }).label).toBe('‹ Bill');
  setAskReturn({ tab: '(today)', name: 'Today', short: 'Today' });
  expect(askBackItem({ name: 'Today', onPress }).label).toBe('‹ Today');
});

test.each([
  [['(tabs)', '(today)'], '(today)', 'Today'],
  [['(tabs)', '(search)'], '(search)', 'Search'],
  [['(tabs)', '(bills)', 'bill', '[key]'], '(bills)', 'Bill'],
  [['(tabs)', '(today)', 'person', '[slug]'], '(today)', 'Profile'],
  [['(tabs)', '(search)', 'results', '[kind]'], '(search)', 'Search'],
  [['(tabs)', '(your-mp)', 'unknown-page'], '(your-mp)', 'Your MP'],
] as const)('%j from %s reads "%s"', (segments, tab, short) => {
  expect(shortReturnName(tab, segments)).toBe(short);
});
