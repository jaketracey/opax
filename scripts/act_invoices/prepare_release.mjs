/** Actions-only transfer. Any failure removes the candidate, never existing D1 rows. */
import {readFile,writeFile,mkdir,rename,unlink,mkdtemp,rm,appendFile} from 'node:fs/promises';
import {resolve,dirname,join} from 'node:path';
import {tmpdir} from 'node:os';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';
import {validateManifest,verifyReleaseAsset,REVIEW_RECEIPT,RELEASE_REPOSITORY,sha256} from './release-bundle.mjs';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'../..');
export const ACT_RELEASE_CONDITION="${{ steps.duplicate.outputs.skip != 'true' && steps.production.outcome == 'success' && github.event_name != 'pull_request' && vars.OPAX_TABLE_RELOAD == 'on' }}";
export async function checkReleaseWorkflow(base=root){
 const text=await readFile(resolve(base,'.github/workflows/deploy.yml'),'utf8');
 const start=text.indexOf('      - name: Prepare reviewed ACT invoice release');
 const end=text.indexOf('      - name: Reload D1 tables if the table data changed');
 const block=text.slice(start,end);
 if(start<0||end<start||!block.includes('if: '+ACT_RELEASE_CONDITION)||!block.includes('continue-on-error: true')||!block.includes('node ../scripts/act_invoices/prepare_release.mjs')||!block.includes('GH_TOKEN: ${{ github.token }}')||!block.includes("OPAX_TABLE_RELOAD: ${{ vars.OPAX_TABLE_RELOAD }}"))throw Error('ACT release workflow guard or ordering is invalid');
 return {workflow:'valid',reload_off:'skipped',before_sql_build:true};
}
export async function prepareRelease({root:base=root,reload=process.env.OPAX_TABLE_RELOAD,dryRun=false,download,run=spawnSync}={}){
 if(reload!=='on')return {status:'skipped',reason:'table reload is off'};
 const target=resolve(base,'data/promoted/act-invoices/table.json'),temporary=target+'.verified.tmp';
 let work;
 try{
  // The local build input must be absent on every held path. D1 retention then
  // omits ACT from deletes, inserts and schema drift checks in this reload.
  if(!dryRun){await unlink(target).catch(e=>{if(e.code!=='ENOENT')throw e;});await unlink(temporary).catch(e=>{if(e.code!=='ENOENT')throw e;});}
  const manifest=JSON.parse(await readFile(resolve(base,'data/promoted/act-invoices/release.json'),'utf8'));
  validateManifest(manifest);
  const reviewBytes=await readFile(resolve(base,REVIEW_RECEIPT));const review=JSON.parse(reviewBytes);
  if(review.status!=='approved'||review.reviewed_commit!==manifest.review.reviewed_commit||sha256(reviewBytes)!==manifest.review.sha256)throw Error('review mismatch');
  if(dryRun)return {status:'dry-run',would_download:true,repository:RELEASE_REPOSITORY,release_tag:manifest.release_tag,asset_name:manifest.asset_name,bytes:manifest.bytes,sha256:manifest.sha256};
  work=await mkdtemp(join(tmpdir(),'opax-act-release-'));
  let bytes;
  if(download)bytes=await download(manifest,work);
  else{
   const result=run('gh',['release','download',manifest.release_tag,'--repo',RELEASE_REPOSITORY,'--pattern',manifest.asset_name,'--dir',work],{cwd:base,encoding:'utf8'});
   if(result.status!==0)throw Error('download failed');
   bytes=await readFile(join(work,manifest.asset_name));
  }
  const {raw}=verifyReleaseAsset(bytes,manifest,reviewBytes);
  await mkdir(dirname(target),{recursive:true});await writeFile(temporary,raw);await rename(temporary,target);
  return {status:'ready',bytes:bytes.length,sha256:manifest.sha256,snapshot:manifest.snapshot};
 }catch{
  if(!dryRun){await unlink(target).catch(()=>{});await unlink(temporary).catch(()=>{});}
  return {status:'held',reason:'ACT release missing, unapproved or failed size/hash/content verification; retaining last approved D1 rows',dry_run:dryRun};
 }finally{if(work)await rm(work,{recursive:true,force:true});}
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const dryRun=process.argv.includes('--dry-run');
 try{
  const workflow=await checkReleaseWorkflow();const result=await prepareRelease({dryRun});console.log(JSON.stringify({...workflow,...result}));
  if(process.env.GITHUB_OUTPUT)await appendFile(process.env.GITHUB_OUTPUT,`status=${result.status}\n`);
  if(process.env.GITHUB_STEP_SUMMARY)await appendFile(process.env.GITHUB_STEP_SUMMARY,`### ACT invoice table input\n- ${result.status}: ${result.status==='ready'?'verified reviewed public release asset':result.reason||'dry run; no download'}\n`);
  if(result.status==='held'&&!dryRun){console.error('::warning::ACT invoice input held; existing ACT rows will be retained. See ACT invoice table input in the run summary.');process.exitCode=1;}
 }catch{console.error('ACT release workflow validation failed');process.exitCode=1;}
}
