/* eslint-disable @typescript-eslint/no-require-imports -- CommonJS rule and config. */
import { Linter } from 'eslint';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { transform } from '../scripts/codemod-use-colors';

// Dark mode (19 Nov 2026), Option H: Android takes its roles from
// `useColors()`. The codemod converts a file; the lint rule reports what is
// still static. Both are what the screen lanes run on their own files.
const MOBILE = join(__dirname, '..');
const rule = require('../scripts/static-colors-rule.js');
const lanes = require('../scripts/static-colors-lanes.cjs') as string[];
const parser = require('@typescript-eslint/parser');

function lint(code: string, filename = 'src/features/today/Card.tsx') {
  const linter = new Linter({ configType: 'flat' });
  return linter
    .verify(
      code,
      [
        {
          files: ['**/*.{ts,tsx}'],
          languageOptions: {
            parser,
            parserOptions: { ecmaFeatures: { jsx: true } },
          },
          plugins: { opax: { rules: { 'static-colors': rule } } },
          rules: { 'opax/static-colors': 'error' },
        },
      ],
      { filename: join(MOBILE, filename) },
    )
    .map(({ line, ruleId, fatal }) => ({ line, ruleId, fatal }));
}
const fix = (code: string, file = 'src/features/today/Card.tsx') =>
  transform(join(MOBILE, file), code);

