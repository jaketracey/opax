import { act } from 'react';
import TestRenderer from 'react-test-renderer';
import * as Native from 'react-native';
import { Appearance, Platform, RefreshControl } from 'react-native';
import { contrastRatio } from '../src/design/contrast';
import { dark, darkHighContrast, light } from '../src/design/palette';
import { colors } from '../src/design/tokens';
import { routeSheetOptions } from '../src/features/sheets/frame';
import { usePaperBar } from '../src/features/sources/parts';
import { orbColours } from '../src/features/talk/VoiceOrb';

// Dark mode, lane D (19 Nov 2026): Ask, Talk, Search, reports, sheets and
// Account. What these draw that the codemod could not write: the orb's dark
// recipe, grounds read outside a component, and Android's refresh colours.
// Each test fails if its behaviour is reverted.
jest.mock('react-native-safe-area-context', () => ({
  ...jest.requireActual('react-native-safe-area-context'),
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

const originalOS = Platform.OS;
function system(os: 'ios' | 'android', scheme: 'light' | 'dark') {
  Platform.OS = os;
  jest.spyOn(Appearance, 'getColorScheme').mockReturnValue(scheme);
  jest.spyOn(Native, 'useColorScheme').mockReturnValue(scheme);
}
afterEach(() => {
  Platform.OS = originalOS;
  jest.restoreAllMocks();
});

const hex = ([r, g, b]: number[]) =>
  `#${[r, g, b]
    .map((channel) =>
      Math.round(channel! * 255)
        .toString(16)
        .padStart(2, '0'),
    )
    .join('')}`.toUpperCase();

describe('the voice orb', () => {
  test('light is unchanged: an inked navy core on paper', () => {
    const orb = orbColours('light', false);
    expect(hex(orb.ground)).toBe(light.paper);
    expect(hex(orb.core[1]!)).toBe(light.navyRaised);
    expect(hex(orb.core[2]!)).toBe(light.navy);
    expect(hex(orb.rosette)).toBe(light.onNavySoft);
    expect(orb.rosette[3]).toBe(0.2);
    expect(orb.rings.map((ring) => ring[3])).toEqual([0.3, 0.1, 0]);
    expect(orb.glow[0]![3]).toBe(0.6);
  });

  test('dark is drawn from the dark palette, on the dark page', () => {
    const orb = orbColours('dark', false);
    expect(hex(orb.ground)).toBe(dark.paper);
    expect(hex(orb.core[1]!)).toBe(dark.navy);
    expect(hex(orb.halo[0]!)).toBe(dark.navyWash);
    expect(hex(orb.rings[0]!)).toBe(dark.navy);
    expect(hex(orb.edge)).toBe(dark.navyRaised);
  });

  test('the dark core is lit: pale at the highlight, deep at the rim, and the whole of it stands off the page', () => {
    const { core, ground } = orbColours('dark', false);
    const ratios = core.map((stop) => contrastRatio(hex(stop), hex(ground)));
    // Each stop is dimmer than the one before: a sphere, not a flat disc.
    expect([...ratios].sort((a, b) => b - a)).toEqual(ratios);
    // The rim, the dimmest part, is still a clear mark on the page (3:1 is
    // the bar for a graphic), and the highlight does not clip to white.
    expect(ratios.at(-1)).toBeGreaterThanOrEqual(1.8);
    expect(ratios[1]).toBeGreaterThanOrEqual(3);
    expect(hex(core[0]!)).not.toBe('#FFFFFF');
  });

  test('the dark rosette is engraved in the ink that sits on navy, visible on the pale core', () => {
    const plain = orbColours('dark', false);
    const strong = orbColours('dark', true);
    expect(hex(plain.rosette)).toBe(dark.onNavy);
    // The light soft tone at 20% would be lost on the pale core.
    expect(plain.rosette[3]).toBeGreaterThan(0.2);
    expect(hex(strong.rosette)).toBe(darkHighContrast.onNavy ?? dark.onNavy);
    expect(strong.rosette[3]).toBeGreaterThan(plain.rosette[3]!);
    expect(strong.rings[0]![3]).toBeGreaterThan(plain.rings[0]![3]!);
  });
});

describe('grounds read outside a component', () => {
  test('route sheets take the colours on screen at the call: dark on a dark Android', () => {
    system('android', 'dark');
    expect(routeSheetOptions()).toMatchObject({
      headerTintColor: dark.navy,
      contentStyle: { backgroundColor: dark.sunken },
    });
    system('android', 'light');
    expect(routeSheetOptions()).toMatchObject({
      headerTintColor: light.navy,
      contentStyle: { backgroundColor: light.sunken },
    });
  });

  test('route sheets on iOS keep the dynamic roles', () => {
    system('ios', 'dark');
    expect(routeSheetOptions()).toMatchObject({
      headerTintColor: colors.navy,
      contentStyle: { backgroundColor: colors.sunken },
    });
  });

  test('a page that uses the paper bar hook is drawn again when Android switches', () => {
    Platform.OS = 'android';
    let scheme: 'light' | 'dark' = 'light';
    let changed: (() => void) | undefined;
    jest.spyOn(Appearance, 'getColorScheme').mockImplementation(() => scheme);
    jest.spyOn(Appearance, 'addChangeListener').mockImplementation(((
      listener: () => void,
    ) => {
      changed = listener;
      return { remove: () => undefined };
    }) as never);
    const seen: unknown[] = [];
    function Page() {
      seen.push(usePaperBar().headerStyle);
      return null;
    }
    let tree!: TestRenderer.ReactTestRenderer;
    act(() => {
      tree = TestRenderer.create(<Page />);
    });
    expect(seen.at(-1)).toEqual({ backgroundColor: light.paper });
    act(() => {
      scheme = 'dark';
      changed?.();
    });
    expect(seen.at(-1)).toEqual({ backgroundColor: dark.paper });
    act(() => tree.unmount());
  });
});

describe('pull to refresh on Android', () => {
  test('every lane D refresh control names its spinner and disc from the roles', () => {
    // The disc is white and the spinner black by default: a light plate on
    // the dark page. `tintColor` is iOS only.
    const { readFileSync, readdirSync, statSync } =
      jest.requireActual<typeof import('fs')>('fs');
    const { join } = jest.requireActual<typeof import('path')>('path');
    const root = join(__dirname, '../src/features');
    const folders = [
      'account',
      'ask',
      'community',
      'methods',
      'reports',
      'search',
      'sources',
      'talk',
      'sheets',
      'quick-search',
    ];
    const bare: string[] = [];
    let found = 0;
    const walk = (dir: string) => {
      for (const name of readdirSync(dir)) {
        const path = join(dir, name);
        if (statSync(path).isDirectory()) walk(path);
        else if (name.endsWith('.tsx')) {
          const source = readFileSync(path, 'utf8');
          for (const [tag] of source.matchAll(/<RefreshControl\b[^>]*>/g)) {
            found += 1;
            if (
              !tag.includes('colors={[colors.navy]}') ||
              !tag.includes('progressBackgroundColor={colors.raised}')
            )
              bare.push(path.slice(root.length + 1));
          }
        }
      }
    };
    for (const folder of folders) walk(join(root, folder));
    expect(found).toBeGreaterThanOrEqual(9);
    expect(bare).toEqual([]);
    // The props exist on the control (a rename would otherwise pass above).
    expect(
      <RefreshControl
        refreshing={false}
        colors={[dark.navy]}
        progressBackgroundColor={dark.raised}
      />,
    ).toBeTruthy();
  });
});
