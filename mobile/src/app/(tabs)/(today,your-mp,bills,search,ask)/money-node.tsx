import { Redirect, useLocalSearchParams } from 'expo-router';
import { moneyRecordRoute } from '../../../navigation/routes/public-money';
export default function LegacyMoneyNode() {
  const params = useLocalSearchParams();
  return <Redirect href={moneyRecordRoute(params)} />;
}
