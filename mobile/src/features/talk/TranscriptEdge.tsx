import { useEffect, useId, useState } from 'react';
import {
  AccessibilityInfo,
  Platform,
  StyleSheet,
  View,
  useColorScheme,
} from 'react-native';
import Svg, { Defs, LinearGradient, Rect, Stop } from 'react-native-svg';
import { colors } from '../../design/tokens';
import {
  useIncreaseContrast,
  useHighTextContrast,
} from '../../design/accessibility';
import {
  paletteFor,
  darkHighContrast,
  lightHighContrast,
} from '../../design/palette';

export const TRANSCRIPT_EDGE_HEIGHT = 28;

/** Opaque at the scroll boundary, clear before the first line's top inset. */
export function TranscriptEdge() {
  const id = useId();
  const scheme = useColorScheme() === 'dark' ? 'dark' : 'light';
  const contrast = useIncreaseContrast();
  const highContrast = useHighTextContrast();
  // SVG gradient stops accept numeric colours, not DynamicColorIOS values.
  const paper =
    (contrast || highContrast
      ? (scheme === 'dark' ? darkHighContrast : lightHighContrast).paper
      : undefined) ?? paletteFor(scheme).paper;
  // A solid band until the preference is known also covers a failed read.
  const [solid, setSolid] = useState(Platform.OS === 'ios');
  useEffect(() => {
    if (Platform.OS !== 'ios') return;
    let changed = false;
    let mounted = true;
    const subscription = AccessibilityInfo.addEventListener(
      'reduceTransparencyChanged',
      (value) => {
        changed = true;
        setSolid(value);
      },
    );
    void AccessibilityInfo.isReduceTransparencyEnabled().then(
      (value) => {
        if (mounted && !changed) setSolid(value);
      },
      () => undefined,
    );
    return () => {
      mounted = false;
      subscription.remove();
    };
  }, []);
  return (
    <View
      pointerEvents="none"
      accessible={false}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      testID="talk-transcript-edge"
      style={[styles.edge, solid ? styles.solid : null]}
    >
      {!solid ? (
        <Svg width="100%" height="100%">
          <Defs>
            <LinearGradient id={id} x1="0" y1="0" x2="0" y2="1">
              <Stop offset="0" stopColor={paper} stopOpacity={1} />
              <Stop offset="1" stopColor={paper} stopOpacity={0} />
            </LinearGradient>
          </Defs>
          <Rect width="100%" height="100%" fill={`url(#${id})`} />
        </Svg>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  edge: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: TRANSCRIPT_EDGE_HEIGHT,
  },
  solid: { backgroundColor: colors.paper },
});
