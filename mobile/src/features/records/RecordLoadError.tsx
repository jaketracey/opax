import { router } from 'expo-router';
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

const RECORD = 'This record';

/**
 * A record that isn't there: a link that names no record, or a record OPAX
 * doesn't hold. The screen centres it on the page (sweep 2, item 2).
 */
export function isMissingRecord(
  error: unknown,
  slug: string,
  subject = RECORD,
): boolean {
  if (slug && !isRecordSlug(slug)) return true;
  return (
    subject === RECORD &&
    error instanceof ApiError &&
    error.code === 'not-found'
  );
}

/**
 * The shared not-found pattern for a record (sweep 2, item 2): one voice,
 * the likely reason, and Search to go on from. In a sheet (the citation
 * formats) the sheet goes first, as a source sheet leaves for a record;
 * otherwise it would stay up in this tab's stack behind Search.
 */
export function MissingRecord({
  sheet = false,
  testID,
}: {
  sheet?: boolean;
  testID?: string;
}) {
  return (
    <ContentUnavailable
      symbol="doc.text.magnifyingglass"
      title="This record isn’t in OPAX"
      body="The link may be old."
      action={{
        label: 'Search OPAX',
        onPress: () => {
          // Guarded like the shared Done: a cold open has nothing beneath.
          if (sheet && router.canGoBack()) router.back();
          router.navigate('/search');
        },
        testID: testID ? `${testID}-search` : undefined,
      }}
      testID={testID}
    />
  );
}

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
  subject = RECORD,
  sheet = false,
  testID,
}: {
  error: unknown;
  slug: string;
  onRetry: () => void;
  /** "This record", "This bill's text", "New records". */
  subject?: string;
  /** Shown in a sheet: leaving for Search closes it first. */
  sheet?: boolean;
  testID?: string;
}) {
  if (isMissingRecord(error, slug, subject))
    return <MissingRecord sheet={sheet} testID={testID} />;
  if (error instanceof ApiError && error.code === 'not-found')
    return (
      <ContentUnavailable
        symbol="doc.text.magnifyingglass"
        title={`${subject} isn't available`}
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
        title={`${subject} couldn't be loaded`}
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
