import type { RecordResult } from '../api/client';
import { OfflineBanner, Text } from '../design/primitives';

export function PartialNotice({ testID }: { testID?: string }) {
  return (
    <Text wordSafe variant="fine" testID={testID}>
      Some rows in this export could not be read.
    </Text>
  );
}
export function SavedCopyNotice({
  reason,
  testID,
}: {
  reason?: RecordResult<unknown>['staleReason'];
  testID?: string;
}) {
  if (!reason) return <OfflineBanner testID={testID} />;
  return (
    <Text wordSafe variant="fine" testID={testID}>
      {reason === 'unreadable'
        ? 'The latest public export could not be read. Showing the saved copy.'
        : 'The latest public export could not be loaded. Showing the saved copy.'}
    </Text>
  );
}
