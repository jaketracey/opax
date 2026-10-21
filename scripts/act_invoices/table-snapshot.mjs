import {FORMAT,validateSourceRelease} from './release-bundle.mjs';
/** Offline reviewed artifact -> existing D1 reload set. Never reads staging. */
import {readFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {createHash} from 'node:crypto';
import {ACT_INVOICES_ID,ACT_INVOICES_SOURCE,ACT_INVOICES_SEARCH,ACT_INVOICES_FILTERS} from '../../portal/public/act-invoices-table.js';
const CC='https://creativecommons.org/licenses/by/4.0/';
export async function actInvoicesSnapshot(root,{releaseStatus=process.env.OPAX_ACT_INVOICES_RELEASE_STATUS}={}){
 if(releaseStatus!=null&&releaseStatus!=='ready')return {rows:[],metadata:null};
 let text;
 try{text=await readFile(resolve(root,'../../data/promoted/act-invoices/table.json'),'utf8');}
 catch(error){if(error.code==='ENOENT')return {rows:[],metadata:null};throw error;}
 return decodeActInvoicesSnapshot(JSON.parse(text));
}
export function decodeActInvoicesSnapshot(bundle){
 if(bundle.format===FORMAT){
  const {records,metadata,review}=validateSourceRelease(bundle);
  const rows=records.map(source=>{
   const day=key=>{const value=source[key];if(value==null||value==='')return null;if(!/^\d{4}-\d\d-\d\dT/.test(value)||!Number.isFinite(Date.parse(value)))throw Error('ACT release date invalid');return value.slice(0,10);};
   const payment_day=day('payment_date'),received_day=day('date_invoice_received');
   const amount=source.payment_amount==null||source.payment_amount===''?null:Number(source.payment_amount);
   if(amount!==null&&!Number.isFinite(amount))throw Error('ACT release amount invalid');
   const fy=payment_day?Number(payment_day.slice(0,4))-(Number(payment_day.slice(5,7))<7):null;
   return {row:{...source,id:metadata.snapshot_sha256+':'+source.source_row_position,payment_day,received_day,month:payment_day?.slice(0,7)||null,financial_year:fy?`${fy}-${String(fy+1).slice(-2)}`:null,amount,dataset_id:metadata.dataset_id,source_url:metadata.source_url,licence:metadata.licence,licence_url:metadata.licence_url,attribution:metadata.attribution}};
  });
  return {rows,metadata:{...metadata,nightly:false,search_keys:ACT_INVOICES_SEARCH,filters:ACT_INVOICES_FILTERS,promotion:{reviewed_commit:review.reviewed_commit,inputs:review.inputs,counts:{rows:rows.length},release_receipt:review.receipt,release_receipt_sha256:review.receipt_sha256}}};
 }
 const fail=()=>{throw Error('ACT invoice reviewed snapshot invalid; reload held');};
 if(bundle.schema!==1||bundle.dataset_id!==ACT_INVOICES_ID||bundle.source_url!==ACT_INVOICES_SOURCE||bundle.publisher!=='ACT Government'||bundle.attribution!=='ACT Government'||bundle.licence!=='CC BY 4.0'||bundle.licence_url!==CC||bundle.no_unique_invoice_id!==true||bundle.published_totals!==false||!/^[a-f0-9]{7,40}$/.test(bundle.promotion?.reviewed_commit||'')||!/^[a-f0-9]{64}$/.test(bundle.snapshot_sha256)||typeof bundle.series_jsonl!=='string')fail();
 if(JSON.stringify(bundle.search_keys)!==JSON.stringify(ACT_INVOICES_SEARCH)||JSON.stringify(bundle.filters)!==JSON.stringify(ACT_INVOICES_FILTERS)||bundle.nightly!==false)fail();
 const hash=createHash('sha256').update(bundle.series_jsonl).digest('hex');
 if(hash!==bundle.promotion.inputs?.['series.jsonl'])fail();
 const rows=bundle.series_jsonl.trimEnd().split('\n').map(line=>JSON.parse(line));
 if(!rows.length||rows.length!==bundle.rows||rows.length!==bundle.promotion.counts.rows)fail();
 const ids=new Set(),coordinates=new Set(),sourceIds=new Set();
 const fields=['supplier_name','supplier_abn','reporting_entity','publish_description','date_invoice_received','payment_date','payment_amount','contract_number','id','source_row_position','socrata_id','socrata_sid','socrata_position','snapshot','snapshot_sha256','payment_day','received_day','month','financial_year','amount'];
 const output=rows.map((row,index)=>{
  if(Object.keys(row).some(k=>!fields.includes(k))||fields.some(k=>!Object.hasOwn(row,k))||row.snapshot_sha256!==bundle.snapshot_sha256||row.snapshot!==bundle.snapshot||row.source_row_position!==index+1||row.id!==bundle.snapshot_sha256+':'+(index+1)||ids.has(row.id)||sourceIds.has(row.socrata_id)||coordinates.has(row.source_row_position))fail();
  if(row.amount!==null&&(typeof row.amount!=='number'||!Number.isFinite(row.amount)||row.amount!==Number(row.payment_amount)))fail();
  ids.add(row.id);coordinates.add(row.source_row_position);sourceIds.add(row.socrata_id);
  return {row:{...row,dataset_id:bundle.dataset_id,source_url:bundle.source_url,licence:bundle.licence,licence_url:bundle.licence_url,attribution:bundle.attribution}};
 });
 const {series_jsonl,...metadata}=bundle;
 return {rows:output,metadata};
}
