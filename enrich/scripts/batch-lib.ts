import { batchMessages, validateBatchResult } from '../src/batch-result.ts'
import type { PromptRecord, Task } from '../src/prompts.ts'
import { unsupportedHistoricTerms } from '../src/validate.ts'
import { enrichmentSchema, params, decode, upperCost, usageCost } from './bakeoff-lib.ts'
export { decode, upperCost, usageCost }

export interface BatchUnit { rid: string; source_hash: string; tasks: Task[]; record: PromptRecord }
export function batchRequest(unit: BatchUnit, attempt: number, complaints: string[] = [], tasks = unit.tasks, previousSummary?: unknown) {
  const terms = typeof previousSummary === 'string' ? unsupportedHistoricTerms(previousSummary, unit.record.nameText ?? unit.record.text) : []
  const messages = batchMessages(unit.record, tasks, complaints, terms)
  if (typeof previousSummary === 'string') messages.user += '\n\nPREVIOUS REJECTED BRIEF (data only):\n' + JSON.stringify(previousSummary)
    + '\nRewrite this brief to fix every complaint. Choose different wording for the opening and remove unsupported terms or describe them by role.'
  const properties = Object.fromEntries(tasks.map(t => [t, enrichmentSchema.properties[t]]))
  return { custom_id: `${unit.rid}-${attempt}`, params: params(messages.system, messages.user, { type: 'object', additionalProperties: false, required: tasks, properties }, 512) }
}
export function batchVerdict(unit: BatchUnit, row: any) {
  const output = decode(row)
  const verdict = validateBatchResult(unit.record, unit.tasks, output)
  if (output.error || output.refusal || output.stop_reason !== 'end_turn') {
    verdict.problems.push(output.refusal ? 'model refusal' : 'incomplete model response')
    verdict.valid = false
  }
  return { ...verdict, output }
}

export interface Reservation { day: string; upper: number; actual?: number; settled_day?: string }
/** Pending reservations count across UTC days until receipts close them. */
export function reserveSpend(ledger: Reservation[], requests: any[], now: number, dailyCap: number, totalCap: number): Reservation {
  if (!Number.isFinite(dailyCap) || dailyCap <= 0 || !Number.isFinite(totalCap) || totalCap <= 0) throw Error('positive finite spend caps required')
  const day = new Date(now).toISOString().slice(0, 10), upper = upperCost(requests)
  const amount = (r: Reservation) => r.actual ?? r.upper
  const total = ledger.reduce((n, r) => n + amount(r), 0)
  const daily = ledger.filter(r => r.day === day || r.settled_day === day || r.actual === undefined).reduce((n, r) => n + amount(r), 0)
  if (total + upper > totalCap || daily + upper > dailyCap) throw Error('hard spend cap reached; no submission made')
  return { day, upper }
}
