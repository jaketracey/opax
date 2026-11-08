import { useEffect } from 'react';
import {
  Redirect,
  router,
  useLocalSearchParams,
  useNavigation,
} from 'expo-router';
import Quiz from '../../../../features/explore/Quiz';
import TimeMachine from '../../../../features/explore/TimeMachine';
import Tide from '../../../../features/explore/Tide';
import Matrix from '../../../../features/explore/Matrix';
import WordsDollars from '../../../../features/explore/WordsDollars';
import {
  exploreRoute,
  hubInStack,
} from '../../../../navigation/routes/explore';

type Params = {
  tool?: string;
  q?: string;
  resume?: string;
  year?: string;
  photo?: string;
};

/**
 * The five tools. Any other `tool` (an old Ballot link included) goes to the
 * hub, never a second copy of it: back to the hub already in the stack, or a
 * redirect that replaces this screen. The Time machine reads `year` and
 * `photo` from these same route params.
 */
export default function ExploreTool() {
  const { tool, q, resume } = useLocalSearchParams<Params>();
  switch (tool) {
    case 'quiz':
      return <Quiz q={q} resume={resume === '1'} />;
    case 'tm':
      return <TimeMachine />;
    case 'tide':
      return <Tide />;
    case 'matrix':
      return <Matrix />;
    case 'wd':
      return <WordsDollars />;
    default:
      return <ToHub />;
  }
}

function ToHub() {
  const navigation = useNavigation();
  const back = hubInStack(navigation.getState());
  useEffect(() => {
    if (back) router.dismissTo(exploreRoute);
  }, [back]);
  return back ? null : <Redirect href={exploreRoute} />;
}
