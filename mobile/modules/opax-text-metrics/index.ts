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

// Older binaries and Expo Go may lack the bridge. Absence means no expected
// scale: fitting uses measured lines, retaining content/frame/identity checks.
export function spToDp(sp: number, _fontScale: number): number | undefined {
  return metrics?.spToDp(sp);
}
export function dpToSp(dp: number, _fontScale: number): number | undefined {
  return metrics?.dpToSp(dp);
}
