/** Published access projections retain small samples; missing rows and URLs stay missing. */
import { clip, fold, readableRange, siteUrl } from './record-common'
import { boundedValue, inWindow, object, publishedResult, records, sourceUrl, validWindow, wordsMatch, type RecordRow } from './published-records'
import { readToolAsset, type ToolCitation, type ToolDefinition } from './types'

const normal = (value: unknown) => fold(value).replace(/[^\p{L}\p{N}]+/gu, ' ').trim()
const jurisdictionOf = (value: unknown) => normal(value).split(' ').filter(Boolean)
const same = (a: unknown, b: unknown) => normal(a) === normal(b)
const tuple = (r: RecordRow) => JSON.stringify([r.minister, r.organisation, r.jurisdiction, r.date, r.purpose].map(normal))
const hasWords = (v: unknown) => /[\p{L}\p{N}]/u.test(String(v))

export const tool: ToolDefinition = {
  name: 'access_registers',
  description: 'Query published ministerial diaries, registered lobbying clients/firms and the Foreign Influence Transparency Scheme (FITS). Choose register=meetings, lobbyists or fits. Filter minister, organisation, lobbyist, client, jurisdiction and dates; use offset for rows or record_id for detail. Meetings: who met a minister or which ministers met an organisation. Lobbyists: lobbyist is firm, client/organisation is its published client. FITS: organisation/lobbyist filters registrant, client filters foreign principal, minister filters a named registrant. Dates mean exported meeting date, earliest published lobbyist registration date, or overlap with the FITS registration interval. Some meeting dates are reporting-period starts. Lobbyist status is merged: current means active in at least one listed jurisdiction, not necessarily the selected state. access.json retains only eight rows per profile and often no original entry URL. counts.retained_matches is a sample count; exact_count is null unless completeness is established. published_totals describe all-time profiles; dated questions use explicitly dated rows. source_status distinguishes original entry provenance from OPAX projection evidence; a latest diary PDF is not a citation for an older meeting. Registration or a meeting does not establish influence or wrongdoing.',
  inputSchema: { type: 'object', additionalProperties: false, properties: {
    register: { type: 'string', enum: ['meetings', 'lobbyists', 'fits'] },
    minister: { type: 'string', minLength: 2, maxLength: 120 }, organisation: { type: 'string', minLength: 2, maxLength: 200 },
    lobbyist: { type: 'string', minLength: 2, maxLength: 200 }, client: { type: 'string', minLength: 2, maxLength: 200 },
    jurisdiction: { type: 'string', enum: ['federal', 'nsw', 'qld', 'vic', 'sa', 'wa'] },
    since: { type: 'string', pattern: '^\\d{4}-\\d{2}-\\d{2}$' }, until: { type: 'string', pattern: '^\\d{4}-\\d{2}-\\d{2}$' },
    status: { type: 'string', enum: ['all', 'current', 'ceased'] },
    record_id: { type: 'string', pattern: '^a[0-9]{14}-[mlf][a-f0-9]{16}$' },
    limit: { type: 'integer', minimum: 1, maximum: 8 }, offset: { type: 'integer', minimum: 0, maximum: 100000 },
  }, required: ['register'], examples: [{ register: 'meetings', minister: 'Chris Minns', since: '2026-04-01', until: '2026-06-30' }, { register: 'lobbyists', client: 'Westpac' }, { register: 'fits', minister: 'Tony Abbott', status: 'current' }] },
  identifierFields: ['minister'],
  validate: args => validWindow(args) && ['organisation', 'lobbyist', 'client'].every(k => !args[k] || hasWords(args[k])) &&
    (args.register !== 'meetings' || !args.lobbyist && !args.status) && (args.register !== 'lobbyists' || !args.minister) &&
    (args.register !== 'fits' || !args.jurisdiction || args.jurisdiction === 'federal') &&
    (!args.record_id || !['minister', 'organisation', 'lobbyist', 'client', 'jurisdiction', 'since', 'until', 'status', 'offset'].some(k => args[k] !== undefined)),
  stepLabel: args => ({ label: 'Checking access registers', arg: clip(args.minister ?? args.client ?? args.organisation ?? args.lobbyist ?? args.register, 40) }),
  async handler(env, args) {
    const fits = args.register === 'fits', path = fits ? '/fits.json' : '/access.json', data = object(await readToolAsset(env, path)), meta = object(data.meta)
    if (!Object.keys(meta).length || !(fits ? ['by_entity', 'people'] : ['ministers', 'donors']).every(key => data[key] && typeof data[key] === 'object' && !Array.isArray(data[key]))) throw new Error('Access projection unavailable')
    const stamp = String(meta.generated ?? '').replace(/\D/g, '').slice(0, 14)
    if (!/^\d{14}$/.test(stamp)) throw new Error('Access snapshot unavailable')
    const ministers = Object.entries(object(data.ministers)).map(([key, value]) => ({ key, ...object(value) } as RecordRow))
    const aliases = object(data.aliases)
    const ministerMatches = (r: RecordRow) => !args.minister || same(r.name ?? r.minister, args.minister) || same(r.page, args.minister) ||
      typeof aliases[normal(args.minister)] === 'string' && (r.key === aliases[normal(args.minister)] || same(r.minister, object(object(data.ministers)[String(aliases[normal(args.minister)])]).name))
    const selectedMinisters = ministers.filter(m => ministerMatches(m) && (!args.jurisdiction || m.jurisdiction === args.jurisdiction))
    const donors: RecordRow[] = Object.entries(object(data.donors)).map(([name, value]) => ({ name, ...object(value) }))
    let rows: RecordRow[] = [], complete = fits, unknownDates = 0
    let published_totals: RecordRow | null = null
    if (fits) {
      const unique = new Map<string, RecordRow>()
      for (const bucket of ['by_entity', 'people']) for (const [lookup, values] of Object.entries(object(data[bucket]))) for (const r of records(values)) {
        const key = JSON.stringify([r.registrant, r.principal, r.from, r.to, r.status, r.url, r.activities])
        const previous = unique.get(key)
        if (previous) (previous.lookup_names as string[]).push(lookup)
        else unique.set(key, { ...r, lookup_names: [lookup], jurisdiction: 'federal', source_url: sourceUrl(r.url), date_basis: 'registration interval overlap' })
      }
      rows = [...unique.values()]
    } else if (args.register === 'lobbyists') {
      for (const donor of donors) for (const r of records(donor.lobbyists)) rows.push({ client: donor.name, organisation: donor.name, lobbyist: r.firm,
        jurisdiction: r.jurisdiction, date: r.registered ?? null, status: r.ceased ? 'ceased' : 'current', status_scope: 'merged firm/client profile; current means active in at least one listed jurisdiction', source_url: sourceUrl(r.source_url ?? r.url), date_basis: 'earliest registration across the listed jurisdictions' })
      const selected = donors.filter(d => (!args.client || wordsMatch(args.client, [d.name])) && (!args.organisation || wordsMatch(args.organisation, [d.name])))
      if (selected.length === 1 && (args.client || args.organisation)) {
        const d = selected[0]
        complete = Number.isSafeInteger(d.lobbyists_total) && records(d.lobbyists).length === d.lobbyists_total
        if (!args.since && !args.until && !args.jurisdiction && !args.lobbyist && (!args.status || args.status === 'all') && Number.isSafeInteger(d.lobbyists_total)) published_totals = { client: d.name, firms: d.lobbyists_total, basis: 'all published client-profile firms across jurisdictions; not dated' }
      }
    } else {
      const unique = new Map<string, RecordRow>()
      for (const m of ministers) for (const r of records(m.recent)) {
        const row = { minister: m.name, minister_key: m.key, organisation: r.org, jurisdiction: m.jurisdiction, date: r.date, purpose: r.purpose,
          source_url: sourceUrl(r.source_url ?? r.url), latest_diary_url: sourceUrl(m.latest_pdf), date_basis: 'exported date; reporting-period start may replace an absent source meeting date', view: 'minister recent external meetings' }
        unique.set(tuple(row), row)
      }
      for (const donor of donors) for (const r of records(donor.meetings)) {
        const row = { minister: r.minister, page: r.page, organisation: donor.name, jurisdiction: r.jurisdiction, date: r.date, purpose: r.purpose,
          source_url: sourceUrl(r.source_url ?? r.url), date_basis: 'exported date; reporting-period start may replace an absent source meeting date', view: 'organisation profile recent meetings' }
        const key = tuple(row)
        if (!unique.has(key)) unique.set(key, row)
      }
      rows = [...unique.values()]
      if (args.minister && selectedMinisters.length === 1) {
        const m = selectedMinisters[0]
        if (!args.organisation && !args.client && !args.since && !args.until) published_totals = { minister: m.name, meetings: m.meetings_total, external_meetings: m.external_total, basis: 'all published minister-profile meetings, including internal government meetings; not dated' }
        if ((args.organisation || args.client) && !args.since && !args.until) {
          const exact = (Array.isArray(m.by_org) ? m.by_org as unknown[][] : []).find(r => same(r[0], args.organisation ?? args.client))
          if (exact && (!args.client || same(exact[0], args.client))) published_totals = { minister: m.name, organisation: exact[0], meetings: exact[1], basis: 'published all-time minister-profile count for this exact organisation label; not dated' }
        }
        // Minister recent lists exclude internal meetings, and cannot establish all-meeting totals.
        complete = false
      } else if (!args.minister && (args.organisation || args.client)) {
        const selected = donors.filter(d => (!args.organisation || wordsMatch(args.organisation, [d.name])) && (!args.client || wordsMatch(args.client, [d.name])))
        if (selected.length === 1) {
          const d = selected[0]
          const originals = records(d.meetings)
          complete = same(args.organisation ?? args.client, d.name) && Number.isSafeInteger(d.meetings_total) && originals.length === d.meetings_total && new Set(originals.map(r => tuple({ ...r, organisation: d.name }))).size === originals.length
          // Use this one complete projection when available; do not add another view's samples.
          if (complete) rows = originals.map(r => ({ ...r, organisation: d.name, source_url: sourceUrl(r.source_url ?? r.url), date_basis: 'exported date; reporting-period start may replace an absent source meeting date', view: 'organisation profile meetings' }))
          if (!args.since && !args.until && !args.jurisdiction && Number.isSafeInteger(d.meetings_total)) published_totals = { organisation: d.name, meetings: d.meetings_total, basis: 'all published organisation-profile meetings; not dated' }
        }
      }
    }
    rows = await Promise.all(rows.map(async r => {
      const identity = fits ? [r.registrant, r.principal, r.from, r.to, r.status, r.url, r.activities] : args.register === 'meetings' ? tuple(r) : [r.client, r.lobbyist, r.jurisdiction, r.date, r.status]
      const hash = [...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(JSON.stringify(identity))))].map(n => n.toString(16).padStart(2, '0')).join('').slice(0, 16)
      return { ...r, record_id: `a${stamp}-${fits ? 'f' : args.register === 'meetings' ? 'm' : 'l'}${hash}` }
    }))
    const matches = rows.filter(r => {
      if (args.record_id && args.record_id !== r.record_id || args.jurisdiction && !jurisdictionOf(r.jurisdiction).includes(String(args.jurisdiction))) return false
      if (!fits && args.minister && !ministerMatches({ ...r, key: r.minister_key })) return false
      if (args.organisation && !wordsMatch(args.organisation, [fits ? r.registrant : r.organisation])) return false
      if (args.client && !wordsMatch(args.client, [fits ? r.principal : r.client ?? r.organisation])) return false
      if (args.lobbyist && !wordsMatch(args.lobbyist, [fits ? r.registrant : r.lobbyist])) return false
      if (fits && args.minister && !(Array.isArray(r.lookup_names) ? r.lookup_names : []).some(name => same(name, args.minister)) && !same(r.registrant, args.minister)) return false
      if (args.status && args.status !== 'all' && args.status !== r.status) return false
      if (args.since || args.until) {
        if (fits) {
          // An inverted register interval (commencement after cease: a retrospective
          // registration) matches no window, so the activities' own dates stand in for it.
          const inverted = r.from && r.to && String(r.from) > String(r.to) && r.activity_from
          const start = inverted ? r.activity_from : r.from, end = inverted ? r.activity_to : r.to
          if (!start) { unknownDates++; return false }
          return (!args.until || String(start) <= String(args.until)) && (!args.since || !end || String(end) >= String(args.since))
        }
        if (!r.date) unknownDates++
        return inWindow(r.date, args)
      }
      return true
    })
    const offset = Number(args.offset) || 0, limit = args.record_id ? 1 : Number(args.limit) || 5
    const picked: RecordRow[] = matches.slice(offset, offset + limit).map(r => ({ ...boundedValue(r, args.record_id ? 1200 : 500) as RecordRow,
      source_status: r.source_url ? 'original register entry' : 'original entry URL omitted by export; OPAX projection only',
      full_record_url: sourceUrl(r.source_url) ?? siteUrl(env, path), follow_up: { register: args.register, record_id: r.record_id } }))
    const notes = [fits ? 'Counts cover distinct registration terms in the published FITS projection for matched entities and people, not all registrations in the original register.' : 'The access export retains at most eight recent entries per profile and omits individual original entry URLs. Sample counts are not complete register counts.',
      'Meetings and registrations do not establish influence or wrongdoing. A latest diary PDF may cover a different period and is not used as an older meeting citation.',
      ...(args.register === 'meetings' ? ['Minister recent lists contain external meetings only; all-time minister meeting totals also include internal government meetings. Identical exported descriptions are deduplicated across views; no source meeting IDs are available.', 'Date filters use exported dates. The exporter can substitute reporting-period start for a missing meeting date and does not retain date precision.'] : []),
      ...(args.register === 'lobbyists' ? ['Status and earliest registration dates are merged across jurisdictions. Current means at least one listed registration is active; a jurisdiction filter cannot establish current status in that particular state.'] : []),
      ...(unknownDates ? ['Some potentially matching records have no published date and cannot establish the requested dated count.'] : []),
      ...(matches.length ? [] : ['No retained record matches. This does not establish that no such meeting, client or registration exists.'])]
    const citations: ToolCitation[] = picked.map(r => ({ kind: 'record', url: sourceUrl(r.source_url) ?? siteUrl(env, path),
      text: clip(fits ? `${r.registrant} registered for ${r.principal} (${[r.country, r.status, readableRange(r.from, r.to), r.activity_from ? `registered activities ${readableRange(r.activity_from, r.activity_to)}` : ''].filter(Boolean).join(', ')}): ${(Array.isArray(r.activities) ? r.activities : []).join('; ')}.${r.date_note ? ` ${r.date_note}` : ''}` : args.register === 'meetings' ? `${r.minister} has an exported meeting entry with ${r.organisation}, dated ${r.date ?? 'date not published'} (${r.jurisdiction}; date may be reporting-period start). ${r.purpose ?? ''}${r.source_url ? '' : ' Original entry URL is omitted from the export.'}` : `${r.client} is listed as a client of ${r.lobbyist} (${r.jurisdiction}, merged profile status ${r.status}, earliest registration across those jurisdictions ${r.date ?? 'not recorded'}). Current means at least one listed registration is active, not every jurisdiction. Original entry URL ${r.source_url ? 'is supplied' : 'is omitted from the export'}.`, 1300) }))
    const scope = ['minister', 'organisation', 'lobbyist', 'client', 'jurisdiction', 'since', 'until', 'status'].filter(k => args[k] !== undefined).map(k => `${k} ${args[k]}`).join(', ') || 'all published retained profiles'
    const count: ToolCitation = { kind: 'count', url: siteUrl(env, path), text: `${matches.length} retained ${args.register} descriptions match ${scope} in this published projection. ${complete && !unknownDates ? 'This is a complete count within that projection.' : 'This is a sample count, not a complete count for the requested register or period.'}${published_totals ? ' Separately, undated profile totals: ' + JSON.stringify(published_totals) : ''}` }
    return publishedResult(picked, [count, ...citations], { register: args.register, total: matches.length, counts: { retained_matches: matches.length,
      exact_count: complete && !unknownDates ? matches.length : null, complete_for_projection: complete && !unknownDates, date_unavailable: unknownDates },
      published_totals, offset, next_offset: offset + picked.length < matches.length ? offset + picked.length : null, truncated: offset + picked.length < matches.length,
      snapshot: meta.generated, notes })
  },
}
