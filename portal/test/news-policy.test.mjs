import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';
const source = readFileSync(new URL('../src/index.ts', import.meta.url), 'utf8');
const parsed = ts.createSourceFile('index.ts', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
const names = new Set(['apiResource', 'docMeta']);
const statements = parsed.statements.filter(n => ts.isFunctionDeclaration(n) && names.has(n.name?.text));
const code = ts.transpileModule(statements.map(n=>n.getText(parsed)).join('\n'), {compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText;

test('removed news is unavailable even when an old resource remains cached', async () => {
  const context = { SITE_ORIGIN:'https://opax.com.au', json:(body,status)=>Response.json(body,{status}) };
  runInNewContext(code, context);
  const url = new URL('https://opax.com.au/api/resource/news-4396');
  const response = await context.apiResource(new Request(url), url, 'news-4396', {}, {});
  assert.equal(response.status,410);
  const page = await context.docMeta('news-4396',url,new Request(url),{},{});
  assert.equal(page.status,410);
});
