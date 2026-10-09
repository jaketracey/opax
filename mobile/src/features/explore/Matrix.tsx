import { ScrollView, View } from 'react-native';
import { reports } from '../../api/runtime';
import {
  Screen,
  Section,
  Group,
  Text,
  Button,
  LinkRow,
  useAccessibilitySize,
} from '../../design/primitives';
import { colors, rhythm } from '../../design/tokens';
import { topicNames } from '../reports/model';
import { useRead, ReadState } from '../reports/parts';
import { openTopicWindow, openRecord } from '../reports/open';
import { MATRIX_NOTE } from './model';
import { ExploreHeader } from './parts';
export default function Matrix() {
  const read = useRead(reports.matrix),
    ax = useAccessibilitySize();
  return (
    <>
      <ExploreHeader title="Debates" game="matrix" />
      <Screen column="wide" testID="explore-matrix-screen">
        <Section
          title="Who owns which debate"
          info={{ title: 'How to read this grid', notes: [MATRIX_NOTE] }}
        >
          <Text wordSafe variant="body">
            Each party’s share of a debate’s labelled speeches
          </Text>
        </Section>
        <ReadState
          read={read}
          citation="OPAX topic and party labels"
          testID="matrix"
        >
          {(data) => {
            const slugs = Object.keys(topicNames).sort(
              (a, b) =>
                (data.totals[b] ?? 0) - (data.totals[a] ?? 0) ||
                topicNames[a]!.localeCompare(topicNames[b]!),
            );
            const rows = (
              <Group>
                {slugs.map((slug, i) => (
                  <Section key={slug} title={topicNames[slug]}>
                    <LinkRow
                      title={`${(data.totals[slug] ?? 0).toLocaleString('en-AU')} labelled speeches`}
                      onPress={() =>
                        openTopicWindow(slug, {}, topicNames[slug]!)
                      }
                    />
                    <View
                      style={{
                        flexDirection: ax ? 'column' : 'row',
                        gap: rhythm.tight,
                      }}
                    >
                      {data.parties.map((party, j) => {
                        const count = data.cells[slug]?.[party] ?? 0,
                          total = data.totals[slug] ?? 0,
                          pct = total ? (count / total) * 100 : 0,
                          label = `${party} · ${pct > 0 && pct < 1 ? '<1' : Math.round(pct)}%`;
                        return (
                          <View key={party} style={ax ? {} : { width: 160 }}>
                            {party === 'Other' || !count ? (
                              <Text wordSafe variant="metadata">
                                {party}:{' '}
                                {count ? label.split(' · ')[1] : 'none yet'}
                              </Text>
                            ) : (
                              <Button
                                label={label}
                                accessibilityHint={`${count.toLocaleString('en-AU')} of ${total.toLocaleString('en-AU')} labelled ${topicNames[slug]} speeches. Opens the topic.`}
                                onPress={() =>
                                  openTopicWindow(
                                    slug,
                                    { party },
                                    topicNames[slug]!,
                                  )
                                }
                                testID={`matrix-cell-${i}-${j}`}
                              />
                            )}
                          </View>
                        );
                      })}
                    </View>
                  </Section>
                ))}
              </Group>
            );
            return (
              <Group>
                <Text wordSafe variant="metadata">
                  {data.labelled.toLocaleString('en-AU')} speeches carry topic
                  labels so far
                </Text>
                {ax ? (
                  rows
                ) : (
                  <ScrollView
                    horizontal
                    contentContainerStyle={{ paddingBottom: rhythm.block }}
                    accessibilityLabel="Party by topic grid, scroll horizontally"
                  >
                    {rows}
                  </ScrollView>
                )}
                <LinkRow
                  title="Parties"
                  onPress={() => openRecord('/subject/party', 'Parties')}
                />
                <Text
                  variant="fine"
                  tone="inkSoft"
                  style={{ backgroundColor: colors.paper }}
                >
                  Shares of each topic’s labelled speeches
                </Text>
              </Group>
            );
          }}
        </ReadState>
      </Screen>
    </>
  );
}
