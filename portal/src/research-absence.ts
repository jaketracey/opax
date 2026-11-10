import type { ToolResult } from './agentic-tool-types'
import type { AskConstraints } from './ask-constraints'

/** A whole selection needs a complete count, not the emptiness of a ranked text search. */
export function broadAbsenceQuestion(question: string, constraints: AskConstraints): boolean {
  return !constraints.exactBillTitle && !constraints.people.length &&
    (constraints.dated || /\b(?:year|parliament|senate|house|chamber|party|parties|Labor|Liberal|Greens|Nationals)\b/i.test(question))
}
export function verifiedAbsenceCount(results: ToolResult[]): boolean {
  return results.some(r => r.ok && r.data?.total === 0 && r.cite.some(c => c.kind === 'count' && c.value === 0) &&
    r.data?.coverage_only !== true && (r.data?.query as { method?: string } | undefined)?.method === 'full-published-index' &&
    (r.data?.coverage as { matched?: boolean } | undefined)?.matched !== false)
}
export const absenceClaim = (text: string) => /^(?:No\b|Zero\b|0\b|There (?:were|are|was) no\b)|\b(?:no (?:matching |published |recorded )?(?:bills?|divisions?|speeches|records)|none (?:were|was)|never (?:introduced|voted))\b/i.test(text)
