import { headerItems } from '../../navigation/chrome';
import { Stack } from 'expo-router';
import { Platform } from 'react-native';
import { AndroidReadingHeader } from '../../navigation/AndroidReadingHeader';
import { reports } from '../../api/runtime';
import {
  Group,
  BigFigure,
  KeyValueList,
  Screen,
  Section,
  Text,
} from '../../design/primitives';
import { shareHeaderItem } from '../../navigation/share';
import { RecordRow } from '../RecordRow';
import { parliamentNames } from './model';
import { ReadState, useRead } from './parts';
import { openRecord } from './open';
const kinds: Readonly<Record<string, string>> = {
  speech: 'Speeches',
  division: 'Recorded divisions',
  bill: 'Bills',
  bill_text: 'Full bill texts',
  press_release: 'Government transcripts and releases',
  legal: 'Legislation',
  grant_invitation: 'Grant invitations',
  grant_award: 'Grant award records',
  election_baseline: 'Election baselines',
  parliamentary_profile: 'Recorded representation',
  research_report: 'Research source notes',
};
export default function Stats() {
  const read = useRead(reports.stats),
    corpus = useRead(reports.corpus);
  return (
    <>
      <Stack.Screen
        options={{
          title: 'Sources & coverage',
          ...(Platform.OS === 'android'
            ? { header: AndroidReadingHeader }
            : {}),
          ...headerItems(() => [
            shareHeaderItem({ path: '/stats', title: 'Sources & coverage' }),
          ]),
        }}
      />
      <Screen testID="stats-screen">
        <ReadState
          read={read}
          citation="OPAX live index counters"
          testID="stats"
        >
          {(data) => (
            <Group>
              <BigFigure
                value={data.resources.toLocaleString()}
                label="documents in the index"
                accent="votes"
                testID="stats-resources"
              />
              <KeyValueList
                items={[
                  {
                    label: 'passages indexed',
                    value: data.paragraphs.toLocaleString(),
                  },
                  {
                    label: 'speeches indexed',
                    value:
                      data.kinds?.speech?.toLocaleString() ??
                      'Live figures are unavailable right now.',
                  },
                ]}
              />
              <Section title="Speeches by parliament" accent="people">
                {data.speeches_by_state ? (
                  <KeyValueList
                    items={Object.entries(data.speeches_by_state).map(
                      ([state, n]) => ({
                        label: parliamentNames[state] ?? state,
                        value: n.toLocaleString(),
                      }),
                    )}
                  />
                ) : (
                  <Text>Live figures are unavailable right now.</Text>
                )}
              </Section>
              <Section title="Documents by kind" accent="bills">
                {data.kinds ? (
                  <KeyValueList
                    items={Object.entries(data.kinds).map(([kind, n]) => ({
                      label: kinds[kind] ?? kind,
                      value: n.toLocaleString(),
                    }))}
                  />
                ) : (
                  <Text>Live figures are unavailable right now.</Text>
                )}
              </Section>
            </Group>
          )}
        </ReadState>
        <ReadState
          read={corpus}
          citation="OPAX corpus manifest"
          testID="stats-corpus"
        >
          {(data) => (
            <Section title="Collection coverage" accent="votes">
              <KeyValueList
                items={data.sources.map((s) => ({
                  label: s.name,
                  value: `${s.docs.toLocaleString()} · ${s.coverage}`,
                }))}
              />
              <Text variant="fine">Corpus version {data.version}.</Text>
            </Section>
          )}
        </ReadState>
        <RecordRow
          title="Methods"
          onPress={() => openRecord('/methods', 'Methods')}
          testID="stats-methods"
        />
      </Screen>
    </>
  );
}
