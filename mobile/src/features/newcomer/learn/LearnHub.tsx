import { router } from 'expo-router';
import { InsetGroup, Screen } from '../../../design/layout';
import { LinkRow } from '../../../design/rows';
import { symbols } from '../../../design/symbols';
import { Heading, Text } from '../../../design/text';
import { welcomeBasicsRoute } from '../../../navigation/routes';
import { plainWordsRoute } from '../TermTip';
import { chapters, learnCopy, learnName } from './copy';
import { learnChapterRoute } from './routes';

/**
 * The Learn hub (`/learn`): six chapters and the glossary. Reached from the
 * welcome, Today's first-run card, More to explore and Account. A plain
 * list, not a course: no progress to finish, no order enforced.
 */
export default function LearnHub() {
  const name = learnName();
  return (
    <Screen grouped barTitle={name} testID="learn-screen">
      <Heading level={1} kind="page" testID="learn-title">
        {name}
      </Heading>
      <Text wordSafe variant="body" tone="inkSoft">
        {learnCopy.lead}
      </Text>
      <InsetGroup header={learnCopy.chapters} testID="learn-chapters">
        {chapters.map((chapter, i) => (
          <LinkRow
            key={chapter.id}
            title={`${i + 1}. ${chapter.title}`}
            detail={chapter.line}
            symbol={chapter.symbol}
            symbolInk={chapter.ink === 'navy' ? undefined : chapter.ink}
            href={learnChapterRoute(chapter.id)}
            testID={`learn-chapter-${chapter.id}`}
          />
        ))}
      </InsetGroup>
      <InsetGroup testID="learn-more">
        <LinkRow
          title={learnCopy.glossary}
          detail={learnCopy.glossaryLine}
          symbol={symbols.help}
          onPress={() => router.push(plainWordsRoute())}
          testID="learn-glossary"
        />
        <LinkRow
          title={learnCopy.minute}
          detail={learnCopy.minuteLine}
          symbol={symbols.welcome}
          onPress={() => router.push(welcomeBasicsRoute)}
          testID="learn-minute"
        />
      </InsetGroup>
    </Screen>
  );
}
