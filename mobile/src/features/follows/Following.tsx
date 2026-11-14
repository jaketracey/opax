import { RouteOptions } from '../../navigation/preview';
import { useEffect, useState } from 'react';
import {
  Platform,
  Pressable,
  RefreshControl,
  StyleSheet,
  View,
} from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { Screen, InsetGroup } from '../../design/layout';
import {
  ContentUnavailable,
  InlineError,
  OfflineLine,
  Skeleton,
} from '../../design/states';
import { Text } from '../../design/text';
import { Icon } from '../../design/icon';
import type { SFSymbol } from '../../design/symbols';
import { haptic } from '../../design/haptics';
import { confirmAction } from '../../design/menu';
import { phoneCopy } from '../../design/phone-copy';
import { useReduceMotion } from '../../design/accessibility';
import { HeightReveal, revealMotion } from '../../design/reveal';
import { colors, minimumTarget, rhythm } from '../../design/tokens';
import { ownsRowPadding, useRowCellStyle } from '../../design/row-padding';
import { headerItems, pageMenu } from '../../navigation/chrome';
import { familyNameKey, useFaceURIs } from '../your-mp/FaceStackRow';
import { useSavedMember } from '../your-mp/useIsMyMember';
import { savedSeatDirectory, useSeat } from '../your-mp/useSeat';
import { FollowRow, WITHDRAWN } from './FollowRow';
import type { FollowState } from './markers';
import { checkedText, sortChanges } from './changes';
import { useFollowStates, markAllSeen } from './useFollowStates';
import {
  clearFollows,
  followWithFeedback,
  followKey,
  unfollow,
  type Follow,
  type FollowKind,
} from './store';

// The edit-mode control. Becomes minus.circle.fill once the shared
// vocabulary lists it (design/symbols.ts is frozen in this wave).
const REMOVE_SYMBOL: SFSymbol = 'minus.circle';
const kindGroups: [FollowKind, string][] = [
  ['person', 'People'],
  ['bill', 'Bills'],
  ['party', 'Parties'],
  ['electorate', 'Electorates'],
];
export const NOTHING_FOLLOWED_TITLE = 'Nothing followed yet';
export const NOTHING_FOLLOWED =
  'Follow a person, bill, party or electorate to see what changes.';
const SAVE_FAILED = () =>
  phoneCopy('Your follows couldn’t be saved on this iPhone.');

export interface FollowEntry {
  follow: Follow;
  state?: FollowState;
  title: string;
  ownMP: boolean;
}
export const WITHDRAWN_NOTE =
  'These records were withdrawn or renamed. Search for them, or unfollow them.';
export const CHECK_DOUBTED = 'Couldn’t check your list just now.';
export interface FollowGroup {
  key: 'changed' | FollowKind | 'withdrawn';
  title: string;
  rows: FollowEntry[];
}

/** The newest change date on a ready, changed follow; null otherwise. */
function newestChange(entry: FollowEntry): string | null {
  if (entry.ownMP || entry.state?.status !== 'ready') return null;
  if (!entry.state.changes.length) return null;
  return sortChanges(entry.state.changes)[0]?.asAt ?? '';
}
const nameKey = (entry: FollowEntry) =>
  entry.follow.kind === 'person'
    ? familyNameKey(entry.title)
    : entry.title.toLocaleLowerCase('en-AU');

/** A follow whose record is gone. The reader's own MP keeps its pointer. */
const withdrawn = (entry: FollowEntry) =>
  !entry.ownMP && entry.state?.status === 'missing';
/**
 * The kinds whose check is not believed: two or more follows of one kind,
 * every one reading as gone. One withdrawn record is news; a whole kind of
 * them is that kind's catalogue arriving wrong or short (a reading is
 * "missing" when the record is absent from a catalogue that did load).
 * Catalogues fail a kind at a time, so the rule is per kind: a sound bill
 * beside eleven "withdrawn" people does not vouch for the people. The page
 * says the check failed and offers it again. A kind in `believed` has been
 * checked again with the same answer, and is taken at its word.
 */
export function doubtedKinds(
  entries: readonly FollowEntry[],
  believed: readonly FollowKind[] = [],
): Set<FollowKind> {
  return new Set(
    kindGroups
      .map(([kind]) => kind)
      .filter((kind) => {
        const rows = entries.filter((e) => e.follow.kind === kind);
        return (
          !believed.includes(kind) &&
          rows.length > 1 &&
          rows.every((e) => e.state?.status === 'missing')
        );
      }),
  );
}

