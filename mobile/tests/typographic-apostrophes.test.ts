import {
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, relative } from 'node:path';
import ts from 'typescript';

// Party names as the source data spells them. They are matching keys and
// filter values (design/party.ts folds ’ to ' before it looks a name up), so
// they keep the straight apostrophe the registers and the API use.
const dataNames = new Set([
  "Katter's Australian Party",
  "katter's australian party",
  "pauline hanson's one nation",
]);

function straightApostrophes(root: string) {
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
        // A contraction or possessive ("didn't", "OPAX's", "ministers' ").
        // Comments and identifiers are not strings, so they are never read.
        if (
          (ts.isStringLiteralLike(node) ||
            ts.isTemplateLiteralToken(node) ||
            ts.isJsxText(node)) &&
          /[A-Za-z]'[A-Za-z]|s' /.test(node.text) &&
          !dataNames.has(node.text)
        ) {
          const line =
            file.getLineAndCharacterOfPosition(node.getStart(file)).line + 1;
          violations.push(`${relative(root, path)}:${line} ${node.text}`);
        }
        ts.forEachChild(node, visit);
      }
      visit(file);
    }
  }
  scan(root);
  return violations;
}

test('app copy uses typographic apostrophes in contractions and possessives', () => {
  expect(straightApostrophes(join(__dirname, '../src'))).toEqual([]);
});

test('the guard reads JSX text, attributes and template chunks, not comments or data names', () => {
  const root = mkdtempSync(join(tmpdir(), 'opax-apostrophes-'));
  try {
    mkdirSync(join(root, 'features'));
    writeFileSync(
      join(root, 'features/Fixture.tsx'),
      [
        "// OPAX didn't respond: a comment is not copy.",
        'const party = "Katter\'s Australian Party";',
        "const done = 'OPAX didn’t respond.';",
        'export const a = <Screen body="OPAX didn\'t respond." />;',
        "export const b = <Text>That's the record</Text>;",
        "export const c = (n: number) => `${n} of the ministers' diaries`;",
        'export const d = "the party\'s own return";',
      ].join('\n'),
    );
    expect(straightApostrophes(root)).toEqual([
      "features/Fixture.tsx:4 OPAX didn't respond.",
      "features/Fixture.tsx:5 That's the record",
      "features/Fixture.tsx:6  of the ministers' diaries",
      "features/Fixture.tsx:7 the party's own return",
    ]);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
