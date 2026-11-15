/**
 * Android's Image fades each picture in over 300 ms by default, after the
 * row has already been laid out: portraits shimmered in as a list scrolled,
 * and Explore's pictures ran that fade under their own 150 ms reveal. Every
 * app image turns the platform fade off; an arrival that should ease does so
 * with its own, Reduce Motion aware fade (Picture's reveal).
 */
import { readFileSync, readdirSync } from 'node:fs';
import { join, relative } from 'node:path';

const root = join(__dirname, '..', 'src');
function sources(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) =>
    entry.isDirectory()
      ? sources(join(dir, entry.name))
      : entry.name.endsWith('.tsx')
        ? [join(dir, entry.name)]
        : [],
  );
}

test('every app image turns off the Android platform fade', () => {
  const missing: string[] = [];
  let images = 0;
  for (const file of sources(root)) {
    const path = relative(root, file);
    // The design workbench is not in a release build.
    if (path.startsWith('workbench')) continue;
    const code = readFileSync(file, 'utf8');
    for (const match of code.matchAll(
      /<(?:Image|Animated\.Image)\b(?![A-Za-z.])[^>]*?\/?>/gs,
    )) {
      images++;
      if (!/\bfadeDuration=\{0\}/.test(match[0])) missing.push(path);
    }
  }
  expect(images).toBeGreaterThanOrEqual(8);
  expect(missing).toEqual([]);
});
