// Test doubles: a D1 shim over node:sqlite, an in-memory knowledge box, a scripted model.

import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { readConfig, type Config } from '../src/env.ts'
import { KbBackpressure, type CatalogPage, type KbApi, type KbResource } from '../src/kb.ts'
import type { Classification } from '../src/classify.ts'
import type { TickDeps } from '../src/tick.ts'

// ---------------------------------------------------------------- D1 over node:sqlite

class Stmt {
  readonly db: DatabaseSync
  readonly sql: string
  readonly params: unknown[]
  constructor(db: DatabaseSync, sql: string, params: unknown[] = []) {
    this.db = db
    this.sql = sql
    this.params = params
  }
  bind(...params: unknown[]): Stmt {
    return new Stmt(this.db, this.sql, params.map((p) => (p === undefined ? null : p)))
  }
  private isRead(): boolean {
    return /^\s*(select|with)\b/i.test(this.sql)
  }
  exec(): { results: any[]; meta: { changes: number } } {
    const stmt = this.db.prepare(this.sql)
    if (this.isRead()) return { results: stmt.all(...(this.params as any[])) as any[], meta: { changes: 0 } }
    const r = stmt.run(...(this.params as any[]))
    return { results: [], meta: { changes: Number(r.changes) } }
  }
  async run() {
    return { success: true, ...this.exec() }
  }
  async all() {
    return { success: true, ...this.exec() }
  }
  async first(column?: string) {
    const row = this.exec().results[0] ?? null
    return column && row ? row[column] : row
  }
}

export function makeD1(): { d1: D1Database; raw: DatabaseSync } {
  const raw = new DatabaseSync(':memory:')
  raw.exec(readFileSync(join(import.meta.dirname, '..', 'migrations', '0001_init.sql'), 'utf8'))
  const d1 = {
    prepare: (sql: string) => new Stmt(raw, sql),
    async batch(stmts: Stmt[]) {
      raw.exec('BEGIN')
      try {
        const out = stmts.map((s) => ({ success: true, ...s.exec() }))
        raw.exec('COMMIT')
        return out
      } catch (err) {
        raw.exec('ROLLBACK')
        throw err
      }
    },
  }
  return { d1: d1 as unknown as D1Database, raw }
}

export const rows = (raw: DatabaseSync, sql: string, ...params: any[]): any[] => raw.prepare(sql).all(...params) as any[]

// ---------------------------------------------------------------- in-memory knowledge box

export interface FakeResource {
  slug?: string
  title?: string
  created?: string
  kind?: string
  classifications: Classification[]
  fieldClassifications?: unknown[]
  texts: Record<string, string>
}

export class FakeKb implements KbApi {
  resources = new Map<string, FakeResource>()
  calls: string[] = []
  /** When set, writes (PATCH) throw this. */
  failWrites: Error | null = null
  /** Simulate a box that drops non-topic labels on a classifications write, to exercise the read-back repair. */
  dropOnWrite: string | null = null
  catalogRows: Array<{ kind: string; rid: string; created: string }> = []
  catalogPageSize = 200
  catalogCalls: Array<{ kind: string; since: string; page: number }> = []

  add(rid: string, r: Partial<FakeResource> & { texts: Record<string, string> }): void {
    this.resources.set(rid, {
      title: 'Jane Citizen — Some topic — 2026-09-24',
      classifications: [
        { labelset: 'kind', label: 'speech' },
        { labelset: 'source', label: 'vic_hansard' },
        { labelset: 'state', label: 'vic' },
        { labelset: 'chamber', label: 'vic_la' },
        { labelset: 'decade', label: '2020s' },
      ],
      ...r,
    })
  }

  private view(rid: string, values: boolean): KbResource | null {
    const r = this.resources.get(rid)
    if (!r) return null
    return {
      id: rid,
      slug: r.slug ?? `speech-${rid}`,
      title: r.title,
      created: r.created,
      usermetadata: { classifications: r.classifications.map((c) => ({ ...c })) },
      computedmetadata: { field_classifications: r.fieldClassifications ?? [] },
      data: values ? { texts: Object.fromEntries(Object.entries(r.texts).map(([k, v]) => [k, { value: { body: v } }])) } : undefined,
    }
  }

