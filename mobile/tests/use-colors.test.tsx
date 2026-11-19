import { act } from 'react';
import TestRenderer from 'react-test-renderer';
import * as Native from 'react-native';
import {
  AccessibilityInfo,
  Appearance,
  Platform,
  StyleSheet,
} from 'react-native';
import {
  dark,
  darkHighContrast,
  light,
  lightHighContrast,
} from '../src/design/palette';
import { colors } from '../src/design/tokens';
import {
  colorTheme,
  colorsFor,
  currentColors,
  makeStyles,
  useColors,
  type Colors,
} from '../src/design/use-colors';

// Option H (dark mode, 19 Nov 2026): Android chooses each role in JavaScript
// for the system's scheme and High contrast text; iOS keeps its dynamic set.
const originalOS = Platform.OS;
let scheme: jest.SpyInstance;
let highContrast: ((on: boolean) => void) | undefined;
beforeEach(() => {
  scheme = jest.spyOn(Native, 'useColorScheme').mockReturnValue('light');
  jest
    .spyOn(AccessibilityInfo, 'addEventListener')
    .mockImplementation((event: string, handler: unknown) => {
      if (event === 'highTextContrastChanged')
        highContrast = handler as (on: boolean) => void;
      return { remove: () => undefined } as never;
    });
});
afterEach(() => {
  act(() => highContrast?.(false));
  Platform.OS = originalOS;
  jest.restoreAllMocks();
});

function read(): { colors: Colors; renders: number } {
  const seen = { colors: light as Colors, renders: 0 };
  function Probe() {
    seen.colors = useColors();
    seen.renders += 1;
    return null;
  }
  act(() => {
    TestRenderer.create(<Probe />);
  });
  return seen;
}

test('names the four themes the token source defines', () => {
  expect(colorTheme('light', false)).toBe('light');
  expect(colorTheme(null, false)).toBe('light');
  expect(colorTheme(undefined, true)).toBe('lightHighContrast');
  expect(colorTheme('dark', false)).toBe('dark');
  expect(colorTheme('dark', true)).toBe('darkHighContrast');
});

test('iOS keeps the dynamic set in every theme', () => {
  Platform.OS = 'ios';
  expect(read().colors).toBe(colors);
  scheme.mockReturnValue('dark');
  expect(read().colors).toBe(colors);
  expect(colorsFor('darkHighContrast')).toBe(colors);
});

test('Android takes the palette for the scheme', () => {
  Platform.OS = 'android';
  expect(read().colors).toBe(light);
  scheme.mockReturnValue('dark');
  const seen = read();
  expect(seen.colors).toBe(dark);
  expect(seen.colors.paper).toBe('#161915');
  expect(seen.colors.navy).toBe('#9CB9DB');
});

test('Android High contrast text lays the Increase Contrast set over the scheme', () => {
  Platform.OS = 'android';
  const seen = read();
  act(() => highContrast?.(true));
  expect(seen.colors).toEqual({ ...light, ...lightHighContrast });
  expect(seen.colors.inkSoft).toBe(lightHighContrast.inkSoft);
  scheme.mockReturnValue('dark');
  const night = read();
  expect(night.colors).toEqual({ ...dark, ...darkHighContrast });
  expect(night.colors.inkSoft).toBe(darkHighContrast.inkSoft);
  // A role the set does not strengthen keeps the scheme's value.
  expect(night.colors.paper).toBe(dark.paper);
});

test('outside render the same answer comes from the system', () => {
  Platform.OS = 'android';
  const appearance = jest.spyOn(Appearance, 'getColorScheme');
  appearance.mockReturnValue('dark');
  expect(currentColors()).toBe(dark);
  appearance.mockReturnValue('light');
  expect(currentColors()).toBe(light);
  Platform.OS = 'ios';
  appearance.mockReturnValue('dark');
  expect(currentColors()).toBe(colors);
});

test('makeStyles builds one sheet per theme and hands every component the same one', () => {
  Platform.OS = 'android';
  const factory = jest.fn((c: Colors) =>
    StyleSheet.create({ card: { backgroundColor: c.raised } }),
  );
  const useStyles = makeStyles(factory);
  const sheets: unknown[] = [];
  function Probe() {
    sheets.push(useStyles());
    return null;
  }
  act(() => {
    TestRenderer.create(
      <>
        <Probe />
        <Probe />
      </>,
    );
  });
  expect(factory).toHaveBeenCalledTimes(1);
  expect(sheets[0]).toBe(sheets[1]);
  expect(StyleSheet.flatten((sheets[0] as { card: object }).card)).toEqual({
    backgroundColor: light.raised,
  });

  scheme.mockReturnValue('dark');
  act(() => {
    TestRenderer.create(<Probe />);
  });
  expect(factory).toHaveBeenCalledTimes(2);
  expect(StyleSheet.flatten((sheets[2] as { card: object }).card)).toEqual({
    backgroundColor: dark.raised,
  });

  // Back to light: the first sheet again, not a third.
  scheme.mockReturnValue('light');
  act(() => {
    TestRenderer.create(<Probe />);
  });
  expect(factory).toHaveBeenCalledTimes(2);
  expect(sheets[3]).toBe(sheets[0]);
});

test('makeStyles on iOS builds once, whatever the scheme', () => {
  Platform.OS = 'ios';
  const factory = jest.fn((c: Colors) => ({ ground: c.paper }));
  const useStyles = makeStyles(factory);
  function Probe() {
    useStyles();
    return null;
  }
  act(() => {
    TestRenderer.create(<Probe />);
  });
  scheme.mockReturnValue('dark');
  act(() => {
    TestRenderer.create(<Probe />);
  });
  expect(factory).toHaveBeenCalledTimes(1);
  expect(factory).toHaveBeenCalledWith(colors);
});

test('a component draws again when the scheme changes while it is up', () => {
  Platform.OS = 'android';
  let seen: Colors = light;
  function Probe() {
    seen = useColors();
    return null;
  }
  let tree!: TestRenderer.ReactTestRenderer;
  act(() => {
    tree = TestRenderer.create(<Probe />);
  });
  expect(seen).toBe(light);
  scheme.mockReturnValue('dark');
  act(() => tree.update(<Probe />));
  expect(seen).toBe(dark);
});
