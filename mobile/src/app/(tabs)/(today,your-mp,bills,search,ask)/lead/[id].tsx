import { useLocalSearchParams } from 'expo-router';

import LeadDetail from '../../../../features/leads/LeadDetail';
import { recordKey } from '../../../../navigation/record-link';

/** Keyed on its lead: a link to another one starts at that lead's top. */
export default function LeadRoute() {
  const params = useLocalSearchParams();
  return <LeadDetail key={recordKey('lead/[id]', params)} />;
}
