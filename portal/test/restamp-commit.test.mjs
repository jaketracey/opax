// The Deploy workflow's restamp commit (scripts/restamp_commit.sh): it commits every file
// stamp_assets.mjs writes or hashes (--files) that the build changed, checks that commit on its
// own, and pushes nothing when the check fails. 13 Nov 2026: the old fixed pattern committed
// index.html without spa-shell.js, so main failed stamp_assets --check until #312.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,mkdirSync,mkdtempSync,copyFileSync,rmSync,chmodSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {dirname,join} from 'node:path';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {stampFiles,MODULE_STAMPS} from '../../scripts/stamp_assets.mjs';

const repo=fileURLToPath(new URL('../../',import.meta.url));
const workflow=readFileSync(join(repo,'.github/workflows/deploy.yml'),'utf8');

// No CI or hook state leaks into the fixture repositories (GIT_DIR, the job summary, RUNNER_TEMP).
const baseEnv=Object.fromEntries(Object.entries(process.env).filter(([k])=>!/^(GIT_|GITHUB_|RUNNER_)/.test(k)));
// ${dir}/bin holds a no-op sleep, so the push retries do not wait.
const env=(dir,extra={})=>({...baseEnv,GIT_CONFIG_GLOBAL:'/dev/null',GIT_CONFIG_NOSYSTEM:'1',TMPDIR:dir,
  PATH:`${join(dir,'bin')}:${dirname(process.execPath)}:${process.env.PATH}`,GITHUB_STEP_SUMMARY:join(dir,'summary.md'),...extra});
function git(dir,cwd,...args){
  const r=spawnSync('git',['-c','user.name=Fixture','-c','user.email=fixture@example.invalid',...args],{cwd,env:env(dir),encoding:'utf8'});
  assert.equal(r.status,0,`git ${args.join(' ')}: ${r.stderr}`);
  return r.stdout.trim();
}

// A miniature stamp_assets.mjs with the same shape as the real one: index.html's coverage comes
// from corpus.json, spa-shell.js is generated from index.html's <main>, and index.html names
// spa-shell.js by its content hash. FIXTURE_OMIT leaves a file out of --files.
const FAKE_STAMP=`import {readFileSync,writeFileSync} from 'node:fs'
import {createHash} from 'node:crypto'
const pub=new URL('../portal/public/',import.meta.url)
const read=f=>readFileSync(new URL(f,pub),'utf8')
if(process.argv.includes('--files')){
  console.log(['portal/public/index.html','portal/public/spa-shell.js'].filter(f=>f!==process.env.FIXTURE_OMIT).join('\\n'))
  process.exit(0)
}
let index=read('index.html').replace(/<main>.*<\\/main>/,'<main>'+JSON.parse(read('corpus.json')).records+' records</main>')
const shell='main='+JSON.stringify(index.match(/<main>(.*)<\\/main>/)[1])+'\\n'
index=index.replace(/spa-shell\\.js\\?v=\\w*/,'spa-shell.js?v='+createHash('sha256').update(shell).digest('hex').slice(0,10))
const stale=[['index.html',index],['spa-shell.js',shell]].filter(([f,t])=>read(f)!==t)
if(process.argv.includes('--check')){
  if(stale.length){console.error('stale: '+stale.map(([f])=>f).join(' '));process.exit(1)}
  console.log('stamps are current');process.exit(0)
}
for(const [f,t] of stale)writeFileSync(new URL(f,pub),t)
`;

// origin (bare) and a deploy checkout of main after a nightly that changed corpus.json, with
// the build run: index.html and spa-shell.js restamped, voice.js rebuilt with a CI path in it.
function fixture(t,{nightly=true}={}){
  const dir=mkdtempSync(join(tmpdir(),'opax-restamp-commit-'));
  t.after(()=>rmSync(dir,{recursive:true,force:true}));
  mkdirSync(join(dir,'bin'));writeFileSync(join(dir,'bin/sleep'),'#!/bin/sh\nexit 0\n');chmodSync(join(dir,'bin/sleep'),0o755);
  const origin=join(dir,'origin.git'),work=join(dir,'work'),pub=join(work,'portal/public');
  git(dir,dir,'init','-q','--bare','-b','main',origin);
  git(dir,dir,'init','-q','-b','main',work);
  mkdirSync(join(work,'scripts'),{recursive:true});mkdirSync(pub,{recursive:true});
  copyFileSync(join(repo,'scripts/restamp_commit.sh'),join(work,'scripts/restamp_commit.sh'));
  writeFileSync(join(work,'scripts/stamp_assets.mjs'),FAKE_STAMP);
  writeFileSync(join(pub,'corpus.json'),'{"records":1}\n');
  writeFileSync(join(pub,'index.html'),'<script src="/spa-shell.js?v="></script><main></main>\n');
  writeFileSync(join(pub,'spa-shell.js'),'');
  writeFileSync(join(pub,'voice.js'),'voice built at /Users/someone/opax\n');
  const stamp=(...args)=>spawnSync(process.execPath,['scripts/stamp_assets.mjs',...args],{cwd:work,env:env(dir),encoding:'utf8'});
  assert.equal(stamp().status,0);
  git(dir,work,'add','-A');git(dir,work,'commit','-q','-m','Portal');
  git(dir,work,'remote','add','origin',origin);git(dir,work,'push','-q','origin','main');
  if(nightly){
    writeFileSync(join(pub,'corpus.json'),'{"records":2}\n');
    git(dir,work,'commit','-q','-am','Nightly refresh');git(dir,work,'push','-q','origin','main');
  }
  const before=git(dir,origin,'rev-parse','main');
  assert.equal(stamp().status,0);
  writeFileSync(join(pub,'voice.js'),'voice built at /home/runner/work/opax\n');
  const restamp=(extra)=>spawnSync('bash',['scripts/restamp_commit.sh'],{cwd:work,env:env(dir,extra),encoding:'utf8'});
  return {dir,origin,work,before,restamp,stamp};
}

