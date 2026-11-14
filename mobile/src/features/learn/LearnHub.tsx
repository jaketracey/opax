import { router } from 'expo-router';
import { useEffect } from 'react';
import type { SFSymbol } from '../../design/icon';
import { InsetGroup, Screen } from '../../design/layout';
import { LinkRow } from '../../design/rows';
import { Heading, Text } from '../../design/text';
import { RouteOptions } from '../../navigation/preview';
import { learnCopy } from './copy';
import { learnChapters } from './glossary';
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
 */
export default function LearnHub() {
  useEffect(() => {
    void hideLearnCard().catch(() => undefined);
  }, []);
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
          {learnChapters.map((chapter) => (
            <LinkRow
              key={chapter.slug}
              title={chapter.title}
              titleLines={0}
              detail={chapter.summary}
              symbol={chapterSymbols[chapter.slug] ?? 'doc.text'}
              onPress={() => router.push(learnChapterRoute(chapter.slug))}
              testID={`learn-chapter-${chapter.slug}`}
            />
          ))}
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
