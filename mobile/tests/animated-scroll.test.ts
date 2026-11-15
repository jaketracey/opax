/**
 * A scroll or zoom the app starts itself (revealing a row, an index jump, a
 * tab re-tap, the photo double tap) lands in one step with Reduce Motion on.
 */
import { readFileSync, readdirSync } from 'node:fs';
import { join, relative } from 'node:path';
import { AccessibilityInfo } from 'react-native';
import { animatedScroll } from '../src/design/accessibility';

afterEach(() => jest.restoreAllMocks());

test('animatedScroll follows Reduce Motion, from outside render', async () => {
  let change!: (value: boolean) => void;
  jest.spyOn(AccessibilityInfo, 'addEventListener').mockImplementation(((
    name: string,
    listener: unknown,
  ) => {
    if (name === 'reduceMotionChanged')
      change = listener as (value: boolean) => void;
    return { remove: jest.fn() };
  }) as never);
  jest
    .spyOn(AccessibilityInfo, 'isReduceMotionEnabled')
    .mockResolvedValue(true);
  // The first call subscribes; the system has not answered yet.
  expect(animatedScroll()).toBe(true);
  await Promise.resolve();
  await Promise.resolve();
  expect(animatedScroll()).toBe(false);
  change(false);
  expect(animatedScroll()).toBe(true);
  change(true);
  expect(animatedScroll()).toBe(false);
  expect(AccessibilityInfo.isReduceMotionEnabled).toHaveBeenCalledTimes(1);
});

const root = join(__dirname, '..', 'src');
function sources(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) =>
    entry.isDirectory()
      ? sources(join(dir, entry.name))
      : /\.tsx?$/.test(entry.name)
        ? [join(dir, entry.name)]
        : [],
  );
}

test('no programmatic scroll animates unconditionally', () => {
  const unconditional = sources(root)
    .map((file) => relative(root, file))
    // The design workbench is not in a release build.
    .filter((path) => !path.startsWith('workbench'))
    .filter((path) =>
      /\banimated: true\b|scrollToTop\([^)]*,\s*true\)/.test(
        readFileSync(join(root, path), 'utf8'),
      ),
    );
  expect(unconditional).toEqual([]);
});
