import type { AgenticPayload } from './agentic-ask'

/** Adapt numbered tool facts to the existing Ask source ranges and renderer. */
export function agenticAskPayload(run: AgenticPayload, question: string) {
  const citations: Record<string, [number, number][]> = {}
  const sources = run.facts.map(f => ({ resource: `fact-${f.id}`, slug: '', kind: f.kind, title: f.text, href: f.url, url: f.url, snippet: f.text, cited: false }))
  let answer = ''
  let start = 0
  for (const m of run.answer.matchAll(/\[(\d+)\]/g)) {
    const following = run.answer.slice(m.index! + m[0].length)
    const raw = run.answer.slice(start, m.index)
    const part = /^[,;.]/.test(following) ? raw.replace(/\s+$/, '') : raw
    const before = Array.from(answer).length
    answer += part
    const id = Number(m[1]), source = sources.find(s => s.resource === `fact-${id}`)
    if (source) {
      const key = `${source.resource}/t/body/0`
      // Adjacent references share the preceding claim's range.
      const end = Array.from(answer).length
      const lastBoundary = Math.max(answer.lastIndexOf(';'), answer.lastIndexOf('\n'))
      const from = part.trim() ? Math.max(0, Array.from(answer.slice(0, lastBoundary + 1)).length) : Object.values(citations).flat().at(-1)?.[0] ?? before
      ;(citations[key] ??= []).push([from, end])
      source.cited = true
    }
    start = m.index! + m[0].length
  }
  answer += run.answer.slice(start)
  // Coverage percentages describe the source, not model-generated counts.
  const coverageStart = answer.indexOf(run.period.label) + run.period.label.length
  if (run.notes.some(n => /\d/.test(n)) && coverageStart > 0) {
    const resource = 'coverage'
    sources.push({ resource, slug: '', kind: 'record', title: 'Source coverage and methods', href: 'https://opax.com.au/methods', url: 'https://opax.com.au/methods', snippet: run.notes.join(' '), cited: true })
    citations[`${resource}/t/body/0`] = [[Array.from(answer.slice(0, coverageStart)).length, Array.from(answer).length]]
  }
  // Same follow-up shape used by today's Ask. No switch or new UI wording.
  const clean = question.replace(/\b(?:across the whole record|across the record|all[ -]time|(?:in|during) the current parliament|(?:this|last|current) term|since (?:19|20)\d{2})\b/gi, '').replace(/[?!.]+$/, '').replace(/\s+/g, ' ').trim()
  const followup = `${clean}${run.period.kind === 'all' ? ' in the current parliament' : ' across the whole record'}?`
  return {
    answered: run.answered,
    ...(run.reason ? { reason: run.reason } : {}),
    answer: run.answered ? answer : '',
    citations: run.answered ? citations : {},
    sources: run.answered ? sources : [],
    followups: run.answered ? [{ label: followup, question: followup, kind: 'speech' }] : [],
    agentic: { steps: run.events, ms: run.timings.total_ms },
  }
}
