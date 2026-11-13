// Lending questions (A34 review P3). The AEC types no party receipt as a loan, so no receipt figure is
// ever said to be lent. What a party's own return does declare is its debts owed at 30 June, with the
// largest creditors for the latest year (aec-extras.json, from ext_aec_debts). Those are listed as
// debts the return declares, never matched to a receipt.
import { partyReturns } from '../../public/donor-disclosure.js'

type Creditor = { name: string; amount: number; type?: string }
type Extras = { parties?: Record<string, { debts?: { year: string; total: number; lenders?: number; top?: Creditor[] } }> }

export const LENDING_NOTE = 'Party returns give each receipt an AEC type, and none of those types is a loan, so OPAX gives these figures as receipts. Debts a party declares are listed separately and are not matched to any receipt.'

const aud = (n: number) => '$' + Math.round(n).toLocaleString('en-AU')

/** The debts line for one party, or null when the published returns hold none for it. */
export function declaredDebtsLine(extras: Extras | null | undefined, party: string): { text: string; total: number; year: string } | null {
  const debts = extras?.parties?.[party]?.debts
  if (!debts || !(debts.total > 0) || !/^\d{4}-\d{2}$/.test(debts.year)) return null
  const end = Number(debts.year.slice(0, 4)) + 1
  const top = (debts.top ?? []).filter(c => c.name && c.amount > 0).slice(0, 3)
  const creditor = (c: Creditor) => `${c.name} (${aud(c.amount)}${c.type === 'Financial' ? ', a financial institution' : ''})`
  const list = top.length < 2 ? top.map(creditor).join('') : top.slice(0, -1).map(creditor).join(', ') + ' and ' + creditor(top.at(-1)!)
  const text = `${partyReturns(party)} for ${debts.year} declare ${aud(debts.total)} in debts owed at 30 June ${end}`
    + (top.length ? `; the largest creditor${top.length === 1 ? '' : 's'} listed ${top.length === 1 ? 'is' : 'are'} ${list}` : '') + '.'
  return { text, total: debts.total, year: debts.year }
}

/** The note and, where the returns declare any, the debts line, as citations for a party's lending question. */
export async function lendingLines(asset: (path: string) => Promise<unknown>, party: string, origin: string): Promise<{ label: string; url: string; value?: number }[]> {
  let extras: Extras | null = null
  try { extras = await asset('/graph/aec-extras.json') as Extras | null } catch { extras = null }
  const debts = declaredDebtsLine(extras, party)
  const url = `${origin}/graph/aec-extras.json`
  return [{ label: LENDING_NOTE, url: `${origin}/methods` }, ...(debts ? [{ label: debts.text, url, value: debts.total }] : [])]
}
