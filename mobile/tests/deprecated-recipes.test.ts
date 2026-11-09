import { readdirSync, readFileSync, statSync } from 'node:fs';
import { extname, join, relative } from 'node:path';

// Retired recipes have no callers. The empty baseline is a fixed guard:
// it cannot be raised by an environment variable or an update command.
const MOBILE = join(__dirname, '..');
const BASELINE = join(__dirname, 'fixtures', 'deprecated-recipes.json');

const RECIPES: Record<string, { pattern: RegExp; use: string }> = {
  RowList: { pattern: /<RowList\b/g, use: 'InsetGroup' },
  KeyValueList: { pattern: /<KeyValueList\b/g, use: 'ValueRow in InsetGroup' },
  AsAtLine: { pattern: /<AsAtLine\b/g, use: 'SourceLine' },
  SourceLink: { pattern: /<SourceLink\b/g, use: 'SourceLine originals' },
  ViewOriginal: { pattern: /<ViewOriginal\b/g, use: 'SourceLine originals' },
  InfoButton: { pattern: /<InfoButton\b/g, use: 'SourceLine notes' },
  'Section info': { pattern: /\binfo=\{/g, use: 'SourceLine notes' },
  StaleNotice: { pattern: /<StaleNotice\b/g, use: 'SourceLine savedAt' },
  UpdatedCaption: { pattern: /<UpdatedCaption\b/g, use: 'SourceLine' },
  OpaxWebLink: { pattern: /<OpaxWebLink\b/g, use: 'LinkRow external' },
  BillStatus: { pattern: /<BillStatus\b/g, use: 'StatusCapsule' },
  VoteSide: { pattern: /<VoteSide\b/g, use: 'StatusCapsule' },
  RoundButton: { pattern: /<RoundButton\b/g, use: 'IconButton' },
  Figure: { pattern: /<(Money)?Figure\b/g, use: 'FigureBlock' },
  'static palette read': {
    pattern: /\blight\.[a-zA-Z]+/g,
    use: 'colors.<role>, which resolves Increase Contrast',
  },
  'radius token': {
    pattern:
      /import\s*\{[^}]*\bradius\b[^}]*\}\s*from\s*['"][^'"]*design\/(?:tokens|primitives)['"]/g,
    use: 'radii.bar, radii.container or radii.capsule',
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
// Screen recipes are also enforced in the kit by the AST rules below.
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
  const baseline = JSON.parse(readFileSync(BASELINE, 'utf8')) as Record<
    string,
    Record<string, number>
  >;
  expect(baseline).toEqual({});
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
    'Type role "caption" is deprecated: use footnote.',
    'Type role "kicker" is deprecated: use capsule.',
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
  // The kit has no internal exemption for a retired component.
  expect(
    lint(
      `export const A = () => <PartyChip party="Labor" status="current" />;`,
      'src/design/Example.tsx',
    ),
  ).toEqual(['PartyChip is retired: use PartyLabel (dense, linked={false}).']);
});

// The AST rules cover every source file, including existing design components.
// Counts live beside the lint rule so CLI and tests use the same dated census.
/* eslint-disable @typescript-eslint/no-require-imports */
const designRule = require('../scripts/deprecated-design-rule');
const { Linter } = require('eslint') as typeof import('eslint');
const designParser = require('@typescript-eslint/parser');
/* eslint-enable @typescript-eslint/no-require-imports */
const designLinter = new Linter({ configType: 'flat' });
function designMessages(code: string, file = 'src/features/New.tsx') {
  return designLinter.verify(
    code,
    [
      {
        files: ['**/*.{ts,tsx,js,jsx}'],
        languageOptions: {
          parser: designParser,
          parserOptions: { ecmaFeatures: { jsx: true } },
        },
        plugins: { opax: { rules: designRule.rules } },
        rules: Object.fromEntries(
          Object.keys(designRule.rules).map((key) => [`opax/${key}`, 'error']),
        ),
      },
    ],
    { filename: join(MOBILE, file), allowInlineConfig: false },
  );
}

test('old roles, the entire spacing scale, static light reads and new design rules never grow', () => {
  const counts: Record<string, Record<string, number>> = {};
  const failures: string[] = [];
  for (const path of [
    ...files(join(MOBILE, 'src')),
    ...files(join(MOBILE, 'modules')),
  ]) {
    const file = relative(MOBILE, path);
    if (file === 'src/design/tokens.generated.ts') continue;
    for (const message of designMessages(readFileSync(path, 'utf8'), file)) {
      if (!message.ruleId?.startsWith('opax/')) {
        failures.push(`${file}: ${message.message}`);
        continue;
      }
      const recipe = `${message.ruleId.slice(5)}/${message.messageId}`;
      const n = ((counts[recipe] ??= {})[file] =
        (counts[recipe]?.[file] ?? 0) + 1);
      const allowed = designRule.ratchetBaseline[recipe]?.[file] ?? 0;
      if (n > allowed) failures.push(`${file}: ${recipe} ${allowed} -> ${n}`);
    }
  }
  expect(failures).toEqual([]);
});

test('new rules reject invalid recipes and allow canonical equivalents', () => {
  const bad = designMessages(`import { showMenu } from '../design/menu';
const a = <Text variant="body" tone="moneyInk">x</Text>;
const b = <Icon name="doc.text" tone="moneyInk" />;
const c = { borderRadius: 22 };
showMenu([]);
const gap = spacing.s1;
const old = <Text variant="heading">x</Text>;`);
  expect(bad.map((m) => m.ruleId)).toEqual(
    expect.arrayContaining([
      'opax/category-ink',
      'opax/symbol-vocabulary',
      'opax/continuous-corners',
      'opax/show-menu',
      'opax/deprecated-design',
    ]),
  );
  expect(bad.every((m) => m.severity === 2)).toBe(true);
  expect(
    designMessages(`const a = <Text variant="figure" tone="moneyInk">42</Text>;
const b = <Icon name={symbols.money} tone="moneyInk" type="hierarchical" />;
const c = { borderRadius: 22, borderCurve: 'continuous' }; const gap = rhythm.row;`),
  ).toEqual([]);
  expect(designMessages('showMenu([])', 'src/design/Example.tsx')).toEqual([]);
});

test('every legacy role and spacing step is detected, including conditional roles', () => {
  for (const role of [
    'title',
    'display',
    'heading',
    'subheading',
    'record',
    'metadata',
    'fine',
    'label',
    'control',
    'padTitle',
    'padLede',
  ])
    expect(
      designMessages(`<Text variant={on ? '${role}' : 'body'}>x</Text>`).some(
        (m) => m.messageId === 'role',
      ),
    ).toBe(true);
  for (const step of ['s1', 's2', 's3', 's4', 's5', 's6', 's7'])
    expect(
      designMessages(`const gap = spacing.${step};`).map((m) => m.messageId),
    ).toEqual(['spacing']);
  expect(designMessages('<Text variant="figure">42</Text>')).toEqual([]);
});
