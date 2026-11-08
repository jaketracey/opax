import { Fragment, useRef } from 'react';
import { Stack } from 'expo-router';
import { Platform, RefreshControl, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { EditionView } from '../../api/selectors';
import { Card } from '../../design/card';
import { BarSeries, StageTimeline, VoteSplit } from '../../design/charts';
import { Button } from '../../design/controls';
import { MachinePill } from '../../design/labels';
import { InsetGroup, Screen } from '../../design/layout';
import { BillRow, LinkRow } from '../../design/rows';
import { PersonRow } from '../../design/people';
import { FigureBlock } from '../../design/record';
import { SourceLine } from '../../design/source';
import { ContentUnavailable, OfflineLine } from '../../design/states';
import { Text } from '../../design/text';
import { formatDate } from '../../design/format';
import { copy } from '../../design/copy';
import { colors, rhythm } from '../../design/tokens';
import { symbols } from '../../design/symbols';
import { headerItems, pageItems } from '../../navigation/chrome';
import { canShare } from '../../navigation/share';
import { useTitleOnScroll } from '../../navigation/useTitleOnScroll';
import { useOpenAsk } from '../ask/open';
import { CachedPortrait } from '../CachedPortrait';
import { EditionSkeleton } from './EditionCard';
import { Plate } from './Plate';
import { useEdition, useEditionSubject } from './data';
import {
  editionInk,
  editionQuestion,
  editionSources,
  editionSubject,
  editionTopic,
  editionPerson,
} from './model';
import { editionMenu, shareEdition } from './actions';

export function EditionStory() {
  const { block, refreshing, refresh } = useEdition();
  const subject = useEditionSubject(
    block?.status === 'ready' ? block.data : null,
  );
  const edition = subject.edition;
  const titleRef = useRef<View>(null);
  const title = useTitleOnScroll(titleRef, 'Daily edition');
  const openAsk = useOpenAsk();
  const onAsk = () => {
    if (edition) openAsk({ question: editionQuestion(edition) });
  };
  const onShare = () => {
    if (edition) void shareEdition(edition);
  };
  const source = edition
    ? {
        ...editionSources(edition, subject.originals),
        notes:
          block?.stale && block.savedAt != null
            ? [
                copy.savedCopyNote(block.savedAt),
                ...(editionSources(edition).notes ?? []),
              ]
            : editionSources(edition).notes,
        dateLabel:
          block?.stale && block.savedAt != null
            ? `Saved ${formatDate(block.savedAt, 'short')}`
            : undefined,
      }
    : null;
  const destination = edition ? editionSubject(edition, subject.slug) : null;
  const offline =
    block?.error?.code === 'offline' || block?.error?.code === 'timeout';
  return (
    <View style={styles.page}>
      <Stack.Screen
        options={headerItems(
          edition
            ? pageItems({ name: 'Daily edition', menu: editionMenu(edition) })
            : undefined,
        )}
      />
      <Screen
        grouped
        testID="edition-screen"
        onScroll={title.onScroll}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={refresh} />
        }
      >
        {!block || block.status === 'loading' ? (
          <EditionSkeleton story />
        ) : block.status === 'missing' ? (
          <ContentUnavailable
            symbol="newspaper"
            title="No daily edition yet"
            body="The next one appears here when it is published."
            testID="edition-missing"
          />
        ) : block.status !== 'ready' || !edition || !source ? (
          <ContentUnavailable
            symbol={offline ? 'wifi.slash' : 'exclamationmark.triangle'}
            title={
              offline ? copy.notSaved : "The daily edition couldn't be loaded."
            }
            body={offline ? copy.notSavedBody : undefined}
            action={{ label: 'Try again', onPress: refresh }}
            testID="edition-error"
          />
        ) : (
          <>
            <View style={styles.reading}>
              <Plate
                edition={edition}
                story
                testID="edition-plate"
                titleRef={titleRef}
                onTitleLayout={title.onTitleLayout}
              />
              {block.stale ? (
                <OfflineLine savedAt={block.savedAt} testID="edition-offline" />
              ) : null}
              <View style={styles.prose}>
                {edition.machineWritten ? (
                  <MachinePill
                    note={{
                      title: 'Machine-written',
                      body: [edition.machineWritten.attribution],
                    }}
                    testID="edition-machine"
                  />
                ) : null}
                {edition.paragraphs.map((paragraph, i) => (
                  <Text
                    key={i}
                    wordSafe
                    variant="body"
                    testID={`edition-paragraph-${i}`}
                  >
                    {paragraph}
                  </Text>
                ))}
              </View>
            </View>
            <EditionFacts edition={edition} provenance={source} />
            {destination ? (
              <InsetGroup testID="edition-subject-group">
                {edition.kind === 'bill' ? (
                  <BillRow
                    billKey={/^\/bill\/([^/?]+)/.exec(edition.path)![1]!}
                    title={edition.shortTitle ?? edition.title}
                    href={destination}
                    status=""
                    showStatus={false}
                    menu={[]}
                    testID="edition-subject"
                  />
                ) : edition.kind === 'politician' ? (
                  <PersonRow
                    name={edition.title}
                    {...editionPerson(edition)}
                    href={destination}
                    portrait={
                      <CachedPortrait
                        name={edition.title}
                        slug={subject.slug}
                      />
                    }
                    menu={[]}
                    testID="edition-subject"
                  />
                ) : (
                  <LinkRow
                    title={
                      edition.kind === 'largest'
                        ? 'Largest grants'
                        : edition.kind === 'topic'
                          ? editionTopic(edition)!.name
                          : edition.title
                    }
                    symbol={
                      edition.kind === 'topic' ? symbols.topic : symbols.money
                    }
                    href={destination}
                    value={
                      edition.kind === 'grant'
                        ? edition.facts.figures[0]?.value
                        : undefined
                    }
                    valueEmphasis={edition.kind === 'grant'}
                    testID="edition-subject"
                  />
                )}
              </InsetGroup>
            ) : null}
            {edition.sourceRows.length ? (
              <InsetGroup header="Sources" testID="edition-source-rows">
                {edition.sourceRows.map((row, i) => {
                  const original = subject.originals?.find((item) =>
                    row
                      .toLocaleLowerCase('en-AU')
                      .startsWith(item.label.toLocaleLowerCase('en-AU')),
                  );
                  return original ? (
                    <LinkRow
                      key={i}
                      title={row}
                      detail={
                        original.asOf
                          ? formatDate(original.asOf, 'short')
                          : undefined
                      }
                      external={{ url: original.url, label: original.label }}
                      testID={`edition-source-${i}`}
                    />
                  ) : (
                    <Text
                      key={i}
                      wordSafe
                      variant="body"
                      testID={`edition-source-${i}`}
                    >
                      {row}
                    </Text>
                  );
                })}
              </InsetGroup>
            ) : null}
            <SourceLine {...source} testID="edition-sources" />
          </>
        )}
      </Screen>
      {edition && block?.status === 'ready' ? (
        Platform.OS === 'ios' ? (
          <Stack.Toolbar placement="bottom">
            <Stack.Toolbar.Button
              icon="text.bubble"
              accessibilityLabel="Ask about this"
              onPress={onAsk}
            >
              Ask about this
            </Stack.Toolbar.Button>
            <Stack.Toolbar.Spacer />
            {canShare ? (
              <Stack.Toolbar.Button
                icon="square.and.arrow.up"
                accessibilityLabel="Share"
                onPress={onShare}
              >
                Share
              </Stack.Toolbar.Button>
            ) : null}
          </Stack.Toolbar>
        ) : (
          <SafeAreaView
            edges={['bottom']}
            style={styles.toolbar}
            testID="edition-toolbar"
          >
            <Button
              label="Ask about this"
              onPress={onAsk}
              testID="edition-ask"
            />
            {canShare ? (
              <Button label="Share" onPress={onShare} testID="edition-share" />
            ) : null}
          </SafeAreaView>
        )
      ) : null}
    </View>
  );
}

