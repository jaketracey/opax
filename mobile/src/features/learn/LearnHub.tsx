import { router } from 'expo-router';
import { useEffect } from 'react';
import type { SFSymbol } from '../../design/icon';
import { InsetGroup, Screen } from '../../design/layout';
import { LinkRow } from '../../design/rows';
import { Heading, Text } from '../../design/text';
import { RouteOptions } from '../../navigation/preview';
import { chapterPlaceWords, learnCopy } from './copy';
import { learnChapters } from './glossary';
import { chapterProgress, useLearnPlaces } from './place';
import { glossaryRoute, learnChapterRoute, minuteRoute } from './routes';
import { hideLearnCard } from './settings';

/** One symbol per chapter, each with an Android equivalent. */
export const chapterSymbols: Record<string, SFSymbol> = {
  'whos-who': 'person.3',
  'bill-to-act': 'doc.text',
  'how-votes-work': 'checkmark.square',
  'watching-parliament': 'captions.bubble',
  'money-and-interests': 'australiandollarsign.circle',
  elections: 'list.clipboard',
  'federal-and-state': 'building.columns',
};

/**
 * `/learn`: "How Parliament works" (README 8.1). The guide's chapters in its
 * own order, each with its one-line summary, then the A to Z glossary and
 * "Parliament in a minute". A plain list, not a course: nothing to finish,
 * nothing locked. Opening it retires the Home card for good.
 *
 * The hub keeps the reader's place (place.ts, on the device only): a
 * chapter left part-way says where ("4 of 23") and opens there, and one
 * read to its last idea says "Read" and opens at its start.
 */
export default function LearnHub() {
  useEffect(() => {
    void hideLearnCard().catch(() => undefined);
  }, []);
  const places = useLearnPlaces();
  return (
    <>
      <RouteOptions options={{ title: learnCopy.name }} />
      <Screen grouped barTitle={learnCopy.name} testID="learn-hub">
        <Heading level={1} kind="page">
          {learnCopy.name}
        </Heading>
        <Text wordSafe variant="body" tone="inkSoft">
          {learnCopy.lead}
        </Text>
        <InsetGroup testID="learn-chapters">
          {learnChapters.map((chapter) => {
            const total = chapter.screens.length;
            const progress = chapterProgress(places[chapter.slug], total);
            const words = chapterPlaceWords(progress, total);
            return (
              <LinkRow
                key={chapter.slug}
                title={chapter.title}
                titleLines={0}
                detail={chapter.summary}
                value={words?.value}
                symbol={chapterSymbols[chapter.slug] ?? 'doc.text'}
                accessibilityLabel={[
                  chapter.title,
                  words?.spoken,
                  chapter.summary,
                ]
                  .filter(Boolean)
                  .join(', ')}
                onPress={() =>
                  router.push(
                    learnChapterRoute(
                      chapter.slug,
                      progress?.kind === 'part' ? progress.at : undefined,
                    ),
                  )
                }
                testID={`learn-chapter-${chapter.slug}`}
              />
            );
          })}
        </InsetGroup>
        <InsetGroup>
          <LinkRow
            title={learnCopy.glossary}
            symbol="books.vertical"
            onPress={() => router.push(glossaryRoute)}
            testID="learn-glossary-row"
          />
          <LinkRow
            title={learnCopy.minute}
            symbol="text.book.closed"
            onPress={() => router.push(minuteRoute)}
            testID="learn-minute-row"
          />
        </InsetGroup>
      </Screen>
    </>
  );
}
