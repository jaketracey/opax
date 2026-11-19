import type { NativeStackNavigationOptions } from 'expo-router';
import {
  NavigationContext,
  NavigationRouteContext,
} from 'expo-router/react-navigation';
import {
  useContext,
  useEffect,
  useRef,
  type ReactElement,
  type ReactNode,
} from 'react';
import { Platform, View } from 'react-native';
import { useVerticalBarEdge } from '../../modules/opax-root-bar';

/**
 * Keeps a page's title at the top while the page scrolls, beside a vertical
 * bar (the closed iPhone Duo).
 *
 * There the tabs and bar items are on the side rail and the title sits alone
 * in a band at the top. From iOS 27 UIKit minimises that band as the page
 * scrolls down and brings it back on the way up
 * (`UINavigationItem.barMinimizeBehavior`, automatic). Every page lost its
 * title on the way down and kept an empty strip in its place (build 91).
 * react-native-screens 4.26 has no option for that setting.
 *
 * UIKit minimises the bar for one scroll view: the first view under the
 * page, then that view's first child, and so on down. So on the rail the
 * page's first child is this empty view, UIKit finds no scroll view to
 * follow, and the band stays: the title holds at the top and the page passes
 * under its soft edge. The scroll view keeps its insets, which come from the
 * safe area, not from that search.
 *
 * Off the rail nothing is added: the large title collapses to the inline
 * one as before, and the tab bar still minimises. A sheet or modal in the
 * stack is left alone on every layout: its scroll view drives its detents.
 */
export function TitlePin({
  presented,
  children,
}: {
  presented: boolean;
  children: ReactNode;
}) {
  const rail = useVerticalBarEdge() !== 'unspecified';
  return (
    <>
      {rail && !presented && Platform.OS === 'ios' ? (
        <View
          key="title-pin"
          testID="title-pin"
          collapsable={false}
          pointerEvents="none"
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
          style={pin}
        />
      ) : null}
      {children}
    </>
  );
}

const pin = { position: 'absolute', width: 0, height: 0 } as const;

/** The tab stacks' `screenLayout`: every page they hold, roots and pushed. */
export function titlePinLayout({
  options,
  children,
}: {
  options: NativeStackNavigationOptions;
  children: ReactElement;
}) {
  return (
    <TitlePin
      presented={!!options.presentation && options.presentation !== 'card'}
    >
      {children}
    </TitlePin>
  );
}

type TabPress = { data?: { isPrevented?: boolean } };
/** The tab screen that holds the stack: its listeners hear its own tab. */
type TabScreenNavigation = {
  getState?: () => { type?: string };
  isFocused?: () => boolean;
  addListener?: (
    name: never,
    listener: (event: TabPress) => void,
  ) => () => void;
};

/**
 * A tab pressed again while its root is in front scrolls that root to the
 * top. react-native-screens does this natively, for the scroll view it finds
 * the way UIKit does, which `TitlePin` hides beside a vertical bar. There a
 * tab root does it itself: `onReselect` runs when the root's own tab is
 * pressed while selected and nothing is pushed over the root (a first press
 * with pages pushed still pops them, as before).
 *
 * Inert off the rail, where the native effect is untouched, and on Android,
 * which has its own listener (`useAndroidRootScroll`).
 */
export function useRailRootReselect(onReselect: () => void, enabled = true) {
  const navigation = useContext(NavigationContext);
  const route = useContext(NavigationRouteContext);
  const rail = useVerticalBarEdge() !== 'unspecified';
  const handler = useRef(onReselect);
  useEffect(() => {
    handler.current = onReselect;
  }, [onReselect]);
  const active = Platform.OS === 'ios' && rail && enabled;
  const key = route?.key;
  useEffect(() => {
    if (!active || !navigation || !key) return;
    // The stack's parent is its own tab's screen: a listener there hears
    // presses on that tab alone. (The tab route's nested `state` cannot name
    // the stack: it is unset until something navigates inside the tab.)
    const tab = navigation.getParent?.() as TabScreenNavigation | undefined;
    if (tab?.getState?.().type !== 'tab') return;
    return tab.addListener?.('tabPress' as never, (event) => {
      if (event.data?.isPrevented) return;
      // Pressed from another tab: a switch, which leaves the page where it is.
      if (!tab.isFocused?.()) return;
      // The root itself, with nothing pushed over it.
      const stack = navigation.getState();
      if (stack.index !== 0 || stack.routes[0]?.key !== key) return;
      requestAnimationFrame(() => handler.current());
    });
  }, [active, navigation, key]);
}
