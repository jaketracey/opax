import test from 'node:test';
import assert from 'node:assert/strict';
import {tableDatabase} from './table-d1-harness.mjs';

test('exhaustive SQLite probes and real D1 execute the same generated schema and quoted rows',async()=>{
  const datasets={votes:[{row:{id:'fixture-1',name:"Fixture O'Clock\nRecord",ayes:1.25}},{row:{id:'fixture-2',name:'Other fixture',ayes:9}}]};
  const memory=await tableDatabase({datasets,memorySQL:true}),real=await tableDatabase({datasets});
  try{
    for(const sql of ['SELECT id,name,ayes FROM table_votes ORDER BY id','SELECT key,value FROM table_meta ORDER BY key','SELECT COUNT(*) AS n FROM table_private_identity']) {
      assert.deepEqual((await memory.db.prepare(sql).all()).results,(await real.db.prepare(sql).all()).results);
    }
    const sql='SELECT name FROM table_votes WHERE id=?';
    assert.equal(await memory.db.prepare(sql).bind('fixture-1').first('name'),await real.db.prepare(sql).bind('fixture-1').first('name'));
    assert.equal(await memory.db.prepare(sql).bind('missing').first(),await real.db.prepare(sql).bind('missing').first());
  }finally{await memory.close();await real.close();}
});
