import { useLocalSearchParams } from 'expo-router';

import Party from '../../../../features/Party';
import { recordKey } from '../../../../navigation/record-link';

/** Keyed on its party: a link to another one draws that party's own page. */
export default function PartyRoute() {
  const params = useLocalSearchParams();
  return <Party key={recordKey('party/[slug]', params)} />;
}
