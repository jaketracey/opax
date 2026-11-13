import { useColorScheme, useWindowDimensions } from 'react-native';
import Svg, { Path, Rect } from 'react-native-svg';
import { useHighTextContrast, useIncreaseContrast } from './accessibility';
import {
  darkHighContrast,
  lightHighContrast,
  paletteFor,
  type Role,
} from './palette';

/**
 * A role as a hex value, for drawings: SVG strokes and fills take numeric
 * colours, not DynamicColorIOS values. Follows the appearance and Increase
 * Contrast, as `colors` does natively.
 */
export function useDrawnColour(role: Role): string {
  const scheme = useColorScheme() === 'dark' ? 'dark' : 'light';
  const contrast = useIncreaseContrast();
  const highText = useHighTextContrast();
  const high =
    contrast || highText
      ? (scheme === 'dark' ? darkHighContrast : lightHighContrast)[role]
      : undefined;
  return high ?? paletteFor(scheme)[role];
}

// The mark's star, as assets/splash/mark.svg draws it on a 24 pt square.
const STAR =
  'M12 2.3L13.97 7.9L19.58 5.95L16.44 10.99L21.46 14.16L15.56 14.84L16.21 20.74L12 16.55L7.79 20.74L8.44 14.84L2.54 14.16L7.56 10.99L4.42 5.95L10.03 7.9Z';

/**
 * The OPAX mark as an engraving: its square and seven-point star in one
 * bronze hairline, no fill. Decorative; the words beside it carry the
 * meaning. The line stays one point at any size, and the mark grows with
 * Dynamic Type up to `maxScale`.
 */
export function EngravedMark({
  size = 96,
  maxScale = 1.5,
  testID,
}: {
  size?: number;
  maxScale?: number;
  testID?: string;
}) {
  const { fontScale } = useWindowDimensions();
  const ink = useDrawnColour('bronzeInk');
  const drawn = Math.round(size * Math.min(Math.max(fontScale, 1), maxScale));
  // One point of line in the 24-unit drawing.
  const line = 24 / drawn;
  return (
    <Svg
      width={drawn}
      height={drawn}
      viewBox="0 0 24 24"
      accessible={false}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      testID={testID}
    >
      <Rect
        x={line / 2}
        y={line / 2}
        width={24 - line}
        height={24 - line}
        rx={4}
        fill="none"
        stroke={ink}
        strokeWidth={line}
      />
      <Path
        d={STAR}
        fill="none"
        stroke={ink}
        strokeWidth={line}
        strokeLinejoin="round"
      />
    </Svg>
  );
}
