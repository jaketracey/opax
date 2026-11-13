import { StyleSheet, View } from 'react-native';
import { StatusCapsule } from '../../design/labels';
import { billStatus as billStatusLabel } from '../../design/parliament';
import { Text } from '../../design/text';
import { LinkRow } from '../../design/rows';
import { Portrait } from '../../design/people';
import { rowMenus } from '../../design/row-link';
import { rhythm } from '../../design/tokens';
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
  changeText,
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
  const title = state?.status === 'ready' ? state.title : follow.title;
  const changes =
    state?.status === 'ready'
      ? surface === 'today'
        ? todayChanges(state.changes)
        : sortChanges(state.changes)
      : [];
  const line = ownMP
    ? 'Shown in Your MP on Today'
    : state?.status === 'missing'
      ? 'No longer published'
      : !state || state.status === 'unavailable'
        ? 'Not checked yet'
        : changes[0]
          ? changeText(changes[0])
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
  const metadata = billStatus ? (
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
      detail={detail || undefined}
      href={state?.status === 'missing' ? undefined : route}
      accessory={state?.status === 'missing' ? 'none' : 'chevron'}
      aboveTitle={
        surface === 'following' && metadata ? (
          <View style={styles.metadata}>{metadata}</View>
        ) : undefined
      }
      leadingAccessory={
        surface === 'following' && follow.kind === 'person' ? (
          <Portrait uri={portraitURI} name={title} />
        ) : undefined
      }
      leading={
        surface === 'following' ? undefined : follow.kind === 'person' ? (
          <Portrait uri={portraitURI} name={title} />
        ) : (
          metadata
        )
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
        changes[0] && !ownMP
          ? `Changed: ${changeAccessibilityLabel(changes[0])}.`
          : line,
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
