import { Platform } from 'react-native';

/** Preserve the released iOS wording, describe Android storage accurately. */
export function phoneCopy(text: string): string {
  return Platform.OS === 'android' ? text.replaceAll('iPhone', 'phone') : text;
}
