import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {existsSync, readFileSync, readdirSync, mkdtempSync, rmSync,statSync} from 'node:fs';
import {join, dirname, resolve, relative} from 'node:path';
import {tmpdir} from 'node:os';
export const runnerFiles=['gate-lib.mjs','gate-map.json','gate-reporter.mjs','heavy-remote.mjs','ox-heavy-remote.sh','ox-heavy.sh','web-gates.mjs','web-gates.sh','test/gates.test.mjs'];
export const runnerHash=()=>hash(runnerFiles.map(f=>f+'\0'+readFileSync(join(import.meta.dirname,f))).join('\0'));
export const hash = value => createHash('sha256').update(value).digest('hex');
export const git = (root,args,options={}) => execFileSync('git',args,{cwd:root,encoding:'utf8',...options}).trim();
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
export function reusable(record,id,tier,base) {
  return record?.success === true && cacheKey(record.identity) === cacheKey(id) &&
    (record.tier === 'merge' || (tier === 'lane' && record.tier === 'lane' && record.base === base));
}
const walk = dir => readdirSync(dir,{withFileTypes:true}).flatMap(e=>e.isDirectory()?walk(join(dir,e.name)):[join(dir,e.name)]);
export function selectTests(root,changed,config) {
  const files=walk(join(root,'portal/test')).filter(f=>f.endsWith('.test.mjs')).map(f=>relative(root,f)).sort();
  const chosen=new Set(config.smoke);
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
    if(/\.md$/.test(path))continue;
    let matched=false;
    for(const file of files)if(deps.get(file).has(path)||file===path){chosen.add(file);affected.add(file);matched=true;}
    for(const rule of config.map)if(new RegExp(rule.pattern).test(path)) {for(const file of files)if(rule.tests.some(pattern=>new RegExp(pattern).test(file))){chosen.add(file);affected.add(file);}matched=true;}
    if(!matched){reasons.push(`Unmapped change: ${path}; full suite required`);for(const file of files){chosen.add(file);affected.add(file);}}
  }
  return {files:[...chosen].sort(),affected:[...affected].sort(),reasons,total:files.length};
}
