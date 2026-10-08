import { useLocalSearchParams } from 'expo-router';
import Quiz from '../../../../features/explore/Quiz';
import Ballot from '../../../../features/explore/Ballot';
import TimeMachine from '../../../../features/explore/TimeMachine';
import Tide from '../../../../features/explore/Tide';
import Matrix from '../../../../features/explore/Matrix';
import WordsDollars from '../../../../features/explore/WordsDollars';
import { Screen, EmptyState } from '../../../../design/primitives';
export default function ExploreTool() {
  const { tool } = useLocalSearchParams<{ tool: string }>();
  switch (tool) {
    case 'quiz':
      return <Quiz />;
    case 'ballot':
      return <Ballot />;
    case 'tm':
      return <TimeMachine />;
    case 'tide':
      return <Tide />;
    case 'matrix':
      return <Matrix />;
    case 'wd':
      return <WordsDollars />;
    default:
      return (
        <Screen>
          <EmptyState message="This Explore tool is not available." />
        </Screen>
      );
  }
}
