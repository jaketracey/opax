import { resolvePersonName } from './person-name-matching'

/** Resolve a roster name and its explicit aliases; exact full names take priority over aliases.
 * Ambiguous surnames return null so person_quotes can ask find_people for a full name.
 * Speech counts never choose between different people. */
export function rosterPerson(roster: unknown, name: string): string | null {
  const people = ((roster as { people?: { name?: unknown; pid?: string; aliases?: string[]; speeches?: number }[] } | null)?.people ?? [])
    .filter((p): p is { name: string; pid?: string; aliases?: string[]; speeches?: number } => typeof p.name === 'string' && p.name.includes(' '))
  const result = resolvePersonName(name, people)
  return result.status === 'matched' ? result.candidates[0].person.name : null
}
