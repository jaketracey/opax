import { useEffect, useState } from 'react';
import { Stack, useLocalSearchParams } from 'expo-router';
import { catalogs } from '../api/runtime';
import type { PersonProfile } from '../api/catalogs';
import type { RecordResult } from '../api/client';
import {
  AsAtLine,
  ErrorState,
  Group,
  Heading,
  LoadingState,
  OfflineBanner,
  OpaxWebLink,
  PartyLabel,
  Portrait,
  Screen,
  Section,
  SourceLink,
  StaleNotice,
  Text,
  errorMessage,
} from '../design/primitives';
import { CHAMBER_NOT_RECORDED, chamberName } from '../design/parliament';
import { shareHeaderItem } from '../navigation/share';
export default function Person() {
  const { slug } = useLocalSearchParams<{ slug: string }>();
  const [record, setRecord] = useState<RecordResult<PersonProfile> | null>(
    null,
  );
  const [error, setError] = useState<string | null>(null);
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    let active = true;
    catalogs
      .person(slug)
      .then((data) => {
        if (active) {
          setRecord(data);
          setError(null);
        }
      })
      .catch((error) => {
        if (active) setError(errorMessage(error));
      });
    return () => {
      active = false;
    };
  }, [slug, retry]);
  const profile = record?.data;
  const source = profile?.sources.find(
    (source) =>
      /parliamentary|roster|service/i.test(source.label) &&
      !source.url.includes('/subject/'),
  );
  const webPath = `/subject/person/${profile?.slug ?? slug}`;
  return (
    <>
      <Stack.Screen
        options={{
          // The name is the page's level 1 heading, so the bar does not repeat
          // it; `title` still names the screen for the back stack.
          title: profile?.name ?? '',
          headerTitle: '',
          unstable_headerRightItems: profile
            ? () => [shareHeaderItem({ path: webPath, title: profile.name })]
            : undefined,
        }}
      />
      <Screen testID={profile ? 'person-screen' : 'person-pending-screen'}>
        {error ? (
          <ErrorState
            message={error}
            onRetry={() => setRetry((value) => value + 1)}
            testID="person-error"
          />
        ) : null}
        {!profile && !error ? (
          <LoadingState
            shape="people"
            count={1}
            label="Loading the public directory"
            testID="person-loading"
          />
        ) : null}
        {profile ? (
          <Group>
            {record?.stale ? <OfflineBanner testID="person-offline" /> : null}
            <Portrait size="profile" />
            <Heading level={1} testID="person-screen-title">
              {profile.name}
            </Heading>
            <PartyLabel
              party={profile.party}
              current={profile.partyCurrent}
              formerly={profile.formerly}
              testID="person-party"
            />
          </Group>
        ) : null}
        {profile ? (
          <Section title="Recorded representation">
            {profile.seats.length ? (
              profile.seats.map((seat) => (
                <Group key={seat.electorate_id} gap={4}>
                  <Text variant="strong" testID="person-electorate">
                    {seat.name}
                  </Text>
                  <Text variant="metadata" testID="person-chamber">
                    {chamberName(seat.chamber, seat.jurisdiction) ??
                      CHAMBER_NOT_RECORDED}
                  </Text>
                  <AsAtLine
                    asOf={seat.as_of}
                    citation={profile.sources.map((item) => item.label)}
                  />
                </Group>
              ))
            ) : (
              <Text>
                No current electorate observation is held in this release.
              </Text>
            )}
            <Text variant="fine">
              These are dated public records. Representation may have changed
              since collection.
            </Text>
            {record?.stale ? <StaleNotice savedAt={record.savedAt} /> : null}
            {source ? (
              <SourceLink
                citation={source.label}
                url={source.url}
                kind="record"
                testID="person-source"
              />
            ) : (
              <Text variant="fine">
                No original source link is held for this person.
              </Text>
            )}
          </Section>
        ) : null}
        {profile ? (
          <Section>
            <Text>
              The full profile is not built yet. Voting records, interests and
              pay will follow in later work.
            </Text>
            <OpaxWebLink
              label="Speeches, topics and mentions"
              path={webPath}
              testID="person-web"
            />
          </Section>
        ) : null}
      </Screen>
    </>
  );
}
