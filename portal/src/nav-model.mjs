// The site's navigation, shared with the browser: navigation.js holds the one
// list of groups and pages, and the server reads it for every breadcrumb trail
// it prints and for the menus' gates, so the two can never name a page twice.
import '../public/navigation.js'
import { vicElectionEnabled } from '../public/vic-election.js'
import { reportsEnabled } from './reports-gate.ts'

const nav = globalThis.OpaxNavigation

/** Home › the section page › the record, after Home. */
export const trail = (address, ...records) => nav.trail(address, ...records)

/** Record trails use names supplied by source metadata. Both confident and
 * uncertain donor matches are named once the caller finds the record. */
export function pageTrail(address, record = '', { donorNamed = false } = {}) {
  const base = trail(address)
  const section = base.at(-1)
  const path = String(address).split(/[?#]/)[0]
  const name = String(record || '').trim()
  const donor = path.startsWith('/subject/donor/')
  const named = section?.href && name && name !== section.label && (!donor || donorNamed)
  return named ? trail(address, name) : base
}

/** The optional sections this deployment publishes, as the menus read them
 *  from <html data-nav-gates>: no request when a menu opens. */
export function navGates(env) {
  return [vicElectionEnabled(env.VIC_ELECTION_HUB_ENABLED) ? 'vic-election' : '', reportsEnabled(env.REPORTS_ENABLED) ? 'reports' : ''].filter(Boolean).join(' ')
}
