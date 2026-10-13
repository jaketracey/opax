import test from 'node:test';
import assert from 'node:assert/strict';
import {existsSync} from 'node:fs';
import {mkdtemp,rm} from 'node:fs/promises';
import {tableDatabase} from './table-d1-harness.mjs';

async function withDatabases(options,check,create=tableDatabase){
  let memory,real;
  try{
    memory=await create({...options,memorySQL:true});
    real=await create(options);
    return await check(memory,real);
  }finally{
    const results=await Promise.allSettled([memory,real].filter(Boolean).map(fixture=>Promise.resolve().then(()=>fixture.close())));
    const errors=results.filter(result=>result.status==='rejected').map(result=>result.reason);
    if(errors.length)throw new AggregateError(errors,'Table parity fixture cleanup failed');
  }
}

test('exhaustive SQLite probes and real D1 execute the same generated schema and quoted rows',async()=>{
  const datasets={votes:[{row:{id:'fixture-1',name:"Fixture O'Clock\nRecord",ayes:1.25}},{row:{id:'fixture-2',name:'Other fixture',ayes:9}}]};
  await withDatabases({datasets},async(memory,real)=>{
    for(const sql of ['SELECT id,name,ayes FROM table_votes ORDER BY id','SELECT key,value FROM table_meta ORDER BY key','SELECT COUNT(*) AS n FROM table_private_identity']) {
      assert.deepEqual((await memory.db.prepare(sql).all()).results,(await real.db.prepare(sql).all()).results);
    }
    const sql='SELECT name FROM table_votes WHERE id=?';
    assert.equal(await memory.db.prepare(sql).bind('fixture-1').first('name'),await real.db.prepare(sql).bind('fixture-1').first('name'));
    assert.equal(await memory.db.prepare(sql).bind('missing').first(),await real.db.prepare(sql).bind('missing').first());
  });
});

function injected(t,overrides={}){
  const directories=[];
  t.after(async()=>{for(const root of directories)await rm(root,{recursive:true,force:true});});
  return {directories,dependencies:{
    makeDirectory:async prefix=>{const root=await mkdtemp(prefix);directories.push(root);return root;},
    buildSQL:async()=>({files:[]}),...overrides
  }};
}
for(const memorySQL of [true,false])test(`fixture cleanup removes its directory if ${memorySQL?'SQLite':'D1'} initialisation throws`,async t=>{
  const failure=new Error('injected construction failure');
  const {directories,dependencies}=injected(t,{[memorySQL?'makeMemory':'makeMiniflare']:()=>{throw failure;}});
  await assert.rejects(tableDatabase({memorySQL},dependencies),error=>error.cause===failure);
  assert.equal(directories.length,1);assert.ok(!existsSync(directories[0]));
});
test('fixture cleanup disposes its runtime when schema preparation fails',async t=>{
  let disposed=0;const failure=new Error('injected schema failure');
  const {directories,dependencies}=injected(t,{makeMemory:()=>({db:{},dispose:async()=>disposed++}),buildSQL:async()=>{throw failure;}});
  await assert.rejects(tableDatabase({memorySQL:true},dependencies),error=>error.cause===failure);
  assert.equal(disposed,1);assert.ok(!existsSync(directories[0]));
});
test('fixture cleanup removes its directory when both D1 preparation and disposal throw',async t=>{
  const preparation=new Error('injected database failure'),disposal=new Error('injected disposal failure');let disposed=0;
  const {directories,dependencies}=injected(t,{makeMiniflare:()=>({getD1Database:async()=>{throw preparation;},dispose:async()=>{disposed++;throw disposal;}})});
  await assert.rejects(tableDatabase({},dependencies),error=>error instanceof AggregateError&&error.errors[0]===preparation&&error.errors[1]===disposal);
  assert.equal(disposed,1);assert.ok(!existsSync(directories[0]));
});
test('fixture cleanup removes its directory after successful preparation even when disposal throws',async t=>{
  const failure=new Error('injected close failure');let disposed=0;
  const {directories,dependencies}=injected(t,{makeMemory:()=>({db:{},dispose:async()=>{disposed++;throw failure;}})});
  const fixture=await tableDatabase({memorySQL:true},dependencies);
  await assert.rejects(fixture.close(),error=>error===failure);assert.ok(!existsSync(directories[0]));assert.equal(disposed,1);
  await fixture.close();assert.equal(disposed,1);
});
test('parity fixture cleanup closes the first database when the second initialisation fails',async()=>{
  const failure=new Error('injected second fixture failure');let closed=0,calls=0;
  await assert.rejects(withDatabases({},()=>assert.fail('check must not run'),async options=>{
    calls++;if(!options.memorySQL)throw failure;return {close:async()=>closed++};
  }),error=>error===failure);
  assert.equal(calls,2);assert.equal(closed,1);
});
test('parity fixture cleanup attempts both databases even when one disposal throws',async()=>{
  const failure=new Error('injected first close failure'),closed=[];
  await assert.rejects(withDatabases({},()=>{},async options=>({close:async()=>{
    closed.push(options.memorySQL?'memory':'real');if(options.memorySQL)throw failure;
  }})),error=>error instanceof AggregateError&&error.errors[0]===failure);
  assert.deepEqual(closed.sort(),['memory','real']);
});
