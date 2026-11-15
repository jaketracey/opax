import { vicTermEnd, vicExpiredPhrase, vicMemberRole, vicMembersAtExpiry, vicTermEndDay, vicIsMember, type VicTermRow } from '../public/vic-term.js'
import type { EndedSeat } from './seo-titles'

/** A person's standing in the ended Victorian houses (public/vic-term.js), in the shape personRole
 *  reads: the member a seat's row names, with that row's party; a former member; or nothing to say. */
export function vicEndedSeat(p: Parameters<typeof vicTermEnd>[0], rows: VicTermRow[] | null | undefined): EndedSeat {
  const end = vicTermEnd(p, rows)
  if (!end || !p) return null
  if (!end.row) return { jurisdiction: 'vic', member: null }
  const day = vicTermEndDay()
  return { jurisdiction: 'vic', member: { role: vicMemberRole(end.row), party: vicMembersAtExpiry(end.row, rows).find(m => vicIsMember(m, p))?.party ?? null,
    until: { phrase: vicExpiredPhrase(end.row), title: `until ${day.long}`, short: `to ${day.short}` } } }
}
