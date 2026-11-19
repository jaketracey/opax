import { animatedScroll } from '../design/accessibility';
import {
  NavigationContext,
  NavigationRouteContext,
} from 'expo-router/react-navigation';
import {
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useRef,
  type RefObject,
} from 'react';
import {
  Platform,
  Text,
  type ColorValue,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from 'react-native';
import { interfaceFonts, rhythm } from '../design/tokens';
import { useColors } from '../design/use-colors';
import { scrollToTop } from '../design/scroll-to-top';
import { useSafeSetOptions } from './preview';

const titles: Record<string, string> = {
  index: 'Today',
  'your-mp': 'Your MP',
  bills: 'Bills',
  search: 'Search',
  ask: 'Ask',
};
/** Root routes whose bar has leading items (Ask's history). */
const leading = new Set(['ask']);
const Untitled = () => null;
type ScrollTarget = {
  scrollTo?: (options: { y: number; animated: boolean }) => void;
  scrollToOffset?: (options: { offset: number; animated: boolean }) => void;
};

/**
 * Android's medium root title lives at the start of the scrolling content.
 * The native toolbar keeps its search field, actions and predictive Back.
 * Wire title before the content and onScroll to its existing scroll callback.
 * iOS renders nothing and installs no options or tab listener.
 */
export function useAndroidRootScroll(
  scroll: RefObject<ScrollTarget | null>,
  groundColour?: ColorValue,
) {
  const colors = useColors();
  const ground = groundColour ?? colors.paper;

  const navigation = useContext(NavigationContext);
  const route = useContext(NavigationRouteContext);
  const setOptions = useSafeSetOptions();
  const state =
    Platform.OS === 'android' ? navigation?.getState?.() : undefined;
  const name = route?.name ?? '';
  const title = titles[name];
  const root =
    Platform.OS === 'android' &&
    !!title &&
    state?.routeNames?.includes('bill/[key]') &&
    state.routes[0]?.key === route?.key;
  const height = useRef(56);
  const offset = useRef(0);
  const applied = useRef('');
  const apply = useCallback(
    (y: number) => {
      if (!root) return;
      offset.current = y;
      const collapsed = y >= height.current;
      const elevated = y > 0;
      const key = `${title}:${String(ground)}:${collapsed}:${elevated}`;
      if (applied.current === key) return;
      applied.current = key;
      setOptions({
        // Ask has leading bar items. With a leading item, the stack draws a
        // string title as its own heading view, so an empty string left an
        // empty heading in the toolbar. A title function that renders
        // nothing adds no node at all.
        headerTitle: collapsed ? title : leading.has(name) ? Untitled : '',
        headerTitleAlign: 'left',
        headerStyle: { backgroundColor: elevated ? colors.navyWash : ground },
        headerShadowVisible: elevated,
      });
    },
    [root, title, name, ground, setOptions, colors],
  );
  useLayoutEffect(() => {
    applied.current = '';
    apply(offset.current);
  }, [apply]);
  useEffect(() => {
    if (!root || !navigation) return;
    const tabs = navigation.getParent();
    if (tabs?.getState().type !== 'tab') return;
    return tabs.addListener(
      'tabPress' as never,
      (event: { target?: string; defaultPrevented?: boolean }) => {
        const tabState = tabs.getState();
        const owner = tabState.routes.find(
          (item) => item.state?.key === navigation.getState().key,
        );
        if (
          !owner ||
          owner.key !== event.target ||
          tabState.routes[tabState.index]?.key !== owner.key
        )
          return;
        requestAnimationFrame(() => {
          if (event.defaultPrevented) return;
          const node = scroll.current;
          if (node?.scrollTo) scrollToTop(node, 0, animatedScroll());
          else
            node?.scrollToOffset?.({ offset: 0, animated: animatedScroll() });
        });
      },
    );
  }, [root, navigation, scroll]);
  const onScroll = useCallback(
    (event: number | NativeSyntheticEvent<NativeScrollEvent>) => {
      apply(
        typeof event === 'number' ? event : event.nativeEvent.contentOffset.y,
      );
    },
    [apply],
  );
  return {
    onScroll,
    /**
     * This hook owns the bar's colour and hairline on an Android tab root:
     * page ground at rest, the raised wash once scrolled. A caller that also
     * writes `headerStyle` (Screen's own bar effect) must leave it alone
     * here. Written after this hook's, on a colour change, it put the page
     * ground back over a scrolled bar until the scroll state next flipped.
     */
    ownsBar: !!root,
    title: root ? (
      <Text
        accessibilityRole="header"
        testID="android-root-title"
        onLayout={(event) => {
          height.current = event.nativeEvent.layout.height;
          apply(offset.current);
        }}
        style={{
          fontFamily: interfaceFonts.sansSemiBold,
          // a11y-ok(raw-font-size): stands in for the native large title on
          // Android root screens (28/36 sp) and follows the system font size.
          fontSize: 28,
          lineHeight: 36,
          color: colors.ink,
          paddingTop: rhythm.tight,
          paddingBottom: rhythm.row,
        }}
      >
        {title}
      </Text>
    ) : null,
  };
}