function EditionFacts({
  edition,
  provenance: source,
}: {
  edition: EditionView;
  provenance: ReturnType<typeof editionSources>;
}) {
  const { figures, bars, events, division } = edition.facts;
  const provenance = {
    dateRange: { start: edition.date, end: edition.date },
    source: 'OPAX daily edition',
  };
  const order = edition.facts.order ?? [
    ...figures.map((_, index) => ({ type: 'figure' as const, index })),
    ...(bars ? [{ type: 'bars' as const, index: 0 }] : []),
    ...(events.length ? [{ type: 'events' as const, index: 0 }] : []),
    ...(division ? [{ type: 'division' as const, index: 0 }] : []),
  ];
  return (
    <Fragment>
      {order.map((fact, index) => {
        const id = `edition-fact-${index}`;
        if (fact.type === 'figure') {
          const figure = figures[fact.index];
          if (!figure) return null;
          const figureProps = {
            ...figure,
            ink: editionInk(edition),
            source: {
              ...source,
              asOf: edition.date,
              citation: 'OPAX daily edition',
              testID: `${id}-sources`,
            },
            testID: id,
          };
          return (
            <Card key={id}>
              <FigureBlock {...figureProps} />
            </Card>
          );
        }
        return (
          <View key={id} testID={id} style={styles.fact}>
            {fact.type === 'bars' && bars ? (
              <>
                <Text wordSafe variant="subsectionTitle">
                  {bars.title}
                </Text>
                <BarSeries
                  data={bars.items.map((bar) => ({
                    label: bar.label,
                    value: bar.pct,
                  }))}
                  ink={editionInk(edition)}
                  format={(value) => `${value}%`}
                  tableTitle={bars.title}
                  values="all"
                  {...provenance}
                />
                {bars.note ? (
                  <Text wordSafe variant="footnote">
                    {bars.note}
                  </Text>
                ) : null}
              </>
            ) : fact.type === 'events' ? (
              <StageTimeline
                stages={events.map((event) => ({
                  label: event.text,
                  date: event.date,
                }))}
                latestIndex={events.length - 1}
                {...provenance}
              />
            ) : division ? (
              <VoteSplit {...division} countsStyle="votes" {...provenance} />
            ) : null}
            <SourceLine {...source} testID={`${id}-sources`} />
          </View>
        );
      })}
    </Fragment>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: colors.sunken },
  reading: { gap: 16 },
  prose: { gap: 12 },
  fact: { gap: rhythm.heading },
  toolbar: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    gap: 12,
    paddingHorizontal: 20,
    paddingTop: 8,
    backgroundColor: colors.raised,
  },
});

export default EditionStory;
