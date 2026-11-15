/**
 * A list's separator, header, footer and empty components are compared by
 * type. An inline arrow is a new type on every render, so the list unmounts
 * and remounts each one it has drawn whenever its screen renders.
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

test('no list is given an inline component type', () => {
  const inline = sources(root)
    .map((file) => relative(root, file))
    .filter((path) =>
      /\b(?:ItemSeparator|SectionSeparator|CellRenderer)Component=\{\s*(?:\(|function\b)/.test(
        readFileSync(join(root, path), 'utf8'),
      ),
    );
  expect(inline).toEqual([]);
});
