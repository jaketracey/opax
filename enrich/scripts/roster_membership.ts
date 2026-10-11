export interface DirectoryPerson {
  pid?: string | null
  representation?: Array<{ electorate?: string; seat?: string }>
  speech_scope?: { chamber?: string; service?: Array<{ start?: string; end?: string | null }> }
}

/** Speech attendance and committee witness records do not establish parliamentary service. */
export function hasParliamentaryService(person: DirectoryPerson): boolean {
  return !!person.pid?.trim()
    || !!person.representation?.some((spell) => !!(spell.electorate ?? spell.seat)?.trim())
    || !!(person.speech_scope?.chamber && person.speech_scope.service?.some((spell) => !!spell.start))
}
