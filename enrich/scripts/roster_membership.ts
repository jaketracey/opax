export interface DirectoryPerson {
  name?: string
  pid?: string | null
  representation?: Array<{ electorate?: string; seat?: string }>
  speech_scope?: { chamber?: string; service?: Array<{ start?: string; end?: string | null }> }
}

export const rosterKey = (s: string): string => s.normalize('NFKC')
  .replace(/[’‘ʼ`]/g, "'").replace(/[‐‑‒–—−]/g, '-')
  .replace(/\([^)]*\)/g, ' ').replace(/^(?:(?:the|hon|honourable|mr|mrs|ms|miss|dr|sir|dame|senator)\.?\s+)+/i, '')
  .replace(/\s+/g, ' ').trim().toLowerCase()

export interface MemberSnapshot {
  source_url: string
  as_of: string
  jurisdiction: string
  chamber: string
  members: Array<{ name: string; aliases?: string[] }>
}
export interface DatedMember {
  person_id: string
  first_name: string
  last_name: string
  full_name: string
  state: string
  chamber: string
  entered_house: string | null
  left_house: string | null
}

/** Independently corroborate incomplete directory entries with official, dated service. */
export function verifiedStateMemberNames(snapshots: MemberSnapshot[], dated: DatedMember[]): Set<string> {
  const names = new Set<string>()
  for (const snapshot of snapshots) {
    let host: string
    try { host = new URL(snapshot.source_url).hostname } catch { continue }
    const official = `parliament.${snapshot.jurisdiction}.gov.au`
    if (!(host === official || host.endsWith(`.${official}`)) || !/^\d{4}-\d{2}-\d{2}$/.test(snapshot.as_of)) continue
    for (const member of snapshot.members) {
      const forms = [member.name, ...(member.aliases ?? [])].map(rosterKey)
      const verified = dated.some(record =>
        /^(?:nsw|vic|qld|sa)_[a-z_]+$/.test(record.person_id)
        && record.state === snapshot.jurisdiction && record.chamber === snapshot.chamber
        && !!record.entered_house && /^\d{4}-\d{2}-\d{2}$/.test(record.entered_house)
        // This is an all-time parliamentary roster. Historical service qualifies;
        // an earlier cached end date does not negate an official member record.
        && [record.full_name, `${record.first_name} ${record.last_name}`].some(name => forms.includes(rosterKey(name))))
      if (verified) for (const form of forms) if (form) names.add(form)
    }
  }
  return names
}

export function resolvedParliamentaryService(person: DirectoryPerson, verifiedNames: ReadonlySet<string>): boolean {
  return hasParliamentaryService(person) || !!(person.name && verifiedNames.has(rosterKey(person.name)))
}

/** Speech attendance and committee witness records do not establish parliamentary service. */
export function hasParliamentaryService(person: DirectoryPerson): boolean {
  return !!person.pid?.trim()
    || !!person.representation?.some((spell) => !!(spell.electorate ?? spell.seat)?.trim())
    || !!(person.speech_scope?.chamber && person.speech_scope.service?.some((spell) => !!spell.start))
}
