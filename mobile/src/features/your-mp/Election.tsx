import { useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { View } from 'react-native';
import { formatDate } from '../../design/format';
import {
  ContentUnavailable,
  Group,
  Heading,
  InsetGroup,
  PersonRow,
  Screen,
  Skeleton,
  StatusCapsule,
  Text,
  ValueRow,
  copy,
} from '../../design/primitives';
import { rhythm } from '../../design/tokens';
import { personRoute } from '../../navigation/routes';
import { CachedPortrait } from '../CachedPortrait';
import { loadElectorate, type LoadedElectorate } from '../Electorate';
import { BlockSource } from './Evidence';
import { candidateRows, electionTitle } from './election-summary';
import { representativeProfile } from './model';

/**
 * One election: its candidates by first preferences, highest first, with
 * each count's share computed here from the file's counts.
 */
export default function Election() {
  const { seat, key } = useLocalSearchParams<{ seat: string; key: string }>();
  return (
    <ElectionScreen key={`${seat}:${key}`} seat={seat} electionKey={key} />
  );
}

export function ElectionScreen({
  seat,
  electionKey,
}: {
  seat: string;
  electionKey: string;
}) {
  const [loaded, setLoaded] = useState<LoadedElectorate | null>(null);
  const [failed, setFailed] = useState<{ offline: boolean } | null>(null);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let active = true;
    loadElectorate(seat)
      .then((value) => {
        if (active) {
          setLoaded(value);
          setFailed(null);
        }
      })
      .catch((error: { code?: string }) => {
        if (active)
          setFailed({
            offline: error?.code === 'offline' || error?.code === 'timeout',
          });
      });
    return () => {
      active = false;
    };
  }, [seat, attempt]);
  const identity = loaded?.view.identity.data;
  const block = loaded?.view.elections.find(
    (b) => b.data?.election_id === electionKey,
  );
  const record = block?.data ?? null;
  const title =
    record && identity
      ? electionTitle(record.election, identity.jurisdiction)
      : undefined;
  return (
    <Screen
      testID="election-screen"
      barTitle={title}
      offline={block?.stale ? { savedAt: block.savedAt } : null}
    >
      {failed ? (
        <ContentUnavailable
          symbol={failed.offline ? 'wifi.slash' : 'exclamationmark.triangle'}
          title={
            failed.offline ? copy.notSaved : 'This election couldn’t be loaded.'
          }
          body={failed.offline ? copy.notSavedBody : undefined}
          action={
            failed.offline
              ? undefined
              : {
                  label: copy.tryAgain,
                  onPress: () => setAttempt((n) => n + 1),
                }
          }
          testID="election-error"
        />
      ) : !loaded ? (
        <Skeleton shape="people" count={6} label="Loading the election" />
      ) : !record || !identity || !block ? (
        <ContentUnavailable
          symbol="exclamationmark.triangle"
          title="This election couldn’t be found."
          testID="election-missing"
        />
      ) : (
        <>
          <Group gap={rhythm.line}>
            <Heading level={1} kind="page" testID="election-title">
              {title}
            </Heading>
            <Text wordSafe variant="secondary">
              {`${identity.name}, ${formatDate(record.election.poll_date, 'short')}`}
            </Text>
          </Group>
          <InsetGroup>
            {candidateRows(record).map((c, i) => {
              const profile = c.personId
                ? representativeProfile(c.personId, loaded.directory)
                : null;
              return (
                <View
                  key={`${c.name}-${i}`}
                  testID={`election-candidate-${i}`}
                  style={{ gap: rhythm.line }}
                >
                  <PersonRow
                    name={c.name}
                    // A roster parliamentarian's portrait and profile; anyone
                    // else is plain text with a blank circle.
                    portrait={
                      profile ? (
                        <CachedPortrait name={c.name} slug={profile.slug} />
                      ) : undefined
                    }
                    party={c.party ?? 'Independent'}
                    partyStatus="unknown"
                    href={profile ? personRoute(profile.slug) : undefined}
                    menu={profile ? 'person' : []}
                    testID={`election-candidate-${i}-person`}
                  />
                  {c.elected ? (
                    <View style={{ alignItems: 'flex-start' }}>
                      <StatusCapsule
                        status="Elected"
                        testID={`election-candidate-${i}-elected`}
                      />
                    </View>
                  ) : null}
                  {c.first ? (
                    <ValueRow label="First preferences" value={c.first} />
                  ) : null}
                  {c.after ? (
                    <ValueRow label="After preferences" value={c.after} />
                  ) : null}
                </View>
              );
            })}
          </InsetGroup>
          <BlockSource
            block={block}
            title="About this election"
            notes={[
              'Candidates are ordered by first preferences, highest first.',
              'Percentages are shares of the formal votes in each count, worked out from the published counts.',
            ]}
            testID="election-source"
          />
        </>
      )}
    </Screen>
  );
}
