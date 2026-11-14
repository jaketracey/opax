// Which federal money graph a test is about.
//
// Production publishes the typed AEC export (#310): every donor-to-party edge
// carries `by_type` / `by_type_year` and `meta.receipt_types` switches the
// calculator to donation-only leads. `typedMoney()` is that published file,
// checked to be typed so a test can never silently fall back.
//
// `untypedMoney()` is the same file with every receipt-type field removed, which
// is byte-for-byte the pre-#310 export (legacy `total`, `count`, `byYear` only).
// Tests that prove the calculator still works without receipt types use it.
import {readFileSync} from 'node:fs'
import assert from 'node:assert/strict'

const root = new URL('../public', import.meta.url).pathname
export const MONEY_PATH = '/graph/money.json'
const read = path => JSON.parse(readFileSync(root + path, 'utf8'))

export const RECEIPTS_PATH = '/graph/money-receipts.json'
const typedCache = read(MONEY_PATH)
assert.deepEqual(
  typedCache.meta?.receipt_types && {available: typedCache.meta.receipt_types.available, schema: typedCache.meta.receipt_types.schema, donation_type: typedCache.meta.receipt_types.donation_type},
  {available: true, schema: 1, donation_type: 'donation_received'},
  'public/graph/money.json is expected to be the typed AEC export',
)

export function stripReceiptTypes(graph) {
  const out = structuredClone(graph)
  delete out.meta.receipt_types
  for (const row of [...out.nodes, ...out.edges]) { delete row.by_type; delete row.by_type_year }
  return out
}
const untypedCache = stripReceiptTypes(typedCache)

export const typedMoney = () => structuredClone(typedCache)
export const untypedMoney = () => structuredClone(untypedCache)
export const uncappedMoney = () => read(RECEIPTS_PATH)
const variants = {typed: typedMoney, untyped: untypedMoney, uncapped: uncappedMoney}

/** Asset reader returning parsed JSON (null when missing); money.json is the chosen variant. */
export function moneyAsset(variant) {
  const graph = variants[variant]
  assert.ok(graph, 'money variant must be typed or untyped')
  return async path => {
    if (path === MONEY_PATH || path === RECEIPTS_PATH) return graph()
    try { return read(path) } catch { return null }
  }
}
/** ASSETS-style fetcher over public/, with money.json swapped for the chosen variant. */
export function moneyAssets(variant) {
  const asset = moneyAsset(variant)
  return {fetch: async request => {
    const data = await asset(new URL(request.url).pathname)
    return data === null ? new Response('', {status: 404}) : Response.json(data)
  }}
}
