import { ApiError } from '../../api/errors';
import {
  Button,
  ErrorState,
  Group,
  errorMessage,
} from '../../design/primitives';
import { rhythm } from '../../design/tokens';
import { openSource, webPageUrl } from '../../navigation/external';

/** A record the app cannot read still opens: Try again, or the web reader. */
export function RecordLoadError({
  error,
  slug,
  onRetry,
  testID,
}: {
  error: unknown;
  slug: string;
  onRetry: () => void;
  testID?: string;
}) {
  const web =
    error instanceof ApiError && error.code === 'invalid-data'
      ? webPageUrl(`/doc/${slug}`)
      : null;
  return (
    <Group gap={rhythm.tight}>
      <ErrorState
        message={errorMessage(error)}
        onRetry={onRetry}
        testID={testID}
      />
      {web ? (
        <Button
          variant="quiet"
          icon="safari"
          label="Open on opax.com.au"
          onPress={() => void openSource(web, 'OPAX record')}
          testID={testID ? `${testID}-web` : undefined}
        />
      ) : null}
    </Group>
  );
}
