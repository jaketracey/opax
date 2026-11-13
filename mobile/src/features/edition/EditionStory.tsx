import { RouteOptions } from '../../navigation/preview';

import { useRef } from 'react';
import { RefreshControl, StyleSheet, View } from 'react-native';
import type { EditionView } from '../../api/selectors';
import { Card } from '../../design/card';
import {
  isPartOfWhole,
  ShareBar,
  ShareRows,
  StageTimeline,
  VoteSplit,
} from '../../design/charts';
import { copy } from '../../design/copy';
import { designFlags } from '../../design/flags';
import { formatDate } from '../../design/format';
import { MachinePill } from '../../design/labels';
import { InsetGroup, Screen } from '../../design/layout';
import { PersonRow } from '../../design/people';
import { FigureBlock } from '../../design/record';
import { RowOpenListener } from '../../design/row-link';
import { LinkRow, ValueRow } from '../../design/rows';
import { SourceLine, SourceSection } from '../../design/source';
import { ContentUnavailable, OfflineLine } from '../../design/states';
import { symbols } from '../../design/symbols';
import { Text } from '../../design/text';
import { colors, rhythm } from '../../design/tokens';
import { headerItems, pageItems } from '../../navigation/chrome';
import { useTitleOnScroll } from '../../navigation/useTitleOnScroll';
import { useOpenAsk } from '../ask/open';
import { CachedPortrait } from '../CachedPortrait';
import { editionMenu, shareEdition } from './actions';
import { useEdition, useEditionSubject } from './data';
import { EditionSkeleton } from './EditionCard';
import { trackEdition, useEditionEnd, useEditionOpen } from './measure';
import {
  editionInk,
  editionPerson,
  editionQuestion,
  editionSourceRows,
  editionSources,
  editionSubject,
  editionTopic,
  storyParagraphs,
  timelineProvenance,
} from './model';
import { Plate } from './Plate';

/** The story's subject opened (`story_open`); the row opens it as usual. */
const openStory = () => trackEdition('story_open');

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
    if (edition)
      openAsk({ question: editionQuestion(edition) }, 'Daily edition');
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
  useEditionOpen(edition ? `${edition.date}:${edition.title}` : null);
  const end = useEditionEnd();
  const sourceRows = edition
    ? editionSourceRows(edition, subject.originals)
    : [];
  // A figure card or a bars chart carries the edition's SourceLine; the
  // foot repeats it only when none has.
  const figureLines =
    (!!edition?.facts.figures.length &&
      (edition.facts.order?.some((fact) => fact.type === 'figure') ?? true)) ||
    (!!edition?.facts.bars &&
      (edition.facts.order?.some((fact) => fact.type === 'bars') ?? true));
  const prose = edition ? storyParagraphs(edition) : [];
  const affects = edition?.facts.affects ?? null;
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
      <RouteOptions
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
        onScroll={(y) => {
          title.onScroll(y);
          end.onScroll(y);
        }}
        onLayout={end.onLayout}
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
                shownBelow={prose}
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
                {prose.map((paragraph, i) => (
                  <Text
                    key={i}
                    wordSafe
                    variant="body"
                    testID={`edition-paragraph-${i}`}
                  >
                    {paragraph}
                  </Text>
                ))}
                {affects ? (
                  // The "Who it touches" slide, in the story's type: the
                  // slide's own line under a plain heading.
                  <View style={styles.affects} testID="edition-affects">
                    <Text
                      wordSafe
                      variant="subsectionTitle"
                      accessibilityRole="header"
                    >
                      Who it affects
                    </Text>
                    <Text wordSafe variant="body" testID="edition-affects-text">
                      {/[.!?]$/.test(affects) ? affects : `${affects}.`}
                    </Text>
                  </View>
                ) : null}
              </View>
            </View>
            <EditionFacts edition={edition} provenance={source} />
            {destination ? (
              <RowOpenListener.Provider value={openStory}>
                <InsetGroup testID="edition-subject-group">
                  {edition.kind === 'bill' ? (
                    // The bill's title in the row's serif, held to three
                    // lines at every size: the plate above already prints
                    // it in full (sweep 2, item 7.2). VoiceOver reads it
                    // whole.
                    <LinkRow
                      title={edition.shortTitle ?? edition.title}
                      titleRole="rowRecord"
                      titleLines={3}
                      titleTestID="edition-subject-title"
                      href={destination}
                      menu={[]}
                      accessibilityLabel={edition.shortTitle ?? edition.title}
                      accessibilityHint="Opens the bill"
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
              </RowOpenListener.Provider>
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
            {/* One sources affordance (sweep 2, item 7.4): the Sources
                group lists the originals, so the foot's line is drawn only
                when there is no group and no card or chart carries one. */}
            {figureLines || sourceRows.length ? null : (
              <SourceLine {...source} testID="edition-sources" />
            )}
            <View onLayout={end.onEndLayout} testID="edition-end" />
          </>
        )}
      </Screen>
    </View>
  );
}

