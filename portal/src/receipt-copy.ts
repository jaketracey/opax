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
  return measure==='donations'?'Donations':measure==='other_receipts'?'Other receipts (includes loans)':measure==='subscriptions'?'Subscriptions':finance?'Disclosed receipts (includes loans)':'Disclosed receipts'
}
export const receiptDollars=(n:number)=>new Intl.NumberFormat('en-AU',{style:'currency',currency:'AUD',minimumFractionDigits:Number.isInteger(n)?0:2,maximumFractionDigits:2}).format(n)
