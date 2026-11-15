import {
  NavigationContext,
  NavigationRouteContext,
} from 'expo-router/react-navigation';
import { DescriptorsContext } from 'expo-router/build/fork/native-stack/descriptors-context';
import { use, useContext } from 'react';
import { useRailBar } from './chrome';
import { isTabStack } from './floating-bar';

/**
 * The rail bar of a page pushed in a tab's stack: `clear`, or `solid` with a
 * legibility setting on. Null for a tab root (its own owner sets its bar), a
 * sheet or modal, another stack, and every layout without a vertical bar.
 */
export function usePushedRailBar(): 'clear' | 'solid' | null {
  const rail = useRailBar();
  const route = useContext(NavigationRouteContext);
  const navigation = useContext(NavigationContext);
  if (!rail || !route) return null;
  const state = navigation?.getState();
  if (!isTabStack(state) || state?.routes?.[0]?.key === route.key) return null;
  const presentation = use(DescriptorsContext)[route.key]?.options.presentation;
  return !presentation || presentation === 'card' ? rail : null;
}

/**
 * A pushed page in a tab's stack whose bar is solid beside a vertical bar:
 * with Reduce Transparency or Increase Contrast on, or because the bar
 * holds a search field. That bar needs its own colour behind it
 * (`barBacking`), or the top 14 pt shows what is behind the bar: the
 * system's grey, or the page under a bar of another colour. Not a sheet: a
 * backing view reserved a band in sheets.
 */
export function useSolidRailBacking(): boolean {
  const rail = usePushedRailBar();
  const route = useContext(NavigationRouteContext);
  if (!rail || !route) return false;
  return (
    rail === 'solid' ||
    use(DescriptorsContext)[route.key]?.options.headerTransparent === false
  );
}
