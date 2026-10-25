import {FEDERAL_RECEIPTS_NOTE} from './receipt-copy'
/** Existing instant calculators, exposed only as read-only research tools. */
import { paidAnswer } from './ask-pay'
import { rankedMoneyAnswer } from './ask-money'
import type { RecordQuestion } from './ask-records'
import type { ToolDeps, ToolResult } from './agentic-tools'
export async function calculatedLookup(tool: string, args: Record<string, unknown>, input: RecordQuestion, deps: ToolDeps): Promise<ToolResult> {
  let generated: string | null = null
  const assets = { fetch: async (request: Request) => {
    const data = await deps.asset(new URL(request.url).pathname) as { meta?: { generated?: string; as_of?: string } } | null
    generated = data?.meta?.as_of ?? data?.meta?.generated?.slice(0, 10) ?? generated
    return data ? Response.json(data) : new Response('', { status: 404 })
  } } as Fetcher
  const scoped = { ...input, ...args, question: input.question, ...(tool === 'paid_answer' ? { kind: 'all', speaker: undefined } : {}) }
  const payload = await (tool === 'paid_answer' ? paidAnswer(scoped, assets) : rankedMoneyAnswer(scoped, assets)) as Record<string, unknown> | null
  if (!payload) return { tool, ok: true, data: {}, cite: [], notes: ['This calculator does not answer the question; use another record tool.'] }
  // Calculator coverage/basis is evidence too. Add citations here so the legacy ordinary response stays identical.
  if (tool === 'paid_answer' && !payload.coverage) {
    const answer = String(payload.answer), parts = answer.split('\n\n'), ranges: number[][] = [], snippets: string[] = []
    let start = 0
    for (const part of parts) {
      if (part.startsWith('Coverage:') || part.startsWith('**Salaries as at')) { ranges.push([start, start + Array.from(part).length]); snippets.push(part) }
      start += Array.from(part).length + 2
    }
    if (ranges.length) {
      const resource = 'pay-calculation-scope', url = new URL('/pay.json', deps.origin ?? 'https://opax.com.au').href
      payload.sources = [...payload.sources as unknown[], { resource, title: 'Basis and coverage of the calculated salary comparison', href: url, url, kind: 'pay', snippet: snippets.join(' '), cited: true }]
      payload.citations = { ...payload.citations as object, [resource]: ranges }
    }
  }
  const sources = (payload.sources ?? []) as { title: string; href: string; snippet: string; kind: string }[]
  const coverage = payload.coverage as ToolResult['coverage'] ?? { since: args.from ? args.from + '-01-01' : tool === 'paid_answer' ? generated : null, until: args.to ? args.to + '-12-31' : tool === 'paid_answer' ? generated : null, as_of: generated,
    ...(args.from ? { requested_since: args.from + '-01-01' } : {}), ...(args.to ? { requested_until: args.to + '-12-31' } : {}) }
  return { tool, ok: true, coverage, data: { calculated_answer: true, payload, coverage },
    cite: [{ kind: 'record', label: String(payload.answer), url: new URL(sources[0]?.href ?? '/methods', deps.origin ?? 'https://opax.com.au').href }], notes: tool==='ranked_money'&&payload.answer_status==='calculated'&&(payload.scope as {state?:string}|undefined)?.state==='federal'?[FEDERAL_RECEIPTS_NOTE]:[] }
}
