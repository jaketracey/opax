import {
  NavigationContext,
  NavigationRouteContext,
} from 'expo-router/react-navigation';
import { useContext } from 'react';
import { Platform } from 'react-native';
import { useVerticalBarEdge } from '../../modules/opax-root-bar';
import { isPad } from '../design/adaptive';
import { useSplitPane } from '../design/split';
import { rhythm, size } from '../design/tokens';
import { glassBar } from './chrome';

/**
 * Space at the foot of a tab page for iOS 26's floating tab bar. Pushed pages
 * (and roots once scrolling minimises the bar) show it as two floating
 * buttons, the current tab ("Today") and Search, which sit over the end of
 * the scroll content. A 44pt button plus a block gap keeps the last card's
 * text above them when the reader reaches the end of the page.
 */
export const floatingBarClearance = size.target + rhythm.block;

/**
 * Every tab uses the shared route inventory. Account and other sheet stacks
 * also have an index route, so being first in a stack is insufficient.
 */
export function isTabStack(
  state: { routeNames?: readonly string[] } | undefined,
): boolean {
  return (
    !!state?.routeNames?.includes('bill/[key]') &&
    state.routeNames.includes('explore/[tool]')
  );
}

/**
 * The bottom clearance a scrolling page in a tab stack needs for the floating
 * Today and Search buttons: iOS 26 and later, on a phone whose tab bar sits
 * at the bottom. Sheets, split panes, iPad (whose bar is at the top) and a
 * vertical Duo bar beside the content need none, nor does Android.
 */
export function useFloatingBarClearance(): number {
  const navigation = useContext(NavigationContext);
  const route = useContext(NavigationRouteContext);
  const inPane = useSplitPane() !== null;
  const edge = useVerticalBarEdge();
  if (Platform.OS !== 'ios' || !glassBar() || isPad || inPane) return 0;
  if (edge !== 'unspecified') return 0;
  const state = route ? navigation?.getState() : undefined;
  return isTabStack(state) ? floatingBarClearance : 0;
}

/**
 * For a page that draws its own FlatList or SectionList: its content's foot
 * padding (`base`, the page's own) plus the floating bar clearance, or null
 * where there are no floating buttons.
 */
export function useFloatingBarFoot(
  base: number = rhythm.section,
): { paddingBottom: number } | null {
  const clearance = useFloatingBarClearance();
  return clearance ? { paddingBottom: base + clearance } : null;
}
