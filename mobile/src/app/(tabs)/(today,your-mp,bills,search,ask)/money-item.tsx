import { useLocalSearchParams } from 'expo-router';

import MoneyItem from '../../../features/money-public/MoneyItem';
import { recordKey } from '../../../navigation/record-link';

/** Keyed on its item: a link to another one starts at that item's top. */
export default function MoneyItemRoute() {
  const params = useLocalSearchParams();
  return <MoneyItem key={recordKey('money-item', params)} />;
}
