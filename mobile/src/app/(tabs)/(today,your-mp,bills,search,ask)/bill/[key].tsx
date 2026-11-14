import { useLocalSearchParams } from 'expo-router';

import BillDetail from '../../../../features/bills/BillDetail';
import { recordKey } from '../../../../navigation/record-link';

/** Keyed on its bill: a link to another one starts at that bill's top. */
export default function BillRoute() {
  const params = useLocalSearchParams();
  return <BillDetail key={recordKey('bill/[key]', params)} />;
}
