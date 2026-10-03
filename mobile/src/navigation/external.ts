import { Alert, Linking } from 'react-native';
import * as WebBrowser from 'expo-web-browser';
import { isE2E, webOrigin } from '../design/environment';
import { light } from '../design/tokens';

// Where the Worker or the web app turns an OPAX address into a page the app
// never sends a reader to (portal/src/page-entry.ts, portal/src/index.ts,
// portal/src/social-publication.ts and portal/public/app.js):
// - first path segments /api, /og and /mcp (machine and model routes), /ask
//   and /chat (Ask), /search (302 to /ask?view=search, which runs a model-
//   backed search), /today (302 to a page the journal picks at request time),
//   /ingest and /.well-known;
// - the root with "q" or "ask" (302 to /ask);
// - "ask" on any page (the web app's legacy Ask entry runs on every page);
// - a route-shaped fragment ("#/ask", "#//ask"), which the web app routes
//   instead of the path (see forbiddenFragment), and "q" or "ask" anywhere in
//   a fragment.
const forbiddenRoutes = new Set([
  'api',
  'og',
  'mcp',
  'ask',
  'chat',
  'search',
  'today',
  'ingest',
  '.well-known',
]);
// Whitespace, control characters and backslashes (which URL parsers read as
// slashes) are refused before any parsing.
const unsafeCharacters = /[\u0000-\u0020\u007f\\]/;
// Query keys that start Ask: "q" on the root or /ask, "ask" on any page.
const askKeys = new Set(['q', 'ask']);

/** An OPAX host, with any trailing dot or letter case: the same server. */
function isOpaxHost(hostname: string): boolean {
  const host = hostname.toLowerCase().replace(/\.+$/, '');
  return (
    host === new URL(webOrigin).hostname ||
    host === 'opax.com.au' ||
    host.endsWith('.opax.com.au')
  );
}

/**
 * Why an address on the OPAX site is one the app never opens or shares, or
 * null when it is an ordinary page. Path segments are decoded first, so
 * "/%61sk" is "/ask".
 */
export function forbiddenOpaxRoute(url: URL): string | null {
  const segments = url.pathname.split('/').slice(1);
  let first: string;
  try {
    first = decodeURIComponent(segments[0] ?? '').toLowerCase();
  } catch {
    return 'an unreadable path';
  }
  if (forbiddenRoutes.has(first)) return `/${first}`;
  if (url.searchParams.has('ask')) return 'an Ask query';
  const root = segments.every((segment) => segment === '');
  if (root && url.searchParams.has('q')) return 'an Ask query';
  return forbiddenFragment(url.hash);
}

/**
 * Why a fragment is one the web app would route somewhere forbidden, or null.
 * The router in portal/public/app.js (rawFragment, hereRoute, parseHash) does
 * not parse a fragment as a URL: when the text after the first "#" starts
 * with "/", it is the route, empty segments are dropped (so "//ask" is "/ask",
 * never a host) and the query is read after the first "?". On the homepage,
 * portal/public/home.js resolves the same text as a path, dot segments
 * included, and redirects to it. This check reads wider than both: it decodes
 * up to three times (still escaped is refused), drops whitespace and control
 * characters, reads backslashes as slashes, folds case, checks every "#" part
 * and refuses "q" or "ask" anywhere. Plain anchors ("#person-pay") pass.
 */
