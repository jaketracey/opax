import Constants from 'expo-constants';
import { useState } from 'react';
import type { ProbeFrame, ProbeLine, ProbeProps } from './text-probe.types';

/** Native TextKit line bounds, not the element's full accessibility label. */
export function drawnTextClipped(
  lines: readonly ProbeLine[],
  frame: { width: number; height: number },
  content: string,
): boolean {
  const normalize = (text: string) => text.replace(/\s/g, '');
  return (
    !lines.length ||
    normalize(lines.map((line) => line.text).join('')) !== normalize(content) ||
    lines.some(
      (line) =>
        line.x < -0.01 ||
        line.y < -0.01 ||
        line.x + line.width > frame.width + 0.01 ||
        line.y + line.height > frame.height + 0.01,
    )
  );
}

export const nameProbeProps = { testDrawnText: true };

export function useTextProbe(props: ProbeProps, key: string, content: string) {
  const { testDrawnText, ...nativeProps } = props;
  const enabled =
    !!testDrawnText &&
    !!props.testID &&
    Constants.expoConfig?.extra?.variant === 'e2e';
  const [drawing, setDrawing] = useState({ key: '', lines: 0, clipped: true });
  return {
    enabled,
    props: {
      ...nativeProps,
      testID:
        enabled && drawing.key === key
          ? `${props.testID}-drawn-${drawing.clipped ? 'clipped' : 'complete'}-${drawing.lines}`
          : props.testID,
    },
    update(lines: readonly ProbeLine[] | undefined, frame: ProbeFrame) {
      if (!enabled || !lines) return;
      const next = {
        key,
        lines: lines.length,
        clipped: drawnTextClipped(lines, frame, content),
      };
      if (
        drawing.key !== next.key ||
        drawing.lines !== next.lines ||
        drawing.clipped !== next.clipped
      )
        setDrawing(next);
    },
    reset() {
      if (enabled) setDrawing({ key: '', lines: 0, clipped: true });
    },
  };
}
