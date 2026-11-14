import { useLocalSearchParams } from 'expo-router';

import MoneyRecord from '../../../features/money/MoneyRecord';
import { recordKey } from '../../../navigation/record-link';

/** Keyed on its record: a link to another one starts at that record's top. */
export default function MoneyRecordRoute() {
  const params = useLocalSearchParams();
  return <MoneyRecord key={recordKey('money-record', params)} />;
}
