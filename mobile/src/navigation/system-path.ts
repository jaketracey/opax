import { track } from '../analytics';
import { routePatternFor } from '../analytics/route-patterns';
import { communityHome } from '../features/community/entry';
import { fromWebPath } from './external';
import { inLinkTab } from './link-tab';
import { openOnWeb, opensInApp, stayPath } from './universal-links';
import { webOrigin } from '../design/environment';
import { perfHeap, perfMark } from '../perf/probe';
/**
 * One `opax_link_open` for each link that opens the app: a universal link,
 * an opax:// link, or a widget's (the fixed `src=widget` it adds). Only the
 * route template the link lands on is sent, never the path or its parameters.
 */
function trackLink(
  source: 'universal' | 'scheme' | 'widget',
  destination: string,
  initial: boolean,
) {
  track('opax_link_open', {
    source,
    route_pattern: routePatternFor(destination),
    initial,
  });
}

export function resolveSystemPath({
  path,
  initial,
}: {
  path: string;
  initial: boolean;
}) {
  perfMark('intent', path);
  perfHeap('intent-heap');
  try {
    const url = new URL(path, 'opax://');
    if (
      url.protocol !== 'opax:' &&
      url.hostname &&
      !['opax.com.au', new URL(webOrigin).hostname].includes(url.hostname)
    )
      return path;
    const native = url.protocol === 'opax:';
    // Read once, then dropped: the destination never sees the widget marker.
    const widget = url.searchParams.get('src') === 'widget';
    if (widget) url.searchParams.delete('src');
    // The address as it arrived, for the browser when it stays on the web.
    const web = new URL(url.href);
    const placed = { value: false };
    const destination = redirect(url, native, initial, placed);
    // An https link the app has no page for (navigation/universal-links.ts)
    // opens in the browser. Only an opax:// link is the app's own: an https
    // link is gated whatever it carries, the widget marker included.
    if (!native && !(placed.value && opensInApp(web, destination))) {
      openOnWeb(web);
      return stayPath(initial);
    }
    trackLink(
      widget ? 'widget' : native ? 'scheme' : 'universal',
      destination,
      initial,
    );
    return destination;
  } catch {
    return path;
  }
}

/** What makes a link to the bill list its own list, or another page. */
const BILL_LIST_PARAMS = [
  'view',
  'scope',
  'status',
  'sort',
  'q',
  'year',
  'focus',
] as const;

/**
 * The app path for a link. `placed` is set when a web address was mapped to
 * its page (the home page, the Bills tab or a resolver's route), not passed
 * through as an app path of the same spelling.
 */
function redirect(
  url: URL,
  native: boolean,
  initial: boolean,
  placed: { value: boolean },
): string {
  const route =
    native && url.hostname ? `/${url.hostname}${url.pathname}` : url.pathname;
  if (url.searchParams.has('name')) url.searchParams.delete('name');
  const suffix = `${url.search}${url.hash}`;
  if (/^\/seat(?:\/|$)/.test(route)) return `${route}${suffix}`;
  if (/^\/follows\/?$/.test(route)) return `/(tabs)/(today)/follows${suffix}`;
  if (/^\/directory\/?$/.test(route))
    return `/(tabs)/(search)/directory${suffix}`;
  if (!communityHome && /^\/community(?:\/|$)/.test(route)) return '/';
  if (native && /^\/bills\/?$/.test(route) && !url.searchParams.has('view'))
    return `/(tabs)/(bills)/bills${suffix}`;
  // A link to the bill list as it opens (no scope, sort or search of its
  // own) is the Bills tab itself. Pushed there, the same list sat on the
  // tab's own, with "Bills" for both its back button and its title.
  if (
    /^\/(bills|bill-list)\/?$/.test(route) &&
    !BILL_LIST_PARAMS.some((name) => url.searchParams.has(name))
  ) {
    placed.value = true;
    return '/(tabs)/(bills)/bills';
  }
  const mapped = fromWebPath(`${route}${suffix}`);
  if (mapped) {
    placed.value = true;
    const params: Record<string, unknown> =
      'params' in mapped ? { ...mapped.params } : {};
    delete params.name;
    let pathname: string = mapped.pathname;
    for (const [key, value] of Object.entries(params)) {
      const marker = `[${key}]`;
      if (pathname.includes(marker)) {
        pathname = pathname.replace(marker, encodeURIComponent(String(value)));
        delete params[key];
      }
    }
    const query = new URLSearchParams(
      Object.entries(params).map(([key, value]) => [key, String(value)]),
    );
    // Shared-folder routes exist in every tab stack: name the link's tab
    // (navigation/link-tab.ts) rather than let the router choose one.
    pathname = inLinkTab(pathname, initial);
    return `${pathname}${query.size ? `?${query}` : ''}`;
  }
  // App links to native routes (opax://person/...) are not web paths.
  if (native && /^\/[^/]/.test(route))
    return `${inLinkTab(route, initial)}${suffix}`;
  // The home page is the app's first page.
  if (route === '/') placed.value = true;
  return `${route}${suffix}`;
}
