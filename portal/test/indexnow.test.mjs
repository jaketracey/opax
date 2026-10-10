import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {DatabaseSync} from 'node:sqlite';
import {runIndexNow as run,indexNowPayloads,changedUrls,extraUrls,donorPath,INDEXNOW_KEY,INDEXNOW_JOB_RETENTION} from '../src/indexnow.ts';

const runIndexNow = (env, now, send) => run(env, now, send, () => now);
const DAY = 86_400_000, HOUR = 3_600_000;
function harness(entries) {
  const sqlite = new DatabaseSync(':memory:');
  for (const migration of ['0013_indexnow.sql','0014_indexnow_backoff.sql','0015_indexnow_epoch_fence.sql']) sqlite.exec(readFileSync(new URL('../migrations/'+migration,import.meta.url),'utf8'));
  const db={prepare(sql){
    const statement=sqlite.prepare(sql);let values=[];
    return {bind(...args){values=args;return this;},async first(){return statement.get(...values) || null;},async all(){return {results:statement.all(...values)};},async run(){return {meta:{changes:Number(statement.run(...values).changes)}};}};
  },async batch(statements){sqlite.exec('BEGIN');try{const values=[];for(const s of statements)values.push(await s.run());sqlite.exec('COMMIT');return values;}catch(e){sqlite.exec('ROLLBACK');throw e;}}};
  const env={CACHE_EPOCH:'epoch-1',INDEXNOW_ENABLED:'true',INDEXNOW_DRY_RUN:'false',COMMUNITY_DB:db,ASSETS:{async fetch(){return Response.json({entries});}}};
  // Each fixture deployment carries a stable, authoritative revision. Cloned
  // stale environments retain their original revision; timestamps never assign one.
  const versions=new Map([['epoch-1','1']]);let epoch='epoch-1';
  env.INDEXNOW_EPOCH_VERSION='1';
  Object.defineProperty(env,'CACHE_EPOCH',{enumerable:true,get:()=>epoch,set:value=>{
    epoch=value;if(!versions.has(value))versions.set(value,String(versions.size+1));
    env.INDEXNOW_EPOCH_VERSION=versions.get(value);
  }});
  const calls=[];
  const send=async(url,opts)=>{calls.push({url,opts,body:JSON.parse(opts.body)});return new Response(null,{status:202});};
  return {sqlite,env,send,calls,job:()=>sqlite.prepare('SELECT * FROM indexnow_jobs WHERE epoch = ?').get(env.CACHE_EPOCH),daily:now=>sqlite.prepare('SELECT * FROM indexnow_daily WHERE day = ?').get(new Date(now).toISOString().slice(0,10))};
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
  assert.equal(h.calls.length,2);assert.equal(h.job().cursor,1000);assert.equal(h.job().complete,0);
  assert.equal(h.calls[0].url,'https://api.indexnow.org/indexnow');assert.equal(h.calls[0].opts.method,'POST');assert.ok(h.calls[0].opts.signal);
  await runIndexNow(h.env,301000,h.send);assert.equal(h.calls.length,4);assert.equal(h.job().complete,0);
  await runIndexNow(h.env,DAY+1000,h.send);assert.equal(h.calls.length,6);assert.equal(h.job().complete,1);
  await runIndexNow(h.env,DAY+301000,h.send);assert.equal(h.calls.length,6);
  assert.equal(new Set(h.calls.flatMap(c=>c.body.urlList)).size,2501);
  h.env.CACHE_EPOCH='epoch-2';await runIndexNow(h.env,DAY+601000,h.send);
  assert.equal(h.calls.length,6,'unchanged snapshot produces no pings');assert.equal(h.job().complete,1);
});

test('429 without Retry-After waits one hour and does not repeat the accepted prefix',async()=>{
  const h=harness(entries(1501));let attempts=0;
  await runIndexNow(h.env,1000,async(...args)=>{if(++attempts===2)return new Response(null,{status:429});return h.send(...args);});
  assert.equal(h.job().cursor,500);assert.equal(h.job().next_attempt_at,HOUR+1000);assert.equal(h.job().failure_count,1);
  assert.equal(h.job().lease_until,0);assert.equal(h.daily(1000).urls_sent,1000);
  await runIndexNow(h.env,301000,h.send);assert.equal(h.calls.length,1,'backoff prevents requests');
  await runIndexNow(h.env,HOUR+1000,h.send);assert.equal(h.job().cursor,1500);assert.equal(h.job().failure_count,0);
  await runIndexNow(h.env,DAY+1000,h.send);assert.equal(h.job().complete,1);
  assert.equal(new Set(h.calls.flatMap(c=>c.body.urlList)).size,1501);
});

test('a new epoch submits new bills, changed divisions and updated people, excluding unchanged pages',async()=>{
  const rows=[['/subject/person/jane-smith','old'],['/bill/au-federal-r1','same'],['/doc/division-federal-senate-1','old']];
  const h=harness(rows);await runIndexNow(h.env,1000,h.send);
  rows[0][1]='updated-votes-and-interests';rows[2][1]='updated-tally';rows.push(['/bill/au-federal-r2','new']);
  await runIndexNow(h.env,301000,h.send);assert.equal(h.calls.length,1,'same epoch is already complete');
  h.env.CACHE_EPOCH='epoch-2';await runIndexNow(h.env,601000,h.send);
  assert.deepEqual(h.calls[1].body.urlList,['https://opax.com.au/subject/person/jane-smith','https://opax.com.au/doc/division-federal-senate-1','https://opax.com.au/bill/au-federal-r2']);
  assert.equal(h.sqlite.prepare('SELECT count(*) AS n FROM indexnow_snapshots').get().n,1,'only the current baseline is retained');
});

