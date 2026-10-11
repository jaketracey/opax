// Start and stop only this runner's Wrangler PID. Run the whole command in unshare -rn.
import {spawn} from 'node:child_process';
import {mkdir, writeFile, readFile, open} from 'node:fs/promises';
import {resolve} from 'node:path';
import ts from 'typescript';
import {createInterface} from 'node:readline';
import {seedVoteCaps} from './dt-votes-cap.mjs';
import {tablePrivacyIndex} from './datatable-privacy.mjs';
const output = resolve('private/dt-votes');
await mkdir(output,{recursive:true});
if (!process.env.DT_VOTES_BROWSER_SCRIPT) await seedVoteCaps(output);
const config = resolve(output,'wrangler-local.json');
const configured = ts.parseConfigFileTextToJson('wrangler.jsonc',await readFile('wrangler.jsonc','utf8')).config;
const tableDatabase = configured.d1_databases.find(database=>database.binding==='TABLE_DB');
// Run after the build and node tests: preview reads published assets in place.
await writeFile(config,JSON.stringify({name:'opax-dt-votes-local',main:resolve('test/dt-votes-worker.mjs'),compatibility_date:'2026-09-01',compatibility_flags:['nodejs_compat'],
  assets:{directory:resolve('public'),binding:'ASSETS',run_worker_first:['/*']},
  d1_databases:[tableDatabase],
  vars:{INDEXNOW_ENABLED:'false',INDEXNOW_DRY_RUN:'true',VOICE_ENABLED:'false',COMMUNITY_ENABLED:'false',DAILY_POST_ENABLED:'false'}},null,2));
const log = await open(resolve(output,'wrangler.log'),'w');
const privacy = await tablePrivacyIndex();
let logging = Promise.resolve();
const server = spawn(process.execPath,['node_modules/wrangler/bin/wrangler.js','dev','--local','--config',config,'--persist-to',resolve('.wrangler/state'),'--ip','127.0.0.1','--port','8804'],{stdio:['ignore','pipe','pipe'],env:{...process.env,WRANGLER_SEND_METRICS:'false',X_LOCAL_OBSERVABILITY:'false',X_LOCAL_EXPLORER:'false'}});
for (const stream of [server.stdout,server.stderr]) createInterface({input:stream}).on('line',line=>{
  const safe = privacy.safe(line) && !/\b\d{11}\b/.test(line) ? line : '[private output omitted]';
  logging = logging.then(()=>log.write(safe+'\n'));
});
await writeFile(resolve(output,'wrangler.pid'),String(server.pid));
try {
  let ready = false;
  for (let attempt=0;attempt<120;attempt++) {
    if (server.exitCode != null) throw new Error('Local Wrangler exited; see private log');
    try {ready = (await fetch('http://127.0.0.1:8804/api/table/divisions?pageSize=1')).ok;} catch {}
    if (ready) break;
    await new Promise(r => setTimeout(r,500));
  }
  if (!ready) throw new Error('Local Wrangler did not become ready');
  for (const script of [process.env.DT_VOTES_BROWSER_SCRIPT || 'test/dt-votes-browser.mjs',...(process.env.DT_VOTES_CHIP_PROBE ? [process.env.DT_VOTES_CHIP_PROBE] : [])]) {
    const browser = spawn(process.execPath,[script],{stdio:'inherit',env:process.env});
    const code = await new Promise(r => browser.on('exit',r));
    process.exitCode = code || 0;
    if (code) break;
  }
} finally {
  server.kill('SIGINT');
  await new Promise(r => server.exitCode != null ? r() : server.on('exit',r));
  await logging;
  await log.close();
}
