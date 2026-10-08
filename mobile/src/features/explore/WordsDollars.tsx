import {
  PadGrid,
  Screen,
  Section,
  Group,
  Text,
  LinkRow,
  RowList,
} from '../../design/primitives';
import { reports } from '../../api/runtime';
import { View } from 'react-native';
import { colors } from '../../design/tokens';
import { formatMoney } from '../../design/format';
import { useRead, ReadState } from '../reports/parts';
import { topicNames } from '../reports/model';
import { openTopicWindow } from '../reports/open';
import { WORDS_NOTE, wordsPanel, pairings } from './model';
import { ExploreHeader } from './parts';
export default function WordsDollars() {
  const matrix = useRead(reports.matrix),
    money = useRead(reports.money);
  return (
    <>
      <ExploreHeader title="Words per dollar" game="wd" />
      <Screen column="wide" testID="explore-wd-screen">
        <Section
          title="Words per dollar"
          info={{
            title: 'About money beside words',
            notes: [WORDS_NOTE, money.record?.data.meta.methodology],
          }}
        >
          <Text wordSafe variant="lede">
            Disclosed donations beside the labelled debate
          </Text>
          <Text wordSafe variant="fine">
            Comparison, never causation
          </Text>
        </Section>
        <ReadState
          read={money}
          citation="AEC disclosures via OPAX’s money data"
          testID="wd-money"
        >
          {(donations) => (
            <ReadState
              read={matrix}
              citation="OPAX topic and party labels"
              testID="wd-matrix"
            >
              {(labels) => (
                <Group>
                  <PadGrid>
                    {pairings.map((pair) => {
                      const panel = wordsPanel(pair, labels, donations);
                      const maxMoney = Math.max(
                        1,
                        ...panel.rows.map((row) => row.money),
                      );
                      const maxSpeech = Math.max(
                        1,
                        ...panel.rows.map((row) => row.speeches),
                      );
                      return (
                        <Section
                          key={pair.topic}
                          title={topicNames[pair.topic]}
                        >
                          <RowList>
                            {panel.rows.map((row) => (
                              <Group key={row.party}>
                                <Text variant="strong" wordSafe>
                                  {row.party}
                                </Text>
                                <LinkRow
                                  title={`Money: ${row.money ? formatMoney(row.money) : row.party === 'Independent' ? 'not separated' : 'none disclosed'}`}
                                  onPress={() =>
                                    openTopicWindow(
                                      pair.topic,
                                      {},
                                      topicNames[pair.topic]!,
                                    )
                                  }
                                />
                                <View
                                  aria-hidden
                                  style={{
                                    height: 4,
                                    width: `${(row.money / maxMoney) * 100}%`,
                                    backgroundColor: colors.bronzeInk,
                                  }}
                                />
                                {row.speechKnown ? (
                                  <Group>
                                    <LinkRow
                                      title={`Speech: ${panel.total ? Math.round((row.speeches / panel.total) * 100) : 0}% · ${row.speeches.toLocaleString('en-AU')} labelled speeches`}
                                      onPress={() =>
                                        openTopicWindow(
                                          pair.topic,
                                          { party: row.party },
                                          topicNames[pair.topic]!,
                                        )
                                      }
                                    />
                                    <View
                                      aria-hidden
                                      style={{
                                        height: 4,
                                        width: `${(row.speeches / maxSpeech) * 100}%`,
                                        backgroundColor: colors.ink,
                                      }}
                                    />
                                  </Group>
                                ) : (
                                  <Text wordSafe variant="metadata">
                                    Speech: not separated yet
                                  </Text>
                                )}
                              </Group>
                            ))}
                          </RowList>
                          {panel.total > 0 && panel.total < 200 ? (
                            <Text wordSafe variant="fine">
                              Only {panel.total.toLocaleString('en-AU')}{' '}
                              speeches carry this label so far, so shares are
                              early and will move as the pass runs.
                            </Text>
                          ) : null}
                          {pair.industries.length > 1 ? (
                            <Text wordSafe variant="fine">
                              The donor side combines two AEC industry groups (
                              {pair.industries
                                .map((i) => i.replaceAll('_', ' '))
                                .join(' and ')}
                              ) that both belong to this debate.
                            </Text>
                          ) : null}
                        </Section>
                      );
                    })}
                  </PadGrid>
                </Group>
              )}
            </ReadState>
          )}
        </ReadState>
      </Screen>
    </>
  );
}
