/** Shared directory routes belong to Search, including cold incoming links. */
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
  } catch {
    // Leave malformed and unrelated links to the router's existing handling.
  }
  return path;
}
