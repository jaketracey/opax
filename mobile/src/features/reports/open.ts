import { router } from 'expo-router';
import { openSource, webPageUrl } from '../../navigation/external';
import { fromWebPath } from '../../navigation/routes';
export function openRecord(path: string, title: string) {
  const native = fromWebPath(path);
  if (native) router.push(native);
  else {
    const url = webPageUrl(path);
    if (url) void openSource(url, title);
  }
}
