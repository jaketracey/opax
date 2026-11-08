import { router } from 'expo-router';
import { fromWebPath } from '../../navigation/routes';
import { openSource, webPageUrl } from '../../navigation/external';
export function openRecord(path: string, title: string) {
  const native = fromWebPath(path);
  if (native) router.push(native);
  else {
    const url = webPageUrl(path);
    if (url) void openSource(url, title);
  }
}
/**
 * @deprecated Filters are page state on the one Topic page: push
 * `topicRoute(slug, filters)` (navigation/routes/search.ts) instead. Kept
 * for Explore's Tide, Matrix and Words per dollar until w4-explore-tools
 * moves them.
 */
export function openTopicWindow(
  slug: string,
  filters: Record<string, string>,
  title: string,
) {
  openRecord(`/subject/topic/${slug}?${new URLSearchParams(filters)}`, title);
}
