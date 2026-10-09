import { router } from 'expo-router';
import {
  Screen,
  Section,
  RowList,
  LinkRow,
  Text,
} from '../../design/primitives';
import { ExploreHeader } from './parts';
export const tools = [
  {
    game: 'quiz',
    title: 'The record quiz',
    detail: 'Money and words in one sitting',
  },
  {
    game: 'ballot',
    title: 'Build your ballot',
    detail: '2025 House practice ballot',
  },
  { game: 'tm', title: 'Time machine', detail: '1998 to 2026' },
  {
    game: 'tide',
    title: 'The tide',
    detail: 'How parliament’s labelled debates move across four decades',
  },
  {
    game: 'matrix',
    title: 'Who owns which debate',
    detail: 'Each party’s share of a debate’s labelled speeches',
  },
  {
    game: 'wd',
    title: 'Words per dollar',
    detail: 'Disclosed donations beside the labelled debate',
  },
] as const;
export default function ExploreHub() {
  return (
    <>
      <ExploreHeader title="Explore" />
      <Screen column="wide" testID="explore-screen">
        <Text variant="body" wordSafe>
          Play with the parliamentary record
        </Text>
        <Section>
          <RowList grid>
            {tools.map((tool) => (
              <LinkRow
                key={tool.game}
                title={tool.title}
                detail={tool.detail}
                testID={`explore-${tool.game}`}
                onPress={() =>
                  router.push({
                    pathname: '/explore/[tool]',
                    params: { tool: tool.game },
                  })
                }
              />
            ))}
          </RowList>
        </Section>
      </Screen>
    </>
  );
}
