/** Complete published sponsor metadata, rather than the six-row growth summaries. */
import { sponsorNamesAgree, sponsorPerson } from '../../public/sponsor-person.js'
import { billEnding as ending, billFields, clip, fold, siteUrl } from './record-common'
import { memberResolutionNotes, resolveMember } from './member-records'
import { boundedValue, inWindow, object, publishedResult, records, sourceUrl, validWindow, wordsMatch, type RecordRow } from './published-records'
import { readToolAsset, type ToolCitation, type ToolDefinition } from './types'

export const tool: ToolDefinition = {
  name: 'sponsored_bills',
  description: 'List and count the federal bills attributed to a member as sponsor in the complete published bill index, rather than the six most recent growth-summary rows. Resolve person by the existing roster rules; sponsor IDs and printed names must agree using the site sponsor resolver. Filter introduction dates with since/until, title keywords with query, status or originating chamber. Counts cover all matching attributable index entries before pagination. Sponsor metadata is often missing for government bills: report the scope and completeness of sponsor metadata beside a matching count. Copy bill_id for full lifecycle detail; use division with bill=bill_id for linked votes. Sponsoring, speaking on a bill, passage, assent and commencement are distinct.',
  inputSchema: { type: 'object', additionalProperties: false, properties: {
    person: { type: 'string', minLength: 2, maxLength: 120 },
    query: { type: 'string', minLength: 2, maxLength: 200 }, bill_id: { type: 'string', pattern: '^au-federal-[a-z0-9-]{1,180}$' },
    since: { type: 'string', pattern: '^\\d{4}-\\d{2}-\\d{2}$' }, until: { type: 'string', pattern: '^\\d{4}-\\d{2}-\\d{2}$' },
    chamber: { type: 'string', enum: ['senate', 'representatives'] },
    status: { type: 'string', enum: ['before_parliament', 'passed', 'assented', 'lapsed', 'withdrawn', 'negatived', 'unknown', 'not_yet_debated', 'introduced'] },
    limit: { type: 'integer', minimum: 1, maximum: 8 }, offset: { type: 'integer', minimum: 0, maximum: 100000 },
  }, required: ['person'], examples: [{ person: 'Katy Gallagher' }, { person: 'David Pocock', since: '2025-01-01' }] },
  identifierFields: ['person'],
  validate: args => validWindow(args) && (!args.query || /[\p{L}\p{N}]/u.test(String(args.query))) &&
    (!args.bill_id || !['query', 'since', 'until', 'chamber', 'status', 'offset'].some(k => args[k] !== undefined)),
  stepLabel: args => ({ label: 'Checking sponsored bills', arg: clip(args.person, 40) }),
  async handler(env, args) {
    const { people, person, resolution } = await resolveMember(env, String(args.person))
    if (!person) return { rows: [], citations: [], notes: memberResolutionNotes, candidates: resolution.candidates.slice(0, 5).map(c => c.person.name) }
    const index = object(await readToolAsset(env, '/bills/index.json'))
    if (!Array.isArray(index.bills)) throw new Error('Bill index unavailable')
    const all = records(index.bills), seen = new Set<string>()
    const matches = all.filter(b => {
      if (typeof b.key !== 'string' || !/^au-federal-[a-z0-9-]+$/.test(b.key) || seen.has(b.key) || typeof b.sponsor !== 'string' || !b.sponsor) return false
      seen.add(b.key)
      if (b.sponsor_person_id && person.pid && b.sponsor_person_id !== person.pid) return false
      if (![person.name, person.full].some(name => name && sponsorNamesAgree(b.sponsor as string, name))) return false
      const owner = sponsorPerson(b.sponsor, typeof b.sponsor_person_id === 'string' ? b.sponsor_person_id : null, people)
      return !!owner && (person.pid ? owner.pid === person.pid : fold(owner.name) === fold(person.name)) &&
        (!args.bill_id || b.key === args.bill_id) && (!args.chamber || b.originating_house === args.chamber) &&
        (!args.status || b.status === args.status) && inWindow(b.introduced, args) && (!args.query || wordsMatch(args.query, [b.title, b.short_title]))
    }).sort((a, b) => String(b.introduced ?? '').localeCompare(String(a.introduced ?? '')) || String(a.key).localeCompare(String(b.key)))
    const offset = Number(args.offset) || 0, rows: RecordRow[] = [], citations: ToolCitation[] = []
    for (const b of matches.slice(offset, offset + (args.bill_id ? 1 : Number(args.limit) || 5))) {
      const path = `/bills/${b.key}.json`, raw = object(await readToolAsset(env, path))
      if (raw.key !== b.key || !['sponsor', 'sponsor_person_id', 'introduced', 'status', 'status_as_of', 'originating_house'].every(k => (raw[k] ?? null) === (b[k] ?? null))) throw new Error('Bill sponsor detail inconsistent with index')
      const lifecycle = args.bill_id ? await billFields({ ...env, asset: p => p === path ? Promise.resolve(raw) : readToolAsset(env, p) }, String(b.key)) : null
      const source_url = records(raw.sources).map(s => sourceUrl(s.url)).find(Boolean) ?? null
      const url = siteUrl(env, '/bill/' + b.key)
      rows.push({ bill_id: b.key, title: b.title, sponsor: person.name, sponsor_as_published: b.sponsor, introduced: b.introduced ?? null,
        originating_house: b.originating_house ?? null, status: raw.status ?? null, ...ending(raw), status_as_of: raw.status_as_of ?? null,
        source_url, source_status: source_url ? 'original bill source' : 'original URL not recorded; cite published OPAX bill', url, full_record_url: url,
        follow_up: { person: person.name, bill_id: b.key },
        ...(lifecycle ? { lifecycle: boundedValue(lifecycle), lifecycle_truncated: lifecycle.key_dates.length > 20 || lifecycle.acts.length > 20 } : {}) })
      citations.push({ kind: 'record', url: source_url ?? url, text: clip(`${person.name} is the recorded sponsor of ${b.title}; introduced ${b.introduced ?? 'date not recorded'}${b.originating_house ? ' in ' + b.originating_house : ''}; status ${raw.status ?? 'not recorded'}${ending(raw).ended_label ? ` (${ending(raw).ended_label})` : ''}${raw.status_as_of ? ' as at ' + raw.status_as_of : ''}.` + (lifecycle ? ` Recorded stages: ${lifecycle.key_dates.map(s => `${s.date ?? 'undated'} ${s.stage} (${s.house ?? 'house not recorded'})`).join('; ')}.` : ''), 2200) })
    }
    const countCitation: ToolCitation = { kind: 'count', url: siteUrl(env, '/bills/index.json'), value: matches.length, text: `${person.name}: ${matches.length} attributable sponsored federal bills in the published index${args.since ? ' introduced since ' + args.since : ''}${args.until ? ' introduced until ' + args.until : ''}${args.query ? ' with title words ' + args.query : ''}${args.status ? ' with status ' + args.status : ''}${args.chamber ? ' originating in ' + args.chamber : ''}. Missing sponsor metadata can undercount introductions.` }
    return publishedResult(rows, [countCitation, ...citations], { total: matches.length, count: matches.length, count_complete_for_index: true, person: person.name,
      by_status: Object.fromEntries([...new Set(matches.map(b => String(b.status ?? 'unknown')))].map(status => [status, matches.filter(b => String(b.status ?? 'unknown') === status).length])),
      offset, next_offset: offset + rows.length < matches.length ? offset + rows.length : null, truncated: offset + rows.length < matches.length,
      snapshot: index.generated_at ?? null, sponsor_metadata_missing: all.filter(b => !b.sponsor).length,
      notes: ['Federal published sponsor metadata only. Government bills often omit sponsor names; speaking on a bill is not sponsorship. Counts are attributable matching index entries, not a claim of complete career introductions.', ...(matches.length ? [] : ['No attributable bill in the published sponsor index matches these filters.'])] })
  },
}
