import {PERSON_PATHS} from '../public/person-paths.js'
import {rankingRepairQuestion} from './research-ranking-repair.mjs'

/** The roster establishes a current party only for one fully identified person.
 * It cannot establish dated membership or turn independents into a party. */
export function resolvePartySubject(question: string, roster: unknown): { question: string; clarification?: true; reason?: 'identity' | 'party' | 'form' } {
  if (!/[’']s\s+party\b|\bthe party of\b/i.test(question)) return { question }
  const clarify = (reason: 'identity' | 'party' | 'form') => ({ question, clarification: true as const, reason })
  // The direct-party receipts question does not grant permission to infer an owner's affiliation.
  if(/^who funds\b/i.test(question))return clarify('form')
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
  let resolved = question
  for (const span of spans.sort((a, b) => b.start - a.start)) {
    const owners = spans.filter(m => m.start === span.start && m.end === span.end)
    if (new Set(owners.map(m => m.identity)).size !== 1) return clarify('identity')
    const affiliation = span.party?.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim()
    if (!affiliation || /^(?:independent|independents|ind|unaffiliated|not affiliated|no party|none|unknown|n a|non aligned|non partisan|nonpartisan|crossbench)$/.test(affiliation)) return clarify('party')
    if (owners[0] !== span) continue
    resolved = resolved.slice(0, span.start) + span.party + resolved.slice(span.end)
  }
  if (/[’']s\s+party\b|\bthe party of\b/i.test(resolved)) return clarify('identity')
  // The same whole-question grammar owns both permissions. No named slots,
  // extra words or alternate verbs can infer affiliation from today's roster.
  if (!rankingRepairQuestion(resolved, {}, {unqualified:true})) return clarify('form')
  return { question: resolved }
}
