// The site's navigation, shared with the browser: navigation.js holds the one
// list of groups and pages, and the server reads it for every breadcrumb trail
// it prints and for the menus' gates, so the two can never name a page twice.
import '../public/navigation.js'
import { vicElectionEnabled } from '../public/vic-election.js'

const nav = globalThis.OpaxNavigation

/** Home › the section page › the record, after Home. */
export const trail = (address, ...records) => nav.trail(address, ...records)

/** A page's trail, given the record's name when the page is one. A section
 *  page ignores the name (its trail is itself); a donor's page never shows one,
 *  whatever the caller holds (individual donors are withheld everywhere). */
export function pageTrail(address, record = '') {
  const base = trail(address)
  const inSection = Boolean(base.at(-1)?.href)
  const path = String(address).split(/[?#]/)[0]
  return inSection && record && !path.startsWith('/subject/donor/') ? trail(address, record) : base
}

/** The optional sections this deployment publishes, as the menus read them
 *  from <html data-nav-gates>: no request when a menu opens. */
export function navGates(env) {
  return [vicElectionEnabled(env.VIC_ELECTION_HUB_ENABLED) ? 'vic-election' : ''].filter(Boolean).join(' ')
}
