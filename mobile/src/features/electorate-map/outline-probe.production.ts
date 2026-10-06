import type { useCanvasRef } from '@shopify/react-native-skia';

// Production does not snapshot pixels or ship the native journey diagnostic.
export function useOutlineProbe(
  _ref: ReturnType<typeof useCanvasRef>,
  _path: string,
) {
  return 'electorate-outline';
}
