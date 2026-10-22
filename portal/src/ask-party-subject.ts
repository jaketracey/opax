/** Resolve ownership from the current public roster, before identifying subjects.
 * A historical party label cannot answer what someone's party is now. */
export function resolvePartySubject(question: string, roster: unknown): { question: string; clarification?: true } {
  // "The party of the MP who ..." is a computed subject, not a named owner.
  if (!/[’']s\s+party\b|\bthe party of\s+(?!(?:the|a|an)\b)/i.test(question)) return { question }
  const records = (roster as { people?: { name: string; party_now?: string }[] } | null)?.people ?? []
  const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const matches: { start: number; end: number; party?: string; name: string }[] = []
  for (const person of records) {
    if (typeof person.name !== 'string') continue
    for (const alias of new Set([person.name, person.name.trim().split(/\s+/).at(-1)!])) {
      const pattern = new RegExp(`(?<![\\p{L}])(?:${escape(alias)}[’']s\\s+party|the party of\\s+${escape(alias)})(?![\\p{L}])`, 'giu')
      for (const m of question.matchAll(pattern)) matches.push({ start: m.index!, end: m.index! + m[0].length, party: person.party_now?.trim(), name: person.name })
    }
  }
  // Full names win over nested surnames; a shared surname is still ambiguous.
  const spans = matches.filter(m => !matches.some(n => n.start <= m.start && n.end >= m.end && n.end - n.start > m.end - m.start))
  let resolved = question
  for (const span of spans.sort((a, b) => b.start - a.start)) {
    const owners = spans.filter(m => m.start === span.start && m.end === span.end)
    if (new Set(owners.map(m => m.name)).size !== 1 || new Set(owners.map(m => m.party)).size !== 1 || !span.party) return { question, clarification: true }
    if (owners[0] !== span) continue
    resolved = resolved.slice(0, span.start) + span.party + resolved.slice(span.end)
  }
  if (/[’']s\s+party\b|\bthe party of\b/i.test(resolved)) return { question, clarification: true }
  return { question: resolved }
}
