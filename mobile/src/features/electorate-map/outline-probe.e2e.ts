import { useEffect, useState } from 'react';
import {
  ColorType,
  AlphaType,
  type useCanvasRef,
} from '@shopify/react-native-skia';
import { isE2E } from '../../design/environment';

export function useOutlineProbe(
  ref: ReturnType<typeof useCanvasRef>,
  path: string,
) {
  const [pixels, setPixels] = useState(0);
  useEffect(() => {
    if (!isE2E || !path) return;
    let active = true,
      tries = 0;
    const timer = setInterval(() => {
      // Probe the native canvas's actual raster, not JS geometry or an AX label.
      const image = ref.current?.makeImageSnapshot();
      const bytes = image?.readPixels(0, 0, {
        width: image.width(),
        height: image.height(),
        colorType: ColorType.RGBA_8888,
        alphaType: AlphaType.Unpremul,
      });
      let drawn = 0;
      if (bytes)
        for (let i = 3; i < bytes.length; i += 4)
          if (
            bytes[i]! > 0 &&
            bytes[i - 3]! < 50 &&
            bytes[i - 2]! < 70 &&
            bytes[i - 1]! < 100
          )
            drawn++;
      image?.dispose();
      if (active && drawn > 40) {
        setPixels(drawn);
        clearInterval(timer);
      }
      if (++tries >= 20) clearInterval(timer);
    }, 250);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, [path, ref]);
  return isE2E && pixels > 40
    ? `electorate-outline-drawn-pixels-${pixels}`
    : 'electorate-outline';
}
