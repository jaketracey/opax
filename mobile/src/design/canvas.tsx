import { Canvas, type CanvasProps } from '@shopify/react-native-skia';
import { StyleSheet, type StyleProp, type ViewStyle } from 'react-native';

/**
 * The widest a Skia surface is allowed to be, in points: Metal's 8192 px
 * texture ceiling at the 3x scale of every current iPhone.
 */
export const MAX_CANVAS_POINTS = 2730;

/**
 * The box a Skia canvas may draw into, or null when there is none yet. Both
 * sides must be finite and positive, and neither may pass `limit` (the
 * parent's measured side, or the device ceiling). Skia creates a Metal
 * texture of the view's size, and an unbounded, NaN or negative size is a
 * texture Metal refuses with an abort, not an error the app can catch.
 */
export function canvasBox(
  width: number,
  height: number,
  limit = MAX_CANVAS_POINTS,
): { width: number; height: number } | null {
  const bound = Number.isFinite(limit) && limit > 0 ? limit : MAX_CANVAS_POINTS;
  if (
    !Number.isFinite(width) ||
    !Number.isFinite(height) ||
    width <= 0 ||
    height <= 0
  )
    return null;
  return {
    width: Math.min(width, bound, MAX_CANVAS_POINTS),
    height: Math.min(height, bound, MAX_CANVAS_POINTS),
  };
}

/**
 * Skia's Canvas, drawn only once it has a box to draw into. `width` and
 * `height` are the measured size the caller wants (points); until both are
 * finite and positive nothing is mounted, so no Skia view ever lays out with
 * an unbounded size. `limit` clamps both sides (a measured parent).
 */
export function SizedCanvas({
  width,
  height,
  limit,
  style,
  children,
  ...rest
}: Omit<CanvasProps, 'style'> & {
  width: number;
  height: number;
  limit?: number;
  style?: StyleProp<ViewStyle>;
}) {
  const box = canvasBox(width, height, limit);
  if (!box) return null;
  return (
    <Canvas {...rest} style={[StyleSheet.flatten(style), box]}>
      {children}
    </Canvas>
  );
}