  async getResource(rid: string) {
    this.calls.push(`GET full ${rid}`)
    return this.view(rid, true)
  }
  async getBasic(rid: string) {
    this.calls.push(`GET basic ${rid}`)
    return this.view(rid, false)
  }
  async getSummaryBody(rid: string) {
    this.calls.push(`GET summary ${rid}`)
    return (this.resources.get(rid)?.texts['da-summary-t-body'] ?? '').trim()
  }
  async patchSummary(rid: string, body: string) {
    this.calls.push(`PATCH summary ${rid}`)
    if (this.failWrites) throw this.failWrites
    this.resources.get(rid)!.texts['da-summary-t-body'] = body
  }
  async patchClassifications(rid: string, classifications: Classification[]) {
    this.calls.push(`PATCH classifications ${rid}`)
    if (this.failWrites) throw this.failWrites
    const r = this.resources.get(rid)!
    r.classifications = classifications.filter((c) => !(this.dropOnWrite && c.labelset === this.dropOnWrite)).map((c) => ({ ...c }))
    // After the "loss" the repair write goes through untouched.
    this.dropOnWrite = null
  }
  async catalog(kind: string, since: string, page: number, pageSize = this.catalogPageSize): Promise<CatalogPage> {
    this.catalogCalls.push({ kind, since, page })
    const sinceMs = Date.parse(since)
    const all = this.catalogRows
      .filter((r) => r.kind === kind && Date.parse(`${r.created}Z`) >= sinceMs)
      .sort((a, b) => a.created.localeCompare(b.created))
    const slice = all.slice(page * pageSize, (page + 1) * pageSize)
    return { rows: slice.map((r) => ({ rid: r.rid, created: r.created })), hasNext: (page + 1) * pageSize < all.length && slice.length > 0 }
  }
  writes(): string[] {
    return this.calls.filter((c) => c.startsWith('PATCH'))
  }
}

// ---------------------------------------------------------------- scripted model

export type ScriptedReply = string | Error | { content?: string | null; reasoning?: string; finish?: string; neurons?: number; promptTokens?: number; completionTokens?: number }

export class FakeAi {
  calls: Array<{ model: string; body: any }> = []
  private readonly script: (call: { model: string; body: any; n: number }) => ScriptedReply
  constructor(script: (call: { model: string; body: any; n: number }) => ScriptedReply) {
    this.script = script
  }
  async run(model: string, body: Record<string, unknown>): Promise<unknown> {
    const n = this.calls.length
    this.calls.push({ model, body })
    const reply = this.script({ model, body, n })
    if (reply instanceof Error) throw reply
    const r = typeof reply === 'string' ? { content: reply } : reply
    return {
      choices: [{ index: 0, finish_reason: r.finish ?? 'stop', message: { role: 'assistant', content: r.content ?? null, reasoning: r.reasoning } }],
      usage: { prompt_tokens: r.promptTokens ?? 1000, completion_tokens: r.completionTokens ?? 100, neurons: r.neurons ?? 5 },
    }
  }
  systemPrompts(): string[] {
    return this.calls.map((c) => c.body.messages.find((m: any) => m.role === 'system').content as string)
  }
  userPrompts(): string[] {
    return this.calls.map((c) => c.body.messages.find((m: any) => m.role === 'user').content as string)
  }
}

// ---------------------------------------------------------------- tick deps

export function makeDeps(opts: { kb: FakeKb; ai: FakeAi; env?: Record<string, string>; now?: () => number; d1?: { d1: D1Database; raw: DatabaseSync } }) {
  const db = opts.d1 ?? makeD1()
  const cfg: Config = readConfig({ ARAG_ZONE: 'z', DISCOVERY_START: '2026-09-20T00:00:00Z', ...opts.env } as any)
  const logs: Array<Record<string, unknown>> = []
  let t = Date.parse('2026-09-28T12:00:00Z')
  let n = 0
  const deps: TickDeps = {
    db: db.d1,
    kb: opts.kb,
    ai: opts.ai,
    cfg,
    now: opts.now ?? (() => (t += 5)),
    log: (l) => logs.push(l),
    newToken: () => `tok-${(n += 1)}`,
  }
  return { deps, raw: db.raw, d1: db.d1, logs }
}

export const speechText = (extra = ''): string =>
  `Mr Jones asked the minister to commit to delivering 500 supported housing places for young people, as recommended by the royal commission, and the minister said $75 million had been set aside in 2026 for regional projects. ${extra}`.trim()

export const GOOD_SUMMARY = 'Asked whether the government would deliver 500 supported housing places for young people; the minister said $75 million was set aside for regional projects.'

export { KbBackpressure }
