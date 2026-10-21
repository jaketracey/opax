import {actInvoicePublicCopyNote,actInvoicePeriod,actInvoiceSnapshotDate,actInvoiceCoverageNotes,actInvoiceEntityDefinitions,actInvoiceEntityName} from '../public/act-invoices-context.js'
import type {Page} from '../public/datatable.js'
import {serializeQuery} from '../public/datatable.js'
import {actInvoicesConfig,actInvoicesURL,actInvoicesTableHTML,ACT_INVOICES_ID,ACT_INVOICES_SOURCE} from '../public/act-invoices-table.js'
import {tableApi} from './table-api.ts'
import {shortDate} from '../public/format.js'

const CC='https://creativecommons.org/licenses/by/4.0/'
const esc=(v:unknown)=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!))
import {actInvoicesMetadata,actInvoicesPublicCopy,type ActInvoicesMetadata} from './act-invoices-metadata.ts'
type Env={TABLE_DB?:D1Database;CACHE_EPOCH?:string}
type Block=(title:string,text:string,links?:string,crumbs?:{label:string;href?:string}[])=>string
export async function actInvoicesPage(url:URL,env:Env,block:Block){
 const title='ACT notifiable invoices'
 const description='Monthly paid-invoice disclosures by ACT Territory entities for invoices valued at $25,000 or more. The register runs from July 2015 to the latest published month. It is not all ACT spending.'
 let metadata:ActInvoicesMetadata|null=null
 try{if(env.TABLE_DB)metadata=await actInvoicesMetadata(env.TABLE_DB)}catch{/* Source remains available. */}
 const guard=actInvoicesURL(url)
 if(!metadata)return {status:404,title:title+' · OPAX',description,noindex:true,prerender:block(title,description,`<p>These records are not available here yet. <a href="${ACT_INVOICES_SOURCE}">Read the ACT Government register</a>. Dataset ID: kzmf-7uhp · Snapshot: unavailable · <a href="https://creativecommons.org/licenses/by/4.0/">CC BY 4.0</a> · Attribution: ACT Government.</p>`,[{label:title}])}
 let response=await tableApi(new Request('https://local.invalid/api/table/act-invoices?'+serializeQuery(guard.query)),{TABLE_DB:env.TABLE_DB!,CACHE_EPOCH:env.CACHE_EPOCH})
 if(response.status===400){url.search='';response=await tableApi(new Request('https://local.invalid/api/table/act-invoices'),{TABLE_DB:env.TABLE_DB!,CACHE_EPOCH:env.CACHE_EPOCH})}
 if(!response.ok)return {status:503,title:title+' · OPAX',description,noindex:true,prerender:block(title,description,`<p>The invoice records could not be loaded. <a href="${ACT_INVOICES_SOURCE}">Read the ACT Government register</a>. Dataset ID: kzmf-7uhp · Snapshot: unavailable · <a href="https://creativecommons.org/licenses/by/4.0/">CC BY 4.0</a> · Attribution: ACT Government.</p>`,[{label:title}])}
 const page=await response.json() as Page
 const definitions=actInvoiceEntityDefinitions(metadata.description)
 const key=Object.keys(definitions).sort().map(code=>`<dt>${esc(code)}</dt><dd>${esc(actInvoiceEntityName(code,definitions))}</dd>`).join('')
 const coverage=actInvoiceCoverageNotes(metadata).slice(1).map(note=>`<p>${esc(note)}</p>`).join('')
 const copy=actInvoicesPublicCopy(metadata)
 const publicCopy=copy?`<p data-act-public-copy>${esc(actInvoicePublicCopyNote(copy)).replace(esc(copy.url),`<a href="${esc(copy.url)}">View the public source copy</a>`)}</p>`:''
 const config=actInvoicesConfig()
 const receipt=`<p class="act-invoices-receipt">Source: <a href="${ACT_INVOICES_SOURCE}">ACT Government · Notifiable Invoices Register</a> · Dataset ID: ${ACT_INVOICES_ID} · Snapshot: <time datetime="${esc(metadata.snapshot)}">${esc(actInvoiceSnapshotDate(metadata.snapshot))} (Melbourne)</time> · <a href="${CC}">CC BY 4.0</a></p><details class="act-invoices-receipt"><summary>Attribution and source receipt</summary><p>Attribution: ${esc(metadata.attribution)}. Source records reproduced under CC BY 4.0; date display and payment-period filters added by OPAX.</p>${publicCopy}<p>Snapshot timestamp (UTC): ${esc(metadata.snapshot)}</p><p>Snapshot SHA-256: ${esc(metadata.snapshot_sha256)}</p></details>`
 return {status:200,title:title+' · OPAX',description,noindex:Boolean(url.search)||guard.rejected,
  prerender:block(title,description,'<p><a href="/money/contracts">Commonwealth contract notices</a></p>',[{label:title}])+`<div class="wrap act-invoices-content"><section aria-label="ACT published invoice records"><p>Catalogued period: ${esc(actInvoicePeriod(metadata.catalogued_period))}. Dates and amounts follow the published payment records. The $25,000 threshold applies to invoice value; an individual payment can be smaller. Amounts are Australian dollars. Search covers descriptions and reporting entities.</p><details class="act-invoices-entity-key"><summary>Reporting entity names · publisher’s key</summary><p>Raw codes are kept in filters and exports. The definitions and code references below are from the publisher.</p><dl>${key}</dl></details><div data-act-invoices-table>${actInvoicesTableHTML(config,page,url,definitions)}<script type="application/json" data-act-entity-definitions>${JSON.stringify(definitions).replace(/</g,'\\u003c')}</script></div>${receipt}<details><summary>How to read these records</summary>${coverage}<p>A contract number may appear on several source records. Contract values and invoice payments describe different things and should not be added together.</p><p>Some published payment dates precede the stated July 2015 start; the earliest is ${esc(shortDate(metadata.payment_date_min))}. Missing dates and amounts also remain as published, without correction. The latest payment date in this snapshot is ${esc(shortDate(metadata.payment_date_max))}. The publisher says records are published within 21 days after the month paid. This does not establish complete spending or complete reporting by every entity.</p></details><p><a href="mailto:corrections@opax.com.au">Report a correction</a>.</p></section></div><script type="module" src="/act-invoices.js"></script>`}
}