test('the deploy step runs the restamp script after the deploy, as before', ()=>{
  const step=workflow.slice(workflow.indexOf('      - name: Commit restamped assets back to main'),workflow.indexOf('      - name: Summary'));
  assert.match(step,/if: \$\{\{ !cancelled\(\) && steps\.production\.outcome == 'success' && steps\.duplicate\.outputs\.skip != 'true' \}\}/);
  assert.match(step,/working-directory: \.\n\s+run: bash scripts\/restamp_commit\.sh\n/);
  const script=readFileSync(join(repo,'scripts/restamp_commit.sh'),'utf8');
  assert.match(script,/node scripts\/stamp_assets\.mjs --files/);
  assert.match(script,/git commit -q -m "Restamp assets after deploy \[skip ci\]"/);
  assert.match(script,/user\.name "github-actions\[bot\]"/);
  assert.match(script,/user\.email "41898282\+github-actions\[bot\]@users\.noreply\.github\.com"/);
  // no hand-kept file pattern: the stamp's own list decides what is committed
  assert.doesNotMatch(script,/grep -E '\^portal\/public/);
});

test('stamp_assets --files lists everything the stamp writes or hashes, every one tracked', ()=>{
  const files=stampFiles();
  assert.deepEqual(files,[...new Set(files)].sort());
  for(const f of ['index.html','spa-shell.js','seo-links.json','_headers','home.html','community.html','press.html','map.html','ui-workbench.html','app.js','analytics.js','events.js','gtm.js','style.css','tokens.css'])
    assert.ok(files.includes(`portal/public/${f}`),`${f} is missing from stamp_assets --files`);
  assert.ok(files.includes('portal/src/app-banner.ts'));
  // build:search rebuilds it and the coverage table in index.html shows its report count
  assert.ok(files.includes('portal/public/search-catalog/manifest.json'));
  for(const [importer,mod] of MODULE_STAMPS)for(const f of [importer,mod])assert.ok(files.includes(`portal/public/${f}`),f);
  // esbuild's path-dependent output is never committed back
  assert.ok(!files.some(f=>/\/voice\.js$|\/chunks\//.test(f)));
  // git add of an untracked or ignored path would fail the deploy step
  const tracked=spawnSync('git',['ls-files','--',...files],{cwd:repo,encoding:'utf8'}).stdout.trim().split('\n').sort();
  assert.deepEqual(tracked,files);
  const cli=spawnSync(process.execPath,['scripts/stamp_assets.mjs','--files'],{cwd:repo,encoding:'utf8'});
  assert.equal(cli.status,0,cli.stderr);assert.deepEqual(cli.stdout.trim().split('\n'),files);
});

test('after a corpus change the restamp commits index.html with spa-shell.js and main passes the check', t=>{
  const f=fixture(t);
  const r=f.restamp();
  assert.equal(r.status,0,r.stdout+r.stderr);
  assert.equal(git(f.dir,f.origin,'log','-1','--format=%s|%an|%ae','main'),'Restamp assets after deploy [skip ci]|github-actions[bot]|41898282+github-actions[bot]@users.noreply.github.com');
  assert.equal(git(f.dir,f.origin,'rev-parse','main^'),f.before);
  assert.deepEqual(git(f.dir,f.origin,'show','--name-only','--format=','main').split('\n'),['portal/public/index.html','portal/public/spa-shell.js']);
  assert.match(r.stdout,/::notice::tracked files changed by the build and not committed: portal\/public\/voice\.js/);
  assert.match(r.stdout,/passes stamp_assets --check on its own/);
  // a fresh clone of main passes the stamp check
  const fresh=join(f.dir,'fresh');git(f.dir,f.dir,'clone','-q',f.origin,fresh);
  const check=spawnSync(process.execPath,['scripts/stamp_assets.mjs','--check'],{cwd:fresh,env:env(f.dir),encoding:'utf8'});
  assert.equal(check.status,0,check.stderr);
  // the checking worktree is gone; the build's other output is left as it was
  assert.equal(git(f.dir,f.work,'worktree','list','--porcelain').split('\n').filter(l=>l.startsWith('worktree ')).length,1);
  assert.equal(git(f.dir,f.work,'status','--porcelain'),'M portal/public/voice.js');
});

test('a list that misses a regenerated file (the 13 Nov failure) fails the step and pushes nothing', t=>{
  const f=fixture(t);
  const r=f.restamp({FIXTURE_OMIT:'portal/public/spa-shell.js'});
  assert.equal(r.status,1,r.stdout+r.stderr);
  assert.match(r.stdout,/::error::the restamp commit fails the stamp check on its own \(stamp_assets --check failed; stamping it changes portal\/public\/spa-shell\.js\)/);
  assert.match(r.stdout,/Nothing was pushed; production is already deployed/);
  assert.equal(git(f.dir,f.origin,'rev-parse','main'),f.before);
  assert.match(readFileSync(join(f.dir,'summary.md'),'utf8'),/### Restamp not pushed/);
  assert.equal(git(f.dir,f.work,'worktree','list','--porcelain').split('\n').filter(l=>l.startsWith('worktree ')).length,1);
});

test('with no stamp changes nothing is committed, main is still checked, and churn stays out', t=>{
  const f=fixture(t,{nightly:false});
  const r=f.restamp();
  assert.equal(r.status,0,r.stdout+r.stderr);
  assert.match(r.stdout,/Stamps unchanged; nothing to commit\./);
  assert.match(r.stdout,/passes stamp_assets --check on its own/);
  assert.equal(git(f.dir,f.origin,'rev-parse','main'),f.before);
  assert.equal(git(f.dir,f.work,'rev-parse','HEAD'),f.before);
});

test('main already failing the check, with no stamp change to commit, fails the step', t=>{
  const f=fixture(t,{nightly:false});
  // a build output the stamp hashes but its list leaves out: main and the build disagree on it
  git(f.dir,f.work,'checkout','-q','--','portal/public');
  writeFileSync(join(f.work,'portal/public/spa-shell.js'),'stale\n');
  git(f.dir,f.work,'commit','-q','-am','Stale shell');git(f.dir,f.work,'push','-q','origin','main');
  assert.equal(f.stamp().status,0);
  const r=f.restamp({FIXTURE_OMIT:'portal/public/spa-shell.js'});
  assert.equal(r.status,1,r.stdout+r.stderr);
  assert.match(r.stdout,/Stamps unchanged; nothing to commit\./);
  assert.match(r.stdout,/::error::the restamp commit fails the stamp check on its own/);
});

// Data pushed to main while the deploy runs (a second clone, as the nightly box would).
function pushDuringDeploy(f,changes){
  const other=join(f.dir,'other');git(f.dir,f.dir,'clone','-q',f.origin,other);
  for(const [file,text] of changes){
    writeFileSync(join(other,file),text);git(f.dir,other,'add','--',file);git(f.dir,other,'commit','-q','-m',`Data push: ${file}`);git(f.dir,other,'push','-q','origin','main');
  }
  return git(f.dir,f.origin,'rev-parse','main');
}

test('two data pushes during the deploy: the rebased restamp is checked again and main passes', t=>{
  const f=fixture(t);
  const moved=pushDuringDeploy(f,[['portal/public/a.json','{"a":1}\n'],['portal/public/b.json','{"b":1}\n']]);
  const r=f.restamp();
  assert.equal(r.status,0,r.stdout+r.stderr);
  assert.match(r.stdout,/push rejected \(attempt 1\)/);
  assert.equal((r.stdout.match(/passes stamp_assets --check on its own/g)||[]).length,2);
  assert.equal(git(f.dir,f.origin,'rev-parse','main^'),moved);
  assert.equal(git(f.dir,f.origin,'log','-1','--format=%s','main'),'Restamp assets after deploy [skip ci]');
  const fresh=join(f.dir,'fresh');git(f.dir,f.dir,'clone','-q',f.origin,fresh);
  const check=spawnSync(process.execPath,['scripts/stamp_assets.mjs','--check'],{cwd:fresh,env:env(f.dir),encoding:'utf8'});
  assert.equal(check.status,0,check.stderr);
});

test('a data push during the deploy that changes what the stamp reads: the rebased restamp is not pushed', t=>{
  const f=fixture(t);
  const moved=pushDuringDeploy(f,[['portal/public/a.json','{"a":1}\n'],['portal/public/corpus.json','{"records":3}\n']]);
  const r=f.restamp();
  assert.equal(r.status,1,r.stdout+r.stderr);
  assert.match(r.stdout,/::error::the restamp commit fails the stamp check on its own \(stamp_assets --check failed; stamping it changes portal\/public\/index\.html portal\/public\/spa-shell\.js\)\. Nothing was pushed; production is already deployed\. main moved during the deploy \(rebased on attempt 1\)/);
  assert.equal(git(f.dir,f.origin,'rev-parse','main'),moved);
  assert.match(readFileSync(join(f.dir,'summary.md'),'utf8'),/### Restamp not pushed/);
  assert.equal(git(f.dir,f.work,'worktree','list','--porcelain').split('\n').filter(l=>l.startsWith('worktree ')).length,1);
});
