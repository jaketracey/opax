import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  a11yRules,
  designPressableExports,
  designPressables,
  formatA11yIssue,
  scanA11y,
  type A11yRule,
} from '../scripts/a11y-static';

// Each fixture marks the line a finding belongs on with `expect: <rule>`, or
// the line above it with `expect-above: <rule>` (where a JSX line has no room).
const fixtures = join(__dirname, 'fixtures/a11y');
const read = (name: string) => readFileSync(join(fixtures, name), 'utf8');
function expected(content: string) {
  return content
    .split('\n')
    .flatMap((line, index) =>
      [...line.matchAll(/expect(-above)?: ([a-z-]+)/g)].map(
        (match) => `${index + (match[1] ? 0 : 1)} ${match[2]}`,
      ),
    )
    .sort();
}
function scan(name: string, inDesign = false) {
  return scanA11y(join(fixtures, name), read(name), { inDesign });
}
const found = (name: string, inDesign = false) =>
  scan(name, inDesign)
    .issues.map((issue) => `${issue.line} ${issue.rule}`)
    .sort();

describe('a11y-static rules', () => {
  const rules = (Object.keys(a11yRules) as A11yRule[]).filter(
    (rule) => rule !== 'stale-marker',
  );

  it.each(rules)('%s has a failing fixture that reports it', (rule) => {
    const name = `${rule}.fail.tsx`;
    const want = expected(read(name));
    expect(
      want.filter((line) => line.endsWith(` ${rule}`)).length,
    ).toBeGreaterThanOrEqual(2);
    expect(found(name)).toEqual(want);
  });

  it('reports stale and reasonless markers, and markers scoped to another rule', () => {
    const name = 'stale-marker.fail.tsx';
    expect(found(name)).toEqual(expected(read(name)));
    const messages = scan(name)
      .issues.filter((issue) => issue.rule === 'stale-marker')
      .map((issue) => issue.message);
    expect(messages).toEqual([
      'This a11y-ok marker excuses no finding: remove it',
      'An a11y-ok marker needs a reason after the colon',
      'This a11y-ok marker excuses no finding: remove it',
    ]);
  });

  it('passes a file that follows every rule, recording its marker', () => {
    const report = scan('pass.tsx');
    expect(report.issues.map(formatA11yIssue)).toEqual([]);
    expect(report.exceptions).toEqual([
      expect.objectContaining({
        rules: ['image-label'],
        reason: 'fixture art, decorative beside its caption',
      }),
    ]);
    // The decorative image is excused; everything else was checked outright.
    expect(report.checked['pressable-role']).toBeGreaterThanOrEqual(7);
    expect(report.checked['image-label']).toBe(6);
    expect(report.checked['target-size']).toBeGreaterThanOrEqual(5);
  });

  it('lets src/design set fontSize: it implements the Text roles', () => {
    expect(found('raw-font-size.fail.tsx', true)).toEqual([]);
    expect(
      scanA11y('src/design/text.tsx', read('raw-font-size.fail.tsx')).issues,
    ).toEqual([]);
    expect(
      scanA11y('src/features/x.tsx', read('raw-font-size.fail.tsx')).issues,
    ).toHaveLength(2);
  });

  it('reads the platform: design pressables are lifted to 48 dp on Android', () => {
    const issues = scan('target-size.fail.tsx').issues.map((i) => i.message);
    expect(issues).toEqual([
      expect.stringContaining(
        '32 wide and 32 tall on ios (needs 44); 32 wide and 32 tall on android (needs 48)',
      ),
      'Pressable target is 44 tall on android (needs 48): grow it, or add hitSlop',
      // hitSlop 4 on iOS; Android's own 48 dp floor covers the design surface.
      'Pressable target is 40 wide and 40 tall on ios (needs 44): grow it, or add hitSlop',
      // Absolutely positioned design surfaces keep their size on Android.
      expect.stringContaining('40 wide and 40 tall on android (needs 48)'),
    ]);
    const ios = scanA11y(
      'src/features/x/Close.ios.tsx',
      read('target-size.fail.tsx'),
    ).issues.map((i) => i.message);
    expect(ios.join('\n')).not.toContain('android');
  });

  it('recognises expo-image and the reanimated Image', () => {
    const report = scanA11y(
      'src/features/x/Inline.tsx',
      [
        "import { Image } from 'expo-image';",
        "import Animated from 'react-native-reanimated';",
        'export const A = ({ uri }: { uri: string }) => (',
        '  <>',
        '    <Image source={{ uri }} />',
        '    <Animated.Image source={{ uri }} />',
        '    <Image source={{ uri }} alt="Bill text, page one" />',
        '  </>',
        ');',
      ].join('\n'),
    );
    expect(report.issues.map((i) => `${i.line} ${i.rule}`)).toEqual([
      '5 image-label',
      '6 image-label',
    ]);
  });

  it('skips what the source cannot settle instead of guessing', () => {
    const report = scanA11y(
      'src/features/x/Forwarded.tsx',
      [
        "import { Pressable } from 'react-native';",
        "import type { PressableProps } from 'react-native';",
        'export const A = (props: PressableProps) => (',
        '  <Pressable {...props} style={props.style} />',
        ');',
      ].join('\n'),
    );
    expect(report.issues).toEqual([]);
    expect(report.skipped).toEqual({
      'pressable-role': 1,
      'pressable-label': 1,
      'target-size': 1,
    });
  });

  it('classifies every design component that renders a pressable', () => {
    // A new wrapper in src/design must be read and added to designPressables:
    // either it names itself, or the rule checks its call sites.
    expect(designPressableExports(join(__dirname, '../src'))).toEqual(
      Object.keys(designPressables).sort(),
    );
  });
});
