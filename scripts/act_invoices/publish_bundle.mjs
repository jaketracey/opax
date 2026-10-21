/** Local packaging by default. The only network mutation requires --upload. */
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {resolve,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';
import {parseArgs} from 'node:util';
import {decodeActInvoicesSnapshot} from './table-snapshot.mjs';
import {sourceRelease,encodeRelease,sha256,validateManifest,REVIEW_RECEIPT,RELEASE_REPOSITORY} from './release-bundle.mjs';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'../..');
export async function publishBundle({root:base=root,artifact,tag,asset,output,manifest,candidate=false,upload=false,run=spawnSync}={}){
 if(candidate&&upload)throw Error('Candidate dry runs cannot upload');
 const reviewPath=resolve(base,REVIEW_RECEIPT),reviewBytes=await readFile(reviewPath),review=JSON.parse(reviewBytes);
 let bundle;
 if(candidate){
  const checked=run('python3',['-m','scripts.act_invoices.check','--dry-run'],{cwd:base,encoding:'utf8'});
  if(checked.status!==0)throw Error('Offline candidate staging validation failed');
  const info=JSON.parse(await readFile(resolve(base,'data/staged/act-invoices/hub.json'),'utf8'));
  const r=JSON.parse(await readFile(resolve(base,'data/staged/act-invoices/reconciliation.json'),'utf8'));
  const coverage={exact_duplicate_groups:r.exact_duplicate_groups,extra_duplicate_rows:r.extra_duplicate_rows,observed_months:Object.keys(r.by_month).filter(m=>m>='2015-07'&&m<=info.payment_date_max.slice(0,7)).length,missing_months:r.missing_months,outside_period_rows:Object.entries(r.by_month).filter(([m])=>m<'2015-07').reduce((n,[,v])=>n+v,0),missing_payment_dates:r.missing_payment_dates};
  bundle={...info,coverage,series_jsonl:await readFile(resolve(base,'data/staged/act-invoices/series.jsonl'),'utf8'),promotion:{status:'pending',reviewed_commit:null,inputs:review.inputs,counts:{rows:info.rows}}};
 }else{
  bundle=JSON.parse(await readFile(artifact||resolve(base,'data/promoted/act-invoices/table.json'),'utf8'));
  decodeActInvoicesSnapshot(bundle);
 }
 const wire=sourceRelease(bundle,review,reviewBytes,{candidate});const {raw,gzip}=encodeRelease(wire);
 const snapshotDate=new Intl.DateTimeFormat('en-CA',{timeZone:'Australia/Melbourne',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(bundle.snapshot));
 const revision=review.reviewed_commit?.slice(0,12)||'pending';
 const releaseTag=tag||`act-invoices-${snapshotDate}-${bundle.snapshot_sha256.slice(0,12)}-${revision}`;
 const assetName=asset||`act-invoices-kzmf-7uhp-${snapshotDate}-${revision}.json.gz`;
 const receipt={schema:1,repository:RELEASE_REPOSITORY,public:true,release_tag:releaseTag,asset_name:assetName,bytes:gzip.length,sha256:sha256(gzip),uncompressed_bytes:raw.length,uncompressed_sha256:sha256(raw),dataset_id:bundle.dataset_id,snapshot:bundle.snapshot,snapshot_date:snapshotDate,snapshot_sha256:bundle.snapshot_sha256,review:{receipt:REVIEW_RECEIPT,sha256:sha256(reviewBytes),status:review.status,reviewed_commit:review.reviewed_commit}};
 validateManifest(receipt,{candidate});
 const dir=output||resolve(base,'portal/private/act-invoices/release');await mkdir(dir,{recursive:true});
 const file=resolve(dir,assetName);await writeFile(file,gzip);await writeFile(resolve(dir,'README.md'),wire.README);
 const manifestPath=manifest||resolve(base,'data/promoted/act-invoices/release.json');await mkdir(dirname(manifestPath),{recursive:true});await writeFile(manifestPath,JSON.stringify(receipt,null,2)+'\n');
 if(upload){const result=run('gh',['release','upload',releaseTag,file,'--repo',RELEASE_REPOSITORY],{cwd:base,encoding:'utf8'});if(result.status!==0)throw Error('Release upload failed; no manifest may be promoted to deployment');}
 return {mode:upload?'uploaded':'dry-run',candidate,operation:upload?'uploaded public source mirror':'would upload public source mirror',...receipt};
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const {values}=parseArgs({options:{upload:{type:'boolean'},candidate:{type:'boolean'},tag:{type:'string'},asset:{type:'string'},artifact:{type:'string'},manifest:{type:'string'},'output-dir':{type:'string'}}});
 try{console.log(JSON.stringify(await publishBundle({...values,output:values['output-dir']})));}catch{console.error('ACT bundle failed: approved promotion and matching review receipt required; inspect the release before retrying any upload.');process.exitCode=1;}
}
