import {PERSON_PATHS} from '../public/person-paths.js'

/** The roster establishes a current party only for one fully identified person.
 * It cannot establish dated membership or turn independents into a party. */
export function resolvePartySubject(question: string, roster: unknown): { question: string; clarification?: true; reason?: 'identity' | 'party' | 'period' } {
  // "The party of the MP who ..." is a computed subject, not a named owner.
  if (!/[’']s\s+party\b|\bthe party of\s+(?!(?:the|a|an)\b)/i.test(question)) return { question }
  const clarify = (reason: 'identity' | 'party' | 'period') => ({ question, clarification: true as const, reason })
  const records = (roster as { people?: { name: string; full?: string; display_name?: string; slug?: string; party_now?: string }[] } | null)?.people ?? []
  const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const fullName = (s: unknown): s is string => typeof s === 'string' && /^\S+\s+\S/.test(s.trim())
  const matches: { start: number; end: number; party?: string; identity: number }[] = []
  for (const [identity, person] of records.entries()) {
    const names = [person.name, person.full, person.display_name].filter(fullName)
    if (!names.length) continue // Bare indexed surnames are never identities.
    const paths = PERSON_PATHS.exact as Record<string, string>
    const slug = person.slug ?? names.map(name => paths[name]?.split('/').at(-1)).find(Boolean)
    const aliases = new Set([...names, ...(slug && /^[\p{L}\p{N}]+(?:[-_][\p{L}\p{N}]+)+$/u.test(slug) ? [slug] : [])])
    for (const alias of aliases) {
      const pattern = new RegExp(`(?<![\\p{L}\\p{N}_-])(?:${escape(alias)}[’']s\\s+party|the party of\\s+${escape(alias)})(?![\\p{L}\\p{N}_-])`, 'giu')
      for (const m of question.matchAll(pattern)) matches.push({ start: m.index!, end: m.index! + m[0].length, party: person.party_now?.trim(), identity })
    }
  }
  const spans = matches.filter(m => !matches.some(n => n.start <= m.start && n.end >= m.end && n.end - n.start > m.end - m.start))
  let resolved = question, periodText = question
  for (const span of spans.sort((a, b) => b.start - a.start)) {
    const owners = spans.filter(m => m.start === span.start && m.end === span.end)
    if (new Set(owners.map(m => m.identity)).size !== 1) return clarify('identity')
    const affiliation = span.party?.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim()
    if (!affiliation || /^(?:independent|independents|ind|unaffiliated|not affiliated|no party|none|unknown|n a|non aligned|non partisan|nonpartisan|crossbench)$/.test(affiliation)) return clarify('party')
    if (owners[0] !== span) continue
    resolved = resolved.slice(0, span.start) + span.party + resolved.slice(span.end)
    periodText = periodText.slice(0, span.start) + ' ' + periodText.slice(span.end)
  }
  if (/[’']s\s+party\b|\bthe party of\b/i.test(resolved)) return clarify('identity')
  // Mask the identity before checking time: a roster display name or slug is
  // not a date. Any named period requires affiliation evidence we do not hold.
  const period = /\b\d{4}s?\b|\b\d{1,2}[/-]\d{1,2}(?:[/-]\d{2,4})?\b|\b(?:years?|months?|weeks?|days?|decades?|centur(?:y|ies)|then|historically|previously|formerly|past|yesterday|today|tomorrow|now|currently|ever)\b|\b(?:this|last|previous|next|current|earlier|former)\s+(?:term|parliament|election|period)\b|\b(?:all[ -]time|whole record)\b|\b(?:January|February|March|April|May|June|July|August|September|October|November|December|Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday)\b/i
  if (period.test(periodText)) return clarify('period')
  return { question: resolved }
}
