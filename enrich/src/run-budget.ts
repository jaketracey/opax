// The federal run's total ceiling is independent of the existing daily guard.
// Admission reserves a maximum first call. Each retry/escalation reserves again
// BEFORE the model starts; uncertain calls keep their reservation indefinitely.
import { priceFor } from './budget.ts'
import { requestBody } from './generate.ts'
import { buildMessages, type PromptRecord } from './prompts.ts'
import { clip, pickText, wordCount } from './text.ts'
import { readClassifications } from './classify.ts'
import type { Config } from './env.ts'
import type { KbResource } from './kb.ts'
import type { NewWork } from './db.ts'

export const USD_PER_NEURON = 0.011 / 1000
export interface RunBudget { run_id: string; max_usd: number }
export interface AdmissionBudget extends RunBudget { initial_neurons: number }

export async function admittedBudget(db: D1Database, rid: string): Promise<RunBudget|null> {
  const run=await db.prepare(`SELECT r.run_id,r.cap_neurons FROM enrichment_units u JOIN enrichment_runs r ON u.run_id=r.run_id
    WHERE u.rid=? AND u.admitted=1`).bind(rid).first<{run_id:string;cap_neurons:number}>()
  return run ? {run_id:run.run_id,max_usd:(run.cap_neurons+0.25)*USD_PER_NEURON} : null
}

export function resourceBudget(resource: KbResource): RunBudget | null {
  const value = resource.extra?.metadata?.enrichment_budget
  if (value === undefined) return null
  const b = value as RunBudget
  if (!b || !/^[a-zA-Z0-9_-]{1,64}$/.test(b.run_id) || !Number.isFinite(b.max_usd) || b.max_usd <= 0 || b.max_usd > 40)
    throw new Error('invalid enrichment hard cap metadata')
  return b
}

export function callUpper(model: string, body: Record<string, unknown>): number {
  // A text token cannot exceed the UTF-8 input byte count. Include JSON/schema
  // framing and a further 1,024-token envelope; reserve the full output limit.
  const input = new TextEncoder().encode(JSON.stringify(body)).length + 1024
  const output = Number(body.max_tokens)
  if (!Number.isInteger(output) || output <= 0) throw new Error('bounded output required')
  const price = priceFor(model)
  return Math.ceil((input * price.input + output * price.output) / 1_000_000)
}

export function admissionBudget(resource: KbResource, rid: string, cfg: Config): AdmissionBudget | null {
  const budget = resourceBudget(resource)
  if (!budget) return null
  const labels = readClassifications(resource)
  const tag = (name: string) => labels.find(c => c.labelset === name)?.label ?? null
  const text = pickText(resource.data?.texts)
  const record: PromptRecord = { rid, slug: resource.slug, title: resource.title ?? '', kind: 'speech',
    state: tag('state'), party: tag('party'), words: wordCount(text), text: clip(text) }
  const tasks = ['summary','topics'] as const
  return { ...budget, initial_neurons:callUpper(cfg.primaryModel, requestBody(cfg.primaryModel, buildMessages(record,tasks), cfg.maxTokens,tasks)) }
}

const reservationTotal = `COALESCE((SELECT SUM(credit_neurons) FROM enrichment_units WHERE run_id=enrichment_runs.run_id),0)
  + COALESCE((SELECT SUM(upper_neurons) FROM enrichment_calls WHERE run_id=enrichment_runs.run_id AND state='reserved'),0)`

/** Actual queue rows appear only after the run can fund their first call. */
export async function admit(db: D1Database, work: readonly NewWork[], budget: AdmissionBudget, now: number): Promise<number> {
  const rid = work[0]?.rid
  if (!rid || work.some(w => w.rid !== rid || w.historicHold)) throw new Error('one bounded resource required')
  if (!Number.isFinite(budget.max_usd) || budget.max_usd<=0 || budget.max_usd>40
      || !/^[a-zA-Z0-9_-]{1,64}$/.test(budget.run_id)) throw new Error('invalid run ceiling')
  if (!Number.isInteger(budget.initial_neurons) || budget.initial_neurons <= 0) throw new Error('positive call reservation required')
  const cap = Math.floor(budget.max_usd / USD_PER_NEURON)
  const statements = [
    db.prepare('INSERT OR IGNORE INTO enrichment_runs(run_id,cap_neurons) VALUES (?,?)').bind(budget.run_id,cap),
    db.prepare(`INSERT OR IGNORE INTO enrichment_units(rid,run_id,initial_neurons,work)
      SELECT ?,?,?,? WHERE EXISTS (SELECT 1 FROM enrichment_runs WHERE run_id=? AND cap_neurons=?)`)
      .bind(rid,budget.run_id,budget.initial_neurons,JSON.stringify(work),budget.run_id,cap),
    db.prepare(`UPDATE enrichment_units SET admitted=1,credit_neurons=initial_neurons
      WHERE rid=? AND run_id=? AND admitted=0 AND initial_neurons <=
        (SELECT cap_neurons-spent_neurons-reserved_neurons FROM enrichment_runs WHERE run_id=? AND cap_neurons=?)`)
      .bind(rid,budget.run_id,budget.run_id,cap),
    db.prepare(`UPDATE enrichment_runs SET reserved_neurons=${reservationTotal} WHERE run_id=?`).bind(budget.run_id),
    ...work.map(w => db.prepare(`INSERT OR IGNORE INTO queue(rid,task,status,priority,source_created,created_at,updated_at)
      SELECT ?,?,'pending',?,?,?,? WHERE EXISTS(SELECT 1 FROM enrichment_units u JOIN enrichment_runs r ON u.run_id=r.run_id
      WHERE u.rid=? AND u.run_id=? AND u.admitted=1 AND r.cap_neurons=?)`)
      .bind(rid,w.task,w.priority,w.sourceCreated ?? null,now,now,rid,budget.run_id,cap)),
  ]
  const result = await db.batch(statements)
  const unit = await db.prepare('SELECT run_id FROM enrichment_units WHERE rid=?').bind(rid).first<{run_id:string}>()
  const run = await db.prepare('SELECT cap_neurons FROM enrichment_runs WHERE run_id=?').bind(budget.run_id).first<{cap_neurons:number}>()
  if (unit?.run_id !== budget.run_id || run?.cap_neurons!==cap) throw new Error('budget ownership or cap changed')
  return result.slice(4).reduce((n,r) => n + (r.meta?.changes ?? 0),0)
}

