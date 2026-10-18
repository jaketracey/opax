import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync,writeFileSync,readFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,basename} from 'node:path';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {buildTableSQL} from '../../scripts/load_tables.mjs';
import {reloadTables,readManifest,preflight,driftedTables,ReloadError,POLL_RACE,SMOKE_DATASETS} from '../../scripts/reload_tables.mjs';

// A real (tiny) manifest from the table builder: one audit report, every other dataset empty.
const fixture = async () => {
  const dir = mkdtempSync(join(tmpdir(),'opax-reload-'));
  await buildTableSQL({output:dir,datasets:{'audit-reports':[{row:{id:'a1',title:'Fixture report',report_label:'Report 1',sectors:['Health'],entities:'Fixture entity',jurisdiction:'qld',number:1,year:2026,tabled_date:'2026-01-01',canonical_url:'https://example.test/a1'}}]}});
  return dir;
};

// A fake `wrangler d1 execute`: live version, live columns (from the new schema unless overridden) and per-file results.
function fakeD1({version = 'old', expected, columns = {}, fileResults = {}, noMeta = false} = {}) {
  const calls = [], applied = [];
  const ok = stdout => ({code:0,stdout,stderr:''});
  const d1 = async args => {
    calls.push(args);
    if (args.file) {
      const name = basename(args.file), queue = fileResults[name];
      const result = Array.isArray(queue) && queue.length ? queue.shift() : {code:0,stdout:'',stderr:''};
      if (result.code === 0 || String(result.stdout + result.stderr).includes(POLL_RACE)) applied.push(name);
      return result;
    }
    if (args.command.startsWith('SELECT value FROM table_meta')) return noMeta ? {code:1,stdout:'',stderr:'no such table: table_meta: SQLITE_ERROR'} : ok(JSON.stringify([{results:version ? [{value:version}] : []}]));
    if (args.command.startsWith('SELECT name FROM sqlite_master')) {
      const tables = Object.keys(expected);
      return ok(JSON.stringify([{results:tables.map(name => ({name}))},...tables.map(t => ({results:(columns[t] || expected[t]).map(name => ({name}))}))]));
    }
    if (args.command.startsWith('DROP')) return ok('');
    throw new Error('unexpected wrangler call');
  };
  return {d1,calls,applied};
}
const okFetch = async () => new Response(JSON.stringify({total:3}),{status:200});
const quiet = {sleep:async () => {},log:() => {}};

test('equal hash: no D1 writes, smoke still runs', async () => {
  const dir = await fixture();
  try {
    const {version} = readManifest(dir), urls = [];
    const {d1,calls} = fakeD1({version});
    const result = await reloadTables({dir,d1,base:'https://example.test',fetch:async url => {urls.push(url);return okFetch();},...quiet});
    assert.equal(result.action,'skipped');
    assert.equal(calls.length,1,'only the version query');
    assert.deepEqual(urls,SMOKE_DATASETS.map(d => `https://example.test/api/table/${d}?pageSize=1`));
  } finally {rmSync(dir,{recursive:true,force:true});}
});

test('changed hash: preflight, drift check, every file in manifest order', async () => {
  const dir = await fixture();
  try {
    const manifest = readManifest(dir), expected = preflight(dir,manifest);
    const {d1,calls,applied} = fakeD1({version:'0123456789abcdef01234567',expected});
    const result = await reloadTables({dir,d1,...quiet});
    assert.equal(result.action,'reloaded');
    assert.deepEqual(result.drift,[]);
    assert.deepEqual(applied,manifest.files);
    assert.ok(calls[1].command.includes('PRAGMA table_info(table_audit_reports)'));
    assert.ok(!calls.some(c => c.command?.startsWith('DROP')));
    assert.match(readFileSync(join(dir,manifest.files.at(-1)),'utf8'),new RegExp(manifest.version));
  } finally {rmSync(dir,{recursive:true,force:true});}
});

test('no table_meta yet (first load or a cut load): reload', async () => {
  const dir = await fixture();
  try {
    const manifest = readManifest(dir);
    const {d1,applied} = fakeD1({noMeta:true,expected:preflight(dir,manifest)});
    assert.equal((await reloadTables({dir,d1,...quiet})).action,'reloaded');
    assert.equal(applied.length,manifest.files.length);
  } finally {rmSync(dir,{recursive:true,force:true});}
});

