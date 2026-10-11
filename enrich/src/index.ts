// opax-enrich: unattended enrichment of the OPAX knowledge box with Workers AI.
//
//   scheduled (every minute): discover new speeches / press releases, then process a bounded batch.
//   fetch (Bearer ENRICH_ADMIN_TOKEN on every admin route):
//     GET  /status  queue counts, spend, cursors, last tick, recent errors
//     POST /canary  {"rids": [<=10]} write those rids' stored dry-run results for real, with a full before/after diff
//     POST /backfill/reconcile {"slugs": [<=200]} verify historic labels, reconcile unfinished work to priority 0
//     POST /backfill/release {"slugs": [<=200]} release held historic tasks to pending at priority 0
//     GET /backfill/batch read held historic source records (authenticated, no logging)
//     POST /backfill/batch/reserve|result|cancel reserve, validate/deliver, or abandon one unit
//   Nothing else is served.

import { readConfig, type Env } from './env.ts'
import { Kb } from './kb.ts'
import { parseCanaryBody, runCanary } from './canary.ts'
import { buildStatus, bearerOk } from './status.ts'
import { runTick } from './tick.ts'
import { parseReconcileBody, reconcileHistoric, releaseHistoric } from './reconcile.ts'
import { applyBatch, BatchConflict, cancelBatch, parseBatchBody, readHeldBatch, reserveBatch } from './batch.ts'

const json = (body: unknown, status = 200): Response =>
  new Response(JSON.stringify(body, null, 2), { status, headers: { 'content-type': 'application/json', 'cache-control': 'no-store' } })

export default {
  async scheduled(_controller: ScheduledController, env: Env, ctx: ExecutionContext): Promise<void> {
    ctx.waitUntil(
      runTick({
        db: env.DB,
        kb: new Kb(env),
        ai: { run: (model, body) => (env.AI as unknown as { run(m: string, b: unknown): Promise<unknown> }).run(model, body) },
        cfg: readConfig(env),
        now: () => Date.now(),
        log: (line) => console.log(JSON.stringify(line)),
        newToken: () => crypto.randomUUID(),
      }).catch((err) => {
        console.log(JSON.stringify({ evt: 'tick-failed', error: String((err as Error)?.message ?? err) }))
      }),
    )
  },

  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url)
    const route = `${request.method} ${url.pathname}`
    const batchRoute = ['GET /backfill/batch', 'POST /backfill/batch/reserve', 'POST /backfill/batch/result', 'POST /backfill/batch/cancel'].includes(route)
    if (!batchRoute && route !== 'GET /status' && route !== 'POST /canary' && route !== 'POST /backfill/reconcile' && route !== 'POST /backfill/release') return new Response('Not found', { status: 404 })
    if (!bearerOk(request.headers.get('authorization'), env.ENRICH_ADMIN_TOKEN)) {
      return new Response('Unauthorized', { status: 401, headers: { 'www-authenticate': 'Bearer' } })
    }
    if (route === 'GET /status') return json(await buildStatus(env.DB, readConfig(env), Date.now()))

    if (batchRoute) {
      const d = { db: env.DB, kb: new Kb(env), now: () => Date.now(), live: readConfig(env).live }
      try {
        if (route === 'GET /backfill/batch') {
          const limit = Number(url.searchParams.get('limit') ?? 20), after = url.searchParams.get('after') ?? ''
          if (!Number.isInteger(limit) || limit < 1 || limit > 20 || (after && !/^[0-9a-f]{32}$/.test(after))) return json({ error: 'limit must be 1-20; after must be a resource id' }, 400)
          return json(await readHeldBatch(d, limit, after))
        }
        const raw = await request.text()
        if (raw.length > 100_000) return json({ error: 'batch result body too large' }, 413)
        const parsed = parseBatchBody(JSON.parse(raw))
        if ('error' in parsed) return json(parsed, 400)
        if (route === 'POST /backfill/batch/cancel') return json(await cancelBatch(d, parsed.run_id, parsed.rid))
        if (!parsed.source_hash) return json({ error: 'source_hash required' }, 400)
        if (route === 'POST /backfill/batch/reserve') return json(await reserveBatch(d, parsed.run_id, parsed.rid, parsed.source_hash))
        const result = await applyBatch(d, parsed.run_id, parsed.rid, parsed.source_hash, parsed.result)
        return json(result, result.state === 'invalid' || result.state === 'release' ? 422 : 200)
      } catch (e) {
        if (e instanceof SyntaxError) return json({ error: 'invalid JSON body' }, 400)
        if (e instanceof BatchConflict) return json({ error: 'batch ownership, queue eligibility or source changed' }, 409)
        return json({ error: 'batch operation incomplete; retry from durable client state' }, 503)
      }
    }

    if (route === 'POST /backfill/reconcile' || route === 'POST /backfill/release') {
      const parsed = parseReconcileBody(await request.json().catch(() => null))
      if ('error' in parsed) return json({ error: parsed.error }, 400)
      try {
        const action = route === 'POST /backfill/release' ? releaseHistoric : reconcileHistoric
        return json(await action({ db: env.DB, kb: new Kb(env), now: () => Date.now(), historicHold: readConfig(env).historicHold }, parsed.slugs))
      } catch {
        // KB errors can contain slug or metadata text; return only a generic retry instruction.
        return json({ error: 'backfill operation incomplete; verify historic push-log entries and retry' }, 503)
      }
    }

    const parsed = parseCanaryBody(await request.json().catch(() => null))
    if ('error' in parsed) return json({ error: parsed.error }, 400)
    const out = await runCanary(
      { db: env.DB, kb: new Kb(env), historicHold: readConfig(env).historicHold, now: () => Date.now(), settle: (ms) => new Promise((resolve) => setTimeout(resolve, ms)) },
      parsed.rids,
    )
    return json(out)
  },
} satisfies ExportedHandler<Env>
