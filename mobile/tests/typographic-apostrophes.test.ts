import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import ts from 'typescript';

test('app contractions and bill text error subjects use typographic apostrophes', () => {
  const root = join(__dirname, '../src');
  const violations: string[] = [];
  function scan(directory: string) {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const path = join(directory, entry.name);
      if (entry.isDirectory()) {
        scan(path);
        continue;
      }
      if (!/\.[jt]sx?$/.test(path)) continue;
      const file = ts.createSourceFile(
        path,
        readFileSync(path, 'utf8'),
        ts.ScriptTarget.Latest,
        true,
      );
      function visit(node: ts.Node) {
        if (
          (ts.isStringLiteralLike(node) ||
            ts.isTemplateLiteralToken(node) ||
            ts.isJsxText(node)) &&
          /\b(?:couldn|isn|can)'t\b|\bbill's text\b/i.test(node.text)
        ) {
          const line =
            file.getLineAndCharacterOfPosition(node.getStart(file)).line + 1;
          violations.push(`${relative(root, path)}:${line}`);
        }
        ts.forEachChild(node, visit);
      }
      visit(file);
    }
  }
  scan(root);
  expect(violations).toEqual([]);
});
