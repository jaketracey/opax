import { useLocalSearchParams } from 'expo-router';

import Person from '../../../../features/Person';
import { recordKey } from '../../../../navigation/record-link';

/** Keyed on its person: a link to another one starts at that profile's top. */
export default function PersonRoute() {
  const params = useLocalSearchParams();
  return <Person key={recordKey('person/[slug]', params)} />;
}
