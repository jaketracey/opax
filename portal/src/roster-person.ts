import { resolvePersonName } from './person-name-matching'

/** Resolve a roster name and its explicit aliases; different people never tie-break by speech count. */
export function rosterPerson(roster: unknown, name: string): string | null {
  const people = ((roster as { people?: { name?: unknown; pid?: string; aliases?: string[]; speeches?: number }[] } | null)?.people ?? [])
    .filter((p): p is { name: string; pid?: string; aliases?: string[]; speeches?: number } => typeof p.name === 'string' && p.name.includes(' '))
  const result = resolvePersonName(name, people)
  return result.status === 'matched' ? result.candidates[0].person.name : null
}
