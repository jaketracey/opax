import { vicTermEnd, vicExpiredPhrase, vicMemberRole, vicMembersAtExpiry, vicTermEndDay, vicIsMember, type VicTermRow } from '../public/vic-term.js'
import { vacatedSeat } from '../public/seat-vacancy.js'
import type { EndedSeat } from './seo-titles'

/** A person's standing in the ended Victorian houses (public/vic-term.js), in the shape personRole
 *  reads: the member a seat's row names, with that row's party; a former member; or nothing to say. */
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']
/** `people` is the release's people file. With it, the last member of a seat the release records vacant
 *  (public/seat-vacancy.js) is named with the dates of that service, "Member for Brunswick, 2018 to
 *  19 September 2026", instead of as a former member with no dates. */
export function vicEndedSeat(p: Parameters<typeof vicTermEnd>[0], rows: VicTermRow[] | null | undefined, people: readonly { name: string; aliases?: string[] }[] | null = null): EndedSeat {
  const end = vicTermEnd(p, rows)
  if (!end || !p) return null
  if (!end.row) {
    const matches = (people ?? []).filter(x => [x.name, ...(x.aliases || [])].includes(p.name))
    const seat = matches.length === 1 ? vacatedSeat(matches[0], rows) : null
    if (!seat) return { jurisdiction: 'vic', member: null }
    const day = Number(seat.end.slice(8, 10)), month = MONTHS[Number(seat.end.slice(5, 7)) - 1], year = seat.end.slice(0, 4)
    return { jurisdiction: 'vic', member: { role: `Member for ${seat.name}, ${seat.start.slice(0, 4)}`, party: null,
      until: { phrase: `to ${day} ${month} ${year}`, title: `to ${day} ${month} ${year}`, short: `to ${day} ${month.slice(0, 3)} ${year}` } } }
  }
  const day = vicTermEndDay()
  return { jurisdiction: 'vic', member: { role: vicMemberRole(end.row), party: vicMembersAtExpiry(end.row, rows).find(m => vicIsMember(m, p))?.party ?? null,
    until: { phrase: vicExpiredPhrase(end.row), title: `until ${day.long}`, short: `to ${day.short}` } } }
}
