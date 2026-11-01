import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {mkdtempSync,readFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {JSDOM} from 'jsdom';
import {build} from 'esbuild';
import {interestTableData,interestTableConfig,registerTableHTML,hydrateRegisterTables} from '../public/register-tables.js';
import {toCSV} from '../public/datatable.js';

test('recorded PDF through scratch storage/export and JSON/SSR/hydration/CSV keeps complete isolated declarations and source pages', {timeout:90_000}, async()=>{
 const dir=mkdtempSync(join(tmpdir(),'opax-interests-boundaries-'));
 try{
  const fixture=join(dir,'register.json');
  const result=spawnSync('python3',['-m','unittest','discover','-s','tests','-p','test_interests_boundaries.py'],{
   cwd:new URL('../../',import.meta.url),encoding:'utf8',timeout:75_000,maxBuffer:2*1024*1024,
   env:{...process.env,PYTHONDONTWRITEBYTECODE:'1',OPAX_TEST_INTERESTS_EXPORT:fixture},
  });
  assert.ifError(result.error);assert.equal(result.status,0,result.stderr+result.stdout);
  assert.match(result.stderr,/Ran 8 tests/);assert.doesNotMatch(result.stderr,/skipped=/);
  const register=JSON.parse(readFileSync(fixture,'utf8'));
  const {rows}=interestTableData(register),media=rows.find(r=>r.item.startsWith('2 x tickets')),woodside=rows.find(r=>r.item.startsWith('Correction'));
  assert.equal(rows.length,3);assert.ok(media);assert.ok(woodside);
  assert.match(media.item,/Date provided: 14\/08\/26$/);assert.doesNotMatch(media.item,/Woodside|11\/08\/26/);
  assert.match(woodside.item,/This was on the 04\/07\/26$/);assert.match(woodside.item,/14\/07\/2026/);assert.doesNotMatch(woodside.item,/14\/08\/26|7 West/);
  for(const row of rows){assert.equal(row.entry_type,'Addition');assert.equal(row.holder_label,'Self');assert.equal(row.date,'2026-09-15');assert.equal(row.source,register.source_url+'#page=33');}
  const config=interestTableConfig(rows),csv=toCSV(rows,config),html=registerTableHTML(config);
  assert.ok(csv.includes(media.item));assert.ok(csv.includes(woodside.item));
  const compiled=await build({stdin:{contents:"export {interestRegisterResponse} from './src/interest-register';export {renderPersonAnswer} from './src/seo-content';",resolveDir:new URL('../',import.meta.url).pathname},bundle:true,write:false,platform:'node',format:'esm'});
  const api=await import('data:text/javascript;base64,'+Buffer.from(compiled.outputFiles[0].text).toString('base64'));
  const response=await api.interestRegisterResponse(new Request('https://fixture.test/api/register/interests?pid=10884'),{fetch:async()=>Response.json(register)});
  assert.equal(response.status,200);assert.deepEqual((await response.json()).rows,rows);
  const read=async path=>path==='/interests/10884.json'?register:path==='/interests/index.json'?{people:{'10884':{}},_by_name:{}}:null;
  const rendered=await api.renderPersonAnswer({name:'Madeleine King',pid:'10884',states:['wa'],chambers:['representatives']},read,new Map());
  const dom=new JSDOM(html,{url:'https://fixture.test/subject/person/madeleine-king'});
  const verify=document=>{
   assert.ok(document.body.textContent.includes(media.item));assert.ok(document.body.textContent.includes(woodside.item));
   assert.ok([...document.querySelectorAll('a')].filter(a=>a.href===register.source_url+'#page=33').length>=3);
  };
  verify(dom.window.document);
  const ssr=new JSDOM(rendered.html);try{verify(ssr.window.document);}finally{ssr.window.close();}
  const oldObserver=globalThis.MutationObserver;globalThis.MutationObserver=dom.window.MutationObserver;
  try{hydrateRegisterTables(dom.window.document);await new Promise(setImmediate);verify(dom.window.document);}
  finally{dom.window.document.body.replaceChildren();await new Promise(setImmediate);globalThis.MutationObserver=oldObserver;dom.window.close();}
 }finally{rmSync(dir,{recursive:true,force:true});}
});
