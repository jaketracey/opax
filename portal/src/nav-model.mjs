// The site's navigation, shared with the browser: navigation.js holds the one
// list of groups and pages, and the server reads it for every breadcrumb trail
// it prints and for the menus' gates, so the two can never name a page twice.
import '../public/navigation.js'
import { vicElectionEnabled } from '../public/vic-election.js'

const nav = globalThis.OpaxNavigation

/** Home › the section page › the record, after Home. */
export const trail = (address, ...records) => nav.trail(address, ...records)

/** A page's trail, given the record's name when the page is one. A section
 *  page ignores the name (its trail is itself), as does a record whose name is
 *  only its section's (a tool opened on /explore). Donors follow the 12 Oct
 *  rule: a confident-match donor is named, and a placeholder never is. So a
 *  donor's trail carries the name only when the caller says the page itself
 *  names the donor (`donorNamed`: an indexable page; the Worker withholds a
 *  donor on a noindex page that names nobody), and never a placeholder. */
export function pageTrail(address, record = '', { donorNamed = false } = {}) {
  const base = trail(address)
  const section = base.at(-1)
  const path = String(address).split(/[?#]/)[0]
  const name = String(record || '').trim()
  const donor = path.startsWith('/subject/donor/')
  const placeholder = /\(name withheld\)|^Donor \d+\b/i.test(name)
  const named = section?.href && name && name !== section.label && !placeholder && (!donor || donorNamed)
  return named ? trail(address, name) : base
}

/** The optional sections this deployment publishes, as the menus read them
 *  from <html data-nav-gates>: no request when a menu opens. */
export function navGates(env) {
  return [vicElectionEnabled(env.VIC_ELECTION_HUB_ENABLED) ? 'vic-election' : ''].filter(Boolean).join(' ')
}
