import { execFileSync } from 'node:child_process';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { extname, join, relative } from 'node:path';
import { contrastRatio } from '../src/design/contrast';
import {
  dark,
  darkHighContrast,
  light,
  lightHighContrast,
  partyColors,
  partyColorsDark,
  partyWashes,
  partyWashesDark,
  type Palette,
} from '../src/design/palette';
import {
  accents,
  controlHeight,
  currentChromeColours,
  interfaceFonts as fonts,
  hairline,
  interfaceFonts,
  layout,
  minimumTarget,
  radii,
  rhythm,
  textStylesFor,
  typeRolesRegular,
  type CurrentTextVariant,
} from '../src/design/tokens';
import { contrastRules } from '../src/design/tokens.generated';

// Design tokens (docs/design/TOKENS.md): tokens.generated.ts is fresh, every
// name the app used before the token source keeps its value, the promised
// colour pairs pass in every theme, and raw colours only go down.
const MOBILE = join(__dirname, '..');

test('tokens.generated.ts matches docs/design/design-tokens.json', () => {
  // Throws, with the generator's message, while the file is stale.
  execFileSync(
    process.execPath,
    ['scripts/build-design-tokens.mjs', '--check'],
    { cwd: MOBILE, stdio: 'pipe' },
  );
});

test('Today dot bronze matches the approved artwork without changing the existing brand bronze', () => {
  expect(light.todayDotBronze).toBe('#C08F2C');
  expect(dark.todayDotBronze).toBe('#C08F2C');
  expect(light.bronze).toBe('#A0761B');
  const source = JSON.parse(
    readFileSync(join(MOBILE, '../docs/design/design-tokens.json'), 'utf8'),
  );
  expect(source.color.brand.todayDotBronze.$value).toBe(light.todayDotBronze);
});

// palette.ts and tokens.ts on ios/app before the token source (b7e436b1).
const BEFORE_LIGHT = {
  paper: '#FAF9F6',
  raised: '#FFFFFF',
  sunken: '#F1EFE8',
  ink: '#23271F',
  inkSoft: '#575C52',
  inkFaint: '#6F7468',
  navy: '#142A43',
  navyRaised: '#1D3A5C',
  onNavy: '#FFFFFF',
  onNavySoft: '#B7C6D9',
  bronze: '#A0761B',
  bronzeInk: '#8A5A12',
  bronzeWash: '#ECE4D3',
  bronzeBright: '#D9A84A',
  danger: '#A4262C',
  dividerDefault: '#B8B4A8',
  dividerSubtle: '#DFDCD2',
  moneyInk: '#2B6447',
  moneyWash: '#E5EAE5',
  votesInk: '#3A4C96',
  votesWash: '#E7E8EC',
  interestsInk: '#7B3A63',
  interestsWash: '#EDE6E7',
  billsInk: '#1F5F6B',
  billsWash: '#E4EAE8',
  navyWash: '#E4E6E7',
};
const BEFORE_HIGH_CONTRAST = {
  inkFaint: '#575C52',
  inkSoft: '#23271F',
  dividerSubtle: '#B8B4A8',
  onNavySoft: '#FFFFFF',
  bronzeInk: '#5C4318',
  moneyInk: '#29553D',
  votesInk: '#374684',
  interestsInk: '#72385C',
  billsInk: '#205158',
};
// Full shell 2.1 contract: family, weight, size, leading, ramp, colour, tabular.
const TYPE_TABLE = {
  largeTitle: ['sectionTitle', '700', 34, 41, 'largeTitle', 'ink'],
  inlineTitle: ['sectionTitle', '600', 17, 22, 'headline', 'ink'],
  pageTitle: ['sectionTitle', '700', 28, 34, 'title1', 'ink'],
  recordTitle: ['serif', '700', 28, 36, 'title1', 'ink'],
  recordHeading: ['serif', '700', 22, 30, 'title2', 'ink'],
  sectionTitle: ['sectionTitle', '700', 22, 28, 'title2', 'ink'],
  subsectionTitle: ['sans', '600', 17, 22, 'headline', 'ink'],
  groupHeader: ['sans', '400', 13, 18, 'footnote', 'inkSoft'],
  name: ['sans', '600', 17, 22, 'headline', 'ink'],
  rowRecord: ['serif', '700', 17, 23, 'body', 'ink'],
  recordText: ['serif', '400', 17, 26, 'body', 'ink'],
  body: ['sans', '400', 17, 22, 'body', 'ink'],
  strong: ['sans', '600', 17, 22, 'body', 'ink'],
  secondary: ['sans', '400', 15, 20, 'subheadline', 'inkSoft'],
  footnote: ['sans', '400', 13, 18, 'footnote', 'inkSoft'],
  capsule: ['sans', '600', 12, 16, 'caption1', 'inkSoft'],
  figure: ['sans', '700', 34, 41, 'largeTitle', 'ink', true],
  tileFigure: ['sans', '600', 22, 28, 'title2', 'ink', true],
} as const satisfies Record<CurrentTextVariant, readonly unknown[]>;

