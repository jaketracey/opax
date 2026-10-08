import { Platform } from 'react-native';

/**
 * Preserve the released iOS wording, describe Android storage accurately,
 * and name the iPad on an iPad ("saved on this iPad").
 */
export function phoneCopy(text: string): string {
  if (Platform.OS === 'android') return text.replaceAll('iPhone', 'phone');
  if (Platform.OS === 'ios' && Platform.isPad)
    return text.replaceAll('iPhone', 'iPad');
  return text;
}
