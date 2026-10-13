import {spawn} from 'node:child_process';
import {mkdirSync,readFileSync,writeFileSync,existsSync,rmSync,cpSync,renameSync,readdirSync} from 'node:fs';
import {join,resolve} from 'node:path';
import {performance} from 'node:perf_hooks';
import {git,gateBase,identity,cacheKey,cleanCheckout,reusable,persistPass,selectTests,catalogKey,hash} from './gate-lib.mjs';

const args=process.argv.slice(2), tier=args.shift()||'lane';
const tools=import.meta.dirname;
if(!['lane','merge','review','profile'].includes(tier))throw Error('Usage: web-gates.sh lane|merge|review|profile [--force] [--base REF] [--concurrency N]');
const value=(name,fallback)=>args.includes(name)?args[args.indexOf(name)+1]:fallback;
const root=git(process.cwd(),['rev-parse','--show-toplevel']);
const base=gateBase(root,tier,value('--base'));
const concurrency=Number(value('--concurrency',process.env.OX_TEST_CONCURRENCY||(process.platform==='linux'?'6':'4')));
if(!Number.isInteger(concurrency)||concurrency<1||concurrency>16)throw Error('Concurrency must be 1..16');
const started=performance.now(), id=identity(root), key=cacheKey(id);
const clean=cleanCheckout(root);
const cache=resolve(process.env.OX_GATE_CACHE||join(root,'.ops/gate-cache'));mkdirSync(cache,{recursive:true});
const passFile=join(cache,`${key}.json`);
let previous;try{previous=JSON.parse(readFileSync(passFile));}catch{}
if(clean&&!args.includes('--force')&&tier!=='profile'&&reusable(previous,id,tier,base)){
 git(root,['diff','--exit-code',base,id.tree,'--','portal/public/votes.json'],{stdio:'pipe'});
 console.log(`CACHED PASS ${id.tree} ${id.node} ${id.lockfile} (${previous.tier}, ${previous.host})`);process.exit(0);
}
if(!clean)console.log('CACHE BYPASS: working tree has tracked changes or untracked files');
if(args.includes('--cache-only'))process.exit(3);
const matrix=value('--matrix',String(concurrency)).split(',').map(Number);
if(matrix.some(n=>!Number.isInteger(n)||n<1||n>16))throw Error('Matrix concurrency must be 1..16');
const commit=git(root,['commit-tree',id.tree,'-p','HEAD','-m','Isolated web gate snapshot']);
const work=join(cache,`work-${key.slice(0,16)}-${process.pid}`);
const output=join(cache,`run-${Date.now()}-${tier}`);mkdirSync(output);
const record={identity:id,base,tier:tier==='lane'?'lane':'merge',profiling:tier==='profile',host:process.platform,concurrency,success:false,steps:[]};
let failure;
const inventory=dir=>readdirSync(dir,{withFileTypes:true}).flatMap(e=>e.isDirectory()?inventory(join(dir,e.name)).map(([file,digest])=>[e.name+'/'+file,digest]):[[e.name,hash(readFileSync(join(dir,e.name)))]]).sort(([a],[b])=>a.localeCompare(b));
async function searchFixtures(){
 const key=catalogKey(work,id),saved=join(cache,'catalog-'+key),target=join(work,'portal/public/search-catalog');
 try {
   const meta=JSON.parse(readFileSync(join(saved,'inventory.json')));
   if(meta.key===key&&JSON.stringify(meta.files)===JSON.stringify(inventory(join(saved,'files')))){
     rmSync(target,{recursive:true,force:true});cpSync(join(saved,'files'),target,{recursive:true});console.log('search-fixtures: cached build inputs PASS');record.steps.push({name:'search-fixtures',seconds:0,code:0,cached:true});return;
   }
 }catch{}
 await run('search-fixtures','node',['../scripts/build_search_catalog.mjs']);
 const temp=saved+'.'+process.pid;mkdirSync(temp);cpSync(target,join(temp,'files'),{recursive:true});writeFileSync(join(temp,'inventory.json'),JSON.stringify({key,files:inventory(join(temp,'files'))}));
 if(existsSync(saved))rmSync(saved,{recursive:true,force:true});renameSync(temp,saved);
}
async function run(name,cmd,argv,env={}) {
 console.log(`== ${name}`);const then=performance.now();
 const log=join(output,name+'.log');
 // The desktop's host loopback has additional aliases. Give workerd's local
 // sockets a clean loopback without changing host networking or other jobs.
 if(process.platform==='linux'&&/^(?:runtime-types|check|tests)/.test(name)){
   argv=['-Urn','sh','-c','ip link set lo up; exec "$@"','opax-gate',cmd,...argv];cmd='unshare';
 }
 const {createWriteStream}=await import('node:fs');const stream=createWriteStream(log);
 const code=await new Promise((done,reject)=>{const child=spawn(cmd,argv,{cwd:join(work,'portal'),env:{...process.env,WRANGLER_SEND_METRICS:'false',...env},stdio:['ignore','pipe','pipe']});
   child.stdout.on('data',data=>{stream.write(data);if(name.startsWith('tests'))process.stdout.write(data);});child.stderr.on('data',data=>stream.write(data));child.on('error',reject);child.on('close',done);
 });await new Promise(done=>stream.end(done));
 record.steps.push({name,seconds:(performance.now()-then)/1000,code});
 console.log(`${name}: ${code===0?'PASS':'FAIL'} ${record.steps.at(-1).seconds.toFixed(2)}s`);
 if(code!==0)throw Error(`${name} exited ${code}; log ${log}`);
}
try{
 git(root,['worktree','add','--quiet','--detach',work,commit]);
 const config=JSON.parse(readFileSync(join(tools,'gate-map.json')));
 const changed=git(work,['diff','--name-only',base,id.tree]).split('\n').filter(Boolean);
 const selection=selectTests(work,tier==='lane'?changed:['portal/package.json'],config);
 record.selection=selection;console.log(`Selected ${selection.files.length}/${selection.total} files`);for(const reason of selection.reasons)console.log(reason);
 await run('scripts-tests','node',['--test',join(tools,'test/gates.test.mjs')]);
 await run('install','npm',['ci','--no-audit','--no-fund']);
 await run('runtime-types','npx',['--no-install','wrangler','types']);
 // Merge/fallback: build every deploy writer. Narrow lanes regenerate only the
 // ignored search fixtures, then stamp; untouched served assets are the snapshot.
 await run('shell','node',['../scripts/build_spa_shell.mjs']);
 const full=tier!=='lane'||selection.files.length===selection.total||changed.some(f=>config.fullBuildPatterns.some(pattern=>new RegExp(pattern).test(f)));
 if(full)await run('release','npm',['run','build:release']);
 else {
   for(const builder of config.builders)if(changed.some(f=>new RegExp(builder.pattern).test(f)))await run(builder.script.replace(':','-'),'npm',['run',builder.script]);
   await searchFixtures();
   await run('stamp','node',['../scripts/stamp_assets.mjs']);
 }
 await run('check','npm',['run','check']);
 const reporter=join(tools,'gate-reporter.mjs');
 record.profiles=[];
 for(const limit of matrix){
   const report=join(output,`profile-${limit}.json`);
   await run(`tests-${limit}`,'node',['--test',`--test-concurrency=${limit}`,`--test-reporter=${reporter}`,...selection.files.map(f=>f.replace(/^portal\//,''))],{OX_GATE_REPORT:report});
   record.test=JSON.parse(readFileSync(report));record.profiles.push({concurrency:limit,...record.test});
   if(!record.test.summary?.success || record.test.files.length!==selection.files.length)throw Error('Missing/failed test summaries');
 }
 await run('dry-run','npx',['--no-install','wrangler','deploy','--dry-run']);
 // The gate uses the captured base, never fetches or advances main during a run.
 git(work,['diff','--exit-code',base,'--','portal/public/votes.json'],{stdio:'pipe'});
 const votes=JSON.parse(readFileSync(join(work,'portal/public/votes.json')));if(votes._meta?.schema!==1)throw Error('votes.json must stay schema 1');
 if(identity(root).tree!==id.tree)throw Error('Source tree changed while gate ran; pass is not reusable');
 record.success=true;
 if(full&&selection.files.length===selection.total)record.tier='merge';
}catch(error){failure=error;console.error(error.message);}
finally{
 record.seconds=(performance.now()-started)/1000;
 writeFileSync(join(output,'result.json'),JSON.stringify(record,null,2)+'\n');
 if(record.success&&cleanCheckout(root))persistPass(passFile,record);
 if(existsSync(work))git(root,['worktree','remove','--force',work]);
 console.log(`GATES ${record.success?'OK':'FAILED'} ${record.seconds.toFixed(2)}s tree=${id.tree}; ${output}`);
}
process.exitCode=failure?1:0;
