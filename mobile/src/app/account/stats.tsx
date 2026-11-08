import { Redirect } from 'expo-router';
import { coverageRoute } from '../../navigation/routes/reference';
/** The account spec's earlier name for Coverage; old links still land. */
export default function LegacyStats() {
  return <Redirect href={coverageRoute} />;
}
