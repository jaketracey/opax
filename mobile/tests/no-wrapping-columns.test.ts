import { readdirSync, readFileSync, statSync } from 'node:fs';
import { extname, join, relative } from 'node:path';

// Build 33 at AX5: the profile figure strip stacked by overriding its row's
// direction to a column and kept `flexWrap: 'wrap'`. Yoga lays the stretched
// children of a wrapping column out at max-content width, so their text
// measured at one width and drew in another: two figures blank, one clipped.
// A stacked override of a wrapping row must also say `flexWrap: 'nowrap'`.
const MOBILE = join(__dirname, '..');

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return files(path);
    return extname(path) === '.tsx' ? [path] : [];
  });
}
/** Flat StyleSheet entries: `name: { ... }` with no nested object. */
function entries(text: string) {
  const styles = new Map<string, string>();
  for (const m of text.matchAll(/^\s+(\w+): \{([^{}]*)\}/gm))
    styles.set(m[1]!, m[2]!);
  return styles;
}
const wraps = (body: string) => /flexWrap: 'wrap(-reverse)?'/.test(body);
const column = (body: string) =>
  /flexDirection: 'column(-reverse)?'/.test(body);
const setsWrap = (body: string) => /flexWrap:/.test(body);

function wrappingColumns(
  sources: readonly (readonly [file: string, text: string])[],
) {
  const found: string[] = [];
  for (const [file, text] of sources) {
    const styles = entries(text);
    for (const [name, body] of styles)
      if (wraps(body) && column(body)) found.push(`${file}: ${name}`);
    // [styles.base, cond ? styles.override : null], on one style prop.
    for (const m of text.matchAll(/\[\s*styles\.(\w+)\b([^\]]*)\]/g)) {
      const base = styles.get(m[1]!);
      if (!base || !wraps(base)) continue;
      for (const o of m[2]!.matchAll(/styles\.(\w+)\b/g)) {
        const override = styles.get(o[1]!);
        if (override && column(override) && !setsWrap(override))
          found.push(`${file}: ${m[1]} + ${o[1]}`);
      }
    }
  }
  return found;
}

const sources = () =>
  files(join(MOBILE, 'src')).map(
    (path) => [relative(MOBILE, path), readFileSync(path, 'utf8')] as const,
  );

test('no stacked layout keeps the wrap of the row it replaces', () => {
  expect(wrappingColumns(sources())).toEqual([]);
});

test('the check finds the build 33 strip and passes its fix', () => {
  const strip = (stacked: string) =>
    [
      'const styles = StyleSheet.create({',
      "  strip: { flexDirection: 'row', flexWrap: 'wrap' },",
      `  stripStacked: ${stacked},`,
      '});',
      '<View style={[styles.strip, stacked ? styles.stripStacked : null]} />',
    ].join('\n');
  expect(
    wrappingColumns([['Person.tsx', strip("{ flexDirection: 'column' }")]]),
  ).toEqual(['Person.tsx: strip + stripStacked']);
  expect(
    wrappingColumns([
      ['Person.tsx', strip("{ flexDirection: 'column', flexWrap: 'nowrap' }")],
    ]),
  ).toEqual([]);
  expect(
    wrappingColumns([
      [
        'A.tsx',
        "const s = {\n  grid: { flexDirection: 'column', flexWrap: 'wrap' },\n};",
      ],
    ]),
  ).toEqual(['A.tsx: grid']);
});
