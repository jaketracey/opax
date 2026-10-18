// Reload the D1 table database (opax-tables) from a built manifest, but only when the table data changed.
//
//   cd portal && node ../scripts/load_tables.mjs --sql && node ../scripts/reload_tables.mjs --remote
//
// Run by .github/workflows/deploy.yml after `npm run deploy:built`; never from a laptop or the refresh box.
// 1. The manifest's version (sha256 of every SQL file, written by load_tables.mjs into the last file as
//    table_meta 'version') is compared with the live table_meta row. Equal: nothing to load, smoke only.
//    The live row only exists after a complete load: file 0 deletes it, the last file writes it.
// 2. Preflight: every file is applied to an in-memory SQLite first, so D1 is never emptied for a load that
//    cannot import. Row counts must match the manifest.
// 3. Drift check: the live PRAGMA table_info of each table_* table against the new schema; drifted tables
//    (+ _fts, _facets) are dropped so CREATE TABLE IF NOT EXISTS recreates them. (D1 refuses a
//    sqlite_master JOIN pragma_table_info(...) with SQLITE_AUTH; plain PRAGMA table_info works.)
// 4. Every file in order, 3 attempts each (D1_RESET_DO, timeouts). Wrangler's "Not currently importing
//    anything" is a poll race after the import finished: the file applied.
// 5. Smoke: every /api/table/<dataset>?pageSize=1 answers 200 with total > 0.
// While files 0..N apply, /api/table answers 503 "unavailable" (no version row). Exit 1 on any failure.
// Wrangler output is never echoed whole: only D1/SQLite error codes and a short tail.
import {readFileSync,appendFileSync} from 'node:fs';
import {join,resolve} from 'node:path';
import {spawn} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {DatabaseSync} from 'node:sqlite';

export const SMOKE_DATASETS = ['money-connections','contracts','suppliers','grants','divisions','votes','instruments','audit-reports','interests','party-money'];
export const POLL_RACE = 'Not currently importing anything';
const LIVE_TABLES = "SELECT name FROM sqlite_master WHERE type='table' AND name LIKE 'table_%' AND name NOT LIKE '%_fts%'";
const VERSION = "SELECT value FROM table_meta WHERE key='version'";

export class ReloadError extends Error {}

export function readManifest(dir) {
  const manifest = JSON.parse(readFileSync(join(dir,'manifest.json'),'utf8'));
  if (!Array.isArray(manifest.files) || !manifest.files.length) throw new ReloadError('manifest has no files');
  const last = readFileSync(join(dir,manifest.files.at(-1)),'utf8');
  const version = /INSERT INTO table_meta VALUES \('version','([0-9a-f]{16,64})'\)/.exec(last)?.[1];
  if (!version) throw new ReloadError('manifest has no version file');
  return {...manifest,version};
}

/** Apply every manifest file to a fresh in-memory SQLite; return the expected column lists. */
export function preflight(dir, manifest) {
  const db = new DatabaseSync(':memory:');
  try {
    let expected;
    for (const [i,file] of manifest.files.entries()) {
      try {db.exec(readFileSync(join(dir,file),'utf8'));}
      catch (error) {throw new ReloadError(`preflight: file ${i+1} (${file}) does not import: ${String(error.message).slice(0,160)}`);}
      if (i === 0) expected = Object.fromEntries(db.prepare(LIVE_TABLES).all().map(({name}) => [name,db.prepare(`PRAGMA table_info(${name})`).all().map(c => c.name)]));
    }
    for (const [dataset,count] of Object.entries(manifest.counts || {})) {
      const table = 'table_' + dataset.replaceAll('-','_');
      const have = db.prepare(`SELECT count(*) AS n FROM ${table}`).get().n;
      if (have !== count) throw new ReloadError(`preflight: ${table} has ${have} rows, manifest says ${count}`);
    }
    return expected;
  } finally {db.close();}
}

