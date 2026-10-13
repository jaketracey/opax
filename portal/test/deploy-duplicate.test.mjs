import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {readFileSync,mkdtempSync,writeFileSync,chmodSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {spawnSync} from 'node:child_process';
const duplicate=createRequire(import.meta.url)('../../scripts/deploy-duplicate.cjs');
const sha='a'.repeat(40),newer='b'.repeat(40);
async function run({deployed=sha,state='success',ancestor=true,active=true,apiFailure=false}={}) {
 const outputs={},warnings=[];
 const deps={context:{repo:{owner:'fixture',repo:'opax'},runId:42},core:{setOutput:(k,v)=>outputs[k]=v,notice(){},warning:m=>warnings.push(m)},
  exec:{getExecOutput:async(_cmd,args)=>args[0]==='rev-parse'?{stdout:sha+'\n'}:{exitCode:ancestor?0:1}},
  github:{rest:{repos:{listDeployments:async()=>{if(apiFailure)throw Error('API unavailable');return {data:[{id:1,sha:deployed,payload:{workflow:'deploy.yml',run_id:41}}]}},listDeploymentStatuses:async()=>({data:[{state}]})},actions:{getWorkflowRun:async()=>({data:{status:active?'in_progress':'completed',head_branch:'main',path:'.github/workflows/deploy.yml'}})}}}};
 await duplicate(deps);return {outputs,warnings};
}
test('equal or newer successfully deployed main checkouts skip, older and unrelated ones run',async()=>{
 assert.equal((await run()).outputs.skip,'true');assert.equal((await run({deployed:newer})).outputs.skip,'true');
 assert.equal((await run({ancestor:false})).outputs.skip,'false');assert.equal((await run({state:'failure'})).outputs.skip,'false');
});
test('only a verified active main deploy permits in-progress skipping; API failure proceeds',async()=>{
 assert.equal((await run({state:'in_progress'})).outputs.skip,'true');assert.equal((await run({state:'in_progress',active:false})).outputs.skip,'false');
 const failed=await run({apiFailure:true});assert.equal(failed.outputs.skip,'false');assert.equal(failed.warnings.length,1);
});
test('five failed post-deploy pushes and rebases warn and succeed; serial deploys never cancel',()=>{
 const workflow=readFileSync(new URL('../../.github/workflows/deploy.yml',import.meta.url),'utf8');
 assert.match(workflow,/group: deploy-production\n  cancel-in-progress: false/);
 const script=workflow.slice(workflow.indexOf('          for attempt in 1 2 3 4 5;'),workflow.indexOf('\n      - name: Summary')).replace(/^          /gm,'');
 const dir=mkdtempSync(join(tmpdir(),'opax-restamp-'));
 try {
  writeFileSync(join(dir,'git'),'#!/bin/sh\nexit 1\n');writeFileSync(join(dir,'sleep'),'#!/bin/sh\nexit 0\n');
  for(const name of ['git','sleep'])chmodSync(join(dir,name),0o755);
  const result=spawnSync('bash',['-euc',script],{encoding:'utf8',env:{...process.env,PATH:dir+':'+process.env.PATH}});
  assert.equal(result.status,0,result.stderr);assert.equal((result.stdout.match(/push rejected/g)||[]).length,5);assert.match(result.stdout,/::warning::could not push/);assert.doesNotMatch(result.stdout,/::error::/);
 }finally{rmSync(dir,{recursive:true,force:true});}
});