export async function admitWaiting(db: D1Database, now: number): Promise<number> {
  const {results} = await db.prepare(`SELECT u.work,u.initial_neurons,r.run_id,r.cap_neurons FROM enrichment_units u
    JOIN enrichment_runs r ON u.run_id=r.run_id WHERE u.admitted=0
    AND u.initial_neurons <= r.cap_neurons-r.spent_neurons-r.reserved_neurons LIMIT 50`)
    .all<{work:string;initial_neurons:number;run_id:string;cap_neurons:number}>()
  let added=0
  for (const u of results) added += await admit(db,JSON.parse(u.work),
    {run_id:u.run_id,max_usd:(u.cap_neurons+0.25)*USD_PER_NEURON,initial_neurons:u.initial_neurons},now)
  return added
}

export async function reserveCall(db: D1Database, rid: string, budget: RunBudget, upper: number,
                                  day: string, dailyCap: number): Promise<string|null> {
  const token=crypto.randomUUID()
  const result=await db.batch([
    db.prepare(`INSERT INTO enrichment_calls(token,run_id,rid,day,upper_neurons,credit_neurons)
      SELECT ?,u.run_id,u.rid,?,?,u.credit_neurons FROM enrichment_units u JOIN enrichment_runs r ON r.run_id=u.run_id
      WHERE u.rid=? AND u.run_id=? AND u.admitted=1 AND r.cap_neurons=?
      AND r.spent_neurons+r.reserved_neurons+?-u.credit_neurons<=r.cap_neurons
      AND COALESCE((SELECT SUM(neurons) FROM spend WHERE day=?),0)
        + COALESCE((SELECT SUM(upper_neurons) FROM enrichment_calls WHERE day=? AND state='reserved'),0)+?<=?`)
      .bind(token,day,upper,rid,budget.run_id,Math.floor(budget.max_usd/USD_PER_NEURON),upper,day,day,upper,dailyCap),
    db.prepare(`UPDATE enrichment_units SET credit_neurons=0 WHERE rid=? AND EXISTS(SELECT 1 FROM enrichment_calls WHERE token=?)`).bind(rid,token),
    db.prepare(`UPDATE enrichment_runs SET reserved_neurons=${reservationTotal} WHERE run_id=?`).bind(budget.run_id),
  ])
  return result[0].meta?.changes===1 ? token : null
}

/** Atomic with the existing daily spend ledger; no settle/book race. */
export async function settleCall(db: D1Database, token: string, model: string, neurons: number, input: number, output: number,
                                 verified=true): Promise<number> {
  const pending=await db.prepare("SELECT upper_neurons FROM enrichment_calls WHERE token=? AND state='reserved'")
    .bind(token).first<{upper_neurons:number}>()
  if (!pending) throw new Error('model reservation already settled or absent')
  // Missing/partial usage is not evidence for a refund: book the maximum.
  const charged=verified ? neurons : pending.upper_neurons
  const result=await db.batch([
    db.prepare(`INSERT INTO spend(day,model,neurons,calls,in_tokens,out_tokens)
      SELECT day,?,?,1,?,? FROM enrichment_calls WHERE token=? AND state='reserved'
      ON CONFLICT(day,model) DO UPDATE SET neurons=neurons+excluded.neurons,calls=calls+1,
        in_tokens=in_tokens+excluded.in_tokens,out_tokens=out_tokens+excluded.out_tokens`).bind(model,charged,input,output,token),
    db.prepare(`UPDATE enrichment_runs SET spent_neurons=spent_neurons+?
      WHERE run_id=(SELECT run_id FROM enrichment_calls WHERE token=? AND state='reserved')`).bind(Math.ceil(charged),token),
    db.prepare(`UPDATE enrichment_calls SET state='settled',actual_neurons=? WHERE token=? AND state='reserved'`).bind(verified ? neurons : null,token),
    db.prepare(`UPDATE enrichment_runs SET reserved_neurons=${reservationTotal}
      WHERE run_id=(SELECT run_id FROM enrichment_calls WHERE token=?)`).bind(token),
  ])
  if (result[2].meta?.changes!==1) throw new Error('model reservation already settled or absent')
  return charged
}

export async function releaseUnusedAdmission(db: D1Database, rid: string): Promise<void> {
  await db.batch([
    db.prepare(`UPDATE enrichment_units SET credit_neurons=0 WHERE rid=?
      AND NOT EXISTS(SELECT 1 FROM queue WHERE rid=? AND status IN ('pending','claimed'))`).bind(rid,rid),
    db.prepare(`UPDATE enrichment_runs SET reserved_neurons=${reservationTotal}
      WHERE run_id=(SELECT run_id FROM enrichment_units WHERE rid=?)`).bind(rid),
  ])
}
