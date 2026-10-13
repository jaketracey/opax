import {execFileSync,spawn} from 'node:child_process';
import {readFileSync,mkdirSync} from 'node:fs';
import {join,resolve} from 'node:path';
import {homedir} from 'node:os';
import {cacheKey,persistPass,reusable,quote} from './gate-lib.mjs';

export const sshOptions=['-o','BatchMode=yes','-o','ConnectTimeout=10','-o','ControlMaster=no','-o','ControlPath=none','-o','ServerAliveInterval=30','-o','ServerAliveCountMax=3'];
export const cacheDirectory=root=>resolve(process.env.OX_GATE_CACHE||(process.platform==='linux'&&process.env.OX_GATE_DESKTOP==='1'?join(homedir(),'opax-work/gate-cache'):join(root,'.ops/gate-cache')));
export function remoteHost(){
 const host=process.env.OX_GATE_REMOTE??(process.platform==='darwin'?'desktop':'0');
 if(host==='0')return null;
 if(!/^(?:[a-zA-Z0-9_.-]+@)?[a-zA-Z0-9_.-]+$/.test(host)||host.startsWith('-'))throw Error('Unsafe gate registry SSH host');
 return host;
}
export function readPass(file){try{return JSON.parse(readFileSync(file));}catch{return null;}}
// Imported evidence comes only from the authenticated desktop registry or an
// explicitly supplied trusted receipt. Never promote lane/failed/incomplete runs.
export function authoritative(record,id){
 const steps=['scripts-tests','install','runtime-types','shell','release','check','dry-run'];
 const counts=record?.test?.summary?.counts;
 return reusable(record,id,'review')&&record.schema===2&&
  steps.every(name=>record.steps?.some(step=>step.name===name&&step.code===0))&&
  record.steps?.some(step=>/^tests-\d+$/.test(step.name)&&step.code===0)&&
  record.selection?.total>0&&record.selection.files?.length===record.selection.total&&
  record.test?.files?.length===record.selection.total&&record.test.files.every(file=>file.success===true)&&
  new Set(record.selection.files).size===record.selection.total&&
  JSON.stringify(record.selection.files.map(file=>file.replace(/^portal\//,'')).sort())===JSON.stringify(record.test.files.map(file=>file.file).sort())&&
  record.test.summary.success===true&&counts?.tests>0&&counts.passed===counts.tests&&
  counts.failed===0&&counts.cancelled===0&&counts.skipped===0;
}
export function compactPass(record){
 return {schema:record.schema,identity:record.identity,base:record.base,tier:record.tier,host:record.host,concurrency:record.concurrency,success:record.success,
  selection:{files:record.selection.files,total:record.selection.total},steps:record.steps.map(({name,code,seconds})=>({name,code,seconds})),
  test:{files:record.test.files.map(({file,success})=>({file,success})),summary:{success:record.test.summary.success,counts:record.test.summary.counts}}};
}
export function importPass(file,record,id){
 if(!authoritative(record,id))throw Error('Receipt is not a complete full pass for this tree/toolchain');
 mkdirSync(resolve(file,'..'),{recursive:true});persistPass(file,record);return record;
}
export function pullPass(cache,id,host=remoteHost()){
 if(!host)return null;
 let record;
 try{record=JSON.parse(execFileSync('ssh',[...sshOptions,host,`cat "$HOME/opax-work/gate-cache/${cacheKey(id)}.json"`],{encoding:'utf8',stdio:['ignore','pipe','pipe'],timeout:15000,maxBuffer:16*1024*1024}));}
 catch{return null;}
 return importPass(join(cache,`${cacheKey(id)}.json`),record,id);
}
export function publishPass(record,host=remoteHost()){
 if(!host||!authoritative(record,record.identity))return false;
 const key=cacheKey(record.identity);
 // Atomic rename, same filesystem; this never reads or changes a heavy lock.
 const script=`set -eu\nmkdir -p "$HOME/opax-work/gate-cache"\nfile="$HOME/opax-work/gate-cache/${key}.json"\ntmp=$(mktemp "$file.XXXXXX")\ntrap 'rm -f "$tmp"' EXIT\ncat > "$tmp"\nmv "$tmp" "$file"\n`;
 execFileSync('ssh',[...sshOptions,host,'bash -c '+quote(script)],{input:JSON.stringify(compactPass(record))+'\n',stdio:['pipe','ignore','pipe'],timeout:15000});return true;
}
export function claimScript(id,wait=Number(process.env.OX_HEAVY_WAIT||3600),directory){
 if(!Number.isFinite(wait)||wait<0)throw Error('Invalid claim wait');
 return `set -eu
cache=${directory?quote(directory):'"$HOME/opax-work/gate-cache"'}
mkdir -p "$cache/claims"
lock="$cache/claims/${cacheKey(id)}.lock"
start=$(date +%s)
while ! mkdir "$lock" 2>/dev/null; do
 owner=$(cat "$lock/pid" 2>/dev/null || true)
 if [ -n "$owner" ] && ! kill -0 "$owner" 2>/dev/null; then rm -f "$lock/pid"; rmdir "$lock" 2>/dev/null || true; continue; fi
 if [ $(( $(date +%s) - start )) -ge ${wait} ]; then echo 'gate identity claim timed out' >&2; exit 75; fi
 sleep 1
done
echo $$ > "$lock/pid"
cleanup(){ if [ "$(cat "$lock/pid" 2>/dev/null || true)" = "$$" ]; then rm -f "$lock/pid"; rmdir "$lock" 2>/dev/null || true; fi; }
trap cleanup EXIT
echo CLAIM_READY
while IFS= read -r line; do :; done
`;
}
export async function claimPass(id,options={}){
 const host=options.host===undefined?remoteHost():options.host;
 if(!host&&process.env.OX_GATE_DESKTOP!=='1'&&!options.local)return async()=>{};
 const script=claimScript(id,options.wait,options.directory),child=host
  ?spawn('ssh',[...sshOptions,host,'bash -c '+quote(script)],{stdio:['pipe','pipe','pipe']})
  :spawn('bash',['-c',script],{stdio:['pipe','pipe','pipe'],env:{...process.env,...options.env}});
 let errors='',closed;
 const completion=new Promise(resolve=>{child.on('close',code=>{closed=code;resolve(code);});});
 child.stderr.on('data',chunk=>errors+=chunk.toString());child.stdin.on('error',()=>{});
 await new Promise((resolve,reject)=>{
  let output='';child.stdout.on('data',chunk=>{output+=chunk.toString();if(output.includes('CLAIM_READY\n'))resolve();});
  child.on('error',reject);child.on('close',code=>reject(Error(`Identity claim exited ${code}: ${errors.trim()}`)));
 });
 const release=async()=>{child.stdin.end();const code=closed??await completion;if(code!==0)throw Error(`Identity claim lost: ${errors.trim()}`);};
 release.assertHeld=()=>{if(child.exitCode!==null||child.signalCode!==null)throw Error('Identity claim lost while gate was running');};
 return release;
}
