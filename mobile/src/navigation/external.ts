import { Alert, Linking } from 'react-native';
import { router } from 'expo-router';
import { fromWebPath } from './routes';
import * as WebBrowser from 'expo-web-browser';
import { hasSourcePreview, isE2E, webOrigin } from '../design/environment';
import { light } from '../design/tokens';
import { presentSourceDestination } from './source-destination';

// Where the Worker or the web app turns an OPAX address into a page the app
// never sends a reader to (portal/src/page-entry.ts, portal/src/index.ts,
// portal/src/social-publication.ts, portal/public/app.js, home.js and
// community.js):
// - first path segments /api, /og and /mcp (machine and model routes), /ask
//   and /chat (Ask), /search (302 to /ask?view=search, which runs a model-
//   backed search), /today (302 to a page the journal picks at request time),
//   /ingest and /.well-known;
// - the root with "q" or "ask" (302 to /ask);
// - "ask" on any page (the web app's legacy Ask entry runs on every page);
// - a credential in the query or fragment (Community signs a reader in with a
//   fragment token);
// - a route-shaped fragment that is not a content page (see
//   forbiddenFragment), and "q" or "ask" anywhere in a fragment.
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
// Keys that carry a credential, refused in an OPAX query or fragment.
const credentialKeys = new Set([
  'token',
  'access_token',
  'id_token',
  'refresh_token',
  'code',
  'api_key',
  'key',
  'secret',
  'session',
  'auth',
  'password',
  'sig',
  'signature',
]);
// The route-shaped fragments the app opens: content views whose branch of
// route() in portal/public/app.js draws a page of its own, each with the
// segments that branch needs after the view. Every other route falls back
// to the Ask panel, or is Ask, chat or search.
const subjectIndexes = new Set([
  'person',
  'party',
  'donor',
  'supplier',
  'agency',
  'campaigner',
  'electorate',
  'topic',
]);
const anyRest = () => true;
const fragmentViews = new Map<string, (rest: string[]) => boolean>([
  ['subject', (rest) => rest.length >= 2 || subjectIndexes.has(rest[0]!)],
  ['bill', anyRest],
  ['bills', anyRest],
  ['declared', anyRest],
  ['doc', (rest) => rest.length >= 1],
  ['reports', anyRest],
  ['money', anyRest],
  ['discover', anyRest],
  ['connections', anyRest],
  ['explore', anyRest],
  ['about', anyRest],
  ['methods', anyRest],
  ['stats', anyRest],
  ['expenses', anyRest],
]);

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
 * Text as the loosest reader could see it: decoded up to three times,
 * compatibility-folded (full-width letters, the long s), in lower case, with
 * no whitespace or control characters and backslashes read as slashes. Null
 * when it is still escaped after that, or cannot be decoded.
 */
function loosely(text: string): string | null {
  for (let round = 0; /%[0-9a-f]{2}/i.test(text); round++) {
    if (round === 3) return null;
    try {
      text = decodeURIComponent(text);
    } catch {
      return null;
    }
  }
  return text
    .normalize('NFKC')
    .replace(/[\s\u0000-\u001f\u007f]/g, '')
    .replace(/\\/g, '/')
    .toLowerCase();
}

