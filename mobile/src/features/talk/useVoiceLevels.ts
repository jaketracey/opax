import { useEffect, useMemo } from 'react';
import { useSharedValue } from 'react-native-reanimated';
import { subscribeLevels } from '../../voice';
import type { OrbLevels } from './VoiceOrb';

/**
 * Native call loudness, straight into UI-thread values for the orb. Levels
 * arrive about 15 times a second during a live call and never touch React
 * state, so they cost no renders.
 */
export function useVoiceLevels(live: boolean): OrbLevels {
  const input = useSharedValue(0);
  const output = useSharedValue(0);
  const outputFresh = useSharedValue(0);
  useEffect(() => {
    if (!live) {
      input.set(0);
      output.set(0);
      return;
    }
    return subscribeLevels((levels) => {
      input.set(levels.input);
      output.set(levels.output);
      // Above the floor of an idle mixer (about -48 dBFS): the meter works,
      // so trust it through the pauses between sentences.
      if (levels.output > 0.2) outputFresh.set(1.5);
    });
  }, [live, input, output, outputFresh]);
  return useMemo(
    () => ({ input, output, outputFresh }),
    [input, output, outputFresh],
  );
}
