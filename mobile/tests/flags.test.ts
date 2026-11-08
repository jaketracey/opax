/* eslint-disable @typescript-eslint/no-require-imports -- Isolated module-load tests. */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

function load(extra: Record<string, unknown>) {
  let flags!: typeof import('../src/design/flags').designFlags;
  jest.isolateModules(() => {
    jest.doMock('expo-constants', () => ({
      __esModule: true,
      default: { expoConfig: { extra } },
    }));
    flags = require('../src/design/flags').designFlags;
  });
  return flags;
}
const defaults = {
  categorySymbols: true,
  searchTab: true,
  talkInAsk: true,
  groupedSurfaces: true,
};
afterEach(() => jest.dontMock('expo-constants'));

test('one frozen object with all recommended defaults', () => {
  const flags = load({ variant: 'development' });
  expect(flags).toEqual(defaults);
  expect(Object.isFrozen(flags)).toBe(true);
});
test.each(['development', 'e2e'])(
  '%s can override each flag independently',
  (variant) => {
    for (const key of Object.keys(defaults))
      expect(load({ variant, designFlags: { [key]: false } })).toEqual({
        ...defaults,
        [key]: false,
      });
  },
);
test.each(['production', 'unknown', undefined])(
  '%s ignores overrides',
  (variant) => {
    expect(
      load({
        variant,
        designFlags: Object.fromEntries(
          Object.keys(defaults).map((key) => [key, false]),
        ),
      }),
    ).toEqual(defaults);
  },
);
test('only booleans override, and unknown keys cannot enter the object', () => {
  expect(
    load({
      variant: 'development',
      designFlags: { searchTab: 'false', talkInAsk: 0, surprise: false },
    }),
  ).toEqual(defaults);
});
test('flags are read once, not on subsequent mutations of the config', () => {
  const overrides = { categorySymbols: false };
  const flags = load({ variant: 'development', designFlags: overrides });
  overrides.categorySymbols = true;
  expect(flags.categorySymbols).toBe(false);
});

const originalEnv = { ...process.env };
afterEach(() => {
  process.env = { ...originalEnv };
});
function build(
  variant: string,
  headingFace = 'serif',
  appearance = 'automatic',
) {
  process.env.OPAX_VARIANT = variant;
  process.env.OPAX_HEADING_FACE = headingFace;
  process.env.OPAX_APPEARANCE = appearance;
  let config!: typeof import('../app.config').default;
  jest.isolateModules(() => {
    config = require('../app.config').default;
  });
  return config;
}
test('capture config exposes both switches and extra.designFlags', () => {
  const config = build('e2e');
  expect(config.extra?.headingFace).toBe('serif');
  expect(config.extra?.designFlags).toEqual(defaults);
  expect(config.userInterfaceStyle).toBe('automatic');
});
test('production ignores capture environment switches', () => {
  const config = build('production');
  expect(config.extra?.headingFace).toBe('system');
  expect(config.userInterfaceStyle).toBe('light');
});
test('invalid build switches fail early', () => {
  expect(() => build('e2e', 'typo')).toThrow('OPAX_HEADING_FACE');
  expect(() => build('e2e', 'system', 'dark')).toThrow('OPAX_APPEARANCE');
});
test('only development and e2e override the heading face at module load', () => {
  for (const variant of [
    'development',
    'e2e',
    'production',
    'unknown',
    undefined,
  ]) {
    const canOverride = variant === 'development' || variant === 'e2e';
    jest.isolateModules(() => {
      jest.doMock('expo-constants', () => ({
        __esModule: true,
        default: { expoConfig: { extra: { variant, headingFace: 'serif' } } },
      }));
      const tokens =
        require('../src/design/tokens') as typeof import('../src/design/tokens');
      expect(tokens.headingFace).toBe(canOverride ? 'serif' : 'system');
      expect(tokens.textStyles.pageTitle.fontFamily).toBe(
        canOverride ? 'Merriweather-Bold' : undefined,
      );
      expect(tokens.textStyles.figure.fontFamily).toBeUndefined();
    });
  }
});
test('every reserved module has a star export and authorisation stays direct', () => {
  const barrel = readFileSync(
    join(__dirname, '../src/design/primitives.tsx'),
    'utf8',
  );
  for (const module of [
    'flags',
    'copy',
    'symbols',
    'row-link',
    'charts',
    'filter-sheet',
    'party-groups',
    'device',
  ])
    expect(barrel).toContain(`export * from './${module}';`);
  expect(barrel).not.toContain('authorisation');
  expect(barrel).not.toMatch(/export\s*\{/);
});

test('flag JSON changes extra.designFlags without a code edit, production ignores it', () => {
  process.env.OPAX_DESIGN_FLAGS = '{"searchTab":false,"talkInAsk":false}';
  expect(build('e2e').extra?.designFlags).toEqual({
    ...defaults,
    searchTab: false,
    talkInAsk: false,
  });
  expect(build('production').extra?.designFlags).toEqual(defaults);
  process.env.OPAX_DESIGN_FLAGS = '{"searchTab":"false"}';
  expect(() => build('e2e')).toThrow('OPAX_DESIGN_FLAGS');
});
