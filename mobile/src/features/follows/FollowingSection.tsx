import { SavedCopyNotice } from '../CatalogNotice';
import { Pressable, StyleSheet, View } from 'react-native';
import type { SFSymbol } from 'expo-symbols';
import { router } from 'expo-router';
import {
  Button,
  EmptyState,
  ErrorState,
  Group,
  Icon,
  LoadingState,
  Section,
  StaleNotice,
  Text,
  errorMessage,
  useAccessibilitySize,
} from '../../design/primitives';
import { formatCount, formatDate } from '../../design/format';
import { light, minimumTarget, spacing } from '../../design/tokens';
import { Entrance, TodayCard } from '../today/parts';
import { washOf } from '../today/tint';
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
  f.kind === 'party' ? partyRoute(f.id) : f.kind === 'person'
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
 * Today's Following block: each followed record as a compact card with what
 * changed in the published record since the reader last looked. Opening one
 * marks it seen. A changed card is tinted, and its changes are listed in
 * the publisher's words with their dates; VoiceOver also hears the source.
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
      ) : !follows.length ? (
        <TodayCard style={styles.empty}>
          <View style={styles.emptyIcon}>
            <Icon name="star" size={18} tone="bronzeInk" />
          </View>
          <View style={styles.text}>
            <EmptyState
              icon={null}
              message="Follow a parliamentarian, party, bill or electorate from its page. Today then shows what changed in the published record since you last looked. Follows are saved on this iPhone only."
              testID="today-following-empty"
            />
          </View>
        </TodayCard>
      ) : (
        <Group gap={spacing.s3}>
          {sources?.stale && sources.savedAt !== null ? (
            <View style={styles.notices}>
              <SavedCopyNotice reason={sources.staleReason} />
              <StaleNotice
                savedAt={sources.savedAt}
                refreshing={refreshing}
                testID="today-following-stale"
              />
            </View>
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
          {follows.map((f, i) => {
            const state = states.get(followKey(f));
            return (
              <Entrance key={followKey(f)} order={i}>
                <FollowRow follow={f} state={state} />
              </Entrance>
            );
          })}
        </Group>
      )}
    </Section>
  );
}

const kindIcons: Record<Follow['kind'], SFSymbol> = {
  party: 'building.columns',
  person: 'person.fill',
  bill: 'doc.text.fill',
  electorate: 'mappin.and.ellipse',
};
const changedGround = washOf(light.bronzeInk, 0.1);

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
  const hasChanges = visible.changes.length > 0;
  // The badge sits above the text at accessibility sizes.
  const stacked = useAccessibilitySize();
  const badge = (
    <View
      style={[
        styles.badge,
        hasChanges ? styles.badgeChanged : styles.badgeQuiet,
      ]}
    >
      <Icon
        name={kindIcons[f.kind]}
        size={16}
        tone={hasChanges ? 'onNavy' : 'navy'}
      />
    </View>
  );
  const chevron = <Icon name="chevron.right" size={14} tone="inkSoft" />;
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
    >
      {({ pressed }) => (
        <TodayCard
          ground={
            pressed ? light.sunken : hasChanges ? changedGround : undefined
          }
          style={[styles.card, stacked ? styles.cardStacked : null]}
        >
          {stacked ? (
            <View style={styles.stackTop}>
              {badge}
              {chevron}
            </View>
          ) : (
            badge
          )}
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
          {stacked ? null : chevron}
        </TodayCard>
      )}
    </Pressable>
  );
}
const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.s3 + spacing.s1,
    minHeight: minimumTarget,
    paddingVertical: spacing.s3 + spacing.s1,
    paddingHorizontal: spacing.s4,
  },
  cardStacked: { flexDirection: 'column', alignItems: 'stretch' },
  stackTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  badge: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'flex-start',
  },
  badgeQuiet: { backgroundColor: washOf(light.navy, 0.1) },
  badgeChanged: { backgroundColor: light.bronzeInk },
  text: { flexGrow: 1, flexShrink: 1, alignSelf: 'stretch', gap: 2 },
  change: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.s3,
    paddingTop: spacing.s2,
  },
  changeDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    marginTop: 10,
    backgroundColor: light.bronzeInk,
  },
  grow: { flex: 1 },
  notices: { gap: spacing.s1 },
  empty: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.s3 + spacing.s1,
    padding: spacing.s4,
  },
  emptyIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: light.bronzeWash,
  },
});
