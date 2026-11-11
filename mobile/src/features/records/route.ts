import { isRecordSlug } from '../../api/record-policy';
import { webOrigin } from '../../design/environment';
import { fromWebPath } from '../../navigation/routes';
import { docRoute } from '../../navigation/routes/records';

/** Resolve published OPAX links, including absolute URLs and saved sources. */
export function recordRoute(record: {
  href?: string;
  slug?: string;
  resource?: string;
}) {
  if (record.href) {
    try {
      const url = new URL(record.href, webOrigin);
      const hosts = new Set([
        new URL(webOrigin).hostname,
        'opax.com.au',
        'www.opax.com.au',
      ]);
      if (
        url.protocol !== 'https:' ||
        url.username ||
        url.password ||
        !hosts.has(url.hostname)
      )
        return null;
      const route =
        fromWebPath(url.pathname + url.search + url.hash) ??
        fromWebPath(url.pathname);
      if (route) return route;
    } catch {
      return null;
    }
  }
  // A resource hash is not a reader slug. Only published record identifiers
  // can repair a missing or obsolete href.
  const slug = [record.slug, record.resource].find(
    (value) => value && isRecordSlug(value),
  );
  return slug ? docRoute(slug) : null;
}
