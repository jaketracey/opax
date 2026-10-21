import type {ActInvoiceCoverage,ActInvoicePublicCopy} from '../public/act-invoices-context.js'
import releaseManifest from '../../data/promoted/act-invoices/release.json' with {type:'json'}
import {ACT_INVOICES_ID,ACT_INVOICES_SOURCE} from '../public/act-invoices-table.js'
const CC='https://creativecommons.org/licenses/by/4.0/'
/** The pinned public mirror belongs only to this approved snapshot and review. */
export function actInvoicesPublicCopy(m:ActInvoicesMetadata,release=releaseManifest):ActInvoicePublicCopy|undefined{
 if(release.repository!=='jaketracey/opax'||release.public!==true||release.dataset_id!==ACT_INVOICES_ID||release.review.status!=='approved'||release.snapshot!==m.snapshot||release.snapshot_sha256!==m.snapshot_sha256||release.review.reviewed_commit!==m.promotion.reviewed_commit||!/^act-invoices-[A-Za-z0-9._-]+$/.test(release.release_tag)||!/^[a-f0-9]{64}$/.test(release.sha256))return undefined
 return {url:'https://github.com/jaketracey/opax/releases/tag/'+release.release_tag,sha256:release.sha256}
}
export type ActInvoicesMetadata={coverage?:ActInvoiceCoverage;description?:string;schema:number;dataset_id:string;source_url:string;publisher:string;attribution:string;licence:string;licence_url:string;snapshot:string;snapshot_sha256:string;catalogued_period:string;payment_date_min:string;payment_date_max:string;no_unique_invoice_id:boolean;published_totals:boolean;promotion:{reviewed_commit:string}}
export function validActInvoicesMetadata(m:ActInvoicesMetadata|null):m is ActInvoicesMetadata{
 return Boolean(m&&m.schema===1&&m.dataset_id===ACT_INVOICES_ID&&m.source_url===ACT_INVOICES_SOURCE&&m.publisher==='ACT Government'&&m.attribution==='ACT Government'&&m.licence==='CC BY 4.0'&&m.licence_url===CC&&/^[a-f0-9]{64}$/.test(m.snapshot_sha256)&&Number.isFinite(Date.parse(m.snapshot))&&m.no_unique_invoice_id===true&&m.published_totals===false&&/^[a-f0-9]{7,40}$/.test(m.promotion?.reviewed_commit||''))
}
export async function actInvoicesMetadata(db:D1Database):Promise<ActInvoicesMetadata|null>{
 const text=await db.prepare("SELECT value FROM table_meta WHERE key='act-invoices'").first<string>('value')
 if(!text)return null
 const metadata=JSON.parse(text) as ActInvoicesMetadata
 return validActInvoicesMetadata(metadata)?metadata:null
}
