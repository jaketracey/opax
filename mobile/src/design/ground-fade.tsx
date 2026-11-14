import { useEffect, useId, useState } from 'react';
import {
  AccessibilityInfo,
  Platform,
  View,
  useColorScheme,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import Svg, { Defs, LinearGradient, Rect, Stop } from 'react-native-svg';
import { colors } from './tokens';
import { useIncreaseContrast, useHighTextContrast } from './accessibility';
import { paletteFor, darkHighContrast, lightHighContrast } from './palette';

/** The side of the clipped view the fade sits on: opaque there, clear inwards. */
export type GroundFadeSide = 'top' | 'left' | 'right';
export type GroundFadeGround = 'paper' | 'sunken' | 'raised';

const VECTORS: Record<
  GroundFadeSide,
  { x1: string; y1: string; x2: string; y2: string }
> = {
  top: { x1: '0', y1: '0', x2: '0', y2: '1' },
  left: { x1: '0', y1: '0', x2: '1', y2: '0' },
  right: { x1: '1', y1: '0', x2: '0', y2: '0' },
};

// The last answer read, so a fade mounted later (a carousel's leading edge,
// part-way through a swipe) starts as it should, with no solid frame first.
let known: boolean | undefined;

/**
 * Content running under a clipped edge fades into the ground behind it.
 * Opaque at the boundary, clear on the inner side. Solid under Reduce
 * Transparency. Never takes touches and is hidden from assistive technology.
 * The caller positions it (absolute) over the edge.
 */
export function GroundFade({
  side,
  ground = 'paper',
  hold = 0,
  testID,
  style,
}: {
  side: GroundFadeSide;
  ground?: GroundFadeGround;
  /** The share of the fade, from the boundary, that stays opaque (0 to 1). */
  hold?: number;
  testID?: string;
  style?: StyleProp<ViewStyle>;
}) {
  const id = useId();
  const scheme = useColorScheme() === 'dark' ? 'dark' : 'light';
  const contrast = useIncreaseContrast();
  const highContrast = useHighTextContrast();
  // SVG gradient stops accept numeric colours, not DynamicColorIOS values.
  const fill =
    (contrast || highContrast
      ? (scheme === 'dark' ? darkHighContrast : lightHighContrast)[ground]
      : undefined) ?? paletteFor(scheme)[ground];
  // A solid band until the preference is known also covers a failed read.
  const [solid, setSolid] = useState(known ?? Platform.OS === 'ios');
  useEffect(() => {
    if (Platform.OS !== 'ios') return;
    let changed = false;
    let mounted = true;
    const subscription = AccessibilityInfo.addEventListener(
      'reduceTransparencyChanged',
      (value) => {
        changed = true;
        known = value;
        setSolid(value);
      },
    );
    void AccessibilityInfo.isReduceTransparencyEnabled().then(
      (value) => {
        if (changed) return;
        known = value;
        if (mounted) setSolid(value);
      },
      () => undefined,
    );
    return () => {
      mounted = false;
      subscription.remove();
    };
  }, []);
  const stops: [number, number][] =
    hold > 0
      ? [
          [0, 1],
          [hold, 1],
          [1, 0],
        ]
      : [
          [0, 1],
          [1, 0],
        ];
  return (
    <View
      pointerEvents="none"
      accessible={false}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      testID={testID}
      style={[style, solid ? { backgroundColor: colors[ground] } : null]}
    >
      {!solid ? (
        <Svg width="100%" height="100%">
          <Defs>
            <LinearGradient id={id} {...VECTORS[side]}>
              {stops.map(([offset, opacity]) => (
                <Stop
                  key={offset}
                  offset={String(offset)}
                  stopColor={fill}
                  stopOpacity={opacity}
                />
              ))}
            </LinearGradient>
          </Defs>
          <Rect width="100%" height="100%" fill={`url(#${id})`} />
        </Svg>
      ) : null}
    </View>
  );
}