test('one-off donor paths from the private secret join the next epoch only, and nothing else does',async()=>{
  assert.deepEqual(extraUrls(' /subject/donor/fixture-donor-a\nhttps://opax.com.au/subject/donor/fixture-donor-b /subject/person/x /subject/donor/a/b https://evil.test/subject/donor/X /subject/donor/fixture-donor-a '),
    ['https://opax.com.au/subject/donor/fixture-donor-a','https://opax.com.au/subject/donor/fixture-donor-b']);
  assert.deepEqual(extraUrls(undefined),[]);
  assert.deepEqual(indexNowPayloads(['https://opax.com.au/subject/donor/fixture-donor-a','https://opax.com.au/subject/donor/x?y=1'])[0].urlList,['https://opax.com.au/subject/donor/fixture-donor-a']);
  const rows=[['/bill/au-federal-r1','same']];
  const h=harness(rows);await runIndexNow(h.env,1000,h.send);
  h.env.INDEXNOW_EXTRA_PATHS='/subject/donor/fixture-donor-a /subject/donor/fixture-donor-b';
  await runIndexNow(h.env,301000,h.send);assert.equal(h.calls.length,1,'a completed epoch never re-plans');
  h.env.CACHE_EPOCH='epoch-2';await runIndexNow(h.env,601000,h.send);
  assert.deepEqual(h.calls[1].body.urlList,['https://opax.com.au/subject/donor/fixture-donor-a','https://opax.com.au/subject/donor/fixture-donor-b']);
  assert.ok(!JSON.stringify(h.sqlite.prepare('SELECT entries FROM indexnow_snapshots').all()).includes('/subject/donor/'),'extras never enter the baseline snapshot');
});

