import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,writeFileSync,readFileSync,rmSync,existsSync,cpSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {spawnSync} from 'node:child_process';
import {snapshot,git,gateCommit,gateBase,identity,cacheKey,cleanCheckout,reusable,persistPass,selectTests,quote,catalogKey} from '../gate-lib.mjs';
import {authoritative,importPass,pullPass,publishPass,claimPass,compactPass} from '../gate-cache-lib.mjs';
const tools=resolve(import.meta.dirname,'..');
// Child fixture repositories must not inherit the real gate's transferred
// identity, shared cache or SSH registry. Each test owns its own inputs/storage.
delete process.env.OX_GATE_EXPECTED_ID;delete process.env.OX_GATE_CACHE;
process.env.OX_GATE_REMOTE='0';process.env.OX_GATE_DESKTOP='0';
function fixture(t){const root=mkdtempSync(join(tmpdir(),'opax-gate-test-'));t.after(()=>rmSync(root,{recursive:true,force:true}));return root;}
function repo(t){const root=fixture(t);git(root,['init','-q']);git(root,['config','user.name','Fixture']);git(root,['config','user.email','fixture@example.invalid']);mkdirSync(join(root,'portal/test'),{recursive:true});writeFileSync(join(root,'portal/package-lock.json'),'{}');writeFileSync(join(root,'.gitignore'),'.ops/gate-cache/\n');git(root,['add','.']);git(root,['commit','-qm','fixture']);return root;}
function heavy(root,args,env={}){return spawnSync('bash',[join(tools,'ox-heavy.sh'),...args],{encoding:'utf8',env:{...process.env,OX_HEAVY_LOCAL:'1',OX_HEAVY_LOCK:join(root,'lock'),OX_HEAVY_WAIT:'0',...env}});}
function fullReceipt(id){return {schema:2,identity:id,tier:'merge',success:true,host:'fixture',selection:{files:['portal/test/fixture.test.mjs'],total:1},steps:['scripts-tests','install','runtime-types','shell','release','check','tests-6','dry-run'].map(name=>({name,code:0})),test:{files:[{file:'test/fixture.test.mjs',success:true}],summary:{success:true,counts:{tests:1,passed:1,failed:0,cancelled:0,skipped:0}}}};}
test('snapshot includes unstaged, staged and new source without changing real index; ignores cache',t=>{
 const root=repo(t),before=git(root,['write-tree']);writeFileSync(join(root,'portal/package-lock.json'),'{"new":true}');writeFileSync(join(root,'new.mjs'),'new');mkdirSync(join(root,'.ops/gate-cache'),{recursive:true});writeFileSync(join(root,'.ops/gate-cache/log'),'ignored');
 const tree=snapshot(root);assert.notEqual(tree,before);assert.equal(git(root,['write-tree']),before);assert.match(git(root,['ls-tree','-r','--name-only',tree]),/new.mjs/);assert.doesNotMatch(git(root,['ls-tree','-r','--name-only',tree]),/gate-cache/);
});
test('cache binds successful full pass to tree, Node and lockfile; lane passes cannot satisfy review',()=>{
 const id={tree:'abc',node:'v24.21.0',lockfile:'123'},full={identity:id,tier:'merge',success:true};assert.ok(reusable(full,id,'review'));assert.ok(reusable(full,id,'lane'));for(const field of Object.keys(id))assert.ok(!reusable(full,{...id,[field]:'changed'},'review'));assert.ok(!reusable({...full,success:false},id,'review'));assert.ok(!reusable({...full,tier:'lane'},id,'review'));assert.ok(!reusable({...full,tier:'lane',base:'a'},id,'lane','b'));
});
test('trusted receipts reject partial, incomplete, failed, skipped and different toolchain evidence',t=>{
 const root=repo(t),id=identity(root),pass=fullReceipt(id),file=join(root,'.ops/gate-cache/pass.json');
 assert.ok(authoritative(pass,id));assert.deepEqual(importPass(file,pass,id),pass);
 for(const field of ['tree','node','lockfile','runner'])assert.ok(!authoritative(pass,{...id,[field]:'changed'}));
 for(const mutate of [r=>r.tier='lane',r=>r.success=false,r=>r.schema=1,r=>r.steps.pop(),r=>r.steps[0].code=1,r=>r.selection.total=2,r=>r.test.files[0].success=false,r=>r.test.summary.counts.skipped=1,r=>r.test.summary.counts.cancelled=1]){
  const invalid=structuredClone(pass);mutate(invalid);assert.ok(!authoritative(invalid,id));assert.throws(()=>importPass(file,invalid,id));assert.deepEqual(JSON.parse(readFileSync(file)),pass);
 }
});
test('a full desktop receipt imports into a different commit with identical tree and verifies for CI',t=>{
 const root=repo(t),id=identity(root),pass=fullReceipt(id),receipt=join(root,'.ops/gate-cache/receipt.json');mkdirSync(join(root,'.ops/gate-cache'),{recursive:true});writeFileSync(receipt,JSON.stringify(pass));
 git(root,['commit','--allow-empty','-qm','same tree different commit']);assert.deepEqual(identity(root),id);
 const env={...process.env,OX_GATE_REMOTE:'0'};delete env.NODE_TEST_CONTEXT;
 const run=args=>spawnSync(process.execPath,[join(tools,'gate-cache.mjs'),...args],{cwd:root,env,encoding:'utf8'});
 assert.equal(run(['import',receipt]).status,0);assert.equal(run(['verify']).status,0);
 const output=join(root,'.ops/gate-cache/export.json');assert.equal(run(['export',output]).status,0);assert.deepEqual(JSON.parse(readFileSync(output)),JSON.parse(JSON.stringify(compactPass(pass))));
 writeFileSync(join(root,'portal/new.mjs'),'new source');assert.notEqual(run(['verify']).status,0);
});
test('Mac publishes a complete pass atomically and desktop/CI pull the same identity over authenticated SSH',t=>{
 const root=repo(t),id=identity(root),pass=fullReceipt(id),bin=join(root,'.ops/gate-cache/bin'),sent=join(root,'.ops/gate-cache/sent'),argsFile=join(root,'.ops/gate-cache/args');mkdirSync(bin,{recursive:true});
 writeFileSync(join(bin,'ssh'),'#!/usr/bin/env bash\nprintf "%s\\n" "$@" > "$OX_TEST_REGISTRY_ARGS"\nlast="${@: -1}"\nif [[ "$last" = cat* ]]; then cat "$OX_TEST_REGISTRY_RECEIPT"; else cat > "$OX_TEST_REGISTRY_SENT"; fi\n',{mode:0o755});
 const receipt=join(root,'.ops/gate-cache/receipt');writeFileSync(receipt,JSON.stringify(pass));
 const before={PATH:process.env.PATH,OX_TEST_REGISTRY_ARGS:process.env.OX_TEST_REGISTRY_ARGS,OX_TEST_REGISTRY_SENT:process.env.OX_TEST_REGISTRY_SENT,OX_TEST_REGISTRY_RECEIPT:process.env.OX_TEST_REGISTRY_RECEIPT};
 Object.assign(process.env,{PATH:bin+':'+process.env.PATH,OX_TEST_REGISTRY_ARGS:argsFile,OX_TEST_REGISTRY_SENT:sent,OX_TEST_REGISTRY_RECEIPT:receipt});
 try{assert.ok(publishPass(pass,'fixture'));assert.deepEqual(JSON.parse(readFileSync(sent)),JSON.parse(JSON.stringify(compactPass(pass))));assert.match(readFileSync(argsFile,'utf8'),/mktemp/);assert.doesNotMatch(readFileSync(argsFile,'utf8'),/heavy.lock/);
  assert.deepEqual(pullPass(join(root,'.ops/gate-cache'),id,'fixture'),pass);assert.match(readFileSync(argsFile,'utf8'),new RegExp(cacheKey(id)));
 }finally{for(const [key,value]of Object.entries(before))if(value===undefined)delete process.env[key];else process.env[key]=value;}
});
test('a transferred Node or source identity mismatch fails before builds or cache reuse',t=>{
 const root=repo(t);git(root,['update-ref','refs/remotes/origin/main',git(root,['rev-parse','HEAD'])]);
 const env={...process.env,OX_GATE_REMOTE:'0',OX_GATE_EXPECTED_ID:JSON.stringify({...identity(root),node:'v26.0.0'})};delete env.NODE_TEST_CONTEXT;
 const result=spawnSync(process.execPath,[join(tools,'web-gates.mjs'),'merge','--cache-only'],{cwd:root,env,encoding:'utf8'});assert.notEqual(result.status,0);assert.match(result.stderr,/Transferred tree\/toolchain identity/);assert.doesNotMatch(result.stdout,/CACHED PASS|== install/);
});
test('CI consumes a Mac/desktop receipt without entering a heavy queue or rerunning tests',t=>{
 const root=repo(t);mkdirSync(join(root,'portal/public'));writeFileSync(join(root,'portal/public/votes.json'),'{"_meta":{"schema":1}}');git(root,['add','.']);git(root,['commit','-qm','CI votes fixture']);
 const id=identity(root),pass=fullReceipt(id),env={...process.env,OX_GATE_RECEIPT_JSON:JSON.stringify(compactPass(pass))};delete env.NODE_TEST_CONTEXT;
 const run=()=>spawnSync('bash',[join(tools,'ci-gates.sh')],{cwd:root,env,encoding:'utf8'});
 const result=run();assert.equal(result.status,0,result.stderr);assert.match(result.stdout,/IMPORTED PASS/);assert.match(result.stdout,/CACHED PASS/);assert.doesNotMatch(result.stdout,/== install|== tests|Selected/);
 assert.ok(authoritative(JSON.parse(readFileSync(join(root,'.ops/gate-cache/ci-pass.json'))),id));
 writeFileSync(join(root,'portal/untracked.mjs'),'changed CI source');const mismatch=run();assert.notEqual(mismatch.status,0);assert.doesNotMatch(mismatch.stdout,/CACHED PASS/);
});
test('per-tree claims wait for a live owner, release on EOF, clear dead owners and preserve ownerless claims',async t=>{
 const directory=fixture(t),id={tree:'fixture'},lock=join(directory,'claims',cacheKey(id)+'.lock'),options={host:null,local:true,directory,wait:3};
 const release=await claimPass(id,options);t.after(release);const owner=readFileSync(join(lock,'pid'),'utf8');assert.ok(Number(owner)>0);
 let acquired=false;const second=claimPass(id,options).then(release=>{acquired=true;return release;});
 await new Promise(r=>setTimeout(r,100));assert.equal(acquired,false);assert.equal(readFileSync(join(lock,'pid'),'utf8'),owner);
 await release();const releaseSecond=await second;await releaseSecond();assert.ok(!existsSync(lock));
 mkdirSync(lock);writeFileSync(join(lock,'pid'),'999999999');const releaseDead=await claimPass(id,{...options,wait:0});await releaseDead();assert.ok(!existsSync(lock));
 mkdirSync(lock);await assert.rejects(claimPass(id,{...options,wait:0}),/timed out/);assert.ok(existsSync(lock));
});
test('tracked edits and changing untracked contents change the key; identical dirty inputs reuse a full pass',t=>{
 const root=repo(t),cache=join(root,'.ops/gate-cache');mkdirSync(cache,{recursive:true});
 mkdirSync(join(root,'portal/public'));writeFileSync(join(root,'portal/public/votes.json'),'{"_meta":{"schema":1}}');
 git(root,['add','.']);git(root,['commit','-qm','votes fixture']);
 const env={...process.env,OX_GATE_CACHE:cache,OX_GATE_REMOTE:'0'};delete env.NODE_TEST_CONTEXT;
 const run=()=>spawnSync(process.execPath,[join(tools,'web-gates.mjs'),'review','--base','HEAD','--cache-only'],{cwd:root,env,encoding:'utf8'});
 const save=()=>{const id=identity(root);writeFileSync(join(cache,cacheKey(id)+'.json'),JSON.stringify(fullReceipt(id)));return cacheKey(id);};
 const original=save(),index=git(root,['write-tree']);assert.match(run().stdout,/CACHED PASS/);
 writeFileSync(join(root,'portal/package-lock.json'),'{"modified":true}');assert.notEqual(cacheKey(identity(root)),original);assert.equal(run().status,3);
 save();assert.match(run().stdout,/CACHED PASS/);git(root,['add','portal/package-lock.json']);assert.match(run().stdout,/CACHED PASS/);
 git(root,['restore','--source=HEAD','--staged','--worktree','portal/package-lock.json']);
 const source=join(root,'portal/untracked-source.mjs');writeFileSync(source,'export const source=1');const first=save();
 assert.notEqual(first,original);assert.ok(!cleanCheckout(root));assert.match(run().stdout,/CACHED PASS/);
 writeFileSync(source,'export const source=2');assert.notEqual(cacheKey(identity(root)),first);assert.equal(run().status,3);
 save();assert.match(run().stdout,/CACHED PASS/);assert.equal(git(root,['write-tree']),index);
 rmSync(source);assert.equal(cacheKey(identity(root)),original);assert.match(run().stdout,/CACHED PASS/);
});
test('desktop snapshot transfers a captured base beyond HEAD into a local bare fixture, without changing source',t=>{
 const root=repo(t),head=git(root,['rev-parse','HEAD']),tree=git(root,['write-tree']);
 const base=git(root,['commit-tree',tree,'-p',head,'-m','another lane advanced main']);
 const commit=gateCommit(root,tree,base,'gate fixture'),remote=fixture(t);git(remote,['init','--bare','-q']);
 git(root,['push','--quiet',remote,commit+':refs/heads/gate/fixture']);
 assert.equal(git(remote,['cat-file','-t',base]),'commit');assert.equal(git(remote,['rev-parse','refs/heads/gate/fixture^{tree}']),tree);
 assert.equal(git(root,['rev-parse','HEAD']),head);assert.equal(git(root,['write-tree']),tree);
});
test('lane scope ignores other lanes advancing main; candidates and explicit bases use the captured ref',t=>{
 const root=repo(t),head=git(root,['rev-parse','HEAD']),tree=git(root,['write-tree']);
 const advanced=git(root,['commit-tree',tree,'-p',head,'-m','new main']);git(root,['update-ref','refs/remotes/origin/main',advanced]);
 assert.equal(gateBase(root,'lane'),head);assert.equal(gateBase(root,'merge'),advanced);assert.equal(gateBase(root,'review'),advanced);
 assert.equal(gateBase(root,'lane',tree),tree);assert.equal(git(root,['rev-parse','HEAD']),head);
});
test('forced narrow results preserve a full pass; changed identities and failures never reuse it',t=>{
 const file=join(fixture(t),'pass.json'),id={tree:'first',node:'v24.21.0',lockfile:'lock',runner:'tools'};
 const full={identity:id,tier:'merge',success:true};assert.ok(persistPass(file,full));
 assert.equal(persistPass(file,{...full,tier:'lane',base:'base'}),false);assert.deepEqual(JSON.parse(readFileSync(file)),full);
 assert.equal(persistPass(file,{...full,success:false}),false);assert.deepEqual(JSON.parse(readFileSync(file)),full);
 const changed={...full,identity:{...id,tree:'second'},tier:'lane',base:'base'};assert.ok(persistPass(file,changed));
 assert.ok(!reusable(JSON.parse(readFileSync(file)),changed.identity,'review'));
});
test('served Markdown participates in affected selection while documentation stays smoke-only',t=>{
 const root=repo(t);mkdirSync(join(root,'portal/public'));writeFileSync(join(root,'portal/public/methods.md'),'served content');
 writeFileSync(join(root,'portal/test/content.test.mjs'),"new URL('../public/methods.md',import.meta.url)");writeFileSync(join(root,'portal/test/smoke.test.mjs'),'');writeFileSync(join(root,'portal/test/unrelated.test.mjs'),'');
 const config={smoke:['portal/test/smoke.test.mjs'],map:[]};assert.deepEqual(selectTests(root,['portal/public/methods.md'],config).files,['portal/test/content.test.mjs','portal/test/smoke.test.mjs']);
 assert.deepEqual(selectTests(root,['briefs/note.md'],config).files,['portal/test/smoke.test.mjs']);
 assert.equal(selectTests(root,['portal/public/unmapped.md'],config).files.length,3);
});
test('affected selection follows transitive imports, URL/fs references, deletions and smoke; unknown falls back to full',t=>{
 const root=repo(t);mkdirSync(join(root,'portal/public'));writeFileSync(join(root,'portal/public/leaf.js'),'export const x=1');writeFileSync(join(root,'portal/public/parent.js'),"import './leaf.js'");for(const [file,content]of [['a',"import '../public/parent.js'"],['b',"new URL('../public/view.html',import.meta.url)"],['smoke','']])writeFileSync(join(root,'portal/test',file+'.test.mjs'),content);
 const config={smoke:['portal/test/smoke.test.mjs'],map:[]};assert.deepEqual(selectTests(root,['portal/public/leaf.js'],config).files,['portal/test/a.test.mjs','portal/test/smoke.test.mjs']);assert.equal(selectTests(root,['portal/public/deleted.js'],config).files.length,3);assert.equal(selectTests(root,['new/unmapped.js'],config).files.length,3);assert.equal(selectTests(root,['briefs/note.md'],config).files.length,1);assert.throws(()=>selectTests(root,[],{...config,smoke:['missing']}));
});
test('a matching map rule with zero targets requires every file and gives a reason even with another resolved rule',t=>{
 const root=repo(t);for(const file of ['smoke','current','unrelated'])writeFileSync(join(root,'portal/test',file+'.test.mjs'),'');
 const config={smoke:['portal/test/smoke.test.mjs'],map:[{pattern:'^portal/public/feature.js$',tests:['renamed-away\\.test']},{pattern:'^portal/public/feature.js$',tests:['current\\.test']}]};
 const selection=selectTests(root,['portal/public/feature.js'],config);assert.equal(selection.files.length,3);assert.equal(selection.affected.length,3);
 assert.deepEqual(selection.reasons,['Map rule for portal/public/feature.js matched zero test files; full suite required']);
});
test('documentation-only lanes include every current and newly added donor, privacy and table file',t=>{
 const config=JSON.parse(readFileSync(join(tools,'gate-map.json')));
 const realRoot=git(process.cwd(),['rev-parse','--show-toplevel']),selection=selectTests(realRoot,['briefs/note.md'],config);
 for(const file of selectTests(realRoot,['unmapped/source'],config).files.filter(file=>/donor|privacy|table|dt-votes/.test(file)))assert.ok(selection.files.includes(file),file);
 assert.ok(selection.files.includes('portal/test/donor-view-index.test.mjs'));
 const root=repo(t);for(const file of ['donor-new','new-privacy','table-new','datatable-new','dt-votes-new','unrelated'])writeFileSync(join(root,'portal/test',file+'.test.mjs'),'');
 const added=selectTests(root,['briefs/note.md'],{...config,smoke:[]});assert.equal(added.files.length,5);assert.ok(!added.files.includes('portal/test/unrelated.test.mjs'));
});
test('local lock stores owner PID, preserves status and clears on normal completion',t=>{const root=fixture(t);const run=heavy(root,['bash','-c','test -s "$OX_HEAVY_LOCK/pid"; exit 17']);assert.equal(run.status,17);assert.ok(!existsSync(join(root,'lock')));});
test('dead owner clears; live owner and ownerless locks remain untouched',t=>{const root=fixture(t);mkdirSync(join(root,'lock'));writeFileSync(join(root,'lock/pid'),'999999999');assert.equal(heavy(root,['true']).status,0);mkdirSync(join(root,'lock'));writeFileSync(join(root,'lock/pid'),String(process.pid));assert.equal(heavy(root,['true']).status,75);assert.equal(readFileSync(join(root,'lock/pid'),'utf8'),String(process.pid));rmSync(join(root,'lock/pid'));assert.equal(heavy(root,['true']).status,75);assert.ok(existsSync(join(root,'lock')));});
test('shell quoting preserves spaces, quotes and literal substitutions',()=>{const value="a ' b $(false) `false`";assert.equal(spawnSync('bash',['-c',`printf %s ${quote(value)}`],{encoding:'utf8'}).stdout,value);});
test('desktop availability never routes deploy, local asset builds or arbitrary shell commands',()=>{for(const command of [['npm','run','deploy'],['npm','run','build:release'],['npx','wrangler','deploy'],['bash','-c','npm test']]){const run=spawnSync('node',[join(tools,'heavy-remote.mjs'),'--available',...command],{encoding:'utf8'});assert.equal(run.status,1);}});
test('desktop probes use an independent SSH connection with protocol keepalives',t=>{
 const root=fixture(t),log=join(root,'ssh-args');writeFileSync(join(root,'ssh'),'#!/usr/bin/env bash\nprintf "%s\\n" "$@" > "$OX_TEST_SSH_ARGS"\n',{mode:0o755});
 const run=spawnSync(process.execPath,[join(tools,'heavy-remote.mjs'),'--available','node','web-gates.mjs','merge'],{encoding:'utf8',env:{...process.env,PATH:root+':'+process.env.PATH,OX_TEST_SSH_ARGS:log}});
 assert.equal(run.status,0,run.stderr);const args=readFileSync(log,'utf8').split('\n');for(const option of ['ControlMaster=no','ControlPath=none','ServerAliveInterval=30','ServerAliveCountMax=3'])assert.ok(args.includes(option));
});
test('desktop carries the exact dirty snapshot identity without forcing a rerun',t=>{
 const root=repo(t),bin=join(root,'.ops/gate-cache/bin'),log=join(root,'.ops/gate-cache/remote-script');mkdirSync(bin,{recursive:true});
 git(root,['update-ref','refs/remotes/origin/main',git(root,['rev-parse','HEAD'])]);
 const realGit=spawnSync('which',['git'],{encoding:'utf8'}).stdout.trim();assert.ok(realGit);
 writeFileSync(join(bin,'git'),`#!/usr/bin/env bash\nif [ "$1" = push ]; then exit 0; fi\nexec ${quote(realGit)} "$@"\n`,{mode:0o755});
 writeFileSync(join(bin,'ssh'),'#!/usr/bin/env bash\nlast="${@: -1}"\nif [ "$last" = "bash -s" ]; then cat > "$OX_TEST_REMOTE_SCRIPT"; else cat > /dev/null; fi\n',{mode:0o755});
 const env={...process.env,PATH:bin+':'+process.env.PATH,OX_TEST_REMOTE_SCRIPT:log,OX_GATE_LABEL:'dirty-cache-fixture'};delete env.NODE_TEST_CONTEXT;
 const run=()=>{const result=spawnSync(process.execPath,[join(tools,'heavy-remote.mjs'),'--tier','merge'],{cwd:root,env,encoding:'utf8'});assert.equal(result.status,0,result.stderr);return readFileSync(log,'utf8');};
 assert.doesNotMatch(run(),/'--force'/);
 writeFileSync(join(root,'portal/package-lock.json'),'{"changed":true}');assert.doesNotMatch(run(),/'--force'/);
 git(root,['restore','portal/package-lock.json']);writeFileSync(join(root,'portal/untracked.mjs'),'source');assert.doesNotMatch(run(),/'--force'/);
});
test('busy Mac routes recognised gates, keeps owner unchanged and forwards remote exit; LOCAL override bypasses routing',t=>{
 const root=fixture(t),mockTools=join(root,'tools');mkdirSync(mockTools);cpSync(join(tools,'ox-heavy.sh'),join(mockTools,'ox-heavy.sh'));writeFileSync(join(mockTools,'ox-heavy-remote.sh'),'#!/usr/bin/env bash\nif [ "$1" = --available ]; then exit 0; fi\nexit 19\n',{mode:0o755});mkdirSync(join(root,'lock'));writeFileSync(join(root,'lock/pid'),String(process.pid));
 // Simulate the Mac explicitly; the real desktop intentionally stays local.
 writeFileSync(join(mockTools,'uname'),'#!/usr/bin/env bash\nprintf Darwin\\n',{mode:0o755});
 const env={...process.env,PATH:mockTools+':'+process.env.PATH,OX_HEAVY_LOCK:join(root,'lock'),OX_HEAVY_WAIT:'0',OX_HEAVY_LOCAL:'0'};
 assert.equal(spawnSync('bash',[join(mockTools,'ox-heavy.sh'),'node','web-gates.mjs','merge'],{env}).status,19);assert.equal(readFileSync(join(root,'lock/pid'),'utf8'),String(process.pid));
 assert.equal(spawnSync('bash',[join(mockTools,'ox-heavy.sh'),'true'],{env:{...env,OX_HEAVY_LOCAL:'1'}}).status,75);
});
test('an unavailable desktop falls back to the original Mac waiting protocol',t=>{
 const root=fixture(t),mockTools=join(root,'tools');mkdirSync(mockTools);cpSync(join(tools,'ox-heavy.sh'),join(mockTools,'ox-heavy.sh'));writeFileSync(join(mockTools,'ox-heavy-remote.sh'),'#!/usr/bin/env bash\nexit 1\n',{mode:0o755});mkdirSync(join(root,'lock'));writeFileSync(join(root,'lock/pid'),String(process.pid));
 assert.equal(spawnSync('bash',[join(mockTools,'ox-heavy.sh'),'true'],{env:{...process.env,OX_HEAVY_LOCK:join(root,'lock'),OX_HEAVY_WAIT:'0',OX_HEAVY_LOCAL:'0'}}).status,75);assert.equal(readFileSync(join(root,'lock/pid'),'utf8'),String(process.pid));
});
test('explicitly staged files survive a local exclude rule in the snapshot',t=>{
 const root=repo(t);writeFileSync(join(root,'.git/info/exclude'),'hidden/\n');mkdirSync(join(root,'hidden'));writeFileSync(join(root,'hidden/new.mjs'),'new');git(root,['add','-f','hidden/new.mjs']);assert.match(git(root,['ls-tree','-r','--name-only',snapshot(root)]),/hidden\/new.mjs/);
});
test('reporter uses parent file duration and records failed global summaries',async()=>{
 const {default:reporter}=await import('../gate-reporter.mjs');const file=join(process.cwd(),'fixture.test.mjs');async function* events(){yield{type:'test:summary',data:{file,duration_ms:1250,success:true,counts:{tests:2}}};yield{type:'test:complete',data:{file,name:file,nesting:0,details:{duration_ms:1500}}};yield{type:'test:summary',data:{duration_ms:1600,success:false,counts:{tests:2,passed:1,failed:1,skipped:0}}};}
 let out='';for await(const value of reporter(events()))out+=value;assert.match(out,/FILE fixture.test.mjs 1.500s PASS/);assert.match(out,/TESTS 2 PASS 1 FAIL 1/);
});
test('real reporter includes time awaiting top-level fixture setup',t=>{
 const root=fixture(t),file=join(root,'setup.test.mjs'),empty=join(root,'module.test.mjs'),report=join(root,'report.json');writeFileSync(file,'import test from "node:test"; await new Promise(r=>setTimeout(r,70)); test("fixture",()=>{});');writeFileSync(empty,'import assert from "node:assert/strict"; assert.equal(1+1,2);');
 const env={...process.env,OX_GATE_REPORT:report};delete env.NODE_TEST_CONTEXT;
 const run=spawnSync(process.execPath,['--test','--test-reporter='+join(tools,'gate-reporter.mjs'),'setup.test.mjs','module.test.mjs'],{cwd:root,encoding:'utf8',env});assert.equal(run.status,0,run.stderr);const result=JSON.parse(readFileSync(report)),setup=result.files.find(f=>f.file==='setup.test.mjs');assert.ok(setup.duration_ms>=70);assert.ok(setup.duration_ms>setup.test_duration_ms);assert.equal(result.files.length,2);assert.ok(result.files.every(f=>f.success));
});
test('catalog cache binds exports, source registries and transitive builder imports; presentation-only changes can reuse fixtures',t=>{
 const root=repo(t);mkdirSync(join(root,'scripts'));mkdirSync(join(root,'portal/public'));mkdirSync(join(root,'portal/src'));writeFileSync(join(root,'scripts/build_search_catalog.mjs'),"import '../portal/public/catalog-reader.mjs'");writeFileSync(join(root,'portal/public/catalog-reader.mjs'),'export const x=1');writeFileSync(join(root,'portal/public/export.json'),'{}');writeFileSync(join(root,'portal/src/donor-withheld.json'),'{}');writeFileSync(join(root,'scripts/catalog-config.json'),'{}');
 const key=()=>catalogKey(root,identity(root));const initial=key();writeFileSync(join(root,'portal/public/navigation.js'),'presentation');assert.equal(key(),initial);writeFileSync(join(root,'portal/public/export.json'),'{"new":true}');assert.notEqual(key(),initial);writeFileSync(join(root,'portal/public/export.json'),'{}');assert.equal(key(),initial);
 for(const file of ['portal/src/donor-withheld.json','scripts/catalog-config.json']){writeFileSync(join(root,file),'{"new":true}');assert.notEqual(key(),initial);writeFileSync(join(root,file),'{}');assert.equal(key(),initial);}
 writeFileSync(join(root,'portal/public/catalog-reader.mjs'),'export const x=2');assert.notEqual(key(),initial);
});
test('a narrow CLI gate executes every privacy case and supplies the full publication corpus',t=>{
 const root=repo(t),localTools=join(root,'.ops/tools'),bin=join(root,'.ops/gate-cache/bin');
 mkdirSync(localTools,{recursive:true});cpSync(tools,localTools,{recursive:true});mkdirSync(bin,{recursive:true});mkdirSync(join(root,'scripts'));mkdirSync(join(root,'portal/public'));
 const config={smoke:['portal/test/donor-privacy.test.mjs','portal/test/donor-publication.test.mjs'],smokePatterns:{'portal/test/donor-privacy.test.mjs':'^case 0$'},smokeMinimum:{'portal/test/donor-privacy.test.mjs':1},fullBuildPatterns:[],builders:[],laneFixtures:['build:crawl','build:vic-election'],map:[]};
 writeFileSync(join(localTools,'gate-map.json'),JSON.stringify(config));
 writeFileSync(join(root,'portal/test/donor-privacy.test.mjs'),'import test from "node:test"; import assert from "node:assert/strict"; import {readFileSync} from "node:fs"; for(let i=0;i<26;i++)test("case "+i,()=>{if(i===0){for(const file of ["crawl/indexnow.json","hubs/vic-election-2026.json"])assert.ok(JSON.parse(readFileSync(new URL("../public/"+file,import.meta.url))).fixture);}});');
 writeFileSync(join(root,'portal/test/donor-publication.test.mjs'),'import test from "node:test"; import assert from "node:assert/strict"; test("full corpus",()=>assert.ok(!process.env.OX_GATE_PUBLICATION_CHANGED));');
 writeFileSync(join(root,'portal/test/unrelated.test.mjs'),'import test from "node:test"; test("unrelated",()=>{});');
 writeFileSync(join(root,'portal/public/votes.json'),'{"_meta":{"schema":1}}');
 for(const file of ['build_spa_shell.mjs','stamp_assets.mjs'])writeFileSync(join(root,'scripts',file),'');
 writeFileSync(join(root,'scripts/build_search_catalog.mjs'),'import {mkdirSync,writeFileSync} from "node:fs"; const dir=new URL("../portal/public/search-catalog/",import.meta.url); mkdirSync(dir,{recursive:true});writeFileSync(new URL("index.json",dir),"{}");');
 for(const [script,file] of [['build_crawl_catalog.mjs','crawl/indexnow.json'],['build_vic_election.mjs','hubs/vic-election-2026.json']])writeFileSync(join(root,'scripts',script),`import {mkdirSync,writeFileSync} from 'node:fs';const target=new URL('../portal/public/${file}',import.meta.url);mkdirSync(new URL('.',target),{recursive:true});writeFileSync(target,JSON.stringify({fixture:true}));`);
 writeFileSync(join(bin,'npx'),'#!/usr/bin/env bash\nexit 0\n',{mode:0o755});
 writeFileSync(join(bin,'npm'),`#!/usr/bin/env bash\nif [ "$1" = run ]; then\ncase "$2" in\nbuild:crawl) exec ${quote(process.execPath)} ../scripts/build_crawl_catalog.mjs ;;\nbuild:vic-election) exec ${quote(process.execPath)} ../scripts/build_vic_election.mjs ;;\nesac\nfi\nexit 0\n`,{mode:0o755});
 writeFileSync(join(bin,'node'),`#!/usr/bin/env bash\nif [ "$1" = --test ] && [[ "$2" = */test/gates.test.mjs ]]; then exit 0; fi\nexec ${quote(process.execPath)} "$@"\n`,{mode:0o755});
 git(root,['add','.']);git(root,['commit','-qm','complete privacy CLI fixture']);
 const env={...process.env,PATH:bin+':'+process.env.PATH};delete env.NODE_TEST_CONTEXT;delete env.OX_GATE_CACHE;delete env.OX_GATE_PUBLICATION_CHANGED;
 const result=spawnSync(process.execPath,[join(localTools,'web-gates.mjs'),'lane','--base','HEAD','--force'],{cwd:root,encoding:'utf8',env});
 assert.equal(result.status,0,result.stderr+'\n'+result.stdout);assert.match(result.stdout,/Selected 2\/3 files/);assert.match(result.stdout,/TESTS 27 PASS 27 FAIL 0 SKIP 0/);
});
