import { RouteOptions } from '../navigation/preview';
import { useScreenReady } from '../analytics/timing';
import { router } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Platform, RefreshControl, StyleSheet, View } from 'react-native';
import type { BillIndex, Electorate } from '../api/catalogs';
import { catalogs } from '../api/runtime';
import { Card } from '../design/card';
import { Button } from '../design/controls';
import { thisDevice } from '../design/device';
import { InsetGroup, Screen, SectionHeader } from '../design/layout';
import { confirmAction } from '../design/menu';
import { PageFoot } from '../design/record';
import type { RowMenuAction } from '../design/row-link';
import { LinkRow } from '../design/rows';
import { SourceLine } from '../design/source';
import { InlineError, OfflineLine, Skeleton } from '../design/states';
import { symbols } from '../design/symbols';
import { Text } from '../design/text';
import { rhythm } from '../design/tokens';
import { headerItems, pageMenu, rootHeaderItems } from '../navigation/chrome';
import { openSource } from '../navigation/external';
import { directoryRoute, seatRoute } from '../navigation/routes';
import { shareRecord } from '../navigation/share';
import { useAccount } from './account/store';
import { useOpenAsk } from './ask/open';
import { followKey, useFollows } from './follows/store';
import { useSeenOnView } from './follows/useSeenOnView';
import { SeatGrants } from './money-public/SeatGrants';
import {
  ElectorateCard,
  ElectorateCardSkeleton,
} from './your-mp/ElectorateCard';
import {
  LATELY_LIMIT,
  latelyFor,
  latelySource,
  markLatelySeen,
} from './your-mp/latest';
import { LatestRows } from './your-mp/LatestRows';
import { officialPageFor } from './your-mp/MemberHeroRow';
import {
  type Directory,
  type ElectorateView,
  type ProfileView,
  type YourMPView,
} from './your-mp/model';
import {
  RepresentativesGroup,
  RepresentativesSkeleton,
} from './your-mp/RepresentativesGroup';
import { seatLine } from './your-mp/state-names';
import { showsVictorianSection, StateMembers } from './your-mp/StateMembers';
import { migratedSeat, savedSeatDirectory, useSeat } from './your-mp/useSeat';

const house = (s: Electorate) =>
  s.jurisdiction === 'federal' && s.chamber === 'representatives';

type Load<T> =
  | { status: 'loading' }
  | { status: 'error' }
  | { status: 'ready'; data: T };

/** One async block, keyed so a new seat never shows the old seat's data. */
function useBlock<T>(
  key: string | null,
  load: () => Promise<T>,
  attempt: number,
): Load<T> {
  const [state, setState] = useState<{ key: string; value: Load<T> } | null>(
    null,
  );
  const loader = useRef(load);
  useEffect(() => {
    loader.current = load;
  });
  useEffect(() => {
    if (!key) return;
    let active = true;
    loader
      .current()
      .then((data) => {
        if (active) setState({ key, value: { status: 'ready', data } });
      })
      .catch(() => {
        if (active) setState({ key, value: { status: 'error' } });
      });
    return () => {
      active = false;
    };
  }, [key, attempt]);
  return state?.key === key && key ? state.value : { status: 'loading' };
}

