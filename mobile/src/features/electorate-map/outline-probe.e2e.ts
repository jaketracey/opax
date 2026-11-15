import { NavigationContext } from 'expo-router/react-navigation';
import { useContext, useEffect, useState } from 'react';
import { AppState, Dimensions } from 'react-native';
import {
  ColorType,
  AlphaType,
  type useCanvasRef,
} from '@shopify/react-native-skia';
import { isE2E } from '../../design/environment';

/** How often the probe looks (ms). */
const EVERY = 250;
/** Snapshots taken before the probe gives up on a map that never draws. */
const MAX_TRIES = 20;
/** Looks, snapshots or not, before the probe stops altogether (30 s). */
const MAX_LOOKS = 120;

/**
 * Whether a view's frame in the window can be read as pixels: laid out with
 * a real size, and at least partly on screen.
 */
export function readableFrame(
  frame: { x: number; y: number; width: number; height: number },
  window: { width: number; height: number },
): boolean {
  const { x, y, width, height } = frame;
  if (![x, y, width, height].every(Number.isFinite)) return false;
  if (width <= 0 || height <= 0) return false;
  return (
    x < window.width && x + width > 0 && y < window.height && y + height > 0
  );
}

/**
 * E2E only: counts the outline's drawn pixels from the native raster and
 * says so in the testID journey 24 waits for. `enabled` is the page's own
 * drawing, on screen. A snapshot of a Skia view that UIKit has never laid
 * out (a thumb on a tab NativeTabs mounted behind the current one) reads a
 * -1 by -1 surface from the missing Metal context, and Metal aborts the app
 * on the texture it is asked for; so a view that is not enabled is never
 * snapshotted.
 *
 * The page's own map can be unreadable too, and the probe kept trying for
 * five seconds whatever had happened to it: a member's profile pushed over
 * the electorate page takes that page's views off screen with the probe
 * still running, and the app aborted there (build 82, Duo, iOS 27.2). So
 * each look first asks whether the view can be read: its route is the one
 * in front, the app is active, and the view is laid out with a real size
 * and is on screen. Only then is it snapshotted. The probe stops for good
 * once it has its count.
 *
 * Coming back to the page (a pop) the route is focused before UIKit has
 * the view back in the window, so focus alone is a frame early. After a
 * focus change the probe waits for the stack's `transitionEnd` as well.
 */
export function useOutlineProbe(
  ref: ReturnType<typeof useCanvasRef>,
  path: string,
  enabled = true,
) {
  const [pixels, setPixels] = useState(0);
  const navigation = useContext(NavigationContext);
  useEffect(() => {
    if (!isE2E || !path || !enabled) return;
    let active = true,
      tries = 0,
      looks = 0;
    // Settled: no transition is carrying the page on or off screen. A page
    // that mounts in front is taken as settled, as before; after it loses
    // or regains focus only the end of that transition settles it again.
    let settled = true;
    type Listen = (
      name: string,
      listener: (event?: { data?: { closing?: boolean } }) => void,
    ) => (() => void) | undefined;
    const listen = (
      navigation as { addListener?: Listen } | undefined
    )?.addListener?.bind(navigation);
    const unsettle = () => {
      settled = false;
    };
    const subscriptions = [
      listen?.('focus', unsettle),
      listen?.('blur', unsettle),
      listen?.('transitionEnd', (event) => {
        // The end of this page's own way in, not of its way out.
        if (!event?.data?.closing) settled = true;
      }),
    ];
    const stop = () => {
      active = false;
      clearInterval(timer);
      subscriptions.forEach((remove) => remove?.());
    };
    const snapshot = () => {
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
      if (drawn > 40) {
        setPixels(drawn);
        stop();
      } else if (++tries >= MAX_TRIES) stop();
    };
    const timer = setInterval(() => {
      if (++looks > MAX_LOOKS) return stop();
      const view = ref.current;
      // Another page is in front, or the app is not: nothing to read.
      if (!view || !settled || navigation?.isFocused?.() === false) return;
      if (
        AppState.currentState === 'background' ||
        AppState.currentState === 'inactive'
      )
        return;
      if (typeof view.measureInWindow !== 'function') return;
      view.measureInWindow((x, y, width, height) => {
        if (!active || !settled || navigation?.isFocused?.() === false) return;
        if (readableFrame({ x, y, width, height }, Dimensions.get('window')))
          snapshot();
      });
    }, EVERY);
    return stop;
  }, [path, ref, enabled, navigation]);
  return isE2E && pixels > 40
    ? `electorate-outline-drawn-pixels-${pixels}`
    : 'electorate-outline';
}