/** Tables whose live columns differ from the new schema. A missing live table is not drift (it gets created). */
export function driftedTables(expected, live) {
  return Object.keys(expected).filter(t => live[t]?.length && live[t].join(',') !== expected[t].join(','));
}

export const isPollRace = output => String(output).includes(POLL_RACE);
const errorCode = output => /\b(?:D1_[A-Z_]+|SQLITE_[A-Z_]+)\b|timed? ?out|\b[45]\d\d\b/i.exec(String(output))?.[0] || 'error';
const tail = output => String(output).trim().split('\n').slice(-3).join(' | ').slice(-300);

/** One wrangler call with up to `attempts` tries. Returns the stdout of the successful try. */
async function attempt(d1, args, {attempts = 3, sleep, log, label, tolerateRace = false}) {
  let last;
  for (let n = 1; n <= attempts; n++) {
    last = await d1(args);
    if (last.code === 0) return last.stdout;
    if (tolerateRace && isPollRace(last.stdout + last.stderr)) {log(`${label}: wrangler poll race after the import, treated as applied`);return last.stdout;}
    if (n < attempts) {log(`${label}: attempt ${n} failed (${errorCode(last.stdout + last.stderr)}), retrying`);await sleep(15_000 * n);}
  }
  throw new ReloadError(`${label} failed after ${attempts} attempts (${errorCode(last.stdout + last.stderr)}): ${tail(last.stderr || last.stdout)}`);
}

