/** A roster name for a person as written: exact (folded), else every written word in one name, most speeches first. */
export function rosterPerson(roster: unknown, name: string): string | null {
  const fold = (s: string) => s.normalize('NFKD').replace(/[\u0300-\u036f]/g, '').replace(/[‘’]/g, "'").toLowerCase().replace(/\s+/g, ' ').trim()
  const people = ((roster as { people?: { name?: unknown; speeches?: number }[] } | null)?.people ?? []).filter((p): p is { name: string; speeches?: number } => typeof p.name === 'string' && p.name.includes(' '))
  const want = fold(name), words = want.split(' ')
  return people.find(p => fold(p.name) === want)?.name ?? people.filter(p => words.every(w => fold(p.name).split(' ').includes(w))).sort((a, b) => (b.speeches ?? 0) - (a.speeches ?? 0))[0]?.name ?? null
}
