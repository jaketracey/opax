// opax-enrich: unattended enrichment of the OPAX knowledge box with Workers AI.
//
//   scheduled (every minute): discover new speeches / press releases, then process a bounded batch.
//   fetch (Bearer ENRICH_ADMIN_TOKEN on both):
//     GET  /status  queue counts, spend, cursors, last tick, recent errors
//     POST /canary  {"rids": [<=10]} write those rids' stored dry-run results for real, with a full before/after diff
//   Nothing else is served.

import { readConfig, type Env } from './env.ts'
import { Kb } from './kb.ts'
import { parseCanaryBody, runCanary } from './canary.ts'
import { buildStatus, bearerOk } from './status.ts'
import { runTick } from './tick.ts'

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
    if (route !== 'GET /status' && route !== 'POST /canary') return new Response('Not found', { status: 404 })
    if (!bearerOk(request.headers.get('authorization'), env.ENRICH_ADMIN_TOKEN)) {
      return new Response('Unauthorized', { status: 401, headers: { 'www-authenticate': 'Bearer' } })
    }
    if (route === 'GET /status') return json(await buildStatus(env.DB, readConfig(env), Date.now()))

    const parsed = parseCanaryBody(await request.json().catch(() => null))
    if ('error' in parsed) return json({ error: parsed.error }, 400)
    const out = await runCanary(
      { db: env.DB, kb: new Kb(env), now: () => Date.now(), settle: (ms) => new Promise((resolve) => setTimeout(resolve, ms)) },
      parsed.rids,
    )
    return json(out)
  },
} satisfies ExportedHandler<Env>
