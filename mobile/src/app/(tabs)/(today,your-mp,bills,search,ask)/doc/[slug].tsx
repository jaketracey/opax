import { useLocalSearchParams } from 'expo-router';

import DocumentReader from '../../../../features/records/DocumentReader';
import { recordKey } from '../../../../navigation/record-link';

/** Keyed on its record: a link to another one starts at that record's top. */
export default function DocumentRoute() {
  const params = useLocalSearchParams();
  return <DocumentReader key={recordKey('doc/[slug]', params)} />;
}
