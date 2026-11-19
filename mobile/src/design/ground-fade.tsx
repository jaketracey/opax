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
import { useColors } from './use-colors';
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
// Asked once as the module loads, so on a cold start the answer is in before
// the first fade mounts and a carousel's peek doesn't appear a moment late.
// A fade's own reading or a change event, if either came first, stands.
if (Platform.OS === 'ios') {
  void AccessibilityInfo.isReduceTransparencyEnabled().then(
    (value) => {
      if (known === undefined) known = value;
    },
    () => undefined,
  );
}

const BANDS: Record<GroundFadeSide, (span: number) => ViewStyle> = {
  top: (span) => ({
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: span,
  }),
  left: (span) => ({
    position: 'absolute',
    top: 0,
    bottom: 0,
    left: 0,
    width: span,
  }),
  right: (span) => ({
    position: 'absolute',
    top: 0,
    bottom: 0,
    right: 0,
    width: span,
  }),
};

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
  solidSpan,
  testID,
  style,
}: {
  side: GroundFadeSide;
  ground?: GroundFadeGround;
  /** The share of the fade, from the boundary, that stays opaque (0 to 1). */
  hold?: number;
  /**
   * Under Reduce Transparency, how far (pt) the solid band reaches in from
   * the boundary. The whole fade when unset; less leaves the rest clear, so
   * content the gradient only softened stays in view.
   */
  solidSpan?: number;
  testID?: string;
  style?: StyleProp<ViewStyle>;
}) {
  const colors = useColors();

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
      style={[
        style,
        solid && solidSpan == null ? { backgroundColor: colors[ground] } : null,
      ]}
    >
      {solid && solidSpan != null ? (
        <View
          style={[BANDS[side](solidSpan), { backgroundColor: colors[ground] }]}
        />
      ) : null}
      {!solid ? (
        // A unit canvas stretched over the view, not lengths in per cent.
        // react-native-svg 15.15.4 works a child's "100%" out once and
        // keeps that shape when the view is resized, so after a Duo was
        // unfolded the bar's fade still drew at the folded display's 382 pt:
        // a band over Today's leading column that cut into the trailing
        // one's first card, and no fade over the rest. The stretch is
        // worked out again on each draw.
        <Svg
          width="100%"
          height="100%"
          viewBox="0 0 1 1"
          preserveAspectRatio="none"
        >
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
          <Rect x={0} y={0} width={1} height={1} fill={`url(#${id})`} />
        </Svg>
      ) : null}
    </View>
  );
}
