import { StyleSheet, View } from 'react-native';
import { StatusCapsule } from '../../design/labels';
import { billStatus as billStatusLabel } from '../../design/parliament';
import { Text } from '../../design/text';
import { LinkRow } from '../../design/rows';
import { Portrait } from '../../design/people';
import { rowMenus } from '../../design/row-link';
import { rhythm } from '../../design/tokens';
import { useAccessibilitySize } from '../../design/accessibility';
import { ChangeLine } from './ChangeLine';
import {
  billRoute,
  electorateRoute,
  personRoute,
  partyRoute,
} from '../../navigation/routes';
import type { FollowState } from './markers';
import {
  type Change,
  changeDate,
  sortChanges,
  changeAccessibilityLabel,
  moreChangesText,
  quietText,
  todayChanges,
} from './changes';
import { followKey, unfollow, type Follow } from './store';

export function followRoute(
  follow: Pick<Follow, 'kind' | 'id'> & { changes?: readonly Change[] },
  state?: FollowState,
) {
  const changed =
    !!follow.changes?.length ||
    (state?.status === 'ready' && state.changes.length > 0);
  const route =
    follow.kind === 'party'
      ? partyRoute(follow.id)
      : follow.kind === 'person'
        ? personRoute(follow.id)
        : follow.kind === 'bill'
          ? billRoute(follow.id)
          : electorateRoute(follow.id);
  return {
    ...route,
    params: {
      ...route.params,
      ...(changed ? { section: 'changes' as const } : {}),
    },
  };
}
export interface FollowRowProps {
  follow: Follow;
  state?: FollowState;
  testID?: string;
  ownMP?: boolean;
  onUnfollow?: () => void;
  portraitURI?: string;
  surface?: 'today' | 'following';
}
export function FollowRow({
  follow,
  state,
  testID,
  ownMP,
  onUnfollow,
  portraitURI,
  surface = 'following',
}: FollowRowProps) {
  const stacked = useAccessibilitySize();
  const title = state?.status === 'ready' ? state.title : follow.title;
  const changes =
    state?.status === 'ready'
      ? surface === 'today'
        ? todayChanges(state.changes)
        : sortChanges(state.changes)
      : [];
  // An unseen change is the row's news (sweep 2 item 4): its sentence in
  // ink, led by the new dot, in place of the status pill and date it
  // restates. Once seen the change drops and the pill returns.
  const fresh = !ownMP && state?.status === 'ready' ? changes[0] : undefined;
  const line = ownMP
    ? 'Shown in Your MP on Today'
    : state?.status === 'missing'
      ? 'No longer published'
      : !state || state.status === 'unavailable'
        ? 'Not checked yet'
        : fresh
          ? undefined
          : surface === 'following'
            ? quietText(follow)
            : undefined;
  // Your own MP's changes are on Today, not counted under a pointer to them.
  const more =
    !ownMP && changes.length > 1
      ? moreChangesText(changes.length - 1)
      : undefined;
  const detail = [line, more].filter(Boolean).join('\n');
  const route = followRoute(follow, state);
  const path =
    follow.kind === 'person'
      ? `/subject/person/${follow.id}`
      : follow.kind === 'electorate'
        ? `/subject/electorate/${follow.id}`
        : `/${follow.kind}/${follow.id}`;
  const billStatus =
    follow.kind === 'bill' && state?.status === 'ready'
      ? state.current.status
      : undefined;
  const metadata =
    billStatus && !fresh ? (
      <>
        <StatusCapsule
          status={String(billStatus.value)}
          label={billStatusLabel(String(billStatus.value))}
          hidden
        />
        {billStatus.asAt ? (
          <Text wordSafe={surface === 'following'} variant="secondary">
            {changeDate(billStatus.asAt)}
          </Text>
        ) : null}
      </>
    ) : undefined;
  return (
    <LinkRow
      title={title}
      // A followed bill reads as every other bill row: serif, three lines
      // to XXXL, six from AX1 (as Today's bill previews).
      titleRole={follow.kind === 'bill' ? 'rowRecord' : undefined}
      titleLines={follow.kind === 'bill' ? (stacked ? 6 : 3) : undefined}
      secondary={
        fresh ? (
          <ChangeLine
            change={fresh}
            fresh
            testID={`${testID ?? `follows-row-${follow.kind}-${follow.id}`}-change`}
          />
        ) : undefined
      }
      detail={detail || undefined}
      href={state?.status === 'missing' ? undefined : route}
      accessory={state?.status === 'missing' ? 'none' : 'chevron'}
      // Today and Following share one layout: the pill on its own line
      // above the title, never a leading column beside it.
      aboveTitle={
        metadata ? <View style={styles.metadata}>{metadata}</View> : undefined
      }
      leadingAccessory={
        follow.kind === 'person' ? (
          <Portrait uri={portraitURI} name={title} />
        ) : undefined
      }
      symbol={
        follow.kind === 'party'
          ? 'person.3'
          : follow.kind === 'electorate'
            ? 'map'
            : undefined
      }
      menu={rowMenus.following({
        title,
        path,
        onUnfollow:
          onUnfollow ??
          (() => {
            void unfollow(followKey(follow)).catch(() => undefined);
          }),
      })}
      accessibilityLabel={[
        `${title}, ${follow.kind}.`,
        fresh ? `Changed: ${changeAccessibilityLabel(fresh)}.` : line,
        more ? `And ${changes.length - 1} more.` : undefined,
      ]
        .filter(Boolean)
        .join(' ')}
      testID={testID ?? `follows-row-${follow.kind}-${follow.id}`}
    />
  );
}

const styles = StyleSheet.create({
  metadata: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    columnGap: rhythm.tight,
    rowGap: rhythm.line,
  },
});