export default function YourMP() {
  const seat = useSeat();
  const account = useAccount();
  const openAsk = useOpenAsk();
  const directory: Directory | null = savedSeatDirectory();
  const [attempt, setAttempt] = useState(0);
  const [pulledAt, setPulledAt] = useState<number | null>(null);
  const choice = seat.status === 'chosen' ? seat.choice : null;
  const federal =
    choice && directory
      ? (directory.electorates.data.electorates.find(
          (s) => s.electorate_id === choice.seatId,
        ) ?? null)
      : null;
  const home = !!federal && house(federal) && federal.status !== 'historical';
  const stateSeatIds = useMemo(() => choice?.stateSeatIds ?? [], [choice]);
  const seatKey = home
    ? `${federal!.electorate_id}|${stateSeatIds.join(',')}`
    : null;
  const view = useBlock<YourMPView>(
    seatKey,
    () => catalogs.yourMP(federal!.electorate_id, stateSeatIds),
    attempt,
  );
  useScreenReady(
    '/your-mp',
    seat.status !== 'loading' && (!home || view.status !== 'loading'),
  );
  const electorate = useBlock<ElectorateView>(
    home ? federal!.detail_url : null,
    async () => (await catalogs.electorateFor(federal!.detail_url)).data,
    attempt,
  );
  const member =
    view.status === 'ready' && view.data.members.data?.length === 1
      ? view.data.members.data[0]!
      : null;
  const [profileAttempt, setProfileAttempt] = useState(0);
  const profile = useBlock<ProfileView>(
    member ? member.person_id : null,
    () =>
      catalogs.profileFor(member!.person_id, {
        includeInterests: true,
      }) as Promise<ProfileView>,
    attempt + profileAttempt,
  );
  const bills = useBlock<{ data: BillIndex; asOf: string | null }>(
    member ? 'bills' : null,
    async () => {
      const result = await catalogs.bills();
      return {
        data: result.data,
        asOf:
          (result.data as { meta?: { generated?: string } }).meta?.generated ??
          null,
      };
    },
    attempt,
  );
  // The spinner stays until the last block of the pull settles.
  // With no seat there are no blocks, so the pull ends at once.
  const refreshing =
    pulledAt === attempt &&
    home &&
    (view.status === 'loading' ||
      electorate.status === 'loading' ||
      (!!member && profile.status === 'loading'));
  const retry = useCallback(() => {
    setAttempt((n) => {
      setPulledAt(n + 1);
      return n + 1;
    });
  }, []);
  const memberName = member?.person.name ?? null;
  const person =
    member && directory
      ? directory.people.data.people.find(
          (p) => p.person_id === member.person_id,
        )
      : null;
  const official = home
    ? officialPageFor(person?.source_url, federal!.jurisdiction)
    : null;
  const victorian = showsVictorianSection(home ? federal : null, stateSeatIds);
  const removeState = useCallback(() => {
    void seat.removeState().catch(() => undefined);
  }, [seat]);
  const forget = useCallback(() => {
    // Through the seat's write queue, so a state removal or save still in
    // flight cannot land after the forget and bring the choice back.
    const run = () => void seat.forget().catch(() => undefined);
    const title = 'Forget your electorate?';
    const message = 'Today and Your MP stop showing your representatives.';
    if (Platform.OS === 'ios' || Platform.OS === 'android')
      confirmAction(
        title,
        [{ title: 'Forget', destructive: true, onPress: run }],
        undefined,
        message,
      );
    else confirmAction(title, [{ title: 'Forget', onPress: run }]);
  }, [seat]);
  const menu = useMemo((): RowMenuAction[] => {
    if (!home || !federal) return [];
    const vic = federal.state_code.toLowerCase() === 'vic';
    return [
      {
        title: 'Change electorate',
        symbol: 'building.columns',
        onPress: () => router.push(seatRoute()),
      },
      {
        title: 'Use my location',
        symbol: 'location.fill',
        onPress: () => router.push(seatRoute(undefined, true)),
      },
      ...(vic
        ? stateSeatIds.length
          ? [
              {
                title: 'Change state electorate',
                symbol: 'building.columns' as const,
                onPress: () => router.push(seatRoute('vic')),
              },
              {
                title: 'Remove state electorate',
                symbol: 'minus.circle' as const,
                destructive: true,
                onPress: removeState,
              },
            ]
          : [
              {
                title: 'Add state electorate',
                symbol: 'plus' as const,
                onPress: () => router.push(seatRoute('vic')),
              },
            ]
        : []),
      ...(memberName
        ? [
            {
              title: `Ask about ${memberName}`,
              symbol: 'text.bubble' as const,
              onPress: () =>
                openAsk({
                  question: `What has ${memberName} said in parliament this year?`,
                  speaker: memberName,
                  kind: 'speech',
                }),
            },
          ]
        : []),
      ...(official
        ? [
            {
              title: official.label,
              symbol: 'arrow.up.right.square' as const,
              onPress: () => void openSource(official.url, official.label),
            },
          ]
        : []),
      {
        title: 'Share',
        symbol: 'square.and.arrow.up',
        onPress: () =>
          void shareRecord({ title: federal.name, path: federal.url }),
      },
      // The one destructive item for the whole seat has its own section.
      {
        title: '',
        inline: true,
        items: [
          {
            title: 'Forget my electorate',
            symbol: 'minus.circle',
            destructive: true,
            onPress: forget,
          },
        ],
      },
    ];
  }, [
    home,
    federal,
    stateSeatIds,
    memberName,
    official,
    openAsk,
    removeState,
    forget,
  ]);
  const offline =
    directory?.electorates.stale && directory.electorates.savedAt
      ? directory.electorates.savedAt
      : null;
  return (
    <Screen
      grouped
      testID="your-mp-screen"
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          // A failed seat read has no blocks yet: a pull reads the seat again.
          onRefresh={seat.status === 'error' ? seat.retry : retry}
        />
      }
    >
      <RouteOptions
        options={{
          title: 'Your MP',
          headerLargeTitleEnabled: true,
          ...headerItems(() =>
            rootHeaderItems({
              segment: '(your-mp)',
              signedIn: !!account.status?.signedIn,
              extra: menu.length
                ? [
                    pageMenu({
                      name: federal?.name ?? 'Your MP',
                      webPath: federal?.url,
                      items: menu,
                    }),
                  ]
                : [],
            }),
          ),
        }}
      />
      {seat.status === 'loading' ? (
        <RepresentativesSkeleton />
      ) : seat.status === 'error' ? (
        <InlineError
          subject="Your electorate"
          message={`Your electorate couldn't be read on this ${thisDevice()}.`}
          // The seat store reads the directory once: Try again reads it again.
          onRetry={seat.retry}
          testID="your-mp-error"
        />
      ) : home && federal && directory ? (
        <>
          <Text wordSafe variant="secondary" testID="your-seat-name">
            {seatLine(federal.name, federal.state_code)}
          </Text>
          {offline ? <OfflineLine savedAt={offline} /> : null}
          {view.status === 'loading' ? (
            <RepresentativesSkeleton />
          ) : view.status === 'error' ? (
            <InlineError
              subject="Your MP"
              message="Your MP couldn't be loaded."
              onRetry={retry}
              testID="your-mp-error"
            />
          ) : (
            <RepresentativesGroup
              seat={federal}
              view={view.data}
              directory={directory}
              electorate={
                electorate.status === 'ready' ? electorate.data : null
              }
            />
          )}
          {member ? (
            <Lately
              personId={member.person_id}
              profile={profile}
              bills={bills.status === 'ready' ? bills.data : null}
              onRetry={() => setProfileAttempt((n) => n + 1)}
            />
          ) : null}
          {victorian ? (
            <StateMembers
              directory={directory}
              stateSeatIds={stateSeatIds}
              onRemove={removeState}
            />
          ) : null}
          {electorate.status === 'error' ? null : (
            <View style={styles.section}>
              <SectionHeader title="Your electorate" />
              {electorate.status === 'loading' ? (
                <ElectorateCardSkeleton />
              ) : (
                <ElectorateCard
                  seat={federal}
                  view={electorate.data}
                  directory={directory}
                />
              )}
            </View>
          )}
          <SeatGrants
            variant="seat-home"
            name={federal.name}
            state={federal.state_code}
            eligible={house(federal)}
          />
          {victorian ? <PageFoot variant="authorised" /> : null}
          <PageEnd />
        </>
      ) : directory ? (
        <NoSeat
          directory={directory}
          stateSeatIds={stateSeatIds}
          onRemoveState={removeState}
        />
      ) : (
        <RepresentativesSkeleton />
      )}
    </Screen>
  );
}

