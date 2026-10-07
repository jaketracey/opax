import { useContext } from 'react';
import { HeaderHeightContext } from 'expo-router/react-navigation';
import { SafeAreaInsetsContext } from 'react-native-safe-area-context';

/**
 * Where the native header ends, in window points: status bar, bar and (while
 * expanded) the large title. A screen's scroll view runs under the header, so
 * `scrollTo({ y })` puts content y at the top of the window, behind the bar.
 * Subtract this to land just below it instead.
 */
export function useHeaderBottom(): number {
  const header = useContext(HeaderHeightContext);
  const top = useContext(SafeAreaInsetsContext)?.top ?? 0;
  return header || top + 44;
}