/**
 * "Changed first, newest change first; then the rest by name, A to Z."
 * One Changed group, then People, Bills, Parties, Electorates for the
 * follows that did not change, then the follows whose records are no longer
 * in OPAX, together at the foot. Each follow appears once; empty groups go.
 */
export function followGroups(entries: readonly FollowEntry[]): FollowGroup[] {
  const changed = entries
    .filter((e) => newestChange(e) !== null)
    .sort(
      (a, b) =>
        (newestChange(b) ?? '').localeCompare(newestChange(a) ?? '') ||
        nameKey(a).localeCompare(nameKey(b)),
    );
  const rest = entries.filter((e) => newestChange(e) === null && !withdrawn(e));
  return [
    { key: 'changed' as const, title: 'Changed', rows: changed },
    ...kindGroups.map(([kind, title]) => ({
      key: kind,
      title,
      rows: rest
        .filter((e) => e.follow.kind === kind)
        .sort((a, b) => nameKey(a).localeCompare(nameKey(b))),
    })),
    {
      key: 'withdrawn' as const,
      title: WITHDRAWN,
      rows: entries
        .filter(withdrawn)
        .sort((a, b) => nameKey(a).localeCompare(nameKey(b))),
    },
  ].filter((g) => g.rows.length > 0);
}

/** The reader's own member IDs, worked out on this device from the saved seat. */
function useOwnMemberIds(): ReadonlySet<string> {
  const seat = useSeat();
  const directory = savedSeatDirectory();
  if (seat.status !== 'chosen' || !directory) return new Set();
  const chosen = directory.electorates.data.electorates.find(
    (s) => s.electorate_id === seat.choice.seatId,
  );
  return new Set(
    chosen &&
      chosen.status !== 'historical' &&
      chosen.jurisdiction === 'federal' &&
      chosen.chamber === 'representatives'
      ? chosen.representatives.map((r) => r.person_id)
      : [],
  );
}

/**
 * Following: every follow on this iPhone, what changed first. Edit mode
 * unfollows one at a time or all at once; a row's menu ends with Unfollow.
 */
