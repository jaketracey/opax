/** Shared roster resolution for public member-record tools. No surname guessing. */
import { resolvePersonName } from '../person-name-matching'
import { object, records } from './published-records'
import { readToolAsset, type ToolEnv } from './types'

export interface MemberRecord extends Record<string, unknown> { name: string; pid?: string; full?: string; speeches?: number }
export async function resolveMember(env: ToolEnv, name: string) {
  const raw = object(await readToolAsset(env, '/parliamentarians.json'))
  if (!Array.isArray(raw.people)) throw new Error('Member roster unavailable')
  const people = records(raw.people).filter((p): p is MemberRecord => typeof p.name === 'string')
  const resolution = resolvePersonName(name, people)
  return { people, resolution, person: resolution.status === 'matched' ? resolution.candidates[0].person : undefined }
}
export const memberResolutionNotes = ['No unambiguous member matches the published roster. Use a full roster name; an unknown member does not establish a zero count.']
