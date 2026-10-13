import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {existsSync, readFileSync, writeFileSync, renameSync, readdirSync, mkdtempSync, rmSync,statSync} from 'node:fs';
import {join, dirname, resolve, relative} from 'node:path';
import {tmpdir} from 'node:os';
export const runnerFiles=['gate-lib.mjs','gate-map.json','gate-reporter.mjs','heavy-remote.mjs','ox-heavy-remote.sh','ox-heavy.sh','web-gates.mjs','votes-validation.mjs','web-gates.sh','test/gates.test.mjs'];
export const runnerHash=()=>hash(runnerFiles.map(f=>f+'\0'+readFileSync(join(import.meta.dirname,f))).join('\0'));
export const hash = value => createHash('sha256').update(value).digest('hex');
export const git = (root,args,options={}) => execFileSync('git',args,{cwd:root,encoding:'utf8',...options}).trim();
// The captured base may have advanced beyond HEAD. Parenting the disposable
// snapshot to it transfers that object with the desktop gate ref, without
// merging or changing any source files or the caller's branch.
export const gateCommit = (root,tree,base,message) => git(root,['commit-tree',tree,'-p',base,'-m',message]);
export const gateBase = (root,tier,requested) => requested
  ? git(root,['rev-parse',requested])
  : tier==='lane' ? git(root,['merge-base','HEAD','origin/main']) : git(root,['rev-parse','origin/main']);
export const quote = s => "'"+String(s).replaceAll("'", "'\\''")+"'";
export function snapshot(root) {
  const scratch=mkdtempSync(join(tmpdir(),'opax-gate-index-'));
  try {
    const env={...process.env,GIT_INDEX_FILE:join(scratch,'index')};
    // Preserve explicitly staged new files even if a host's info/exclude hides .ops.
    git(root,['read-tree',git(root,['write-tree'])],{env});
    git(root,['add','-A'],{env});
    return git(root,['write-tree'],{env});
  } finally {rmSync(scratch,{recursive:true,force:true});}
}
export function identity(root, tree=snapshot(root)) {
  return {tree,node:process.version,lockfile:hash(readFileSync(join(root,'portal/package-lock.json'))),runner:runnerHash()};
}
export const cacheKey = id => hash(JSON.stringify(id));
export const cleanCheckout = root => git(root,['status','--porcelain','--untracked-files=all']) === '';
export function catalogKey(root,id) {
  const modules=new Set();
  const visit=file=>{
    if(modules.has(file))return;modules.add(file);
    const source=readFileSync(join(root,file),'utf8');
    for(const match of source.matchAll(/(?:from\s*|import\s*(?:\(\s*)?)["'](\.\.?\/[^"']+)["']/g)) {
      const path=relative(root,resolve(root,dirname(file),match[1]));
      if(path.startsWith('../'))continue;
      for(const candidate of [path,path+'.ts',path+'.mjs',path+'.js'])if(existsSync(join(root,candidate))&&statSync(join(root,candidate)).isFile())visit(candidate);
    }
  };
  visit('scripts/build_search_catalog.mjs');
  // Export shards and source registries are opened through dynamic paths.
  // Include every tracked JSON blob in these input directories as well as the
  // builder's import closure, without hashing 700 MB again.
  const blobs=git(root,['ls-tree','-rz',id.tree,'--','portal/public','portal/src','scripts'],{maxBuffer:16*1024*1024}).split('\0').filter(Boolean).filter(line=>{
    const file=line.split('\t')[1];return modules.has(file)||file.endsWith('.json');
  });
  return hash(JSON.stringify({blobs,node:id.node,lockfile:id.lockfile,runner:id.runner}));
}
export function reusable(record,id,tier,base) {
  return record?.success === true && cacheKey(record.identity) === cacheKey(id) &&
    (record.tier === 'merge' || (tier === 'lane' && record.tier === 'lane' && record.base === base));
}
export function persistPass(file,record) {
  if(record.success!==true)return false;
  let previous;try{previous=JSON.parse(readFileSync(file));}catch{}
  // A forced partial run adds evidence; it must not discard a full pass.
  if(record.tier!=='merge'&&reusable(previous,record.identity,'review'))return false;
  const temp=file+'.'+process.pid;
  writeFileSync(temp,JSON.stringify(record,null,2)+'\n');renameSync(temp,file);
  return true;
}
const walk = dir => readdirSync(dir,{withFileTypes:true}).flatMap(e=>e.isDirectory()?walk(join(dir,e.name)):[join(dir,e.name)]);
export function selectTests(root,changed,config) {
  const files=walk(join(root,'portal/test')).filter(f=>f.endsWith('.test.mjs')).map(f=>relative(root,f)).sort();
  const chosen=new Set(config.smoke);
  for(const file of config.optionalSmoke||[])if(files.includes(file))chosen.add(file);
  for(const file of files)if((config.mandatoryPatterns||[]).some(pattern=>new RegExp(pattern).test(file)))chosen.add(file);
  const affected=new Set();
  for(const file of config.smoke) if(!files.includes(file)) throw Error(`Missing smoke test: ${file}`);
  // Read references as well as imports: many tests load assets via fs/URL/vm.
  const deps=new Map(), references=new Map();
  const visit=(file,seen=new Set())=>{
    if(seen.has(file))return;seen.add(file);
    if(!existsSync(join(root,file)))return;
    if(!references.has(file)){
      const refs=new Set(),content=readFileSync(join(root,file),'utf8');
      for(const m of content.matchAll(/["'`]((?:\.\.\/|\.\/)[^"'`\n]+)["'`]/g)) {
        const path=relative(root,resolve(root,dirname(file),m[1]));
        if(path==='..'||path.startsWith('../'))continue;
        for(const candidate of [path,path+'.ts',path+'.mjs',path+'.js'])if(existsSync(join(root,candidate))&&statSync(join(root,candidate)).isFile())refs.add(candidate);
      }
      references.set(file,[...refs]);
    }
    for(const ref of references.get(file))visit(ref,seen);
  };
  for(const file of files){const seen=new Set();visit(file,seen);deps.set(file,seen);}
  const reasons=[];
  for(const path of changed) {
    if(/^(?:briefs\/|docs\/|[^/]+\.md$)/.test(path)&&/\.md$/.test(path))continue;
    let matched=false;
    for(const file of files)if(deps.get(file).has(path)||file===path){chosen.add(file);affected.add(file);matched=true;}
    for(const rule of config.map)if(new RegExp(rule.pattern).test(path)) {
      const targets=files.filter(file=>rule.tests.some(pattern=>new RegExp(pattern).test(file)));
      if(!targets.length){
        reasons.push(`Map rule for ${path} matched zero test files; full suite required`);
        for(const file of files){chosen.add(file);affected.add(file);}
      }else for(const file of targets){chosen.add(file);affected.add(file);}
      matched=true;
    }
    if(!matched){reasons.push(`Unmapped change: ${path}; full suite required`);for(const file of files){chosen.add(file);affected.add(file);}}
  }
  return {files:[...chosen].sort(),affected:[...affected].sort(),reasons,total:files.length};
}
