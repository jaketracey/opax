/**
 * Universal links: the Apple app-site-association file.
 *
 * iOS reads this file from the app's associated domain (applinks:opax.com.au
 * in the app's entitlements) to learn which addresses open in the OPAX app.
 * It must be JSON, served with `application/json` and without a redirect:
 * Apple's fetcher does not follow one. The route is answered before the
 * page-alias redirects for that reason.
 *
 * The addresses come from docs/universal-links.json, the table the app's own
 * link handler is generated from (scripts/build_universal_links.mjs), so the
 * file claims exactly the pages the app can open. Everything else, and every
 * excluded address (the API, /mcp, sign-in and community links, the legal
 * pages), stays on the web.
 *
 * The app is named by `<Team ID>.<bundle ID>`:
 * - the bundle ID is the table's `bundleId`, the same value as
 *   ios.bundleIdentifier in the app's Expo config (mobile/app.config.ts);
 * - the Team ID is not in the app config or anywhere in this repository
 *   (the release tooling reads it from a local file as APPLE_TEAM_ID). It is
 *   set as the Worker var APPLE_TEAM_ID. While it is unset, or is not a
 *   10-character team identifier, the path answers 404 like any unknown page
 *   and iOS opens every link on the web.
 */
import { APP_BUNDLE_ID, APP_LINK_COMPONENTS, APP_LINK_HOST } from './universal-links.generated.ts'

export const APP_SITE_ASSOCIATION_PATH = '/.well-known/apple-app-site-association'

/** An Apple Team ID: ten upper-case letters and digits. */
const TEAM_ID = /^[A-Z0-9]{10}$/

/** The file's body for one team: modern `applinks` details, components in table order. */
export function appSiteAssociation(teamId: string) {
  return {
    applinks: {
      details: [{ appIDs: [`${teamId}.${APP_BUNDLE_ID}`], components: APP_LINK_COMPONENTS }],
    },
  }
}

export function appSiteAssociationResponse(request: Request, teamId: string | undefined): Response {
  const head = request.method === 'HEAD'
  // Only the claimed host serves the file: www and any other host the Worker
  // answers are not associated domains.
  const claimedHost = new URL(request.url).hostname === APP_LINK_HOST
  if ((request.method !== 'GET' && !head) || !claimedHost || typeof teamId !== 'string' || !TEAM_ID.test(teamId))
    return new Response(head ? null : 'Not found', {
      status: 404,
      headers: { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'no-store', 'x-robots-tag': 'noindex' },
    })
  return new Response(head ? null : JSON.stringify(appSiteAssociation(teamId)), {
    headers: { 'content-type': 'application/json', 'cache-control': 'public, max-age=3600', 'x-robots-tag': 'noindex' },
  })
}
