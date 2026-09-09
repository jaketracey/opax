import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';
const source = readFileSync(new URL('../src/index.ts', import.meta.url), 'utf8');
const parsed = ts.createSourceFile('index.ts', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
const names = new Set(['DIRECTORY_KINDS','isDirectoryKind','STATIC_PAGES','SUBJECT_NAME_MAX','CAMPAIGNER_NAME_MAX','SUPPLIER_NAME_MAX','BILL_KEY_MAX','BILL_KEY_RE','matchSeoRoute','agenciesMemo','loadAgencies','agencyMeta','escHtml','clip','withTail','num','money','indexLinks','prerenderBlock','canonicalFor']);
const statements = parsed.statements.filter(n => ts.isFunctionDeclaration(n) ? names.has(n.name?.text) : ts.isVariableStatement(n) && n.declarationList.declarations.some(d => names.has(d.name.getText(parsed))));
const code = ts.transpileModule(statements.map(n=>n.getText(parsed)).join('\n'), {compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText;
const entry = {id:'a-0123456789abcdef0123',name:'Department <Works> & Transport',total:100,count:2,supplier_count:1};
function harness(loader = async () => ({agencies:[entry]})) {
  const context={ URL, SITE_ORIGIN:'https://opax.com.au', SITE_TITLE:'OPAX',SITE_DESCRIPTION:'Record', assetJson:loader };
  runInNewContext(code,context); return context;
}
test('agency aliases resolve to canonical stable IDs and escaped metadata', async () => {
  const c=harness();
  for (const name of [entry.name,entry.id]) {
    const url=new URL(`https://opax.com.au/subject/agency/${encodeURIComponent(name)}?map=1`);
    assert.equal(c.matchSeoRoute(url).dir,'agency');
    const meta=await c.agencyMeta(name,url,{});
    assert.equal(meta.status,200); assert.equal(meta.canonical,`https://opax.com.au/subject/agency/${entry.id}`);
    assert.match(meta.prerender,/&lt;Works&gt; &amp; Transport/);
    assert.equal(meta.jsonLd.mainEntity['@type'],'GovernmentOrganization');
  }
});
test('long agency source names are supported but malformed paths are rejected', () => {
  const c=harness();
  assert.ok(c.matchSeoRoute(new URL(`https://opax.com.au/subject/agency/${'a'.repeat(180)}`)));
  for (const suffix of ['%ZZ','name/extra','x'.repeat(501)]) assert.equal(c.matchSeoRoute(new URL(`https://opax.com.au/subject/agency/${suffix}`)),null);
});
test('unknown agencies are 404 and export failure is retryable 503', async () => {
  const url=new URL('https://opax.com.au/subject/agency/missing');
  assert.equal((await harness().agencyMeta('missing',url,{})).status,404);
  let fail=true; const c=harness(async()=>{if(fail) throw Error('offline'); return {agencies:[entry]};});
  assert.equal((await c.agencyMeta(entry.id,url,{})).status,503);
  fail=false; assert.equal((await c.agencyMeta(entry.id,url,{})).status,200);
});
