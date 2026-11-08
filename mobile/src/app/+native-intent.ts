import { communityHome } from '../features/community/entry';
import { fromWebPath } from '../navigation/external';
import { webOrigin } from '../design/environment';

/** Names from links are never trusted as native back-button copy. */
export function redirectSystemPath({
  path,
  initial,
}: {
  path: string;
  initial: boolean;
}) {
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
      const rootTab =
        pathname === '/search'
          ? '(search)'
          : pathname === '/your-mp'
            ? '(your-mp)'
            : null;
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
      // Universal subject links have one unambiguous native home. Other warm
      // content links resolve in the currently selected shared tab stack.
      if (
        /^\/subject\/(person|electorate)\//.test(route) ||
        (initial &&
          !/^\/(account|community|talk|licence)(?:\/|$)/.test(pathname) &&
          !rootTab &&
          !pathname.startsWith('/(tabs)'))
      )
        pathname = `/(tabs)/(today)${pathname === '/' ? '' : pathname}`;
      if (rootTab) pathname = `/(tabs)/${rootTab}${pathname}`;
      return `${pathname}${query.size ? `?${query}` : ''}`;
    }
    return `${route}${suffix}`;
  } catch {
    return path;
  }
}