/** The key of every "?", "&", "#" or ";" piece, bare words included. */
function keysIn(text: string): string[] {
  return text.split(/[?&#;]/).map((piece) => piece.split('=')[0]!);
}

/**
 * Why an address on the OPAX site is one the app never opens or shares, or
 * null when it is an ordinary page. Path segments are decoded first, so
 * "/%61sk" is "/ask", and query keys are read loosely, so "%2561sk" is "ask".
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
  const query = loosely(url.search);
  if (query === null) return 'an unreadable query';
  const keys = keysIn(query);
  if (keys.some((key) => credentialKeys.has(key))) return 'a credential';
  if (keys.includes('ask')) return 'an Ask query';
  const root = segments.every((segment) => segment === '');
  if (root && keys.includes('q')) return 'an Ask query';
  return forbiddenFragment(url.hash);
}

/**
 * Why a fragment is one the web app would take somewhere forbidden, or null.
 * When the text after the first "#" starts with "/", the web app reads it as a
 * route three ways: the router (rawFragment and parseHash in
 * portal/public/app.js) drops empty segments, so "//ask" is "/ask"; the
 * startup fold (pathFor) and the homepage (home.js) parse it as a URL, so
 * "//example.org/chat" is "/chat" and "/x/../ask" is "/ask"; and route()
 * shows the Ask panel for any view it does not know ("/ASK", "/ask;x",
 * "/doc"). So a route-shaped fragment must name a content view in
 * fragmentViews, exactly, with one leading slash and no empty, dot or escaped
 * segment, which every reading agrees on. The fragment is also read loosely
 * (decoded, folded, every "#" part), and then must hold no route but a content
 * view and no "q", "ask" or credential key. Plain anchors ("#person-pay")
 * pass.
 */
function forbiddenFragment(hash: string): string | null {
  const raw = hash.replace(/^#/, '');
  if (!raw) return null;
  const text = loosely(raw);
  if (text === null) return 'an unreadable fragment';
  const keys = keysIn(text);
  if (keys.some((key) => credentialKeys.has(key))) return 'a credential';
  if (keys.some((key) => askKeys.has(key))) return 'an Ask query';
  const router = raw.split('#')[0]!;
  if (router.startsWith('/') && !contentRoute(router, true))
    return 'a fragment route';
  for (const part of text.split('#'))
    if (part.startsWith('/') && !contentRoute(part, false))
      return 'a fragment route';
  return null;
}

/**
 * Whether a route ("/view/…?query") names a content view in fragmentViews.
 * Raw routes are held to URL path characters, so a URL parser cannot read a
 * backslash or an escape differently from the router.
 */
function contentRoute(route: string, raw: boolean): boolean {
  const path = route.split('?')[0]!;
  const shape = raw
    ? /^(?:\/[A-Za-z0-9._~!$&'()*+,;=:@%-]+)+\/?$/
    : /^(?:\/[^/]+)+\/?$/;
  if (!shape.test(path)) return false;
  const segments = path.split('/').filter(Boolean);
  if (segments.some((segment) => /^(?:\.|%2e){1,2}$/i.test(segment)))
    return false;
  const [view = '', ...rest] = segments;
  return fragmentViews.get(view)?.(rest) ?? false;
}

/**
 * Canonical OPAX URL for a path on the public site: no query, no UTM, no app
 * state. The path is checked raw, then parsed, and the parsed result must keep
 * the configured origin and the exact path. Throws for anything else: foreign
 * hosts, protocol-relative or backslash paths, dot segments, encoded slashes,
 * backslashes or dots, every route in forbiddenOpaxRoute, and an anchor that
 * names a credential or Ask.
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
  if (anchor !== undefined) {
    if (!/^[A-Za-z0-9_-]+$/.test(anchor))
      throw new Error('Section anchors are plain identifiers');
    url.hash = anchor;
  }
  // The anchor too: "token", "code" or "ask" is no section.
  const reason = forbiddenOpaxRoute(url);
  if (reason) throw new Error(`Not a page the app links to: ${reason}`);
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
export async function openSource(
  url: string,
  citation = 'Source record',
): Promise<void> {
  let checked: string;
  try {
    checked = sourceUrl(url);
  } catch {
    Alert.alert('Source record', 'This source link could not be opened.');
    return;
  }
  if (openNativeRecord(checked)) return;
  if (isE2E) {
    if (hasSourcePreview) presentSourceDestination({ url: checked, citation });
    else Alert.alert(`Source record: ${citation}`, checked);
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
 * The address openOnWeb opens for a path on the public site, or null when the
 * guard refuses it. The raw path is validated, then the record's query is kept
 * for navigation; sourceUrl applies the route, query and fragment guard to it.
 * Canonical share links still omit query state.
 */
export function webPageUrl(path: string): string | null {
  try {
    canonicalUrl(path);
    return sourceUrl(new URL(path, webOrigin).toString());
  } catch {
    return null;
  }
}

/**
 * Opens a web-only OPAX page (community, the money map, Methods) in Safari,
 * outside the app. The control shows the "Opens on opax.com.au" cue.
 */
export async function openOnWeb(path: string, label: string): Promise<void> {
  const url = webPageUrl(path);
  if (url === null) {
    Alert.alert('opax.com.au', 'This page could not be opened.');
    return;
  }
  if (openNativeRecord(url)) return;
  if (isE2E) {
    Alert.alert(`Opens on opax.com.au: ${label}`, url);
    return;
  }
  await Linking.openURL(url).catch(() =>
    Alert.alert('opax.com.au', 'This page could not be opened.'),
  );
}

/** Record links from Bill, Talk and other lanes converge on the same reader. */
function openNativeRecord(address: string): boolean {
  const url = new URL(address);
  const canonicalHost = url.hostname === 'opax.com.au' || url.hostname === new URL(webOrigin).hostname;
  if (!canonicalHost) return false;
  const path = url.hash.startsWith('#/doc/') ? url.hash : `${url.pathname}${url.search}${url.hash}`;
  const route = fromWebPath(path);
  // Only these record routes change the external fallback in this lane.
  if (!route || !['/doc/[slug]', '/bill-text/[key]', '/recent-records'].includes(route.pathname)) return false;
  router.push(route);
  return true;
}
