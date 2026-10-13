import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import ts from 'typescript';
import {renderBillAnswer} from '../src/seo-content.ts';
test('large bill answers preserve stages, model attribution and official source content',()=>{
  const summary='A source-backed fixture sentence. '.repeat(130)+'FINAL SUMMARY FACT';
  const bill={key:'au-federal-fixture',title:'Fixture Bill',status:'before_parliament',sponsor:'Fixture Sponsor',key_dates:[{stage:'introduced',date:'2026-10-01',house:'representatives',url:'https://www.aph.gov.au/fixture'}],summary:{sentences:Array(10).fill(summary)},sources:Array.from({length:500},(_,i)=>({kind:'bill',url:'https://www.aph.gov.au/source/'+i}))};
  const html=renderBillAnswer(bill,[],new Map()).html;
  assert.ok(Buffer.byteLength(html)>80000);assert.match(html,/FINAL SUMMARY FACT/);assert.match(html,/Recorded stages/);assert.match(html,/Machine-written/);assert.match(html,/source\/499/);assert.doesNotMatch(html,/page display limit/);
});
test('long published names and bill keys reach identity lookup; malformed route grammar still fails',()=>{
  const source=readFileSync(new URL('../src/index.ts',import.meta.url),'utf8'),ast=ts.createSourceFile('index.ts',source,ts.ScriptTarget.Latest,true);
  const code=ast.statements.find(n=>ts.isFunctionDeclaration(n)&&n.name?.text==='matchSeoRoute').getText(ast);
  const match=runInNewContext(ts.transpile(code)+';matchSeoRoute',{STATIC_PAGES:{},BILL_KEY_RE:/^[a-z][a-z0-9-]*$/,GRANT_RECIPIENT_ID_RE:/^abn:\d{11}$/,isDirectoryKind:d=>['person','party','donor','campaigner','supplier','agency'].includes(d)});
  for(const [kind,length] of [['person',121],['campaigner',201],['supplier',501]]) {
    const name='A'.repeat(length),route=match(new URL('https://opax.test/subject/'+kind+'/'+name));
    assert.equal(route.kind,'subject');assert.equal(route.name,name);
  }
  const key='au-federal-'+ 'a'.repeat(80);assert.equal(match(new URL('https://opax.test/bill/'+key)).key,key);
  assert.equal(match(new URL('https://opax.test/bill/invalid.key')),null);
  assert.equal(match(new URL('https://opax.test/subject/person/extra/segment')),null);
});
