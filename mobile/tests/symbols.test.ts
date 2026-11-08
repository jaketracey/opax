import { Icon, type SFSymbol } from '../src/design/icon';
import { symbols, symbolVocabulary } from '../src/design/symbols';
import { androidSymbol, androidSymbols } from '../src/design/android-symbols';
import { thisDevice } from '../src/design/device';
import { phoneCopy } from '../src/design/phone-copy';
import { Platform, Dimensions } from 'react-native';
import { act, createElement } from 'react';
import TestRenderer from 'react-test-renderer';
import { SymbolView } from 'expo-symbols';
import { useReduceMotion } from '../src/design/accessibility';
import { designFlags } from '../src/design/flags';
import { colors, accents } from '../src/design/tokens';

jest.mock('../src/design/flags', () => ({
  designFlags: { categorySymbols: true },
}));
jest.mock('../src/design/accessibility', () => ({
  useReduceMotion: jest.fn(() => false),
}));

test('every admitted symbol has an explicit Android equivalent', () => {
  expect(new Set(symbolVocabulary).size).toBe(symbolVocabulary.length);
  expect(Object.keys(androidSymbols).sort()).toEqual(
    [...symbolVocabulary].sort(),
  );
  for (const symbol of symbolVocabulary)
    expect(androidSymbol(symbol)).toBeTruthy();
  expect(symbols.changed).toBe('bell');
  expect(symbols.contracts).toBe('building.2');
  expect(symbols.external).toBe('arrow.up.right.square');
});
test('Icon accepts only the closed symbol union', () => {
  const valid: SFSymbol = symbols.vote;
  expect(valid).toBe('hand.raised');
  // @ts-expect-error A real SF Symbol outside OPAX's vocabulary is rejected.
  const outside: Parameters<typeof Icon>[0]['name'] = 'airplane';
  expect(outside).toBe('airplane');
});
test.each([
  ['ios', false, 'iPhone', 'iPhone'],
  ['ios', true, 'iPad', 'iPad'],
  ['android', false, 'phone', 'phone'],
] as const)(
  '%s pad=%s uses the device noun and shared phone copy',
  (os, pad, noun, copyNoun) => {
    const originalOS = Platform.OS,
      originalPad = Platform.OS === 'ios' ? Platform.isPad : false;
    try {
      Object.defineProperty(Platform, 'OS', { value: os, configurable: true });
      Object.defineProperty(Platform, 'isPad', {
        value: pad,
        configurable: true,
      });
      expect(thisDevice()).toBe(noun);
      expect(phoneCopy('Saved on this iPhone.')).toBe(
        `Saved on this ${copyNoun}.`,
      );
    } finally {
      Object.defineProperty(Platform, 'OS', {
        value: originalOS,
        configurable: true,
      });
      Object.defineProperty(Platform, 'isPad', {
        value: originalPad,
        configurable: true,
      });
    }
  },
);

test.each([false, true])(
  'categorySymbols=%s changes the symbol ink alone',
  (enabled) => {
    (designFlags as { categorySymbols: boolean }).categorySymbols = enabled;
    let r!: TestRenderer.ReactTestRenderer;
    act(() => {
      r = TestRenderer.create(
        createElement(Icon, {
          name: symbols.money,
          ink: 'money',
          type: 'hierarchical',
        }),
      );
    });
    expect(r.root.findByType(SymbolView).props.tintColor).toEqual(
      colors[enabled ? accents.money.ink : 'navy'],
    );
    act(() => r.unmount());
  },
);
test.each([false, true])(
  'Reduce Motion=%s controls the single symbol bounce',
  (reduced) => {
    jest.mocked(useReduceMotion).mockReturnValue(reduced);
    const window = Dimensions.get('window');
    act(() => Dimensions.set({ window: { ...window, fontScale: 3.571 } }));
    let r!: TestRenderer.ReactTestRenderer;
    act(() => {
      r = TestRenderer.create(
        createElement(Icon, {
          name: symbols.following,
          animation: 'bounce',
          weight: 'semibold',
          scale: 'large',
        }),
      );
    });
    const symbol = r.root.findByType(SymbolView);
    expect(symbol.props.size).toBe(30);
    expect(symbol.props.weight).toBe('semibold');
    expect(symbol.props.scale).toBe('large');
    expect(symbol.props.animationSpec).toEqual(
      reduced
        ? undefined
        : { effect: { type: 'bounce' }, repeating: false, repeatCount: 1 },
    );
    act(() => {
      r.unmount();
      Dimensions.set({ window });
    });
  },
);
