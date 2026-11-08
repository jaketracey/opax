import { useLocalSearchParams } from 'expo-router';
import { YearSheet } from '../../../../features/explore/YearMenu';
import { linkedYear } from '../../../../features/explore/TimeMachine';
export default function Years() {
  const { year } = useLocalSearchParams<{ year?: string }>();
  return <YearSheet year={linkedYear(year)} />;
}
