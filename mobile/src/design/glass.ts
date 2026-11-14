import { Platform } from 'react-native';

/**
 * iOS 26 and later: the system glass bar, scroll edge effects and the
 * iPhone's bottom search field. Earlier iOS keeps search in the navigation
 * bar. Kept free of navigation imports so layout code can share it.
 * Takes the OS and its version as one value, so a version is never read
 * against another platform's name (Android API 26 is not iOS 26).
 */
export function liquidGlass(
  platform: { OS: string; Version?: string | number } = Platform,
): boolean {
  return platform.OS === 'ios' && parseInt(String(platform.Version), 10) >= 26;
}
