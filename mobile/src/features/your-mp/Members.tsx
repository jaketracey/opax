import { useLocalSearchParams } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { View } from 'react-native';
import type { Electorate } from '../../api/catalogs';
import { catalogs } from '../../api/runtime';
import { formatDate } from '../../design/format';
import { Group, InsetGroup, Screen } from '../../design/layout';
import { PersonRow } from '../../design/people';
import { PageFoot } from '../../design/record';
import { SourceLine } from '../../design/source';
import { ContentUnavailable, Skeleton } from '../../design/states';
import { Heading, Text } from '../../design/text';
import { rhythm } from '../../design/tokens';
import { personRoute } from '../../navigation/routes';
import { useTitleOnScroll } from '../../navigation/useTitleOnScroll';
import { CachedPortrait } from '../CachedPortrait';
import { byFamilyName } from './FaceStackRow';
import { representativeProfile, type Directory } from './model';
import { stateInRunningCopy } from './state-names';
import { isRegion } from './StateMembers';

type Loaded = {
  directory: Directory;
  seat: Electorate;
  /** Current term starts by person, from the electorate file when it loads. */
  since: Record<string, string>;
};

/** "Senators for New South Wales" or "Members for Western Victoria Region". */
export function membersTitle(
  seat: Pick<Electorate, 'chamber' | 'name' | 'state_code'>,
) {
  return seat.chamber === 'senate'
    ? {
        bar: 'Senators',
        page: `Senators for ${stateInRunningCopy(seat.state_code)}`,
      }
    : { bar: 'Members', page: `Members for ${seat.name}` };
}

/**
 * The members of a multi-member seat: a state's senators or a Victorian
 * Council region's members. Family name, A to Z; no party grouping.
 */
export default function Members() {
  const { seat: id } = useLocalSearchParams<{ seat: string }>();
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [failed, setFailed] = useState<'missing' | 'error' | null>(null);
  const [attempt, setAttempt] = useState(0);
  const titleRef = useRef<View>(null);
  const titles = loaded ? membersTitle(loaded.seat) : null;
  const title = useTitleOnScroll(titleRef, titles?.bar);
  useEffect(() => {
    let active = true;
    (async () => {
      const directory = await catalogs.directory();
      const seat = directory.electorates.data.electorates.find(
        (s) => s.electorate_id === id || s.slug === id,
      );
      if (!seat) return null;
      return { directory, seat, since: {} as Record<string, string> };
    })()
      .then((value) => {
        if (!active) return;
        if (!value) setFailed('missing');
        else {
          setLoaded(value);
          setFailed(null);
          // Start dates are optional detail: the list draws without them.
          catalogs
            .electorateFor(value.seat.detail_url)
            .then((file) => {
              if (!active) return;
              const since: Record<string, string> = {};
              for (const t of file.data.terms)
                if (
                  t.start &&
                  t.start_precision === 'day' &&
                  (t.end === null || t.end_precision === 'open')
                )
                  since[t.person_id] = t.start;
              setLoaded((v) => (v ? { ...v, since } : v));
            })
            .catch(() => undefined);
        }
      })
      .catch(() => {
        if (active) setFailed('error');
      });
    return () => {
      active = false;
    };
  }, [id, attempt]);
  if (failed === 'error')
    return (
      <Screen testID="members-screen">
        <ContentUnavailable
          symbol="exclamationmark.triangle"
          title="These members couldn’t be loaded."
          action={{
            label: 'Try again',
            onPress: () => {
              setFailed(null);
              setAttempt((n) => n + 1);
            },
          }}
        />
      </Screen>
    );
  // An old link or a removed seat: say so, never load for good.
  if (failed === 'missing')
    return (
      <Screen testID="members-screen">
        <ContentUnavailable
          symbol="exclamationmark.triangle"
          title="These members couldn’t be found."
          testID="members-missing"
        />
      </Screen>
    );
  if (!loaded)
    return (
      <Screen testID="members-screen">
        <Skeleton shape="people" count={6} label="Loading members" />
      </Screen>
    );
  const { seat, directory, since } = loaded;
  const rows = [...seat.representatives].sort(
    byFamilyName((r) => r.person.name),
  );
  const region = isRegion(seat);
  const victoria = seat.jurisdiction === 'vic';
  return (
    <Screen
      testID="members-screen"
      onScroll={title.onScroll}
      offline={
        directory.electorates.stale
          ? { savedAt: directory.electorates.savedAt }
          : null
      }
    >
      <Group gap={rhythm.line}>
        <View ref={titleRef} onLayout={title.onTitleLayout}>
          <Heading level={1} kind="page" testID="members-title">
            {titles!.page}
          </Heading>
        </View>
        {region ? (
          <Text variant="secondary">
            {victoria ? 'Legislative Council, Victoria' : 'Legislative Council'}
          </Text>
        ) : null}
      </Group>
      {rows.length ? (
        <InsetGroup>
          {rows.map((r) => {
            const profile = representativeProfile(r.person_id, directory);
            return (
              <PersonRow
                key={r.person_id}
                name={r.person.name}
                portrait={
                  <CachedPortrait name={r.person.name} slug={profile?.slug} />
                }
                party={profile?.party ?? r.party}
                partyStatus={profile?.partyStatus ?? 'current'}
                detail={
                  since[r.person_id]
                    ? `Since ${formatDate(since[r.person_id]!, 'short')}`
                    : null
                }
                href={profile ? personRoute(profile.slug) : undefined}
                testID={`members-${profile?.slug ?? r.person_id}`}
                testDrawnName
              />
            );
          })}
        </InsetGroup>
      ) : (
        <ContentUnavailable
          symbol="person.3"
          title={`No confirmed members for ${seat.chamber === 'senate' ? stateInRunningCopy(seat.state_code) : seat.name} yet.`}
        />
      )}
      <SourceLine
        asOf={seat.representation_as_of}
        citation={victoria ? 'Parliament of Victoria' : 'OpenAustralia'}
        originals={[{ label: seat.name, url: seat.url }]}
        savedAt={
          directory.electorates.stale ? directory.electorates.savedAt : null
        }
        testID="members-source"
      />
      {victoria ? <PageFoot variant="authorised" /> : null}
    </Screen>
  );
}
