import { useEffect, useRef, useState } from 'react';
import { Animated } from 'react-native';
import { useReduceMotion } from '../../design/accessibility';
import { InsetGroup, SectionHeader } from '../../design/layout';
import { LinkRow } from '../../design/rows';
import { InlineError } from '../../design/states';
import { symbols } from '../../design/symbols';
import { motion, rhythm } from '../../design/tokens';
import { formatCount } from '../../design/format';
import { followsRoute } from '../../navigation/routes';
import { todayChanges } from '../follows/changes';
import { FollowRow } from '../follows/FollowRow';
import type { FollowState } from '../follows/markers';
import { followKey, followResultKey, type Follow } from '../follows/store';
import { useFollowStates } from '../follows/useFollowStates';
import { representativeProfile } from '../your-mp/model';
import { savedSeatDirectory, useSeat } from '../your-mp/useSeat';

/** Today shows at most this many changed follows; "See all" has the rest. */
export const FOLLOWING_ROWS = 5;

/** The ids a follow of the reader's own MP may carry (canonical id, slug). */
function useOwnMember(): Set<string> {
  const seat = useSeat();
  const directory = savedSeatDirectory();
  if (seat.status !== 'chosen' || !directory) return new Set();
  const chosen = directory.electorates.data.electorates.find(
    (s) => s.electorate_id === seat.choice.seatId,
  );
  if (
    !chosen ||
    chosen.status === 'historical' ||
    chosen.representation_status !== 'verified'
  )
    return new Set();
  return new Set(
    chosen.representatives.flatMap((r) => [
      r.person_id,
      representativeProfile(r.person_id, directory)?.slug ?? r.person_id,
    ]),
  );
}

const newestChange = (state: FollowState | undefined) =>
  state?.status === 'ready'
    ? (todayChanges(state.changes)
        .map((c) => c.asAt ?? '')
        .sort()
        .at(-1) ?? '')
    : '';

/**
 * Which follows Today lists: those with a change to show, newest change
 * first, then by name; never the reader's own MP (the Your MP block above
 * shows their newest records). Pure, for the tests.
 */
export function changedFollows(
  follows: readonly Follow[],
  states: ReadonlyMap<string, FollowState>,
  own: ReadonlySet<string> = new Set(),
): Follow[] {
  return follows
    .filter((f) => !(f.kind === 'person' && own.has(f.id)))
    .filter((f) => {
      const state = states.get(followKey(f));
      return (
        state?.status === 'ready' && todayChanges(state.changes).length > 0
      );
    })
    .sort(
      (a, b) =>
        newestChange(states.get(followKey(b))).localeCompare(
          newestChange(states.get(followKey(a))),
        ) || a.title.localeCompare(b.title),
    );
}

/**
 * Following on Today (journeys/follow.md 3.3 and 13): only when the reader
 * follows something. With nothing to show, one row: `bell`, "Following",
 * the count, pushing `/follows`. With changes, a "Following" header with
 * "See all" and the changed follows as rows with their change line; no
 * summary sentence, no "Manage", no dot.
 *
 * The last result is stored on the device (`opax-follows-today-v1.json`,
 * by `useFollowStates`) and drawn first: the same set of changes redraws
 * with no layout change, a different set crossfades once, and a first-ever
 * launch draws the collapsed row until the first check.
 */
export function FollowingBlock({
  attempt,
  onRetry,
}: {
  attempt: number;
  onRetry: () => void;
}) {
  const { follows, states, sources, savedResult, resultLoading, changeSetKey } =
    useFollowStates(attempt);
  const own = useOwnMember();
  const checked = sources !== null;
  // Until the first check answers, the stored result stands in.
  const shown: ReadonlyMap<string, FollowState> = checked
    ? states
    : new Map(savedResult?.states ?? []);
  const changed = changedFollows(follows ?? [], shown, own);
  // The set of changes drawn: the check's, else the stored result's, else
  // none (a first-ever launch draws the collapsed row).
  const key = checked
    ? changeSetKey
    : savedResult
      ? followResultKey(savedResult)
      : '[]';
  const opacity = useCrossfade(key, !resultLoading && !!follows?.length);
  if (!follows?.length || resultLoading) return null;
  const failed =
    !!sources?.error &&
    follows.some((f) => states.get(followKey(f))?.status === 'unavailable');
  const error = failed ? (
    <InlineError
      subject="Changes"
      message="Changes couldn’t be checked."
      onRetry={onRetry}
      testID="today-following-error"
    />
  ) : null;
  if (!changed.length)
    return (
      <Animated.View
        testID="today-following"
        style={{ opacity, gap: rhythm.tight }}
      >
        <InsetGroup>
          <LinkRow
            title="Following"
            value={formatCount(follows.length)}
            symbol={symbols.bell}
            href={followsRoute}
            accessibilityLabel={`Following, ${formatCount(follows.length)}`}
            accessibilityHint="Opens Following"
            testID="today-following-collapsed"
          />
        </InsetGroup>
        {error}
      </Animated.View>
    );
  return (
    <Animated.View
      testID="today-following"
      style={{ opacity, gap: rhythm.heading }}
    >
      <SectionHeader
        compact
        title="Following"
        action={{
          accessibilityLabel: 'See all followed items',
          href: followsRoute,
          testID: 'today-following-all',
        }}
      />
      <InsetGroup testID="today-following-group">
        {changed.slice(0, FOLLOWING_ROWS).map((f) => (
          <FollowRow
            key={followKey(f)}
            follow={f}
            state={shown.get(followKey(f))}
            surface="today"
            testID={`today-following-${f.kind}-${f.id}`}
          />
        ))}
      </InsetGroup>
      {error}
    </Animated.View>
  );
}

/**
 * Opacity that crossfades once (150 ms; 0 ms with Reduce Motion) each time
 * the set of changes differs from the one drawn; the first draw and an
 * unchanged set do not move or fade.
 */
function useCrossfade(key: string, ready: boolean) {
  const reduced = useReduceMotion();
  const [opacity] = useState(() => new Animated.Value(1));
  const drawn = useRef<string | null>(null);
  useEffect(() => {
    if (!ready) return;
    if (drawn.current === null || drawn.current === key) {
      drawn.current = key;
      return;
    }
    drawn.current = key;
    if (reduced) return;
    opacity.setValue(0);
    const fade = Animated.timing(opacity, {
      toValue: 1,
      duration: motion.duration.crossfade,
      useNativeDriver: true,
    });
    fade.start();
    return () => fade.stop();
  }, [key, ready, reduced, opacity]);
  return opacity;
}
