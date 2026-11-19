import {
  Platform,
  RefreshControl,
  type RefreshControlProps,
} from 'react-native';
import { useColors } from '../../design/use-colors';

/**
 * The pull to refresh control for the People and Parliament screens.
 *
 * iOS is unchanged: it takes whatever `tintColor` the screen passes. Android
 * ignores `tintColor` and draws a white disc with a black arrow unless told
 * otherwise, which is a bright spot on the dark page, so there the arrow is
 * navy and the disc is the raised step, in the colours on screen.
 *
 * It passes every prop through, so a scroll view can clone it as it does the
 * system control.
 */
export function PullRefresh(props: RefreshControlProps) {
  const colors = useColors();
  return (
    <RefreshControl
      {...(Platform.OS === 'android'
        ? { colors: [colors.navy], progressBackgroundColor: colors.raised }
        : null)}
      {...props}
    />
  );
}