describe('opax/static-colors', () => {
  test('reports a role read from the static object, in a sheet and in a component', () => {
    const found = lint(`import { StyleSheet, View } from 'react-native';
import { colors, rhythm } from '../../design/tokens';
export function Card() {
  return <View style={[styles.card, { borderColor: colors.navy }]} />;
}
const styles = StyleSheet.create({
  card: { backgroundColor: colors.raised, padding: rhythm.block },
});
`);
    expect(found).toEqual([
      { line: 4, ruleId: 'opax/static-colors', fatal: undefined },
      { line: 7, ruleId: 'opax/static-colors', fatal: undefined },
    ]);
  });

  test('a role from useColors() or a makeStyles factory is not reported', () => {
    expect(
      lint(`import { StyleSheet, View } from 'react-native';
import { rhythm } from '../../design/tokens';
import { makeStyles, useColors } from '../../design/use-colors';
export function Card() {
  const colors = useColors();
  const styles = useStyles();
  return <View style={[styles.card, { borderColor: colors.navy }]} />;
}
const useStyles = makeStyles((colors) =>
  StyleSheet.create({
    card: { backgroundColor: colors.raised, padding: rhythm.block },
  }),
);
`),
    ).toEqual([]);
  });

  test('the static chrome set is reported too; a type-only use and other modules are not', () => {
    expect(
      lint(`import { chromeColours, colors } from '../../design/tokens';
import { colors as theirs } from './elsewhere';
type Roles = typeof colors;
export const tint = chromeColours.tint;
export const other: Roles | undefined = undefined;
export const unrelated = theirs.navy;
`),
    ).toEqual([{ line: 4, ruleId: 'opax/static-colors', fatal: undefined }]);
  });

  test('the token module and the hook itself are exempt', () => {
    const code = `import { colors } from './tokens';\nexport const set = colors;\n`;
    expect(lint(code, 'src/design/use-colors.ts')).toEqual([]);
    expect(lint(code, 'src/design/card.tsx')).toHaveLength(1);
  });

  test('it is an error everywhere except the screen lanes own files, where it warns', () => {
    const config = readFileSync(join(MOBILE, 'eslint.config.js'), 'utf8');
    expect(config).toContain("'opax/static-colors': 'error'");
    expect(config).toMatch(
      /files: STATIC_COLOR_LANES,\s*rules: \{ 'opax\/static-colors': 'warn' \}/,
    );
    // Only screen-lane paths: never the shared design or navigation files.
    expect(lanes.length).toBeGreaterThan(0);
    for (const glob of lanes)
      expect(glob).toMatch(/^src\/(?:features|workbench|test-screens)\//);
    // Lane D owns it, and the foundation left it alone.
    expect(lanes).toContain('src/features/reports/**');
  });
});

describe('codemod-use-colors', () => {
  test('moves a sheet behind makeStyles and gives each component its hooks', () => {
    const { output, notes } =
      fix(`import { StyleSheet, View } from 'react-native';
import { colors, rhythm } from '../../design/tokens';

export function Card({ on }: { on: boolean }) {
  return (
    <View style={[styles.card, on ? { borderColor: colors.navy } : null]} />
  );
}
export const Plain = () => <View style={styles.card} />;
const styles = StyleSheet.create({
  card: { backgroundColor: colors.raised, padding: rhythm.block },
});
`);
    expect(notes).toEqual([]);
    expect(output).toContain(
      "import { makeStyles, useColors } from '../../design/use-colors';",
    );
    // `colors` is no longer imported: the local one shadows nothing.
    expect(output).toContain("import { rhythm } from '../../design/tokens';");
    expect(output).toContain(
      'const useStyles = makeStyles((colors) => StyleSheet.create({',
    );
    expect(output).toMatch(
      /export function Card\(\{ on \}: \{ on: boolean \}\) \{\s*const colors = useColors\(\);\s*const styles = useStyles\(\);/,
    );
    // An expression-bodied component gains a body; it reads no role itself.
    expect(output).toMatch(
      /export const Plain = \(\) => \{\s*const styles = useStyles\(\);\s*return <View style=\{styles\.card\} \/>;\s*\}/,
    );
    // The result is clean under the rule, and a second run changes nothing.
    expect(lint(output)).toEqual([]);
    expect(fix(output).changed).toBe(false);
  });

  test('adds the name to the dependency list of a React hook round the read', () => {
    const { output } = fix(`import { useMemo } from 'react';
import { colors } from '../../design/tokens';
export function useTint(on: boolean) {
  return useMemo(() => (on ? colors.navy : colors.inkSoft), [on]);
}
`);
    expect(output).toContain('[on, colors]');
    expect(output).toMatch(
      /export function useTint\(on: boolean\) \{\s*const colors = useColors\(\);/,
    );
  });

  test('a sheet with no role in it is left as it is', () => {
    const code = `import { StyleSheet, View } from 'react-native';
import { colors } from '../../design/tokens';
export function Row() {
  return <View style={[styles.row, { backgroundColor: colors.paper }]} />;
}
const styles = StyleSheet.create({ row: { flexDirection: 'row' } });
`;
    const { output } = fix(code);
    expect(output).toContain(
      "const styles = StyleSheet.create({ row: { flexDirection: 'row' } });",
    );
    expect(output).not.toContain('makeStyles');
    expect(output).toContain('const colors = useColors();');
  });

  test('says where a human is needed and leaves those reads and the import alone', () => {
    const { output, notes } = fix(`import { StyleSheet } from 'react-native';
import { colors } from '../../design/tokens';
const TONES = { good: colors.moneyInk };
function tone(bad: boolean) {
  return bad ? colors.danger : TONES.good;
}
export function Badge({ ground = colors.paper }: { ground?: unknown }) {
  return tone(!ground);
}
export const styles = StyleSheet.create({ badge: { color: colors.ink } });
`);
    expect(notes.map((n) => [n.line, n.message.slice(0, 60)])).toEqual([
      [10, 'NEEDS A HUMAN: exported style sheet `styles` holds a role; o'],
      [3, 'NEEDS A HUMAN: `colors` is read at module level, outside a st'],
      [5, 'NEEDS A HUMAN: `colors` is read in `tone`, which is not a com'],
      [7, 'NEEDS A HUMAN: `colors` is read in a parameter default of `Ba'],
      [10, 'NEEDS A HUMAN: `colors` is read at module level, outside a s'],
    ]);
    // Nothing could be converted, so nothing was written.
    expect(output).toContain("import { colors } from '../../design/tokens';");
    // The rule reports exactly the reads the codemod left.
    expect(lint(output).map((m) => m.line)).toEqual([3, 5, 7, 10]);
  });

  test('a file that takes no role from design/tokens is untouched', () => {
    const code = `import { rhythm } from '../../design/tokens';\nexport const gap = rhythm.block;\n`;
    expect(fix(code)).toEqual({ output: code, notes: [], changed: false });
  });

  test('the shared files are converted: the rule finds nothing static outside the lanes', () => {
    // The gate is `npm run lint`; this pins the files the foundation owns so
    // a revert of one of them fails here by name.
    for (const file of [
      'src/design/card.tsx',
      'src/design/controls.tsx',
      'src/design/layout.tsx',
      'src/design/states.tsx',
      'src/design/text.tsx',
      'src/navigation/chrome.ts',
      'src/navigation/AndroidSheet.tsx',
      'src/navigation/AndroidTabs.tsx',
      'src/app/_layout.tsx',
    ])
      expect([
        file,
        lint(readFileSync(join(MOBILE, file), 'utf8'), file),
      ]).toEqual([file, []]);
  });
});
