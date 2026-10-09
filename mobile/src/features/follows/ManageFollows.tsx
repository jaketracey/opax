import { phoneCopy } from '../../design/phone-copy';
import { useRef, useState } from 'react';
import { Alert, findNodeHandle, Pressable, StyleSheet, View } from 'react-native';
import { router } from 'expo-router';
import {
  Button,
  EmptyState,
  Icon,
  LoadingState,
  RowList,
  Screen,
  Section,
  SubSection,
  Text,
  useAccessibilitySize,
} from '../../design/primitives';
import { formatCount, formatDate } from '../../design/format';
import { ownsRowPadding } from '../../design/row-padding';
import { colors, minimumTarget, rhythm } from '../../design/tokens';
import { showRecordMenu } from '../today/RecordMenu';
import { routeFor } from './FollowingSection';
import {
  FOLLOW_LIMIT,
  clearFollows,
  followKey,
  unfollow,
  useFollows,
  type Follow,
  type FollowKind,
} from './store';
import { SwipeRow } from './SwipeRow';

const groups: [FollowKind, string][] = [
  ['person', 'Parliamentarians'],
  ['party', 'Parties'],
  ['bill', 'Bills'],
  ['electorate', 'Electorates'],
];
const failed = phoneCopy(
  'Your follows could not be saved on this iPhone. Try again.',
);
/** The one empty sentence, here and under Your MP's Following. */
export const NOTHING_FOLLOWED =
  'Follow a parliamentarian, party, bill or electorate from its page to see what changes.';

/**
 * The follows saved on this iPhone, grouped by kind: open one, unfollow one
 * (swipe the row, or touch and hold it) or unfollow them all.
 */
export default function ManageFollows() {
  const follows = useFollows();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  async function run(change: () => Promise<void>) {
    setBusy(true);
    setError(null);
    try {
      await change();
    } catch {
      setError(failed);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Screen testID="follows-screen">
      {follows?.length ? (
        <Text wordSafe variant="metadata" testID="follows-count">
          Following {formatCount(follows.length)} of at most{' '}
          {formatCount(FOLLOW_LIMIT)}
        </Text>
      ) : null}
      {error ? (
        <Text wordSafe tone="danger" testID="follows-error">
          {error}
        </Text>
      ) : null}
      {follows === null ? (
        <LoadingState label="Loading your follows" />
      ) : !follows.length ? (
        <EmptyState message={NOTHING_FOLLOWED} testID="follows-empty" />
      ) : (
        <>
          {groups.map(([kind, title]) => {
            const rows = follows.filter((f) => f.kind === kind);
            return rows.length ? (
              <SubSection key={kind} title={title} testID={`follows-${kind}`}>
                <RowList>
                  {rows.map((f) => (
                    <FollowListRow
                      key={followKey(f)}
                      follow={f}
                      busy={busy}
                      onUnfollow={() =>
                        void run(() => unfollow(followKey(f)))
                      }
                    />
                  ))}
                </RowList>
              </SubSection>
            ) : null;
          })}
          <Section>
            <Button
              label="Unfollow all"
              variant="danger"
              disabled={busy}
              testID="follows-clear"
              onPress={() =>
                Alert.alert(
                  `Unfollow all ${formatCount(follows.length)}?`,
                  phoneCopy(
                    'They are removed from this iPhone, and Today stops showing their changes.',
                  ),
                  [
                    { text: 'Cancel', style: 'cancel' },
                    {
                      text: 'Unfollow',
                      style: 'destructive',
                      onPress: () => void run(clearFollows),
                    },
                  ],
                )
              }
            />
          </Section>
        </>
      )}
      <Text wordSafe variant="fine" testID="follows-privacy">
        {phoneCopy(
          'Follows are saved on this iPhone only, and Today compares them with the published records on this iPhone. Nothing about them is sent to OPAX or anyone else. Device backups may include them.',
        )}
      </Text>
    </Screen>
  );
}

/**
 * One follow: its name and when it was followed, opening its page. Swipe it
 * aside, or touch and hold it, to unfollow.
 */
function FollowListRow({
  follow: f,
  busy,
  onUnfollow,
}: {
  follow: Follow;
  busy: boolean;
  onUnfollow: () => void;
}) {
  const stacked = useAccessibilitySize();
  const anchor = useRef<View>(null);
  const open = () => router.push(routeFor(f));
  const followed = `Followed ${formatDate(f.followedAt, 'short')}`;
  return (
    <SwipeRow
      label="Unfollow"
      accessibilityLabel={`Unfollow ${f.title}`}
      disabled={busy}
      onAction={onUnfollow}
      testID={`follows-unfollow-${f.kind}-${f.id}`}
    >
      <Pressable
        ref={anchor}
        accessibilityRole="button"
        accessibilityLabel={`${f.title}, ${followed}`}
        accessibilityHint="Opens its page. Touch and hold to unfollow."
        testID={`follows-open-${f.kind}-${f.id}`}
        onPress={open}
        onLongPress={() =>
          showRecordMenu(
            f.title,
            [
              { title: 'Open', onPress: open },
              { title: 'Unfollow', onPress: onUnfollow },
            ],
            findNodeHandle(anchor.current) ?? undefined,
          )
        }
        style={({ pressed }) => [styles.row, pressed ? styles.pressed : null]}
      >
        <View style={styles.text}>
          <Text wordSafe variant="strong">
            {f.title}
          </Text>
          <Text wordSafe variant="metadata">
            {followed}
          </Text>
        </View>
        {stacked ? null : (
          <Icon name="chevron.right" size={13} tone="inkSoft" />
        )}
      </Pressable>
    </SwipeRow>
  );
}
ownsRowPadding(FollowListRow);

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: rhythm.heading,
    minHeight: minimumTarget,
    paddingVertical: rhythm.row,
    backgroundColor: colors.paper,
  },
  pressed: { backgroundColor: colors.sunken },
  text: { flexGrow: 1, flexShrink: 1, gap: 2 },
});
