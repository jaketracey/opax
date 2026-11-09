import Constants from 'expo-constants';
import { router } from 'expo-router';
import { StyleSheet, View } from 'react-native';
import { Button, Card, Icon, Text } from '../../design/primitives';
import { designFlags } from '../../design/flags';
import { symbols } from '../../design/symbols';
import { colors, interfaceFonts, radii, rhythm } from '../../design/tokens';
import { talkRoute } from '../../navigation/routes/account';
import { voiceLinked } from '../../voice/linked';

const start = () => router.push(talkRoute);

/** An invitation only: Talk owns sign-in, consent and starting the call. */
export function VoiceCard() {
  const extra = Constants.expoConfig?.extra;
  // iOS voiceLinked also stays true without the native module. Honour the
  // build switch that resolves Talk to entry.production.ts in that bundle.
  const voiceOff =
    extra?.variant === 'production' && extra.productionVoiceEnabled !== true;
  if (!voiceLinked || !designFlags.talkInAsk || voiceOff) return null;

  return (
    <Card
      onPress={start}
      accessibilityLabel="Start a voice chat"
      accessibilityHint="Talk to OPAX about parliament"
      testID="today-voice"
    >
      {/* One accessible button for the whole card, including its action. */}
      <View
        accessible={false}
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
        style={styles.content}
      >
        <View style={styles.symbol}>
          <Icon name={symbols.talk} size={28} maxScale={1} tone="navy" />
        </View>
        <View style={styles.words}>
          <Text wordSafe variant="sectionTitle" style={styles.title}>
            Talk it through
          </Text>
          <Text wordSafe tone="inkSoft">
            Ask about a bill, a vote or your MP, out loud. Answers come with
            sources.
          </Text>
        </View>
        <Button
          label="Start a voice chat"
          variant="primary"
          size="large"
          fullWidth
          onPress={start}
          testID="today-voice-start"
        />
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  content: { gap: rhythm.block },
  symbol: {
    alignSelf: 'flex-start',
    padding: rhythm.tight,
    borderRadius: radii.capsule,
    borderCurve: 'continuous',
    backgroundColor: colors.navyWash,
  },
  words: { gap: rhythm.heading },
  title: { fontFamily: interfaceFonts.sansBold },
});
