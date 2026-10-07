import { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import { useSharedValue } from 'react-native-reanimated';
import { Text } from '../design/primitives';
import { VoiceOrb, type OrbPhase } from '../features/talk/VoiceOrb';

/**
 * Every phase of Talk's call animation at once, for review: the fixture's
 * synthetic call speaks for only a fifth of a second. "Listening" shows a
 * steady voice at the microphone; speaking uses the orb's own envelope.
 */
const phases: { phase: OrbPhase; label: string; still?: boolean }[] = [
  { phase: 'rest', label: 'Before a call' },
  { phase: 'connecting', label: 'Connecting' },
  { phase: 'listening', label: 'Listening, you speaking' },
  { phase: 'thinking', label: 'Thinking' },
  { phase: 'speaking', label: 'OPAX speaking' },
  { phase: 'muted', label: 'Muted' },
  { phase: 'speaking', label: 'Speaking, Reduce Motion', still: true },
];

function Sample({ phase, label, still = false }: (typeof phases)[number]) {
  const input = useSharedValue(0);
  const output = useSharedValue(0);
  const outputFresh = useSharedValue(0);
  useEffect(() => {
    input.set(0.72);
  }, [input]);
  return (
    <View style={styles.sample}>
      <VoiceOrb
        phase={phase}
        levels={{ input, output, outputFresh }}
        size={150}
        reduceMotion={still}
      />
      <Text variant="fine" style={styles.label}>
        {label}
      </Text>
    </View>
  );
}

export function TalkOrbs() {
  return (
    <View style={styles.grid} testID="wb-talk-orbs">
      {phases.map((sample) => (
        <Sample key={sample.label} {...sample} />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  sample: { width: 150, alignItems: 'center' },
  label: { textAlign: 'center' },
});
