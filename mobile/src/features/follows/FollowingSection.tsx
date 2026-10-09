import { SavedCopyNotice } from '../CatalogNotice';
import { Pressable, StyleSheet, View } from 'react-native';
import { router } from 'expo-router';
import {
  Button,
  ErrorState,
  Group,
  Icon,
  LoadingState,
  RowList,
  Section,
  SourceLine,
  Text,
  errorMessage,
  useAccessibilitySize,
} from '../../design/primitives';
import { formatCount, formatDate } from '../../design/format';
import { ownsRowPadding } from '../../design/row-padding';
import { colors, minimumTarget, rhythm } from '../../design/tokens';
import { Entrance } from '../today/parts';
import {
  billRoute,
  electorateRoute,
  followsRoute,
  personRoute,
  partyRoute,
} from '../../navigation/routes';
import { kindLabels, type Change, type FollowState } from './markers';
import { followKey, markSeen, type Follow } from './store';
import { useFollowStates } from './useFollowStates';

export const routeFor = (f: Pick<Follow, 'kind' | 'id'>) =>
  f.kind === 'party'
    ? partyRoute(f.id)
    : f.kind === 'person'
      ? personRoute(f.id)
      : f.kind === 'bill'
        ? billRoute(f.id)
        : electorateRoute(f.id);
const sourceLine = (c: Change, style: 'long' | 'short') =>
  `${c.citation}, ${c.asAt ? `as at ${formatDate(c.asAt, style)}` : 'date not published'}`;
/** What a follow's row says, visibly and to VoiceOver. */
export function followSummary(
  f: Follow,
  state: FollowState | undefined,
  style: 'long' | 'short' = 'short',
) {
  const since = f.seenAt ?? f.followedAt;
  const date = formatDate(since, style);
  if (!state || state.status === 'unavailable')
    return { headline: 'Changes not checked yet', changes: [] };
  if (state.status === 'missing')
    return {
      headline: 'Not in the record as published now',
      changes: [],
    };
  return {
    headline: state.changes.length
      ? `${formatCount(state.changes.length)} ${state.changes.length === 1 ? 'change' : 'changes'} since ${date}`
      : `No changes since ${date}`,
    changes: state.changes,
  };
}

/**
 * Today's Following block, only when the reader follows something: each
 * followed record as a row on the paper, saying what changed in the
 * published record since the reader last looked. Opening one marks it seen.
 * A changed row says so in bronze and lists its changes after a dot, in the
 * publisher's words with their dates; VoiceOver also hears the source. A
 * saved copy carries one source line in the saved state.
 */
export function FollowingSection({
  refresh,
  onRetry,
}: {
  /** Changes on a pull to refresh, which revalidates the catalogs. */
  refresh: number;
  /** Today's pull to refresh; the saved copy's source line says the rest. */
  refreshing?: boolean;
  onRetry: () => void;
}) {
  const { follows, states, sources } = useFollowStates(refresh);
  if (follows !== null && !follows.length) return null;
  const unavailable = (follows ?? []).some(
    (f) => states.get(followKey(f))?.status === 'unavailable',
  );
  const changed = (follows ?? []).filter((f) => {
    const state = states.get(followKey(f));
    return state?.status === 'ready' && state.changes.length > 0;
  }).length;
  // Who published the changes shown, for the saved copy's source line.
  const citations = [
    ...new Set(
      (follows ?? []).flatMap((f) => {
        const state = states.get(followKey(f));
        return state?.status === 'ready'
          ? state.changes.map((c) => c.citation)
          : [];
      }),
    ),
  ];
  return (
    <Section
      title="Following"
      testID="today-following"
      action={
        follows?.length ? (
          <Button
            label="Manage"
            variant="quiet"
            size="compact"
            accessibilityHint="Opens your follows"
            testID="today-following-manage"
            onPress={() => router.push(followsRoute)}
          />
        ) : null
      }
    >
      {follows === null ? (
        <LoadingState
          label="Loading your follows"
          testID="today-following-loading"
        />
      ) : (
        <Group gap={rhythm.tight}>
          {sources?.stale ? (
            <SavedCopyNotice reason={sources.staleReason} />
          ) : null}
          {unavailable && sources?.error ? (
            <ErrorState
              message={errorMessage(sources.error)}
              onRetry={onRetry}
              testID="today-following-error"
            />
          ) : null}
          {sources && !unavailable ? (
            <Text wordSafe variant="metadata" testID="today-following-summary">
              {changed
                ? `${formatCount(changed)} of ${formatCount(follows.length)} changed since you last looked.`
                : 'No changes since you last looked.'}
            </Text>
          ) : null}
          <RowList>
            {follows.map((f, i) => (
              <FollowRow
                key={followKey(f)}
                follow={f}
                state={states.get(followKey(f))}
                order={i}
              />
            ))}
          </RowList>
          {sources?.stale && sources.savedAt !== null ? (
            <SourceLine
              dateLabel={null}
              citation={citations.length ? citations : 'Published records'}
              savedAt={sources.savedAt}
              testID="today-following-stale"
            />
          ) : null}
        </Group>
      )}
    </Section>
  );
}

