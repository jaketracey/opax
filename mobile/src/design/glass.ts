import { Platform } from 'react-native';

/**
 * iOS 26 and later: the system glass bar, scroll edge effects and the
 * iPhone's bottom search field. Earlier iOS keeps search in the navigation
 * bar. Kept free of navigation imports so layout code can share it.
 */
export function liquidGlass(
  os: string = Platform.OS,
  version: string | number | undefined = Platform.Version,
): boolean {
  return os === 'ios' && parseInt(String(version), 10) >= 26;
}
