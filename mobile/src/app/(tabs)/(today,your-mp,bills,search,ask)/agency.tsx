import { useLocalSearchParams } from 'expo-router';

import { Agency as AgencyScreen } from '../../../features/money-public/Agencies';
import { recordKey } from '../../../navigation/record-link';

/**
 * Keyed on its agency: a link to another one starts at that agency's top.
 * (The screen also keys its record on the section and supplier it opens at.)
 */
export default function AgencyRoute() {
  const params = useLocalSearchParams();
  return <AgencyScreen key={recordKey('agency', params)} />;
}
