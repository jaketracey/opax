import {
  LinearGradient,
  Text as SkiaText,
  matchFont,
  useFont,
} from '@shopify/react-native-skia';
import { useEffect, useMemo, useState } from 'react';
import {
  Platform,
  StyleSheet,
  View,
  useColorScheme,
  type TextLayoutLine,
} from 'react-native';
import {
  Easing,
  cancelAnimation,
  useDerivedValue,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';
import {
  useBoldText,
  useHighTextContrast,
  useIncreaseContrast,
  useReduceMotionSetting,
} from './accessibility';
import { SizedCanvas } from './canvas';
import { darkHighContrast, lightHighContrast, paletteFor } from './palette';
import { LINE_HEIGHT_NUDGE, Text } from './text';
import { motion, textStyles } from './tokens';

/** Native Text owns wrapping, Dynamic Type and the readable secondary colour.
 * Skia adds only a translucent highlight through the measured glyphs. */
export function ShimmerText({
  text,
  testID,
}: {
  text: string;
  testID?: string;
}) {
  const reduceMotion = useReduceMotionSetting();
  const [layout, setLayout] = useState<{
    text: string;
    lines: readonly TextLayoutLine[];
  } | null>(null);
  const lines = layout?.text === text ? layout.lines : [];
  const width = Math.max(0, ...lines.map((line) => line.x + line.width));
  const height = Math.max(0, ...lines.map((line) => line.y + line.height));
  return (
    <View>
      <Text
        wordSafe
        variant="secondary"
        testID={testID}
        onTextLayout={(event) =>
          setLayout({ text, lines: event.nativeEvent.lines })
        }
      >
        {text}
      </Text>
      {reduceMotion === false && width > 0 && height > 0 ? (
        <View
          pointerEvents="none"
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
          style={StyleSheet.absoluteFill}
          testID="shimmer-highlight"
        >
          <GlyphHighlight lines={lines} width={width} height={height} />
        </View>
      ) : null}
    </View>
  );
}

function GlyphHighlight({
  lines,
  width,
  height,
}: {
  lines: readonly TextLayoutLine[];
  width: number;
  height: number;
}) {
  const scheme = useColorScheme() === 'dark' ? 'dark' : 'light';
  const contrast = useIncreaseContrast();
  const highContrast = useHighTextContrast();
  const bold = useBoldText();
  const palette = paletteFor(scheme);
  const strong = scheme === 'dark' ? darkHighContrast : lightHighContrast;
  const highlight =
    (contrast || highContrast ? strong.ink : undefined) ?? palette.ink;
  const progress = useSharedValue(0);
  const band = Math.min(96, width * 0.6);
  const start = useDerivedValue(() => ({
    x: -band + progress.value * (width + band),
    y: 0,
  }));
  const end = useDerivedValue(() => ({
    x: progress.value * (width + band),
    y: 0,
  }));
  useEffect(() => {
    progress.value = 0;
    progress.value = withRepeat(
      withSequence(
        withTiming(1, {
          duration: motion.duration.gentle * 4,
          easing: Easing.linear,
        }),
        withDelay(motion.duration.standard, withTiming(0, { duration: 0 })),
      ),
      -1,
      false,
    );
    return () => cancelAnimation(progress);
  }, [progress]);
  return (
    <SizedCanvas width={width} height={height}>
      {lines.map((line, i) => (
        <HighlightLine key={i} line={line} bold={bold}>
          <LinearGradient
            start={start}
            end={end}
            colors={[`${highlight}00`, `${highlight}99`, `${highlight}00`]}
            positions={[0, 0.5, 1]}
          />
        </HighlightLine>
      ))}
    </SizedCanvas>
  );
}

function HighlightLine({
  line,
  bold,
  children,
}: {
  line: TextLayoutLine;
  bold: boolean;
  children: React.ReactNode;
}) {
  const role = textStyles.secondary;
  // The measured line includes the word-safe cap and the platform's actual
  // Dynamic Type ramp, rather than assuming fontScale is that multiplier.
  const size =
    (role.fontSize * line.height) / (role.lineHeight + LINE_HEIGHT_NUDGE);
  const bundled = useFont(
    Platform.OS === 'android'
      ? bold
        ? require('../../assets/fonts/PublicSans-SemiBold.ttf')
        : require('../../assets/fonts/PublicSans.ttf')
      : null,
    size,
  );
  const system = useMemo(
    () =>
      Platform.OS === 'ios'
        ? matchFont({
            fontFamily: 'System',
            fontSize: size,
            fontWeight: bold ? '600' : role.fontWeight,
          })
        : null,
    [bold, role.fontWeight, size],
  );
  const font = Platform.OS === 'ios' ? system : bundled;
  if (!font) return null;
  return (
    <SkiaText
      x={line.x}
      y={line.y + line.ascender}
      text={line.text}
      font={font}
    >
      {children}
    </SkiaText>
  );
}
