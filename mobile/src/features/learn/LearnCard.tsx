import { router } from 'expo-router';
import type { ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';
import { Card } from '../../design/card';
import { Button, IconButton } from '../../design/controls';
import { Text } from '../../design/text';
import { rhythm } from '../../design/tokens';
import { learnCopy } from './copy';
import { learnRoute } from './routes';
import { hideLearnCard, useLearnSettings } from './settings';

/**
 * Home's first-run card for the guide (README 8.1). New installs only
 * (`card: 'show'` in the learn settings); its close button or opening the
 * guide hides it for good, and an existing install never sees it. The
 * title, one line and "Open the guide"; the close button sits beside the
 * title and is its own element.
 */
export function LearnCard({ testID = 'today-learn' }: { testID?: string }) {
  const { card } = useLearnSettings();
  if (card !== 'show') return null;
  return (
    <Card testID={testID} padded>
      <View style={styles.body}>
        <View style={styles.head}>
          <Text
            variant="sectionTitle"
            accessibilityRole="header"
            wordSafe
            style={styles.title}
            testID={`${testID}-title`}
          >
            {learnCopy.name}
          </Text>
          <View style={styles.close}>
            <IconButton
              symbol="xmark"
              accessibilityLabel={learnCopy.hideCard}
              onPress={() => void hideLearnCard().catch(() => undefined)}
              testID={`${testID}-hide`}
            />
          </View>
        </View>
        <Text wordSafe testID={`${testID}-line`}>
          {learnCopy.cardLine}
        </Text>
        <View style={styles.open}>
          <Button
            label={learnCopy.openGuide}
            variant="primary"
            onPress={() => router.push(learnRoute)}
            testID={`${testID}-open`}
          />
        </View>
      </View>
    </Card>
  );
}

/**
 * A Home block with the guide card under it while the card shows; the block
 * alone otherwise, so its layout is unchanged once the card is gone.
 */
export function WithLearnCard({ children }: { children: ReactNode }) {
  const { card } = useLearnSettings();
  if (card !== 'show') return <>{children}</>;
  return (
    <View style={styles.stack}>
      {children}
      <LearnCard />
    </View>
  );
}

const styles = StyleSheet.create({
  stack: { gap: rhythm.block },
  body: { gap: rhythm.line },
  head: { flexDirection: 'row', alignItems: 'flex-start', gap: rhythm.tight },
  title: { flex: 1 },
  close: { marginTop: -rhythm.tight, marginRight: -rhythm.tight },
  open: { alignSelf: 'flex-start', marginTop: rhythm.tight },
});