/** Lately: up to five newest dated records about the member. */
function Lately({
  personId,
  profile,
  bills,
  onRetry,
}: {
  personId: string;
  profile: Load<ProfileView>;
  bills: { data: BillIndex; asOf: string | null } | null;
  onRetry: () => void;
}) {
  const state =
    profile.status === 'loading'
      ? ({ status: 'loading' } as const)
      : profile.status === 'error'
        ? ({ status: 'error' } as const)
        : latelyFor(profile.data, bills?.data, { limit: LATELY_LIMIT });
  const ref = useRef<View>(null);
  const follows = useFollows();
  const own = follows?.find(
    (f) =>
      f.kind === 'person' &&
      followKey(f) === followKey({ kind: 'person', id: personId }),
  );
  const keys = state.status === 'ready' ? state.records.map((r) => r.key) : [];
  // Only when the reader follows their own MP: the rows shown become seen.
  useSeenOnView(ref, own ? keys : [], (shown) => {
    if (own && shown.length)
      void markLatelySeen(own, shown).catch(() => undefined);
  });
  if (state.status === 'empty') return null;
  return (
    <View style={styles.section} testID="your-lately">
      <SectionHeader title="Lately" />
      {state.status === 'loading' ? (
        <Skeleton
          shape="rows"
          count={LATELY_LIMIT}
          label="Loading recent records"
        />
      ) : state.status === 'error' ? (
        <InlineError
          subject="Recent records"
          message="Recent records couldn't be loaded."
          onRetry={onRetry}
        />
      ) : (
        <View ref={ref} collapsable={false} style={styles.group}>
          <InsetGroup testID="your-latest">
            <LatestRows records={state.records} testID="your-latest" />
          </InsetGroup>
          {profile.status === 'ready' ? (
            <SourceLine
              title="About these records"
              {...latelySource(profile.data, bills)}
              testID="your-latest-source"
            />
          ) : null}
        </View>
      )}
    </View>
  );
}

