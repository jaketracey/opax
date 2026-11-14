import { useLocalSearchParams } from 'expo-router';

import Connection from '../../../features/money-public/Connection';
import { recordKey } from '../../../navigation/record-link';

/** Keyed on its connection: a link to another one starts at its own top. */
export default function ConnectionRoute() {
  const params = useLocalSearchParams();
  return <Connection key={recordKey('connection', params)} />;
}
