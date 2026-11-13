import { AlphaType, ColorType } from '@shopify/react-native-skia';
import { useEffect, useState } from 'react';
import { StyleSheet, Text as NativeText } from 'react-native';
import {
  useFrameCallback,
  useSharedValue,
  type SharedValue,
} from 'react-native-reanimated';
import { isE2E } from '../../design/environment';
import { formatDisclosureYear } from '../../design/format';
import { paletteFor } from '../../design/palette';
import { Button, Group } from '../../design/primitives';
import type {
  CanvasRef,
  MoneyMapPerf,
  MoneyMapProbe,
  MoneyTestHookProps,
} from './probe-types';

/** Accessible journey actions exercise the same selection/year callbacks as touch input. */
export function MoneyTestHooks({ graph, onYear, onFocus }: MoneyTestHookProps) {
  if (!isE2E) return null;
  const year = graph.edges.some((e) => e.byYear?.['2024'])
    ? 2024
    : Math.max(
        ...graph.edges.flatMap((e) =>
          e.firstYear === null ? [] : [e.firstYear],
        ),
      );
  const node =
    graph.nodes.find((n) => n.id === 'party:Labor') ??
    graph.nodes.find((n) => n.kind === 'party') ??
    graph.nodes[0];
  return (
    <Group>
      {Number.isFinite(year) ? (
        <Button
          label={`Show ${formatDisclosureYear(year)} only`}
          testID="money-test-year"
          onPress={() => onYear(year)}
        />
      ) : null}
      {node ? (
        <Button
          label={`Focus ${node.label}`}
          testID="money-test-focus"
          onPress={() => onFocus(node.id)}
        />
      ) : null}
    </Group>
  );
}

/**
 * E2E only: counts the drawn pixels of the native raster once the layout
 * has settled and says so in the stage's testID, as journey 23 waits for.
 * Nothing is snapshotted before the canvas has laid out (Metal aborts on a
 * texture of no size).
 */
export const useMoneyMapProbe: MoneyMapProbe = (
  ref: CanvasRef,
  enabled: boolean,
) => {
  const [pixels, setPixels] = useState(0);
  useEffect(() => {
    if (!isE2E || !enabled) return;
    const paper = paletteFor('light').paper;
    const pr = parseInt(paper.slice(1, 3), 16),
      pg = parseInt(paper.slice(3, 5), 16),
      pb = parseInt(paper.slice(5, 7), 16);
    let active = true,
      tries = 0;
    const timer = setInterval(() => {
      const image = ref.current?.makeImageSnapshot();
      const bytes = image?.readPixels(0, 0, {
        width: image.width(),
        height: image.height(),
        colorType: ColorType.RGBA_8888,
        alphaType: AlphaType.Unpremul,
      });
      let drawn = 0;
      if (bytes)
        for (let i = 0; i + 3 < bytes.length; i += 16)
          if (
            bytes[i + 3]! > 0 &&
            (Math.abs(bytes[i]! - pr) > 24 ||
              Math.abs(bytes[i + 1]! - pg) > 24 ||
              Math.abs(bytes[i + 2]! - pb) > 24)
          )
            drawn++;
      image?.dispose();
      if (active && drawn > 40) {
        setPixels(drawn);
        clearInterval(timer);
      }
      if (++tries >= 40) clearInterval(timer);
    }, 250);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, [ref, enabled]);
  return isE2E && pixels > 40
    ? `money-map-drawn-pixels-${pixels}`
    : 'money-map-canvas';
};

/**
 * E2E only: frame intervals of the frames in which the camera moved (a pan,
 * pinch, flick or fly), summarised every second into one hidden line:
 * "money-map-frames-120-p50-8-p95-17-max-21" (milliseconds). Idle frames
 * are not counted, so the numbers are the cost of moving the map.
 */
export const useMoneyMapPerf: MoneyMapPerf = (
  tx: SharedValue<number>,
  ty: SharedValue<number>,
  k: SharedValue<number>,
) => {
  const samples = useSharedValue<number[]>([]);
  const last = useSharedValue({ tx: 0, ty: 0, k: 0 });
  const [line, setLine] = useState('money-map-frames-0');
  const frame = useFrameCallback((info) => {
    const moved =
      last.value.tx !== tx.value ||
      last.value.ty !== ty.value ||
      last.value.k !== k.value;
    last.value = { tx: tx.value, ty: ty.value, k: k.value };
    if (moved && info.timeSincePreviousFrame !== null) {
      const next = samples.value.slice(-600);
      next.push(info.timeSincePreviousFrame);
      samples.value = next;
    }
  }, false);
  useEffect(() => {
    if (!isE2E) return;
    frame.setActive(true);
    const timer = setInterval(() => {
      const sorted = [...samples.value].sort((a, b) => a - b);
      if (!sorted.length) return;
      const at = (q: number) =>
        sorted[Math.min(sorted.length - 1, Math.floor(q * sorted.length))]!;
      setLine(
        `money-map-frames-${sorted.length}-p50-${Math.round(at(0.5))}-p95-${Math.round(at(0.95))}-max-${Math.round(sorted[sorted.length - 1]!)}`,
      );
    }, 1000);
    return () => {
      clearInterval(timer);
      frame.setActive(false);
    };
  }, [frame, samples]);
  if (!isE2E) return null;
  return (
    <NativeText
      testID={line}
      accessible={false}
      importantForAccessibility="no"
      style={styles.perf}
    >
      {line}
    </NativeText>
  );
};

const styles = StyleSheet.create({
  perf: {
    position: 'absolute',
    left: 0,
    bottom: 0,
    opacity: 0.01,
    // a11y-ok(raw-font-size): an invisible e2e probe for the capture
    // harness; .e2e files never reach a release bundle.
    fontSize: 8,
  },
});
