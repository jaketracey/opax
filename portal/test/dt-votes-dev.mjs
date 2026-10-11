// Start and stop only this runner's Wrangler PID. Run the whole command in unshare -rn.
import {spawn, execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {mkdir, mkdtemp, rm, writeFile, open} from 'node:fs/promises';
import {resolve} from 'node:path';
import {seedVoteCaps} from './dt-votes-cap.mjs';
const output = resolve('private/dt-votes');
await mkdir(output,{recursive:true});
await seedVoteCaps(output);
const config = resolve(output,'wrangler-local.json');
// Test builders rewrite public exports; keep preview assets stable during downloads.
const snapshot = await mkdtemp(resolve(output,'assets-'));
await promisify(execFile)('cp',['-a','--reflink=auto',resolve('public')+'/.',snapshot]);
await writeFile(config,JSON.stringify({name:'opax-dt-votes-local',main:resolve('test/dt-votes-worker.mjs'),compatibility_date:'2026-09-01',compatibility_flags:['nodejs_compat'],
  assets:{directory:snapshot,binding:'ASSETS',run_worker_first:['/*']},
  d1_databases:[{binding:'TABLE_DB',database_name:'opax-tables',database_id:'00000000-0000-0000-0000-000000000000'}],
  vars:{INDEXNOW_ENABLED:'false',INDEXNOW_DRY_RUN:'true',VOICE_ENABLED:'false',COMMUNITY_ENABLED:'false',DAILY_POST_ENABLED:'false'}},null,2));
const log = await open(resolve(output,'wrangler.log'),'w');
const server = spawn(process.execPath,['node_modules/wrangler/bin/wrangler.js','dev','--local','--config',config,'--persist-to',resolve('.wrangler/state'),'--ip','127.0.0.1','--port','8804'],{stdio:['ignore',log.fd,log.fd],env:{...process.env,WRANGLER_SEND_METRICS:'false'}});
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
  const browser = spawn(process.execPath,['test/dt-votes-browser.mjs'],{stdio:'inherit',env:process.env});
  const code = await new Promise(r => browser.on('exit',r));
  process.exitCode = code || 0;
} finally {
  server.kill('SIGINT');
  await new Promise(r => server.exitCode != null ? r() : server.on('exit',r));
  await log.close();
  await rm(snapshot,{recursive:true,force:true});
}
