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
import { resultsRoute } from '../../navigation/routes/search';
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
/** A follow whose record is gone from the catalogue it was read from. */
export const WITHDRAWN = 'No longer in OPAX';
/**
 * Where a withdrawn follow's row leads: Search, with its title asked. A
 * renamed record turns up there; a withdrawn one says so in Search's own
 * words. The query arrives as a link, so it never enters Recent.
 */
export const withdrawnRoute = (follow: Pick<Follow, 'kind' | 'title'>) =>
  resultsRoute(
    follow.kind === 'person'
      ? 'people'
      : follow.kind === 'bill'
        ? 'bills'
        : 'all',
    { q: follow.title, link: '1' },
  );
export interface FollowRowProps {
  follow: Follow;
  state?: FollowState;
  testID?: string;
  ownMP?: boolean;
  onUnfollow?: () => void;
  portraitURI?: string;
  surface?: 'today' | 'following';
  /**
   * No status line under the title: the group's heading already says it
   * (Following's withdrawn group), or there is nothing to say (a check that
   * could not be trusted). VoiceOver still hears a withdrawn row's state.
   */
  hideStatus?: boolean;
}
export function FollowRow({
  follow,
  state,
  testID,
  ownMP,
  onUnfollow,
  portraitURI,
  surface = 'following',
  hideStatus = false,
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
      ? WITHDRAWN
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
  const detail = [hideStatus ? undefined : line, more]
    .filter(Boolean)
    .join('\n');
  const missing = !ownMP && state?.status === 'missing';
  const route = missing ? withdrawnRoute(follow) : followRoute(follow, state);
  const unfollowNow =
    onUnfollow ??
    (() => {
      void unfollow(followKey(follow)).catch(() => undefined);
    });
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
      // A withdrawn record is not a dead end: its row searches for the
      // title, and its menu is the one thing left to do with it.
      href={state?.status === 'missing' && !missing ? undefined : route}
      accessory={state?.status === 'missing' && !missing ? 'none' : 'chevron'}
      accessibilityHint={missing ? 'Searches for this title' : undefined}
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
      menu={
        missing
          ? [
              {
                title: 'Unfollow',
                symbol: 'minus.circle',
                destructive: true,
                onPress: unfollowNow,
              },
            ]
          : rowMenus.following({ title, path, onUnfollow: unfollowNow })
      }
      accessibilityLabel={[
        `${title}, ${follow.kind}.`,
        fresh
          ? `Changed: ${changeAccessibilityLabel(fresh)}.`
          : hideStatus && !missing
            ? undefined
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
