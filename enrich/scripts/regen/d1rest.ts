// The slice of the D1Database API the regen runner uses, over the Cloudflare D1 REST endpoint
// (POST /accounts/{account}/d1/database/{id}/query). One statement per request; no batches.

export interface MiniStmt {
  bind(...values: unknown[]): MiniStmt
  all<T = Record<string, unknown>>(): Promise<{ results: T[]; meta: { changes: number } }>
  first<T = Record<string, unknown>>(): Promise<T | null>
  run(): Promise<{ meta: { changes: number } }>
}
export interface MiniD1 {
  prepare(sql: string): MiniStmt
}

export function d1Rest(opts: { accountId: string; databaseId: string; token: string; fetcher?: typeof fetch }): MiniD1 {
  const url = `https://api.cloudflare.com/client/v4/accounts/${opts.accountId}/d1/database/${opts.databaseId}/query`
  const fetcher = opts.fetcher ?? fetch
  async function query(sql: string, params: unknown[]): Promise<{ results: any[]; meta: { changes: number } }> {
    let last = ''
    for (let attempt = 0; attempt < 4; attempt += 1) {
      if (attempt) await new Promise((r) => setTimeout(r, 2000 * attempt))
      let res: Response
      try {
        res = await fetcher(url, {
          method: 'POST',
          headers: { authorization: `Bearer ${opts.token}`, 'content-type': 'application/json' },
          body: JSON.stringify({ sql, params }),
          signal: AbortSignal.timeout(30_000),
        })
      } catch (err) {
        last = String((err as Error)?.message ?? err)
        continue
      }
      const raw = await res.text()
      if (res.status >= 500 || res.status === 429) {
        last = `D1 HTTP ${res.status}: ${raw.slice(0, 200)}`
        continue
      }
      const d = JSON.parse(raw)
      if (!res.ok || !d.success) throw new Error(`D1 HTTP ${res.status}: ${JSON.stringify(d.errors ?? raw).slice(0, 300)}`)
      const r = d.result?.[0] ?? {}
      return { results: r.results ?? [], meta: { changes: Number(r.meta?.changes ?? 0) } }
    }
    throw new Error(`D1 unavailable after retries: ${last}`)
  }
  const stmt = (sql: string, params: unknown[]): MiniStmt => ({
    bind: (...values: unknown[]) => stmt(sql, values),
    all: () => query(sql, params) as any,
    first: async () => ((await query(sql, params)).results[0] ?? null) as any,
    run: async () => ({ meta: (await query(sql, params)).meta }),
  })
  return { prepare: (sql: string) => stmt(sql, []) }
}
