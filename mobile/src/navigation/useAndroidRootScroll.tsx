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
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from 'react-native';
import { colors, interfaceFonts, rhythm } from '../design/tokens';
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
  ground = colors.paper,
) {
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
    [root, title, name, ground, setOptions],
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
          if (node?.scrollTo) scrollToTop(node, 0, true);
          else node?.scrollToOffset?.({ offset: 0, animated: true });
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
