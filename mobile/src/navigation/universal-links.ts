import { Linking, Platform } from 'react-native';
import { routePatternFor } from '../analytics/route-patterns';
import {
  universalLinkExcludes,
  universalLinkOpens,
  type UniversalLinkPattern,
} from './universal-links.generated';

/**
 * Universal links: which opax.com.au addresses open in the app.
 *
 * One table decides (docs/universal-links.json, generated into
 * universal-links.generated.ts). The Worker serves the same table as
 * /.well-known/apple-app-site-association, so iOS only hands the app the
 * addresses listed there. This module applies the table again inside the
 * app: an https link the table does not claim, or one that would not land
 * on the page its entry names, opens in the browser instead of on "This
 * page isn’t in the app". opax:// links and widget links are the app's own
 * and are not gated.
 */

/** Apple's wildcard match: `*` is any run of characters, `?` exactly one. */
function wildcard(glob: string, text: string): boolean {
  const source = [...glob]
    .map((c) =>
      c === '*'
        ? '[\\s\\S]*'
        : c === '?'
          ? '[\\s\\S]'
          : c.replace(/[\\^$+.()|[\]{}]/g, '\\$&'),
    )
    .join('');
  return new RegExp(`^${source}$`).test(text);
}

/** A missing query item matches as the empty string, as it does on iOS. */
function matches(pattern: UniversalLinkPattern, url: URL): boolean {
  if (!wildcard(pattern['/'], url.pathname)) return false;
  for (const [key, glob] of Object.entries(pattern['?'] ?? {}))
    if (!wildcard(glob, url.searchParams.get(key) ?? '')) return false;
  const fragment = pattern['#'];
  if (fragment !== undefined && !wildcard(fragment, url.hash.slice(1)))
    return false;
  return true;
}

/** The table entry that claims an address: exclusions first, then the first match. */
export function universalLinkEntry(url: URL) {
  if (universalLinkExcludes.some((pattern) => matches(pattern, url)))
    return null;
  return universalLinkOpens.find((pattern) => matches(pattern, url)) ?? null;
}

/**
 * Whether an https link opens in the app at `destination`, the app path the
 * link handler resolved for it: the table must claim the address, and the
 * destination must be one of the pages the entry names (so a claimed
 * address the resolver could not place never reaches the not-found page).
 */
export function opensInApp(url: URL, destination: string): boolean {
  const entry = universalLinkEntry(url);
  return !!entry && entry.opens.includes(routePatternFor(destination));
}

/**
 * The link stays on the web. When an app opens a link to its own associated
 * domain, iOS opens it in the browser rather than handing it back to the app.
 */
export function openOnWeb(url: URL) {
  void Linking.openURL(url.href).catch(() => {
    /* No browser to hand it to: the app stays where it is. */
  });
}

/**
 * Where the app goes for a link it handed to the browser: nowhere when it
 * is already open, and its first page on a cold start. Android's link inbox
 * needs a destination for every delivery, so it always gets the first page.
 */
export const stayPath = (initial: boolean) =>
  initial || Platform.OS === 'android' ? '/' : '';