/**
 * Whether a bars slide is parts of one whole, drawn as one split bar. The
 * composer says so (`whole: true`) and leaves the field off otherwise. It
 * never makes a member's topic labels (a speech can carry several) or a
 * topic's speakers (scaled to the first) a whole, so those kinds keep the 0
 * to 100% scale without it. Any other slide without the field predates it
 * and is guessed from its numbers.
 */
function barsAreWhole(
  kind: EditionView['kind'],
  bars: NonNullable<EditionView['facts']['bars']>,
): boolean {
  if (typeof bars.whole === 'boolean') return bars.whole;
  if (kind === 'politician' || kind === 'topic') return false;
  return isPartOfWhole(bars.items.map((bar) => bar.pct));
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
    citation: 'OPAX daily edition',
  };
  // One sheet for every line here (figures and charts alike), so the line
  // the section keeps always opens the full sources.
  const sheet = {
    ...source,
    asOf: edition.date,
    citation: 'OPAX daily edition',
  };
  const order = edition.facts.order ?? [
    ...figures.map((_, index) => ({ type: 'figure' as const, index })),
    ...(bars ? [{ type: 'bars' as const, index: 0 }] : []),
    ...(events.length ? [{ type: 'events' as const, index: 0 }] : []),
    ...(division ? [{ type: 'division' as const, index: 0 }] : []),
  ];
  // Every card and chart here carries the edition's source line; the
  // section shows it once, under the first.
  return (
    <SourceSection>
      {order.map((fact, index) => {
        const id = `edition-fact-${index}`;
        if (fact.type === 'figure') {
          const figure = figures[fact.index];
          if (!figure) return null;
          const figureProps = {
            ...figure,
            ink: editionInk(edition),
            citation: { ...sheet, testID: `${id}-sources` },
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
                <Text
                  wordSafe
                  variant="subsectionTitle"
                  accessibilityRole="header"
                  testID={`${id}-title`}
                >
                  {bars.title}
                </Text>
                {/* Bars slides are shares: parts of one whole read as one
                    bar; overlapping shares as labelled rows, scaled to the
                    largest (sweep 2, item 7.5). */}
                {barsAreWhole(edition.kind, bars) ? (
                  <ShareBar
                    parts={bars.items.map((bar) => ({
                      label: bar.label,
                      value: bar.pct,
                    }))}
                    ink={editionInk(edition)}
                    format={(value) => `${value}%`}
                    testID={`${id}-share`}
                    sourceLine={
                      <SourceLine {...sheet} testID={`${id}-sources`} />
                    }
                    {...provenance}
                  />
                ) : (
                  <ShareRows
                    items={bars.items.map((bar) => ({
                      label: bar.label,
                      value: bar.pct,
                    }))}
                    ink={editionInk(edition)}
                    format={(value) => `${value}%`}
                    testID={`${id}-rows`}
                    sourceLine={
                      <SourceLine {...sheet} testID={`${id}-sources`} />
                    }
                  />
                )}
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
                // No date-range caption: the stages' own dates sit directly
                // above it (sweep 2, item 7.3).
                caption={false}
                {...timelineProvenance(edition)}
              />
            ) : division ? (
              <VoteSplit {...division} countsStyle="votes" {...provenance} />
            ) : null}
          </View>
        );
      })}
    </SourceSection>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1 },
  reading: { gap: 16 },
  prose: { gap: 12 },
  affects: { gap: rhythm.heading },
  fact: { gap: rhythm.heading },
});

export default EditionStory;
