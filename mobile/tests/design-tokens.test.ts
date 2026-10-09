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
import { contrastRules } from '../src/design/tokens.generated';
import {
  accents,
  chrome,
  controlHeight,
  deprecatedTextVariants,
  fonts,
  hairline,
  layout,
  minimumTarget,
  radius,
  rhythm,
  spacing,
  textStyles,
} from '../src/design/tokens';

// Design tokens (docs/design/TOKENS.md): tokens.generated.ts is fresh, every
// name the app used before the token source keeps its value, the promised
// colour pairs pass in every theme, and raw colours only go down.
const MOBILE = join(__dirname, '..');

test('tokens.generated.ts matches docs/design/design-tokens.json', () => {
  // Throws, with the generator's message, while the file is stale.
  execFileSync(
    process.execPath,
    ['../scripts/build_tokens.mjs', '--check', '--only', 'app'],
    { cwd: MOBILE, stdio: 'pipe' },
  );
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
  line: '#DFDCD2',
  lineStrong: '#8D897B',
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
// [font, size, line height, Dynamic Type ramp, colour, tabular]
// The eleven current roles keep their values. Pass 2B made the deprecated
// roles aliases of their replacements (only six sizes are drawn), so those
// are checked against their replacement below.
const BEFORE_TEXT = {
  title: ['Merriweather', 34, 42, 'largeTitle', 'ink'],
  padTitle: ['Merriweather', 42, 52, 'largeTitle', 'ink'],
  padLede: ['PublicSans', 19, 30, 'body', 'ink'],
  heading: ['Merriweather-Bold', 22, 30, 'title2', 'ink'],
  subheading: ['Merriweather-Bold', 18, 24, 'title3', 'ink'],
  record: ['Merriweather', 17, 29, 'body', 'ink'],
  body: ['PublicSans', 17, 25, 'body', 'ink'],
  strong: ['PublicSans-SemiBold', 17, 25, 'body', 'ink'],
  lede: ['PublicSans', 16, 24, 'callout', 'ink'],
  metadata: ['PublicSans', 15, 21, 'subheadline', 'inkSoft'],
  fine: ['PublicSans', 13, 18, 'footnote', 'inkSoft'],
  display: ['Merriweather-Bold', 34, 42, 'largeTitle', 'ink', true],
  figure: ['PublicSans-Bold', 28, 34, 'title1', 'ink', true],
  figureInline: ['PublicSans-SemiBold', 17, 25, 'body', 'ink', true],
  tag: ['PublicSans-SemiBold', 13, 18, 'footnote', 'bronzeInk'],
  kicker: ['PublicSans-SemiBold', 13, 18, 'footnote', 'inkSoft'],
  caption: ['PublicSans', 12, 16, 'caption1', 'inkSoft'],
  chip: ['PublicSans-SemiBold', 13, 17, 'footnote', 'ink'],
  control: ['PublicSans-SemiBold', 17, 22, 'body', 'ink'],
  countdown: ['PublicSans-SemiBold', 17, 22, 'body', 'ink', true],
} as const;

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
    expect(lightHighContrast).toEqual({
      ...BEFORE_HIGH_CONTRAST,
      line: BEFORE_LIGHT.dividerDefault,
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
    expect(chrome).toEqual({
      tint: '#142A43',
      inactive: '#575C52',
      title: '#23271F',
    });
  });
  test('type roles', () => {
    for (const [
      name,
      [font, size, lineHeight, ramp, color, tabular],
    ] of Object.entries(BEFORE_TEXT)) {
      if (name in deprecatedTextVariants) continue;
      expect(textStyles[name as keyof typeof textStyles]).toEqual({
        fontFamily: font,
        fontSize: size,
        lineHeight,
        dynamicTypeRamp: ramp,
        color,
        ...(tabular ? { tabular } : {}),
      });
    }
    // Deprecated roles draw as their replacement, keeping only what the
    // replacement's use needs (tabular figures, the tag's bronze ink, the
    // title's regular-width step).
    const as = (use: keyof typeof textStyles, change = {}) => ({
      ...textStyles[use],
      ...change,
    });
    expect(textStyles.lede).toEqual(as('body'));
    expect(textStyles.padLede).toEqual(as('body'));
    expect(textStyles.caption).toEqual(as('fine'));
    expect(textStyles.figure).toEqual(as('display'));
    expect(textStyles.figureInline).toEqual(as('strong', { tabular: true }));
    expect(textStyles.tag).toEqual(as('label', { color: 'bronzeInk' }));
    expect(textStyles.kicker).toEqual(as('label'));
    expect(textStyles.chip).toEqual(as('label'));
    expect(textStyles.countdown).toEqual(as('control', { tabular: true }));
    expect(textStyles.padTitle).toEqual(
      as('title', { fontSize: 42, lineHeight: 52 }),
    );
    // Six sizes, plus the title's regular-width step.
    expect(
      [...new Set(Object.values(textStyles).map((r) => r.fontSize))].sort(
        (a, b) => a - b,
      ),
    ).toEqual([13, 15, 17, 18, 22, 34, 42]);
    expect(fonts).toEqual({
      serif: 'Merriweather',
      serifBold: 'Merriweather-Bold',
      sans: 'PublicSans',
      sansSemiBold: 'PublicSans-SemiBold',
      sansBold: 'PublicSans-Bold',
    });
  });
  test('space, shape and size', () => {
    expect(spacing).toEqual({
      s1: 4,
      s2: 6,
      s3: 8,
      s4: 16,
      s5: 26,
      s6: 32,
      s7: 52,
    });
    expect(rhythm).toMatchObject({
      line: 4,
      tight: 8,
      heading: 12,
      block: 16,
      group: 24,
      section: 36,
      screen: 20,
    });
    expect(layout).toEqual({
      screenMargin: 20,
      rowGap: 10,
      subGap: 24,
      sectionGap: 36,
    });
    expect(accents).toEqual({
      money: { ink: 'moneyInk', wash: 'moneyWash' },
      votes: { ink: 'votesInk', wash: 'votesWash' },
      interests: { ink: 'interestsInk', wash: 'interestsWash' },
      bills: { ink: 'billsInk', wash: 'billsWash' },
      people: { ink: 'navy', wash: 'navyWash' },
      leads: { ink: 'bronzeInk', wash: 'bronzeWash' },
    });
    expect([hairline, radius, minimumTarget]).toEqual([1, 4, 44]);
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
  'src/features/money/ported/palette.ts': 38,
  'src/features/talk/VoiceOrb.tsx': 11,
  'src/test-screens/VoiceBridgeTestScreen.tsx': 5,
  'src/design/menu.tsx': 1,
  'src/features/money/MoneyMapLabels.tsx': 1,
  'src/features/money/NativeMoneyScene.ts': 1,
  'src/workbench/Workbench.tsx': 1,
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