function forbiddenFragment(hash: string): string | null {
  let text = hash.replace(/^#/, '');
  for (let round = 0; /%[0-9a-f]{2}/i.test(text); round++) {
    if (round === 3) return 'an unreadable fragment';
    try {
      text = decodeURIComponent(text);
    } catch {
      return 'an unreadable fragment';
    }
  }
  text = text
    .replace(/[\u0000-\u0020\u007f]/g, '')
    .replace(/\\/g, '/')
    .toLowerCase();
  for (const part of text.split('#')) {
    const path = part.split('?')[0]!;
    if (path.startsWith('/')) {
      const segments = path.split('/').filter(Boolean);
      if (segments.some((segment) => segment === '.' || segment === '..'))
        return 'a fragment route with dot segments';
      const first = segments[0] ?? '';
      if (forbiddenRoutes.has(first)) return `/${first}`;
    }
    // Every "key=value" piece counts, and every piece after a "?" or "&".
    const pieces = part.split(/[?&]/);
    for (const [index, piece] of pieces.entries()) {
      if (index === 0 && !piece.includes('=')) continue;
      if (askKeys.has(piece.split('=')[0]!)) return 'an Ask query';
    }
  }
  return null;
}

/**
 * Canonical OPAX URL for a path on the public site: no query, no UTM, no app
 * state. The path is checked raw, then parsed, and the parsed result must keep
 * the configured origin and the exact path. Throws for anything else: foreign
 * hosts, protocol-relative or backslash paths, dot segments, encoded slashes,
 * backslashes or dots, and every route in forbiddenOpaxRoute.
 */
export function canonicalUrl(path: string, anchor?: string): string {
  if (typeof path !== 'string' || unsafeCharacters.test(path))
    throw new Error(
      'Canonical paths have no spaces, control characters or backslashes',
    );
  if (!path.startsWith('/') || path.startsWith('//'))
    throw new Error('Canonical paths start with a single slash');
  const pathname = path.split(/[?#]/)[0]!;
  if (/%(?:2f|5c|2e)/i.test(pathname))
    throw new Error('Canonical paths have no encoded slashes or dots');
  if (
    pathname.split('/').some((segment) => segment === '.' || segment === '..')
  )
    throw new Error('Canonical paths have no dot segments');
  const base = new URL(webOrigin);
  const url = new URL(pathname, base);
  if (
    url.origin !== base.origin ||
    url.username ||
    url.password ||
    url.pathname !== pathname
  )
    throw new Error('The path does not stay on the public site');
  const reason = forbiddenOpaxRoute(url);
  if (reason) throw new Error(`Not a page the app links to: ${reason}`);
  if (anchor !== undefined) {
    if (!/^[A-Za-z0-9_-]+$/.test(anchor))
      throw new Error('Section anchors are plain identifiers');
    url.hash = anchor;
  }
  return url.toString();
}

/**
 * Checks an external source record or register link and returns it
 * normalised. HTTPS on the default port, no user information, no unsafe
 * characters; on OPAX's own hosts (any case, trailing dot or subdomain) every
 * route in forbiddenOpaxRoute is refused after normalisation, so
 * "/subject/../api", "/search", "/?q=", "#/ask" and "#//ask" cannot slip
 * through.
 */
export function sourceUrl(raw: string): string {
  if (typeof raw !== 'string' || unsafeCharacters.test(raw))
    throw new Error(
      'Source links have no spaces, control characters or backslashes',
    );
  const url = new URL(raw);
  if (url.protocol !== 'https:') throw new Error('Source links use HTTPS');
  if (url.username || url.password)
    throw new Error('Source links carry no user information');
  if (!url.hostname || url.port) throw new Error('Source links name a host');
  if (isOpaxHost(url.hostname)) {
    if (/%(?:2f|5c)/i.test(url.pathname))
      throw new Error('Source links have no encoded slashes');
    const reason = forbiddenOpaxRoute(url);
    if (reason) throw new Error(`Not a page the app links to: ${reason}`);
  }
  return url.toString();
}

/**
 * Opens an external source record or register in SFSafariViewController,
 * visibly presented (guideline 5.1.1(vii)). E2E builds never open a browser:
 * they show the destination locally instead.
 */
export async function openSource(url: string, label: string): Promise<void> {
  let checked: string;
  try {
    checked = sourceUrl(url);
  } catch {
    Alert.alert('Source record', 'This source link could not be opened.');
    return;
  }
  if (isE2E) {
    // Title and URL apart, so journeys can assert the exact destination.
    Alert.alert(`Source record: ${label}`, checked);
    return;
  }
  try {
    await WebBrowser.openBrowserAsync(checked, {
      controlsColor: light.navy,
      dismissButtonStyle: 'close',
      presentationStyle: WebBrowser.WebBrowserPresentationStyle.PAGE_SHEET,
      readerMode: false,
    });
  } catch {
    Alert.alert('Source record', 'The source link could not be opened.');
  }
}

/**
 * Opens a web-only OPAX page (community, the money map, Methods) in Safari,
 * outside the app. The control shows the "Opens on opax.com.au" cue.
 */
export async function openOnWeb(path: string, label: string): Promise<void> {
  let url: string;
  try {
    url = canonicalUrl(path);
  } catch {
    Alert.alert('opax.com.au', 'This page could not be opened.');
    return;
  }
  if (isE2E) {
    Alert.alert(`Opens on opax.com.au: ${label}`, url);
    return;
  }
  await Linking.openURL(url).catch(() =>
    Alert.alert('opax.com.au', 'This page could not be opened.'),
  );
}
