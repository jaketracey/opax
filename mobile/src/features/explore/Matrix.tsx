import { counted } from '../../design/format';
import { router } from 'expo-router';
import { View } from 'react-native';
import { reports } from '../../api/runtime';
import { useRead } from '../../api/useRead';
import {
  Button,
  Group,
  LinkRow,
  Screen,
  Section,
  Text,
} from '../../design/primitives';
import { rhythm } from '../../design/tokens';
import { topicRoute } from '../../navigation/routes/search';
import { topicNames } from '../reports/model';
import { openRecord } from '../reports/open';
import { ReadState } from '../reports/parts';
import { MATRIX_NOTE } from './model';
import { ExploreChrome } from './parts';
export default function Matrix() {
  const read = useRead(reports.matrix);
  return (
    <>
      <ExploreChrome title="Debates" game="matrix" />
      <Screen column="wide" testID="explore-matrix-screen">
        <Section>
          <Text wordSafe variant="body">
            Each party’s share of a debate’s labelled speeches
          </Text>
        </Section>
        <ReadState
          read={read}
          citation="OPAX topic and party labels"
          sheet={{
            title: 'How to read this grid',
            coverage: 'Shares of each topic’s labelled speeches',
            notes: [MATRIX_NOTE],
          }}
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
                      title={`${counted(data.totals[slug] ?? 0, 'labelled speech', 'labelled speeches')}`}
                      onPress={() =>
                        router.push(topicRoute(slug, {}, topicNames[slug]!))
                      }
                    />
                    <View
                      style={{
                        flexDirection: 'row',
                        flexWrap: 'wrap',
                        gap: rhythm.tight,
                      }}
                    >
                      {data.parties.map((party, j) => {
                        const count = data.cells[slug]?.[party] ?? 0,
                          total = data.totals[slug] ?? 0,
                          pct = total ? (count / total) * 100 : 0,
                          percentage = `${pct > 0 && pct < 1 ? '<1' : Math.round(pct)}%`,
                          label = `${party}\u00a0·\u00a0${percentage}`;
                        return (
                          <View key={party} style={{ maxWidth: '100%' }}>
                            {party === 'Other' || !count ? (
                              <Text wordSafe variant="secondary">
                                {party}: {count ? percentage : 'none yet'}
                              </Text>
                            ) : (
                              <Button
                                label={label}
                                accessibilityLabel={label.replace(
                                  /\u00a0/g,
                                  ' ',
                                )}
                                accessibilityHint={`${count.toLocaleString('en-AU')} of ${total.toLocaleString('en-AU')} labelled ${topicNames[slug]} speeches. Opens the topic.`}
                                onPress={() =>
                                  router.push(
                                    topicRoute(
                                      slug,
                                      { party },
                                      topicNames[slug]!,
                                    ),
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
                <Text wordSafe variant="secondary">
                  {`${counted(data.labelled, 'speech', 'speeches')} ${data.labelled === 1 ? 'carries' : 'carry'} topic labels so far`}
                </Text>
                {rows}
                <LinkRow
                  title="Parties"
                  onPress={() => openRecord('/subject/party', 'Parties')}
                />
              </Group>
            );
          }}
        </ReadState>
      </Screen>
    </>
  );
}
