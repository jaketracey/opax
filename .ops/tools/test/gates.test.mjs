import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,writeFileSync,readFileSync,rmSync,existsSync,cpSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {spawnSync} from 'node:child_process';
import {snapshot,git,identity,cacheKey,reusable,selectTests,quote,catalogKey} from '../gate-lib.mjs';
const tools=resolve(import.meta.dirname,'..');
function fixture(t){const root=mkdtempSync(join(tmpdir(),'opax-gate-test-'));t.after(()=>rmSync(root,{recursive:true,force:true}));return root;}
function repo(t){const root=fixture(t);git(root,['init','-q']);git(root,['config','user.name','Fixture']);git(root,['config','user.email','fixture@example.invalid']);mkdirSync(join(root,'portal/test'),{recursive:true});writeFileSync(join(root,'portal/package-lock.json'),'{}');writeFileSync(join(root,'.gitignore'),'.ops/gate-cache/\n');git(root,['add','.']);git(root,['commit','-qm','fixture']);return root;}
function heavy(root,args,env={}){return spawnSync('bash',[join(tools,'ox-heavy.sh'),...args],{encoding:'utf8',env:{...process.env,OX_HEAVY_LOCAL:'1',OX_HEAVY_LOCK:join(root,'lock'),OX_HEAVY_WAIT:'0',...env}});}
test('snapshot includes unstaged, staged and new source without changing real index; ignores cache',t=>{
 const root=repo(t),before=git(root,['write-tree']);writeFileSync(join(root,'portal/package-lock.json'),'{"new":true}');writeFileSync(join(root,'new.mjs'),'new');mkdirSync(join(root,'.ops/gate-cache'),{recursive:true});writeFileSync(join(root,'.ops/gate-cache/log'),'ignored');
 const tree=snapshot(root);assert.notEqual(tree,before);assert.equal(git(root,['write-tree']),before);assert.match(git(root,['ls-tree','-r','--name-only',tree]),/new.mjs/);assert.doesNotMatch(git(root,['ls-tree','-r','--name-only',tree]),/gate-cache/);
});
test('cache binds successful full pass to tree, Node and lockfile; lane passes cannot satisfy review',()=>{
 const id={tree:'abc',node:'v24.21.0',lockfile:'123'},full={identity:id,tier:'merge',success:true};assert.ok(reusable(full,id,'review'));assert.ok(reusable(full,id,'lane'));for(const field of Object.keys(id))assert.ok(!reusable(full,{...id,[field]:'changed'},'review'));assert.ok(!reusable({...full,success:false},id,'review'));assert.ok(!reusable({...full,tier:'lane'},id,'review'));assert.ok(!reusable({...full,tier:'lane',base:'a'},id,'lane','b'));
});
test('affected selection follows transitive imports, URL/fs references, deletions and smoke; unknown falls back to full',t=>{
 const root=repo(t);mkdirSync(join(root,'portal/public'));writeFileSync(join(root,'portal/public/leaf.js'),'export const x=1');writeFileSync(join(root,'portal/public/parent.js'),"import './leaf.js'");for(const [file,content]of [['a',"import '../public/parent.js'"],['b',"new URL('../public/view.html',import.meta.url)"],['smoke','']])writeFileSync(join(root,'portal/test',file+'.test.mjs'),content);
 const config={smoke:['portal/test/smoke.test.mjs'],map:[]};assert.deepEqual(selectTests(root,['portal/public/leaf.js'],config).files,['portal/test/a.test.mjs','portal/test/smoke.test.mjs']);assert.equal(selectTests(root,['portal/public/deleted.js'],config).files.length,3);assert.equal(selectTests(root,['new/unmapped.js'],config).files.length,3);assert.equal(selectTests(root,['briefs/note.md'],config).files.length,1);assert.throws(()=>selectTests(root,[],{...config,smoke:['missing']}));
});
test('local lock stores owner PID, preserves status and clears on normal completion',t=>{const root=fixture(t);const run=heavy(root,['bash','-c','test -s "$OX_HEAVY_LOCK/pid"; exit 17']);assert.equal(run.status,17);assert.ok(!existsSync(join(root,'lock')));});
test('dead owner clears; live owner and ownerless locks remain untouched',t=>{const root=fixture(t);mkdirSync(join(root,'lock'));writeFileSync(join(root,'lock/pid'),'999999999');assert.equal(heavy(root,['true']).status,0);mkdirSync(join(root,'lock'));writeFileSync(join(root,'lock/pid'),String(process.pid));assert.equal(heavy(root,['true']).status,75);assert.equal(readFileSync(join(root,'lock/pid'),'utf8'),String(process.pid));rmSync(join(root,'lock/pid'));assert.equal(heavy(root,['true']).status,75);assert.ok(existsSync(join(root,'lock')));});
test('shell quoting preserves spaces, quotes and literal substitutions',()=>{const value="a ' b $(false) `false`";assert.equal(spawnSync('bash',['-c',`printf %s ${quote(value)}`],{encoding:'utf8'}).stdout,value);});
test('desktop availability never routes deploy, local asset builds or arbitrary shell commands',()=>{for(const command of [['npm','run','deploy'],['npm','run','build:release'],['npx','wrangler','deploy'],['bash','-c','npm test']]){const run=spawnSync('node',[join(tools,'heavy-remote.mjs'),'--available',...command],{encoding:'utf8'});assert.equal(run.status,1);}});
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
test('reporter records whole-file durations and failed global summaries',async()=>{
 const {default:reporter}=await import('../gate-reporter.mjs');const file=join(process.cwd(),'fixture.test.mjs');async function* events(){yield{type:'test:summary',data:{file,duration_ms:1250,success:true,counts:{tests:2}}};yield{type:'test:summary',data:{duration_ms:1300,success:false,counts:{tests:2,passed:1,failed:1,skipped:0}}};}
 let out='';for await(const value of reporter(events()))out+=value;assert.match(out,/FILE fixture.test.mjs 1.250s PASS/);assert.match(out,/TESTS 2 PASS 1 FAIL 1/);
});
test('catalog cache binds export blobs and transitive builder imports; presentation-only changes can reuse fixtures',t=>{
 const root=repo(t);mkdirSync(join(root,'scripts'));mkdirSync(join(root,'portal/public'));writeFileSync(join(root,'scripts/build_search_catalog.mjs'),"import '../portal/public/catalog-reader.mjs'");writeFileSync(join(root,'portal/public/catalog-reader.mjs'),'export const x=1');writeFileSync(join(root,'portal/public/export.json'),'{}');
 const key=()=>catalogKey(root,identity(root));const initial=key();writeFileSync(join(root,'portal/public/navigation.js'),'presentation');assert.equal(key(),initial);writeFileSync(join(root,'portal/public/export.json'),'{"new":true}');assert.notEqual(key(),initial);writeFileSync(join(root,'portal/public/export.json'),'{}');assert.equal(key(),initial);writeFileSync(join(root,'portal/public/catalog-reader.mjs'),'export const x=2');assert.notEqual(key(),initial);
});
