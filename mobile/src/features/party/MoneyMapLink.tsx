import { router } from 'expo-router';
import { LinkRow } from '../../design/primitives';
import { moneyRoute } from '../../navigation/routes';
/** The resolved money.json party label is the native map's canonical ID. */
export function MoneyMapLink({ party }: { party: string }) {
  return (
    <LinkRow
      title="Money map"
      icon="point.3.connected.trianglepath.dotted"
      accent="money"
      onPress={() => router.push(moneyRoute(party))}
      testID="party-money-map"
    />
  );
}
