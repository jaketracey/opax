import { Fragment, useRef } from 'react';
import { router, Stack } from 'expo-router';
import { RefreshControl, StyleSheet, View } from 'react-native';
import type { EditionView } from '../../api/selectors';
import { Card } from '../../design/card';
import { BarSeries, StageTimeline, VoteSplit } from '../../design/charts';
import { MachinePill } from '../../design/labels';
import { InsetGroup, Screen } from '../../design/layout';
import { BillRow, LinkRow, ValueRow } from '../../design/rows';
import { PersonRow } from '../../design/people';
import { FigureBlock } from '../../design/record';
import { SourceLine } from '../../design/source';
import { ContentUnavailable, OfflineLine } from '../../design/states';
import { Text } from '../../design/text';
import { formatDate } from '../../design/format';
import { copy } from '../../design/copy';
import { colors, rhythm } from '../../design/tokens';
import { symbols } from '../../design/symbols';
import { designFlags } from '../../design/flags';
import { headerItems, pageItems } from '../../navigation/chrome';
import { useTitleOnScroll } from '../../navigation/useTitleOnScroll';
import { useOpenAsk } from '../ask/open';
import { CachedPortrait } from '../CachedPortrait';
import { EditionSkeleton } from './EditionCard';
import { Plate } from './Plate';
import { useEdition, useEditionSubject } from './data';
import {
  editionInk,
  editionQuestion,
  editionSourceRows,
  editionSources,
  editionSubject,
  editionTopic,
  editionPerson,
  timelineProvenance,
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
  const details = edition ? editionSources(edition, subject.originals) : null;
  const source = details
    ? {
        ...details,
        notes:
          block?.stale && block.savedAt != null
            ? [copy.savedCopyNote(block.savedAt), ...(details.notes ?? [])]
            : details.notes,
        dateLabel:
          block?.stale && block.savedAt != null
            ? `Saved ${formatDate(block.savedAt, 'short')}`
            : undefined,
      }
    : null;
  const destination = edition ? editionSubject(edition, subject.slug) : null;
  // Rows push the subject themselves: a row handed an href goes through
  // RowLink's Link asChild, whose Slot drops a pressed-state style function,
  // so the row lost its layout and its chevron fell under the title.
  const openSubject = destination ? () => router.push(destination) : undefined;
  const sourceRows = edition
    ? editionSourceRows(edition, subject.originals)
    : [];
  // A figure card carries the edition's SourceLine; the foot repeats it
  // only when no figure has.
  const figureLines =
    !!edition?.facts.figures.length &&
    (edition.facts.order?.some((fact) => fact.type === 'figure') ?? true);
  const offline =
    block?.error?.code === 'offline' || block?.error?.code === 'timeout';
  return (
    <View
      style={[
        styles.page,
        {
          backgroundColor: designFlags.groupedSurfaces
            ? colors.sunken
            : colors.paper,
        },
      ]}
    >
      <Stack.Screen
        // Share sits in the bar beside ⋯ (today 6.2): a bottom toolbar is
        // drawn under the floating tab bar on iOS 26, which stays visible
        // on pushes from Today.
        options={headerItems(
          edition
            ? pageItems({
                name: 'Daily edition',
                share: onShare,
                menu: editionMenu(edition),
              })
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
            action={
              offline ? undefined : { label: 'Try again', onPress: refresh }
            }
            testID="edition-error"
          />
        ) : (
          <>
            <View style={styles.reading}>
              <Plate
                edition={edition}
                story
                shownBelow={edition.paragraphs}
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
                    onPress={openSubject}
                    status=""
                    showStatus={false}
                    menu={[]}
                    testID="edition-subject"
                  />
                ) : edition.kind === 'politician' ? (
                  <PersonRow
                    name={edition.title}
                    {...editionPerson(edition)}
                    onPress={openSubject}
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
                    onPress={openSubject}
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
            <InsetGroup testID="edition-ask-group">
              <LinkRow
                title="Ask about this"
                symbol={symbols.ask}
                onPress={onAsk}
                accessibilityHint="Opens Ask with a question drafted"
                testID="edition-ask"
              />
            </InsetGroup>
            {sourceRows.length ? (
              <InsetGroup header="Sources" testID="edition-source-rows">
                {sourceRows.map((row, i) =>
                  row.original ? (
                    <LinkRow
                      key={i}
                      title={row.title}
                      detail={
                        row.date ? formatDate(row.date, 'short') : undefined
                      }
                      external={{
                        url: row.original.url,
                        label: row.original.label,
                      }}
                      testID={`edition-source-${i}`}
                    />
                  ) : (
                    <ValueRow
                      key={i}
                      label={row.title}
                      value={row.date ? formatDate(row.date, 'short') : ''}
                      testID={`edition-source-${i}`}
                    />
                  ),
                )}
              </InsetGroup>
            ) : null}
            {figureLines ? null : (
              <SourceLine {...source} testID="edition-sources" />
            )}
          </>
        )}
      </Screen>
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
                {...timelineProvenance(edition)}
              />
            ) : division ? (
              <VoteSplit {...division} countsStyle="votes" {...provenance} />
            ) : null}
          </View>
        );
      })}
    </Fragment>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1 },
  reading: { gap: 16 },
  prose: { gap: 12 },
  fact: { gap: rhythm.heading },
});

export default EditionStory;
