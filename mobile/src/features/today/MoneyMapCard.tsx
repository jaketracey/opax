import { Pressable, StyleSheet, View } from 'react-native';
import { router } from 'expo-router';
import { Hoverable, Icon, IconTile, Text, Card } from '../../design/primitives';
import { colors, rhythm, radii } from '../../design/tokens';
import { moneyRoute } from '../../navigation/routes';

/** A quiet, static way into the full money record; the map loads on entry. */
export function MoneyMapCard() {
  return (
    <Hoverable effect="lift" cornerRadius={radii.md}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Money map. Political donations & public money map"
        accessibilityHint="Opens the native money map"
        testID="today-money-map"
        onPress={() => router.push(moneyRoute())}
      >
        {({ pressed }) => (
          <Card
            padded={false}
            style={[
              styles.card,
              { backgroundColor: pressed ? colors.sunken : colors.moneyWash },
            ]}
          >
            <IconTile
              name="point.3.connected.trianglepath.dotted"
              accent="money"
              size="section"
            />
            <View style={styles.text}>
              <Text wordSafe variant="subheading" tone="moneyInk">
                Money map
              </Text>
              <Text wordSafe variant="metadata" tone="ink">
                Political donations &amp; public money map
              </Text>
            </View>
            <Icon name="arrow.right" size={16} tone="moneyInk" />
          </Card>
        )}
      </Pressable>
    </Hoverable>
  );
}
const styles = StyleSheet.create({
  card: {
    padding: rhythm.block,
    flexDirection: 'row',
    alignItems: 'center',
    gap: rhythm.heading,
  },
  text: { flex: 1, gap: rhythm.line },
});
