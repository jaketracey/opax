import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {DatabaseSync} from 'node:sqlite';
import {runIndexNow,indexNowPayloads,changedUrls,INDEXNOW_KEY} from '../src/indexnow.ts';

function harness(entries) {
  const sqlite = new DatabaseSync(':memory:');
  sqlite.exec(readFileSync(new URL('../migrations/0013_indexnow.sql',import.meta.url),'utf8'));
  const db={prepare(sql){
    const statement=sqlite.prepare(sql);let values=[];
    return {bind(...args){values=args;return this;},async first(){return statement.get(...values) || null;},async run(){return {meta:{changes:Number(statement.run(...values).changes)}};}};
  },async batch(statements){sqlite.exec('BEGIN');try{const values=[];for(const s of statements)values.push(await s.run());sqlite.exec('COMMIT');return values;}catch(e){sqlite.exec('ROLLBACK');throw e;}}};
  const env={CACHE_EPOCH:'epoch-1',INDEXNOW_ENABLED:'true',INDEXNOW_DRY_RUN:'false',COMMUNITY_DB:db,ASSETS:{async fetch(){return Response.json({entries});}}};
  const calls=[];
  const send=async(url,opts)=>{calls.push({url,opts,body:JSON.parse(opts.body)});return new Response(null,{status:202});};
  return {sqlite,env,send,calls,job:()=>sqlite.prepare('SELECT * FROM indexnow_jobs WHERE epoch = ?').get(env.CACHE_EPOCH)};
}
const entries=n=>Array.from({length:n},(_,i)=>[`/bill/au-federal-r${i}`,'fingerprint-'+i]);

test('IndexNow payloads deduplicate, validate canonical host and batch below protocol limits',()=>{
  const urls=entries(10_001).map(([p])=>'https://opax.com.au'+p);
  urls.push(urls[0],'https://evil.test/bill/au-federal-r1','https://opax.com.au/ask?q=x','https://opax.com.au/subject/person/null');
  const payloads=indexNowPayloads(urls,10_000);
  assert.deepEqual(payloads.map(p=>p.urlList.length),[10_000,1]);
  assert.equal(payloads[0].host,'opax.com.au');assert.equal(payloads[0].key,INDEXNOW_KEY);assert.equal(payloads[0].keyLocation,`https://opax.com.au/${INDEXNOW_KEY}.txt`);
  assert.throws(()=>indexNowPayloads(urls,10_001));
  assert.deepEqual(changedUrls([['/subject/person/jane','new'],['/doc/division-federal-senate-1','new'],['/bill/au-federal-r1','same']],[['/subject/person/jane','old'],['/bill/au-federal-r1','same']]),['https://opax.com.au/doc/division-federal-senate-1','https://opax.com.au/subject/person/jane']);
});

test('cron batches resume across ticks and completed epochs are idempotent',async()=>{
  const h=harness(entries(2501));
  await runIndexNow(h.env,1000,h.send);
  assert.equal(h.calls.length,2);assert.equal(h.job().cursor,2000);assert.equal(h.job().complete,0);
  assert.equal(h.calls[0].url,'https://api.indexnow.org/indexnow');assert.equal(h.calls[0].opts.method,'POST');assert.ok(h.calls[0].opts.signal);
  await runIndexNow(h.env,301000,h.send);assert.equal(h.calls.length,3);assert.equal(h.job().complete,1);
  await runIndexNow(h.env,601000,h.send);assert.equal(h.calls.length,3);
  assert.equal(new Set(h.calls.flatMap(c=>c.body.urlList)).size,2501);
  h.env.CACHE_EPOCH='epoch-2';await runIndexNow(h.env,901000,h.send);
  assert.equal(h.calls.length,3,'unchanged snapshot produces no pings');assert.equal(h.job().complete,1);
});

test('failed batch logs and resumes without re-sending the accepted batch',async()=>{
  const h=harness(entries(2001));let calls=0;
  await runIndexNow(h.env,1000,async(...args)=>{if(++calls===2)return new Response(null,{status:429});return h.send(...args);});
  assert.equal(h.job().cursor,1000);assert.equal(h.job().complete,0);assert.equal(h.job().lease_until,0);
  await runIndexNow(h.env,301000,h.send);assert.equal(h.job().complete,1);
  assert.equal(new Set(h.calls.flatMap(c=>c.body.urlList)).size,2001);
});

test('a new epoch submits new bills, changed divisions and updated people, excluding unchanged pages',async()=>{
  const rows=[['/subject/person/jane-smith','old'],['/bill/au-federal-r1','same'],['/doc/division-federal-senate-1','old']];
  const h=harness(rows);await runIndexNow(h.env,1000,h.send);
  rows[0][1]='updated-votes-and-interests';rows[2][1]='updated-tally';rows.push(['/bill/au-federal-r2','new']);
  await runIndexNow(h.env,301000,h.send);assert.equal(h.calls.length,1,'same epoch is already complete');
  h.env.CACHE_EPOCH='epoch-2';await runIndexNow(h.env,601000,h.send);
  assert.deepEqual(h.calls[1].body.urlList,['https://opax.com.au/bill/au-federal-r2','https://opax.com.au/doc/division-federal-senate-1','https://opax.com.au/subject/person/jane-smith']);
  assert.equal(h.sqlite.prepare('SELECT count(*) AS n FROM indexnow_snapshots').get().n,1,'only the current baseline is retained');
});

test('network and missing migration failures never escape the cron',async()=>{
  const h=harness(entries(1));await assert.doesNotReject(runIndexNow(h.env,1000,async()=>{throw new Error('network unavailable');}));
  assert.equal(h.job().cursor,0);h.sqlite.exec('DROP TABLE indexnow_jobs');await assert.doesNotReject(runIndexNow(h.env,301000,h.send));assert.equal(h.calls.length,0);
});

test('disable, staging and dry-run prevent outbound pings and dry-run keeps the baseline intact',async()=>{
  for (const patch of [{INDEXNOW_ENABLED:'false'},{INDEXNOW_ENABLED:undefined},{STAGING_API:{}},{INDEXNOW_DRY_RUN:'true'}]) {
    const h=harness(entries(2));Object.assign(h.env,patch);await runIndexNow(h.env,1000,h.send);assert.equal(h.calls.length,0);assert.equal(h.job(),undefined);
  }
});

test('a held D1 lease prevents concurrent cron sends',async()=>{
  const h=harness(entries(1));
  let release;const wait=new Promise(r=>{release=r;});let entered;const ready=new Promise(r=>{entered=r;});
  const first=runIndexNow(h.env,1000,async(...args)=>{entered();await wait;return h.send(...args);});
  await ready;await runIndexNow(h.env,1000,h.send);assert.equal(h.calls.length,0);release();await first;assert.equal(h.calls.length,1);
});
