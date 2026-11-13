import { communityHome } from '../features/community/entry';
import { fromWebPath } from '../navigation/external';
import { inLinkTab } from '../navigation/link-tab';
import { webOrigin } from '../design/environment';
import { perfHeap, perfMark } from '../perf/probe';

/** Names from links are never trusted as native back-button copy. */
export function redirectSystemPath({
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
    const mapped = fromWebPath(`${route}${suffix}`);
    if (mapped) {
      const params: Record<string, unknown> =
        'params' in mapped ? { ...mapped.params } : {};
      delete params.name;
      let pathname: string = mapped.pathname;
      for (const [key, value] of Object.entries(params)) {
        const marker = `[${key}]`;
        if (pathname.includes(marker)) {
          pathname = pathname.replace(
            marker,
            encodeURIComponent(String(value)),
          );
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
    return `${route}${suffix}`;
  } catch {
    return path;
  }
}
