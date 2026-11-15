import {
  NavigationContext,
  NavigationRouteContext,
} from 'expo-router/react-navigation';
import { DescriptorsContext } from 'expo-router/build/fork/native-stack/descriptors-context';
import { use, useContext } from 'react';
import { useRailBar } from './chrome';
import { isTabStack } from './floating-bar';

/**
 * A pushed page in a tab's stack beside a vertical bar, with Reduce
 * Transparency or Increase Contrast on: it keeps the solid bar, and that bar
 * needs its own colour behind it (`barBacking`), or the top 14 pt shows what
 * is behind the bar: the system's grey, or the page under a bar of another
 * colour. Not a sheet: a backing view reserved a band in sheets.
 */
export function useSolidRailBacking(): boolean {
  const rail = useRailBar();
  const route = useContext(NavigationRouteContext);
  const navigation = useContext(NavigationContext);
  if (rail !== 'solid' || !route || !isTabStack(navigation?.getState()))
    return false;
  const presentation = use(DescriptorsContext)[route.key]?.options.presentation;
  return !presentation || presentation === 'card';
}
