/**
 * LayoutAnimation is inert on iOS under Reanimated 4.5, so new code uses
 * HeightReveal; qa-static refuses a LayoutAnimation outside the listed files.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { boundaryFiles } from '../scripts/boundary-files';
import {
  layoutAnimationAllowed,
  layoutAnimationIssues,
  usesLayoutAnimation,
} from '../scripts/layout-animation-policy';

test('an import or a call counts; a comment naming it does not', () => {
  expect(
    usesLayoutAnimation(
      "import { LayoutAnimation, View } from 'react-native';",
    ),
  ).toBe(true);
  expect(usesLayoutAnimation('RN.LayoutAnimation.configureNext(preset);')).toBe(
    true,
  );
  expect(
    usesLayoutAnimation(
      '// not LayoutAnimation: it is inert\n/* LayoutAnimation.configureNext */\nconst url = "https://example.org"; // LayoutAnimation',
    ),
  ).toBe(false);
});

test('an unlisted user is refused, and a listed file that stopped using it is reported', () => {
  const files = [
    {
      path: 'src/features/Fixture.tsx',
      content: 'LayoutAnimation.configureNext(x);',
    },
    {
      path: 'src/features/Kept.tsx',
      content: 'LayoutAnimation.easeInEaseOut();',
    },
    { path: 'src/features/Gone.tsx', content: '// LayoutAnimation went' },
  ];
  expect(
    layoutAnimationIssues(files, 'src', {
      'features/Kept.tsx': 'fixture reason',
      'features/Gone.tsx': 'fixture reason',
    }),
  ).toEqual([
    'features/Fixture.tsx: LayoutAnimation is inert on iOS; use HeightReveal',
    'features/Gone.tsx: listed but no longer uses LayoutAnimation',
  ]);
});

test('the app uses LayoutAnimation only where listed, each with a reason', () => {
  const root = join(__dirname, '..', 'src');
  const files = boundaryFiles(root, join(__dirname, '..', 'modules'))
    .javascript.filter((path) => path.startsWith(root))
    .map((path) => ({ path, content: readFileSync(path, 'utf8') }));
  expect(files.length).toBeGreaterThan(100);
  expect(layoutAnimationIssues(files, root)).toEqual([]);
  for (const reason of Object.values(layoutAnimationAllowed))
    expect(reason.length).toBeGreaterThan(20);
});
