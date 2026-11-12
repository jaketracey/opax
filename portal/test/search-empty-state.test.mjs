import test from 'node:test';
import assert from 'node:assert/strict';
import { Worker } from 'node:worker_threads';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';

function execute(path,probe='search-empty',suggestions){
 return new Promise((resolve,reject)=>{
  const worker=new Worker(new URL('./helpers/header-search-shell.mjs',import.meta.url),{workerData:{path,probe,suggestions},execArgv:['--experimental-vm-modules']});
  worker.once('message',message=>message.error?reject(Error(message.error)):resolve(message.result));
  worker.once('error',reject);
  worker.once('exit',code=>{if(code)reject(Error('Shell exited '+code))});
 });
}
for(const supplied of [undefined,[{kind:'did_you_mean',label:'Morgan Example',href:'/subject/person/morgan-example'}]])test('empty search focuses named suggestions and opens a draft before explicit Ask submission: '+Boolean(supplied),async()=>{
 const result=await execute('/ask?view=search&q=Morgn+Example','search-empty',supplied);
 assert.equal(result.focus,'search-suggestions-heading');
 assert.ok(result.links.every(l=>l.label.trim()&&l.href));
 assert.deepEqual(result.before,[]);
 assert.equal(result.draft.query,'Morgn Example');
 assert.equal(result.draft.path,'/ask');
 assert.ok(result.draft.search.includes('draft=1'));
 assert.deepEqual(result.draft.requests,[]);
 assert.equal(result.draft.hidden,true);
 assert.equal(result.after.length,1,'only the explicit form submission starts the stubbed Ask request');
 assert.equal(result.event.properties.had_suggestion,true);
 assert.equal(result.event.properties.suggestion_kind,supplied?'did_you_mean':'scope');
 assert.ok(!JSON.stringify(result.event).includes('Morgn'));
 for(const scope of ['People','Bills','Speeches','Money'])assert.ok(result.links.some(l=>l.label===scope));
});
test('direct loading of an Ask draft never submits it',async()=>{
 const result=await execute('/ask?q=Morgn+Example&draft=1','ask-draft');
 assert.equal(result.query,'Morgn Example');assert.equal(result.hidden,true);assert.deepEqual(result.requests,[]);
});
test('nonempty searches report none, and suggestion kinds contain no reader text',()=>{
 const source=readFileSync(new URL('../public/app.js',import.meta.url),'utf8');
 const parsed=ts.createSourceFile('app.js',source,ts.ScriptTarget.Latest,true);
 const fn=parsed.statements.find(n=>ts.isFunctionDeclaration(n)&&n.name?.text==='searchSuggestionProperties').getText(parsed);
 const props=runInNewContext(fn+';searchSuggestionProperties');
 assert.deepEqual({...props([])},{had_suggestion:false,suggestion_kind:'none'});
 assert.deepEqual({...props([{kind:'ask',label:'reader words'}])},{had_suggestion:true,suggestion_kind:'ask'});
});