export default function Following() {
  const params = useLocalSearchParams<{ edit?: string }>();
  const [refresh, setRefresh] = useState(0);
  const { follows, states, sources, refreshing } = useFollowStates(refresh);
  // Kinds whose wholly-withdrawn reading came back the same from a second,
  // clean check; and the check now under way, with what it was asked about.
  const [believed, setBelieved] = useState<readonly FollowKind[]>([]);
  const [asked, setAsked] = useState<{
    at: number;
    kinds: readonly FollowKind[];
  } | null>(null);
  const own = useOwnMemberIds();
  const member = useSavedMember();
  const reduceMotion = useReduceMotion();
  const [editing, setEditing] = useState(params.edit === '1');
  const [busy, setBusy] = useState(false);
  const [saveFailed, setSaveFailed] = useState<(() => void) | null>(null);
  // Rows on their way out: each closes in place as its follow goes, and is
  // dropped once closed (a failed save opens it again). With Reduce Motion a
  // row goes at once.
  const [leaving, setLeaving] = useState<readonly FollowEntry[]>([]);
  useEffect(() => {
    if (!leaving.length) return;
    const timer = setTimeout(() => setLeaving([]), revealMotion.duration);
    return () => clearTimeout(timer);
  }, [leaving]);
  const read: FollowEntry[] = (follows ?? []).map((f) => {
    const state = states.get(followKey(f));
    return {
      follow: f,
      state,
      title: state?.status === 'ready' ? state.title : f.title,
      ownMP: f.kind === 'person' && own.has(f.id),
    };
  });
  // A kind that reads as wholly withdrawn is not believed: its rows keep
  // their places, unchecked, under one sentence and a retry.
  const doubted = doubtedKinds(read, believed);
  // The retry (or a pull) has finished. A clean read that says the same
  // again is the answer: those records are gone, and the page stops
  // offering a retry that changes nothing.
  if (asked && asked.at === refresh && !refreshing) {
    const same = asked.kinds.filter((kind) => doubted.has(kind));
    setAsked(null);
    if (same.length && sources && !sources.error && !sources.stale)
      setBelieved([...believed, ...same]);
  }
  const checkAgain = () => {
    setAsked({ at: refresh + 1, kinds: [...doubted] });
    setRefresh(refresh + 1);
  };
  const entries: FollowEntry[] = read.map((e) =>
    doubted.has(e.follow.kind)
      ? { ...e, state: { status: 'unavailable' as const } }
      : e,
  );
  const going = new Set(leaving.map((e) => followKey(e.follow)));
  const live = new Set(entries.map((e) => followKey(e.follow)));
  const groups = followGroups([
    ...entries,
    ...leaving.filter((e) => !live.has(followKey(e.follow))),
  ]);
  const count = follows?.length ?? 0;
  const inEdit = editing && count > 0;

  async function save(change: () => Promise<void>, remaining: number) {
    setBusy(true);
    setSaveFailed(null);
    try {
      await change();
      if (remaining <= 0) setEditing(false);
    } catch {
      setSaveFailed(() => () => void save(change, remaining));
    } finally {
      setBusy(false);
    }
  }
  const remove = (entry: FollowEntry) => {
    haptic('selection');
    if (!reduceMotion) setLeaving((old) => [...old, entry]);
    void save(() => unfollow(followKey(entry.follow)), count - 1);
  };
  const unfollowAll = () => {
    const title = `Unfollow all ${count}?`;
    const message = 'Today stops showing their changes.';
    const run = () => void save(clearFollows, 0);
    if (Platform.OS === 'ios')
      confirmAction(
        title,
        [{ title: 'Unfollow all', destructive: true, onPress: run }],
        undefined,
        message,
      );
    else
      confirmAction(`${title} ${message}`, [
        { title: 'Unfollow all', destructive: true, onPress: run },
      ]);
  };

  const followMember = () => {
    if (!member?.canonicalPersonId || busy) return;
    void save(async () => {
      const result = await followWithFeedback({
        kind: 'person',
        id: member.canonicalPersonId!,
        title: member.name,
      });
      if (result.status === 'followed') haptic('success');
    }, 1);
  };

  const failedAll =
    !!sources?.error &&
    sources.error.code !== 'offline' &&
    !entries.some((e) => e.state?.status === 'ready');
  const offline =
    sources?.error?.code === 'offline' ||
    (!!sources?.stale && !!sources.savedAt)
      ? (sources?.savedAt ?? null)
      : undefined;

  // The quiet state reads as watched: when the record was last checked.
  const checked =
    !inEdit && !failedAll && !doubted.size && sources?.savedAt && !sources.error
      ? checkedText(sources.savedAt)
      : '';

  return (
    <Screen
      grouped
      centred={follows !== null && count === 0}
      testID="follows-screen"
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={checkAgain} />
      }
    >
      <RouteOptions
        options={{
          title: 'Following',
          headerLargeTitleEnabled: false,
          ...headerItems(
            count
              ? () => [
                  ...(inEdit
                    ? []
                    : [
                        pageMenu({
                          name: 'Following',
                          items: [
                            {
                              title: 'Mark all as seen',
                              onPress: () => void save(markAllSeen, count),
                            },
                          ],
                        }),
                      ]),
                  {
                    type: 'button' as const,
                    label: inEdit ? 'Done' : 'Edit',
                    variant: inEdit ? ('done' as const) : ('plain' as const),
                    identifier: 'follows-edit',
                    onPress: () => setEditing((v) => !v),
                  },
                ]
              : undefined,
          ),
        }}
      />
      {/* Ids the bar items cannot carry on every platform, for journeys. */}
      <View
        testID={inEdit ? 'follows-editing' : 'follows-browsing'}
        collapsable={false}
        style={styles.marker}
      />
      {offline !== undefined ? (
        <OfflineLine savedAt={offline} testID="follows-offline" />
      ) : null}
      {saveFailed ? (
        <InlineError
          subject="follows"
          message={SAVE_FAILED()}
          onRetry={saveFailed}
          testID="follows-save-error"
        />
      ) : failedAll ? (
        <InlineError
          subject="changes"
          message="Changes couldn’t be checked."
          onRetry={checkAgain}
          testID="follows-check-error"
        />
      ) : doubted.size ? (
        <InlineError
          subject="follows"
          message={CHECK_DOUBTED}
          onRetry={checkAgain}
          testID="follows-check-doubted"
        />
      ) : null}
      {follows === null ? (
        <Skeleton
          shape="rows"
          count={3}
          label="Loading your follows"
          testID="follows-loading"
        />
      ) : !count ? (
        <ContentUnavailable
          symbol="bell"
          title={NOTHING_FOLLOWED_TITLE}
          body={NOTHING_FOLLOWED}
          action={{
            label: member ? `Follow ${member.name}` : 'Find your MP',
            onPress: member ? followMember : () => router.push('/seat'),
            testID: 'follows-empty-action',
          }}
          testID="follows-empty"
        />
      ) : (
        <>
          {groups.map((group, index) => {
            const list = (
              <InsetGroup
                key={group.key}
                header={group.title}
                footer={group.key === 'withdrawn' ? WITHDRAWN_NOTE : undefined}
                testID={`follows-${group.key}`}
              >
                {group.rows.map((entry) => {
                  const key = followKey(entry.follow);
                  return (
                    <HeightReveal key={key} reduceMotion={reduceMotion}>
                      {going.has(key) ? null : inEdit ? (
                        <EditRow
                          entry={entry}
                          disabled={busy}
                          onRemove={() => remove(entry)}
                        />
                      ) : (
                        <ListRow
                          entry={entry}
                          // The heading says it once for the withdrawn
                          // group; a doubted check has nothing to say.
                          hideStatus={
                            group.key === 'withdrawn' ||
                            doubted.has(entry.follow.kind)
                          }
                          onUnfollow={() => remove(entry)}
                        />
                      )}
                    </HeightReveal>
                  );
                })}
              </InsetGroup>
            );
            // The check time leads the first group, in the source line's
            // type, so a quiet list reads as watched rather than empty.
            return index === 0 && checked ? (
              <View key={group.key} style={styles.checkedGroup}>
                <Text
                  variant="footnote"
                  style={styles.checked}
                  testID="follows-checked"
                >
                  {checked}
                </Text>
                {list}
              </View>
            ) : (
              list
            );
          })}
          {inEdit ? (
            <InsetGroup testID="follows-unfollow-all-group">
              <Pressable
                accessibilityRole="button"
                accessibilityState={{ disabled: busy }}
                disabled={busy}
                onPress={unfollowAll}
                testID="follows-unfollow-all"
                style={({ pressed }) => [
                  styles.foot,
                  pressed && { backgroundColor: colors.sunken },
                ]}
              >
                <Text wordSafe tone="danger" style={styles.centred}>
                  Unfollow all
                </Text>
              </Pressable>
            </InsetGroup>
          ) : null}
        </>
      )}
    </Screen>
  );
}