test('a one-off donor path is one decoded segment under /subject/donor/, normalised before it is checked',()=>{
  const reject={
    'malformed escapes':['/subject/donor/%E0%A4%A','/subject/donor/%zz','/subject/donor/%','/subject/donor/Jane%2'],
    'dot segments':['/subject/donor/.','/subject/donor/..','/subject/donor/%2E%2E','/subject/donor/%2e','/subject/donor/../person/jane','/subject/donor/./jane'],
    'backslashes':['/subject/donor/Jane\\Citizen','/subject/donor\\Jane','/subject/donor/%5CJane','/subject/donor/..%5C..%5Cperson'],
    'double slashes':['/subject/donor//Jane','//subject/donor/Jane','https://opax.com.au//subject/donor/Jane','/subject//donor/Jane'],
    'decoding outside one segment':['/subject/donor/Jane%2FCitizen','/subject/donor/a/b','/subject/donor/%2F..%2Fperson%2Fjane','/subject/donor/Jane%3Fq%3D1','/subject/donor/Jane%23x','/subject/donor/Jane?x=1','/subject/donor/Jane#x',
      '/subject/donor/%252F','/subject/donor/Jane%00','/subject/donor/%20','/subject/donor/','/subject/person/jane','https://evil.test/subject/donor/Jane','/Subject/donor/Jane'],
  };
  for(const [why,paths] of Object.entries(reject))for(const path of paths)assert.equal(donorPath(path),null,`${why}: ${path}`);
  // Normalised: the sitemap's encoding of the decoded name.
  assert.equal(donorPath('/subject/donor/fixture-donor-a'),'/subject/donor/fixture-donor-a');
  assert.equal(donorPath('https://opax.com.au/subject/donor/fixture%2cdonor'),'/subject/donor/fixture%2Cdonor');
  assert.equal(donorPath("/subject/donor/O'Example%20%26%20Co"),"/subject/donor/O'Example%20%26%20Co");
  assert.deepEqual(extraUrls('/subject/donor/fixture%2cdonor /subject/donor/../person/x /subject/donor/%E0%A4%A'),['https://opax.com.au/subject/donor/fixture%2Cdonor']);
  // The payload takes a donor URL only exactly as its canonical form, and any URL only as the parser would leave it.
  assert.deepEqual(indexNowPayloads(['https://opax.com.au/subject/donor/fixture%2cdonor','https://opax.com.au/subject/donor/fixture%2Cdonor','https://opax.com.au/bill/../subject/person/jane','https://opax.com.au/subject/donor/../person/jane'])[0].urlList,
    ['https://opax.com.au/subject/donor/fixture%2Cdonor']);
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

test('429 honours Retry-After delta-seconds and HTTP dates, including dates beyond 24 hours',async()=>{
  for (const [header,next] of [['7200',1000+2*HOUR],[new Date(3*DAY).toUTCString(),3*DAY]]) {
    const h=harness(entries(1));let attempts=0;
    const reject=async()=>{attempts++;return new Response(null,{status:429,headers:{'Retry-After':header}});};
    await runIndexNow(h.env,1000,reject);
    assert.equal(h.job().next_attempt_at,next);assert.equal(h.job().cursor,0);
    await runIndexNow(h.env,next-1,reject);assert.equal(attempts,1);
    await runIndexNow(h.env,next,h.send);assert.equal(h.job().complete,1);
    assert.equal(h.job().failure_count,0);assert.equal(h.job().next_attempt_at,0);
  }
});

test('5xx and invalid Retry-After use exponential delays capped at 24 hours',async()=>{
  for (const status of [429,500,503,599]) {
    const h=harness(entries(1));h.env.INDEXNOW_DAILY_CAP='100000';let now=1000;
    for (const hours of [1,2,4,8,16,24,24]) {
      const before=now;
      await runIndexNow(h.env,now,async()=>new Response(null,{status,headers:{'retry-after':'invalid'}}));
      assert.equal(h.job().next_attempt_at,before+hours*HOUR);
      assert.equal(h.job().cursor,0);now=h.job().next_attempt_at;
    }
    assert.equal(h.job().failure_count,7);
    await runIndexNow(h.env,now,h.send);assert.equal(h.job().failure_count,0);
  }
  const h=harness(entries(1));
  await runIndexNow(h.env,1000,async()=>new Response(null,{status:503,headers:{'retry-after':'900'}}));
  assert.equal(h.job().next_attempt_at,HOUR+1000);
});

test('a daily cap smaller than a batch truncates requests and is shared across epochs',async()=>{
  const h=harness(entries(1200));h.env.INDEXNOW_DAILY_CAP='725';
  await runIndexNow(h.env,1000,h.send);
  assert.deepEqual(h.calls.map(c=>c.body.urlList.length),[500,225]);
  assert.equal(h.job().cursor,725);assert.equal(h.daily(1000).urls_sent,725);
  await runIndexNow(h.env,301000,h.send);assert.equal(h.calls.length,2);
  h.env.CACHE_EPOCH='epoch-2';await runIndexNow(h.env,601000,h.send);
  assert.equal(h.calls.length,2);assert.equal(h.job().total,475);
  assert.equal(h.sqlite.prepare('SELECT superseded FROM indexnow_jobs WHERE epoch = ?').get('epoch-1').superseded,1);
  await runIndexNow(h.env,DAY+1000,h.send);assert.equal(h.job().complete,1);
  assert.equal(h.daily(DAY+1000).urls_sent,475);
  const sent=h.calls.flatMap(c=>c.body.urlList);assert.equal(sent.length,1200);assert.equal(new Set(sent).size,1200);
});

test('default daily cap stops at 2000 and zero pauses all sends',async()=>{
  const h=harness(entries(2001));
  for (const now of [1000,301000,601000]) await runIndexNow(h.env,now,h.send);
  assert.equal(h.calls.length,4);assert.equal(h.job().cursor,2000);assert.equal(h.daily(1000).urls_sent,2000);
  await runIndexNow(h.env,DAY+1000,h.send);assert.equal(h.job().complete,1);
  const paused=harness(entries(2));paused.env.INDEXNOW_DAILY_CAP='0';
  await runIndexNow(paused.env,1000,paused.send);assert.equal(paused.calls.length,0);assert.equal(paused.job().cursor,0);
  for (const invalid of ['invalid','-1','2.5','']) {
    const h=harness(entries(1000));h.env.INDEXNOW_DAILY_CAP=invalid;
    await runIndexNow(h.env,1000,h.send);assert.equal(h.job().complete,1);
  }
});

test('quota accounting follows UTC midnight even within one tick',async()=>{
  const h=harness(entries(2));h.env.INDEXNOW_DAILY_CAP='1';let current=DAY-1000;
  await run(h.env,current,async(...args)=>{const response=await h.send(...args);current=DAY+1000;return response;},()=>current);
  assert.equal(h.calls.length,2);assert.equal(h.job().complete,1);
  assert.equal(h.daily(DAY-1000).urls_sent,1);assert.equal(h.daily(DAY+1000).urls_sent,1);
});

test('supersession carries the unsent suffix once and never repeats accepted URLs or extras across epochs',async()=>{
  const h=harness(entries(1100));h.env.INDEXNOW_DAILY_CAP='500';
  h.env.INDEXNOW_EXTRA_PATHS='/subject/donor/fixture-donor-a /subject/donor/fixture-donor-b';
  await runIndexNow(h.env,1000,h.send);assert.equal(h.job().cursor,500);
  h.env.CACHE_EPOCH='epoch-2';await runIndexNow(h.env,DAY+1000,h.send);
  assert.equal(h.job().total,602);assert.equal(h.job().cursor,500);
  const before=h.calls.length;
  await runIndexNow({...h.env,CACHE_EPOCH:'epoch-1'},DAY+301000,h.send);
  assert.equal(h.calls.length,before,'a superseded epoch cannot resume');
  h.env.CACHE_EPOCH='epoch-3';await runIndexNow(h.env,2*DAY+1000,h.send);
  assert.equal(h.job().total,102);assert.equal(h.job().complete,1);
  h.env.CACHE_EPOCH='epoch-4';await runIndexNow(h.env,2*DAY+301000,h.send);
  assert.equal(h.calls.length,before+1,'retaining the same extra secret does not repeat pings');
  assert.equal(h.job().total,0);assert.equal(h.job().complete,1);
  const sent=h.calls.flatMap(c=>c.body.urlList);assert.equal(sent.length,1102);assert.equal(new Set(sent).size,1102);
});

test('pending private extras survive secret removal and are prioritised on the replacement epoch',async()=>{
  const h=harness(entries(1));h.env.INDEXNOW_DAILY_CAP='1';
  h.env.INDEXNOW_EXTRA_PATHS='/subject/donor/fixture-a /subject/donor/fixture-b /subject/donor/fixture-c';
  await runIndexNow(h.env,1000,h.send);assert.equal(h.calls.length,1);
  h.env.CACHE_EPOCH='epoch-2';delete h.env.INDEXNOW_EXTRA_PATHS;h.env.INDEXNOW_DAILY_CAP='5';
  await runIndexNow(h.env,DAY+1000,h.send);
  assert.deepEqual(h.calls[1].body.urlList,[
    'https://opax.com.au/subject/donor/fixture-b','https://opax.com.au/subject/donor/fixture-c','https://opax.com.au/bill/au-federal-r0',
  ]);
  h.env.CACHE_EPOCH='epoch-3';await runIndexNow(h.env,DAY+301000,h.send);
  assert.equal(h.calls.length,2);assert.equal(h.job().complete,1);
});

test('an unsent URL absent from the new manifest is still carried and deduplicated',async()=>{
  const original=entries(3),rows=original.map(row=>[...row]),h=harness(rows);h.env.INDEXNOW_DAILY_CAP='1';
  await runIndexNow(h.env,1000,h.send);
  const unsent=JSON.parse(h.job().urls).slice(h.job().cursor);rows.splice(0,rows.length);
  h.env.CACHE_EPOCH='epoch-2';await runIndexNow(h.env,DAY+1000,h.send);
  assert.equal(h.job().total,2);
  h.env.CACHE_EPOCH='epoch-3';await runIndexNow(h.env,2*DAY+1000,h.send);
  assert.equal(h.job().total,1);assert.equal(h.job().complete,1);
  assert.deepEqual(h.calls.slice(1).flatMap(c=>c.body.urlList),unsent);
  rows.push(...original);h.env.CACHE_EPOCH='epoch-4';
  await runIndexNow(h.env,3*DAY+1000,h.send);
  assert.equal(h.calls.length,3,'carried fingerprints were journalled even while absent from the current manifest');
  assert.equal(h.job().complete,1);
});

test('backoff survives supersession and stale epochs cannot send',async()=>{
  const h=harness(entries(3));
  await runIndexNow(h.env,1000,async()=>new Response(null,{status:429,headers:{'retry-after':'7200'}}));
  h.env.CACHE_EPOCH='epoch-2';await runIndexNow(h.env,301000,h.send);
  assert.equal(h.calls.length,0);assert.equal(h.job().next_attempt_at,2*HOUR+1000);assert.equal(h.job().failure_count,1);
  await runIndexNow({...h.env,CACHE_EPOCH:'epoch-1'},2*HOUR+1000,h.send);assert.equal(h.calls.length,0);
  await runIndexNow(h.env,2*HOUR+1000,h.send);assert.equal(h.job().complete,1);
});

test('the global lease prevents a new epoch planning over an in-flight accepted batch',async()=>{
  const h=harness(entries(1001));let release,entered;
  const wait=new Promise(r=>{release=r;}),ready=new Promise(r=>{entered=r;});
  const first=runIndexNow(h.env,1000,async(...args)=>{entered();await wait;return h.send(...args);});
  await ready;
  const newer={...h.env,CACHE_EPOCH:'epoch-2',INDEXNOW_EPOCH_VERSION:'2'};
  await runIndexNow(newer,1000,h.send);
  assert.equal(h.sqlite.prepare('SELECT count(*) AS n FROM indexnow_jobs').get().n,1);
  release();await first;assert.equal(h.job().cursor,1000);
  await runIndexNow(newer,301000,h.send);
  assert.equal(h.calls.length,3);assert.equal(new Set(h.calls.flatMap(c=>c.body.urlList)).size,1001);
});

function legacyJob(h,epoch,rows,urls,cursor=0,complete=0) {
  h.sqlite.prepare('INSERT INTO indexnow_snapshots (epoch,entries) VALUES (?,?)').run(epoch,JSON.stringify(rows));
  h.sqlite.prepare('INSERT INTO indexnow_jobs (epoch,urls,cursor,complete,total) VALUES (?,?,?,?,?)')
    .run(epoch,JSON.stringify(urls),cursor,complete,Math.max(cursor,urls.length));
}

test('legacy incomplete sent prefixes are unioned over the completed snapshot',async()=>{
  const rows=entries(4),h=harness(rows),urls=rows.map(([p])=>'https://opax.com.au'+p);
  legacyJob(h,'completed',rows.slice(0,1),[],1,1);
  legacyJob(h,'incomplete-1',rows,urls,2);
  legacyJob(h,'incomplete-2',rows,[urls[2],...urls],1);
  await runIndexNow(h.env,1000,h.send);
  assert.deepEqual(h.calls.flatMap(c=>c.body.urlList),[urls[3]]);
  assert.equal(h.job().complete,1);
  assert.equal(h.sqlite.prepare('SELECT count(*) AS n FROM indexnow_jobs WHERE superseded = 1').get().n,2);
});

test('legacy prefixes predating a completed job contribute missing receipts without reverting its fingerprints',async()=>{
  const rows=entries(3),h=harness(rows),urls=rows.map(([p])=>'https://opax.com.au'+p);
  legacyJob(h,'older',[[rows[0][0],'older'],rows[1]],[urls[0],urls[1],urls[2]],2);
  legacyJob(h,'completed',rows.slice(0,1),[],1,1);
  await runIndexNow(h.env,1000,h.send);
  assert.deepEqual(h.calls.flatMap(c=>c.body.urlList),[urls[2]]);
});

test('a stale legacy epoch defers to a newer journalled epoch during rollout',async()=>{
  const rows=entries(2),h=harness(rows),urls=rows.map(([p])=>'https://opax.com.au'+p);
  legacyJob(h,'older',rows,urls,1);legacyJob(h,'newer',rows,urls);
  h.sqlite.prepare('UPDATE indexnow_epoch_fence SET epoch = ?, version = ?').run('newer',3);
  h.env.CACHE_EPOCH='older';await runIndexNow(h.env,1000,h.send);assert.equal(h.calls.length,0);
  assert.equal(h.job().cursor,1);assert.equal(h.job().superseded,0);
  h.env.CACHE_EPOCH='newer';await runIndexNow(h.env,301000,h.send);
  assert.deepEqual(h.calls.flatMap(c=>c.body.urlList),[urls[1]]);assert.equal(h.job().complete,1);
});

test('rollout preserves legacy job progress and honours its in-flight lease',async()=>{
  const sqlite=new DatabaseSync(':memory:');
  sqlite.exec(readFileSync(new URL('../migrations/0013_indexnow.sql',import.meta.url),'utf8'));
  const urls=entries(3).map(([p])=>'https://opax.com.au'+p);
  sqlite.prepare('INSERT INTO indexnow_jobs (epoch,urls,cursor,owner,lease_until) VALUES (?,?,?,?,?)')
    .run('legacy',JSON.stringify(urls),2,'legacy-owner',121000);
  sqlite.prepare('INSERT INTO indexnow_jobs (epoch,urls,cursor,complete) VALUES (?,?,?,1)')
    .run('completed','[]',10);
  sqlite.exec(readFileSync(new URL('../migrations/0014_indexnow_backoff.sql',import.meta.url),'utf8'));
  const job=sqlite.prepare('SELECT * FROM indexnow_jobs WHERE epoch = ?').get('legacy');
  assert.equal(job.urls,JSON.stringify(urls));assert.equal(job.cursor,2);assert.equal(job.total,3);
  assert.equal(job.owner,'legacy-owner');assert.equal(job.lease_until,121000);
  assert.equal(sqlite.prepare('SELECT total FROM indexnow_jobs WHERE epoch = ?').get('completed').total,10);
  const h=harness(entries(3));legacyJob(h,'legacy',entries(3),urls,2);
  h.sqlite.prepare('UPDATE indexnow_jobs SET owner = ?, lease_until = ?').run('legacy-owner',121000);
  await runIndexNow(h.env,1000,h.send);assert.equal(h.calls.length,0);assert.equal(h.job(),undefined);
  await runIndexNow(h.env,121000,h.send);assert.deepEqual(h.calls.flatMap(c=>c.body.urlList),[urls[2]]);
});

test('a tick that loses its lease while reading the manifest cannot create or supersede plans',async()=>{
  const h=harness(entries(1));let current=1000;
  h.env.ASSETS.fetch=async()=>{current=121001;return Response.json({entries:entries(1)});};
  await run(h.env,1000,h.send,()=>current);
  assert.equal(h.calls.length,0);assert.equal(h.job(),undefined);
  assert.equal(h.sqlite.prepare('SELECT initialized FROM indexnow_control').get().initialized,0);
  assert.equal(h.sqlite.prepare('SELECT count(*) AS n FROM indexnow_sent').get().n,0);
});

test('reported legacy backlog is rebuilt in place: 5621 unsent, privacy first, drained in three quota days',async()=>{
  const people=Array.from({length:1703},(_,i)=>[`/subject/person/fixture-person-${i}`,'old']);
  const changedPeople=new Set(people.slice(0,1024).map(([p])=>p));
  const divisions=Array.from({length:3865},(_,i)=>[`/doc/division-fixture-${i}`,'old']);
  const old=[...entries(2989),...divisions,...people],rows=old.map(([p,f])=>[p,changedPeople.has(p)?'privacy':f]);
  const h=harness(rows);
  const donorPaths=Array.from({length:64},(_,i)=>`/subject/donor/fixture-donor-${i}`);
  h.env.INDEXNOW_EXTRA_PATHS=donorPaths.join(' ');h.env.CACHE_EPOCH='2026-10-10-donor-privacy';
  const oldUrls=old.map(([p])=>'https://opax.com.au'+p).sort();
  const currentUrls=[...rows.map(([p])=>'https://opax.com.au'+p),...extraUrls(h.env.INDEXNOW_EXTRA_PATHS)].sort();
  legacyJob(h,'2026-10-09-nightly',old,oldUrls,3000);
  legacyJob(h,'2026-10-10-nightly',old,oldUrls);
  legacyJob(h,h.env.CACHE_EPOCH,rows,currentUrls);
  await runIndexNow(h.env,1000,h.send);
  assert.equal(h.job().total,5621);assert.equal(h.job().cursor,1000);assert.equal(h.job().plan_version,1);
  const plan=JSON.parse(h.job().urls),privacy=new Set([...changedPeople].map(p=>'https://opax.com.au'+p).concat(extraUrls(h.env.INDEXNOW_EXTRA_PATHS)));
  assert.equal(privacy.size,1088);assert.ok(plan.slice(0,1088).every(url=>privacy.has(url)));
  assert.ok(h.calls.flatMap(c=>c.body.urlList).every(url=>privacy.has(url)));
  for (const now of [301000,DAY+1000,DAY+301000,2*DAY+1000,2*DAY+301000]) await runIndexNow(h.env,now,h.send);
  assert.equal(h.job().complete,1);assert.equal(h.job().cursor,5621);
  assert.equal(h.sqlite.prepare('SELECT count(*) AS n FROM indexnow_jobs WHERE superseded = 1').get().n,2);
  assert.deepEqual([0,DAY,2*DAY].map(n=>h.daily(n).urls_sent),[2000,2000,1621]);
  const sent=h.calls.flatMap(c=>c.body.urlList);
  assert.equal(sent.length,5621);assert.equal(new Set(sent).size,5621);
  assert.ok(!sent.some(url=>oldUrls.slice(0,3000).includes(url)));
});

test('priority includes changed people, donors and divisions ahead of new bills and carried work',async()=>{
  const previous=[...entries(501),['/subject/person/fixture-person','old'],['/doc/division-fixture-1','old'],['/subject/donor/fixture-donor-a','old']];
  const rows=previous.map(([p,f])=>[p,p.startsWith('/bill/')?f:'new']);rows.push(['/bill/au-federal-new','new']);
  const h=harness(rows);h.env.INDEXNOW_DAILY_CAP='0';h.env.INDEXNOW_EXTRA_PATHS='/subject/donor/fixture-donor-b';
  legacyJob(h,'previous',previous,previous.map(([p])=>'https://opax.com.au'+p).sort());
  await runIndexNow(h.env,1000,h.send);
  const plan=JSON.parse(h.job().urls);
  assert.deepEqual(plan.slice(0,4),[
    'https://opax.com.au/subject/donor/fixture-donor-a','https://opax.com.au/subject/donor/fixture-donor-b',
    'https://opax.com.au/subject/person/fixture-person','https://opax.com.au/doc/division-fixture-1',
  ]);
  assert.ok(plan.slice(4).every(url=>url.includes('/bill/')));
  assert.deepEqual(indexNowPayloads(plan)[0].urlList,plan.slice(0,500),'payload validation preserves priority');
});

test('status and backoff logs contain counts and times without private URLs',async(t)=>{
  const h=harness(entries(2)),logs=[];h.env.INDEXNOW_EXTRA_PATHS='/subject/donor/fixture-private-path';
  t.mock.method(console,'log',line=>logs.push(JSON.parse(line)));
  await runIndexNow(h.env,1000,async()=>new Response(null,{status:429}));
  const status=logs.find(l=>l.event==='indexnow_status'),backoff=logs.find(l=>l.event==='indexnow_backoff');
  assert.equal(status.epoch,'epoch-1');assert.equal(status.cursor,0);assert.equal(status.total,3);
  assert.equal(status.next_attempt_at,HOUR+1000);assert.equal(status.urls_sent_today,3);assert.equal(status.urls_accepted_today,0);
  assert.equal(backoff.next_attempt_at,HOUR+1000);assert.equal(backoff.status,429);
  assert.ok(!JSON.stringify(logs).includes('fixture-private-path'));
});

test('dry-run leaves existing receipts, pending jobs, leases and daily counts byte-identical',async()=>{
  const h=harness(entries(1001));h.env.INDEXNOW_DAILY_CAP='500';await runIndexNow(h.env,1000,h.send);
  const dump=()=>JSON.stringify(['indexnow_jobs','indexnow_snapshots','indexnow_sent','indexnow_control','indexnow_daily','indexnow_epoch_fence','indexnow_priority']
    .map(table=>h.sqlite.prepare('SELECT * FROM '+table).all()));
  const before=dump();h.env.CACHE_EPOCH='epoch-2';h.env.INDEXNOW_DRY_RUN='true';
  await runIndexNow(h.env,DAY+1000,h.send);assert.equal(dump(),before);assert.equal(h.calls.length,1);
});

test('review reproduction: an unrecorded stale epoch cannot supersede or permanently block the current job',async()=>{
  const h=harness(entries(10));h.env.CACHE_EPOCH='current';h.env.INDEXNOW_EPOCH_VERSION='200';h.env.INDEXNOW_DAILY_CAP='1';
  await runIndexNow(h.env,1000,h.send);assert.equal(h.job().cursor,1);
  for (const version of ['199','200','0',undefined]) {
    const stale={...h.env,CACHE_EPOCH:'unrecorded-stale',INDEXNOW_EPOCH_VERSION:version};
    await runIndexNow(stale,10*DAY,h.send);
    assert.equal(h.sqlite.prepare('SELECT count(*) AS n FROM indexnow_jobs WHERE epoch = ?').get(stale.CACHE_EPOCH).n,0);
    assert.equal(h.calls.length,1);assert.equal(h.job().superseded,0);
    assert.deepEqual({...h.sqlite.prepare('SELECT epoch,version FROM indexnow_epoch_fence').get()},{epoch:'current',version:200});
  }
  await runIndexNow(h.env,DAY+1000,h.send);assert.equal(h.job().cursor,2,'current ticks still advance');
  const newer={...h.env,CACHE_EPOCH:'newer',INDEXNOW_EPOCH_VERSION:'201'};
  await runIndexNow(newer,2*DAY+1000,h.send);
  assert.equal(h.job().superseded,1);
  assert.deepEqual({...h.sqlite.prepare('SELECT epoch,version FROM indexnow_epoch_fence').get()},{epoch:'newer',version:201});
  assert.equal(h.sqlite.prepare('SELECT cursor FROM indexnow_jobs WHERE epoch = ?').get('newer').cursor,1);
});

test('a superseded row with a later rowid or held lease cannot block an authoritative newer epoch',async()=>{
  const h=harness(entries(3));h.env.INDEXNOW_DAILY_CAP='0';await runIndexNow(h.env,1000,h.send);
  legacyJob(h,'late-superseded',entries(3),entries(3).map(([p])=>'https://opax.com.au'+p));
  h.sqlite.prepare('UPDATE indexnow_jobs SET superseded = 1, owner = ?, lease_until = ? WHERE epoch = ?')
    .run('old-owner',100*DAY,'late-superseded');
  h.env.CACHE_EPOCH='epoch-2';h.env.INDEXNOW_DAILY_CAP='3';await runIndexNow(h.env,301000,h.send);
  assert.equal(h.job().complete,1);assert.equal(h.calls.length,1);
  assert.equal(h.sqlite.prepare('SELECT version FROM indexnow_epoch_fence').get().version,2);
});

test('privacy person priority persists through two supersessions until each URL is accepted',async()=>{
  const people=Array.from({length:1024},(_,i)=>[`/subject/person/fixture-person-${i}`,'before']);
  const divisions=Array.from({length:600},(_,i)=>[`/doc/division-fixture-${i}`,'before']);
  const before=[...entries(600),...people,...divisions];
  const rows=before.map(([p,f])=>[p,p.startsWith('/subject/person/')?'privacy':f]);
  const h=harness(rows);h.env.CACHE_EPOCH='privacy';h.env.INDEXNOW_DAILY_CAP='500';
  h.env.INDEXNOW_EXTRA_PATHS=Array.from({length:64},(_,i)=>`/subject/donor/fixture-${i}`).join(' ');
  legacyJob(h,'before',before,before.map(([p])=>'https://opax.com.au'+p).sort());
  await runIndexNow(h.env,1000,h.send);assert.equal(h.job().cursor,500);
  const accepted=new Set(h.calls.flatMap(c=>c.body.urlList));
  const remainingPeople=people.map(([p])=>'https://opax.com.au'+p).filter(url=>!accepted.has(url));
  assert.equal(remainingPeople.length,588);
  for(const row of rows)if(row[0].startsWith('/doc/division-'))row[1]='ordinary-refresh';
  rows.push(['/bill/au-federal-new','new']);h.env.CACHE_EPOCH='ordinary-1';
  await runIndexNow(h.env,DAY+1000,h.send);
  assert.ok(h.calls[1].body.urlList.every(url=>remainingPeople.includes(url)),'first replacement batch contains only pending privacy people');
  const pendingFlags=new Map(JSON.parse(h.sqlite.prepare('SELECT ranks FROM indexnow_priority').get().ranks));
  assert.equal([...pendingFlags.values()].filter(rank=>rank===0).length,88);
  assert.ok(h.calls.flatMap(c=>c.body.urlList).every(url=>!pendingFlags.has(url)),'accepted flags are removed');
  h.env.CACHE_EPOCH='ordinary-2';await runIndexNow(h.env,2*DAY+1000,h.send);
  assert.ok(h.calls[2].body.urlList.slice(0,88).every(url=>remainingPeople.includes(url)));
  assert.ok(h.calls[2].body.urlList.slice(88).every(url=>url.includes('/doc/division-')));
  const allSent=h.calls.flatMap(c=>c.body.urlList);assert.equal(new Set(allSent).size,allSent.length);
  assert.equal(h.sqlite.prepare('SELECT count(*) AS n FROM indexnow_priority').get().n,1);
});

test('Retry-After zero, one second and past dates cannot undercut the exponential minimum',async()=>{
  for(const status of [429,503])for(const header of ['0','1',new Date(0).toUTCString()]) {
    const h=harness(entries(1));let attempts=0;
    const reject=async()=>{attempts++;return new Response(null,{status,headers:{'retry-after':header}});};
    await runIndexNow(h.env,1000,reject);assert.equal(h.job().next_attempt_at,HOUR+1000);
    for(const now of [301000,HOUR])await runIndexNow(h.env,now,reject);
    assert.equal(attempts,1);
    await runIndexNow(h.env,HOUR+1000,reject);assert.equal(h.job().next_attempt_at,3*HOUR+1000);
    assert.equal(attempts,2);await runIndexNow(h.env,2*HOUR+1000,reject);assert.equal(attempts,2);
  }
});

test('twelve failing epochs retain at most five jobs, one snapshot and only the active payload and priorities',async()=>{
  const rows=[...entries(4),...Array.from({length:25},(_,i)=>[`/subject/person/fixture-${i}`,'privacy'])];
  const h=harness(rows);let now=1000;h.env.INDEXNOW_DAILY_CAP='100000';
  for(let i=1;i<=12;i++) {
    h.env.CACHE_EPOCH='failing-'+i;
    await runIndexNow(h.env,now,async()=>new Response(null,{status:503}));
    assert.equal(h.job().complete,0);assert.equal(h.job().cursor,0);assert.equal(h.job().total,29);
    assert.equal(h.job().failure_count,i);now=h.job().next_attempt_at;
    assert.ok(h.sqlite.prepare('SELECT count(*) AS n FROM indexnow_jobs').get().n<=INDEXNOW_JOB_RETENTION);
    assert.equal(h.sqlite.prepare('SELECT count(*) AS n FROM indexnow_snapshots').get().n,1);
    assert.equal(h.sqlite.prepare('SELECT count(*) AS n FROM indexnow_priority').get().n,1);
    for(const old of h.sqlite.prepare('SELECT * FROM indexnow_jobs WHERE epoch != ?').all(h.env.CACHE_EPOCH)) {
      assert.equal(old.superseded,1);assert.equal(old.urls,'[]');assert.equal(old.extras,'[]');assert.equal(old.carried_entries,'[]');
    }
  }
  assert.equal(h.sqlite.prepare('SELECT count(*) AS n FROM indexnow_jobs').get().n,5);
  const fence=JSON.stringify(h.sqlite.prepare('SELECT * FROM indexnow_epoch_fence').get());
  await runIndexNow({...h.env,CACHE_EPOCH:'failing-1',INDEXNOW_EPOCH_VERSION:'2'},now,h.send);
  assert.equal(h.calls.length,0);assert.equal(JSON.stringify(h.sqlite.prepare('SELECT * FROM indexnow_epoch_fence').get()),fence);
  await runIndexNow(h.env,now,h.send);assert.equal(h.job().complete,1);
  assert.equal(new Set(h.calls.flatMap(c=>c.body.urlList)).size,29);
});

test('an existing pre-review job is upgraded and prunes old retained payloads while still backing off',async()=>{
  const h=harness(entries(3));h.env.INDEXNOW_DAILY_CAP='0';await runIndexNow(h.env,1000,h.send);
  h.sqlite.exec('DELETE FROM indexnow_priority');
  h.sqlite.prepare('UPDATE indexnow_jobs SET next_attempt_at = ?').run(DAY);
  for(let i=0;i<12;i++) {
    legacyJob(h,'old-'+i,entries(3),entries(3).map(([p])=>'https://opax.com.au'+p));
    h.sqlite.prepare('UPDATE indexnow_jobs SET superseded = 1 WHERE epoch = ?').run('old-'+i);
  }
  await runIndexNow(h.env,301000,h.send);
  assert.equal(h.calls.length,0);assert.equal(h.job().next_attempt_at,DAY);
  assert.equal(h.sqlite.prepare('SELECT count(*) AS n FROM indexnow_jobs').get().n,5);
  assert.equal(h.sqlite.prepare('SELECT count(*) AS n FROM indexnow_snapshots').get().n,1);
  assert.ok(h.sqlite.prepare('SELECT urls FROM indexnow_jobs WHERE superseded = 1').all().every(row=>row.urls==='[]'));
});

test('malformed journals and arbitrary exception names never echo private paths in logs',async(t)=>{
  const h=harness(entries(2));h.env.INDEXNOW_DAILY_CAP='0';await runIndexNow(h.env,1000,h.send);
  const privatePath='/subject/donor/fixture-private-marker',logs=[];
  t.mock.method(console,'log',line=>logs.push(JSON.parse(line)));
  const original=h.job().urls;
  h.sqlite.prepare('UPDATE indexnow_jobs SET urls = ?').run('["'+privatePath+'", malformed]');
  await runIndexNow(h.env,301000,h.send);
  assert.equal(logs.find(l=>l.event==='indexnow_failed').error_class,'SyntaxError');
  h.sqlite.prepare('UPDATE indexnow_jobs SET urls = ?').run(original);h.env.INDEXNOW_DAILY_CAP='100';
  const err=new Error(privatePath);err.name=privatePath;
  await runIndexNow(h.env,601000,async()=>{throw err;});
  await runIndexNow(h.env,901000,async()=>new Response(privatePath,{status:403}));
  const failures=logs.filter(l=>l.event==='indexnow_failed');
  assert.deepEqual(failures.map(l=>l.error_class),['SyntaxError','Error','IndexNowHttpError']);
  assert.equal(failures[2].status,403);assert.equal(failures[2].urls,2);
  assert.ok(!JSON.stringify(logs).includes(privatePath));assert.ok(failures.every(l=>!('message' in l)));
});

test('the fence migration is idempotent and replay preserves the authoritative version and pending flags',async()=>{
  const h=harness(entries(2));h.env.INDEXNOW_DAILY_CAP='0';await runIndexNow(h.env,1000,h.send);
  h.sqlite.prepare('UPDATE indexnow_epoch_fence SET version = 42').run();
  h.sqlite.prepare('UPDATE indexnow_priority SET ranks = ?').run(JSON.stringify([['https://opax.com.au/subject/person/fixture',0]]));
  const dump=()=>JSON.stringify(['indexnow_jobs','indexnow_snapshots','indexnow_sent','indexnow_control','indexnow_daily','indexnow_epoch_fence','indexnow_priority']
    .map(table=>h.sqlite.prepare('SELECT * FROM '+table).all()));
  const before=dump();
  for(let i=0;i<2;i++)h.sqlite.exec(readFileSync(new URL('../migrations/0015_indexnow_epoch_fence.sql',import.meta.url),'utf8'));
  assert.equal(dump(),before);
});
