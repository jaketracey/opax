/** Public release wire format: verbatim published fields and source provenance only. */
import {createHash} from 'node:crypto';
import {gzipSync,gunzipSync} from 'node:zlib';
export const RELEASE_REPOSITORY='jaketracey/opax';
export const REVIEW_RECEIPT='data/staged/act-invoices/review.json';
export const FORMAT='opax-act-invoices-source-records-v1';
export const PUBLISHED_FIELDS=['supplier_name','supplier_abn','reporting_entity','publish_description','date_invoice_received','payment_date','payment_amount','contract_number'];
export const PROVENANCE_FIELDS=['source_row_position','socrata_id','socrata_sid','socrata_position','snapshot','snapshot_sha256'];
const SOURCE='https://www.data.act.gov.au/Government-and-Transparency/Notifiable-Invoices-Register/kzmf-7uhp';
const CC='https://creativecommons.org/licenses/by/4.0/';
export const sha256=bytes=>createHash('sha256').update(bytes).digest('hex');
const fail=()=>{throw Error('ACT release verification failed; retain existing rows');};
const keys=(value,allowed)=>value&&typeof value==='object'&&!Array.isArray(value)&&Object.keys(value).every(k=>allowed.includes(k));
const digest=value=>typeof value==='string'&&/^[a-f0-9]{64}$/.test(value);
export const sameInputs=(a,b)=>a&&b&&Object.keys(a).length===Object.keys(b).length&&Object.entries(a).every(([k,v])=>digest(v)&&b[k]===v);
export function sourceRelease(bundle,review,reviewBytes,{candidate=false}={}){
 if(review.status!==(candidate?'pending':'approved')||(!candidate&&!/^[a-f0-9]{7,40}$/.test(review.reviewed_commit||''))||!sameInputs(review.inputs,bundle.promotion?.inputs))fail();
 if(!candidate&&bundle.promotion?.reviewed_commit!==review.reviewed_commit)fail();
 if(sha256(bundle.series_jsonl)!==review.inputs['series.jsonl'])fail();
 const records=bundle.series_jsonl.trimEnd().split('\n').map(line=>{
  const row=JSON.parse(line);return Object.fromEntries([...PUBLISHED_FIELDS,...PROVENANCE_FIELDS].map(k=>[k,row[k]]));
 });
 const records_jsonl=records.map(row=>JSON.stringify(row)+'\n').join('');
 const allowed=['schema','dataset_id','title','publisher','attribution','source_url','download_url','generated_at','snapshot','snapshot_sha256','licence','licence_url','licence_grant','description','metadata_sha256','rows','payment_date_min','payment_date_max','catalogued_period','source_updated_at','no_unique_invoice_id','published_totals','coverage'];
 const provenance=Object.fromEntries(allowed.filter(k=>Object.hasOwn(bundle,k)).map(k=>[k,bundle[k]]));
 const README=`ACT Government — Notifiable Invoices Register (kzmf-7uhp)\n\nThis is a verbatim mirror of the published records for OPAX's table load. All eight published field values, nulls and exact duplicates are retained; the only extra record fields are snapshot and source-row provenance. No supplier index, profiles or joins are included.\nSource: ${SOURCE}\nSnapshot (UTC): ${bundle.snapshot}\nOriginal snapshot SHA-256: ${bundle.snapshot_sha256}\nLicence: CC BY 4.0 (${CC})\nAttribution: ACT Government\nThis repository and its release assets are public. Period and numeric display fields are derived only when loading the table, outside this mirror.\n`;
 const wire={format:FORMAT,README,provenance,records_jsonl,review:{status:review.status,reviewed_commit:review.reviewed_commit,receipt:REVIEW_RECEIPT,receipt_sha256:sha256(reviewBytes),inputs:review.inputs,rows:records.length,records_sha256:sha256(records_jsonl)}};
 validateSourceRelease(wire,{candidate});
 return wire;
}
export function validateSourceRelease(wire,{candidate=false}={}){
 if(!keys(wire,['format','README','provenance','records_jsonl','review'])||wire.format!==FORMAT||typeof wire.README!=='string'||!wire.README.includes('verbatim mirror of the published records')||!wire.README.includes('Attribution: ACT Government'))fail();
 const m=wire.provenance,r=wire.review;
 const allowed=['schema','dataset_id','title','publisher','attribution','source_url','download_url','generated_at','snapshot','snapshot_sha256','licence','licence_url','licence_grant','description','metadata_sha256','rows','payment_date_min','payment_date_max','catalogued_period','source_updated_at','no_unique_invoice_id','published_totals','coverage'];
 if(!keys(m,allowed)||m.schema!==1||m.dataset_id!=='kzmf-7uhp'||m.source_url!==SOURCE||m.publisher!=='ACT Government'||m.attribution!=='ACT Government'||m.licence!=='CC BY 4.0'||m.licence_url!==CC||!digest(m.snapshot_sha256)||!Number.isFinite(Date.parse(m.snapshot))||m.no_unique_invoice_id!==true||m.published_totals!==false)fail();
 if(!keys(r,['status','reviewed_commit','receipt','receipt_sha256','inputs','rows','records_sha256'])||r.receipt!==REVIEW_RECEIPT||!digest(r.receipt_sha256)||r.status!==(candidate?'pending':'approved')||(!candidate&&!/^[a-f0-9]{7,40}$/.test(r.reviewed_commit||'')))fail();
 if(typeof wire.records_jsonl!=='string'||sha256(wire.records_jsonl)!==r.records_sha256)fail();
 const records=wire.records_jsonl.trimEnd().split('\n').map(line=>JSON.parse(line));
 if(!records.length||records.length!==m.rows||records.length!==r.rows)fail();
 if(m.coverage&&(!keys(m.coverage,['exact_duplicate_groups','extra_duplicate_rows','observed_months','missing_months','outside_period_rows','missing_payment_dates'])||Object.entries(m.coverage).some(([k,v])=>k==='missing_months'?!Array.isArray(v)||v.some(x=>!/^\d{4}-\d\d$/.test(x)):!Number.isSafeInteger(v)||v<0)))fail();
 if(m.licence_grant&&!keys(m.licence_grant,['name','logoUrl','termsLink']))fail();
 const ids=new Set();
 for(const [i,row] of records.entries()){
  const fields=[...PUBLISHED_FIELDS,...PROVENANCE_FIELDS];
  if(!keys(row,fields)||fields.some(k=>!Object.hasOwn(row,k))||PUBLISHED_FIELDS.some(k=>row[k]!==null&&typeof row[k]!=='string')||row.source_row_position!==i+1||row.snapshot!==m.snapshot||row.snapshot_sha256!==m.snapshot_sha256||typeof row.socrata_id!=='string'||ids.has(row.socrata_id))fail();
  for(const key of ['payment_date','date_invoice_received'])if(row[key]!=null&&row[key]!==''){const date=new Date(row[key]+'Z');if(!/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d+)?$/.test(row[key])||!Number.isFinite(date.getTime())||date.toISOString().slice(0,10)!==row[key].slice(0,10))fail();}
  if(row.payment_amount!=null&&row.payment_amount!==''&&!Number.isFinite(Number(row.payment_amount)))fail();
  ids.add(row.socrata_id);
 }
 return {records,metadata:m,review:r};
}
export function encodeRelease(wire){const raw=Buffer.from(JSON.stringify(wire)+'\n');return {raw,gzip:gzipSync(raw,{level:9})};}
export function validateManifest(m,{candidate=false}={}){
 if(m?.schema!==1||m.repository!==RELEASE_REPOSITORY||m.dataset_id!=='kzmf-7uhp'||m.public!==true||!/^act-invoices-[A-Za-z0-9._-]+$/.test(m.release_tag||'')||!/^act-invoices-[A-Za-z0-9._-]+\.json\.gz$/.test(m.asset_name||'')||!Number.isSafeInteger(m.bytes)||m.bytes<1||m.bytes>25_000_000||!digest(m.sha256)||!Number.isSafeInteger(m.uncompressed_bytes)||m.uncompressed_bytes>200_000_000||!digest(m.uncompressed_sha256)||!digest(m.snapshot_sha256)||!Number.isFinite(Date.parse(m.snapshot))||!/^\d{4}-\d\d-\d\d$/.test(m.snapshot_date||'')||m.review?.receipt!==REVIEW_RECEIPT||!digest(m.review.sha256)||m.review.status!==(candidate?'pending':'approved')||(!candidate&&!/^[a-f0-9]{7,40}$/.test(m.review.reviewed_commit||'')))fail();
 return m;
}
export function verifyReleaseAsset(bytes,manifest,reviewBytes){
 validateManifest(manifest);
 const receipt=JSON.parse(reviewBytes);
 if(sha256(reviewBytes)!==manifest.review.sha256||receipt.status!=='approved'||receipt.reviewed_commit!==manifest.review.reviewed_commit||bytes.length!==manifest.bytes||sha256(bytes)!==manifest.sha256)fail();
 const raw=gunzipSync(bytes,{maxOutputLength:manifest.uncompressed_bytes});
 if(raw.length!==manifest.uncompressed_bytes||sha256(raw)!==manifest.uncompressed_sha256)fail();
 const wire=JSON.parse(raw);const decoded=validateSourceRelease(wire);
 if(decoded.metadata.snapshot!==manifest.snapshot||decoded.metadata.snapshot_sha256!==manifest.snapshot_sha256||decoded.review.receipt_sha256!==manifest.review.sha256||decoded.review.reviewed_commit!==receipt.reviewed_commit||!sameInputs(decoded.review.inputs,receipt.inputs))fail();
 return {raw,wire,decoded};
}