describe('every name from before the token source keeps its value', () => {
  test('colour roles', () => {
    const kept = Object.fromEntries(
      Object.keys(BEFORE_LIGHT).map((role) => [
        role,
        light[role as keyof typeof light],
      ]),
    );
    expect(kept).toEqual(BEFORE_LIGHT);
    // The one change: `line` is now an alias of dividerSubtle, so under
    // Increase Contrast it steps to the default divider as dividerSubtle does.
    expect(lightHighContrast).toMatchObject({
      ...BEFORE_HIGH_CONTRAST,
    });
    expect(partyColors).toEqual({
      labor: '#B02E33',
      liberal: '#1D4F91',
      nationals: '#8F6E00',
      lnp: '#4A90D9',
      greens: '#2E7D32',
      oneNation: '#BF5B15',
      independent: '#3E5B77',
      other: '#7C6690',
    });
    expect(partyWashes).toEqual({
      labor: '#F1E1DF',
      liberal: '#DFE5EA',
      nationals: '#EDE8D8',
      lnp: '#E5ECF3',
      greens: '#E2EADE',
      oneNation: '#F3E6DB',
      independent: '#E3E6E7',
      other: '#EBE7EA',
    });
    expect(currentChromeColours()).toEqual({
      tint: '#142A43',
      inactive: '#575C52',
      title: '#23271F',
    });
  });
  test.each(['system', 'serif'] as const)(
    'all eighteen type roles under %s headings',
    (face) => {
      const styles = textStylesFor(face);
      const canonical = Object.keys(styles);
      expect(canonical.sort()).toEqual(Object.keys(TYPE_TABLE).sort());
      for (const [name, values] of Object.entries(TYPE_TABLE)) {
        const [
          family,
          fontWeight,
          fontSize,
          lineHeight,
          dynamicTypeRamp,
          color,
          tabular,
        ] = values;
        const serif =
          family === 'serif' || (family === 'sectionTitle' && face === 'serif');
        expect(styles[name as CurrentTextVariant]).toEqual({
          fontFamily: serif
            ? fontWeight === '400'
              ? fonts.serif
              : fonts.serifBold
            : undefined,
          fontWeight,
          fontSize,
          lineHeight,
          dynamicTypeRamp,
          color,
          ...(tabular ? { tabular: true } : {}),
        });
      }
      expect(
        [...new Set(Object.values(styles).map((r) => r.fontSize))].sort(
          (a, b) => a - b,
        ),
      ).toEqual([12, 13, 15, 17, 22, 28, 34]);
      expect(interfaceFonts.sans).toBeUndefined();
      expect(styles.figure.fontFamily).toBeUndefined();
      expect(styles.tileFigure.fontFamily).toBeUndefined();
    },
  );
  test('space, shape and size', () => {
    expect(rhythm).toMatchObject({
      line: 4,
      tight: 8,
      heading: 8,
      row: 11,
      groupHeader: 6,
      block: 16,
      group: 24,
      section: 36,
      screen: 20,
    });
    expect(layout).toEqual({
      screenMargin: 20,
      rowGap: 11,
      subGap: 24,
      sectionGap: 36,
    });
    expect(accents).toEqual({
      money: { ink: 'moneyInk', wash: 'moneyWash' },
      votes: { ink: 'votesInk', wash: 'votesWash' },
      interests: { ink: 'interestsInk', wash: 'interestsWash' },
      bills: { ink: 'billsInk', wash: 'billsWash' },
      people: { ink: 'navy', wash: 'navyWash' },
      leads: { ink: 'navy', wash: 'navyWash' },
    });
    expect(typeRolesRegular).toEqual({});
    expect(radii).toMatchObject({
      container: 22,
      tile: 18,
      thumb: 10,
      bar: 4,
      capsule: 999,
      round: 999,
    });
    expect([hairline, radii.bar, minimumTarget]).toEqual([1, 4, 44]);
    expect(controlHeight).toEqual({ compact: 44, default: 48, large: 56 });
  });
});