/** No seat, an abolished seat, or a 1.0 choice the app no longer shows. */
function NoSeat({
  directory,
  stateSeatIds,
  onRemoveState,
}: {
  directory: Directory;
  stateSeatIds: readonly string[];
  onRemoveState: () => void;
}) {
  const old = migratedSeat();
  const body = old
    ? old.status === 'historical' && house(old)
      ? `${old.name} is no longer an electorate.`
      : 'Choose your House of Representatives electorate to see your MP.'
    : 'Add your electorate to see your MP, how they vote and the grants in your area.';
  return (
    <>
      <Card testID="your-invitation" padded>
        <View style={styles.invitation}>
          <Text variant="sectionTitle" accessibilityRole="header">
            Who represents you?
          </Text>
          <Text wordSafe>{body}</Text>
          <View style={styles.buttons}>
            <Button
              label="Find my electorate"
              variant="primary"
              onPress={() => router.push(seatRoute())}
              testID="your-invitation-find"
            />
            <Button
              label="Use my location"
              variant="plain"
              icon={symbols.location}
              onPress={() => router.push(seatRoute(undefined, true))}
              testID="your-invitation-location"
            />
          </View>
        </View>
      </Card>
      {stateSeatIds.length ? (
        <StateMembers
          directory={directory}
          stateSeatIds={stateSeatIds}
          onRemove={onRemoveState}
        />
      ) : null}
      <InsetGroup>
        <LinkRow
          title="Parliamentarians"
          symbol={symbols.person}
          href={directoryRoute('person')}
          testID="your-directory-people"
        />
        <LinkRow
          title="Electorates"
          symbol={symbols.electorate}
          href={directoryRoute('electorate')}
          testID="your-directory-electorates"
        />
      </InsetGroup>
      {stateSeatIds.length ? <PageFoot variant="authorised" /> : null}
      <PageEnd />
    </>
  );
}

/** The page's end, for journeys that scroll to it; nothing drawn. */
function PageEnd() {
  return <View testID="your-mp-end" collapsable={false} style={styles.end} />;
}

const styles = StyleSheet.create({
  section: { gap: rhythm.heading },
  end: { height: 1 },
  group: { gap: rhythm.tight },
  invitation: { gap: rhythm.tight },
  buttons: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: rhythm.tight,
    marginTop: rhythm.tight,
  },
});
