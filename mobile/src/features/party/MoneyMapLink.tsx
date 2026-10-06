import { router } from 'expo-router';
import { Button } from '../../design/primitives';
import { moneyRoute } from '../../navigation/routes';
/** The resolved money.json party label is the native map's canonical ID. */
export function MoneyMapLink({ party }: { party: string }) {
  return (
    <Button
      label="Open the money map"
      onPress={() => router.push(moneyRoute(party))}
      testID="party-money-map"
    />
  );
}
