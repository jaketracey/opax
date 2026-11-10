import { Group, Picture, Rect } from '@shopify/react-native-skia';
import { useMemo } from 'react';
import { Pressable, StyleSheet } from 'react-native';
import { useDerivedValue, type SharedValue } from 'react-native-reanimated';
import { SizedCanvas } from '../../../design/canvas';
import { paletteFor } from '../../../design/palette';
import { colors, hairline, radii } from '../../../design/tokens';
import type { Bounds, Viewport } from './camera';
import type { Centre } from './layout';
import type { MapModel } from './model';
import { paintOverview } from './scene';
import { recordPicture } from './skia-painter';

export const MINI_WIDTH = 104;
export const MINI_HEIGHT = 72;

/**
 * The overview: every cluster as a soft disc, and the part of the map the
 * reader can see (the viewport inside the chrome's insets) as a frame that
 * follows the camera on the UI thread. A tap moves the view there.
 */
export function MiniMap({
  model,
  centres,
  bounds,
  tx,
  ty,
  k,
  viewport,
  onJump,
}: {
  model: MapModel;
  centres: ReadonlyMap<string, Centre>;
  bounds: Bounds;
  tx: SharedValue<number>;
  ty: SharedValue<number>;
  k: SharedValue<number>;
  viewport: Viewport;
  onJump: (x: number, y: number) => void;
}) {
  const palette = paletteFor('light');
  // The overview's own camera: the layout box fitted into the thumbnail.
  const scale = useMemo(() => {
    const bw = Math.max(1, bounds.maxX - bounds.minX);
    const bh = Math.max(1, bounds.maxY - bounds.minY);
    return Math.min((MINI_WIDTH - 8) / bw, (MINI_HEIGHT - 8) / bh);
  }, [bounds]);
  const offset = useMemo(
    () => ({
      x: MINI_WIDTH / 2 - ((bounds.minX + bounds.maxX) / 2) * scale,
      y: MINI_HEIGHT / 2 - ((bounds.minY + bounds.maxY) / 2) * scale,
    }),
    [bounds, scale],
  );
  const picture = useMemo(
    () =>
      recordPicture(bounds, (p) =>
        paintOverview(
          p,
          model.clusters.flatMap((cluster) => {
            const c = centres.get(cluster.key);
            return c
              ? [{ x: c.x, y: c.y, r: c.r, colour: cluster.colour }]
              : [];
          }),
        ),
      ),
    [model, centres, bounds],
  );
  // The visible viewport in world units, drawn in the overview's units.
  const { insets } = viewport;
  const seenW = Math.max(1, viewport.width - insets.left - insets.right);
  const seenH = Math.max(1, viewport.height - insets.top - insets.bottom);
  const frameX = useDerivedValue(
    () => offset.x + ((insets.left - tx.value) / k.value) * scale,
  );
  const frameY = useDerivedValue(
    () => offset.y + ((insets.top - ty.value) / k.value) * scale,
  );
  const frameW = useDerivedValue(() => (seenW / k.value) * scale);
  const frameH = useDerivedValue(() => (seenH / k.value) * scale);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="Overview of the map"
      accessibilityHint="Tap a place to move the view there"
      onPress={(event) => {
        const { locationX, locationY } = event.nativeEvent;
        onJump((locationX - offset.x) / scale, (locationY - offset.y) / scale);
      }}
      style={({ pressed }) => [
        styles.frame,
        pressed ? { backgroundColor: colors.sunken } : null,
      ]}
      testID="money-map-overview"
    >
      <SizedCanvas
        width={MINI_WIDTH}
        height={MINI_HEIGHT}
        accessible={false}
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
      >
        <Group
          transform={[
            { translateX: offset.x },
            { translateY: offset.y },
            { scale },
          ]}
        >
          <Picture picture={picture} />
        </Group>
        <Rect
          x={frameX}
          y={frameY}
          width={frameW}
          height={frameH}
          color={palette.ink}
          style="stroke"
          strokeWidth={1.5}
        />
      </SizedCanvas>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  frame: {
    width: MINI_WIDTH,
    height: MINI_HEIGHT,
    borderRadius: radii.bar,
    borderCurve: 'continuous',
    borderWidth: hairline,
    borderColor: colors.dividerSubtle,
    backgroundColor: colors.raised,
    overflow: 'hidden',
  },
});
