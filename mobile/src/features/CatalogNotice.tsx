import { Text } from '../design/text';
import { OfflineBanner } from '../design/states';
import type { RecordResult } from '../api/client';

/** Saved and partial explanations now belong to the source sheet's Notes. */
export function catalogStateNote(
  reason?: RecordResult<unknown>['staleReason'],
) {
  return reason === 'unreadable'
    ? 'The latest records could not be read. Showing the saved copy.'
    : reason === 'unavailable'
      ? 'The latest records could not be loaded. Showing the saved copy.'
      : null;
}
export const partialNote = 'Some records could not be read.';

/** Compatibility wording until callers move their notes into SourceLine. */
export function PartialNotice({ testID }: { testID?: string }) {
  return (
    <Text wordSafe variant="footnote" testID={testID}>
      {partialNote}
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
  const note = catalogStateNote(reason);
  return note ? (
    <Text wordSafe variant="footnote" testID={testID}>
      {note}
    </Text>
  ) : (
    <OfflineBanner testID={testID} />
  );
}
