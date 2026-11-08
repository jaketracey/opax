import { Redirect, useLocalSearchParams } from 'expo-router';
import { moneyRecordRoute } from '../navigation/routes/public-money';
export default function LegacyMoneyNode() {
  const params = useLocalSearchParams<{
    id?: string;
    node?: string;
    rid?: string;
    jur?: string;
  }>();
  return (
    <Redirect
      href={moneyRecordRoute({
        ...(params.rid ? { rid: params.rid } : {}),
        ...(params.jur ? { jur: params.jur } : {}),
        ...(params.node || params.id ? { node: params.node ?? params.id } : {}),
      })}
    />
  );
}
