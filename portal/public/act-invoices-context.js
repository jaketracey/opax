import {shortDate} from './format.js';
/** Source-level context only; never a supplier key, index or identity join. */
export const actInvoicePeriod=value=>String(value||'').replace(/\s+-\s+/g,' to ');
export function actInvoiceSnapshotDate(value){
 const parts=Object.fromEntries(new Intl.DateTimeFormat('en-CA',{timeZone:'Australia/Melbourne',day:'2-digit',month:'2-digit',year:'numeric'}).formatToParts(new Date(value)).map(p=>[p.type,p.value]));
 return shortDate(`${parts.year}-${parts.month}-${parts.day}`);
}
export const actInvoicePublicCopyNote=copy=>`OPAX keeps a verbatim public copy of the published file for its table load: ${copy.url}. SHA-256: ${copy.sha256}.`;
export function actInvoiceCoverageNotes(m){
 const c=m.coverage;
 return [
  `Source: ACT Government; Notifiable Invoices Register; dataset kzmf-7uhp; ${m.source_url}; snapshot ${m.snapshot}; CC BY 4.0; attribution: ACT Government.`,
  'The $25,000 threshold is invoice value, not each payment amount. These paid-invoice disclosures are not all ACT spending.',
  'Invoice-received dates were added for reporting from July 2017. June 2017 may use the date a valid invoice was received or, in a small number of cases, the finance-system entry date. Some received dates are missing, including scheduled payments and entities unable to transmit the date.',
  'There is no unique invoice ID. Row positions and Socrata IDs locate snapshot records, not invoices.'+(c?` ${c.exact_duplicate_groups.toLocaleString('en-AU')} duplicate groups / ${c.extra_duplicate_rows.toLocaleString('en-AU')} extra copies kept as published.`:''),
  c?`Snapshot month coverage: ${c.observed_months} payment months from ${actInvoicePeriod(m.catalogued_period)}; ${c.missing_months.length} empty months in that span. ${c.outside_period_rows} rows have pre-start payment dates and ${c.missing_payment_dates} have no payment date. A month appearing does not establish complete entity reporting.`:`Catalogued period: ${actInvoicePeriod(m.catalogued_period)}. A month appearing does not establish complete entity reporting.`,
  'Reporting-entity labels changed over time, including 19 August 2025. Codes remain as published. Financial year and month use payment date, not received date. Exact duplicates and missing values are retained; no spending total is computed.',
  ...(m.public_copy?[actInvoicePublicCopyNote(m.public_copy)]:[]),
 ];
}
export function actInvoiceEntityDefinitions(description){
 const text=String(description||'');const start=text.indexOf('Reporting Entity Key');
 const result=Object.create(null);
 if(start<0)return result;
 for(const line of text.slice(start).split('\n')){
  const match=/^\s*[\uf0d8\u2022]?\s*([^:\n]+):\s*(\S[^\n]*)$/.exec(line);
  if(!match)continue;
  const code=match[1].trim(),definition=match[2].trim();
  // Publisher definitions are single-line code/name pairs, not narrative prose.
  if(code.length>150||/^(?:For |A new |The )/.test(code))continue;
  (result[code]||=[]).push(definition);
 }
 return result;
}
export function actInvoiceEntityName(code,definitions){
 const seen=new Set();let current=String(code),parts=[];
 while(!seen.has(current)&&seen.size<5){
  seen.add(current);const values=[...new Set(definitions?.[current]||[])];
  if(!values.length)break;
  parts.push(values.join(' / '));if(values.length!==1)break;current=values[0];
 }
 return parts.join(' → ');
}
