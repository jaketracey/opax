import {resolvedParticipants} from '../public/speech-attribution.js'

export interface Participant { name: string; person_id: string; role?: string }
interface MixedRow {
  resource?: string; speaker_type?: string | null; speaker?: string | null;
  person_id?: string | number | null; party?: string | null; debate?: string | null;
  participants?: Participant[]; speaker_attribution?: string | null
}

/** Use structured metadata, never recover a personal attribution from a title. */
export function speechPresentation(type: string | null, metadata: Record<string, unknown>, title: string) {
  if (type !== 'multi_speaker') return {}
  let debate = typeof metadata.topic === 'string' ? metadata.topic : typeof metadata.debate === 'string' ? metadata.debate : ''
  // The reviewed relabel retained the old byline. Removing that exact prefix
  // recovers a heading, without assigning it to a speaker or parsing body text.
  if (!debate && typeof metadata.legacy_speaker_raw === 'string') {
    const prefix = metadata.legacy_speaker_raw + ' — '
    if (title.startsWith(prefix)) {
      debate = title.slice(prefix.length)
      const suffix = ' — ' + String(metadata.date || '').slice(0, 10)
      if (metadata.date && debate.endsWith(suffix)) debate = debate.slice(0, -suffix.length)
      if (debate === String(metadata.date || '').slice(0, 10)) debate = ''
    }
  }
  // All reviewed mixed KB titles use "byline — debate — ISO date", including
  // 47 whose legacy raw byline differs from the title's canonical spelling.
  // Recover only the heading on the server; never infer a speaker from it.
  if (!debate && metadata.date) {
    const suffix = ' — ' + String(metadata.date).slice(0, 10)
    if (title.endsWith(suffix)) {
      const head = title.slice(0, -suffix.length)
      const separator = head.indexOf(' — ')
      if (separator > 0) debate = head.slice(separator + 3)
    }
  }
  return {speaker: null, person_id: null, party: null, speaker_display: 'Several speakers',
    speaker_attribution: 'multi_speaker', debate: debate || 'Parliamentary debate',
    participants: resolvedParticipants(metadata.speaker_participants || metadata.participants)}
}

/** Optional, reviewed RID shards; absence/HTML fallbacks must not break search.
 * One read per relevant shard, with no global request state or KB writes.
 */
export async function joinMixedSpeakers<T extends MixedRow>(rows: T[], assets?: Fetcher): Promise<T[]> {
  const mixed = rows.filter(r => r.speaker_type === 'multi_speaker')
  for (const row of mixed) Object.assign(row, {speaker: null, person_id: null, party: null, speaker_display: 'Several speakers', speaker_attribution: 'multi_speaker'})
  if (!assets || !mixed.length) return rows
  let available: string[]
  try {
    const res = await assets.fetch(new Request('https://opax.com.au/mixed-speakers/index.json'))
    if (!res.ok || !res.headers.get('content-type')?.includes('application/json')) return rows
    const index = await res.json() as {schema?: number; shards?: unknown}
    if (index.schema !== 1 || !Array.isArray(index.shards)) return rows
    available = index.shards.filter((s): s is string => typeof s === 'string' && /^[a-f0-9]$/.test(s))
  } catch { return rows }
  const shards = [...new Set(mixed.filter(r => /^[a-f0-9]{32}$/.test(r.resource || '')).map(r => r.resource!.slice(0, 1)))].filter(s => available.includes(s))
  await Promise.all(shards.map(async shard => {
    try {
      const res = await assets.fetch(new Request(`https://opax.com.au/mixed-speakers/${shard}.json`))
      if (!res.ok || !res.headers.get('content-type')?.includes('application/json')) return
      const data = await res.json() as {schema?: number; resources?: Record<string, {participants?: unknown; debate?: unknown}>}
      if (data.schema !== 1 || !data.resources) return
      for (const row of mixed.filter(r => r.resource?.startsWith(shard))) {
        const entry = data.resources[row.resource!]
        if (!entry || !Array.isArray(entry.participants)) continue
        row.participants = resolvedParticipants(entry.participants)
        if (typeof entry.debate === 'string' && entry.debate.trim()) row.debate = entry.debate
      }
    } catch { /* A missing optional asset leaves the metadata presentation intact. */ }
  }))
  return rows
}
