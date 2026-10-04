import { router, useLocalSearchParams } from 'expo-router';
import { hasSourcePreview } from '../design/environment';
import { sourceUrl } from '../navigation/external';
import { SourceDestination } from '../navigation/SourceDestination';

export default function SourceDestinationRoute() {
  const params = useLocalSearchParams<{
    url?: string | string[];
    citation?: string | string[];
  }>();
  if (!hasSourcePreview) return null;
  let url: string | null = null;
  try {
    if (typeof params.url === 'string') url = sourceUrl(params.url);
  } catch {
    /* An invalid deep link stays local and shows the existing source error. */
  }
  return (
    <SourceDestination
      url={url}
      citation={
        typeof params.citation === 'string' ? params.citation : undefined
      }
      dismiss={() => router.back()}
    />
  );
}
