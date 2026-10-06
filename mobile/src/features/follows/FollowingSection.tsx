import { SavedCopyNotice } from '../CatalogNotice';
import { Pressable, StyleSheet, View } from 'react-native';
import { router } from 'expo-router';
import {
  Button,
  EmptyState,
  ErrorState,
  Group,
  Icon,
  LoadingState,
  RowList,
  Section,
  StaleNotice,
  Text,
  errorMessage,
} from '../../design/primitives';
import { formatCount, formatDate } from '../../design/format';
import { colors, minimumTarget, spacing } from '../../design/tokens';
import {
  billRoute,
  electorateRoute,
  followsRoute,
  personRoute,
} from '../../navigation/routes';
import { kindLabels, type Change, type FollowState } from './markers';
import { followKey, markSeen, type Follow } from './store';
import { useFollowStates } from './useFollowStates';

export const routeFor = (f: Pick<Follow, 'kind' | 'id'>) =>
  f.kind === 'person'
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
 * Today's Following block: each followed record with what changed in the
 * published record since the reader last looked. Opening one marks it seen.
 */
export function FollowingSection({
  refresh,
  refreshing,
  onRetry,
}: {
  /** Changes on a pull to refresh, which revalidates the catalogs. */
  refresh: number;
  refreshing: boolean;
  onRetry: () => void;
}) {
  const { follows, states, sources } = useFollowStates(refresh);
  const unavailable = (follows ?? []).some(
    (f) => states.get(followKey(f))?.status === 'unavailable',
  );
  const changed = (follows ?? []).filter((f) => {
    const state = states.get(followKey(f));
    return state?.status === 'ready' && state.changes.length > 0;
  }).length;
  return (
    <Section
      title="Following"
      icon="star.fill"
      accent="leads"
      testID="today-following"
    >
      {follows === null ? (
        <LoadingState
          label="Loading your follows"
          testID="today-following-loading"
        />
      ) : !follows.length ? (
        <EmptyState
          message="Follow a parliamentarian, bill or electorate from its page. Today then shows what changed in the published record since you last looked. Follows are saved on this iPhone only."
          testID="today-following-empty"
        />
      ) : (
        <Group>
          {sources?.stale && sources.savedAt !== null ? (
            <>
              <SavedCopyNotice reason={sources.staleReason} />
              <StaleNotice
                savedAt={sources.savedAt}
                refreshing={refreshing}
                testID="today-following-stale"
              />
            </>
          ) : null}
          {unavailable && sources?.error ? (
            <ErrorState
              message={errorMessage(sources.error)}
              onRetry={onRetry}
              testID="today-following-error"
            />
          ) : null}
          {sources && !unavailable ? (
            <Text wordSafe testID="today-following-summary">
              {changed
                ? `${formatCount(changed)} of ${formatCount(follows.length)} changed since you last looked.`
                : 'No changes since you last looked.'}
            </Text>
          ) : null}
          <RowList>
            {follows.map((f) => {
              const state = states.get(followKey(f));
              return <FollowRow key={followKey(f)} follow={f} state={state} />;
            })}
          </RowList>
          <Button
            label="Manage follows"
            variant="quiet"
            size="compact"
            icon="slider.horizontal.3"
            testID="today-following-manage"
            onPress={() => router.push(followsRoute)}
          />
        </Group>
      )}
    </Section>
  );
}

function FollowRow({
  follow: f,
  state,
}: {
  follow: Follow;
  state: FollowState | undefined;
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
  return (
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
        <Text wordSafe variant="metadata">
          {kindLabels[f.kind]} · {visible.headline}
        </Text>
        {visible.changes.map((c) => (
          <View key={c.marker} style={styles.change}>
            <Text wordSafe>{c.text}</Text>
            <Text wordSafe variant="caption">
              {c.asAt
                ? `Updated ${formatDate(c.asAt, 'short')}`
                : 'Date not published'}
            </Text>
          </View>
        ))}
      </View>
      <Icon name="chevron.right" size={14} tone="inkSoft" />
    </Pressable>
  );
}
const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.s3,
    minHeight: minimumTarget,
    paddingVertical: spacing.s3,
  },
  text: { flex: 1, gap: spacing.s1 },
  change: { gap: 2, paddingTop: spacing.s2 },
  pressed: { backgroundColor: colors.raised },
});
