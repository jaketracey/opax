// The reports are off the site for now (19 Oct): the six standing reports and
// "Where community funding goes" (grants-allocation). REPORTS_ENABLED in
// wrangler.jsonc is the one switch. "true" publishes them exactly as before;
// anything else (unset included) keeps every page, link, data file, search row
// and crawl entry out. The generators and the report files stay in git.

export const REPORTS_INDEX = '/reports/index.json'

export const reportsEnabled = (value: unknown): boolean => String(value) === 'true'

/** Every address the reports publish: /reports, each report, its section links
 *  and its data files. */
export const reportsPath = (pathname: string): boolean => /^\/reports(?:\/|$)/.test(pathname)

/** What every other client reads while the reports are off: the index's own
 *  shape, with nothing in it. */
export const EMPTY_REPORTS_INDEX = { reports: [] as never[] }

/** REPORTS_APP_DATA: while the reports are off, the installed apps (iOS 1.0 in
 *  App Review, Android in testing) still read the report data they open from
 *  topic rows, quiz links, edition cards, search and opax:// links, and the money
 *  screen's grants-allocation.json, so they never meet a broken screen. Exact "true" serves it; remove the switch once an app
 *  build without the report screens ships (the app follow-up in the reports-off lane). */
export const reportsAppData = (value: unknown): boolean => String(value) === 'true'

/** The apps' catalog User-Agent (mobile/src/api/user-agent.ts: "OPAX-iOS/<version> (<build>)"). */
export const appUserAgent = (userAgent: string | null): boolean => /^OPAX-(?:iOS|Android)\//.test(userAgent ?? '')

/** The report data files the apps read: the index and each report's JSON (never a page). */
export const reportDataPath = (pathname: string): boolean => /^\/reports\/[a-z][a-z0-9-]*\.json$/.test(pathname)
