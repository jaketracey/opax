import {shortMoney} from '../public/format.js'
import {sourceLineHTML} from '../public/party-page.js'
import {donorDisclosure,receiptScopeLabel,type DonorDisclosureRecord} from '../public/donor-disclosure.js'
import {escapeHtml as esc,safeHref} from './seo-content.ts'
import {fy} from '../public/money-scope.js'

/** The asset's years columns, also used by app.js renderCampaignerEntry. */
export type CampaignerYear = [string,number|null,number|null,number|null,number|null,number|null]
const campaignerColumns = ['receipts','payments','debts','electoral expenditure','gifts received']

export function campaignerReturnsHTML(name: string, rows: CampaignerYear[], registerUrl: string): string {
  if (!rows.length) return ''
  const body = rows.slice().reverse().map(row => {
    const figures = campaignerColumns.map((noun,i) => row[i+1] == null ? '' : `${noun} ${shortMoney(Number(row[i+1]))}`).filter(Boolean).join(' · ')
    return `<tr><th scope="row">${esc(fy(row[0]))}</th><td>${esc(figures || 'nothing itemised on the return')}</td></tr>`
  }).join('')
  const href = safeHref(registerUrl)
  return `<h2>The money on the returns</h2><div class="table-scroll"><table data-campaigner-returns><caption>Every year on the return</caption><thead><tr><th scope="col">Year</th><th scope="col">The money on the returns</th></tr></thead><tbody>${body}</tbody></table></div>
    <p class="fineprint">These are the totals ${esc(name)} put on its own annual returns to the AEC. Receipts are what it took in and payments what it spent; neither is a donation to or from a party, and a party named on a return neither gave nor received this money. A blank column is a line the return left empty, not a nil figure, and amounts under the disclosure threshold are never itemised, so every number is a floor. Debts are balances owed at 30 June, not new borrowing.</p>
    ${sourceLineHTML({source:'AEC Transparency Register',originals:href ? [{href,label:'Open the register'}] : [],licence:'CC BY 4.0'})}`
}

const sources: Record<string,[string,string]> = {
  federal:['Federal','AEC annual returns'],qld:['Queensland','ECQ'],vic:['Victoria','VEC'],tas:['Tasmania','TEC'],
}

export function donorRecordsHTML(records: DonorDisclosureRecord[]): string {
  const blocks = records.filter(record => record.kind !== 'reference' && Number.isFinite(record.total)).map(record => {
    const jurisdiction = record.jurisdiction || 'federal'
    const [label,source] = sources[jurisdiction] || [jurisdiction,'Disclosure returns']
    const federal = jurisdiction === 'federal'
    const n = record.count || 0
    const span = record.firstYear ? record.firstYear === record.lastYear || !record.lastYear ? String(record.firstYear) : `${record.firstYear}–${record.lastYear}` : ''
    const unit = federal ? 'record' : 'receipt'
    const originals = [...new Map((record.returnReferences || []).map(ref => [safeHref(ref.url || ''),ref] as const).filter(([href]) => href)).entries()].slice(0,3)
      .map(([href,ref]) => ({href:href!,label:ref.return_type || 'Disclosure return'}))
    return `<section class="donor-record" data-donor-record="${esc(jurisdiction)}"><h2>${esc(label)}: ${federal ? 'AEC records' : 'Disclosed receipts'}</h2>
      <p>${esc(donorDisclosure(record).name)}: <b>${esc(shortMoney(record.total))}</b> across ${n.toLocaleString('en-AU')} ${unit}${n === 1 ? '' : 's'}${span ? `, ${esc(span)}` : ''}.</p>
      ${federal ? `<p class="entry-scope">${esc(receiptScopeLabel({typed:false,firstYear:null,lastYear:null}))}</p>` : ''}
      ${sourceLineHTML({source,state:'totals are a floor',originals})}</section>`
  }).join('')
  return blocks ? `${blocks}<p class="fineprint">State and federal returns are not summed: AEC returns already include state branch receipts.</p>` : ''
}
