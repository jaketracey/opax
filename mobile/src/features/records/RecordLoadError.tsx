import { View } from 'react-native';
import { ApiError } from '../../api/errors';
import { isRecordSlug } from '../../api/record-policy';
import {
  Button,
  ContentUnavailable,
  copy,
  thisDevice,
} from '../../design/primitives';
import { rhythm } from '../../design/tokens';
import { openSource, webPageUrl } from '../../navigation/external';

/** Is the failure the device being offline (or too slow to reach OPAX)? */
export const isOffline = (error: unknown) =>
  error instanceof ApiError &&
  (error.code === 'offline' || error.code === 'timeout');

/**
 * A record that can't be shown (records.md 2.5): one centred view per
 * reason, in plain words. A link that names no record, a record OPAX doesn't
 * hold, the device offline, or a read that failed, with Try again where
 * trying again can help and the web reader for a record the app can't read.
 */
export function RecordLoadError({
  error,
  slug,
  onRetry,
  subject = 'This record',
  testID,
}: {
  error: unknown;
  slug: string;
  onRetry: () => void;
  /** "This record", "This bill's text", "New records". */
  subject?: string;
  testID?: string;
}) {
  if (slug && !isRecordSlug(slug))
    return (
      <ContentUnavailable
        symbol="link"
        title="This link doesn't open a record"
        testID={testID}
      />
    );
  if (error instanceof ApiError && error.code === 'not-found')
    return (
      <ContentUnavailable
        symbol="doc.text.magnifyingglass"
        title={`${subject} isn’t available`}
        testID={testID}
      />
    );
  if (isOffline(error))
    return (
      <ContentUnavailable
        symbol="wifi.slash"
        title={`Not saved on this ${thisDevice()} yet`}
        body="Connect to the internet, then try again."
        action={{ label: copy.tryAgain, onPress: onRetry }}
        testID={testID}
      />
    );
  const web =
    slug && error instanceof ApiError && error.code === 'invalid-data'
      ? webPageUrl(`/doc/${slug}`)
      : null;
  return (
    <View style={{ gap: rhythm.tight }}>
      <ContentUnavailable
        symbol="exclamationmark.triangle"
        title={`${subject} couldn’t be loaded`}
        action={{ label: copy.tryAgain, onPress: onRetry }}
        testID={testID}
      />
      {web ? (
        <Button
          variant="plain"
          trailingIcon="arrow.up.right.square"
          label="Open on opax.com.au"
          onPress={() => void openSource(web, 'OPAX record')}
          testID={testID ? `${testID}-web` : undefined}
        />
      ) : null}
    </View>
  );
}