const parseJSON = stdout => {
  const at = stdout.search(/^\[/m);   // a line that opens the result array, not a "▲ [WARNING]" banner
  if (at < 0) throw new ReloadError('wrangler --json printed no result');
  return JSON.parse(stdout.slice(at));
};

/** The live version row, or null when table_meta is missing or empty. */
export async function liveVersion(d1, options) {
  const first = await d1({command:VERSION,json:true});
  if (first.code !== 0 && /no such table/i.test(first.stdout + first.stderr)) return null;
  const stdout = first.code === 0 ? first.stdout : await attempt(d1,{command:VERSION,json:true},{...options,label:'version query'});
  return parseJSON(stdout)[0]?.results?.[0]?.value ?? null;
}

export async function smoke({base, fetch = globalThis.fetch, sleep, log, datasets = SMOKE_DATASETS, tries = 3}) {
  const bad = [];
  for (const dataset of datasets) {
    let status = 0, total = 0;
    for (let n = 1; n <= tries; n++) {
      try {
        const response = await fetch(`${base}/api/table/${dataset}?pageSize=1`,{signal:AbortSignal.timeout(20_000)});
        status = response.status;
        total = Number((await response.json().catch(() => ({}))).total) || 0;
      } catch {status = 0;total = 0;}
      if (status === 200 && total > 0) break;
      if (n < tries) await sleep(10_000);
    }
    log(`smoke ${dataset.padEnd(18)} ${status} ${total}`);
    if (!(status === 200 && total > 0)) bad.push(dataset);
  }
  return bad;
}

/**
 * The whole decision. `d1(args)` runs one `wrangler d1 execute` ({command|file, json}) and resolves
 * {code, stdout, stderr}. Returns {action:'skipped'|'reloaded', version, drift, files}; throws ReloadError.
 */
export async function reloadTables({dir, d1, base, fetch, sleep = ms => new Promise(r => setTimeout(r,ms)), log = console.log, force = false}) {
  const options = {sleep,log};
  const manifest = readManifest(dir);
  const live = await liveVersion(d1,options);
  let result;
  if (!force && live === manifest.version) {
    log(`D1 tables current (version ${live}); no reload`);
    result = {action:'skipped',version:live,drift:[],files:0};
  } else {
    log(`D1 version ${live ?? 'none'} -> ${manifest.version}: reloading ${manifest.files.length} files`);
    const expected = preflight(dir,manifest);
    log(`preflight ok: ${manifest.files.length} files import into a fresh database`);
    const tables = Object.keys(expected);
    const out = parseJSON(await attempt(d1,{command:[LIVE_TABLES,...tables.map(t => `PRAGMA table_info(${t})`)].join(';\n') + ';',json:true},{...options,label:'drift check'}));
    for (const t of (out[0]?.results || []).map(r => r.name).filter(t => !(t in expected))) log(`note: live table ${t} is not in the new schema (left as is)`);
    const liveColumns = Object.fromEntries(tables.map((t,i) => [t,(out[i+1]?.results || []).map(c => c.name)]));
    const drift = driftedTables(expected,liveColumns);
    if (drift.length) {
      log(`schema drift: ${drift.join(' ')}; dropping and recreating`);
      await attempt(d1,{command:drift.map(t => `DROP TABLE IF EXISTS ${t}_fts; DROP TABLE IF EXISTS ${t}_facets; DROP TABLE IF EXISTS ${t};`).join(' ')},{...options,label:'drop drifted tables'});
    } else log('no schema drift');
    for (const [i,file] of manifest.files.entries()) {
      await attempt(d1,{file:join(dir,file)},{...options,label:`file ${i+1}/${manifest.files.length} ${file}`,tolerateRace:true});
      if ((i+1) % 10 === 0 || i === manifest.files.length-1) log(`applied ${i+1}/${manifest.files.length}`);
    }
    result = {action:'reloaded',version:manifest.version,drift,files:manifest.files.length};
  }
  if (base) {
    const bad = await smoke({base,fetch,sleep,log});
    if (bad.length) throw new ReloadError(`table smoke failed for ${bad.join(', ')}`);
    log('TABLE SMOKE OK');
  }
  return result;
}

/** Real wrangler, from portal/ (where wrangler.jsonc lives). */
export function wranglerD1({database = 'opax-tables', portal = fileURLToPath(new URL('../portal/',import.meta.url))} = {}) {
  return ({command, file, json}) => new Promise(done => {
    const args = [join(portal,'node_modules/wrangler/bin/wrangler.js'),'d1','execute',database,'--remote','--yes',...(json ? ['--json'] : []),...(file ? ['--file',file] : ['--command',command])];
    const child = spawn(process.execPath,args,{cwd:portal,stdio:['ignore','pipe','pipe'],env:{...process.env,CI:'1',WRANGLER_SEND_METRICS:'false'}});
    let stdout = '', stderr = '';
    child.stdout.on('data',b => {stdout += b;});child.stderr.on('data',b => {stderr += b;});
    child.on('error',error => done({code:1,stdout,stderr:stderr + String(error.message)}));
    child.on('close',code => done({code:code ?? 1,stdout,stderr}));
  });
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const argv = process.argv.slice(2), flag = name => argv.includes(name), value = (name,fallback) => argv.includes(name) ? argv[argv.indexOf(name)+1] : fallback;
  const summary = line => {if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY,line + '\n');};
  if (!flag('--remote')) {console.error('reload_tables.mjs writes the production D1 database; it runs only with --remote (deploy.yml).');process.exit(2);}
  const dir = resolve(value('--sql-dir',fileURLToPath(new URL('../portal/private/dt-api/sql/',import.meta.url))));
  try {
    const result = await reloadTables({dir,d1:wranglerD1(),base:value('--base','https://opax.com.au'),force:flag('--force')});
    summary(result.action === 'skipped' ? `- D1 tables: current (version \`${result.version}\`), not reloaded; smoke ok` : `- D1 tables: reloaded ${result.files} files (version \`${result.version}\`${result.drift.length ? `, recreated ${result.drift.join(' ')}` : ''}); smoke ok`);
  } catch (error) {
    const reason = error instanceof ReloadError ? error.message : 'unexpected error: ' + String(error?.message || error).slice(0,200);
    console.log(`::error::D1 reload failed: ${reason}`);
    summary(`### D1 reload failed\n- ${reason}\n- The Worker is deployed and the site keeps serving; /api/table may be stale or answering 503. Re-run this workflow (the reload is idempotent).`);
    process.exitCode = 1;
  }
}
