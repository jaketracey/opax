/** Input labels describe the calculator's measure; model prose stays intact. */
export const RECEIPTS_WRITING_RULE = 'Call each federal total by the measure label supplied with it, and keep its source, recipient, period and amount together in one sentence. Call a receipt a donation or giving only when its measure is donations (AEC Donation Received); give a receipt marked aside in its own words, after the ranking, as other receipts or public funding.'

/** Legacy totals for donor-to-party pairs the typed AEC export holds without any receipt-type cells. */
export const UNTYPED_RECEIPTS_LABEL='all receipt types (no type breakdown in the AEC data OPAX holds)'
export function receiptMeasureLabel(measure:string,industry?:string):string {
  if(measure==='donations')return 'donations received (AEC receipt type: Donation Received)'
  // Describe the AEC type, never what a receipt was: OPAX matches no receipt to a declared debt, so none is called a loan.
  if(measure==='other_receipts')return 'other receipts (AEC receipt type: Other Receipt, for amounts other than donations or subscriptions)'
  if(measure==='subscriptions')return 'subscriptions (AEC receipt type: Subscription, such as memberships, union affiliation fees and business-forum packages)'
  if(industry==='unions')return 'disclosed receipts, all types (donations, affiliation fees and other receipts)'
  return 'disclosed receipts, all types (donations, subscriptions and other receipts)'
}
export function receiptMeasureHeading(measure:string,finance=false,context:'ranking'|'comparison'='ranking'):string {
  if(context==='comparison'&&measure==='receipts_all')return 'All receipt types'
  return measure==='donations'?'Donations':measure==='other_receipts'?'Other receipts':measure==='subscriptions'?'Subscriptions':'Disclosed receipts'
}
/** The measure a ranking uses when the AEC records no donations, as it reads in a sentence. */
export function receiptMeasurePhrase(measure:string):string {
  return measure==='other_receipts'?'other receipts (amounts other than donations or subscriptions)':measure==='subscriptions'?'subscriptions (memberships, union affiliation fees and business-forum packages)':'disclosed receipts of all types'
}
// Built once: a formatter costs about 0.1 ms, and one money answer formats a dozen or more amounts.
const wholeDollars=new Intl.NumberFormat('en-AU',{style:'currency',currency:'AUD',minimumFractionDigits:0,maximumFractionDigits:2})
const centDollars=new Intl.NumberFormat('en-AU',{style:'currency',currency:'AUD',minimumFractionDigits:2,maximumFractionDigits:2})
export const receiptDollars=(n:number)=>(Number.isInteger(n)?wholeDollars:centDollars).format(n)
/** An industry grouping key as a modifier before a noun: "fossil fuel-linked", "union donors", "waste management sources". */
const INDUSTRY_MODIFIERS:Record<string,string>={fossil_fuels:'fossil fuel',unions:'union',parties:'party'}
export const industryModifier=(industry:string)=>INDUSTRY_MODIFIERS[industry]??industry.replaceAll('_',' ')
