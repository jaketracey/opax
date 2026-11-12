import { requireOptionalNativeModule } from 'expo';
import { Platform } from 'react-native';

type TextMetrics = {
  spToDp(sp: number): number;
  dpToSp(dp: number): number;
};
const metrics =
  Platform.OS === 'android'
    ? requireOptionalNativeModule<TextMetrics>('OpaxTextMetrics')
    : null;

// Older development binaries may lack the bridge. Only pre-14 Android has a
// safe linear fallback. NaN disables fitting on newer binaries until rebuilt,
// rather than trusting a queued event as a reference or assuming linear SP.
export function spToDp(sp: number, fontScale: number): number {
  return (
    metrics?.spToDp(sp) ??
    (Number(Platform.Version) < 34 ? sp * fontScale : NaN)
  );
}
export function dpToSp(dp: number, fontScale: number): number {
  return (
    metrics?.dpToSp(dp) ??
    (Number(Platform.Version) < 34 ? dp / fontScale : NaN)
  );
}
