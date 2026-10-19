// The six standing reports are off the site for now (19 Oct): REPORTS_ENABLED
// in wrangler.jsonc is the one switch. "true" publishes them exactly as before;
// anything else (unset included) keeps every page, link, data file, search row
// and crawl entry out. The generators and the report files stay in git.

export const REPORTS_INDEX = '/reports/index.json'

/** The one page under /reports that stays either way: "Where community funding
 *  goes", the grants explorer. It is not one of the six, and the apps' money
 *  screen reads its data file (/reports/grants-allocation.json). */
export const KEPT_REPORT = 'grants-allocation'

export const reportsEnabled = (value: unknown): boolean => String(value) === 'true'

const kept = (pathname: string): boolean => [`/reports/${KEPT_REPORT}`, `/reports/${KEPT_REPORT}/`, `/reports/${KEPT_REPORT}.json`].includes(pathname)

/** Every address the six reports publish: /reports, each report, its section
 *  links and its data files (the kept grants page and its data excepted). */
export const reportsPath = (pathname: string): boolean => /^\/reports(?:\/|$)/.test(pathname) && !kept(pathname)

/** What installed apps read while the reports are off: the index's own shape,
 *  with nothing in it, so a Reports screen shows empty instead of an error. */
export const EMPTY_REPORTS_INDEX = { reports: [] as never[] }
