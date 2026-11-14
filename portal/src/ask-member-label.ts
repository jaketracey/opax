/** Display metadata from OPAX's member export. Never resolve a surname against an unrelated full name. */
export interface CountedMember { name: string; parliaments: string[] }
interface MemberRecord { name: string; full?: string; chambers?: string[]; prints?: string[] }
const PARLIAMENTS: Record<string, string> = {
  representatives: 'Australian Parliament', federation: 'Australian Parliament', senate: 'Australian Parliament',
  act_la: 'ACT Legislative Assembly', qld_la: 'Queensland Parliament',
  vic_la: 'Parliament of Victoria', vic_lc: 'Parliament of Victoria',
  nsw_la: 'Parliament of New South Wales', nsw_lc: 'Parliament of New South Wales',
  sa_ha: 'Parliament of South Australia', sa_lc: 'Parliament of South Australia',
}
export function countedMember(name: string, roster: unknown, chamber?: string | null): CountedMember | undefined {
  const people = (roster as { people?: MemberRecord[] } | null)?.people ?? []
  const matches = people.filter(p => p.name === name || p.prints?.includes(name))
  if (matches.length !== 1) return
  const membership = (c: string) => c === 'federation' ? 'representatives' : c
  const person = matches[0], chambers = (person.chambers ?? []).filter(c => PARLIAMENTS[c] && (!chamber || membership(c) === membership(chamber)))
  if (!chambers.length) return
  return { name: person.full?.trim() || person.name, parliaments: [...new Set(chambers.map(c => PARLIAMENTS[c]))] }
}

/** A title can supply a missing collaborator only when it names an exact full OPAX roster identity. */
export function titledSpeaker(title: string, roster: unknown): string | undefined {
  const name = /^(.*?)\s+[—–-]\s+/.exec(title)?.[1]?.trim()
  if (!name?.includes(' ')) return
  const matches = ((roster as { people?: MemberRecord[] } | null)?.people ?? []).filter(p => p.name === name || p.full === name)
  return matches.length === 1 ? name : undefined
}
