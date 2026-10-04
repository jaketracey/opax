import { router, useLocalSearchParams } from 'expo-router';
import { isE2E } from '../design/environment';
import { sourceUrl } from '../navigation/external';
import { SourceDestination } from '../navigation/SourceDestination';

export default function SourceDestinationRoute() {
  const params = useLocalSearchParams<{ url?: string | string[] }>();
  if (!isE2E) return null;
  let url: string | null = null;
  try {
    if (typeof params.url === 'string') url = sourceUrl(params.url);
  } catch {
    /* An invalid deep link stays local and shows the existing source error. */
  }
  return <SourceDestination url={url} dismiss={() => router.back()} />;
}
