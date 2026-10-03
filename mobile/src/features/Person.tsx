import { useEffect, useState } from 'react';
import { Alert, Linking } from 'react-native';
import { useLocalSearchParams, router } from 'expo-router';
import { catalogs, isE2E } from '../api/runtime';
import type { PersonProfile } from '../api/catalogs';
import type { RecordResult } from '../api/client';
import {
  Button,
  Divider,
  Group,
  PartyLabel,
  Screen,
  Text,
} from '../design/primitives';
import { date } from './Search';
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
        if (active)
          setError(
            error instanceof Error
              ? error.message
              : 'The profile could not be loaded. Try again.',
          );
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
  function openSource() {
    if (!source) return;
    // E2E never opens a browser/network host. The local sheet still exposes the real source URL.
    if (isE2E) {
      Alert.alert('Source record', `${source.label}\n${source.url}`);
      return;
    }
    Linking.openURL(source.url).catch(() =>
      Alert.alert('Source record', 'The source link could not be opened.'),
    );
  }
  return (
    <Screen
      title={profile?.name ?? 'Person'}
      testID={profile ? 'person-screen' : 'person-pending-screen'}
    >
      <Button
        label="Back to Search"
        testID="person-back"
        variant="quiet"
        onPress={() => router.back()}
      />
      {error ? (
        <Group>
          <Text accessibilityRole="alert" testID="person-error">
            {error}
          </Text>
          <Button
            label="Try again"
            onPress={() => setRetry((value) => value + 1)}
          />
        </Group>
      ) : null}
      {!profile && !error ? (
        <Text testID="person-loading">Loading the public directory</Text>
      ) : null}
      {profile ? (
        <Group>
          <PartyLabel party={profile.party} testID="person-party" />
          <Divider />
          <Text variant="heading" accessibilityRole="header">
            Recorded representation
          </Text>
          {profile.seats.length ? (
            profile.seats.map((seat) => (
              <Group key={seat.electorate_id}>
                <Text testID="person-electorate">{seat.name}</Text>
                <Text variant="metadata">
                  {seat.chamber === 'representatives'
                    ? 'House of Representatives'
                    : seat.chamber}{' '}
                  · {seat.jurisdiction}
                </Text>
                <Text variant="fine">
                  {seat.as_of
                    ? `As at ${date(seat.as_of)}`
                    : 'Observation date not recorded'}
                </Text>
              </Group>
            ))
          ) : (
            <Text>
              No current electorate observation is held in this release.
            </Text>
          )}
          <Text variant="fine">
            {record?.stale ? `Offline · Saved ${date(record.savedAt)}. ` : ''}
            These are dated public records. Representation may have changed
            since collection.
          </Text>
          {source ? (
            <Group>
              <Text variant="fine">Source: {source.label}</Text>
              <Button
                label="Open source record"
                testID="person-source"
                onPress={openSource}
              />
              <Text variant="fine" selectable>
                {source.url}
              </Text>
            </Group>
          ) : (
            <Text variant="fine">
              No original source link is held for this person.
            </Text>
          )}
          <Divider />
          <Text>
            The full profile is not built yet. Voting records, interests and pay
            will follow in later work.
          </Text>
        </Group>
      ) : null}
    </Screen>
  );
}