describe('promised colour pairs pass in every theme', () => {
  const themes: Record<string, Palette> = {
    light,
    dark,
    lightHighContrast: { ...light, ...lightHighContrast },
    darkHighContrast: { ...dark, ...darkHighContrast },
  };
  test.each(Object.keys(themes))('%s', (theme) => {
    const palette = themes[theme]!;
    const failures: string[] = [];
    const need = (fg: string, bg: string, min: number, label: string) => {
      const ratio = contrastRatio(fg, bg);
      if (ratio < min) failures.push(`${label} ${ratio.toFixed(2)} < ${min}`);
    };
    const check = (
      pairs: readonly { fg: string; bg: string }[],
      min: number,
    ) => {
      for (const { fg, bg } of pairs)
        need(
          palette[fg as keyof Palette],
          palette[bg as keyof Palette],
          min,
          `${fg} on ${bg}`,
        );
    };
    check(contrastRules.text, 4.5);
    check(contrastRules.nonText, 3);
    if (theme.endsWith('HighContrast')) check(contrastRules.strong, 7);
    const isDark = theme.startsWith('dark');
    const dots = isDark ? partyColorsDark : partyColors;
    const washes = isDark ? partyWashesDark : partyWashes;
    for (const party of Object.keys(dots) as (keyof typeof dots)[]) {
      for (const surface of ['paper', 'raised'] as const)
        need(dots[party], palette[surface], 3, `${party} dot on ${surface}`);
      for (const text of ['ink', 'inkSoft'] as const)
        need(palette[text], washes[party], 4.5, `${text} on the ${party} wash`);
    }
    expect(failures).toEqual([]);
  });
  test('the forbidden pairs really fail in light', () => {
    for (const { fg, bg } of contrastRules.forbidden)
      expect(contrastRatio(light[fg], light[bg])).toBeLessThan(4.5);
  });
});

// Colour literals (hex, rgb(), hsl()) in app sources outside the generated
// tokens. There was no lint rule for raw colours; this count is the guard. A
// file may go down, never up; a new file starts at zero. When a pass removes
// some, lower its number here.
const COLOUR_BASELINE: Record<string, number> = {
  'src/features/money/ported/palette.ts': 1,
  'src/test-screens/VoiceBridgeTestScreen.tsx': 5,
  'src/design/menu.tsx': 1,
  'src/workbench/Workbench.tsx': 1,
  // Photos sit on black, under black scrims, in every scheme; no role draws them.
  'src/features/explore/Picture.tsx': 1,
  'src/features/explore/PhotoViewer.tsx': 3,
};
const COLOUR =
  /(?<![\w&#-])#(?:[0-9a-fA-F]{8}|[0-9a-fA-F]{6}|[0-9a-fA-F]{3,4})(?![\w-])|\b(?:rgba?|hsla?)\(/g;

test('no new raw colours outside the tokens', () => {
  const counts: Record<string, number> = {};
  const walk = (dir: string) => {
    for (const name of readdirSync(dir)) {
      const path = join(dir, name);
      if (name === 'node_modules' || name.startsWith('.')) continue;
      if (statSync(path).isDirectory()) walk(path);
      else if (['.ts', '.tsx', '.js', '.jsx'].includes(extname(name))) {
        const file = relative(MOBILE, path);
        if (file === join('src', 'design', 'tokens.generated.ts')) continue;
        const n = readFileSync(path, 'utf8').match(COLOUR)?.length ?? 0;
        if (n) counts[file] = n;
      }
    }
  };
  walk(join(MOBILE, 'src'));
  walk(join(MOBILE, 'modules'));
  const over = Object.entries(counts)
    .filter(([file, n]) => n > (COLOUR_BASELINE[file] ?? 0))
    .map(
      ([file, n]) =>
        `${file}: ${n} raw colours (baseline ${COLOUR_BASELINE[file] ?? 0}); use a role from tokens.ts`,
    );
  expect(over).toEqual([]);
});
