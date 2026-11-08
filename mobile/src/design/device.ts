import { Platform } from 'react-native';

/** Device noun for copy that already says 'this'. */
export function thisDevice(): 'iPhone' | 'iPad' | 'device' {
  return Platform.OS === 'ios'
    ? Platform.isPad
      ? 'iPad'
      : 'iPhone'
    : 'device';
}