function ListRow({
  entry,
  hideStatus,
  onUnfollow,
}: {
  entry: FollowEntry;
  hideStatus: boolean;
  onUnfollow: () => void;
}) {
  const [uri] = useFaceURIs(
    entry.follow.kind === 'person' ? [{ name: entry.title }] : [],
    1,
  );
  return (
    <FollowRow
      follow={entry.follow}
      state={entry.state}
      ownMP={entry.ownMP}
      portraitURI={uri ?? undefined}
      hideStatus={hideStatus}
      onUnfollow={onUnfollow}
      testID={`follows-row-${entry.follow.kind}-${entry.follow.id}`}
    />
  );
}

/** Edit mode: a leading minus that unfollows at once; no chevron or menu. */
function EditRow({
  entry,
  disabled,
  onRemove,
}: {
  entry: FollowEntry;
  disabled: boolean;
  onRemove: () => void;
}) {
  const cellStyle = useRowCellStyle();
  const { follow } = entry;
  return (
    <View
      style={[styles.editRow, cellStyle]}
      testID={`follows-row-${follow.kind}-${follow.id}`}
    >
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Unfollow ${entry.title}`}
        accessibilityState={{ disabled }}
        disabled={disabled}
        hitSlop={4}
        onPress={onRemove}
        testID={`follows-remove-${follow.kind}-${follow.id}`}
        style={styles.minus}
      >
        <Icon name={REMOVE_SYMBOL} size={22} tone="danger" weight="semibold" />
      </Pressable>
      <View style={styles.words} accessible>
        <Text wordSafe variant="body">
          {entry.title}
        </Text>
      </View>
    </View>
  );
}
ownsRowPadding(EditRow);

const styles = StyleSheet.create({
  // Keep journey identifiers out of the flowing list's section spacing.
  marker: { position: 'absolute', height: 0, width: 0 },
  editRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: rhythm.tight,
    minHeight: minimumTarget,
    paddingVertical: rhythm.row,
  },
  minus: {
    minWidth: minimumTarget,
    minHeight: minimumTarget,
    alignItems: 'center',
    justifyContent: 'center',
  },
  words: { flex: 1, minWidth: 120 },
  foot: {
    minHeight: minimumTarget,
    justifyContent: 'center',
    paddingVertical: rhythm.row,
  },
  centred: { textAlign: 'center' },
  checkedGroup: { gap: rhythm.tight },
  checked: { paddingHorizontal: 4 },
});