/**
 * One follow as a row: its name; its kind and what changed since it was
 * last seen ("Bill · 1 change since 3 Oct"), in bronze when something did;
 * then each change after a dot, with the date the record gives.
 */
function FollowRow({
  follow: f,
  state,
  order,
}: {
  follow: Follow;
  state: FollowState | undefined;
  order: number;
}) {
  const title = state?.status === 'ready' ? state.title : f.title;
  const visible = followSummary(f, state, 'short');
  const spoken = followSummary(f, state, 'long');
  const label = [
    title,
    kindLabels[f.kind],
    spoken.headline,
    ...spoken.changes.map((c) => `${c.text}, ${sourceLine(c, 'long')}`),
  ].join(', ');
  const hasChanges = visible.changes.length > 0;
  const stacked = useAccessibilitySize();
  return (
    <Entrance order={order}>
      <Pressable
        testID={`today-following-${f.kind}-${f.id}`}
        accessibilityRole="button"
        accessibilityLabel={label}
        onPress={() => {
          // Opening the record marks what the row showed as seen.
          if (state?.status === 'ready')
            void markSeen(followKey(f), state.current).catch(() => undefined);
          router.push(routeFor(f));
        }}
        style={({ pressed }) => [styles.row, pressed ? styles.pressed : null]}
      >
        <View style={styles.text}>
          <Text wordSafe variant="strong">
            {title}
          </Text>
          <Text
            wordSafe
            variant="metadata"
            tone={hasChanges ? 'bronzeInk' : undefined}
          >
            {kindLabels[f.kind]} · {visible.headline}
          </Text>
          {visible.changes.map((c) => (
            <View key={c.marker} style={styles.change}>
              <View style={styles.changeDot} />
              <Text wordSafe variant="body" tone="ink" style={styles.grow}>
                {c.text}
                <Text variant="fine">
                  {c.asAt ? `  ·  as at ${formatDate(c.asAt, 'short')}` : ''}
                </Text>
              </Text>
            </View>
          ))}
        </View>
        {stacked ? null : (
          <Icon name="chevron.right" size={13} tone="inkSoft" />
        )}
      </Pressable>
    </Entrance>
  );
}
ownsRowPadding(FollowRow);

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: rhythm.heading,
    minHeight: minimumTarget,
    paddingVertical: rhythm.row,
  },
  pressed: { backgroundColor: colors.sunken },
  text: { flexGrow: 1, flexShrink: 1, alignSelf: 'stretch', gap: 2 },
  change: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: rhythm.tight,
    paddingTop: rhythm.line,
  },
  // The change dot: bronze, centred on the first line of its change.
  changeDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    marginTop: 10,
    backgroundColor: colors.bronzeInk,
  },
  grow: { flex: 1 },
});
