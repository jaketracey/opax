import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import ts from 'typescript';
const source=readFileSync(new URL('../public/app.js',import.meta.url),'utf8');
const parsed=ts.createSourceFile('app.js',source,ts.ScriptTarget.Latest,true);
const code=parsed.statements.find(n=>ts.isFunctionDeclaration(n)&&n.name?.text==='syncPathMeta').getText(parsed)+';syncPathMeta();';
function hydrate(path,bootRoute,bootUrl,counts=new Map()) {
  const values=new Map();const document={title:'Server title',querySelector(selector){return {setAttribute(name,value){values.set(selector+':'+name,value);}};}};
  runInNewContext(code,{hereRoute:()=>path,SITE_ORIGIN:'https://opax.com.au',URL,URLSearchParams,BOOT_META:{route:bootRoute,url:bootUrl,title:'Server title',description:'Server description'},directoryPageCounts:counts,VIEW_DESCRIPTIONS:{},document});
  return values;
}
test('hydration preserves the server-normalised initial directory canonical',()=>{
  for(const [path,page] of [['/bills',60],['/subject/person',35],['/subject/supplier',433]]) {
    const original=path+'?page=999999',canonical='https://opax.com.au'+path+'?page='+page;
    const values=hydrate(original,original,canonical);
    assert.equal(values.get('link[rel="canonical"]:href'),canonical);
    assert.equal(values.get('meta[property="og:url"]:content'),canonical);
  }
});
test('directory updates clamp pagination and keep canonical and Open Graph in sync',()=>{
  const counts=new Map([['/bills',60]]);
  for(const [query,wanted] of [['?page=999999&status=passed','?page=60'],['?page=2','?page=2'],['?page=0',''],['?page=1',''],['?page=1.5',''],['?page=abc',''],['?q=housing','']]) {
    const values=hydrate('/bills'+query,'/bills','https://opax.com.au/bills',counts);
    assert.equal(values.get('link[rel="canonical"]:href'),'https://opax.com.au/bills'+wanted);
    assert.equal(values.get('meta[property="og:url"]:content'),'https://opax.com.au/bills'+wanted);
  }
  const directory=parsed.statements.find(n=>ts.isFunctionDeclaration(n)&&n.name?.text==='renderDirectory').getText(parsed);
  assert.match(directory,/replaceRoute\(directoryHash\(spec.kind, hashState\)\);\s*syncPathMeta\(\)/);
});
