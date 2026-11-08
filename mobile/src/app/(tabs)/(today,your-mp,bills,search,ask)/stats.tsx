import { Redirect } from 'expo-router';
import { coverageRoute } from '../../../navigation/routes/reference';
/** Coverage lives in the Account stack; `/stats` links open it there. */
export default function LegacyStats() {
  return <Redirect href={coverageRoute} />;
}
