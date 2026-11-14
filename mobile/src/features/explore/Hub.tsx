import { useOffline } from '../../api/useOffline';
import { Tile, TileGrid } from '../../design/card';
import type { SFSymbol } from '../../design/icon';
import { Screen } from '../../design/layout';
import { OfflineLine } from '../../design/states';
import { symbols } from '../../design/symbols';
import { Heading } from '../../design/text';
import type { Accent } from '../../design/tokens';
import { exploreToolRoute } from '../../navigation/routes/explore';
import { ExploreChrome, hubName } from './parts';
import { resumeLabel } from './quiz-model';
import { useQuizInProgress } from './quiz-session';

export { toolName } from './parts';

export interface ExploreTool {
  game: 'quiz' | 'tm' | 'tide' | 'matrix' | 'wd';
  title: string;
  line: string;
  symbol: SFSymbol;
  ink: Accent;
}
/**
 * Fixed order, not personalised: the quiz leads (it needs no interest in a
 * subject), then the two widest tools, then the two narrowest.
 */
export const tools: readonly ExploreTool[] = [
  {
    game: 'quiz',
    title: 'The record quiz',
    line: 'Eight questions on donations and debates',
    symbol: symbols.explore,
    ink: 'votes',
  },
  {
    game: 'tm',
    title: 'Time machine',
    line: 'Photographs, bills and debates from 1998 to 2026',
    symbol: symbols.archive,
    ink: 'bills',
  },
  {
    game: 'tide',
    title: 'The tide',
    line: 'Which subjects parliament talks about more, or less, since 1993',
    symbol: symbols.trends,
    ink: 'votes',
  },
  {
    game: 'matrix',
    title: 'Who owns which debate',
    line: 'Which parties speak on each subject',
    symbol: symbols.party,
    ink: 'votes',
  },
  {
    game: 'wd',
    title: 'Words per dollar',
    line: 'Industry donations beside what parties say on the subject',
    symbol: symbols.money,
    ink: 'money',
  },
];

/** Quizzes and tools: five tiles, the quiz across the full width. */
export default function ExploreHub() {
  const inProgress = useQuizInProgress();
  const offline = useOffline();
  return (
    <>
      <ExploreChrome name={hubName} />
      <Screen grouped column="wide" barTitle={hubName} testID="explore-screen">
        <Heading level={1} kind="page">
          {hubName}
        </Heading>
        {offline ? (
          <OfflineLine
            savedAt={null}
            message="You’re offline. The record quiz still works."
            testID="explore-offline"
          />
        ) : null}
        <TileGrid lead testID="explore-tools">
          {tools.map((tool) => {
            const resume = tool.game === 'quiz' && inProgress;
            return (
              <Tile
                key={tool.game}
                title={tool.title}
                line={resume ? resumeLabel(inProgress.index) : tool.line}
                symbol={tool.symbol}
                ink={tool.ink}
                href={exploreToolRoute(
                  tool.game,
                  resume ? { resume: '1' } : {},
                )}
                testID={`explore-${tool.game}`}
              />
            );
          })}
        </TileGrid>
      </Screen>
    </>
  );
}
