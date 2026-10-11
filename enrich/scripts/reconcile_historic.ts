// Authenticated admin client. No KB/AI requests; sends only successful push-log slugs.
import { createReadStream } from 'node:fs'
import { createInterface } from 'node:readline'
import { MAX_RECONCILE_SLUGS, parseReconcileBody } from '../src/reconcile.ts'

export function pushedSlug(record: unknown): string | null {
  if (!record || typeof record !== 'object') return null
  const r = record as { slug?: unknown; status?: unknown; ok?: unknown }
  const successful = r.ok === true || ['pushed', 'created', 'updated', 'exists', 'ok'].includes(String(r.status))
    || (typeof r.status === 'number' && r.status >= 200 && r.status < 300)
  return successful && typeof r.slug === 'string' ? r.slug : null
}

async function main(): Promise<void> {
  const args = process.argv.slice(2)
  const option = (key: string) => { const i = args.indexOf(key); return i < 0 ? undefined : args[i + 1] }
  const log = option('--push-log')
  const endpoint = option('--url')
  const dry = args.includes('--dry-run')
  if (!log || (!dry && !endpoint)) throw new Error('use --push-log FILE --url WORKER_URL [--dry-run]')
  const slugs = new Set<string>()
  let lines = 0
  for await (const line of createInterface({ input: createReadStream(log), crlfDelay: Infinity })) {
    if (!line.trim()) continue
    lines++
    let record: unknown
    try { record = JSON.parse(line) } catch { throw new Error('push log must be JSONL') }
    const slug = pushedSlug(record)
    if (slug) {
      if ('error' in parseReconcileBody({ slugs: [slug] })) throw new Error('push log contains an invalid slug')
      slugs.add(slug)
    }
  }
  if (!slugs.size) throw new Error('push log contains no successful slug entries')
  if (dry) { console.log(JSON.stringify({ dryRun: true, lines, slugs: slugs.size, batches: Math.ceil(slugs.size / MAX_RECONCILE_SLUGS) })); return }
  const token = process.env.ENRICH_ADMIN_TOKEN
  if (!token || token.length < 16) throw new Error('ENRICH_ADMIN_TOKEN is required')
  const url = new URL('/backfill/reconcile', endpoint)
  if (url.protocol !== 'https:' && !['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)) throw new Error('admin URL must use HTTPS')
  let verified = 0, inserted = 0, reconciled = 0
  const list = [...slugs]
  for (let i = 0;i < list.length;i += MAX_RECONCILE_SLUGS) {
    const response = await fetch(url, { method: 'POST', headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' }, body: JSON.stringify({ slugs: list.slice(i, i + MAX_RECONCILE_SLUGS) }), signal: AbortSignal.timeout(120_000) })
    if (!response.ok) throw new Error(`admin reconciliation returned HTTP ${response.status}; retry the same log`)
    const result = await response.json() as { verified: number; inserted: number; reconciled: number }
    verified += result.verified; inserted += result.inserted; reconciled += result.reconciled
  }
  console.log(JSON.stringify({ verified, inserted, reconciled }))
}
if (process.argv[1] === import.meta.filename) main().catch(() => { console.error('Reconciliation failed; check the JSONL log, URL and token, then retry the same log.'); process.exitCode = 1 })
