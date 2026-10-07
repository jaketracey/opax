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
export function openTopicWindow(
  slug: string,
  filters: Record<string, string>,
  title: string,
) {
  openRecord(`/subject/topic/${slug}?${new URLSearchParams(filters)}`, title);
}
