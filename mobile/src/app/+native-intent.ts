import { communityHome } from '../features/community/entry';

/**
 * Shared directory routes belong to Search, including cold incoming links.
 * In builds without Community (production 1.0) its links open Today.
 */
export function redirectSystemPath({
  path,
}: {
  path: string;
  initial: boolean;
}) {
  try {
    const url = new URL(path, 'opax://');
    const route =
      url.protocol === 'opax:' && url.hostname
        ? `/${url.hostname}${url.pathname}`
        : url.pathname;
    if (route === '/directory' || route === '/directory/') {
      return `/(tabs)/(search)/directory${url.search}${url.hash}`;
    }
    if (!communityHome && /^\/community(?:\/|$)/.test(route)) return '/';
  } catch {
    // Leave malformed and unrelated links to the router's existing handling.
  }
  return path;
}
