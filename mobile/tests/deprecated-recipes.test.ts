import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { extname, join, relative } from 'node:path';

// Design programme pass 2B (docs/design/DESIGN-REVIEW-2026-10.md 5.3): the
// deprecated recipes that still have uses outside src/design. Their uses may
// only go down: a new file or a higher count fails. Recipes with no uses left
// are errors in the `opax/deprecated-design` lint rule instead. After moving
// screens off a recipe (pass 3 and 4), lower the baseline with
//   UPDATE_DEPRECATED_BASELINE=1 npx jest tests/deprecated-recipes.test.ts
const MOBILE = join(__dirname, '..');
const BASELINE = join(__dirname, 'fixtures', 'deprecated-recipes.json');

const RECIPES: Record<string, { pattern: RegExp; use: string }> = {
  AsAtLine: { pattern: /<AsAtLine\b/g, use: 'SourceLine' },
  SourceLink: { pattern: /<SourceLink\b/g, use: 'SourceLine originals' },
  ViewOriginal: { pattern: /<ViewOriginal\b/g, use: 'SourceLine originals' },
  InfoButton: { pattern: /<InfoButton\b/g, use: 'SourceLine notes' },
  'Section info': { pattern: /\binfo=\{/g, use: 'SourceLine notes' },
  StaleNotice: { pattern: /<StaleNotice\b/g, use: 'SourceLine savedAt' },
  UpdatedCaption: { pattern: /<UpdatedCaption\b/g, use: 'SourceLine' },
  OpaxWebLink: { pattern: /<OpaxWebLink\b/g, use: 'LinkRow external' },
  BillStatus: { pattern: /<BillStatus\b/g, use: 'StatusLabel' },
  VoteSide: { pattern: /<VoteSide\b/g, use: 'StatusLabel' },
  RoundButton: { pattern: /<RoundButton\b/g, use: 'IconButton' },
  Figure: { pattern: /<(Money)?Figure\b/g, use: 'BigFigure' },
  'static palette read': {
    pattern: /\blight\.[a-zA-Z]+/g,
    use: 'colors.<role>, which resolves Increase Contrast',
  },
  'radius token': {
    pattern: /(?<![\w.])radius(?![\w:])/g,
    use: 'radii.sm, radii.md or radii.pill',
  },
  'old spacing step': {
    pattern: /\bspacing\.s[2567]\b/g,
    use: 'rhythm',
  },
};

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return files(path);
    return ['.ts', '.tsx'].includes(extname(path)) ? [path] : [];
  });
}
// Everything outside the design system, which keeps the aliases.
function census(): Record<string, Record<string, number>> {
  const counts: Record<string, Record<string, number>> = {};
  for (const path of files(join(MOBILE, 'src'))) {
    const file = relative(MOBILE, path);
    if (file.startsWith('src/design/')) continue;
    const text = readFileSync(path, 'utf8');
    for (const [recipe, { pattern }] of Object.entries(RECIPES)) {
      const n = text.match(pattern)?.length ?? 0;
      if (n) (counts[recipe] ??= {})[file] = n;
    }
  }
  return counts;
}

test('deprecated recipes are not used anywhere new or more often', () => {
  const now = census();
  if (process.env.UPDATE_DEPRECATED_BASELINE) {
    writeFileSync(BASELINE, `${JSON.stringify(now, null, 2)}\n`);
    return;
  }
  const baseline = JSON.parse(readFileSync(BASELINE, 'utf8')) as Record<
    string,
    Record<string, number>
  >;
  const grown: string[] = [];
  for (const [recipe, perFile] of Object.entries(now))
    for (const [file, n] of Object.entries(perFile)) {
      const allowed = baseline[recipe]?.[file] ?? 0;
      if (n > allowed)
        grown.push(
          `${file}: ${recipe} ${allowed} -> ${n} (use ${RECIPES[recipe]!.use})`,
        );
    }
  expect(grown).toEqual([]);
});

test('every recipe in the baseline is still a recipe the census counts', () => {
  const baseline = JSON.parse(readFileSync(BASELINE, 'utf8')) as Record<
    string,
    unknown
  >;
  for (const recipe of Object.keys(baseline))
    expect(Object.keys(RECIPES)).toContain(recipe);
});

test('the lint rule rejects the retired recipes in new code', () => {
  /* eslint-disable @typescript-eslint/no-require-imports */
  const { Linter } = require('eslint') as typeof import('eslint');
  const parser = require('@typescript-eslint/parser');
  const rule = require('../scripts/deprecated-design-rule');
  /* eslint-enable @typescript-eslint/no-require-imports */
  const linter = new Linter({ configType: 'flat' });
  const lint = (code: string, file = 'src/features/Example.tsx') =>
    linter
      .verify(
        code,
        [
          {
            files: ['**/*.tsx'],
            languageOptions: {
              parser,
              parserOptions: { ecmaFeatures: { jsx: true } },
            },
            plugins: { opax: { rules: { 'deprecated-design': rule } } },
            rules: { 'opax/deprecated-design': 'error' },
          },
        ],
        join(MOBILE, file),
      )
      .map((m) => m.message);
  expect(
    lint(`import { Text } from '../design/primitives';
export const A = () => <Text variant="caption">x</Text>;
export const B = (on: boolean) => <Text variant={on ? 'kicker' : 'body'}>x</Text>;`),
  ).toEqual([
    'Type role "caption" is deprecated: use fine.',
    'Type role "kicker" is deprecated: use label, or no kicker at all.',
  ]);
  expect(
    lint(`import { PartyChip, Section } from '../design/primitives';
export const A = () => <Section accent="places" title="x"><PartyChip party="Labor" status="current" /></Section>;`),
  ).toEqual([
    'The "places" accent is deprecated: use "people".',
    'PartyChip is retired: use PartyLabel (dense, linked={false}).',
  ]);
  expect(
    lint(`import { StyleSheet } from 'react-native';
const s = StyleSheet.create({ k: { letterSpacing: 1 } });
export const A = (d: string) => <>{d.toLocaleUpperCase('en-AU')}</>;`),
  ).toHaveLength(2);
  // The design system keeps its aliases.
  expect(
    lint(
      `export const A = () => <PartyChip party="Labor" status="current" />;`,
      'src/design/Example.tsx',
    ),
  ).toEqual([]);
});
