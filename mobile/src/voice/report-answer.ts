import Constants from 'expo-constants';
import { canonicalUrl, openSource } from '../navigation/external';

// /support is published. No health probe, transcript, credential or account ID is sent.
const supportAvailable =
  Constants.expoConfig?.extra?.supportPageAvailable === true;
export const correctionsIssuesUrl =
  'https://github.com/jaketracey/opax/issues/new';

/** Only a canonical record path travels with the report, never answer text. */
export function reportAnswerUrl(
  recordPath: string | null,
  hasSupport = supportAvailable,
): string {
  if (recordPath === null)
    return hasSupport ? canonicalUrl('/support') : correctionsIssuesUrl;
  if (
    typeof recordPath !== 'string' ||
    recordPath.length > 301 ||
    /[?#<>"\\\s]/.test(recordPath)
  )
    throw new Error(
      'Reports need a public record path without query or fragment',
    );
  if (
    !/^\/(?:doc\/[^/]+|bill\/[^/]+|subject\/(?:person|party|supplier|donor|recipient|topic|campaigner|agency)\/[^/]+|money(?:\/(?:contracts|grants|donations|receipts|expenses|interests))?|declared|connections|topics|parties|reports(?:\/[^/]+)?|journey\/[^/]+)\/?$/.test(
      recordPath,
    )
  )
    throw new Error('Reports need a public record path');
  const record = canonicalUrl(recordPath);
  const destination = new URL(
    hasSupport ? canonicalUrl('/support') : correctionsIssuesUrl,
  );
  if (hasSupport) destination.searchParams.set('record', recordPath);
  else {
    destination.searchParams.set('title', 'Report an OPAX answer');
    destination.searchParams.set(
      'body',
      `Record: ${record}\n\nDescribe the correction here. Please do not include personal information.`,
    );
  }
  return destination.toString();
}

/** Presents the existing in-app Safari source browser (e2e previews locally). */
export async function reportAnswer(recordPath: string | null): Promise<void> {
  await openSource(reportAnswerUrl(recordPath), 'Report this answer');
}
