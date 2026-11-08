import { Platform } from 'react-native';
import { phoneCopy } from './phone-copy';

/** Device noun for copy that already says 'this'. */
export function thisDevice(): string {
  return Platform.OS === 'ios'
    ? Platform.isPad
      ? 'iPad'
      : phoneCopy('iPhone')
    : 'device';
}
