/** Input labels describe the calculator's measure; model prose stays intact. */
export const RECEIPTS_WRITING_RULE = 'Call each federal total by the measure label supplied with it, and keep its source, recipient, period and amount together in one sentence.'

export function receiptMeasureLabel(measure:string,industry?:string):string {
  if(measure==='donations')return 'donations received (AEC receipt type: Donation Received)'
  if(measure==='other_receipts')return 'other receipts (AEC receipt type: Other Receipt, which includes loans)'
  if(measure==='subscriptions')return 'subscriptions (AEC receipt type: Subscription, such as membership and affiliation fees)'
  if(industry==='finance')return 'disclosed receipts, all types, including bank loans to the party'
  if(industry==='unions')return 'disclosed receipts, all types (donations, affiliation fees and other receipts)'
  return 'disclosed receipts, all types (donations, loans and other receipts)'
}
export function receiptMeasureHeading(measure:string,finance=false,context:'ranking'|'comparison'='ranking'):string {
  if(context==='comparison'&&measure==='receipts_all')return 'All receipt types'
  return measure==='donations'?'Donations':measure==='other_receipts'?'Other receipts (includes loans and other amounts)':measure==='subscriptions'?'Subscriptions':finance?'Disclosed receipts (includes loans)':'Disclosed receipts'
}
/** The measure a ranking uses when the AEC records no donations, as it reads in a sentence. */
export function receiptMeasurePhrase(measure:string):string {
  return measure==='other_receipts'?'other receipts (includes loans and other amounts)':measure==='subscriptions'?'subscriptions (membership and affiliation fees)':'disclosed receipts of all types'
}
// Built once: a formatter costs about 0.1 ms, and one money answer formats a dozen or more amounts.
const wholeDollars=new Intl.NumberFormat('en-AU',{style:'currency',currency:'AUD',minimumFractionDigits:0,maximumFractionDigits:2})
const centDollars=new Intl.NumberFormat('en-AU',{style:'currency',currency:'AUD',minimumFractionDigits:2,maximumFractionDigits:2})
export const receiptDollars=(n:number)=>(Number.isInteger(n)?wholeDollars:centDollars).format(n)
