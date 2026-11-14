import type { ToolDeps } from './agentic-tools'

export interface ServicePeriod {
  jurisdiction: string
  chamber: string
  electorate: string | null
  start: string
  end: string | null
  ongoing: boolean | null
  as_of: string | null
  source: string
  url: string
}
interface Seat {
  jurisdiction: string; chamber: string; name: string; url?: string; current?: boolean; as_of?: string
  periods?: { start?: string; end?: string | null }[]
}
interface ServicePerson { name: string; person_id?: string; legacy_person_id?: string; electorates?: Seat[] }
interface PayPerson { name: string; pid?: string; chamber?: string; from?: string; to?: string | null; sitting?: boolean }
const fold = (name: string) => name.normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim()
const date = (value: unknown): value is string => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)

/** Enrich resolved names only. Speech years and roster observation dates are never service dates. */
export async function personService(deps: ToolDeps, people: { name: string; pid?: string; chambers?: string[] }[]): Promise<ServicePeriod[][]> {
  if (!people.length) return []
  const [electorates, pay] = await Promise.allSettled([
    (async () => {
      const manifest = await deps.asset('/electorates/manifest.json') as { release_id?: string; people_url?: string } | null
      if (!manifest?.release_id || !/^[a-f0-9]+$/.test(manifest.release_id) || manifest.people_url !== `/electorates/releases/${manifest.release_id}/people.json`) return null
      return await deps.asset(manifest.people_url) as { people?: ServicePerson[] } | null
    })(),
    deps.asset('/pay.json') as Promise<{ meta?: { as_of?: string; from?: string }; people?: Record<string, PayPerson> } | null>,
  ])
  deps.signal?.throwIfAborted()
  const servicePeople = electorates.status === 'fulfilled' ? electorates.value?.people ?? [] : []
  const payData = pay.status === 'fulfilled' ? pay.value : null
  return people.map(person => {
    const matches = servicePeople.filter(p => person.pid && (p.legacy_person_id === person.pid || p.person_id === person.pid) || fold(p.name) === fold(person.name))
    const seats = matches.length === 1 ? matches[0].electorates ?? [] : []
    const periods: ServicePeriod[] = seats.flatMap(seat => (seat.periods ?? []).filter(p => date(p.start) && (p.end == null || date(p.end))).map(p => ({
      jurisdiction: seat.jurisdiction, chamber: seat.chamber, electorate: seat.name,
      start: p.start!, end: p.end ?? null, ongoing: p.end ? false : seat.current ?? null,
      as_of: seat.as_of ?? null, source: 'Published electorate service history',
      url: seat.url && /^\/subject\/electorate\/[a-z0-9-]+$/.test(seat.url) ? new URL(seat.url, deps.origin ?? 'https://opax.com.au').href : 'https://handbook.aph.gov.au/',
    })))
    // Senate history is not in the electorate export. The pay export carries dated Handbook service,
    // separately from salary spells and their later start dates.
    const senators = Object.values(payData?.people ?? {}).filter(p => p.chamber === 'senate' && (person.pid && p.pid === person.pid || fold(p.name) === fold(person.name)))
    if (!periods.some(p => p.jurisdiction === 'federal' && p.chamber === 'senate') && senators.length === 1) {
      const senator = senators[0], senateSeats = seats.filter(s => s.jurisdiction === 'federal' && s.chamber === 'senate')
      // The export clips older careers at its coverage start and merges service across chambers.
      // Neither a clipped start nor a House career start establishes entry to the Senate.
      const houseService = person.chambers?.includes('representatives') || periods.some(p => p.jurisdiction === 'federal' && p.chamber === 'representatives')
      if (!houseService && senator.from !== payData?.meta?.from && date(senator.from) && (senator.to == null || date(senator.to))) periods.push({
        jurisdiction: 'federal', chamber: 'senate', electorate: senateSeats.length === 1 ? senateSeats[0].name : null,
        start: senator.from, end: senator.to ?? null, ongoing: senator.to ? false : senator.sitting ?? null,
        as_of: payData?.meta?.as_of ?? null, source: 'Parliamentary Handbook service dates in the pay export', url: 'https://handbook.aph.gov.au/',
      })
    }
    return periods.sort((a, b) => a.start.localeCompare(b.start) || a.chamber.localeCompare(b.chamber))
  })
}

export function serviceText(name: string, period: ServicePeriod): string {
  const day = (value: string) => new Date(value + 'T00:00:00Z').toLocaleDateString('en-AU', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' })
  const chamber = period.chamber === 'senate' ? 'Senate' : period.chamber === 'representatives' ? 'House of Representatives' : period.chamber
  const end = period.end ? ` to ${day(period.end)}` : period.ongoing === true ? `, ongoing${period.as_of ? ` as at ${day(period.as_of)}` : ''}` : '; end date not recorded'
  return `${name} served in the ${chamber}${period.electorate ? ` for ${period.electorate}` : ''} from ${day(period.start)}${end}.`
}
