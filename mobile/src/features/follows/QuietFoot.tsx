import { StyleSheet, View } from 'react-native';
import { InsetGroup } from '../../design/layout';
import { LinkRow } from '../../design/rows';
import { symbols } from '../../design/symbols';
import { Text } from '../../design/text';
import { rhythm } from '../../design/tokens';
import { recentRecordsRoute } from '../../navigation/routes';
import type { FollowState } from './markers';

export const QUIET_LINE = 'Nothing new in what you follow.';
export const QUIET_ROW = {
  title: 'Just added',
  detail: 'The newest records in OPAX',
} as const;

/**
 * Caught up: every follow was checked and none has a change to show. An
 * unchecked, unavailable or withdrawn follow is not quiet, and neither is
 * an empty list (that page has its own state).
 */
export function allQuiet(entries: readonly { state?: FollowState }[]): boolean {
  return (
    entries.length > 0 &&
    entries.every(
      (e) => e.state?.status === 'ready' && e.state.changes.length === 0,
    )
  );
}

/**
 * Following's foot when the reader is caught up: one plain sentence, then
 * one row to the records OPAX added most recently (Today's "Just added"
 * page, by date added, with its own source line). It points at the record,
 * never at a person or party, and is not drawn while anything is changed,
 * unchecked, doubted, withdrawn, offline or being edited.
 */
export function QuietFoot() {
  return (
    <View testID="follows-quiet" style={styles.foot}>
      <Text
        wordSafe
        variant="secondary"
        tone="inkSoft"
        style={styles.line}
        testID="follows-quiet-line"
      >
        {QUIET_LINE}
      </Text>
      <InsetGroup>
        <LinkRow
          title={QUIET_ROW.title}
          detail={QUIET_ROW.detail}
          detailLines={0}
          symbol={symbols.justAdded}
          href={recentRecordsRoute}
          accessibilityHint="Opens Just added"
          testID="follows-quiet-recent"
        />
      </InsetGroup>
    </View>
  );
}

const styles = StyleSheet.create({
  foot: { gap: rhythm.tight },
  // The check time's inset, so the two quiet lines share a left edge.
  line: { paddingHorizontal: 4 },
});
