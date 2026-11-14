import { router } from 'expo-router';
import { useSyncExternalStore } from 'react';
import { StyleSheet, View } from 'react-native';
import { Card } from '../../../design/card';
import { Button, IconButton } from '../../../design/controls';
import { symbols } from '../../../design/symbols';
import { Text } from '../../../design/text';
import { rhythm } from '../../../design/tokens';
import { newcomerOption } from '../option';
import { learnCopy, learnName } from './copy';
import { learnRoute } from './routes';

// Prototype: hidden for this launch only. Phase 2 saves it on the device
// (like Today's invitation), and never shows the card to an existing install.
let hidden = false;
const listeners = new Set<() => void>();
const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};

/**
 * Today's first-run card for the guide. One card, once: "Hide" removes it
 * for good, opening the guide removes it too, and it never comes back to
 * nag. The guide stays reachable from More to explore and Account.
 */
export function LearnCard() {
  const gone = useSyncExternalStore(
    subscribe,
    () => hidden,
    () => hidden,
  );
  if (!newcomerOption() || gone) return null;
  const hide = () => {
    hidden = true;
    listeners.forEach((listener) => listener());
  };
  return (
    <Card testID="today-learn" padded>
      <View style={styles.head}>
        <Text
          wordSafe
          variant="sectionTitle"
          accessibilityRole="header"
          style={styles.grow}
          testID="today-learn-title"
        >
          {learnName()}
        </Text>
        <View style={styles.hide}>
          <IconButton
            symbol={symbols.close}
            accessibilityLabel={`${learnCopy.cardHide} ${learnName()}`}
            onPress={hide}
            testID="today-learn-hide"
          />
        </View>
      </View>
      <View style={styles.body}>
        <Text wordSafe>{learnCopy.cardLine}</Text>
        <Button
          label={learnCopy.cardOpen}
          fullWidth
          onPress={() => {
            router.push(learnRoute);
            setTimeout(hide, 600);
          }}
          testID="today-learn-open"
        />
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  head: { flexDirection: 'row', alignItems: 'flex-start', gap: rhythm.tight },
  grow: { flex: 1 },
  hide: { marginTop: -10, marginRight: -10 },
  body: { gap: rhythm.block, marginTop: rhythm.tight },
});
