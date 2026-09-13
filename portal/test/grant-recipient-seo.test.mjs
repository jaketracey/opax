import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import ts from 'typescript';
const source=readFileSync(new URL('../src/index.ts',import.meta.url),'utf8');
const parsed=ts.createSourceFile('index.ts',source,ts.ScriptTarget.Latest,true,ts.ScriptKind.TS);
const names=new Set(['DIRECTORY_KINDS','isDirectoryKind','STATIC_PAGES','SUBJECT_NAME_MAX','CAMPAIGNER_NAME_MAX','SUPPLIER_NAME_MAX','BILL_KEY_MAX','BILL_KEY_RE','GRANT_RECIPIENT_ID_RE','matchSeoRoute','grantRecipientsMemo','loadGrantRecipients','grantRecipientMeta','buildMeta','escHtml','clip','withTail','num','money','indexLinks','prerenderBlock','canonicalFor']);
const statements=parsed.statements.filter(n=>ts.isFunctionDeclaration(n)?names.has(n.name?.text):ts.isVariableStatement(n)&&n.declarationList.declarations.some(d=>names.has(d.name.getText(parsed))));
const code=ts.transpileModule(statements.map(n=>n.getText(parsed)).join('\n'),{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText;
const recipient={id:'abn:64062160614',n:'Serendipity <WA> & Co',t:100,c:2,sh:14};
function harness(loader=async()=>({recipients:[recipient]})){
 const context={URL,SITE_ORIGIN:'https://opax.com.au',SITE_TITLE:'OPAX',SITE_DESCRIPTION:'Record',assetJson:loader};runInNewContext(code,context);return context;
}
async function meta(c,path){const url=new URL('https://opax.com.au'+path);const route=c.matchSeoRoute(url);assert.ok(route);return c.buildMeta(route,url,{}, {}, {});}
test('standalone recipient routes serve canonical share metadata on direct navigation',async()=>{
 const c=harness();
 const path='/money/grants/federal/recipient/abn%3A64062160614';
 for(const suffix of ['', '/?tracking=1']){
  const result=await meta(c,path+suffix);assert.equal(result.status,200);assert.equal(result.canonical,'https://opax.com.au'+path);assert.match(result.title,/Serendipity/);assert.match(result.prerender,/&lt;WA&gt; &amp; Co/);assert.match(result.prerender,/do not establish payments received/);assert.equal(result.jsonLd.mainEntity.identifier.value,'64062160614');
 }
 const qld=await meta(c,path.replace('/federal/','/qld/'));assert.match(qld.description,/Queensland expenditure/);assert.match(qld.prerender,/rows are not distinct grants/);
});
test('legacy recipient citations remain readable and identify the standalone canonical page',async()=>{
 const result=await meta(harness(),'/money/grants?jur=federal&open=abn%3A64062160614');assert.equal(result.status,200);assert.equal(result.canonical,'https://opax.com.au/money/grants/federal/recipient/abn%3A64062160614');
});
test('recipient route rejects malformed IDs and distinguishes unknown records from unavailable assets',async()=>{
 const c=harness();
 for(const path of ['/money/grants/nsw/recipient/abn%3A64062160614','/money/grants/federal/recipient/%ZZ','/money/grants/federal/recipient/name%3Ax%2Fy','/money/grants/federal/recipient/abn%3A123','/money/grants/federal/recipient/abn%3A64062160614/extra'])assert.equal(c.matchSeoRoute(new URL('https://opax.com.au'+path)),null,path);
 assert.equal((await meta(c,'/money/grants/federal/recipient/abn%3A00000000000')).status,404);
 let unavailable=true;const retry=harness(async()=>{if(unavailable)throw Error('offline');return {recipients:[recipient]}});
 const path='/money/grants/federal/recipient/abn%3A64062160614';assert.equal((await meta(retry,path)).status,503);unavailable=false;assert.equal((await meta(retry,path)).status,200);
 assert.equal((await meta(harness(async()=>({recipients:[{...recipient,t:'unknown'}]})),path)).status,503);
});
test('published Serendipity recipient is directly indexable with the real grant index',async()=>{
 const c=harness(async(_env,path)=>JSON.parse(readFileSync(new URL('../public'+path,import.meta.url),'utf8')));
 const result=await meta(c,'/money/grants/federal/recipient/abn%3A64062160614');assert.equal(result.status,200);assert.match(result.title,/Serendipity/i);
});