test('a drifted table is dropped (with _fts and _facets) before any file applies', async () => {
  const dir = await fixture();
  try {
    const manifest = readManifest(dir), expected = preflight(dir,manifest);
    const columns = {table_grants:expected.table_grants.filter(c => c !== 'electorate')};
    assert.deepEqual(driftedTables(expected,{...Object.fromEntries(Object.keys(expected).map(t => [t,expected[t]])),...columns}),['table_grants']);
    const {d1,calls} = fakeD1({expected,columns});
    const result = await reloadTables({dir,d1,...quiet});
    assert.deepEqual(result.drift,['table_grants']);
    const drop = calls.findIndex(c => c.command?.startsWith('DROP')), first = calls.findIndex(c => c.file);
    assert.ok(drop > 0 && drop < first);
    assert.equal(calls[drop].command,'DROP TABLE IF EXISTS table_grants_fts; DROP TABLE IF EXISTS table_grants_facets; DROP TABLE IF EXISTS table_grants;');
    // a missing live table is created by the schema file, not dropped
    assert.deepEqual(driftedTables(expected,{}),[]);
  } finally {rmSync(dir,{recursive:true,force:true});}
});

test('a transient D1 error is retried; the poll race counts as applied', async () => {
  const dir = await fixture();
  try {
    const manifest = readManifest(dir), [, second, third] = manifest.files, sleeps = [], log = [];
    const {d1,calls,applied} = fakeD1({expected:preflight(dir,manifest),fileResults:{
      [second]:[{code:1,stdout:'',stderr:'D1_RESET_DO: the Durable Object was reset'}],
      [third]:[{code:1,stdout:`✘ ${POLL_RACE}`,stderr:''}]}});
    await reloadTables({dir,d1,sleep:async ms => {sleeps.push(ms);},log:line => log.push(line)});
    assert.equal(calls.filter(c => c.file?.endsWith(second)).length,2);
    assert.equal(calls.filter(c => c.file?.endsWith(third)).length,1);
    assert.deepEqual(applied,manifest.files);
    assert.deepEqual(sleeps,[15_000]);
    assert.ok(log.some(line => line.includes('D1_RESET_DO')));
  } finally {rmSync(dir,{recursive:true,force:true});}
});

test('a file that keeps failing stops the load after three attempts', async () => {
  const dir = await fixture();
  try {
    const manifest = readManifest(dir), [, second] = manifest.files, fail = {code:1,stdout:'',stderr:'SQLITE_ERROR: table x has no column named y'};
    const {d1,applied} = fakeD1({expected:preflight(dir,manifest),fileResults:{[second]:[fail,fail,fail]}});
    await assert.rejects(reloadTables({dir,d1,...quiet}),error => error instanceof ReloadError && /file 2\/.*3 attempts.*SQLITE_ERROR/.test(error.message));
    assert.deepEqual(applied,[manifest.files[0]]);
  } finally {rmSync(dir,{recursive:true,force:true});}
});

test('a manifest that does not import never reaches D1', async () => {
  const dir = await fixture();
  try {
    const manifest = readManifest(dir);
    writeFileSync(join(dir,manifest.files[1]),'INSERT INTO table_nope VALUES (1);\n');
    const {d1,calls} = fakeD1({expected:{}});
    await assert.rejects(reloadTables({dir,d1,...quiet}),/preflight: file 2/);
    assert.equal(calls.length,1,'only the version query');
  } finally {rmSync(dir,{recursive:true,force:true});}
});

test('smoke failure fails the reload (and the skip path)', async () => {
  const dir = await fixture();
  try {
    const {version} = readManifest(dir);
    const fetch = async url => url.includes('/divisions?') ? new Response('{"error":"unavailable"}',{status:503}) : url.includes('/votes?') ? new Response('{"total":0}',{status:200}) : okFetch();
    const {d1} = fakeD1({version});
    await assert.rejects(reloadTables({dir,d1,base:'https://example.test',fetch,...quiet}),/table smoke failed for divisions, votes/);
  } finally {rmSync(dir,{recursive:true,force:true});}
});

test('CLI: refuses without --remote; a missing manifest exits 1 with "D1 reload failed" and no wrangler call', () => {
  const script = fileURLToPath(new URL('../../scripts/reload_tables.mjs',import.meta.url));
  const env = {...process.env,GITHUB_STEP_SUMMARY:''};
  assert.equal(spawnSync(process.execPath,[script],{encoding:'utf8',env}).status,2);
  const dir = mkdtempSync(join(tmpdir(),'opax-reload-empty-'));
  try {
    const summary = join(dir,'summary.md');
    const run = spawnSync(process.execPath,[script,'--remote','--sql-dir',dir,'--base','http://127.0.0.1:9'],{encoding:'utf8',env:{...env,GITHUB_STEP_SUMMARY:summary,CLOUDFLARE_API_TOKEN:'not-a-token'}});
    assert.equal(run.status,1);
    assert.match(run.stdout,/::error::D1 reload failed/);
    assert.match(readFileSync(summary,'utf8'),/### D1 reload failed/);
    assert.doesNotMatch(run.stdout + run.stderr,/not-a-token/);
  } finally {rmSync(dir,{recursive:true,force:true});}
});
