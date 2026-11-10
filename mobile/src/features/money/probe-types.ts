import type { ReactNode } from 'react';
import type { SharedValue } from 'react-native-reanimated';
import type { useCanvasRef } from '@shopify/react-native-skia';
import type { MoneyGraph } from './data';

export interface MoneyTestHookProps {
  graph: MoneyGraph;
  onYear: (year: number) => void;
  onFocus: (id: string) => void;
}
export type CanvasRef = ReturnType<typeof useCanvasRef>;
/** The stage's testID: the plain one, or the drawn-pixels one in e2e builds. */
export type MoneyMapProbe = (ref: CanvasRef, enabled: boolean) => string;
/** Frame-time sampling of camera-driven frames, drawn as a hidden line in e2e builds. */
export type MoneyMapPerf = (
  tx: SharedValue<number>,
  ty: SharedValue<number>,
  k: SharedValue<number>,
) => ReactNode;
