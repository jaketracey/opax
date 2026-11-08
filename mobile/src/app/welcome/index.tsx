import { useLocalSearchParams } from 'expo-router';
import ShortWelcome from '../../features/welcome/ShortWelcome';
import Welcome from '../../features/welcome/Welcome';

/** `/welcome`: the full welcome, or the short one over a first-launch link. */
export default function WelcomeRoute() {
  const { short, entry } = useLocalSearchParams<{
    short?: string;
    entry?: string;
  }>();
  const launch = entry === 'launch';
  return short === '1' ? (
    <ShortWelcome launch={launch} />
  ) : (
    <Welcome launch={launch} />
  );
}
