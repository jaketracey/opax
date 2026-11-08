import { StatusCapsule } from '../../design/labels';
import { Text } from '../../design/text';
import { LinkRow } from '../../design/rows';
import { Portrait } from '../../design/people';
import { rowMenus } from '../../design/row-link';
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
          : undefined;
  const more =
    changes.length > 1 ? moreChangesText(changes.length - 1) : undefined;
  const detail = [line, more].filter(Boolean).join('\n');
  const route = followRoute(follow, state);
  const path =
    follow.kind === 'person'
      ? `/subject/person/${follow.id}`
      : follow.kind === 'electorate'
        ? `/subject/electorate/${follow.id}`
        : `/${follow.kind}/${follow.id}`;
  return (
    <LinkRow
      title={title}
      detail={detail || undefined}
      href={state?.status === 'missing' ? undefined : route}
      accessory={state?.status === 'missing' ? 'none' : 'chevron'}
      leading={
        follow.kind === 'person' ? (
          <Portrait uri={portraitURI} name={title} />
        ) : follow.kind === 'bill' &&
          state?.status === 'ready' &&
          state.current.status ? (
          <>
            <StatusCapsule
              status={
                state.current.status.words ?? String(state.current.status.value)
              }
              hidden
            />
            {state.current.status.asAt ? (
              <Text variant="secondary">
                {changeDate(state.current.status.asAt)}
              </Text>
            ) : null}
          </>
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
