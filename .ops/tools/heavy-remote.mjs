import {spawn,execFileSync} from 'node:child_process';
import {writeFileSync,mkdirSync} from 'node:fs';
import {join,basename} from 'node:path';
import {git,gateCommit,gateBase,snapshot,quote,identity,cacheKey,persistPass,runnerFiles} from './gate-lib.mjs';
const args=process.argv.slice(2),mode=args[0];
const host=process.env.OX_HEAVY_HOST||'desktop';
const remoteRepo=process.env.OX_HEAVY_REPO||'opax-work/opax';
if(!/^[a-zA-Z0-9_.-]+$/.test(host)||!/^[-a-zA-Z0-9_/]+$/.test(remoteRepo)||remoteRepo.startsWith('-'))throw Error('Unsafe desktop host/repo');
// A queued gate must not share another lane's ControlMaster lifetime.
const sshArgs=['-o','BatchMode=yes','-o','ConnectTimeout=10','-o','ControlMaster=no','-o','ControlPath=none','-o','ServerAliveInterval=30','-o','ServerAliveCountMax=3',host];
function ssh(command,options={}){return execFileSync('ssh',[...sshArgs,command],{encoding:'utf8',...options});}
function route(command){
 const [cmd,...rest]=command;
 if((cmd==='node'||basename(cmd||'')==='node')&&basename(rest[0]||'')==='web-gates.mjs'&&['lane','merge','review','profile'].includes(rest[1]||'lane'))return rest.slice(1);
 // Legacy full-test/build invocations spill into the complete gate chain.
 if(cmd==='npm'&&((rest.length===1&&rest[0]==='test')||(rest.length===2&&rest[0]==='run'&&['test','check'].includes(rest[1]))))return ['merge'];
 if(cmd==='node'&&rest[0]==='--test'&&rest.slice(1).every(s=>/^--test-concurrency=\d+$|^test\/[\w.*-]+\.mjs$/.test(s)))return ['merge'];
 return null;
}
const routed=(mode==='--available'||mode==='--route')?route(args.slice(1)):null;
if(mode==='--available'){
 if(!routed)process.exit(1);
 try{ssh('test ! -d "$HOME/opax-work/heavy.lock" || { owner=$(cat "$HOME/opax-work/heavy.lock/pid" 2>/dev/null); test -n "$owner" && ! kill -0 "$owner" 2>/dev/null; }',{stdio:['ignore','ignore','ignore']});process.exit(0);}catch{process.exit(1);}
}
if(mode==='--route'&&!routed)throw Error('Command is not eligible for desktop routing');
const tierArgs=routed||(mode==='--tier'?args.slice(1):['merge',...args]);
if(!['lane','merge','review','profile'].includes(tierArgs[0]))throw Error('Unknown gate tier');
const root=git(process.cwd(),['rev-parse','--show-toplevel']),id=identity(root),tree=id.tree;
const base=gateBase(root,tierArgs[0],tierArgs.includes('--base')?tierArgs[tierArgs.indexOf('--base')+1]:undefined);
const label=process.env.OX_GATE_LABEL||`${basename(root)}-${tree.slice(0,12)}-${process.pid}`;
if(!/^[a-zA-Z0-9][a-zA-Z0-9_.-]*$/.test(label))throw Error('Label must contain only letters, digits, dot, underscore or dash');
const commit=gateCommit(root,tree,base,`Desktop gate ${label}`);
const ref=`refs/heads/gate/${label}`;
// This is the authorised desktop repository only, never origin/GitHub.
execFileSync('git',['push','--quiet',`${host}:${remoteRepo}`,`${commit}:${ref}`],{cwd:root,stdio:['ignore','inherit','inherit']});
// Ship only the named runner sources to an immutable tools directory. This also
// supports legacy lanes before these tools reach main, without altering their tree.
const toolsArchive=execFileSync('tar',['-cf','-',...runnerFiles],{cwd:import.meta.dirname});
ssh(`mkdir -p "$HOME/opax-work/gate-tools/${id.runner}" && tar -xf - -C "$HOME/opax-work/gate-tools/${id.runner}"`,{input:toolsArchive,stdio:['pipe','ignore','inherit']});
const forwarded=tierArgs.filter((arg,i)=>arg!=='--base'&&tierArgs[i-1]!=='--base');
const script=`set -uo pipefail
export PATH="$HOME/.nvm/versions/node/v24.21.0/bin:$PATH"
export npm_config_prefix="$HOME/.nvm/versions/node/v24.21.0"
export OX_HEAVY_LOCAL=1 WRANGLER_SEND_METRICS=false LANG=C.UTF-8 LC_ALL=C.UTF-8
export OX_GATE_CACHE="$HOME/opax-work/gate-cache"
ulimit -n 4096 2>/dev/null || true
LOCK="$HOME/opax-work/heavy.lock"
WAIT=${Number(process.env.OX_HEAVY_WAIT||3600)}
start=$(date +%s)
while ! mkdir "$LOCK" 2>/dev/null; do
 owner=$(cat "$LOCK/pid" 2>/dev/null || true)
 if [ -n "$owner" ] && ! kill -0 "$owner" 2>/dev/null; then rm -f "$LOCK/pid"; rmdir "$LOCK" 2>/dev/null; continue; fi
 if [ $(( $(date +%s) - start )) -ge "$WAIT" ]; then echo 'desktop heavy lock timed out' >&2; exit 75; fi
 sleep 5
done
echo $$ > "$LOCK/pid"
REPO="$HOME/${remoteRepo}"
WORK="$HOME/opax-work/wt/${label}"
created=0
cleanup(){
 if [ "$created" = 1 ]; then git -C "$REPO" worktree remove --force "$WORK"; fi
 rm -f "$LOCK/pid"; rmdir "$LOCK" 2>/dev/null
}
trap cleanup EXIT
git -C "$REPO" worktree add --quiet --detach "$WORK" ${quote(commit)} || exit 2
created=1
cd "$WORK" || exit 2
nice -n 10 node "$HOME/opax-work/gate-tools/${id.runner}/web-gates.mjs" ${forwarded.map(quote).join(' ')} --base ${quote(base)}
code=$?
echo "REMOTE_GATE_EXIT=$code"
if [ -f "$OX_GATE_CACHE/${cacheKey(id)}.json" ]; then
 echo REMOTE_PASS_BEGIN
 cat "$OX_GATE_CACHE/${cacheKey(id)}.json"
 echo REMOTE_PASS_END
fi
exit "$code"
`;
const cache=join(root,'.ops/gate-cache');mkdirSync(cache,{recursive:true});
const log=[];
const status=await new Promise((done,reject)=>{
 const child=spawn('ssh',[...sshArgs,'bash -s'],{stdio:['pipe','pipe','inherit']});let pending='',hidden=false;
 child.stdin.end(script);child.stdout.on('data',chunk=>{
   log.push(chunk);pending+=chunk.toString();let at;
   while((at=pending.indexOf('\n'))>=0){const line=pending.slice(0,at);pending=pending.slice(at+1);
     if(line==='REMOTE_PASS_BEGIN'){hidden=true;continue;}if(line==='REMOTE_PASS_END'){hidden=false;continue;}
     if(!hidden)process.stdout.write(line+'\n');
   }
 });child.on('error',reject);child.on('close',code=>{if(pending&&!hidden)process.stdout.write(pending);done(code);});
});
const output=Buffer.concat(log).toString();writeFileSync(join(cache,`remote-${label}.log`),output);
const match=/REMOTE_PASS_BEGIN\n([\s\S]*?)\nREMOTE_PASS_END/.exec(output);
if(status===0&&match){const record=JSON.parse(match[1]);if(record.success&&cacheKey(record.identity)===cacheKey(id)&&snapshot(root)===tree)persistPass(join(cache,`${cacheKey(id)}.json`),record);}
process.exitCode=status??1;
